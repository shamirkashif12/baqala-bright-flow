import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { api, getUsbPrinter, type Order } from "@/lib/api";
import { qzPrintReceipt, qzPrintReceiptUsb } from "@/lib/qz";
import type { ReceiptData } from "@/lib/escpos";
import { downloadBlob } from "@/lib/csv-export";
import { SARIcon, fmtSAR } from "@/lib/currency";

// Mirrors the same check in _app.pos.tsx — the local print agent being unreachable (not
// installed / not running) surfaces as a bare fetch failure, which reads very differently from a
// real printer error (bad name, out of paper) and deserves a more actionable message.
function isPrinterNotSetUp(msg: string): boolean {
  return /failed to fetch|networkerror when attempting to fetch|no printer configured/i.test(msg);
}

// Same Phase-1-style 5-tag TLV QR builder duplicated in _app.pos.tsx / escpos.ts / self-checkout's
// zatca.ts — used as a fallback here too when the order predates (or never got) a real ZATCA
// Phase 2-signed QR.
function buildZatcaTlv(sellerName: string, vatNumber: string, timestamp: string, total: number, vatAmount: number): string {
  const encode = (tag: number, value: string): Uint8Array => {
    const bytes = new TextEncoder().encode(value);
    return new Uint8Array([tag, bytes.length, ...bytes]);
  };
  const fields = [
    encode(1, sellerName),
    encode(2, vatNumber),
    encode(3, timestamp),
    encode(4, total.toFixed(2)),
    encode(5, vatAmount.toFixed(2)),
  ];
  const totalLen = fields.reduce((s, f) => s + f.length, 0);
  const buf = new Uint8Array(totalLen);
  let offset = 0;
  fields.forEach(f => { buf.set(f, offset); offset += f.length; });
  return btoa(String.fromCharCode(...buf));
}

function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return <div className="flex justify-between"><span>{k}</span><span className="tabular-nums">{v}</span></div>;
}

function Amount({ value, negative }: { value: number; negative?: boolean }) {
  return (
    <span className="tabular-nums">
      {negative && "-"}
      <SARIcon className="inline-block h-[0.85em] w-auto align-[-0.05em] -mr-[0.06em]" />
      {fmtSAR(value)}
    </span>
  );
}

/** Read-only "Tax Invoice" view for a past order — same receipt layout (and ZATCA QR) shown right
 * after a POS sale completes, but rehydrated from a historical Order instead of the live cart, so
 * any order list (Sales, ZATCA Invoices, …) can link straight to it instead of only ever being
 * viewable at the moment of checkout. */
