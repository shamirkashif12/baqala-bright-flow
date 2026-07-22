import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useRef, useEffect, useCallback, type ReactNode } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, ScanBarcode, Pause, RotateCcw, Printer,
  Plus, Minus, Trash2, CreditCard, Banknote, Split,
  Info, CheckCircle2, Loader2, ShoppingCart, Tag, User, X, Package, QrCode,
  Building2, PrinterCheck, RefreshCw, AlertCircle,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { api, getUsbPrinter, type Product, type Coupon, type Customer, type CashierShift, type Order, type Offer, type Discount, type TaxFeeRule, type InventoryBatch, type ResolvedPrice, type LoyaltyProgram } from "@/lib/api";
import { qzConnect, qzIsConnected, qzListPrinters, qzPrintReceipt, qzPrintReceiptUsb } from "@/lib/qz";
import { useBranch } from "@/lib/branch-context";
import { BranchFilter } from "@/components/branch-filter";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { useAuth } from "@/lib/auth";
import { SARIcon } from "@/lib/currency";
import { ModuleGate } from "@/components/role-gate";
import { uuid } from "@/lib/utils";

// "Failed to fetch" is the browser's own error when it can't reach anything at all (nothing
// listening on the local print-agent port) — i.e. no printer/agent has ever been set up on
// this till, not a real print failure. Silence that case entirely instead of alarming the
// cashier on every single sale; a printer that's actually configured but errors for a real
// reason (bad name, out of paper, etc.) still gets a normal HTTP-style error message.
function isPrinterNotSetUp(msg: string): boolean {
  return /failed to fetch|networkerror when attempting to fetch/i.test(msg);
}

// Distinguishes a printer-connectivity failure from a generic print error using the message
// text — qz.ts/api.printReceipt don't return a structured error code, just a message string.
function notifyPrintFailure(msg: string) {
  const offline = /offline|not detected|no printer|not connected/i.test(msg);
  api.notify("Hardware / Devices", offline ? "Receipt Printer Offline" : "Receipt Print Failed",
    offline ? "Receipt Printer Offline" : "Receipt Print Failed",
    offline ? "Receipt printer is offline" : "Receipt print failed",
    { severity: "error" });
}

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




export const Route = createFileRoute("/_app/pos")({
  component: () => (
    <ModuleGate module="POS">
      <POS />
    </ModuleGate>
  ),
});

type CartItem = { name: string; sku: string; productId: string; qty: number; price: number; stock: number };

// A bonus/free unit auto-added by a triggered bogo/buy_a_get_b offer, e.g. "buy 3 get 1 free":
// productId is what the bonus applies to (same as the trigger product unless the offer names a
// different "get" product), bonusQty how many free units, payPerUnit what the customer still
// pays for each (0 for a pure BOGO, offer.offerPrice for a discounted buy_a_get_b).
type BonusContribution = { offerId: string; offerName: string; productId: string; bonusQty: number; payPerUnit: number };

// Cart line as actually rung up (paid qty + any auto-added bonus merged into one displayed qty) —
// this is what's rendered, submitted at checkout, and used for inventory decrement, since bonus
// units physically leave the shelf just like paid ones. `cart` itself always stays the
// cashier-scanned paid quantity so offer thresholds have a stable baseline to recompute from on
// every increment/decrement instead of compounding against an already-bonused total.
type DisplayCartItem = CartItem & { bonusQty: number; isBonusOnly: boolean };

