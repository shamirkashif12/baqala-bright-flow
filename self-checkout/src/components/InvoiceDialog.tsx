import { Printer } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { buildZatcaTlv } from "../lib/zatca";
import { printReceipt, getPrintMode, getReceiptPrinter } from "../lib/api";
import { qzPrintReceipt } from "../lib/qz";
import type { CartLine } from "../lib/cart";

export interface InvoiceSnapshot {
  orderNumber: string;
  createdAt: string;
  items: CartLine[];
  subtotal: number;
  discount: number;
  tobaccoExcise: number;
  vat: number;
  total: number;
  taxLabel: string;
  branchName: string;
  vatNumber: string;
  sellerName: string;
  zatcaQrCode?: string;
}

export function getZatcaQr(invoice: InvoiceSnapshot): string {
  return invoice.zatcaQrCode ?? buildZatcaTlv(invoice.sellerName, invoice.vatNumber, invoice.createdAt, invoice.total, invoice.vat);
}

export function printInvoice(invoice: InvoiceSnapshot, zatcaQr: string, onPrinted?: () => void) {
  const printId = toast.loading("Printing receipt…");
  const receipt = {
    orderNumber: invoice.orderNumber,
    createdAt: invoice.createdAt,
    sellerName: invoice.sellerName,
    branchName: invoice.branchName,
    vatNumber: invoice.vatNumber,
    paymentMethod: "card",
    items: invoice.items.map((l) => ({ name: l.product.name, qty: l.quantity, price: l.product.basePrice })),
    subtotal: invoice.subtotal - invoice.discount,
    discount: invoice.discount,
    tobaccoExcise: invoice.tobaccoExcise > 0 ? invoice.tobaccoExcise : undefined,
    vat: invoice.vat,
    total: invoice.total,
    taxLabel: invoice.taxLabel,
    zatcaQrCode: zatcaQr,
  };

  // QZ Tray prints client-side from raw ESC/POS bytes built in the browser; the local agent
  // instead ships this same structured data to the terminal's own API, which builds the bytes
  // and prints server-side — see Printer Setup for which mode this terminal is configured for.
  const printerName = getReceiptPrinter() ?? undefined;
  const doPrint = getPrintMode() === "qz"
    ? qzPrintReceipt(receipt, printerName).then(() => ({ message: `Receipt sent to ${printerName ?? "printer"}.` }))
    : printReceipt({ ...receipt, printerName });

  doPrint
    .then((res) => {
      toast.success(res.message, { id: printId });
      onPrinted?.();
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : "Print failed";
      toast.error(`Print failed: ${msg}`, { id: printId, duration: 6000 });
    });
}

export function InvoiceDialog({
  open,
  onOpenChange,
  invoice,
  onNewOrder,
  onPrinted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice: InvoiceSnapshot | null;
  onNewOrder: () => void;
  onPrinted?: () => void;
}) {
  const zatcaQr = invoice ? getZatcaQr(invoice) : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tax Invoice</DialogTitle>
        </DialogHeader>

        {invoice && (
          <div id="self-checkout-invoice" className="rounded-xl bg-muted/40 p-5 font-mono text-xs space-y-2">
            <div className="text-center space-y-0.5">
              <p className="font-bold text-sm">{invoice.sellerName}</p>
              <p className="text-muted-foreground">VAT {invoice.vatNumber}</p>
              <p className="text-muted-foreground text-[10px] tracking-widest uppercase mt-1">Invoice No.</p>
              <p className="font-bold">{invoice.orderNumber}</p>
              <p className="text-muted-foreground">{new Date(invoice.createdAt).toLocaleString("en-SA")}</p>
            </div>
            <div className="border-t border-dashed border-border pt-2 space-y-0.5">
              {invoice.items.map((l) => (
                <div key={l.product.id} className="flex justify-between">
                  <span>{l.quantity} × {l.product.name}</span>
                  <span className="tabular-nums">{(l.quantity * l.product.basePrice).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-dashed border-border pt-2 space-y-0.5">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="tabular-nums">{(invoice.subtotal - invoice.discount).toFixed(2)}</span>
              </div>
              {invoice.discount > 0 && (
                <div className="flex justify-between">
                  <span>Discount</span>
                  <span className="tabular-nums">-{invoice.discount.toFixed(2)}</span>
                </div>
              )}
              {invoice.tobaccoExcise > 0 && (
                <div className="flex justify-between">
                  <span>Tobacco Excise</span>
                  <span className="tabular-nums">+{invoice.tobaccoExcise.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>{invoice.taxLabel}</span>
                <span className="tabular-nums">{invoice.vat.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-sm pt-1">
                <span>Total</span>
                <span className="tabular-nums">SAR {invoice.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Payment</span>
                <span>Card</span>
              </div>
            </div>
            <div className="text-center pt-2">
              <div className="inline-flex flex-col items-center gap-1">
                <QRCodeSVG value={zatcaQr} size={96} level="M" />
                <p className="text-[10px] text-muted-foreground">ZATCA Phase 2 — scan to verify</p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" disabled={!invoice} onClick={() => invoice && printInvoice(invoice, zatcaQr, onPrinted)}>
            <Printer className="h-4 w-4 mr-1" />
            Print
          </Button>
          <Button className="gradient-primary text-primary-foreground border-0" onClick={onNewOrder}>
            Start New Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