export function OrderInvoiceDialog({ orderId, onClose, qrCodeOverride, banner, footerExtra }: {
  orderId: string | null; onClose: () => void;
  // Lets a caller that already has the REAL ZATCA-signed QR (e.g. the ZATCA Invoices page, which
  // has it on the ZatcaInvoice row itself) supply it directly instead of falling back to a
  // locally-rebuilt Phase-1 QR — Order.zatcaQrCode is only ever populated on the createOrder
  // response, never on a later GetById fetch, so without this override a re-opened invoice for an
  // already-accepted, really-signed submission would show a weaker fallback QR instead of the
  // genuine one.
  qrCodeOverride?: string;
  // ZATCA-specific extras (submission status, rejection reason, a Submit button) that only make
  // sense from the ZATCA Invoices page — kept out of this component's own concerns so Sales (which
  // has neither) stays a plain read-only receipt.
  banner?: React.ReactNode;
  footerExtra?: React.ReactNode;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [sellerName, setSellerName] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [crNumber, setCrNumber] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>();
  const [logoEscPos, setLogoEscPos] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    setLoading(true);
    setOrder(null);
    setSellerName(""); setVatNumber(""); setCrNumber("");
    setLogoDataUrl(undefined); setLogoEscPos(undefined);
    api.getOrder(orderId)
      .then(o => {
        setOrder(o);
        // Branch-scoped, not the viewer's own session branch — a historical order can belong to
        // any branch, so this must look up ITS branch's ZATCA registration, not whichever
        // branch the person viewing Sales happens to be locked to.
        api.getZatcaSettings(o.branchId)
          .then(z => { setVatNumber(z.vatRegistrationNumber ?? ""); setSellerName(z.sellerName ?? ""); })
          .catch(() => {});
        api.getCompanyProfile().then(c => {
          setCrNumber(c.crNumber ?? "");
          // o.source: "pos" is the staff-receipt scope; "online"/"kiosk" are the customer-slip scope.
          const scopeOk = o.source === "pos" ? c.showLogoOnStaffReceipt : c.showLogoOnCustomerSlip;
          setLogoDataUrl(scopeOk ? c.logoDataUrl : undefined);
          setLogoEscPos(scopeOk ? c.logoEscPosBase64 : undefined);
        }).catch(() => {});
      })
      .catch(() => { toast.error("Failed to load invoice."); onClose(); })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onClose is stable enough here; re-running on it would refetch on every parent re-render
  }, [orderId]);

  const receipt: ReceiptData | null = order ? {
    orderNumber: order.orderNumber,
    createdAt: order.createdAt,
    sellerName: sellerName || order.branch?.name || "Store",
    branchName: order.branch?.name ?? "—",
    vatNumber: vatNumber || undefined,
    crNumber: crNumber || undefined,
    customerName: order.customer?.fullName,
    paymentMethod: (order.payments?.length ?? 0) <= 1 ? order.payments?.[0]?.paymentMethod : undefined,
    items: (order.items ?? []).map(i => ({ name: (i as any).product?.name ?? "Item", qty: i.quantity, price: i.unitPrice })),
    subtotal: order.subtotal,
    discount: order.discountAmount,
    loyaltyPointsRedeemed: order.loyaltyPointsRedeemed,
    loyaltyDiscountAmount: order.loyaltyDiscountAmount,
    vat: order.taxAmount,
    total: order.totalAmount,
    taxLabel: "VAT 15%",
    tobaccoExcise: order.tobaccoFeeAmount,
    fees: order.serviceCharges?.length ? order.serviceCharges.map(s => ({ name: s.name, amount: s.amount })) : undefined,
    splitBreakdown: (order.payments?.length ?? 0) > 1 ? order.payments!.map(p => ({ method: p.paymentMethod, amount: p.amount })) : undefined,
    zatcaQrCode: order.zatcaQrCode,
    logoEscPos,
  } : null;

  const zatcaQr = receipt && (qrCodeOverride || receipt.zatcaQrCode || (vatNumber
    ? buildZatcaTlv(receipt.sellerName, vatNumber, receipt.createdAt, receipt.total, receipt.vat)
    : null));

  const handlePrint = () => {
    if (!receipt) return;
    const printerName = localStorage.getItem("baqala_receipt_printer") || undefined;
    const mode = localStorage.getItem("baqala_print_mode") ?? "local";
    const usbPrinter = getUsbPrinter();
    setPrinting(true);
    const printId = toast.loading("Printing receipt…");
    const doPrint = mode === "qz"
      ? (usbPrinter
          ? qzPrintReceiptUsb(receipt, usbPrinter).then(() => ({ message: `Receipt sent to ${usbPrinter.label}.` }))
          : qzPrintReceipt(receipt, printerName).then(() => ({ message: `Receipt sent to ${printerName ?? "printer"}.` })))
      : api.printReceipt({ ...receipt, printerName });
    doPrint
      .then((res) => toast.success(res.message, { id: printId }))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Print failed";
        toast.error(isPrinterNotSetUp(msg) ? "Receipt printer isn't set up. Configure it in Printer Setup." : msg, { id: printId });
      })
      .finally(() => setPrinting(false));
  };

  const handleDownload = () => {
    if (!order) return;
    setDownloading(true);
    api.getOrderInvoicePdf(order.id, qrCodeOverride)
      .then((blob) => downloadBlob(blob, `invoice-${order.orderNumber}.pdf`))
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Failed to download invoice."))
      .finally(() => setDownloading(false));
  };

  return (
    <Dialog open={!!orderId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Tax Invoice</DialogTitle></DialogHeader>
        {banner}
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : receipt ? (
          <div id="order-invoice" className="rounded-xl bg-muted/40 p-5 font-mono text-xs space-y-2">
            <div className="text-center space-y-0.5">
              {logoDataUrl && (
                <img src={logoDataUrl} alt="" className="h-9 max-w-[140px] mx-auto mb-1 object-contain" />
              )}
              <p className="font-bold text-sm">{receipt.sellerName}</p>
              {receipt.vatNumber && <p className="text-muted-foreground">VAT {receipt.vatNumber}</p>}
              {receipt.crNumber && <p className="text-muted-foreground">CR {receipt.crNumber}</p>}
              <p className="text-muted-foreground text-[10px] tracking-widest uppercase mt-1">Invoice No.</p>
              <p className="font-bold">{receipt.orderNumber}</p>
              <p className="text-muted-foreground">{new Date(receipt.createdAt).toLocaleString("en-SA")}</p>
              {receipt.customerName && <p>Customer: {receipt.customerName}</p>}
            </div>
            <div className="border-t border-dashed border-border pt-2 space-y-0.5">
              {receipt.items.map((i, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>{i.qty} × {i.name}</span>
                  <Amount value={i.qty * i.price} />
                </div>
              ))}
            </div>
            <div className="border-t border-dashed border-border pt-2 space-y-0.5">
              {/* Net of all non-loyalty discounts, matching the same "Subtotal" formula the
                  post-checkout invoice dialog uses (_app.pos.tsx) — loyalty is broken out below. */}
              <Row k="Subtotal" v={<Amount value={receipt.subtotal - (receipt.discount - (receipt.loyaltyDiscountAmount ?? 0))} />} />
              {!!receipt.loyaltyPointsRedeemed && (
                <Row k={`Loyalty Redeemed (${receipt.loyaltyPointsRedeemed} pts)`} v={<Amount value={receipt.loyaltyDiscountAmount ?? 0} negative />} />
              )}
              {!!receipt.tobaccoExcise && <Row k="Tobacco Excise" v={<Amount value={receipt.tobaccoExcise} />} />}
              {receipt.fees?.map(f => <Row key={f.name} k={f.name} v={<Amount value={f.amount} />} />)}
              <Row k={receipt.taxLabel} v={<Amount value={receipt.vat} />} />
              <div className="flex justify-between font-bold text-sm pt-1">
                <span>Total</span>
                <Amount value={receipt.total} />
              </div>
              {receipt.splitBreakdown ? (
                <>
                  <div className="flex justify-between text-muted-foreground"><span>Payment</span><span>Split</span></div>
                  {receipt.splitBreakdown.map(p => (
                    <div key={p.method} className="flex justify-between pl-2 text-muted-foreground">
                      <span className="capitalize">↳ {p.method}</span>
                      <Amount value={p.amount} />
                    </div>
                  ))}
                </>
              ) : receipt.paymentMethod && (
                <div className="flex justify-between text-muted-foreground"><span>Payment</span><span className="capitalize">{receipt.paymentMethod}</span></div>
              )}
            </div>
            <div className="text-center pt-2">
              {zatcaQr ? (
                <div className="inline-flex flex-col items-center gap-1">
                  <QRCodeSVG value={zatcaQr} size={96} level="M" />
                  <p className="text-[10px] text-muted-foreground">ZATCA — scan to verify</p>
                </div>
              ) : (
                <p className="text-muted-foreground py-2">QR unavailable — branch has no ZATCA VAT registration on file.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">Invoice not found.</p>
        )}
        <DialogFooter>
          {footerExtra}
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button variant="outline" className="gap-1.5" disabled={!receipt || downloading} onClick={handleDownload}>
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download
          </Button>
          <Button
            className="gradient-primary text-primary-foreground border-0"
            disabled={!receipt || printing}
            onClick={handlePrint}
          >
            {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />} Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
