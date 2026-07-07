import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useRef, useEffect, type ReactNode } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Search, ScanBarcode, Pause, RotateCcw, Printer,
  Plus, Minus, Trash2, CreditCard, Banknote, Split,
  Info, CheckCircle2, Loader2, ShoppingCart, Tag, User, X, Package, QrCode,
  Building2, PrinterCheck, Usb, Wifi, RefreshCw, AlertCircle, Trash,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { api, getPrinterBase, PRINTER_API_KEY, DEFAULT_PRINTER_AGENT, type Product, type Coupon, type Customer, type CashierShift, type Order, type Offer, type Discount, type TaxFeeRule, type DetectedPrinter } from "@/lib/api";
import { qzConnect, qzIsConnected, qzListPrinters, qzPrintReceipt } from "@/lib/qz";
import { useBranch } from "@/lib/branch-context";
import { useAuth } from "@/lib/auth";
import { SARIcon } from "@/lib/currency";

// ─── ZATCA Phase 2 TLV QR encoder ────────────────────────────────────────────
// Encodes seller name, VAT number, timestamp, total, VAT amount per ZATCA spec.
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
  const total_len = fields.reduce((s, f) => s + f.length, 0);
  const buf = new Uint8Array(total_len);
  let offset = 0;
  fields.forEach(f => { buf.set(f, offset); offset += f.length; });
  return btoa(String.fromCharCode(...buf));
}