type InvoiceSnapshot = {
  orderNumber: string;
  createdAt: string;
  items: CartItem[];
  subtotal: number;
  // All-inclusive total (coupon + auto-discounts + loyalty) — kept for the totals math, but
  // loyaltyDiscountAmount below breaks out how much of it came from redeemed points, so the
  // receipt can show that as its own line instead of folding it silently into "Discount".
  discount: number;
  loyaltyPointsRedeemed?: number;
  loyaltyDiscountAmount?: number;
  vat: number;
  total: number;
  taxLabel: string;
  branchName: string;
  vatNumber: string;
  crNumber?: string;
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
          await api.receiveBatch({ productId: selected.id, branchId, quantity: qty });
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
  const [selectedPrinter, setSelectedPrinterState] = useState<string>(
    () => localStorage.getItem("baqala_receipt_printer") ?? ""
  );
  // QZ Tray
  const [qzConnected, setQzConnected] = useState(false);
  const [qzPrinters, setQzPrinters] = useState<string[]>([]);
  const [connectingQz, setConnectingQz] = useState(false);
  const [trustOpen, setTrustOpen] = useState(false);

  const trustCommand = `powershell -c "iex(irm '${api.qzTrustPs1Url()}')"`;

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

  function setSelectedPrinter(name: string) {
    setSelectedPrinterState(name);
    localStorage.setItem("baqala_receipt_printer", name);
  }

  function handleOpen() {
    setOpen(true);
    // QZ Tray is the only supported route now that the local-agent tab is gone, so pin the
    // stored mode here — terminals provisioned before this still carry mode="local".
    localStorage.setItem("baqala_print_mode", "qz");
    const isQz = qzIsConnected();
    setQzConnected(isQz);
    if (isQz) qzListPrinters().then(setQzPrinters).catch(() => {});
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

          <div className="space-y-3">
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
                  <p><span className="font-medium text-foreground">Windows:</span> Double-click <code className="bg-muted px-1 rounded">MiMony-POS-Setup.bat</code> → click <strong>Run</strong> → click <strong>Yes</strong></p>
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

                {/* After-install steps — QZ Tray only attaches to browser tabs opened *after* it's
                    running, so Chrome has to be restarted before the POS can reach it. */}
                <div className="rounded-md bg-muted/50 px-3 py-2 space-y-1">
                  <p className="font-medium text-foreground">After it installs:</p>
                  <ol className="list-decimal list-inside space-y-0.5">
                    <li>Close <strong>all</strong> Chrome / browser windows so QZ Tray can attach.</li>
                    <li>Launch <strong>QZ Tray</strong> — look for its icon in the system tray (bottom-right).</li>
                    <li>Reopen the POS, click <strong>Connect</strong> above, then <strong>select your printer</strong> below.</li>
                  </ol>
                </div>

                {/* Details → opens the "already installed / fix trust popup" instructions */}
                <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5" onClick={() => setTrustOpen(true)}>
                  <Info className="h-3.5 w-3.5" /> Details — already have QZ Tray installed?
                </Button>
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
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Windows: fix "Action Required" / "Untrusted website" popup on a machine
          that already has QZ Tray installed manually — shown from the Details button. */}
      <Dialog open={trustOpen} onOpenChange={setTrustOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" /> Windows: already have QZ Tray installed?
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2.5 text-sm text-muted-foreground">
            <p>If you get an "Action Required" / "Untrusted website" popup every time you print, run this once (as Admin) to make QZ Tray trust this POS permanently:</p>
            <div className="flex items-center gap-1.5">
              <code className="flex-1 bg-muted px-2 py-1.5 rounded text-xs break-all select-all">{trustCommand}</code>
              <button
                type="button"
                className="shrink-0 rounded px-2 py-1.5 bg-muted hover:bg-muted/70 text-xs"
                onClick={() => { navigator.clipboard.writeText(trustCommand); toast.success("Command copied"); }}
              >Copy</button>
            </div>
            <p>Paste into Win+R or a terminal, press Enter, and accept the Admin prompt.</p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTrustOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function POS() {
  // ─── Branch: page-local filter, not the header ────────────────────────────────
  const { user } = useAuth();
  const { branches } = useBranch();
  const isAdmin = user?.role === "tenant_admin";
  const lockedBranchId = !isAdmin ? (user?.branchId ?? null) : null;
  const [branchId, setBranchId] = useState(lockedBranchId ?? "");
  useEffect(() => {
    if (lockedBranchId) setBranchId(lockedBranchId);
  }, [lockedBranchId]);
  useEffect(() => {
    if (!branchId && branches.length) {
      setBranchId(branches.find((b) => b.status === "active")?.id ?? branches[0].id);
    }
  }, [branches, branchId]);
  const branch = branches.find((b) => b.id === branchId) ?? null;

  // ─── Data ─────────────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([]);
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());
  const [expiredProductIds, setExpiredProductIds] = useState<Set<string>>(new Set());
  const [taxRate, setTaxRate] = useState(0.15);
  const [taxLabel, setTaxLabel] = useState("VAT 15%");
  const [vatNumber, setVatNumber] = useState("300123456700003");
  const [sellerName, setSellerName] = useState("");
  const [crNumber, setCrNumber] = useState("");
  const [activeShift, setActiveShift] = useState<CashierShift | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // ─── Cart ─────────────────────────────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [flashSku, setFlashSku] = useState<string | null>(null);
  const [scanFlash, setScanFlash] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const pausedOrdersRef = useRef<HTMLDivElement>(null);

  // Stable per-checkout-attempt id: generated on the first Confirm click and re-sent unchanged
  // on any retry (e.g. after a network timeout), so the backend can recognize a retried request
  // as the same attempt instead of creating a second paid order. Cleared once the sale actually
  // succeeds so the next, genuinely new sale gets its own id.
  const checkoutRequestIdRef = useRef<string | null>(null);

  // Refs so the global scanner listener always sees fresh values without re-registering
  const productsRef = useRef<Product[]>([]);
  const stockMapRef = useRef<Map<string, number>>(new Map());
  const expiredProductIdsRef = useRef<Set<string>>(new Set());
  const recalledProductIdsRef = useRef<Set<string>>(new Set());
  const priceMapRef = useRef<Map<string, ResolvedPrice>>(new Map());
  const packBarcodeMapRef = useRef<Map<string, { productId: string; packSize: number }>>(new Map());
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

  // ─── Discounts — manually applied by the cashier, never auto-applied ──────────
  const [appliedDiscounts, setAppliedDiscounts] = useState<Discount[]>([]);
  const [discountPickerId, setDiscountPickerId] = useState("");

  // ─── Loyalty points redemption ─────────────────────────────────────────────────
  const [loyaltyProgram, setLoyaltyProgram] = useState<LoyaltyProgram | null>(null);
  const [redeemPoints, setRedeemPoints] = useState(0);

  // Branch-configurable cashier permissions (POS Settings → Permissions tab). Cashier role only
  // — Branch Manager/Supervisor/tenant_admin covering a register aren't restricted by these.
  // Defaults match PosSettings.cs so the UI behaves the same as an unconfigured branch until the
  // real settings load.
  const [posPerms, setPosPerms] = useState({ cashierCanCoupon: true, cashierCanHoldOrder: true });
  const isRestrictedCashier = user?.role === "cashier";

  // ─── Active Offers & Discounts ────────────────────────────────────────────────
  const [allActiveOffers, setActiveOffers] = useState<Offer[]>([]);
  const [activeDiscounts, setActiveDiscounts] = useState<Discount[]>([]);
  const [customFees, setCustomFees] = useState<TaxFeeRule[]>([]);
  const [tobaccoFeeEnabled, setTobaccoFeeEnabled] = useState(true);
  // KSA tobacco excise config — was hardcoded (25 SAR min, 100%); now read from the
  // tobacco_excise TaxFeeRule row (Tax & Fees settings) so it's admin-configurable.
  const [tobaccoExciseMinimum, setTobaccoExciseMinimum] = useState(25);
  const [tobaccoExcisePercentage, setTobaccoExcisePercentage] = useState(100);

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
  const loadCore = () => {
    setLoading(true);
    // allSettled, not all: one sibling call failing (e.g. tax rules) must not blank out the
    // product grid a cashier was about to sell from — surface it via loadError instead.
    Promise.allSettled([
      api.getProducts(),
      api.getTaxRules(),
      api.getActiveShifts(),
    ])
      .then(([prodsR, taxRulesR, shiftsR]) => {
        if (prodsR.status === "fulfilled") setProducts(prodsR.value);

        if (taxRulesR.status === "fulfilled") {
          const taxRules = taxRulesR.value;
          const vatRule = taxRules.find((r) => r.ruleType === "vat" && r.status === "active");
          if (vatRule) {
            setTaxRate(vatRule.vatPercentage / 100);
            setTaxLabel(`VAT ${vatRule.vatPercentage}%`);
          }

          const tobaccoRule = taxRules.find((r) => r.ruleType === "tobacco_excise");
          setTobaccoFeeEnabled(tobaccoRule ? tobaccoRule.status === "active" : true);
          if (tobaccoRule) {
            setTobaccoExciseMinimum(tobaccoRule.minimumExciseAmount);
            setTobaccoExcisePercentage(tobaccoRule.excisePercentage);
          }
        }

        if (shiftsR.status === "fulfilled") {
          const shift = shiftsR.value.find((s) => s.status === "open" && s.cashierId === user?.id) ?? null;
          setActiveShift(shift);
        }

        setLoadError([prodsR, taxRulesR, shiftsR].some(r => r.status === "rejected"));
      })
      .finally(() => {
        setLoading(false);
        searchRef.current?.focus();
      });
  };

  useEffect(() => {
    loadCore();

    api.getActiveOffers().then(setActiveOffers).catch(() => {});
    api.getDiscounts({ isActive: true }).then(setActiveDiscounts).catch(() => {});
    api.getTaxRules().then(rules =>
      setCustomFees(rules.filter(r => r.ruleType === "custom_fee" && r.status === "active"))
    ).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- mount-only load; user.id is stable per session

  // ─── Loyalty program: reload whenever the active branch changes ───────────────
  useEffect(() => {
    if (!branch) { setLoyaltyProgram(null); return; }
    api.getEffectiveLoyaltyProgram(branch.id).then(setLoyaltyProgram).catch(() => setLoyaltyProgram(null));
  }, [branch]);

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
      setAppliedDiscounts([]);
      setDiscountPickerId("");
      setCustomer(null);
      setCustomerPhone("");
      setCustomerNotFound(false);
      setNewCustomerName("");
      setRedeemPoints(0);
      setBranchSwitchBanner(branch.name);
      setTimeout(() => setBranchSwitchBanner(null), 3000);
    } else {
      // Initial mount / tab return — restore the saved cart for this branch
      try {
        const saved = sessionStorage.getItem(`pos_cart_${branch.id}`);
        setCart(saved ? (JSON.parse(saved) as CartItem[]) : []);
      } catch { setCart([]); }
    }

    // Held orders are parked sales for THIS branch — restore them whenever the branch changes
    // (switch or initial mount) rather than clearing them, so a tab reload or branch switch
    // doesn't lose bills a cashier put on hold earlier in the day.
    try {
      const savedHolds = sessionStorage.getItem(`pos_holds_${branch.id}`);
      setHolds(savedHolds ? (JSON.parse(savedHolds) as typeof holds) : []);
    } catch { setHolds([]); }

    // Always reload stock, active shift, and ZATCA for the (new) branch
    api.getStock({ branchId: branch.id })
      .then((stocks) => {
        const map = new Map<string, number>();
        stocks.forEach((s) => map.set(s.productId, Math.max(0, s.quantity - (s.reservedQuantity ?? 0))));
        setStockMap(map);
      })
      .catch(() => {});

    // Block sale of expired items — mirrors the "Block sale of expired items" rule exactly as
    // OrdersController.Create enforces it server-side: a product is blocked once it has at least
    // one batch on record but NONE with remaining stock that isn't past its expiry date. Filtering
    // by the stored `status === "expired"` field alone (as this used to) misses batches whose
    // Status was set once at receiving time and never updated as the real ExpiryDate passed — the
    // backend catches those anyway and only rejects at checkout, so the product looked selectable
    // here until payment was confirmed. Fetching all batches and computing live avoids that gap.
    api.getBatches({ branchId: [branch.id] })
      .then((batches) => {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const byProduct = new Map<string, InventoryBatch[]>();
        for (const b of batches) {
          if (!byProduct.has(b.productId)) byProduct.set(b.productId, []);
          byProduct.get(b.productId)!.push(b);
        }
        const blocked = new Set<string>();
        for (const [productId, productBatches] of byProduct) {
          const hasSellable = productBatches.some((b) =>
            b.remainingQuantity > 0 && b.status !== "expired" &&
            (!b.expiryDate || new Date(b.expiryDate) >= today));
          if (!hasSellable) blocked.add(productId);
        }
        setExpiredProductIds(blocked);
      })
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

    api.getCompanyProfile()
      .then((c) => { if (c.crNumber) setCrNumber(c.crNumber); })
      .catch(() => {});

    // POS Settings' "cashier can apply coupon"/"cashier can hold order" toggles previously had
    // no effect on this screen at all — it hardcoded both as always-on regardless of what an
    // admin configured. Missing settings row (new branch) keeps the PosSettings.cs defaults set
    // above rather than resetting to some other value.
    api.getPosSettings(branch.id)
      .then((s) => setPosPerms({ cashierCanCoupon: s.cashierCanCoupon, cashierCanHoldOrder: s.cashierCanHoldOrder }))
      .catch(() => {});
  }, [branch]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Persist cart to session storage (survives tab navigation) ───────────────
  useEffect(() => {
    if (!branch) return;
    sessionStorage.setItem(`pos_cart_${branch.id}`, JSON.stringify(cart));
  }, [cart]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Persist held orders to session storage (survives tab navigation/reload) ─
  // Previously held only in React state — a reload or crash silently lost every
  // parked bill with no warning. Also read by the Cashier Workspace dashboard's
  // "Held Orders" tile (see _app.cashier.tsx) instead of the dead `pos_holds`
  // localStorage key nothing used to write.
  useEffect(() => {
    if (!branch) return;
    sessionStorage.setItem(`pos_holds_${branch.id}`, JSON.stringify(holds));
  }, [holds]); // eslint-disable-line react-hooks/exhaustive-deps


  // ─── Resolved pricing (FRD §12) ─────────────────────────────────────────────
  //
  // A product's unit price used to be product.basePrice, read directly at every add-to-cart site.
  // It now comes from the server's price resolution — branch-specific, customer-tier, and
  // scheduled rules, falling back to basePrice when no rule matches (which is every product on an
  // untouched database, so this is behaviour-preserving by default).
  //
  // Deliberately resolved here and snapshotted onto the cart line at add time, rather than
  // re-derived during checkout: it mirrors exactly what basePrice did before, so the whole
  // downstream engine (discounts, offers, bundles, tobacco, tax) is untouched. It only changes
  // where the starting number comes from.
  //
  // Re-fetched when the customer changes, because tier-gated rules can only be resolved once we
  // know who's buying. Failure is non-fatal: an empty map means every line falls back to
  // basePrice, i.e. the pre-existing behaviour, so a pricing-service hiccup degrades to today's
  // prices instead of blocking the till.
  const [priceMap, setPriceMap] = useState<Map<string, ResolvedPrice>>(new Map());

  useEffect(() => {
    if (!branch) return;
    let cancelled = false;
    const load = () =>
      api.resolvePrices({ branchId: branch.id, customerTier: customer?.tier })
        .then((rows) => { if (!cancelled) setPriceMap(new Map(rows.map((r) => [r.productId, r]))); })
        .catch(() => { if (!cancelled) setPriceMap(new Map()); });
    load();
    // Re-resolve when the till tab regains focus, so a product just added (with its branch/tier
    // prices) in another tab is priced correctly here without a manual reload — the reported
    // "the price wasn't the one I set" when a product was priced elsewhere moments earlier.
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { cancelled = true; window.removeEventListener("focus", onFocus); };
  }, [branch, customer?.tier]);

  // The single place a unit price is decided on this screen.
  const effectivePrice = useCallback(
    (p: Product) => priceMap.get(p.id)?.unitPrice ?? p.basePrice,
    [priceMap],
  );

  // Ref-based twin for the scanner listener, which runs outside React's render closure.
  const effectivePriceOf = (p: Product) => priceMapRef.current.get(p.id)?.unitPrice ?? p.basePrice;

  // ─── Pack & unit pricing (FRD §12) ──────────────────────────────────────────
  //
  // A pack is modelled as a quantity break, not as a separate line: once the line reaches the
  // pack size, every unit on it drops to the pack's unit price (packPrice/packSize). Buying a
  // case of 12 and buying 12 singles therefore cost the same, which is the point.
  //
  // One line per product is a hard requirement, not a simplification. The cart is keyed by SKU and
  // the offer engine accumulates bonus quantities by productId, then adds them to *every* line
  // carrying that productId (see displayCart) — so a second line for the same product would
  // double-count its BOGO bonus and would independently re-pass the per-line stock guard,
  // overselling. Quantity-break sidesteps both: the whole downstream engine still sees one
  // ordinary line of N units.
  //
  // The cheapest applicable pack wins, and never loses to the plain unit price.
  //
  // One implementation, two entry points: the render path reads React state, the scanner listener
  // reads the ref (it runs outside the render closure). They must never disagree on price, so the
  // rule itself lives here once and both callers hand it a map.
  const priceForQtyIn = (map: Map<string, ResolvedPrice>, p: Product, qty: number) => {
    const resolved = map.get(p.id);
    if (!resolved) return p.basePrice;
    const unlocked = resolved.packs.filter((pk) => pk.packSize > 0 && qty >= pk.packSize);
    if (unlocked.length === 0) return resolved.unitPrice;
    const cheapest = unlocked.reduce((a, b) => (b.unitPrice < a.unitPrice ? b : a));
    return Math.min(cheapest.unitPrice, resolved.unitPrice);
  };

  const priceForQty = useCallback(
    (p: Product, qty: number) => priceForQtyIn(priceMap, p, qty),
    [priceMap], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const priceForQtyOf = (p: Product, qty: number) => priceForQtyIn(priceMapRef.current, p, qty);

  // Re-price the open cart whenever prices re-resolve. Cart lines snapshot their price when added,
  // so without this: (1) attaching a customer mid-basket never applies that tier's special price to
  // items already scanned, and (2) a cart restored from session storage before the price map has
  // loaded keeps stale prices. Both were reported as "the special/tier price isn't reflected". The
  // engine below (discounts, offers, tax) recomputes off these line prices, so re-pricing here
  // flows through to the total.
  useEffect(() => {
    if (priceMap.size === 0) return;
    setCart((prev) => {
      let changed = false;
      const next = prev.map((line) => {
        const prod = productsRef.current.find((p) => p.id === line.productId);
        if (!prod) return line;
        const np = priceForQtyIn(priceMap, prod, line.qty);
        if (np === line.price) return line;
        changed = true;
        return { ...line, price: np };
      });
      return changed ? next : prev;
    });
  }, [priceMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Recalled products (FRD §13) ────────────────────────────────────────────
  //
  // Mirrors the expired-item block above, and the server-side guard in OrdersController.Create
  // that is the real enforcement — this exists so the cashier finds out at scan time rather than
  // at payment.
  //
  // Reads the purpose-built /recalls/blocked-products rather than the full recall list: the latter
  // is gated on Batches:View, which the Cashier role isn't granted, so it would 403 here and the
  // block would silently never engage. That endpoint also resolves lot-scoped recalls against
  // on-hand stock server-side, so this screen doesn't pull the whole batch list to work it out.
  const [recalledProductIds, setRecalledProductIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!branch) return;
    let cancelled = false;
    api.getBlockedProducts(branch.id)
      .then((rows) => {
        if (!cancelled) setRecalledProductIds(new Set(rows.map((r) => r.productId)));
      })
      .catch(() => { if (!cancelled) setRecalledProductIds(new Set()); });
    return () => { cancelled = true; };
  }, [branch]);

  // Pack (case/outer) barcode → the product and how many units one scan represents. Scanning a
  // case barcode adds a whole pack rather than a single unit. The backend guarantees a pack barcode
  // can't collide with a product barcode, but product barcodes are still matched first so the
  // meaning of a scan never depends on this map's iteration order.
  const packBarcodeMap = useMemo(() => {
    const map = new Map<string, { productId: string; packSize: number }>();
    for (const resolved of priceMap.values()) {
      for (const pack of resolved.packs) {
        if (pack.packBarcode && pack.packSize > 0) {
          map.set(pack.packBarcode, { productId: resolved.productId, packSize: pack.packSize });
        }
      }
    }
    return map;
  }, [priceMap]);

  // Keep refs fresh so the scanner listener never has stale closures
  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => { stockMapRef.current = stockMap; }, [stockMap]);
  useEffect(() => { expiredProductIdsRef.current = expiredProductIds; }, [expiredProductIds]);
  useEffect(() => { recalledProductIdsRef.current = recalledProductIds; }, [recalledProductIds]);
  useEffect(() => { priceMapRef.current = priceMap; }, [priceMap]);
  useEffect(() => { packBarcodeMapRef.current = packBarcodeMap; }, [packBarcodeMap]);

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
        // Product barcode, then SKU, then a pack (case/outer) barcode. A pack scan resolves to the
        // same product and adds packSize units — see priceForQty, which then re-prices the line at
        // the pack rate.
        const packHit = packBarcodeMapRef.current.get(code);
        const p =
          productsRef.current.find((x) => x.barcode === code) ??
          productsRef.current.find((x) => x.sku === code) ??
          (packHit ? productsRef.current.find((x) => x.id === packHit.productId) : undefined);
        const addQty = packHit && p && p.barcode !== code && p.sku !== code ? packHit.packSize : 1;
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
            api.notify("Expiry / Perishable", "Expired Item Scanned", "Expired Item Scanned",
              `This batch is expired and cannot be sold: ${p.name}`, { severity: "warning", entityType: "Product", entityId: p.id });
            return;
          }
          if (recalledProductIdsRef.current.has(p.id)) {
            toast.error(`Cannot sell recalled item`, {
              description: `"${p.name}" is under an active recall and is blocked from sale.`,
              duration: 4000,
            });
            api.notify("Expiry / Perishable", "Recalled Item Scanned", "Recalled Item Scanned",
              `This product is under an active recall and cannot be sold: ${p.name}`,
              { severity: "error", entityType: "Product", entityId: p.id });
            return;
          }
          const stock = stockMapRef.current.get(p.id) ?? 0;
          let blockedByStock = false;
          setCart((c) => {
            const ex = c.find((i) => i.sku === p.sku);
            const nextQty = (ex?.qty ?? 0) + addQty;
            if (nextQty > stock) { blockedByStock = true; return c; }
            // Re-price on every quantity change — crossing a pack threshold is what unlocks the
            // pack price, so the line's price is a function of its quantity, not of when it was added.
            if (ex) return c.map((i) => (i.sku === p.sku ? { ...i, qty: nextQty, price: priceForQtyOf(p, nextQty) } : i));
            return [...c, { name: p.name, sku: p.sku, productId: p.id, qty: addQty, price: priceForQtyOf(p, addQty), stock }];
          });
          if (blockedByStock) {
            toast.error(stock > 0 ? `Only ${stock} in stock` : `Out of stock`, {
              description: addQty > 1
                ? `Scanning a pack adds ${addQty} units — "${p.name}" has ${stock} available at this branch.`
                : `"${p.name}" has ${stock} unit(s) available at this branch.`,
              duration: 4000,
            });
            if (stock === 0) {
              api.notify("Inventory", "Out of Stock", "Out of Stock", `Out of stock: ${p.name}`,
                { severity: "error", entityType: "Product", entityId: p.id });
            }
            return;
          }
          setFlashSku(p.sku);
          setTimeout(() => setFlashSku(null), 600);
          setScanFlash(true);
          setTimeout(() => setScanFlash(false), 800);
          api.notify("Sales / Checkout", "Item Added to Cart", "Item Added to Cart", `Product added: ${p.name}`,
            { entityType: "Product", entityId: p.id });
        } else {
          toast.error(`Barcode "${code}" not found`, {
            description: "This product is not in inventory. Add it first via Inventory → Add Product.",
            duration: 4000,
          });
          api.notify("Sales / Checkout", "Product Not Found", "Product Not Found",
            `Product not found for scanned barcode "${code}"`, { severity: "warning" });
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

  // ─── Barcode-specific offers ──────────────────────────────────────────────────
  // An offer may be keyed to an exact barcode (Offer.triggerBarcode) rather than to every unit of
  // the trigger product — e.g. only the re-barcoded promo run of a SKU is on offer, not the regular
  // stock. Gated once here, at the source, so the bundle engine, the triggered-offer list and the
  // discount maths all agree instead of each re-deriving the rule. An offer whose barcode doesn't
  // match the product on file simply never fires.
  const activeOffers = useMemo(() => allActiveOffers.filter(o => {
    if (!o.triggerBarcode) return true;
    if (!o.triggerProductId) return false; // barcode named but no product to match it against
    return products.find(p => p.id === o.triggerProductId)?.barcode === o.triggerBarcode;
  }), [allActiveOffers, products]);

  // ─── Bundle / multi-buy engine (bogo, buy_a_get_b) ────────────────────────────
  // Trigger thresholds are always evaluated against `cart` (the cashier's actual scanned/paid
  // quantity) — never against a total that already includes a previous bonus — so re-running this
  // on every increment/decrement always recomputes the SAME bonus from the same baseline instead
  // of compounding. "buy 3 get 1 free": triggerQuantity=3, getQuantity=1, offerType="bogo"; when
  // getProductId is unset it defaults to the trigger product itself (same-SKU multi-buy).
  const bonusContributions: BonusContribution[] = useMemo(() => {
    const contributions: BonusContribution[] = [];
    for (const o of activeOffers) {
      if (o.offerType !== "bogo" && o.offerType !== "buy_a_get_b") continue;
      // Only offers naming a specific trigger product auto-add quantity — matches "Bundle
      // activates only for defined barcode/quantity". A blanket "buy 1 get 1 free on anything"
      // (no triggerProductId) has no defined barcode, so it stays a pure discount below
      // (offerDiscount) instead of inflating every cart line's displayed quantity.
      if (!o.triggerProductId) continue;

      const triggerItem = cart.find(i => i.productId === o.triggerProductId);
      if (!triggerItem) continue;
      const triggerQty = o.triggerQuantity ?? 1;
      const getQty = o.getQuantity ?? 1;
      const sets = Math.floor(triggerItem.qty / triggerQty);
      if (sets <= 0) continue;
      const getProductId = o.getProductId || o.triggerProductId;
      // BOGO is always fully free; buy_a_get_b pays offer.offerPrice per bonus unit (0 = free).
      const payPerUnit = o.offerType === "buy_a_get_b" ? (o.offerPrice ?? 0) : 0;
      contributions.push({ offerId: o.id, offerName: o.name, productId: getProductId, bonusQty: sets * getQty, payPerUnit });
    }
    return contributions;
  }, [cart, activeOffers]);

  // What's actually rung up: paid cart lines with their bonus merged into the displayed quantity,
  // plus a synthetic line for a bonus product that isn't otherwise in the cart (buy_a_get_b with a
  // different "get" product). This is what renders, what gets submitted at checkout, and what
  // inventory decrements against — bonus units physically leave the shelf too.
  const displayCart: DisplayCartItem[] = useMemo(() => {
    const bonusByProduct = new Map<string, number>();
    for (const c of bonusContributions) bonusByProduct.set(c.productId, (bonusByProduct.get(c.productId) ?? 0) + c.bonusQty);

    const result: DisplayCartItem[] = cart.map(c => {
      const bonusQty = bonusByProduct.get(c.productId) ?? 0;
      return { ...c, qty: c.qty + bonusQty, bonusQty, isBonusOnly: false };
    });

    const paidProductIds = new Set(cart.map(c => c.productId));
    for (const [productId, bonusQty] of bonusByProduct) {
      if (paidProductIds.has(productId) || bonusQty <= 0) continue;
      const prod = products.find(p => p.id === productId);
      if (!prod) continue;
      result.push({
        name: prod.name, sku: prod.sku, productId: prod.id,
        qty: bonusQty, price: effectivePrice(prod), stock: stockMap.get(prod.id) ?? 0,
        bonusQty, isBonusOnly: true,
      });
    }
    return result;
  }, [cart, bonusContributions, products, stockMap, effectivePrice]);

  // The retail value a bonus unit is being given away at — must be the same resolved price the
  // customer would otherwise have paid, or the bundle saving is computed against a price that
  // doesn't apply at this branch/tier.
  const bundleDiscount = bonusContributions.reduce((sum, c) => {
    const prod = products.find(p => p.id === c.productId);
    const retailPrice = (prod ? effectivePrice(prod) : undefined)
      ?? cart.find(i => i.productId === c.productId)?.price ?? 0;
    return sum + c.bonusQty * Math.max(0, retailPrice - c.payPerUnit);
  }, 0);

  // ─── Calculations ─────────────────────────────────────────────────────────────
  // Gross figures are computed off displayCart (paid + bonus units) since bonus units still leave
  // the shelf and are still subject to regulatory fees like tobacco excise — they're just then
  // fully (or partially) discounted back out via bundleDiscount below.
  const subtotal = displayCart.reduce((s, i) => s + i.qty * i.price, 0);
  const cartUnitCount = displayCart.reduce((s, i) => s + i.qty, 0);

  // KSA tobacco excise: min <tobaccoExciseMinimum> SAR OR <tobaccoExcisePercentage>% of base
  // price, whichever is higher — both configurable via the tobacco_excise TaxFeeRule row.
  function calcTobaccoFee(base: number): number {
    return Math.max(tobaccoExciseMinimum, base * tobaccoExcisePercentage / 100);
  }
  const tobaccoExcise = displayCart.reduce((sum, ci) => {
    const prod = products.find(p => p.id === ci.productId);
    if (!prod?.isTobacco || !tobaccoFeeEnabled) return sum;
    return sum + ci.qty * calcTobaccoFee(ci.price);
  }, 0);
  const couponDiscount = appliedCoupon
    ? appliedCoupon.type === "percentage"
      ? Math.min(subtotal * (appliedCoupon.value / 100), subtotal)
      : Math.min(appliedCoupon.value, subtotal)
    : 0;

  // Loyalty points redemption — mirrors couponDiscount's role in the taxable base below. The
  // server re-clamps to the customer's live balance/program caps at checkout (OrdersController),
  // so this is a client-side preview matching what the cashier sees, not the final source of truth.
  const maxRedeemablePoints = customer && loyaltyProgram
    ? (() => {
        const cap = Math.max(0, Math.min(
          customer.loyaltyBalance,
          loyaltyProgram.maxRedeemPctOfOrder != null && loyaltyProgram.redemptionValuePerPoint > 0
            ? Math.floor(subtotal * (loyaltyProgram.maxRedeemPctOfOrder / 100) / loyaltyProgram.redemptionValuePerPoint)
            : customer.loyaltyBalance
        ));
        // The server silently zeroes any redemption that falls under MinPointsToRedeem (it never
        // rejects an already-completed sale) — mirror that here so the cart's discount preview
        // never promises a redemption the order will actually apply as zero after charging.
        return cap < loyaltyProgram.minPointsToRedeem ? 0 : cap;
      })()
    : 0;
  const loyaltyDiscount = Math.min(redeemPoints, maxRedeemablePoints) * (loyaltyProgram?.redemptionValuePerPoint ?? 0);

  // Parse combo product IDs stored as JSON in itemsDescription
  function parseComboIds(desc?: string | null): string[] {
    if (!desc) return [];
    try { const d = JSON.parse(desc); return Array.isArray(d.products) ? d.products : []; } catch { return []; }
  }
  // Parse a discount's excluded-product list, stored as a plain JSON array of ids
  function parseIdList(json?: string | null): string[] {
    if (!json) return [];
    try { const d = JSON.parse(json); return Array.isArray(d) ? d : []; } catch { return []; }
  }

  // Manually-applied discounts only (never auto-applied — the cashier picks one from the
  // dropdown and clicks Apply, same as a coupon). "all"/"branch" apply across the whole basket
  // (minus any excluded products), "product" applies to that one product, "category" applies to
  // every cart line in that category (minus exclusions).
  function computeDiscountSaving(d: Discount): number {
    if (d.requiresCustomer && !customer) return 0; // customer detached after applying — don't charge for it
    const excludedIds = new Set(parseIdList(d.excludedProductIdsJson));
    if (d.appliesTo === "all" || d.appliesTo === "branch") {
      const eligibleSubtotal = displayCart.filter(ci => !excludedIds.has(ci.productId)).reduce((s, ci) => s + ci.qty * ci.price, 0);
      if (eligibleSubtotal <= 0) return 0;
      return d.discountType === "percentage" ? eligibleSubtotal * (d.value / 100) : Math.min(d.value, eligibleSubtotal);
    }
    if (d.appliesTo === "product" && d.productId && !excludedIds.has(d.productId)) {
      const item = displayCart.find(i => i.productId === d.productId);
      if (!item) return 0;
      return d.discountType === "percentage" ? item.qty * item.price * (d.value / 100) : Math.min(d.value * item.qty, item.qty * item.price);
    }
    if (d.appliesTo === "category" && d.categoryId) {
      const lines = displayCart.filter(ci => !excludedIds.has(ci.productId) && products.find(p => p.id === ci.productId)?.categoryId === d.categoryId);
      if (lines.length === 0) return 0;
      return lines.reduce((s, ci) => s + (d.discountType === "percentage" ? ci.qty * ci.price * (d.value / 100) : Math.min(d.value * ci.qty, ci.qty * ci.price)), 0);
    }
    return 0;
  }
  const discountSavings = appliedDiscounts.reduce((sum, d) => sum + computeDiscountSaving(d), 0);

  // What's left in the dropdown to pick from — active, in date range, branch-eligible, not
  // already applied, and (for requiresCustomer discounts) only once a customer is attached.
  const eligibleDiscounts = activeDiscounts.filter(d => {
    if (appliedDiscounts.some(a => a.id === d.id)) return false;
    const now = new Date();
    if (d.startDate && new Date(d.startDate) > now) return false;
    if (d.endDate && new Date(d.endDate) < now) return false;
    if (d.requiresCustomer && !customer) return false;
    if (d.appliesTo === "branch" && d.branchId && branch && d.branchId !== branch.id) return false;
    return true;
  });

  // Triggered offers — split into "discountable" (we can compute SAR savings) vs "notify only"
  const triggeredOffers = activeOffers.filter(o => {
    if (o.offerType === "bogo" || o.offerType === "buy_a_get_b") {
      // Trigger threshold is always checked against the paid (non-bonus) cart — see
      // bonusContributions above.
      if (!o.triggerProductId) return o.offerType === "bogo" && cart.length > 0; // blanket BOGO
      const trig = cart.find(i => i.productId === o.triggerProductId);
      return trig !== undefined && trig.qty >= (o.triggerQuantity ?? 1);
    }
    if (o.offerType === "product_offer") {
      return o.triggerProductId ? cart.some(i => i.productId === o.triggerProductId) : false;
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
    // Product-specific bogo / buy_a_get_b are handled entirely by bundleDiscount above (single
    // source of truth shared with displayCart's bonus quantities) — skip here to avoid
    // double-counting.
    if ((o.offerType === "bogo" || o.offerType === "buy_a_get_b") && o.triggerProductId) return sum;
    if (o.offerType === "bogo" && !o.triggerProductId) {
      // Blanket BOGO ("buy 1 get 1 free" on any product, no specific barcode) stays a pure
      // discount rather than an auto-add-quantity mechanic — see bonusContributions above.
      const triggerQty = o.triggerQuantity ?? 1;
      const getQty = o.getQuantity ?? 1;
      return sum + cart.reduce((s, ci) => {
        const sets = Math.floor(ci.qty / (triggerQty + getQty));
        return s + sets * getQty * ci.price;
      }, 0);
    }
    const item = o.triggerProductId ? cart.find(i => i.productId === o.triggerProductId) : null;
    if (o.offerType === "product_offer" && item) {
      if (o.discountPercentage) return sum + item.qty * item.price * (o.discountPercentage / 100);
      if (o.offerPrice != null) return sum + item.qty * Math.max(0, item.price - o.offerPrice);
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
  }, 0) + bundleDiscount;

  // Name is legacy — discountSavings is now manually-applied (see appliedDiscounts above),
  // only offerDiscount (BOGO/combo/etc.) still triggers automatically off cart contents.
  const totalAutoDiscount = discountSavings + offerDiscount;

  // Product-level discounts set in inventory (discount + discountType fields on Product)
  const productDiscountTotal = displayCart.reduce((sum, ci) => {
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
  // Named breakdown (one entry per configured charge) — sent to the server as-is so the Service
  // Charges report can show which charge(s) made up the order's customFeeAmount instead of just
  // an anonymous total.
  const serviceChargeRows = cart.length > 0 ? allOrderFees.map((f) => {
    const amount = f.customFeeAmount > 0 ? f.customFeeAmount
      : f.excisePercentage > 0 ? subtotal * f.excisePercentage / 100
      : f.vatPercentage > 0 ? subtotal * f.vatPercentage / 100
      : 0;
    return { taxFeeRuleId: f.id, name: f.ruleName, amount };
  }).filter((r) => r.amount > 0) : [];
  const customFeeTotal = serviceChargeRows.reduce((sum, r) => sum + r.amount, 0);

  const taxable = subtotal - couponDiscount - totalAutoDiscount - productDiscountTotal - loyaltyDiscount + tobaccoExcise;
  const vatAmount = Math.max(0, taxable) * taxRate;
  const total = Math.max(0, taxable) + vatAmount + customFeeTotal;

  // ─── Cart ops ─────────────────────────────────────────────────────────────────
  const updateQty = (sku: string, d: number) => {
    let blockedByStock = false;
    setCart((c) => c.map((i) => {
      if (i.sku !== sku) return i;
      const next = Math.max(1, i.qty + d);
      if (next > i.stock) { blockedByStock = true; return i; }
      // Re-price both ways: crossing up into a pack size unlocks the pack price, and dropping back
      // below it has to give that price up again — otherwise adding 12 then removing one would
      // leave 11 units permanently at the case rate.
      const prod = products.find((p) => p.id === i.productId);
      return { ...i, qty: next, price: prod ? priceForQty(prod, next) : i.price };
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
      api.notify("Expiry / Perishable", "Expired Item Scanned", "Expired Item Scanned",
        `This batch is expired and cannot be sold: ${p.name}`, { severity: "warning", entityType: "Product", entityId: p.id });
      return;
    }
    if (recalledProductIds.has(p.id)) {
      toast.error(`Cannot sell recalled item`, {
        description: `"${p.name}" is under an active recall and is blocked from sale.`,
        duration: 4000,
      });
      api.notify("Expiry / Perishable", "Recalled Item Scanned", "Recalled Item Scanned",
        `This product is under an active recall and cannot be sold: ${p.name}`,
        { severity: "error", entityType: "Product", entityId: p.id });
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
      if (stock === 0) {
        api.notify("Inventory", "Out of Stock", "Out of Stock", `Out of stock: ${p.name}`,
          { severity: "error", entityType: "Product", entityId: p.id });
      }
      return;
    }
    setCart((c) => {
      const ex = c.find((i) => i.sku === p.sku);
      // Re-price on quantity change — see priceForQty: a pack price unlocks at its pack size.
      if (ex) return c.map((i) => (i.sku === p.sku ? { ...i, qty: i.qty + 1, price: priceForQty(p, i.qty + 1) } : i));
      return [...c, { name: p.name, sku: p.sku, productId: p.id, qty: 1, price: priceForQty(p, 1), stock }];
    });
    setFlashSku(p.sku);
    setTimeout(() => setFlashSku(null), 600);
    setQuery("");
    setShowResults(false);
    searchRef.current?.focus();
    api.notify("Sales / Checkout", "Item Added to Cart", "Item Added to Cart", `Product added: ${p.name}`,
      { entityType: "Product", entityId: p.id });
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
        api.notify("Sales / Checkout", "Product Not Found", "Product Not Found",
          `Product not found for scanned barcode "${trimmed}"`, { severity: "warning" });
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
      setRedeemPoints(0);
      api.notify("Customer / Loyalty", "Customer Added", "Customer Added", "Customer attached successfully",
        { entityType: "Customer", entityId: c.id });
    } catch {
      setCustomer(null);
      setCustomerNotFound(true);
      setRedeemPoints(0);
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
      api.notify("Customer / Loyalty", "Customer Added", "Customer Added", "Customer attached successfully",
        { entityType: "Customer", entityId: c.id });
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
      api.notify("Discounts / Coupons", "Coupon Applied", "Coupon Applied", `Coupon applied: ${coupon.code}`,
        { entityType: "Coupon", entityId: coupon.id });
    } catch {
      setCouponError("Invalid or expired coupon");
      setAppliedCoupon(null);
      api.notify("Discounts / Coupons", "Invalid Coupon", "Invalid Coupon", "Coupon is invalid or expired",
        { severity: "warning" });
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
    const holdId = `HOLD-${String(16 + holds.length).padStart(3, "0")}`;
    setHolds((h) => [
      {
        id: holdId,
        items: cart,
        total,
        at: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      },
      ...h,
    ]);
    api.notify("Sales / Checkout", "Bill On Hold", "Bill On Hold", `Bill ${holdId} has been held`);
    resetSale();
  };

  const reopen = (id: string) => {
    const h = holds.find((x) => x.id === id);
    if (!h) return;
    setCart(h.items);
    setHolds((hs) => hs.filter((x) => x.id !== id));
    api.notify("Sales / Checkout", "Held Bill Recalled", "Held Bill Recalled", `Held bill ${id} recalled`);
  };

  const resetSale = () => {
    api.notify("Sales / Checkout", "New Sale Started", "New Sale Started", "New sale started");
    checkoutRequestIdRef.current = null;
    setCart([]);
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponError(null);
    setAppliedDiscounts([]);
    setDiscountPickerId("");
    setCustomer(null);
    setCustomerPhone("");
    setCustomerNotFound(false);
    setNewCustomerName("");
    setCreatingCustomer(false);
    setRedeemPoints(0);
  };

  // ─── Charge handler ────────────────────────────────────────────────────────────
  const handleCharge = async (
    paymentMethod: string,
    splitPayments?: Array<{ method: string; amount: number }>
  ) => {
    if (!branch) throw new Error("No branch configured");
    if (!cart.length) throw new Error("Cart is empty");
    // FR-SLS-05 (deliberate exception, not a gap): a shift's cash drawer is a
    // Cashier-only concept — the check-in flow (CheckInDialog) only ever lists
    // Cashier-role accounts, so Branch Manager/Supervisor structurally can't open
    // one. They can ring up a sale covering a register without checking in first;
    // the server records this override in the audit log since the resulting order
    // has no ShiftId to reconcile against (see OrdersController.Create).
    if (user?.role === "cashier" && !activeShift)
      throw new Error("No active shift found for you at this terminal. Please check in first.");

    const payments = splitPayments
      ? splitPayments
          .filter((p) => p.amount > 0)
          .map((p) => ({ paymentMethod: p.method, amount: p.amount, status: "completed" }))
      : [{ paymentMethod, amount: total, status: "completed" }];

    if (!checkoutRequestIdRef.current) checkoutRequestIdRef.current = uuid();

    const order: Order = await api.createOrder({
      source: "pos",
      branchId: branch.id,
      customerId: customer?.id,
      cashierId: activeShift?.cashierId ?? user?.id,
      subtotal,
      discountAmount: couponDiscount + totalAutoDiscount + productDiscountTotal + loyaltyDiscount,
      loyaltyPointsRedeemed: Math.min(redeemPoints, maxRedeemablePoints),
      loyaltyDiscountAmount: loyaltyDiscount,
      // Named breakdown of the manually-applied Discounts (see appliedDiscounts) — so Order
      // Details/receipts can show "Senior Citizen 5%" etc. by name instead of one anonymous total.
      discounts: appliedDiscounts.map((d) => ({ discountId: d.id, name: d.name, amount: computeDiscountSaving(d) })),
      // Named breakdown of customFeeAmount — which configured charge(s) made it up, so the
      // Service Charges report can show "Delivery Service Fee" etc. instead of one anonymous total.
      serviceCharges: serviceChargeRows.map((r) => ({ taxFeeRuleId: r.taxFeeRuleId, name: r.name, amount: r.amount })),
      // Kept distinct (previously lumped together as taxAmount) so the Tax and Fee reports,
      // which read these as two separate figures, don't see fees miscounted as VAT.
      taxAmount: vatAmount,
      customFeeAmount: customFeeTotal,
      tobaccoFeeAmount: tobaccoExcise,
      totalAmount: total,
      paymentStatus: "paid",
      orderStatus: "completed",
      // displayCart (not the raw paid cart) — bundle-bonus units physically leave the shelf too,
      // so they must be submitted as real line items for the server's stock decrement to be correct.
      items: displayCart.map((item) => {
        const prod = products.find((p) => p.id === item.productId);
        return {
          productId: item.productId,
          quantity: item.qty,
          unitPrice: item.price,
          totalPrice: item.qty * item.price,
          tobaccoFeeAmount: prod?.isTobacco && tobaccoFeeEnabled ? item.qty * calcTobaccoFee(item.price) : 0,
        };
      }),
      payments,
      clientRequestId: checkoutRequestIdRef.current,
    });

    // Sale confirmed — free the id so the next, genuinely new sale gets its own.
    checkoutRequestIdRef.current = null;

    api.notify("Payment", "Payment Successful", "Payment Successful", `Payment successful for Invoice ${order.orderNumber}`,
      { entityType: "Order", entityId: order.id });
    if (tobaccoExcise > 0) {
      api.notify("Tax / Fees / Tobacco", "Tobacco Excise Applied", "Tobacco Excise Applied", "Tobacco excise applied",
        { entityType: "Order", entityId: order.id });
    }
    if (customFeeTotal > 0) {
      api.notify("Tax / Fees / Tobacco", "Custom Fee Applied", "Custom Fee Applied", "Custom fee applied to item",
        { entityType: "Order", entityId: order.id });
    }
    if (triggeredOffers.length > 0) {
      api.notify("Discounts / Coupons", "Promotion Applied", "Promotion Applied",
        triggeredOffers.map(o => o.name).join(", "), { entityType: "Order", entityId: order.id });
    }

    // Snapshot invoice data before cart is cleared
    const invoiceData: InvoiceSnapshot = {
      orderNumber: order.orderNumber,
      createdAt: order.createdAt ?? new Date().toISOString(),
      items: [...displayCart],
      subtotal,
      discount: couponDiscount + totalAutoDiscount + productDiscountTotal + loyaltyDiscount,
      loyaltyPointsRedeemed: Math.min(redeemPoints, maxRedeemablePoints) || undefined,
      loyaltyDiscountAmount: loyaltyDiscount || undefined,
      vat: vatAmount,
      total,
      taxLabel,
      branchName: sellerName || branch.name,
      vatNumber,
      crNumber: crNumber || undefined,
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
    const usbPrinter = getUsbPrinter();

    const doPrint = mode === "qz"
      ? (usbPrinter
          ? qzPrintReceiptUsb(invoice, usbPrinter).then(() => ({ message: `Receipt sent to ${usbPrinter.label}.` }))
          : qzPrintReceipt(invoice, printerName).then(() => ({ message: `Receipt sent to ${printerName ?? "printer"}.` })))
      : api.printReceipt({ ...invoice, printerName });

    doPrint
      .then((res) => toast.success(res.message, { id: printId }))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Print failed";
        if (isPrinterNotSetUp(msg)) { toast.dismiss(printId); return; }
        toast.error(`Print failed: ${msg}`, { id: printId, duration: 6000 });
        notifyPrintFailure(msg);
      });
  }, [invOpen, invoice]);

  return (
    <PageShell
      title="POS Checkout"
      subtitle={`${branch?.name ?? "Loading…"} · ${activeShift ? `Cashier: ${activeShift.cashier?.fullName ?? "Active shift"}` : "No active shift"}`}
      actions={
        <>
          <BranchFilter branches={branches} value={branchId} onChange={setBranchId} locked={!!lockedBranchId} />
          <PrinterSetupDialog />
        </>
      }
    >
      {loadError && <LoadErrorBanner onRetry={loadCore} />}
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
                        <SARIcon />{effectivePrice(p).toFixed(2)}
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
                  {cartUnitCount} units
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

            {displayCart.length === 0 ? (
              <div className="text-center py-14 px-6">
                <ScanBarcode className="h-10 w-10 mx-auto text-muted-foreground/50" />
                <p className="text-sm font-medium mt-3">Ready to scan</p>
                <p className="text-xs text-muted-foreground mt-1">Scan a barcode or type to search.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {displayCart.map((item, idx) => (
                  <div
                    key={item.sku}
                    className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${flashSku === item.sku ? "bg-primary/10" : "hover:bg-muted/30"}`}
                  >
                    <span className="text-xs text-muted-foreground tabular-nums w-6 text-right">{idx + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate flex items-center gap-1.5">
                        {item.name}
                        {item.bonusQty > 0 && (
                          <span className="inline-flex items-center rounded-full bg-success/10 text-success text-[10px] font-semibold px-1.5 py-0.5">
                            +{item.bonusQty} free
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground">SKU {item.sku} · <SARIcon />{item.price.toFixed(2)}</p>
                    </div>
                    {item.isBonusOnly ? (
                      <span className="text-xs font-semibold text-success px-2">Auto-added</span>
                    ) : (
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
                    )}
                    <span className="text-sm font-semibold tabular-nums w-20 text-right">
                      <SARIcon />{(item.qty * item.price).toFixed(2)}
                    </span>
                    {!item.isBonusOnly && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(item.sku)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ─── Paused Orders ────────────────────────────────────────────────── */}
          {holds.length > 0 && (
            <Card ref={pausedOrdersRef} className="border-border/60 shadow-card overflow-hidden">
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
            {displayCart.length === 0 ? (
              <p className="text-center py-3 text-muted-foreground">Scan or search a product to start a sale.</p>
            ) : (
              <ul className="space-y-1">
                {displayCart.map((i) => (
                  <li key={i.sku} className="flex justify-between">
                    <span className="truncate pr-2">
                      {i.qty} × {i.name}
                      {i.bonusQty > 0 && <span className="text-success text-xs ml-1">(+{i.bonusQty} free)</span>}
                    </span>
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
                <button onClick={() => { setCustomer(null); setCustomerPhone(""); setCustomerNotFound(false); setNewCustomerName(""); setRedeemPoints(0); }} className="text-muted-foreground hover:text-destructive">
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

            {/* Loyalty points redemption */}
            {customer && loyaltyProgram?.isActive && customer.loyaltyBalance >= loyaltyProgram.minPointsToRedeem && (
              <div className="rounded-lg border border-border/60 px-3 py-2 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Redeem points — balance {customer.loyaltyBalance.toLocaleString()} pts</span>
                  <button
                    className="text-primary font-medium hover:underline"
                    onClick={() => setRedeemPoints(maxRedeemablePoints)}
                  >
                    Max ({maxRedeemablePoints.toLocaleString()})
                  </button>
                </div>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={0}
                    max={maxRedeemablePoints}
                    value={redeemPoints || ""}
                    onChange={(e) => {
                      const v = Math.floor(Number(e.target.value) || 0);
                      setRedeemPoints(Math.max(0, Math.min(v, maxRedeemablePoints)));
                    }}
                    placeholder="0"
                    className="h-8 text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    = − <SARIcon />{loyaltyDiscount.toFixed(2)}
                  </span>
                  {redeemPoints > 0 && (
                    <button onClick={() => setRedeemPoints(0)} className="text-muted-foreground hover:text-destructive shrink-0">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
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
            ) : isRestrictedCashier && !posPerms.cashierCanCoupon ? null : (
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

            {/* Discounts — manually picked and applied by the cashier, never auto-applied */}
            {appliedDiscounts.map(d => (
              <div key={d.id} className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2">
                <Tag className="h-4 w-4 text-success shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{d.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {d.discountType === "percentage" ? `${d.value}% off` : `SAR ${d.value} off`}
                    {" — "}saves <SARIcon />{computeDiscountSaving(d).toFixed(2)}
                  </p>
                </div>
                <button
                  onClick={() => setAppliedDiscounts(list => list.filter(x => x.id !== d.id))}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {eligibleDiscounts.length > 0 && (
              <div className="flex gap-1.5">
                <Select value={discountPickerId} onValueChange={setDiscountPickerId}>
                  <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Select a discount…" /></SelectTrigger>
                  <SelectContent>
                    {eligibleDiscounts.map(d => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name} ({d.discountType === "percentage" ? `${d.value}%` : `SAR ${d.value}`})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm" variant="outline" className="h-8 px-2 text-xs"
                  disabled={!discountPickerId}
                  onClick={() => {
                    const d = activeDiscounts.find(x => x.id === discountPickerId);
                    if (d) setAppliedDiscounts(list => [...list, d]);
                    setDiscountPickerId("");
                  }}
                >
                  Apply
                </Button>
              </div>
            )}
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
            {loyaltyDiscount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Loyalty Redeemed ({Math.min(redeemPoints, maxRedeemablePoints).toLocaleString()} pts)</span>
                <span className="tabular-nums text-success">− <SARIcon />{loyaltyDiscount.toFixed(2)}</span>
              </div>
            )}
            {displayCart.map((ci) => {
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
            {appliedDiscounts.map(d => {
              const saving = computeDiscountSaving(d);
              return (
                <div key={d.id} className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground truncate max-w-[150px]">{d.name}</span>
                  <span className="flex items-center gap-1.5">
                    <span className="tabular-nums text-success">− <SARIcon />{saving.toFixed(2)}</span>
                    <button
                      onClick={() => setAppliedDiscounts(list => list.filter(x => x.id !== d.id))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                </div>
              );
            })}
            {bonusContributions.map(c => {
              const prod = products.find(p => p.id === c.productId);
              // Resolved price, so the displayed saving matches the bundleDiscount actually applied.
              const saving = c.bonusQty * Math.max(0, (prod ? effectivePrice(prod) : 0) - c.payPerUnit);
              if (saving <= 0) return null;
              return (
                <div key={c.offerId} className="flex justify-between text-sm">
                  <span className="text-muted-foreground truncate max-w-[150px]">{c.offerName} (+{c.bonusQty} {prod?.name ?? "free"})</span>
                  <span className="tabular-nums text-success">− <SARIcon />{saving.toFixed(2)}</span>
                </div>
              );
            })}
            {triggeredOffers.map(o => {
              // Product-specific bogo/buy_a_get_b already shown via bonusContributions above.
              if ((o.offerType === "bogo" || o.offerType === "buy_a_get_b") && o.triggerProductId) return null;
              const item = o.triggerProductId ? cart.find(i => i.productId === o.triggerProductId) : null;
              let saving = 0;

              if (o.offerType === "bogo" && !o.triggerProductId) {
                const triggerQty = o.triggerQuantity ?? 1;
                const getQty = o.getQuantity ?? 1;
                saving = cart.reduce((s, ci) => {
                  const sets = Math.floor(ci.qty / (triggerQty + getQty));
                  return s + sets * getQty * ci.price;
                }, 0);
              } else if (o.offerType === "product_offer" && item) {
                saving = o.discountPercentage
                  ? item.qty * item.price * (o.discountPercentage / 100)
                  : item.qty * Math.max(0, item.price - (o.offerPrice ?? 0));
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
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={hold}
                disabled={cart.length === 0 || (isRestrictedCashier && !posPerms.cashierCanHoldOrder)}
              >
                <Pause className="h-3 w-3" />Hold
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={() => pausedOrdersRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
                disabled={holds.length === 0}
              >
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
            {appliedDiscounts.map((d) => (
              <Row key={d.id} k={d.name} v={<>−<SARIcon />{computeDiscountSaving(d).toFixed(2)}</>} />
            ))}
            {loyaltyDiscount > 0 && <Row k="Loyalty Redeemed" v={<>−{Math.min(redeemPoints, maxRedeemablePoints)} pts (−<SARIcon />{loyaltyDiscount.toFixed(2)})</>} />}
            <div className="pt-2 border-t">
              {displayCart.map((i) => (
                <div key={i.sku} className="flex justify-between text-xs py-1">
                  <span>{i.qty} × {i.name}{i.bonusQty > 0 && <span className="text-success"> (+{i.bonusQty} free)</span>}</span>
                  <span className="tabular-nums"><SARIcon />{(i.qty * i.price).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="pt-2 border-t space-y-1.5">
              <Row k="Subtotal" v={<><SARIcon />{subtotal.toFixed(2)}</>} />
              <Row k="VAT 15%" v={<><SARIcon />{vatAmount.toFixed(2)}</>} />
              {tobaccoExcise > 0 && <Row k="Tobacco Excise" v={<><SARIcon />{tobaccoExcise.toFixed(2)}</>} />}
              {customFeeTotal > 0 && <Row k="Service Charge" v={<><SARIcon />{customFeeTotal.toFixed(2)}</>} />}
              <div className="flex justify-between pt-1.5 border-t font-semibold text-base">
                <span>Total</span>
                <span><SARIcon />{total.toFixed(2)}</span>
              </div>
            </div>
          </div>
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
                  {invoice.crNumber && <p className="text-muted-foreground">CR {invoice.crNumber}</p>}
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
                  {/* Net of coupon/auto/manual discounts, but NOT loyalty — that's broken out as
                      its own line below so the customer can see it, same as the checkout summary. */}
                  <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{(invoice.subtotal - (invoice.discount - (invoice.loyaltyDiscountAmount ?? 0))).toFixed(2)}</span></div>
                  {!!invoice.loyaltyPointsRedeemed && (
                    <div className="flex justify-between">
                      <span>Loyalty Redeemed ({invoice.loyaltyPointsRedeemed} pts)</span>
                      <span className="tabular-nums">-{(invoice.loyaltyDiscountAmount ?? 0).toFixed(2)}</span>
                    </div>
                  )}
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
                const usbPrinter = getUsbPrinter();
                const printId = toast.loading("Printing receipt…");
                const doPrint = mode === "qz"
                  ? (usbPrinter
                      ? qzPrintReceiptUsb(invoice, usbPrinter).then(() => ({ message: `Receipt sent to ${usbPrinter.label}.` }))
                      : qzPrintReceipt(invoice, printerName).then(() => ({ message: `Receipt sent to ${printerName ?? "printer"}.` })))
                  : api.printReceipt({ ...invoice, printerName });
                doPrint
                  .then((res) => toast.success(res.message, { id: printId }))
                  .catch((err: unknown) => {
                    const msg = err instanceof Error ? err.message : "Print failed";
                    if (isPrinterNotSetUp(msg)) { toast.dismiss(printId); return; }
                    toast.error(`Print failed: ${msg}`, { id: printId, duration: 6000 });
                    notifyPrintFailure(msg);
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
            return [...c, { name: product.name, sku: product.sku, productId: product.id, qty: 1, price: effectivePrice(product), stock: newStock }];
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
      if (tab === "cash") {
        api.notify("Payment", "Cash Payment Completed", "Cash Payment Completed",
          `Cash received. Change: SAR ${change.toFixed(2)}`);
      }
      setTimeout(onDone, 800);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Payment failed. Please try again.";
      setErrorMsg(msg);
      setStatus("failed");
      api.notify("Payment", "Payment Failed", "Payment Failed", msg, { severity: "error" });
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
