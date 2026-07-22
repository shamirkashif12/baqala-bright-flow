import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Minus, Plus, RotateCcw, ScanBarcode, ShoppingCart, Tag, Trash2, X, QrCode, User, Loader2, Gift,
} from "lucide-react";
import { useCart } from "../lib/cart";
import { useSession } from "../lib/session";
import { useIdleTimeout } from "../lib/idle-timeout";
import { ApiError, createCustomer, createOrder, getCustomerByPhone, validateCoupon, type Product } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../components/ui/dialog";
import { SARIcon } from "../lib/currency";
import { PaymentDialog } from "../components/PaymentDialog";
import { InvoiceDialog, getZatcaQr, printInvoice, type InvoiceSnapshot } from "../components/InvoiceDialog";
import { CompleteDialog } from "../components/CompleteDialog";
import { PrinterSetupDialog } from "../components/PrinterSetup";

export default function ScanScreen() {
  const navigate = useNavigate();
  const cart = useCart();
  const { branchId, branchName, sellerName, vatNumber } = useSession();
  const [query, setQuery] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [message, setMessage] = useState<{ text: string; tone: "error" | "info" } | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceSnapshot | null>(null);
  const [doneOpen, setDoneOpen] = useState(false);
  const [newOrderConfirmOpen, setNewOrderConfirmOpen] = useState(false);
  const scanInputRef = useRef<HTMLInputElement>(null);
  const autoPrintRef = useRef(false);

  // Customer lookup (optional, matches the staff POS's own phone-lookup panel)
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerNotFound, setCustomerNotFound] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);

  // Kept in a ref so the global scanner listener below can stay mounted once for the life of
  // this screen instead of re-subscribing on every keystroke/cart change — the exact bug
  // already fixed once in useIdleTimeout.
  const cartRef = useRef(cart);
  cartRef.current = cart;

  useIdleTimeout(() => {
    if (payOpen || invOpen || doneOpen) return;
    cart.clear();
    navigate("/", { replace: true });
  }, 90_000);

  function addProductToCart(product: Product) {
    if (!product.allowSelfCheckout || product.status !== "active") {
      setMessage({ text: `"${product.name}" needs an attendant — please ask for help.`, tone: "error" });
      return;
    }
    cartRef.current.addProduct(product);
    setMessage(null);
    setQuery("");
  }

  // Scan-only: exact barcode/SKU match, same as the global scanner listener below. No
  // free-text/name search — self-checkout only accepts what a hardware scanner emits.
  function handleScan(e: FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    const byBarcode = cart.products.find((p) => p.barcode === trimmed);
    if (byBarcode) return addProductToCart(byBarcode);
    const bySku = cart.products.find((p) => p.sku === trimmed);
    if (bySku) return addProductToCart(bySku);
    setMessage({ text: `Barcode "${trimmed}" not found.`, tone: "error" });
    setQuery("");
  }

  // Global USB barcode scanner listener — works anywhere on this page, not only while the
  // search box happens to be focused, since a customer may have tapped elsewhere (a qty
  // button, the cart list) right before scanning the next item. Mounted once; all mutable
  // state is read through refs so it never needs to re-subscribe (see useIdleTimeout's
  // docstring for why that matters for input responsiveness).
  useEffect(() => {
    const scanBuf = { current: "" };
    const lastKeyAt = { current: 0 };
    let scanTimer: ReturnType<typeof setTimeout> | null = null;

    function handler(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el === scanInputRef.current) return; // the input's own form handles this
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;

      if (e.key === "Enter") {
        const code = scanBuf.current.trim();
        scanBuf.current = "";
        if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }
        if (!code) return;
        const list = cartRef.current.products;
        const product = list.find((p) => p.barcode === code) ?? list.find((p) => p.sku === code);
        if (product) addProductToCart(product);
        else setMessage({ text: `Barcode "${code}" not found.`, tone: "error" });
        return;
      }

      if (e.key.length !== 1) return; // skip Shift, Ctrl, arrow keys, etc.
      const now = Date.now();
      if (now - lastKeyAt.current > 200) scanBuf.current = ""; // reset on a human-speed gap
      lastKeyAt.current = now;
      scanBuf.current += e.key;
      if (scanTimer) clearTimeout(scanTimer);
      scanTimer = setTimeout(() => { scanBuf.current = ""; }, 500);
    }

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  async function handleApplyCoupon(e: FormEvent) {
    e.preventDefault();
    const code = couponCode.trim();
    if (!code) return;
    try {
      const coupon = await validateCoupon(code.toUpperCase());
      cart.applyCoupon(coupon);
      setMessage({ text: "Coupon applied.", tone: "info" });
    } catch {
      setMessage({ text: "That coupon code is invalid or expired.", tone: "error" });
    }
  }

  async function lookupCustomer() {
    if (!customerPhone.trim()) return;
    setCustomerLoading(true);
    setCustomerNotFound(false);
    try {
      const c = await getCustomerByPhone(customerPhone.trim());
      cart.setCustomer(c);
    } catch {
      cart.setCustomer(null);
      setCustomerNotFound(true);
    } finally {
      setCustomerLoading(false);
    }
  }

  async function createNewCustomer() {
    if (!newCustomerName.trim() || !customerPhone.trim()) return;
    setCreatingCustomer(true);
    try {
      const c = await createCustomer({ fullName: newCustomerName.trim(), phone: customerPhone.trim() });
      cart.setCustomer(c);
      setCustomerNotFound(false);
      setNewCustomerName("");
      setMessage(null);
    } catch (err) {
      setMessage({
        text: err instanceof ApiError ? err.message : "Couldn't save this customer — please try again.",
        tone: "error",
      });
    } finally {
      setCreatingCustomer(false);
    }
  }

  function removeCustomer() {
    cart.setCustomer(null);
    setCustomerPhone("");
    setCustomerNotFound(false);
    setNewCustomerName("");
  }

  async function handleCharge() {
    const order = await createOrder({
      branchId: branchId ?? "",
      customerId: cart.customer?.id,
      subtotal: cart.subtotal,
      discountAmount: cart.totalDiscount,
      taxAmount: cart.taxAmount,
      customFeeAmount: cart.customFeeTotal,
      tobaccoFeeAmount: cart.tobaccoExcise,
      totalAmount: cart.totalAmount,
      paymentStatus: "paid",
      orderStatus: "completed",
      couponId: cart.coupon?.id,
      items: cart.displayLines.map((l) => ({
        productId: l.product.id,
        quantity: l.quantity,
        unitPrice: l.product.basePrice,
        totalPrice: l.product.basePrice * l.quantity,
        tobaccoFeeAmount: l.tobaccoFeeAmount,
      })),
      serviceCharges: cart.feeRows.map((r) => ({ taxFeeRuleId: r.key, name: r.label, amount: r.amount })),
      payments: [{ paymentMethod: "card", amount: cart.totalAmount, status: "completed" }],
    });

    setInvoice({
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      items: cart.displayLines.map((l) => ({ product: l.product, quantity: l.quantity })),
      subtotal: cart.subtotal,
      discount: cart.totalDiscount,
      tobaccoExcise: cart.tobaccoExcise,
      vat: cart.taxAmount,
      total: cart.totalAmount,
      taxLabel: cart.taxLabel,
      branchName: branchName ?? "",
      vatNumber: vatNumber ?? "",
      sellerName: sellerName || branchName || "",
      zatcaQrCode: order.zatcaQrCode,
    });
  }

  function onPaymentDone() {
    autoPrintRef.current = true;
    setPayOpen(false);
    setInvOpen(true);
    cart.clear();
    removeCustomer();
  }

  // Once the receipt has actually printed, move straight to the thank-you screen instead
  // of leaving the raw tax-invoice dialog up — same behavior whether it printed via the
  // auto-print below or the dialog's manual "Print" button (e.g. a retry after a failure).
  function onReceiptPrinted() {
    setInvOpen(false);
    setDoneOpen(true);
  }

  // Auto-print once the invoice is up, mirroring the staff POS's auto-print behavior.
  // Runs in an effect rather than during render — a render-phase network/toast call
  // isn't safe under StrictMode's throwaway double-render.
  useEffect(() => {
    if (invOpen && invoice && autoPrintRef.current) {
      autoPrintRef.current = false;
      printInvoice(invoice, getZatcaQr(invoice), onReceiptPrinted);
    }
  }, [invOpen, invoice]);

  function startNewOrder() {
    setInvOpen(false);
    setDoneOpen(false);
    setInvoice(null);
    navigate("/", { replace: true });
  }

  // Manual reset for a customer who scanned items and walked away without paying — clears
  // the cart plus every bit of local UI state (coupon input, phone lookup, banner) and puts
  // the scanner focus back so the next shopper can start scanning immediately. Stays on this
  // screen rather than bouncing to Welcome — that's an extra tap this lane doesn't need
  // between customers, unlike the idle-timeout reset which is meant to send it there.
  function abandonOrder() {
    cart.clear();
    removeCustomer();
    setCouponCode("");
    setQuery("");
    setMessage(null);
    setNewOrderConfirmOpen(false);
    scanInputRef.current?.focus();
  }

  return (
    <div className="h-full overflow-y-auto bg-muted/30 p-3 sm:p-4 md:p-6 pb-44 md:pb-6">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="font-display text-lg sm:text-xl font-bold truncate">Self-Checkout</h1>
          <p className="text-xs text-muted-foreground truncate">{branchName ?? "—"}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {cart.lines.length > 0 && (
            <Button
              variant="outline"
              className="h-10 gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setNewOrderConfirmOpen(true)}
            >
              <RotateCcw className="h-4 w-4" /> New Order
            </Button>
          )}
          <PrinterSetupDialog />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_320px] lg:grid-cols-[1fr_420px] gap-4">
        {/* ─── Left: scanner + cart ─────────────────────────────────────── */}
        <div className="space-y-4">
          <Card className="p-3 sm:p-4 border-border/60 shadow-card">
            <form onSubmit={handleScan} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <ScanBarcode className="h-5 w-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={scanInputRef}
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Scan barcode…"
                  className="pl-10 h-12 sm:h-14 text-base bg-background shadow-none border-border/70"
                />
              </div>
              <Button type="submit" size="lg" className="h-12 sm:h-14 gap-2 gradient-primary text-primary-foreground border-0 shadow-glow shrink-0">
                <ScanBarcode className="h-5 w-5" /> Scan
              </Button>
            </form>

            {message && (
              <p className={`mt-2 text-sm px-1 font-medium ${message.tone === "error" ? "text-destructive" : "text-success"}`}>
                {message.text}
              </p>
            )}

            {cart.luckyDraws.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded px-2 py-1.5">
                <Gift className="h-3.5 w-3.5" />
                {cart.luckyDraws.map((o) => o.name).join(", ")} — eligible for a prize draw! Ask an attendant.
              </div>
            )}
          </Card>

          <Card className="border-border/60 shadow-card">
            <div className="flex items-center justify-between p-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Scanned Items</p>
                <Badge variant="outline" className="text-[10px]">
                  {cart.displayLines.reduce((s, l) => s + l.quantity, 0)} units
                </Badge>
              </div>
            </div>

            {cart.displayLines.length === 0 ? (
              <div className="text-center py-14 px-6">
                <ScanBarcode className="h-10 w-10 mx-auto text-muted-foreground/50" />
                <p className="text-sm font-medium mt-3">Ready to scan</p>
                <p className="text-xs text-muted-foreground mt-1">Scan a barcode to add it to your order.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {cart.displayLines.map((line, idx) => (
                  <div key={line.product.id} className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 py-2.5 hover:bg-muted/30">
                    <span className="hidden sm:inline text-xs text-muted-foreground tabular-nums w-6 text-right shrink-0">{idx + 1}.</span>
                    <div className="flex-1 min-w-[10rem]">
                      <p className="text-sm font-medium truncate flex items-center gap-1.5">
                        {line.product.name}
                        {line.bonusQty > 0 && (
                          <span className="inline-flex items-center rounded-full bg-success/10 text-success text-[10px] font-semibold px-1.5 py-0.5 shrink-0">
                            +{line.bonusQty} free
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        SKU {line.product.sku} · <SARIcon />{line.product.basePrice.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto">
                      {line.isBonusOnly ? (
                        <span className="text-xs font-semibold text-success px-2">Auto-added</span>
                      ) : (
                        <div className="flex items-center gap-1 bg-muted rounded-lg">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => cart.updateQuantity(line.product.id, line.quantity - line.bonusQty - 1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-6 text-center text-sm font-semibold tabular-nums">{line.quantity}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => cart.updateQuantity(line.product.id, line.quantity - line.bonusQty + 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                      <span className="text-sm font-semibold tabular-nums w-16 sm:w-20 text-right">
                        <SARIcon />{(line.quantity * line.product.basePrice).toFixed(2)}
                      </span>
                      {!line.isBonusOnly && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => cart.removeLine(line.product.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

        </div>

        {/* ─── Right: order panel ──────────────────────────────────────── */}
        <Card className="border-border/60 shadow-elegant flex flex-col md:h-[calc(100vh-2rem)] md:sticky md:top-4 overflow-hidden">
          <div className="p-4 border-b border-border/60">
            <h3 className="font-semibold">Your Order</h3>
            <p className="text-xs text-muted-foreground">
              {cart.displayLines.reduce((s, l) => s + l.quantity, 0)} unit(s) · {cart.customer ? cart.customer.fullName : "Walk-in"} · {branchName ?? "—"}
            </p>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="p-3 text-sm text-muted-foreground border-b border-border/60">
              {cart.displayLines.length === 0 ? (
                <p className="text-center py-3">Scan a product to start your order.</p>
              ) : (
                <ul className="space-y-1">
                  {cart.displayLines.map((l) => (
                    <li key={l.product.id} className="flex justify-between">
                      <span className="truncate pr-2">
                        {l.quantity} × {l.product.name}
                        {l.bonusQty > 0 && <span className="text-success text-xs ml-1">(+{l.bonusQty} free)</span>}
                      </span>
                      <span className="tabular-nums text-foreground"><SARIcon />{(l.quantity * l.product.basePrice).toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Customer lookup (optional) */}
            <div className="px-4 py-3 border-b border-border/60 space-y-3">
              {cart.customer ? (
                <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2">
                  <User className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{cart.customer.fullName}</p>
                    <p className="text-[10px] text-muted-foreground">{cart.customer.phone}</p>
                  </div>
                  <button onClick={removeCustomer} className="text-muted-foreground hover:text-destructive">
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
                      onClick={createNewCustomer} disabled={creatingCustomer || !newCustomerName.trim() || !customerPhone.trim()}>
                      {creatingCustomer ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => setCustomerNotFound(false)}>
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
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && lookupCustomer()}
                      placeholder="Phone number (optional)…"
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={lookupCustomer} disabled={customerLoading || !customerPhone.trim()}>
                    {customerLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Find"}
                  </Button>
                </div>
              )}
            </div>

            {/* Coupon */}
            <div className="px-4 py-3 border-b border-border/60">
              {cart.coupon ? (
                <div className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2">
                  <Tag className="h-4 w-4 text-success shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">{cart.coupon.code}</p>
                    <p className="text-[10px] text-muted-foreground">saves <SARIcon />{cart.couponDiscount.toFixed(2)}</p>
                  </div>
                  <button onClick={cart.removeCoupon} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <form onSubmit={handleApplyCoupon} className="flex gap-1.5">
                  <div className="relative flex-1">
                    <Tag className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      placeholder="Coupon code…"
                      className="h-8 pl-8 text-xs uppercase"
                    />
                  </div>
                  <Button type="submit" size="sm" variant="outline" className="h-8 px-2 text-xs">Apply</Button>
                </form>
              )}
            </div>

            {/* Line-item breakdown: subtotal · discounts · fees · tax */}
            <div className="px-4 pt-2 pb-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="tabular-nums"><SARIcon />{cart.subtotal.toFixed(2)}</span>
              </div>
              {cart.couponDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Coupon ({cart.coupon?.code})</span>
                  <span className="tabular-nums text-success">− <SARIcon />{cart.couponDiscount.toFixed(2)}</span>
                </div>
              )}
              {cart.productDiscountRows.map((r) => (
                <div key={r.key} className="flex items-start justify-between gap-2 text-sm">
                  <span className="text-muted-foreground flex items-start gap-1 min-w-0">
                    <Tag className="h-3 w-3 shrink-0 mt-0.5" /> <span>{r.label}</span>
                  </span>
                  <span className="tabular-nums text-success shrink-0">− <SARIcon />{r.amount.toFixed(2)}</span>
                </div>
              ))}
              {cart.discountRows.map((r) => (
                <div key={r.key} className="flex items-start justify-between gap-2 text-sm">
                  <span className="text-muted-foreground min-w-0">{r.label}</span>
                  <span className="tabular-nums text-success shrink-0">− <SARIcon />{r.amount.toFixed(2)}</span>
                </div>
              ))}
              {cart.bundleRows.map((r) => (
                <div key={r.key} className="flex items-start justify-between gap-2 text-sm">
                  <span className="text-muted-foreground min-w-0">{r.label}</span>
                  <span className="tabular-nums text-success shrink-0">− <SARIcon />{r.amount.toFixed(2)}</span>
                </div>
              ))}
              {cart.offerRows.map((r) => (
                <div key={r.key} className="flex items-start justify-between gap-2 text-sm">
                  <span className="text-muted-foreground min-w-0">{r.label}</span>
                  <span className="tabular-nums text-success shrink-0">− <SARIcon />{r.amount.toFixed(2)}</span>
                </div>
              ))}
              {cart.feeRows.map((r) => (
                <div key={r.key} className="flex items-start justify-between gap-2 text-sm">
                  <span className="text-muted-foreground min-w-0">{r.label}</span>
                  <span className="tabular-nums shrink-0"><SARIcon />{r.amount.toFixed(2)}</span>
                </div>
              ))}
              {cart.tobaccoExcise > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tobacco Excise</span>
                  <span className="tabular-nums text-amber-600">+ <SARIcon />{cart.tobaccoExcise.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{cart.taxLabel}</span>
                <span className="tabular-nums"><SARIcon />{cart.taxAmount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Below md this detaches into a bar fixed to the bottom of the viewport, so Total +
              Charge stay reachable without scrolling past a long cart — matching the standard
              mobile-commerce "sticky checkout bar" pattern. Above md it's just the card's own
              footer, in normal flow. */}
          <div className="fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border/60 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] p-3 md:static md:inset-auto md:z-auto md:shadow-none md:p-0 md:shrink-0">
            <div className="flex justify-between items-baseline md:px-4 md:py-2 md:border-t md:border-border/60">
              <span className="font-semibold">Total</span>
              <span className="text-2xl font-bold text-primary tabular-nums"><SARIcon />{cart.totalAmount.toFixed(2)}</span>
            </div>

            <div className="mt-2 md:mt-0 md:px-4 md:pb-2">
              <Button
                className="w-full h-12 md:h-11 text-base gradient-primary text-primary-foreground border-0 shadow-glow"
                disabled={cart.lines.length === 0}
                onClick={() => setPayOpen(true)}
              >
                Charge <SARIcon />{cart.totalAmount.toFixed(2)}
              </Button>
            </div>
          </div>

          <div className="hidden md:flex px-3 py-1.5 border-t border-success/20 bg-success/5 text-success shrink-0 items-center gap-2 text-xs">
            <QrCode className="h-3.5 w-3.5 shrink-0" /> ZATCA QR will be embedded on receipt
          </div>
        </Card>
      </div>

      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} total={cart.totalAmount} onCharge={handleCharge} onDone={onPaymentDone} />
      <InvoiceDialog open={invOpen} onOpenChange={setInvOpen} invoice={invoice} onNewOrder={startNewOrder} onPrinted={onReceiptPrinted} />
      <CompleteDialog open={doneOpen} onNewOrder={startNewOrder} />

      <Dialog open={newOrderConfirmOpen} onOpenChange={setNewOrderConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Start a new order?</DialogTitle>
            <DialogDescription>
              This clears every scanned item, the coupon, and the customer for this order — use it when a shopper has left without paying.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOrderConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={abandonOrder}>Start New Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