// ─── Build standalone receipt HTML (no Tailwind — safe for headless Chrome) ──
function buildReceiptHtml(inv: {
  orderNumber: string; createdAt: string; branchName: string;
  vatNumber: string; sellerName: string; customerName?: string;
  items: { name: string; qty: number; price: number }[];
  subtotal: number; discount: number; vat: number; total: number;
  taxLabel: string; paymentMethod?: string;
  splitBreakdown?: { method: string; amount: number }[];
  tobaccoExcise?: number;
  fees?: { name: string; amount: number }[];
}, qrSvg: string): string {
  const fmt = (n: number) => n.toFixed(2);
  const date = new Date(inv.createdAt).toLocaleString("en-SA", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const row = (l: string, r: string, bold = false) =>
    `<div style="display:flex;justify-content:space-between;margin:2px 0;${bold ? "font-weight:bold;font-size:13px;" : ""}"><span>${l}</span><span>${r}</span></div>`;
  const divider = () => `<div style="border-top:1px dashed #000;margin:6px 0"></div>`;
  const center = (s: string, extra = "") =>
    `<div style="text-align:center;${extra}">${s}</div>`;

  const items = inv.items.map(i =>
    row(`${i.qty} × ${i.name}`, `SAR ${fmt(i.qty * i.price)}`)
  ).join("");

  const payments = inv.splitBreakdown?.length
    ? inv.splitBreakdown.map(p => row(p.method.charAt(0).toUpperCase() + p.method.slice(1), `SAR ${fmt(p.amount)}`)).join("")
    : row("Payment", inv.paymentMethod ?? "Cash");

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  @page { margin:2mm; size:80mm auto; }
  body { font-family:'Courier New',monospace; font-size:11px; color:#000;
         background:#fff; margin:0; padding:6px 8px; width:74mm; }
  svg { display:block; margin:8px auto; width:90px; height:90px; }
</style></head><body>
${center(`<strong style="font-size:13px">${inv.sellerName || inv.branchName}</strong>`)}
${inv.vatNumber ? center(`VAT ${inv.vatNumber}`) : ""}
${center("Tax Invoice", "margin-bottom:4px")}
${divider()}
<div>Invoice No.</div>
<div style="font-weight:bold">${inv.orderNumber}</div>
<div>${date}</div>
${inv.customerName ? `<div>Customer: ${inv.customerName}</div>` : ""}
${divider()}
${items}
${divider()}
${row("Subtotal", `SAR ${fmt(inv.subtotal)}`)}
${inv.discount > 0 ? row("Discount", `-SAR ${fmt(inv.discount)}`) : ""}
${inv.tobaccoExcise ? row("Tobacco Excise", `SAR ${fmt(inv.tobaccoExcise)}`) : ""}
${(inv.fees ?? []).map(f => row(f.name, `SAR ${fmt(f.amount)}`)).join("")}
${inv.vat > 0 ? row(inv.taxLabel || "VAT 15%", `SAR ${fmt(inv.vat)}`) : ""}
${divider()}
${row("TOTAL", `SAR ${fmt(inv.total)}`, true)}
${payments}
${divider()}
${qrSvg ? `${qrSvg}${center("ZATCA Phase 2 — scan to verify", "font-size:9px;margin-top:4px")}` : ""}
${center("Thank you!", "margin-top:8px")}
</body></html>`;
}

export const Route = createFileRoute("/_app/pos")({ component: POS });

type CartItem = { name: string; sku: string; productId: string; qty: number; price: number; stock: number };

type InvoiceSnapshot = {
  orderNumber: string;
  createdAt: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  taxLabel: string;
  branchName: string;
  vatNumber: string;
  sellerName: string;
  customerName?: string;
  paymentMethod?: string;
  splitBreakdown?: Array<{ method: string; amount: number }>;
  tobaccoExcise?: number;
  fees?: Array<{ name: string; amount: number }>;
  // Real ZATCA-signed QR (base64 TLV) returned by checkout when Phase 2 is onboarded for the
  // branch. Falls back to a locally-built Phase-1-style QR when absent.
  zatcaQrCode?: string;
};

// ─── Quick Stock In Dialog ────────────────────────────────────────────────────
function QuickStockInDialog({ open, onClose, products, stockMap, branchId, onStockAdded }: {
  open: boolean; onClose: () => void;
  products: Product[]; stockMap: Map<string, number>;
  branchId: string;
  onStockAdded: (product: Product, newStock: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQuery(""); setSelected(null); setQty(1); setError(""); setTimeout(() => inputRef.current?.focus(), 80); }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || selected) return [];
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.toLowerCase().includes(q))
    ).slice(0, 6);
  }, [query, selected, products]);

  const currentStock = selected ? (stockMap.get(selected.id) ?? 0) : 0;

  // Hardware barcode scanners emit the code + Enter — match by barcode only here,
  // never by name/SKU, so a scan can't accidentally land on the wrong product.
  // Typed searches (no Enter) still loosely match name/SKU/barcode via `results` above.
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const trimmed = query.trim();
    if (!trimmed) return;
    const byBarcode = products.find(p => p.barcode === trimmed);
    if (byBarcode) {
      setSelected(byBarcode);
      setQuery(byBarcode.name);
    }
  };

  const handleConfirm = async () => {
    if (!selected) return;
    setError("");
    setSaving(true);
    try {
      if (currentStock > 0) {
        // Genuine restock: physically receive the extra stock before adding to cart.
        try {
          await api.adjustInventory({ productId: selected.id, branchId, quantity: qty, adjustmentType: "receive", reason: "Quick stock-in from POS" });
        } catch {
          await api.receiveBatch({ productId: selected.id, branchId, quantity: qty, remainingQuantity: qty, receivedDate: new Date().toISOString(), status: "active" });
        }
        onStockAdded(selected, currentStock + qty);
      } else {
        // Never stocked at this branch — sell it directly instead of pre-receiving
        // exactly what's about to be sold (which would just cancel back to zero).
        // The sale itself records the shortfall as negative on-hand stock, visible
        // for reconciliation the next time this product is actually received.
        onStockAdded(selected, 0);
      }
    } catch (e: any) {
      setError(e.message ?? "Failed to add stock.");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !saving) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4 text-primary" /> Quick Stock In
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {!selected ? (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search product name, SKU or barcode…" className="pl-9 h-9" />
              {results.length > 0 && (
                <div className="absolute z-10 top-full mt-1 w-full bg-background border rounded-lg shadow-lg overflow-hidden">
                  {results.map(p => (
                    <button key={p.id} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted text-sm text-left gap-3"
                      onMouseDown={e => { e.preventDefault(); setSelected(p); setQuery(p.name); }}>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.sku} · SAR {p.basePrice.toFixed(2)}</p>
                      </div>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded shrink-0 font-medium ${(stockMap.get(p.id) ?? 0) > 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                        Stock: {stockMap.get(p.id) ?? 0}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {query.trim().length > 0 && results.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2 px-1">
                  No product found — create it in <span className="font-medium">Inventory → Products</span> first.
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selected.name}</p>
                <p className="text-xs text-muted-foreground">
                  {selected.sku} · Current stock:{" "}
                  <span className={currentStock === 0 ? "text-amber-600 font-semibold" : "text-green-600 font-semibold"}>{currentStock} units</span>
                </p>
              </div>
              <button className="text-muted-foreground hover:text-foreground shrink-0" onClick={() => { setSelected(null); setQuery(""); }}>
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {selected && currentStock > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Quantity to Add</p>
              <div className="flex items-center gap-3">
                <button className="h-9 w-9 rounded-lg border flex items-center justify-center hover:bg-muted disabled:opacity-30"
                  disabled={qty <= 1} onClick={() => setQty(q => Math.max(1, q - 1))}>
                  <Minus className="h-4 w-4" />
                </button>
                <Input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="h-9 text-center w-20 tabular-nums font-semibold text-base" />
                <button className="h-9 w-9 rounded-lg border flex items-center justify-center hover:bg-muted"
                  onClick={() => setQty(q => q + 1)}>
                  <Plus className="h-4 w-4" />
                </button>
                <p className="text-xs text-muted-foreground">
                  New stock: <span className="font-semibold text-foreground">{currentStock + qty}</span>
                </p>
              </div>
            </div>
          )}

          {selected && currentStock <= 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/20 px-3 py-2.5">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                This item has no stock on record at this branch. Selling it now will record on-hand
                stock as <span className="font-semibold">-1</span> until it's actually received —
                no stock will be added here.
              </p>
            </div>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded px-3 py-2">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="gradient-primary text-primary-foreground border-0 gap-1.5"
            onClick={handleConfirm} disabled={!selected || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
            {currentStock > 0 ? "Add to Stock & Cart" : "Sell Anyway & Add to Cart"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Printer Setup Dialog ────────────────────────────────────────────────────

function PrinterSetupDialog() {
  const [open, setOpen] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectedPrinter[]>([]);
  const [installed, setInstalled] = useState<string[]>([]);
  const [installedUris, setInstalledUris] = useState<Record<string, string>>({});
  const [defaultPrinter, setDefaultPrinter] = useState<string | null>(null);
  const [editNames, setEditNames] = useState<Record<string, string>>({});
  const [selectedPrinter, setSelectedPrinterState] = useState<string>(
    () => localStorage.getItem("baqala_receipt_printer") ?? ""
  );
  const [printJobs, setPrintJobs] = useState<string[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [clearingJobs, setClearingJobs] = useState(false);
  const [agentUrl, setAgentUrl] = useState<string>(() => getPrinterBase());
  const [agentUrlInput, setAgentUrlInput] = useState<string>(() => getPrinterBase());
  const [testingAgent, setTestingAgent] = useState(false);
  const [agentOk, setAgentOk] = useState<boolean | null>(null);
  // QZ Tray
  const [qzConnected, setQzConnected] = useState(false);
  const [qzPrinters, setQzPrinters] = useState<string[]>([]);
  const [connectingQz, setConnectingQz] = useState(false);
  const [printMode, setPrintMode] = useState<"qz" | "local">(
    () => (localStorage.getItem("baqala_print_mode") as "qz" | "local") ?? "local"
  );

  function savePrintMode(m: "qz" | "local") {
    setPrintMode(m);
    localStorage.setItem("baqala_print_mode", m);
  }

  async function handleQzConnect() {
    setConnectingQz(true);
    try {
      await qzConnect();
      setQzConnected(true);
      const printers = await qzListPrinters();
      setQzPrinters(printers);
      toast.success(`QZ Tray connected — ${printers.length} printer(s) found`);
    } catch {
      setQzConnected(false);
      toast.error("Cannot connect to QZ Tray — is it installed and running?");
    } finally { setConnectingQz(false); }
  }

  function saveAgentUrl(url: string) {
    const clean = url.trim().replace(/\/$/, "");
    localStorage.setItem(PRINTER_API_KEY, clean);
    setAgentUrl(clean);
    setAgentUrlInput(clean);
    setAgentOk(null);
  }

  async function testAgentConnection(url: string) {
    setTestingAgent(true); setAgentOk(null);
    try {
      const res = await fetch(`${url.trim().replace(/\/$/, "")}/api/printer/status`, { signal: AbortSignal.timeout(4000) });
      setAgentOk(res.ok);
      if (res.ok) toast.success("Local print agent reachable!");
      else toast.error("Agent responded but returned an error.");
    } catch { setAgentOk(false); toast.error("Cannot reach print agent — is it running?"); }
    finally { setTestingAgent(false); }
  }

  function setSelectedPrinter(name: string) {
    setSelectedPrinterState(name);
    localStorage.setItem("baqala_receipt_printer", name);
  }

  async function loadPrintJobs() {
    setLoadingJobs(true);
    try {
      const res = await api.getPrintJobs();
      setPrintJobs(res.jobs);
    } catch { setPrintJobs([]); }
    finally { setLoadingJobs(false); }
  }

  async function handleClearQueue() {
    setClearingJobs(true);
    try {
      const res = await api.cancelAllJobs();
      toast.success(res.message);
      setPrintJobs([]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to clear queue");
    } finally { setClearingJobs(false); }
  }

  async function loadStatus() {
    const s = await api.getPrinterStatus().catch(() => null);
    if (s) { setInstalled(s.installed); setDefaultPrinter(s.defaultPrinter); setInstalledUris(s.installedUris ?? {}); }
  }

  async function handleDetect() {
    setDetecting(true);
    try {
      const res = await api.detectPrinters();
      setDetected(res.printers);
      if (res.printers.length === 0) toast.info("No printers detected — make sure the USB cable is connected.");
      else toast.success(`${res.printers.length} printer(s) detected`);
    } catch { toast.error("Detection failed — is the API running?"); }
    finally { setDetecting(false); }
  }

  async function handleActivate(p: DetectedPrinter) {
    const name = editNames[p.uri] ?? p.suggestedName;
    setActivating(p.uri);
    try {
      const res = await api.activatePrinter({ uri: p.uri, name });
      toast.success(res.message);
      if (res.kioskReady) toast.info("Chrome kiosk shortcut created on Desktop — use it for silent printing.");
      await loadStatus();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to activate printer";
      toast.error(msg);
    } finally { setActivating(null); }
  }

  async function handleRemove(name: string) {
    setRemoving(name);
    try {
      const res = await api.removePrinter(name);
      toast.success(res.message);
      await loadStatus();
    } catch { toast.error("Failed to remove printer"); }
    finally { setRemoving(null); }
  }

  function handleOpen() {
    setOpen(true);
    loadPrintJobs();
    const isQz = qzIsConnected();
    setQzConnected(isQz);
    if (isQz) qzListPrinters().then(setQzPrinters).catch(() => {});
    if (printMode === "local") { loadStatus(); handleDetect(); }
  }

  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={handleOpen}>
        <Printer className="h-4 w-4" /> Printer Setup
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" /> Receipt Printer Setup
            </DialogTitle>
          </DialogHeader>

          <Tabs value={printMode} onValueChange={v => { savePrintMode(v as "qz" | "local"); if (v === "local") { loadStatus(); handleDetect(); } }}>
            <TabsList className="w-full mb-3">
              <TabsTrigger value="qz" className="flex-1 gap-1.5">
                <Printer className="h-3.5 w-3.5" /> QZ Tray <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded">All Browsers</span>
              </TabsTrigger>
              <TabsTrigger value="local" className="flex-1 gap-1.5">
                <Usb className="h-3.5 w-3.5" /> Local Agent <span className="text-[10px] bg-muted text-muted-foreground px-1 rounded">Linux/LAN</span>
              </TabsTrigger>
            </TabsList>

            {/* ── QZ Tray tab ── */}
            <TabsContent value="qz" className="space-y-3 mt-0">
              {/* Connection status */}
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${qzConnected ? "bg-green-50 border border-green-200 text-green-700" : "bg-muted/50 border text-muted-foreground"}`}>
                {qzConnected
                  ? <><CheckCircle2 className="h-4 w-4 flex-shrink-0" /><span>QZ Tray connected — <strong>{qzPrinters.length}</strong> printer(s) found</span></>
                  : <><AlertCircle className="h-4 w-4 flex-shrink-0" /><span>QZ Tray not connected</span></>}
                <Button size="sm" variant="outline" className="ml-auto h-7 text-xs gap-1" onClick={handleQzConnect} disabled={connectingQz}>
                  {connectingQz ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  {qzConnected ? "Re-scan" : "Connect"}
                </Button>
              </div>

              {/* Install instructions */}
              {!qzConnected && (
                <div className="rounded-lg border border-dashed px-4 py-3 space-y-2.5 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground text-sm">Setup (one-time per machine, run as IT/Admin):</p>

                  {/* ── One-click installer (recommended) ── */}
                  <a
                    href={api.setupInstallerUrl()}
                    download
                    className="flex items-center justify-center gap-2 w-full rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    <Printer className="h-4 w-4" />
                    Download POS Setup Installer
                  </a>
                  <div className="space-y-1">
                    <p><span className="font-medium text-foreground">Windows:</span> Double-click <code className="bg-muted px-1 rounded">MiMony-POS-Setup.bat</code> → Accept UAC prompt</p>
                    <p><span className="font-medium text-foreground">macOS:</span> Double-click <code className="bg-muted px-1 rounded">MiMony-POS-Setup.command</code></p>
                    <p><span className="font-medium text-foreground">Linux:</span> Open Terminal → paste this command:</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <code className="flex-1 bg-muted px-2 py-1 rounded text-[10px] break-all select-all">bash ~/Downloads/MiMony-POS-Setup.sh</code>
                      <button
                        type="button"
                        className="shrink-0 rounded px-2 py-1 bg-muted hover:bg-muted/70 text-xs"
                        onClick={() => navigator.clipboard.writeText("bash ~/Downloads/MiMony-POS-Setup.sh")}
                      >Copy</button>
                    </div>
                  </div>
                  <p>Installs QZ Tray silently + creates a POS shortcut on the Desktop. QZ Tray starts automatically on every boot.</p>
                  <p className="text-amber-600 font-medium">⚠ First run: QZ Tray shows an <strong>Allow unsigned content</strong> prompt — click Allow, then click Connect above.</p>
                </div>
              )}

              {/* Printer list from QZ */}
              {qzConnected && qzPrinters.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Available Printers</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {qzPrinters.map(name => {
                      const isReceipt = selectedPrinter === name;
                      return (
                        <div key={name} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${isReceipt ? "border-green-300 bg-green-50/60" : ""}`}>
                          <PrinterCheck className={`h-4 w-4 flex-shrink-0 ${isReceipt ? "text-green-600" : "text-muted-foreground"}`} />
                          <span className="flex-1 font-medium truncate">{name}</span>
                          {isReceipt
                            ? <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full shrink-0">Receipt Printer</span>
                            : <Button size="sm" variant="outline" className="h-7 text-xs px-2 shrink-0" onClick={() => setSelectedPrinter(name)}>Use for receipts</Button>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {qzConnected && qzPrinters.length === 0 && (
                <p className="text-xs text-muted-foreground px-1">No printers found. Make sure the printer driver is installed on this machine.</p>
              )}
            </TabsContent>

            {/* ── Local Agent tab ── */}
            <TabsContent value="local" className="space-y-3 mt-0">
              {/* Agent URL */}
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Printer Agent URL</p>
                <div className="flex gap-2">
                  <Input className="h-8 text-xs flex-1 font-mono" placeholder={DEFAULT_PRINTER_AGENT}
                    value={agentUrlInput}
                    onChange={e => { setAgentUrlInput(e.target.value); setAgentOk(null); }}
                    onBlur={() => { if (agentUrlInput !== agentUrl) saveAgentUrl(agentUrlInput); }} />
                  <Button size="sm" className="h-8 text-xs gap-1 whitespace-nowrap" variant="outline" disabled={testingAgent}
                    onClick={() => { saveAgentUrl(agentUrlInput); testAgentConnection(agentUrlInput); }}>
                    {testingAgent ? <Loader2 className="h-3 w-3 animate-spin" /> : agentOk === true ? <PrinterCheck className="h-3 w-3 text-green-600" /> : agentOk === false ? <AlertCircle className="h-3 w-3 text-destructive" /> : <Wifi className="h-3 w-3" />}
                    Test
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Start agent: <code className="bg-muted px-1 rounded text-[11px]">dotnet run --urls "http://0.0.0.0:5008"</code></p>
              </div>

              {/* Active receipt printer */}
              <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${selectedPrinter || defaultPrinter ? "bg-green-50 text-green-700" : "bg-muted/50 text-muted-foreground"}`}>
                {selectedPrinter || defaultPrinter
                  ? <><PrinterCheck className="h-4 w-4 flex-shrink-0" /><span>Receipt printer: <strong>{selectedPrinter || defaultPrinter}</strong></span></>
                  : <><AlertCircle className="h-4 w-4 flex-shrink-0" /><span>No printer configured — activate one below</span></>}
              </div>

              {/* Installed printers */}
              {installed.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Installed Printers</p>
                  <div className="space-y-1.5">
                    {installed.map(name => {
                      const isReceipt = (selectedPrinter || defaultPrinter) === name;
                      return (
                        <div key={name} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${isReceipt ? "border-green-300 bg-green-50/60" : ""}`}>
                          <PrinterCheck className={`h-4 w-4 flex-shrink-0 ${isReceipt ? "text-green-600" : "text-muted-foreground"}`} />
                          <span className="flex-1 font-medium">{name}</span>
                          {name === defaultPrinter && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">CUPS Default</span>}
                          {isReceipt
                            ? <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">Receipt Printer</span>
                            : <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => setSelectedPrinter(name)}>Use for receipts</Button>}
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" disabled={removing === name} onClick={() => handleRemove(name)}>
                            {removing === name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Detected devices */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Detected Devices</p>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={handleDetect} disabled={detecting}>
                    <RefreshCw className={`h-3 w-3 ${detecting ? "animate-spin" : ""}`} />
                    {detecting ? "Scanning…" : "Re-scan"}
                  </Button>
                </div>
                {detecting && <div className="flex items-center gap-2 text-sm text-muted-foreground py-3"><Loader2 className="h-4 w-4 animate-spin" /> Detecting connected printers…</div>}
                {!detecting && detected.length === 0 && <div className="rounded-lg border border-dashed px-4 py-4 text-center text-sm text-muted-foreground">No printers detected. Connect the USB cable and click Re-scan.</div>}
                {!detecting && detected.map(p => {
                  const alreadyInstalled = Object.values(installedUris).some(u => u === p.uri);
                  const installedName = alreadyInstalled ? Object.entries(installedUris).find(([, u]) => u === p.uri)?.[0] : null;
                  return (
                    <div key={p.uri} className={`rounded-lg border px-3 py-2.5 mb-2 space-y-2 ${alreadyInstalled ? "border-green-200 bg-green-50/50" : ""}`}>
                      <div className="flex items-center gap-2">
                        {p.type === "usb" ? <Usb className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <Wifi className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                        <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{p.model}</p><p className="text-xs text-muted-foreground font-mono truncate">{p.uri}</p></div>
                        {alreadyInstalled && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1"><PrinterCheck className="h-3 w-3" /> {installedName}</span>}
                      </div>
                      {!alreadyInstalled && (
                        <div className="flex gap-2">
                          <Input className="h-8 text-xs flex-1" placeholder="Printer name" value={editNames[p.uri] ?? p.suggestedName} onChange={e => setEditNames(prev => ({ ...prev, [p.uri]: e.target.value }))} />
                          <Button size="sm" className="h-8 gradient-primary text-primary-foreground border-0 gap-1 whitespace-nowrap" disabled={activating === p.uri} onClick={() => handleActivate(p)}>
                            {activating === p.uri ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Activating…</> : <><PrinterCheck className="h-3.5 w-3.5" /> Activate</>}
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Print queue */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Print Queue</p>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={loadPrintJobs} disabled={loadingJobs}><RefreshCw className={`h-3 w-3 ${loadingJobs ? "animate-spin" : ""}`} />Refresh</Button>
                    {printJobs.length > 0 && <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-destructive hover:text-destructive" onClick={handleClearQueue} disabled={clearingJobs}>{clearingJobs ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash className="h-3 w-3" />}Clear All</Button>}
                  </div>
                </div>
                {printJobs.length === 0
                  ? <p className="text-xs text-muted-foreground px-1">No pending jobs — queue is clear.</p>
                  : <div className="space-y-1 max-h-28 overflow-y-auto">{printJobs.map((job, i) => <div key={i} className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-mono text-amber-800 truncate">{job}</div>)}</div>}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function POS() {
  // ─── Branch from global context ───────────────────────────────────────────────
  const { selectedBranch: branch } = useBranch();
  const { user } = useAuth();

  // ─── Data ─────────────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([]);
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());
  const [expiredProductIds, setExpiredProductIds] = useState<Set<string>>(new Set());
  const [taxRate, setTaxRate] = useState(0.15);
  const [taxLabel, setTaxLabel] = useState("VAT 15%");
  const [vatNumber, setVatNumber] = useState("300123456700003");
  const [sellerName, setSellerName] = useState("");
  const [activeShift, setActiveShift] = useState<CashierShift | null>(null);
  const [loading, setLoading] = useState(true);

  // ─── Cart ─────────────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [flashSku, setFlashSku] = useState<string | null>(null);
  const [scanFlash, setScanFlash] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Refs so the global scanner listener always sees fresh values without re-registering
  const productsRef = useRef<Product[]>([]);
  const stockMapRef = useRef<Map<string, number>>(new Map());
  const expiredProductIdsRef = useRef<Set<string>>(new Set());
  const scanBuf = useRef("");
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeyAt = useRef(0);
  const prevBranchIdRef = useRef<string | null>(null);
  const [branchSwitchBanner, setBranchSwitchBanner] = useState<string | null>(null);

  // ─── Customer ─────────────────────────────────────────────────────────────────
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerNotFound, setCustomerNotFound] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  // ─── Coupon ───────────────────────────────────────────────────────────────────
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);

  // ─── Active Offers & Discounts ────────────────────────────────────────────────
  const [activeOffers, setActiveOffers] = useState<Offer[]>([]);
  const [activeDiscounts, setActiveDiscounts] = useState<Discount[]>([]);
  const [customFees, setCustomFees] = useState<TaxFeeRule[]>([]);
  const [tobaccoFeeEnabled, setTobaccoFeeEnabled] = useState(true);

  // ─── Holds ────────────────────────────────────────────────────────────────────
  const [holds, setHolds] = useState<{ id: string; items: CartItem[]; total: number; at: string }[]>([]);

  // ─── Dialogs ──────────────────────────────────────────────────────────────────
  const [orderOpen, setOrderOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [stockInOpen, setStockInOpen] = useState(false);

  // ─── Invoice snapshot (preserved after cart is cleared) ───────────────────────
  const [invoice, setInvoice] = useState<InvoiceSnapshot | null>(null);
  const autoPrintRef = useRef(false);

  // ─── Load products, tax rules, shifts on mount ────────────────────────────────
  useEffect(() => {
    Promise.all([
      api.getProducts(),
      api.getTaxRules(),
      api.getActiveShifts(),
    ])
      .then(([prods, taxRules, shifts]) => {
        setProducts(prods);

        const vatRule = taxRules.find((r) => r.ruleType === "vat" && r.status === "active");
        if (vatRule) {
          setTaxRate(vatRule.vatPercentage / 100);
          setTaxLabel(`VAT ${vatRule.vatPercentage}%`);
        }

        const tobaccoRule = taxRules.find((r) => r.ruleType === "tobacco_excise");
        setTobaccoFeeEnabled(tobaccoRule ? tobaccoRule.status === "active" : true);

        const shift = shifts.find((s) => s.status === "open" && s.cashierId === user?.id) ?? null;
        setActiveShift(shift);
      })
      .finally(() => {
        setLoading(false);
        searchRef.current?.focus();
      });

    api.getActiveOffers().then(setActiveOffers).catch(() => {});
    api.getDiscounts({ isActive: true }).then(setActiveDiscounts).catch(() => {});
    api.getTaxRules().then(rules =>
      setCustomFees(rules.filter(r => r.ruleType === "custom_fee" && r.status === "active"))
    ).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount-only load; user.id is stable per session

  // ─── Branch change: clear & reload; remount: restore saved cart ──────────────
  useEffect(() => {
    if (!branch) return;

    const isBranchSwitch = prevBranchIdRef.current !== null && prevBranchIdRef.current !== branch.id;
    prevBranchIdRef.current = branch.id;

    if (isBranchSwitch) {
      // Active branch switch — wipe cart and all transient sale state
      setCart([]);
      setAppliedCoupon(null);
      setCouponCode("");
      setCouponError(null);
      setCustomer(null);
      setCustomerPhone("");
      setCustomerNotFound(false);
      setNewCustomerName("");
      setBranchSwitchBanner(branch.name);
      setTimeout(() => setBranchSwitchBanner(null), 3000);
    } else {
      // Initial mount / tab return — restore the saved cart for this branch
      try {
        const saved = sessionStorage.getItem(`pos_cart_${branch.id}`);
        setCart(saved ? (JSON.parse(saved) as CartItem[]) : []);
      } catch { setCart([]); }
    }

    // Always reload stock, active shift, and ZATCA for the (new) branch
    api.getStock({ branchId: branch.id })
      .then((stocks) => {
        const map = new Map<string, number>();
        stocks.forEach((s) => map.set(s.productId, Math.max(0, s.quantity - (s.reservedQuantity ?? 0))));
        setStockMap(map);
      })
      .catch(() => {});

    // Block sale of expired items — mirrors the "Block sale of expired items" rule.
    api.getBatches({ branchId: branch.id, status: "expired" })
      .then((batches) => setExpiredProductIds(new Set(batches.map((b) => b.productId))))
      .catch(() => {});

    // Unscoped by branch — a cashier can only ever hold one open shift at a
    // time (enforced in ShiftsController.OpenShift), so scoping this lookup to
    // the currently-selected branch only breaks it if their branch assignment
    // changed after they checked in, leaving the shift itself pointed at the
    // old branch.
    api.getActiveShifts()
      .then((shifts) => {
        const shift = shifts.find((s) => s.status === "open" && s.cashierId === user?.id) ?? null;
        setActiveShift(shift);
      })
      .catch(() => {});

    api.getZatcaSettings(branch.id)
      .then((z) => {
        if (z.vatRegistrationNumber) setVatNumber(z.vatRegistrationNumber);
        if (z.sellerName) setSellerName(z.sellerName);
      })
      .catch(() => {});
  }, [branch]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Persist cart to session storage (survives tab navigation) ───────────────
  useEffect(() => {
    if (!branch) return;
    sessionStorage.setItem(`pos_cart_${branch.id}`, JSON.stringify(cart));
  }, [cart]); // eslint-disable-line react-hooks/exhaustive-deps


  // Keep refs fresh so the scanner listener never has stale closures
  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => { stockMapRef.current = stockMap; }, [stockMap]);
  useEffect(() => { expiredProductIdsRef.current = expiredProductIds; }, [expiredProductIds]);

  // Global USB barcode scanner listener (works anywhere on the page)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = document.activeElement;
      // Let the search input's own onKey handler manage it
      if (el === searchRef.current) return;
      // Don't intercept when typing in any other text field (coupon, phone, etc.)
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;

      if (e.key === "Enter") {
        const code = scanBuf.current.trim();
        scanBuf.current = "";
        if (scanTimer.current) { clearTimeout(scanTimer.current); scanTimer.current = null; }
        if (!code) return;
        const p =
          productsRef.current.find((x) => x.barcode === code) ??
          productsRef.current.find((x) => x.sku === code);
        if (p) {
          if (!stockMapRef.current.has(p.id)) {
            toast.error(`Product not available in this branch`, {
              description: `"${p.name}" is not stocked at this branch. Switch to the correct branch or add stock here first.`,
              duration: 4000,
            });
            return;
          }
          if (expiredProductIdsRef.current.has(p.id)) {
            toast.error(`Cannot sell expired item`, {
              description: `"${p.name}" has an expired batch and is blocked from sale.`,
              duration: 4000,
            });
            return;
          }
          const stock = stockMapRef.current.get(p.id) ?? 0;
          let blockedByStock = false;
          setCart((c) => {
            const ex = c.find((i) => i.sku === p.sku);
            const nextQty = (ex?.qty ?? 0) + 1;
            if (nextQty > stock) { blockedByStock = true; return c; }
            if (ex) return c.map((i) => (i.sku === p.sku ? { ...i, qty: i.qty + 1 } : i));
            return [...c, { name: p.name, sku: p.sku, productId: p.id, qty: 1, price: p.basePrice, stock }];
          });
          if (blockedByStock) {
            toast.error(stock > 0 ? `Only ${stock} in stock` : `Out of stock`, {
              description: `"${p.name}" has ${stock} unit(s) available at this branch.`,
              duration: 4000,
            });
            return;
          }
          setFlashSku(p.sku);
          setTimeout(() => setFlashSku(null), 600);
          setScanFlash(true);
          setTimeout(() => setScanFlash(false), 800);
        } else {
          toast.error(`Barcode "${code}" not found`, {
            description: "This product is not in inventory. Add it first via Inventory → Add Product.",
            duration: 4000,
          });
        }
        return;
      }

      if (e.key.length !== 1) return; // skip Shift, Ctrl, etc.
      const now = Date.now();
      if (now - lastKeyAt.current > 200) scanBuf.current = ""; // reset on long gap
      lastKeyAt.current = now;
      scanBuf.current += e.key;
      if (scanTimer.current) clearTimeout(scanTimer.current);
      // Auto-clear buffer if Enter never comes (human typed a single char by accident)
      scanTimer.current = setTimeout(() => { scanBuf.current = ""; }, 500);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []); // stable — all mutable state accessed through refs

  // ─── Calculations ─────────────────────────────────────────────────────────────
  const subtotal = cart.reduce((s, i) => s + i.qty * i.price, 0);
  const cartUnitCount = cart.reduce((s, i) => s + i.qty, 0);

  // KSA tobacco excise: min 25 SAR OR 100% of base price, whichever is higher
  function calcTobaccoFee(base: number): number {
    return base <= 25 ? 25 : base;
  }
  const tobaccoExcise = cart.reduce((sum, ci) => {
    const prod = products.find(p => p.id === ci.productId);
    if (!prod?.isTobacco || !tobaccoFeeEnabled) return sum;
    return sum + ci.qty * calcTobaccoFee(ci.price);
  }, 0);
  const couponDiscount = appliedCoupon
    ? appliedCoupon.type === "percentage"
      ? Math.min(subtotal * (appliedCoupon.value / 100), subtotal)
      : Math.min(appliedCoupon.value, subtotal)
    : 0;

  // Parse combo product IDs stored as JSON in itemsDescription
  function parseComboIds(desc?: string | null): string[] {
    if (!desc) return [];
    try { const d = JSON.parse(desc); return Array.isArray(d.products) ? d.products : []; } catch { return []; }
  }

  // Active discounts: "all" applies to everything; "product" applies per matching product in cart
  const discountSavings = activeDiscounts.reduce((sum, d) => {
    const now = new Date();
    if (d.startDate && new Date(d.startDate) > now) return sum;
    if (d.endDate && new Date(d.endDate) < now) return sum;
    // Loyalty/senior-style discounts require an actual eligible customer —
    // never auto-apply to an anonymous walk-in.
    if (d.requiresCustomer && !customer) return sum;
    if (d.minCustomerTier) {
      const tierRank: Record<string, number> = { standard: 0, silver: 1, gold: 2, platinum: 3 };
      const customerRank = customer ? tierRank[customer.tier ?? "standard"] ?? 0 : -1;
      if (customerRank < (tierRank[d.minCustomerTier] ?? 0)) return sum;
    }
    if (d.appliesTo === "all") {
      return sum + (d.discountType === "percentage"
        ? subtotal * (d.value / 100)
        : Math.min(d.value, subtotal));
    }
    if (d.appliesTo === "product" && d.productId) {
      const item = cart.find(i => i.productId === d.productId);
      if (!item) return sum;
      return sum + (d.discountType === "percentage"
        ? item.qty * item.price * (d.value / 100)
        : Math.min(d.value * item.qty, item.qty * item.price));
    }
    return sum;
  }, 0);

  // Triggered offers — split into "discountable" (we can compute SAR savings) vs "notify only"
  const triggeredOffers = activeOffers.filter(o => {
    if (o.offerType === "bogo") {
      // With product: only triggers if that product is in cart
      if (o.triggerProductId) return cart.some(i => i.productId === o.triggerProductId);
      // Without product: blanket BOGO on any purchase
      return cart.length > 0;
    }
    if (o.offerType === "product_offer") {
      return o.triggerProductId ? cart.some(i => i.productId === o.triggerProductId) : false;
    }
    if (o.offerType === "buy_a_get_b") {
      if (!o.triggerProductId) return false;
      const trig = cart.find(i => i.productId === o.triggerProductId);
      return trig !== undefined && trig.qty >= (o.triggerQuantity ?? 1);
    }
    if (o.offerType === "combo") {
      const ids = parseComboIds(o.itemsDescription);
      // Only JSON-format combos (min 2 product IDs) can be verified — plain text = skip
      if (ids.length >= 2) return ids.every(id => cart.some(i => i.productId === id));
      return false;
    }
    if (o.offerType === "lucky_draw") return o.minBasketAmount != null && subtotal >= o.minBasketAmount;
    return false;
  });

  const offerDiscount = triggeredOffers.reduce((sum, o) => {
    const item = o.triggerProductId ? cart.find(i => i.productId === o.triggerProductId) : null;
    if (o.offerType === "bogo") {
      if (item) {
        // Product-specific BOGO
        const sets = Math.floor(item.qty / ((o.triggerQuantity ?? 1) + (o.getQuantity ?? 1)));
        return sum + sets * (o.getQuantity ?? 1) * item.price;
      } else {
        // Blanket BOGO: apply to every item in cart
        return sum + cart.reduce((s, ci) => {
          const sets = Math.floor(ci.qty / ((o.triggerQuantity ?? 1) + (o.getQuantity ?? 1)));
          return s + sets * (o.getQuantity ?? 1) * ci.price;
        }, 0);
      }
    }
    if (o.offerType === "product_offer" && item) {
      if (o.discountPercentage) return sum + item.qty * item.price * (o.discountPercentage / 100);
      if (o.offerPrice != null) return sum + item.qty * Math.max(0, item.price - o.offerPrice);
    }
    if (o.offerType === "buy_a_get_b") {
      const getItem = cart.find(i => i.productId === o.getProductId);
      if (getItem) {
        return sum + (o.getQuantity ?? 1) * Math.max(0, getItem.price - (o.offerPrice ?? 0));
      }
    }
    if (o.offerType === "combo" && o.offerPrice != null) {
      const ids = parseComboIds(o.itemsDescription);
      if (ids.length >= 2) {
        const retailTotal = ids.reduce((s, id) => s + (cart.find(i => i.productId === id)?.price ?? 0), 0);
        return sum + Math.max(0, retailTotal - o.offerPrice);
      }
      // Plain text combo: no automatic SAR discount (operator must apply manually)
    }
    return sum;
  }, 0);

  const totalAutoDiscount = discountSavings + offerDiscount;

  // Product-level discounts set in inventory (discount + discountType fields on Product)
  const productDiscountTotal = cart.reduce((sum, ci) => {
    const prod = products.find(p => p.id === ci.productId);
    if (!prod?.discount || prod.discount <= 0) return sum;
    const saving = prod.discountType === "percentage"
      ? ci.qty * ci.price * (prod.discount / 100)
      : Math.min(prod.discount * ci.qty, ci.qty * ci.price);
    return sum + saving;
  }, 0);

  // Active custom fees that apply to every order
  const allOrderFees = customFees.filter(f =>
    f.applicableTo === "all_products" || f.applicableTo === "all_orders"
  );
  const customFeeTotal = cart.length > 0 ? allOrderFees.reduce((sum, f) => {
    if (f.customFeeAmount > 0) return sum + f.customFeeAmount;
    if (f.excisePercentage > 0) return sum + (subtotal * f.excisePercentage / 100);
    if (f.vatPercentage > 0) return sum + (subtotal * f.vatPercentage / 100);
    return sum;
  }, 0) : 0;

  const taxable = subtotal - couponDiscount - totalAutoDiscount - productDiscountTotal + tobaccoExcise;
  const vatAmount = Math.max(0, taxable) * taxRate;
  const total = Math.max(0, taxable) + vatAmount + customFeeTotal;

  // ─── Cart ops ─────────────────────────────────────────────────────────────────
  const updateQty = (sku: string, d: number) => {
    let blockedByStock = false;
    setCart((c) => c.map((i) => {
      if (i.sku !== sku) return i;
      const next = Math.max(1, i.qty + d);
      if (next > i.stock) { blockedByStock = true; return i; }
      return { ...i, qty: next };
    }));
    if (blockedByStock) {
      const item = cart.find((i) => i.sku === sku);
      toast.error(`Only ${item?.stock ?? 0} in stock`, {
        description: `"${item?.name ?? "This item"}" has no more available stock at this branch.`,
        duration: 4000,
      });
    }
  };

  const remove = (sku: string) => setCart((c) => c.filter((i) => i.sku !== sku));

  const addToCart = (p: Product) => {
    if (expiredProductIds.has(p.id)) {
      toast.error(`Cannot sell expired item`, {
        description: `"${p.name}" has an expired batch and is blocked from sale.`,
        duration: 4000,
      });
      return;
    }
    const stock = stockMap.get(p.id) ?? 0;
    const existing = cart.find((i) => i.sku === p.sku);
    const nextQty = (existing?.qty ?? 0) + 1;
    if (nextQty > stock) {
      toast.error(stock > 0 ? `Only ${stock} in stock` : `Out of stock`, {
        description: `"${p.name}" has ${stock} unit(s) available at this branch.`,
        duration: 4000,
      });
      return;
    }
    setCart((c) => {
      const ex = c.find((i) => i.sku === p.sku);
      if (ex) return c.map((i) => (i.sku === p.sku ? { ...i, qty: i.qty + 1 } : i));
      return [...c, { name: p.name, sku: p.sku, productId: p.id, qty: 1, price: p.basePrice, stock }];
    });
    setFlashSku(p.sku);
    setTimeout(() => setFlashSku(null), 600);
    setQuery("");
    setShowResults(false);
    searchRef.current?.focus();
  };

  // ─── Search / barcode scan ─────────────────────────────────────────────────────
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => {
        if (p.status !== "active") return false;
        if (!stockMap.has(p.id)) return false; // hide products not stocked in current branch
        return (
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q))
        );
      })
      .slice(0, 8);
  }, [query, products, stockMap]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const trimmed = query.trim();
      if (!trimmed) return;
      // Exact barcode match (hardware scanner emits barcode + Enter)
      const byBarcode = products.find((p) => p.barcode === trimmed);
      if (byBarcode) {
        if (!stockMap.has(byBarcode.id)) {
          toast.error(`Product not available in this branch`, {
            description: `"${byBarcode.name}" is not stocked at this branch.`,
            duration: 4000,
          });
          setQuery("");
          return;
        }
        addToCart(byBarcode);
        return;
      }
      const bySku = products.find((p) => p.sku === trimmed);
      if (bySku) {
        if (!stockMap.has(bySku.id)) {
          toast.error(`Product not available in this branch`, {
            description: `"${bySku.name}" is not stocked at this branch.`,
            duration: 4000,
          });
          setQuery("");
          return;
        }
        addToCart(bySku);
        return;
      }
      // Only fall back to first text match if this looks like a typed search,
      // not a scanned barcode (all digits 6+ chars = scanner input, don't guess)
      const looksLikeBarcode = /^\d{6,}$/.test(trimmed);
      if (!looksLikeBarcode && matches[0]) { addToCart(matches[0]); return; }
      if (looksLikeBarcode) {
        toast.error(`Barcode "${trimmed}" not found`, {
          description: "This product is not in inventory. Add it first via Inventory → Add Product.",
          duration: 4000,
        });
        setQuery("");
      }
    }
    if (e.key === "Escape") setShowResults(false);
  };

  // ─── Customer lookup ───────────────────────────────────────────────────────────
  const lookupCustomer = async () => {
    if (!customerPhone.trim()) return;
    setCustomerLoading(true);
    setCustomerNotFound(false);
    try {
      const c = await api.getCustomerByPhone(customerPhone.trim());
      setCustomer(c);
    } catch {
      setCustomer(null);
      setCustomerNotFound(true);
    } finally {
      setCustomerLoading(false);
    }
  };

  // ─── Create new customer from POS ─────────────────────────────────────────────
  const createNewCustomer = async () => {
    if (!newCustomerName.trim() || !customerPhone.trim()) return;
    setCreatingCustomer(true);
    try {
      const c = await api.createCustomer({ fullName: newCustomerName.trim(), phone: customerPhone.trim() });
      setCustomer(c);
      setCustomerNotFound(false);
      setNewCustomerName("");
    } catch {
      // leave not-found state so cashier can retry
    } finally {
      setCreatingCustomer(false);
    }
  };

  // ─── Coupon ────────────────────────────────────────────────────────────────────
  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError(null);
    try {
      const coupon = await api.validateCoupon(couponCode.trim().toUpperCase());
      setAppliedCoupon(coupon);
    } catch {
      setCouponError("Invalid or expired coupon");
      setAppliedCoupon(null);
    } finally {
      setCouponLoading(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError(null);
  };

  // ─── Hold / reopen ─────────────────────────────────────────────────────────────
  const hold = () => {
    if (!cart.length) return;
    setHolds((h) => [
      {
        id: `HOLD-${String(16 + h.length).padStart(3, "0")}`,
        items: cart,
        total,
        at: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      },
      ...h,
    ]);
    resetSale();
  };

  const reopen = (id: string) => {
    const h = holds.find((x) => x.id === id);
    if (!h) return;
    setCart(h.items);
    setHolds((hs) => hs.filter((x) => x.id !== id));

  };

  const resetSale = () => {
    setCart([]);
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError(null);
    setCustomer(null);
    setCustomerPhone("");
    setCustomerNotFound(false);
    setNewCustomerName("");
    setCreatingCustomer(false);
  };

  // ─── Charge handler ────────────────────────────────────────────────────────────
  const handleCharge = async (
    paymentMethod: string,
    splitPayments?: Array<{ method: string; amount: number }>
  ) => {
    if (!branch) throw new Error("No branch configured");
    if (!cart.length) throw new Error("Cart is empty");
    // A shift's cash drawer is a Cashier-only concept — only cashiers need one
    // open to sell. Admins/managers covering a register aren't reconciling a
    // till, so they can ring up a sale without checking in first.
    if (user?.role === "cashier" && !activeShift)
      throw new Error("No active shift found for you at this terminal. Please check in first.");

    const payments = splitPayments
      ? splitPayments
          .filter((p) => p.amount > 0)
          .map((p) => ({ paymentMethod: p.method, amount: p.amount, status: "completed" }))
      : [{ paymentMethod, amount: total, status: "completed" }];

    const order: Order = await api.createOrder({
      source: "pos",
      branchId: branch.id,
      customerId: customer?.id,
      cashierId: activeShift?.cashierId ?? user?.id,
      subtotal,
      discountAmount: couponDiscount + totalAutoDiscount + productDiscountTotal,
      taxAmount: vatAmount + customFeeTotal,
      totalAmount: total,
      paymentStatus: "paid",
      orderStatus: "completed",
      items: cart.map((item) => ({
        productId: item.productId,
        quantity: item.qty,
        unitPrice: item.price,
        totalPrice: item.qty * item.price,
      })),
      payments,
    });

    // Snapshot invoice data before cart is cleared
    const invoiceData: InvoiceSnapshot = {
      orderNumber: order.orderNumber,
      createdAt: order.createdAt ?? new Date().toISOString(),
      items: [...cart],
      subtotal,
      discount: couponDiscount + totalAutoDiscount + productDiscountTotal,
      vat: vatAmount,
      total,
      taxLabel,
      branchName: sellerName || branch.name,
      vatNumber,
      sellerName: sellerName || branch.name,
      customerName: customer?.fullName,
      paymentMethod: splitPayments ? "Split" : paymentMethod,
      splitBreakdown: splitPayments?.filter(p => p.amount > 0),
      tobaccoExcise: tobaccoExcise > 0 ? tobaccoExcise : undefined,
      fees: allOrderFees.length > 0 ? allOrderFees.map(f => ({
        name: f.ruleName,
        amount: f.customFeeAmount > 0 ? f.customFeeAmount
              : f.excisePercentage > 0 ? subtotal * f.excisePercentage / 100
              : subtotal * f.vatPercentage / 100,
      })) : undefined,
      zatcaQrCode: order.zatcaQrCode,
    };
    setInvoice(invoiceData);
  };

  const onPaymentDone = () => {
    autoPrintRef.current = true;
    setPayOpen(false);
    setInvOpen(true);
    resetSale();
  };

  // Auto-print receipt — uses QZ Tray (all browsers) or local agent depending on setting.
  useEffect(() => {
    if (!invOpen || !invoice || !autoPrintRef.current) return;
    autoPrintRef.current = false;

    const printId = toast.loading("Printing receipt…");
    const printerName = localStorage.getItem("baqala_receipt_printer") || undefined;
    const mode = localStorage.getItem("baqala_print_mode") ?? "local";

    const doPrint = mode === "qz"
      ? qzPrintReceipt(invoice, printerName).then(() => ({ message: `Receipt sent to ${printerName ?? "printer"}.` }))
      : api.printReceipt({ ...invoice, printerName });

    doPrint
      .then((res) => toast.success(res.message, { id: printId }))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Print failed";
        toast.error(`Print failed: ${msg}`, { id: printId, duration: 6000 });
      });
  }, [invOpen, invoice]);

  return (
    <PageShell
      title="POS Checkout"
      subtitle={`${branch?.name ?? "Loading…"} · ${activeShift ? `Cashier: ${activeShift.cashier?.fullName ?? "Active shift"}` : "No active shift"}`}
      actions={<PrinterSetupDialog />}
    >
      {/* Two-column split starts at md (tablet) so the order panel + Charge button stay
          reachable without scrolling past the whole cart on tablet-sized POS hardware —
          previously this only kicked in at lg (1024px), leaving tablets stacked. */}
      <div className="grid md:grid-cols-[1fr_320px] lg:grid-cols-[1fr_420px] gap-4 -mt-2">
        {/* ─── Left: scanner + cart ─────────────────────────────────────────── */}
        <div className="space-y-4">
          {/* Search / Barcode */}
          <Card className="p-4 border-border/60 shadow-card">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="h-5 w-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
                  onFocus={() => setShowResults(true)}
                  onBlur={() => setTimeout(() => setShowResults(false), 150)}
                  onKeyDown={onKey}
                  placeholder="Scan barcode or search product name / SKU…"
                  className="pl-10 h-14 text-base bg-background shadow-none border-border/70"
                  autoFocus
                />
              </div>
              <Button
                size="lg"
                className="h-14 gap-2 gradient-primary text-primary-foreground border-0 shadow-glow"
                onClick={() => searchRef.current?.focus()}
              >
                <ScanBarcode className="h-5 w-5" /> Scan
              </Button>
            </div>

            {scanFlash && (
              <div className="mt-2 flex items-center gap-2 text-sm text-green-600 dark:text-green-400 px-1 font-medium animate-pulse">
                <ScanBarcode className="h-4 w-4" /> Item scanned — added to cart
              </div>
            )}
            {branchSwitchBanner && (
              <div className="mt-2 flex items-center gap-2 text-xs text-primary bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 font-medium">
                <Building2 className="h-4 w-4 shrink-0" />
                Switched to <span className="font-bold">{branchSwitchBanner}</span> — stock &amp; shift updated, cart restored
              </div>
            )}

            {loading && (
              <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground px-1">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading products…
              </div>
            )}

            {!loading && showResults && matches.length > 0 && (
              <div className="mt-2 rounded-lg border border-border/70 bg-card overflow-hidden">
                {matches.map((p) => {
                  const stock = stockMap.get(p.id);
                  const outOfStock = stock !== undefined && stock <= 0;
                  const expired = expiredProductIds.has(p.id);
                  const blocked = outOfStock || expired;
                  return (
                    <button
                      key={p.sku}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); if (!blocked) addToCart(p); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left border-b last:border-0 border-border/40 ${blocked ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/60"}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          SKU {p.sku}{p.barcode ? ` · ${p.barcode}` : ""}
                        </p>
                      </div>
                      {expired && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">
                          Expired
                        </span>
                      )}
                      {!expired && stock !== undefined && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${outOfStock ? "bg-destructive/15 text-destructive" : stock <= 5 ? "bg-warning/20 text-warning-foreground" : "bg-success/15 text-success"}`}>
                          <Package className="h-2.5 w-2.5 inline mr-0.5" />{stock}
                        </span>
                      )}
                      <span className="font-bold text-primary tabular-nums w-20 text-right">
                        <SARIcon />{p.basePrice.toFixed(2)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {!loading && showResults && query && matches.length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground px-1">No product matches "{query}"</p>
            )}
            <p className="text-[11px] text-muted-foreground mt-2 px-1">
              Tip: hardware barcode scanners work automatically — just scan, item drops into order.
            </p>
          </Card>

          {/* Cart */}
          <Card className="border-border/60 shadow-card">
            <div className="flex items-center justify-between p-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Scanned Items</p>
                <Badge variant="outline" className="text-[10px]">
                  {cart.reduce((s, i) => s + i.qty, 0)} units
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setStockInOpen(true)}>
                  <Package className="h-3 w-3" /> Stock In
                </Button>
                {cart.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => setCart([])}>
                    Clear all
                  </Button>
                )}
              </div>
            </div>

            {cart.length === 0 ? (
              <div className="text-center py-14 px-6">
                <ScanBarcode className="h-10 w-10 mx-auto text-muted-foreground/50" />
                <p className="text-sm font-medium mt-3">Ready to scan</p>
                <p className="text-xs text-muted-foreground mt-1">Scan a barcode or type to search.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {cart.map((item, idx) => (
                  <div
                    key={item.sku}
                    className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${flashSku === item.sku ? "bg-primary/10" : "hover:bg-muted/30"}`}
                  >
                    <span className="text-xs text-muted-foreground tabular-nums w-6 text-right">{idx + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-[11px] text-muted-foreground">SKU {item.sku} · <SARIcon />{item.price.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-1 bg-muted rounded-lg">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQty(item.sku, -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-sm font-semibold tabular-nums">{item.qty}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateQty(item.sku, 1)}
                        disabled={item.qty >= item.stock}
                        title={item.qty >= item.stock ? `Only ${item.stock} in stock` : undefined}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className="text-sm font-semibold tabular-nums w-20 text-right">
                      <SARIcon />{(item.qty * item.price).toFixed(2)}
                    </span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(item.sku)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ─── Paused Orders ────────────────────────────────────────────────── */}
          {holds.length > 0 && (
            <Card className="border-border/60 shadow-card overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/60 bg-muted/30">
                <RotateCcw className="h-3.5 w-3.5 text-primary" />
                <span className="text-sm font-semibold">Paused Orders</span>
                <Badge className="text-[10px] px-1.5 py-0 h-5 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10 ml-1">
                  {holds.length}
                </Badge>
                <span className="ml-auto text-[11px] text-muted-foreground">Click to resume</span>
              </div>
              <div className="divide-y divide-border/40">
                {holds.map((h) => (
                  <div
                    key={h.id}
                    onClick={() => reopen(h.id)}
                    className="group relative flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-primary/5 transition-colors"
                  >
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary scale-y-0 group-hover:scale-y-100 transition-transform origin-top rounded-r" />
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <ShoppingCart className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-primary">{h.id}</span>
                        <span className="text-[11px] text-muted-foreground">· {h.at}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {h.items.slice(0, 3).map((i) => i.name).join(", ")}
                        {h.items.length > 3 ? ` +${h.items.length - 3} more` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums"><SARIcon />{h.total.toFixed(2)}</p>
                        <p className="text-[11px] text-muted-foreground">{h.items.length} item{h.items.length !== 1 ? "s" : ""}</p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); setHolds((hs) => hs.filter((x) => x.id !== h.id)); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-destructive"
                        title="Discard"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* ─── Right: order panel ───────────────────────────────────────────── */}
        <Card className="border-border/60 shadow-elegant flex flex-col md:h-[calc(100vh-100px)] md:sticky md:top-20 overflow-hidden">
          <div className="p-4 border-b border-border/60 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">New Order</h3>
              <p className="text-xs text-muted-foreground">
                {cartUnitCount} unit{cartUnitCount !== 1 ? "s" : ""} · {customer ? customer.fullName : "Walk-in"} · {branch?.name ?? "—"}
              </p>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOrderOpen(true)} title="Order details">
                <Info className="h-3.5 w-3.5" />
              </Button>
              <Badge className="gradient-primary text-primary-foreground border-0">Live</Badge>
            </div>
          </div>

          {/* Scrollable middle: cart items · customer/coupon · line-item breakdown */}
          <div className="flex-1 min-h-0 overflow-y-auto">

          {/* Cart items */}
          <div className="p-3 text-sm text-muted-foreground border-b border-border/60">
            {cart.length === 0 ? (
              <p className="text-center py-3 text-muted-foreground">Scan or search a product to start a sale.</p>
            ) : (
              <ul className="space-y-1">
                {cart.map((i) => (
                  <li key={i.sku} className="flex justify-between">
                    <span className="truncate pr-2">{i.qty} × {i.name}</span>
                    <span className="tabular-nums text-foreground"><SARIcon />{(i.qty * i.price).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Customer + Coupon section */}
          <div className="px-4 py-3 border-b border-border/60 space-y-3">
            {/* Customer lookup */}
            {customer ? (
              <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2">
                <User className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{customer.fullName}</p>
                  <p className="text-[10px] text-muted-foreground">{customer.phone}</p>
                </div>
                <button onClick={() => { setCustomer(null); setCustomerPhone(""); setCustomerNotFound(false); setNewCustomerName(""); }} className="text-muted-foreground hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : customerNotFound ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/20 px-3 py-2.5 space-y-2">
                <p className="text-[10px] font-medium text-amber-700 dark:text-amber-400">Not found — save as new customer?</p>
                <Input
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createNewCustomer()}
                  placeholder="Full name…"
                  className="h-8 text-xs"
                  autoFocus
                />
                <div className="flex gap-1.5">
                  <Input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Phone…"
                    className="h-8 text-xs flex-1"
                  />
                  <Button size="sm" className="h-8 px-3 text-xs gradient-primary text-primary-foreground border-0"
                    onClick={createNewCustomer} disabled={creatingCustomer || !newCustomerName.trim()}>
                    {creatingCustomer ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-xs"
                    onClick={() => { setCustomerNotFound(false); setNewCustomerName(""); }}>
                    Skip
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <User className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={customerPhone}
                    onChange={(e) => { setCustomerPhone(e.target.value); setCustomerNotFound(false); }}
                    onKeyDown={(e) => e.key === "Enter" && lookupCustomer()}
                    placeholder="+966501234001 or last digits…"
                    className="h-8 pl-8 text-xs"
                  />
                </div>
                <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={lookupCustomer} disabled={customerLoading}>
                  {customerLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Find"}
                </Button>
              </div>
            )}

            {/* Coupon */}
            {appliedCoupon ? (
              <div className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2">
                <Tag className="h-4 w-4 text-success shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold">{appliedCoupon.code}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {appliedCoupon.type === "percentage" ? `${appliedCoupon.value}% off` : `SAR ${appliedCoupon.value} off`}
                    {" — "}saves <SARIcon />{couponDiscount.toFixed(2)}
                  </p>
                </div>
                <button onClick={removeCoupon} className="text-muted-foreground hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <Tag className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={couponCode}
                    onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(null); }}
                    onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                    placeholder="Coupon code…"
                    className="h-8 pl-8 text-xs uppercase"
                  />
                </div>
                <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={applyCoupon} disabled={couponLoading}>
                  {couponLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Apply"}
                </Button>
              </div>
            )}
            {couponError && <p className="text-[10px] text-destructive -mt-2">{couponError}</p>}
          </div>

          {/* Line-item breakdown: subtotal · discounts · fees · VAT */}
          <div className="px-4 pt-2 pb-3 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums"><SARIcon />{subtotal.toFixed(2)}</span>
            </div>
            {couponDiscount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Coupon ({appliedCoupon?.code})</span>
                <span className="tabular-nums text-success">− <SARIcon />{couponDiscount.toFixed(2)}</span>
              </div>
            )}
            {cart.map((ci) => {
              const prod = products.find(p => p.id === ci.productId);
              if (!prod?.discount || prod.discount <= 0) return null;
              const saving = prod.discountType === "percentage"
                ? ci.qty * ci.price * (prod.discount / 100)
                : Math.min(prod.discount * ci.qty, ci.qty * ci.price);
              if (saving <= 0) return null;
              const label = prod.discountType === "percentage"
                ? `${prod.discount}% off`
                : `SAR ${prod.discount} off`;
              return (
                <div key={ci.productId} className="flex justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-1 truncate max-w-[160px]">
                    <Tag className="h-3 w-3 shrink-0" />
                    <span className="truncate">{ci.name}</span>
                    <span className="text-[10px] shrink-0">({label})</span>
                  </span>
                  <span className="tabular-nums text-success">− <SARIcon />{saving.toFixed(2)}</span>
                </div>
              );
            })}
            {activeDiscounts.filter(d => {
              const now = new Date();
              if (d.startDate && new Date(d.startDate) > now) return false;
              if (d.endDate && new Date(d.endDate) < now) return false;
              if (d.appliesTo === "all") return cart.length > 0;
              if (d.appliesTo === "product" && d.productId) return cart.some(i => i.productId === d.productId);
              return false;
            }).map(d => {
              const saving = d.appliesTo === "all"
                ? (d.discountType === "percentage" ? subtotal * (d.value / 100) : Math.min(d.value, subtotal))
                : (() => {
                    const item = cart.find(i => i.productId === d.productId);
                    if (!item) return 0;
                    return d.discountType === "percentage"
                      ? item.qty * item.price * (d.value / 100)
                      : Math.min(d.value * item.qty, item.qty * item.price);
                  })();
              return saving > 0 ? (
                <div key={d.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground truncate max-w-[150px]">{d.name}</span>
                  <span className="tabular-nums text-success">− <SARIcon />{saving.toFixed(2)}</span>
                </div>
              ) : null;
            })}
            {triggeredOffers.map(o => {
              const item = o.triggerProductId ? cart.find(i => i.productId === o.triggerProductId) : null;
              let saving = 0;

              if (o.offerType === "bogo") {
                if (item) {
                  const sets = Math.floor(item.qty / ((o.triggerQuantity ?? 1) + (o.getQuantity ?? 1)));
                  saving = sets * (o.getQuantity ?? 1) * item.price;
                } else {
                  saving = cart.reduce((s, ci) => {
                    const sets = Math.floor(ci.qty / ((o.triggerQuantity ?? 1) + (o.getQuantity ?? 1)));
                    return s + sets * (o.getQuantity ?? 1) * ci.price;
                  }, 0);
                }
              } else if (o.offerType === "product_offer" && item) {
                saving = o.discountPercentage
                  ? item.qty * item.price * (o.discountPercentage / 100)
                  : item.qty * Math.max(0, item.price - (o.offerPrice ?? 0));
              } else if (o.offerType === "buy_a_get_b") {
                const getItem = cart.find(i => i.productId === o.getProductId);
                if (getItem) {
                  saving = (o.getQuantity ?? 1) * Math.max(0, getItem.price - (o.offerPrice ?? 0));
                } else {
                  const getPrice = o.offerPrice != null ? o.offerPrice : null;
                  const freeLabel: ReactNode = getPrice === 0 || getPrice == null ? "FREE" : <><SARIcon />{getPrice.toFixed(2)}</>;
                  return (
                    <div key={o.id} className="flex items-start gap-1.5 text-xs text-blue-600 bg-blue-50 dark:bg-blue-950/30 rounded px-2 py-1.5">
                      <span className="shrink-0">🎁</span>
                      <span>
                        <span className="font-semibold">{o.name}:</span>{" "}
                        add <span className="font-semibold">{o.getProduct?.name ?? "the free item"}</span> to cart and pay only {freeLabel}
                      </span>
                    </div>
                  );
                }
              } else if (o.offerType === "combo" && o.offerPrice != null) {
                const ids = parseComboIds(o.itemsDescription);
                const retailTotal = ids.reduce((s, id) => s + (cart.find(i => i.productId === id)?.price ?? 0), 0);
                saving = Math.max(0, retailTotal - o.offerPrice);
              }

              if (o.offerType === "lucky_draw") {
                return (
                  <div key={o.id} className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded px-2 py-1">
                    <span>🎁</span>
                    <span className="truncate">{o.name} — eligible for draw!</span>
                  </div>
                );
              }
              if (saving <= 0) return null;
              return (
                <div key={o.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground truncate max-w-[150px]">{o.name}</span>
                  <span className="tabular-nums text-success">− <SARIcon />{saving.toFixed(2)}</span>
                </div>
              );
            })}
            {cart.length > 0 && allOrderFees.map(f => {
              const amount = f.customFeeAmount > 0
                ? f.customFeeAmount
                : (f.excisePercentage > 0 ? subtotal * f.excisePercentage / 100 : subtotal * f.vatPercentage / 100);
              if (amount <= 0) return null;
              return (
                <div key={f.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground truncate max-w-[150px]">{f.ruleName}</span>
                  <span className="tabular-nums">
                    {f.customFeeAmount > 0 ? <><SARIcon />{amount.toFixed(2)}</> : `${amount.toFixed(2)} (${f.excisePercentage || f.vatPercentage}%)`}
                  </span>
                </div>
              );
            })}
            {tobaccoExcise > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tobacco Excise</span>
                <span className="tabular-nums text-amber-600">+ <SARIcon />{tobaccoExcise.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{taxLabel}</span>
              <span className="tabular-nums"><SARIcon />{vatAmount.toFixed(2)}</span>
            </div>
          </div>

          </div>{/* end scrollable middle */}

          {/* Total — always pinned */}
          <div className="px-4 py-2 border-t border-border/60 flex justify-between items-baseline shrink-0">
            <span className="font-semibold">Total</span>
            <span className="text-2xl font-bold text-primary tabular-nums"><SARIcon />{total.toFixed(2)}</span>
          </div>

          {/* Charge button — always pinned */}
          <div className="px-4 pb-2 shrink-0">
            <Button
              className="w-full h-11 text-base gradient-primary text-primary-foreground border-0 shadow-glow"
              disabled={cart.length === 0}
              onClick={() => setPayOpen(true)}
            >
              Charge <SARIcon />{total.toFixed(2)}
            </Button>
          </div>

          {/* Action buttons — always pinned */}
          <div className="px-3 pb-2 shrink-0">
            <div className="grid grid-cols-4 gap-1">
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={hold} disabled={cart.length === 0}>
                <Pause className="h-3 w-3" />Hold
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={hold} disabled={holds.length === 0}>
                <RotateCcw className="h-3 w-3" />Held
                {holds.length > 0 && (
                  <span className="ml-0.5 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {holds.length}
                  </span>
                )}
              </Button>
            </div>
          </div>
          <div className="px-3 py-1.5 border-t border-success/20 bg-success/5 text-success shrink-0 flex items-center gap-2 text-xs">
            <QrCode className="h-3.5 w-3.5 shrink-0" /> ZATCA QR will be embedded on receipt
          </div>
        </Card>
      </div>

      {/* ─── Order summary dialog ──────────────────────────────────────────────── */}
      <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Order Summary</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <Row k="Branch" v={branch?.name ?? "—"} />
            <Row k="Cashier" v={activeShift?.cashier?.fullName ?? "—"} />
            <Row k="Customer" v={customer?.fullName ?? "Walk-in"} />
            <Row k="Status" v="In progress" />
            {appliedCoupon && <Row k="Coupon" v={<>{appliedCoupon.code} (−<SARIcon />{couponDiscount.toFixed(2)})</>} />}
            <div className="pt-2 border-t">
              {cart.map((i) => (
                <div key={i.sku} className="flex justify-between text-xs py-1">
                  <span>{i.qty} × {i.name}</span>
                  <span className="tabular-nums"><SARIcon />{(i.qty * i.price).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={hold} disabled={cart.length === 0}>Hold</Button>
            <Button className="gradient-primary text-primary-foreground border-0" onClick={() => { setOrderOpen(false); setPayOpen(true); }}>
              Complete Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Payment dialog ────────────────────────────────────────────────────── */}
      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        total={total}
        onCharge={handleCharge}
        onDone={onPaymentDone}
      />


      {/* ─── Invoice dialog ────────────────────────────────────────────────────── */}
      <Dialog open={invOpen} onOpenChange={setInvOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tax Invoice</DialogTitle></DialogHeader>
          {invoice ? (() => {
            const zatcaQr = invoice.zatcaQrCode ?? buildZatcaTlv(
              invoice.sellerName,
              invoice.vatNumber,
              invoice.createdAt,
              invoice.total,
              invoice.vat,
            );
            return (
              <div id="pos-invoice" className="rounded-xl bg-muted/40 p-5 font-mono text-xs space-y-2">
                <div className="text-center space-y-0.5">
                  <p className="font-bold text-sm">{invoice.sellerName}</p>
                  <p className="text-muted-foreground">VAT {invoice.vatNumber}</p>
                  <p className="text-muted-foreground text-[10px] tracking-widest uppercase mt-1">Invoice No.</p>
                  <p className="font-bold">{invoice.orderNumber}</p>
                  <p className="text-muted-foreground">{new Date(invoice.createdAt).toLocaleString("en-SA")}</p>
                  {invoice.customerName && <p>Customer: {invoice.customerName}</p>}
                </div>
                <div className="border-t border-dashed border-border pt-2 space-y-0.5">
                  {invoice.items.map((i) => (
                    <div key={i.sku} className="flex justify-between">
                      <span>{i.qty} × {i.name}</span>
                      <span className="tabular-nums">{(i.qty * i.price).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-dashed border-border pt-2 space-y-0.5">
                  <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{(invoice.subtotal - invoice.discount).toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>{invoice.taxLabel}</span><span className="tabular-nums">{invoice.vat.toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold text-sm pt-1">
                    <span>Total</span>
                    <span className="tabular-nums">SAR {invoice.total.toFixed(2)}</span>
                  </div>
                  {invoice.splitBreakdown ? (
                    <>
                      <div className="flex justify-between text-muted-foreground"><span>Payment</span><span>Split</span></div>
                      {invoice.splitBreakdown.map(p => (
                        <div key={p.method} className="flex justify-between pl-2 text-muted-foreground">
                          <span className="capitalize">↳ {p.method}</span>
                          <span className="tabular-nums">{p.amount.toFixed(2)}</span>
                        </div>
                      ))}
                    </>
                  ) : invoice.paymentMethod && (
                    <div className="flex justify-between text-muted-foreground"><span>Payment</span><span className="capitalize">{invoice.paymentMethod}</span></div>
                  )}
                </div>
                <div className="text-center pt-2">
                  <div className="inline-flex flex-col items-center gap-1">
                    <QRCodeSVG value={zatcaQr} size={96} level="M" />
                    <p className="text-[10px] text-muted-foreground">ZATCA Phase 2 — scan to verify</p>
                  </div>
                </div>
              </div>
            );
          })() : (
            <p className="text-sm text-muted-foreground text-center py-8">Complete a sale to view its invoice here.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvOpen(false)}>Close</Button>
            <Button
              className="gradient-primary text-primary-foreground border-0"
              disabled={!invoice}
              onClick={() => {
                if (!invoice) return;
                const printerName = localStorage.getItem("baqala_receipt_printer") || undefined;
                const mode = localStorage.getItem("baqala_print_mode") ?? "local";
                const printId = toast.loading("Printing receipt…");
                const doPrint = mode === "qz"
                  ? qzPrintReceipt(invoice, printerName).then(() => ({ message: `Receipt sent to ${printerName ?? "printer"}.` }))
                  : api.printReceipt({ ...invoice, printerName });
                doPrint
                  .then((res) => toast.success(res.message, { id: printId }))
                  .catch((err: unknown) => {
                    const msg = err instanceof Error ? err.message : "Print failed";
                    toast.error(`Print failed: ${msg}`, { id: printId, duration: 6000 });
                  });
              }}
            >
              <Printer className="h-4 w-4 mr-1" />Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuickStockInDialog
        open={stockInOpen}
        onClose={() => setStockInOpen(false)}
        products={products}
        stockMap={stockMap}
        branchId={branch?.id ?? ""}
        onStockAdded={(product, newStock) => {
          // Not capped at newStock here — when currentStock was 0, QuickStockInDialog
          // intentionally didn't receive any stock and expects this add-to-cart to proceed
          // anyway, so the sale below records the shortfall as negative on-hand stock.
          setStockMap(prev => { const next = new Map(prev); next.set(product.id, newStock); return next; });
          setCart(c => {
            const ex = c.find(i => i.sku === product.sku);
            if (ex) return c.map(i => i.sku === product.sku ? { ...i, qty: i.qty + 1, stock: newStock } : i);
            return [...c, { name: product.name, sku: product.sku, productId: product.id, qty: 1, price: product.basePrice, stock: newStock }];
          });
          setStockInOpen(false);
        }}
      />

    </PageShell>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}

function PaymentDialog({
  open,
  onOpenChange,
  total,
  onCharge,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  total: number;
  onCharge: (paymentMethod: string, splitPayments?: Array<{ method: string; amount: number }>) => Promise<void>;
  onDone: () => void;
}) {
  const [tab, setTab] = useState("cash");
  const [received, setReceived] = useState(total.toFixed(2));
  const [status, setStatus] = useState<"idle" | "waiting" | "success" | "failed">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Split payment inputs (cash + card only)
  const [splitCash, setSplitCash] = useState("0.00");
  const [splitCard, setSplitCard] = useState("0.00");

  const change = Math.max(0, parseFloat(received || "0") - total);
  const splitTotal = (parseFloat(splitCash) || 0) + (parseFloat(splitCard) || 0);
  const splitOk = Math.abs(splitTotal - total) < 0.01;

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setReceived("");
      setStatus("idle");
      setErrorMsg(null);
      setSplitCash(total.toFixed(2));
      setSplitCard("0.00");
    }
  }, [open, total]);

  const charge = async () => {
    setStatus("waiting");
    try {
      if (tab === "split") {
        const splitPayments = [
          { method: "cash", amount: parseFloat(splitCash) || 0 },
          { method: "card", amount: parseFloat(splitCard) || 0 },
        ];
        await onCharge("split", splitPayments);
      } else {
        await onCharge(tab);
      }
      setStatus("success");
      setTimeout(onDone, 800);
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "Payment failed. Please try again.");
      setStatus("failed");
    }
  };

  const confirmDisabled =
    status === "waiting" ||
    status === "success" ||
    (tab === "split" && !splitOk);

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setStatus("idle"); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Take Payment — <SARIcon />{total.toFixed(2)}</DialogTitle></DialogHeader>

        <Tabs value={tab} onValueChange={(v) => { setTab(v); setStatus("idle"); }}>
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="cash"><Banknote className="h-3.5 w-3.5 mr-1" />Cash</TabsTrigger>
            <TabsTrigger value="card"><CreditCard className="h-3.5 w-3.5 mr-1" />Card</TabsTrigger>
            {/* <TabsTrigger value="wallet"><Wallet className="h-3.5 w-3.5 mr-1" />Wallet</TabsTrigger> */}
            <TabsTrigger value="split"><Split className="h-3.5 w-3.5 mr-1" />Split</TabsTrigger>
          </TabsList>

          <TabsContent value="cash" className="space-y-3 mt-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Customer Gives</Label>
              <Input
                className="h-14 text-2xl font-bold text-center tracking-wide"
                inputMode="decimal"
                autoFocus
                value={received}
                onChange={(e) => setReceived(e.target.value.replace(/[^0-9.]/g, ""))}
                onFocus={(e) => e.target.select()}
                placeholder={total.toFixed(2)}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[50, 100, 200, 500].map((d) => (
                <Button key={d} variant="outline" onClick={() => setReceived(String(d))}><SARIcon />{d}</Button>
              ))}
              <Button variant="outline" onClick={() => setReceived("1000")}><SARIcon />1000</Button>
              <Button variant="outline" onClick={() => setReceived(total.toFixed(2))}>Exact</Button>
            </div>
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 flex justify-between items-center">
              <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Exchange</span>
              <span className="font-bold text-2xl text-emerald-600 dark:text-emerald-400 tabular-nums"><SARIcon />{change.toFixed(2)}</span>
            </div>
          </TabsContent>

          <TabsContent value="card" className="space-y-3 mt-4">
            <CardMachineStatus status={status} />
            <div className="rounded-lg bg-muted/40 p-3 text-sm">
              Card machine: <strong>Geidea Terminal</strong>
            </div>
          </TabsContent>

          {/* Wallet tab hidden
          <TabsContent value="wallet" className="space-y-3 mt-4">
            <CardMachineStatus status={status} />
            <div className="grid grid-cols-3 gap-2">
              {["STC Pay", "Apple Pay", "mada Pay"].map((w) => (
                <Button key={w} variant="outline" size="sm">{w}</Button>
              ))}
            </div>
          </TabsContent>
          */}

          <TabsContent value="split" className="space-y-3 mt-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px]">Cash</Label>
                <Input className="h-9" type="number" value={splitCash} onChange={(e) => setSplitCash(e.target.value)} onFocus={(e) => e.target.select()} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Card</Label>
                <Input className="h-9" type="number" value={splitCard} onChange={(e) => setSplitCard(e.target.value)} onFocus={(e) => e.target.select()} />
              </div>
            </div>
            <div className={`flex justify-between text-sm p-2 rounded-lg ${splitOk ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
              <span>Sum</span>
              <span className="tabular-nums font-semibold">
                <SARIcon />{splitTotal.toFixed(2)} {splitOk ? "✓" : `(need ${total.toFixed(2)})`}
              </span>
            </div>
          </TabsContent>
        </Tabs>

        {status === "failed" && (
          <p className="text-sm text-destructive text-center">{errorMsg ?? "Payment failed. Please try again."}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="gradient-primary text-primary-foreground border-0"
            disabled={confirmDisabled}
            onClick={charge}
          >
            {status === "waiting" ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Processing…</>
            ) : status === "success" ? (
              <><CheckCircle2 className="h-4 w-4 mr-1" />Done</>
            ) : (
              "Confirm Payment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CardMachineStatus({ status }: { status: "idle" | "waiting" | "success" | "failed" }) {
  const map = {
    idle: { c: "bg-success/15 text-success", l: "Connected · Ready" },
    waiting: { c: "bg-warning/20 text-warning-foreground", l: "Waiting for payment…" },
    success: { c: "bg-success/15 text-success", l: "Payment Approved" },
    failed: { c: "bg-destructive/15 text-destructive", l: "Payment Failed" },
  }[status];
  return (
    <div className={`rounded-xl p-4 flex items-center gap-3 ${map.c}`}>
      {status === "success" ? (
        <CheckCircle2 className="h-5 w-5" />
      ) : status === "waiting" ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <CreditCard className="h-5 w-5" />
      )}
      <span className="font-semibold">{map.l}</span>
    </div>
  );
}
