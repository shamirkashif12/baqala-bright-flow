import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import {
  Loader2, ShoppingCart, Plus, Minus, Search, Store, CheckCircle2, ArrowLeft, Trash2, MapPin,
  User, Phone, Mail, StickyNote, PackageCheck, AlertCircle, CircleCheck, Banknote, CreditCard,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { api, type OnlineOrderCatalog, type OnlineOrderCatalogProduct, type OnlineOrderQuote } from "@/lib/api";
import { SARIcon } from "@/lib/currency";
import { AddressMapPicker } from "@/components/address-map-picker";
import { ProductImageSlider } from "@/components/product-image-slider";
import { useI18n } from "@/lib/i18n";
import { LanguageSwitcher } from "@/components/language-switcher";

// Public, unauthenticated — reachable via the per-branch QR code (see the "Online Ordering QR"
// panel on /branches). Lives outside the _app.* route prefix, so it skips RouteGuard/token check
// entirely, same as /loyalty/$branchId.
export const Route = createFileRoute("/order/$branchId")({ ssr: false, component: PublicOrderPage });

type Step = "browse" | "checkout" | "confirmation";
type Cart = Record<string, number>;

// Thrown out of the Pay Online flow when the shopper pressed Cancel while the invoice was still
// being created — handlePlaceOrder treats it as "nothing happened", not as an error to display.
class PaymentCancelledError extends Error {
  constructor() { super("Payment cancelled."); this.name = "PaymentCancelledError"; }
}

// MyFatoorah took the payment but the server couldn't create the order (item ran out, price
// moved…). Staff are notified server-side; the shopper must NOT pay again — handlePlaceOrder
// turns this into a clear message carrying the invoice number they can quote.
class PaymentReceivedNoOrderError extends Error {
  constructor(public readonly invoiceId: number, public readonly problem: string | null) {
    super("Payment received but the order could not be created."); this.name = "PaymentReceivedNoOrderError";
  }
}

// Mirrors OnlineOrdersController.PlacePublicOrder's own re-validation exactly — this is a fully
// anonymous endpoint, so the server never trusts these either, but matching the rules here means
// a form that passes client-side always succeeds server-side too, instead of surprising the buyer
// at the very last step.
function isValidPhone(phone: string): boolean {
  return phone.replace(/\D/g, "").length >= 8;
}
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

interface FormErrors {
  fullName?: string;
  phone?: string;
  email?: string;
  addressLine?: string;
}

function validate(fullName: string, phone: string, email: string, addressLine: string): FormErrors {
  const errors: FormErrors = {};
  if (fullName.trim().length < 2) errors.fullName = "Enter your full name.";
  if (!isValidPhone(phone)) errors.phone = "Enter a valid phone number (at least 8 digits).";
  if (email.trim() && !isValidEmail(email)) errors.email = "Enter a valid email address, or leave it blank.";
  if (addressLine.trim().length < 8) errors.addressLine = "Add a more detailed address (building, street, area).";
  return errors;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs text-destructive flex items-center gap-1 mt-1">
      <AlertCircle className="h-3 w-3 shrink-0" /> {message}
    </p>
  );
}

function PriceTag({ original, price, size = "sm" }: { original: number; price: number; size?: "sm" | "lg" }) {
  const discounted = original - price > 0.005;
  return (
    <span className={`flex items-baseline gap-1.5 ${size === "lg" ? "text-base" : "text-sm"}`}>
      {discounted && (
        <span className="text-muted-foreground line-through text-xs tabular-nums"><SARIcon />{original.toFixed(2)}</span>
      )}
      <span className={`font-bold tabular-nums ${discounted ? "text-destructive" : "text-primary"}`}><SARIcon />{price.toFixed(2)}</span>
    </span>
  );
}

// Shared between the cart drawer and the checkout step's order summary — both need the same
// real, server-computed breakdown (product discount/offers/tobacco/custom fees/VAT), never a
// client-side estimate, since none of that pricing logic is safe to duplicate in the browser.
function QuoteBreakdown({
  quote, quoteLoading, cartItems, products, cartTotal, t, showItems = true,
}: {
  quote: OnlineOrderQuote | null; quoteLoading: boolean;
  cartItems: Array<{ product: OnlineOrderCatalogProduct; qty: number }>;
  products: OnlineOrderCatalogProduct[]; cartTotal: number;
  t: (key: string) => string;
  // The cart drawer already lists each line (with image + qty stepper) above this component, so
  // it skips the per-item rows here and shows only the fee/tax breakdown + total.
  showItems?: boolean;
}) {
  if (quoteLoading && !quote) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calculating total…
      </div>
    );
  }
  if (!quote) {
    return (
      <>
        {showItems && cartItems.map(i => (
          <div key={i.product.productId} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{i.qty} × {i.product.name}</span>
            <span className="tabular-nums"><SARIcon />{(i.qty * i.product.unitPrice).toFixed(2)}</span>
          </div>
        ))}
        <div className="flex justify-between text-sm font-bold pt-2 border-t">
          <span>{t("Estimated total")}</span>
          <span className="tabular-nums text-primary"><SARIcon />{cartTotal.toFixed(2)}</span>
        </div>
      </>
    );
  }
  return (
    <>
      {showItems && quote.items.map((i, idx) => {
        const product = products.find(p => p.productId === i.productId);
        return (
          <div key={`${i.productId}-${idx}`} className="flex justify-between text-sm gap-2">
            <span className="text-muted-foreground min-w-0 truncate">
              {i.quantity} × {product?.name ?? i.productId}
              {i.isBonus && <Badge variant="outline" className="ml-1.5 text-[9px] align-middle">{i.offerName ?? "Free"}</Badge>}
            </span>
            <span className="tabular-nums shrink-0">
              {i.originalUnitPrice > i.unitPrice && (
                <span className="line-through text-muted-foreground mr-1 text-xs"><SARIcon />{(i.originalUnitPrice * i.quantity).toFixed(2)}</span>
              )}
              <SARIcon />{i.totalPrice.toFixed(2)}
            </span>
          </div>
        );
      })}
      <div className={`flex justify-between text-sm ${showItems ? "pt-2 border-t" : ""}`}>
        <span className="text-muted-foreground">Subtotal</span>
        <span className="tabular-nums"><SARIcon />{quote.subtotal.toFixed(2)}</span>
      </div>
      {quote.tobaccoFeeAmount > 0 && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t("Tobacco excise fee")}</span>
          <span className="tabular-nums"><SARIcon />{quote.tobaccoFeeAmount.toFixed(2)}</span>
        </div>
      )}
      {quote.customFees.map(f => (
        <div key={f.name} className="flex justify-between text-sm">
          <span className="text-muted-foreground">{f.name}</span>
          <span className="tabular-nums"><SARIcon />{f.amount.toFixed(2)}</span>
        </div>
      ))}
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">VAT</span>
        <span className="tabular-nums"><SARIcon />{quote.taxAmount.toFixed(2)}</span>
      </div>
      {/* Delivery is always shown, including at 0.00 — "Free delivery" is a thing the shopper
          should see stated, and a silently absent row reads as "not decided yet". Hidden only
          when the address is undeliverable, where the banner below says so instead. */}
      {quote.isServiceable && (
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {t("Delivery")}
            {quote.deliveryFeeName && (
              <span className="text-[10px] text-muted-foreground/70 ms-1">({quote.deliveryFeeName})</span>
            )}
          </span>
          {quote.deliveryFee > 0 ? (
            <span className="tabular-nums"><SARIcon />{quote.deliveryFee.toFixed(2)}</span>
          ) : (
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              {quote.deliveryFeeWaived ? t("Free delivery") : t("Free")}
            </span>
          )}
        </div>
      )}
      <div className="flex justify-between text-sm font-bold pt-2 border-t">
        <span>{t("Estimated total")}</span>
        <span className="tabular-nums text-primary"><SARIcon />{quote.totalAmount.toFixed(2)}</span>
      </div>
      {/* The pin fell in an area this branch doesn't deliver to. Surfaced here rather than only on
          submit: the shopper is standing at the map and can move it, which is not true once
          they've hit Place order and been bounced. */}
      {!quote.isServiceable && (
        <p className="text-xs text-destructive flex items-start gap-1.5 pt-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          {quote.unserviceableMessage ?? t("This branch doesn't deliver to the selected location.")}
        </p>
      )}
    </>
  );
}

function PublicOrderPage() {
  const { branchId } = Route.useParams();
  const { t } = useI18n();
  const [catalog, setCatalog] = useState<OnlineOrderCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [notAvailable, setNotAvailable] = useState(false);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [cart, setCart] = useState<Cart>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [step, setStep] = useState<Step>("browse");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [addressTouched, setAddressTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [touched, setTouched] = useState<Record<keyof FormErrors, boolean>>({
    fullName: false, phone: false, email: false, addressLine: false,
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ orderNumber: string; totalAmount: number; paymentMethod: "cash" | "myfatoorah" } | null>(null);

  // "cash" (Cash on Delivery) or "myfatoorah" (Pay Online) — only offered when the branch has
  // enabled MyFatoorah (catalog.onlinePaymentEnabled). See handlePlaceOrder for how the latter
  // creates a MyFatoorah invoice, shows it as a QR/popup, and polls before ever placing the order.
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "myfatoorah">("cash");
  const [payPhase, setPayPhase] = useState<"form" | "paying">("form");
  const [payInvoiceUrl, setPayInvoiceUrl] = useState<string | null>(null);
  const [payPopupBlocked, setPayPopupBlocked] = useState(false);
  const payPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Bumped on every Pay Online attempt and on Cancel. An attempt whose id no longer matches is
  // stale — its in-flight invoice request must not open a popup, start polling, or place an
  // order. Without this, Cancel only hid the panel: the earlier attempt kept running in the
  // background and could still auto-place the order once its (old) invoice got paid.
  const payAttemptRef = useRef(0);
  // Rejects the current attempt's "waiting for payment" promise so handlePlaceOrder unwinds
  // (through PaymentCancelledError) instead of hanging on an await that would never settle.
  const payCancelRef = useRef<(() => void) | null>(null);
  const stopPayPolling = () => {
    if (payPollRef.current) clearInterval(payPollRef.current);
    payPollRef.current = null;
  };
  const cancelOnlinePayment = () => {
    payAttemptRef.current += 1;
    stopPayPolling();
    payCancelRef.current?.();
    payCancelRef.current = null;
    setPayInvoiceUrl(null);
    setPayPopupBlocked(false);
    setPayPhase("form");
  };
  useEffect(() => () => { payAttemptRef.current += 1; stopPayPolling(); }, []);

  const [quote, setQuote] = useState<OnlineOrderQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.getOnlineOrderCatalog(branchId)
      .then(setCatalog)
      .catch(() => setNotAvailable(true))
      .finally(() => setLoading(false));
  }, [branchId]);

  const products = catalog?.products ?? [];
  const categories = useMemo(
    () => Array.from(new Set(products.map(p => p.categoryName).filter((c): c is string => !!c))),
    [products],
  );
  const filtered = useMemo(() => products.filter(p => {
    if (category && p.categoryName !== category) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [products, category, search]);

  const cartItems = useMemo(
    () => Object.entries(cart)
      .filter(([, qty]) => qty > 0)
      .map(([productId, qty]) => ({ product: products.find(p => p.productId === productId), qty }))
      .filter((e): e is { product: OnlineOrderCatalogProduct; qty: number } => !!e.product),
    [cart, products],
  );
  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0);
  const cartTotal = cartItems.reduce((s, i) => s + i.qty * i.product.unitPrice, 0);

  // Real server-computed totals (product discount/offers/tobacco/custom fees/VAT/delivery — none
  // of which is safe to duplicate client-side) — fetched whenever the cart drawer is open or the
  // shopper is on the checkout step, and refreshed whenever the cart's actual contents change (not
  // just quantity tweaks that don't change composition, thanks to the signature below) or the
  // delivery pin moves, since the fee depends on where the order is going.
  const cartSignature = useMemo(
    () => cartItems.map(i => `${i.product.productId}:${i.qty}`).sort().join(","),
    [cartItems],
  );
  useEffect(() => {
    if ((!cartOpen && step !== "checkout") || cartItems.length === 0) { setQuote(null); return; }
    setQuoteLoading(true);
    api.quoteOnlineOrder(
      branchId,
      cartItems.map(i => ({ productId: i.product.productId, quantity: i.qty })),
      { latitude, longitude },
    )
      .then(setQuote)
      .catch(() => setQuote(null))
      .finally(() => setQuoteLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartOpen, step, cartSignature, latitude, longitude]);

  const setQty = (product: OnlineOrderCatalogProduct, qty: number) => {
    if (qty > product.available) {
      toast.error(
        product.available > 0
          ? `Only ${product.available} of '${product.name}' ${t("left")} in stock.`
          : `'${product.name}' is out of stock.`,
      );
    }
    const clamped = Math.max(0, Math.min(qty, product.available));
    setCart(prev => ({ ...prev, [product.productId]: clamped }));
  };

  const handleLocationChange = (lat: number, lng: number, resolvedAddress: string | null) => {
    setLatitude(lat);
    setLongitude(lng);
    // Never overwrite an address the visitor already typed themselves — only auto-fill while
    // the field is still empty/untouched, mirroring the loyalty page's "don't clobber user input"
    // posture.
    if (resolvedAddress && !addressTouched) setAddressLine(resolvedAddress);
  };

  const canCheckout = cartCount > 0;
  const errors = validate(fullName, phone, email, addressLine);
  const hasErrors = Object.keys(errors).length > 0;

  const markTouched = (field: keyof FormErrors) => setTouched(prev => ({ ...prev, [field]: true }));

  // What the server needs to create the order — the same payload for cash and card. For card it
  // is sent UP FRONT with the invoice request, so the server holds everything it needs to create
  // the order the moment MyFatoorah reports the payment, with or without this tab still open.
  const buildCheckoutPayload = () => ({
    items: cartItems.map(i => ({ productId: i.product.productId, quantity: i.qty })),
    fullName: fullName.trim(),
    phone: phone.trim(),
    email: email.trim() || undefined,
    addressLine: addressLine.trim(),
    latitude, longitude,
    notes: notes.trim() || undefined,
  });

  // Card payment: asks the server for a MyFatoorah invoice for this checkout, opens MyFatoorah's
  // hosted page in the popup (it sends X-Frame-Options: SAMEORIGIN, so it can't be embedded) and
  // polls until the server says the invoice is paid — at which point the server has ALREADY
  // created the order and hands back its number. The QR code stays visible as a fallback for a
  // blocked popup or a shopper who'd rather use their phone.
  //
  // `popup` is opened by the caller synchronously inside the click handler (see handlePlaceOrder)
  // and only pointed at the invoice here — browsers allow window.open during a user gesture but
  // block one that happens after an await, which is what used to trip the popup blocker.
  const runOnlineCardPayment = async (popup: Window | null): Promise<{ orderNumber: string; totalAmount: number }> => {
    const attempt = ++payAttemptRef.current;
    // Fresh attempt, fresh state: never show a previous attempt's invoice link/QR while this
    // one's invoice is still being created (that stale link is what got "re-opened" before).
    setPayInvoiceUrl(null);
    setPayPopupBlocked(!popup);

    let invoiceId: number, invoiceUrl: string;
    try {
      ({ invoiceId, invoiceUrl } = await api.initiateOnlineCardPayment(branchId, buildCheckoutPayload()));
    } catch (e) {
      popup?.close();
      throw e;
    }
    if (attempt !== payAttemptRef.current) {
      // Cancelled while the invoice was being created — leave it unpaid, do nothing with it.
      popup?.close();
      throw new PaymentCancelledError();
    }
    setPayInvoiceUrl(invoiceUrl);
    if (popup && !popup.closed) popup.location.href = invoiceUrl;
    else setPayPopupBlocked(true);

    return new Promise((resolve, reject) => {
      payCancelRef.current = () => reject(new PaymentCancelledError());
      const startedAt = Date.now();
      payPollRef.current = setInterval(async () => {
        // Don't poll forever: MyFatoorah invoices stay payable for days, but a shopper who has
        // walked away shouldn't leave this tab hammering the status endpoint. After 20 minutes
        // stop and explain — a payment made later still becomes an order server-side.
        if (Date.now() - startedAt > 20 * 60_000) {
          stopPayPolling();
          reject(new Error(t("We stopped waiting for the payment. If you already paid, don't pay again — your order will still be created and the store will contact you. Otherwise, place the order again.")));
          return;
        }
        try {
          const s = await api.getOnlineCardPaymentStatus(branchId, invoiceId);
          if (attempt !== payAttemptRef.current) { stopPayPolling(); return; }
          if (s.status === "paid") {
            stopPayPolling();
            if (s.orderNumber) {
              resolve({ orderNumber: s.orderNumber, totalAmount: s.totalAmount ?? (quote?.totalAmount ?? cartTotal) });
            } else {
              // Money taken, order not created (e.g. an item ran out in the meantime). The store
              // has been notified and will either place it by hand or refund — say so plainly,
              // with the invoice number the shopper can quote.
              reject(new PaymentReceivedNoOrderError(invoiceId, s.problem ?? null));
            }
          } else if (s.status === "failed") {
            stopPayPolling();
            reject(new Error("Payment expired or was cancelled."));
          }
        } catch {
          // Transient network hiccup — keep polling rather than failing on one blip.
        }
      }, 3000);
    });
  };

  const handlePlaceOrder = async () => {
    setTouched({ fullName: true, phone: true, email: true, addressLine: true });
    if (hasErrors) return;
    // The server refuses an undeliverable address anyway — stopping here just keeps the reason on
    // screen next to the map the shopper needs to fix, instead of as a submit error.
    if (quote && !quote.isServiceable) {
      setError(quote.unserviceableMessage ?? "This branch doesn't deliver to the selected location.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let result: { orderNumber: string; totalAmount: number };
      if (paymentMethod === "myfatoorah") {
        // Open the payment window NOW, inside the click, while the browser still treats it as a
        // user gesture — it gets pointed at the invoice once the server has created it. A
        // reused window name means a second attempt navigates the same window instead of piling
        // up popups.
        const popup = window.open("", "myfatoorah-payment", "width=480,height=760");
        setPayPhase("paying");
        result = await runOnlineCardPayment(popup);
      } else {
        result = await api.placeOnlineOrder(branchId, { ...buildCheckoutPayload(), paymentMethod: "cash" });
      }
      setConfirmation({ ...result, paymentMethod });
      setStep("confirmation");
      setCart({});
      // Leave nothing of this payment behind for the shopper's next order on this page.
      stopPayPolling();
      setPayPhase("form");
      setPayInvoiceUrl(null);
      setPayPopupBlocked(false);
    } catch (e: unknown) {
      stopPayPolling();
      setPayPhase("form");
      setPayInvoiceUrl(null);
      if (e instanceof PaymentReceivedNoOrderError) {
        setError(
          `${t("We received your payment")} (${t("ref.")} ${e.invoiceId})${e.problem ? ` — ${e.problem}` : ""}. ` +
          t("The store has been notified and will confirm your order or refund you shortly. Please don't pay again."),
        );
      } else if (!(e instanceof PaymentCancelledError)) {
        setError(e instanceof Error ? e.message : "Couldn't place your order — please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-3xl w-full px-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border/60 p-3 space-y-2 animate-pulse">
              <div className="aspect-square rounded-lg bg-muted" />
              <div className="h-3 w-3/4 bg-muted rounded" />
              <div className="h-3 w-1/2 bg-muted rounded" />
              <div className="h-8 w-full bg-muted rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (notAvailable || !catalog) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="p-8 text-center max-w-sm">
          <Store className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="font-semibold">{t("Online ordering isn't available for this branch.")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("Please check with the store for the correct link.")}</p>
        </Card>
      </div>
    );
  }

  if (step === "confirmation" && confirmation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="p-8 text-center max-w-sm space-y-4 shadow-elegant">
          {catalog.logoDataUrl && (
            <img src={catalog.logoDataUrl} alt="" className="h-12 mx-auto object-contain" />
          )}
          <div className="h-16 w-16 rounded-full mx-auto flex items-center justify-center bg-green-100 dark:bg-green-500/10">
            <CheckCircle2 className="h-9 w-9 text-green-600" />
          </div>
          <div>
            <p className="font-bold text-lg">{t("Order placed!")}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {t("Your order is awaiting confirmation from")} <span className="font-medium text-foreground">{catalog.branchName}</span>.
            </p>
          </div>
          <div className="rounded-xl bg-muted/50 p-4 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("Order number")}</span>
              <span className="font-mono font-semibold">{confirmation.orderNumber}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("Estimated total")}</span>
              <span className="font-semibold tabular-nums"><SARIcon />{confirmation.totalAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("Payment")}</span>
              <span className="font-medium">
                {confirmation.paymentMethod === "myfatoorah" ? t("Paid online") : t("Cash on Delivery")}
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => { setStep("browse"); setConfirmation(null); }}
          >
            {t("Place another order")}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border/60 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {step === "checkout" && (
              <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setStep("browse")}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <div className="h-9 w-9 rounded-lg gradient-primary flex items-center justify-center shrink-0 overflow-hidden">
              {catalog.logoDataUrl ? (
                <img src={catalog.logoDataUrl} alt="" className="h-full w-full object-contain bg-background" />
              ) : (
                <Store className="h-4.5 w-4.5 text-primary-foreground" />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-semibold truncate leading-tight">{catalog.branchName}</p>
              <p className="text-xs text-muted-foreground">{step === "checkout" ? t("Delivery details") : t("Order online")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <LanguageSwitcher />
            {step === "browse" && (
              <Button variant="outline" className="gap-2 relative" onClick={() => setCartOpen(true)}>
                <ShoppingCart className="h-4 w-4" />
                {cartCount > 0 && (
                  <Badge className="px-1.5 gradient-primary text-primary-foreground border-0">{cartCount}</Badge>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4">
        {step === "browse" && (
          <>
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("Search products…")} className="h-10 pl-8" />
              </div>
            </div>
            {categories.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-2 mb-1 -mx-4 px-4">
                <Badge
                  variant={category === null ? "default" : "outline"}
                  className={`cursor-pointer shrink-0 ${category === null ? "gradient-primary text-primary-foreground border-0" : ""}`}
                  onClick={() => setCategory(null)}
                >
                  All
                </Badge>
                {categories.map(c => (
                  <Badge
                    key={c}
                    variant={category === c ? "default" : "outline"}
                    className={`cursor-pointer shrink-0 ${category === c ? "gradient-primary text-primary-foreground border-0" : ""}`}
                    onClick={() => setCategory(c)}
                  >
                    {c}
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mb-3">{filtered.length} product{filtered.length === 1 ? "" : "s"}</p>

            {filtered.length === 0 ? (
              <div className="text-center py-16">
                <Search className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">{t("No products match your search.")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {filtered.map(p => {
                  const qty = cart[p.productId] ?? 0;
                  const outOfStock = p.available <= 0;
                  return (
                    <Card
                      key={p.productId}
                      className={`p-3 flex flex-col gap-2 border-border/60 shadow-card hover:shadow-elegant transition-shadow ${outOfStock ? "opacity-60" : ""}`}
                    >
                      <div className="relative aspect-square rounded-lg overflow-hidden">
                        <ProductImageSlider images={p.images} name={p.name} categoryName={p.categoryName} className="h-full w-full rounded-lg" />
                        <div className="absolute top-1.5 left-1.5 right-1.5 flex items-start justify-between gap-1 pointer-events-none">
                          {p.categoryName && (
                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-background/85 backdrop-blur text-muted-foreground">
                              {p.categoryName}
                            </span>
                          )}
                          {p.offerBadge && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-destructive text-destructive-foreground shadow-sm">
                              {p.offerBadge}
                            </span>
                          )}
                        </div>
                        {outOfStock && (
                          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
                            <Badge variant="outline" className="text-[10px] text-destructive border-destructive/40 bg-background">{t("Out of stock")}</Badge>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate leading-tight">{p.name}</p>
                        {p.nameAr && <p className="text-xs text-muted-foreground truncate" dir="rtl">{p.nameAr}</p>}
                        {p.description && <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{p.description}</p>}
                      </div>
                      <div className="flex items-center justify-between mt-auto">
                        <PriceTag original={p.originalPrice} price={p.unitPrice} />
                        <span className="text-[10px] text-muted-foreground">{p.unitOfMeasure}</span>
                      </div>
                      {!outOfStock && (
                        <p className="text-[10px] text-green-600 flex items-center gap-1 -mt-1">
                          <CircleCheck className="h-2.5 w-2.5" /> {t("In Stock")} · {p.available} {t("left")}
                        </p>
                      )}
                      {!outOfStock && (
                        qty === 0 ? (
                          <Button size="sm" className="h-8 gradient-primary text-primary-foreground border-0" onClick={() => setQty(p, 1)}>Add</Button>
                        ) : (
                          <div className="flex items-center justify-between gap-1 rounded-md border border-border/60 p-0.5">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setQty(p, qty - 1)}>
                              <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <span className="text-sm font-semibold tabular-nums">{qty}</span>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setQty(p, qty + 1)} disabled={qty >= p.available}>
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {step === "checkout" && (
          <div className="space-y-4 max-w-md mx-auto">
          {payPhase === "paying" ? (
            <Card className="p-6 space-y-4 border-border/60 shadow-card text-center">
              <p className="text-sm font-semibold">{t("Complete your payment")}</p>
              {payInvoiceUrl ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    {t("A payment window opened for")} <SARIcon />{(quote?.totalAmount ?? cartTotal).toFixed(2)} — {t("or scan this QR code with your phone.")}
                  </p>
                  {payPopupBlocked && (
                    <p className="text-xs text-destructive">
                      {t("Your browser blocked the payment popup — use the link or QR code below.")}
                    </p>
                  )}
                  <div className="flex flex-col items-center gap-2">
                    <QRCodeSVG value={payInvoiceUrl} size={160} level="M" />
                    <a href={payInvoiceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                      {t("Open payment link")}
                    </a>
                  </div>
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("Waiting for payment…")}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-6">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("Creating your payment link…")}
                </div>
              )}
              <Button
                variant="outline"
                className="w-full"
                onClick={() => { cancelOnlinePayment(); setSubmitting(false); }}
              >
                {t("Cancel")}
              </Button>
            </Card>
          ) : (
          <>
            <Card className="p-4 space-y-3 border-border/60 shadow-card">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("Your details")}</p>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><User className="h-3 w-3" /> {t("Full name")}</Label>
                <Input
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  onBlur={() => markTouched("fullName")}
                  className={`h-10 ${touched.fullName && errors.fullName ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  placeholder="e.g. Ahmad Al-Faisal"
                />
                {touched.fullName && <FieldError message={errors.fullName} />}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> {t("Phone number")}</Label>
                <Input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  onBlur={() => markTouched("phone")}
                  type="tel"
                  inputMode="tel"
                  className={`h-10 ${touched.phone && errors.phone ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  placeholder="05XXXXXXXX"
                />
                {touched.phone && <FieldError message={errors.phone} />}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><Mail className="h-3 w-3" /> {t("Email (optional)")}</Label>
                <Input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onBlur={() => markTouched("email")}
                  type="email"
                  className={`h-10 ${touched.email && errors.email ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  placeholder="you@example.com"
                />
                {touched.email && <FieldError message={errors.email} />}
              </div>
            </Card>

            <Card className="p-4 space-y-3 border-border/60 shadow-card">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("Delivery address")}</p>
              <AddressMapPicker latitude={latitude} longitude={longitude} onLocationChange={handleLocationChange} />
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3" /> {t("Detailed address")}</Label>
                <Textarea
                  value={addressLine}
                  onChange={e => { setAddressLine(e.target.value); setAddressTouched(true); }}
                  onBlur={() => markTouched("addressLine")}
                  placeholder={t("Building, street, area, landmark…")}
                  className={`min-h-16 ${touched.addressLine && errors.addressLine ? "border-destructive focus-visible:ring-destructive" : ""}`}
                />
                {touched.addressLine && <FieldError message={errors.addressLine} />}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1"><StickyNote className="h-3 w-3" /> {t("Notes (optional)")}</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t("Delivery instructions…")} className="min-h-12" />
              </div>
            </Card>

            {catalog.onlinePaymentEnabled && (
              <Card className="p-4 space-y-2 border-border/60 shadow-card">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("Payment method")}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={paymentMethod === "cash" ? "default" : "outline"}
                    className={paymentMethod === "cash" ? "gradient-primary text-primary-foreground border-0" : ""}
                    onClick={() => setPaymentMethod("cash")}
                  >
                    <Banknote className="h-3.5 w-3.5 mr-1.5" /> {t("Cash on Delivery")}
                  </Button>
                  <Button
                    type="button"
                    variant={paymentMethod === "myfatoorah" ? "default" : "outline"}
                    className={paymentMethod === "myfatoorah" ? "gradient-primary text-primary-foreground border-0" : ""}
                    onClick={() => setPaymentMethod("myfatoorah")}
                  >
                    <CreditCard className="h-3.5 w-3.5 mr-1.5" /> {t("Pay Online")}
                  </Button>
                </div>
              </Card>
            )}

            <Card className="p-4 space-y-2 border-border/60 shadow-card">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <PackageCheck className="h-3.5 w-3.5" /> {t("Order summary")}
              </p>
              <QuoteBreakdown quote={quote} quoteLoading={quoteLoading} cartItems={cartItems} products={products} cartTotal={cartTotal} t={t} />
              <p className="text-[11px] text-muted-foreground">
                {paymentMethod === "myfatoorah"
                  ? t("Payment: Pay online now via MyFatoorah (Apple Pay, Google Pay, mada, or card).")
                  : t("Payment: Cash on Delivery. Final total is confirmed by the store.")}
              </p>
            </Card>

            {error && (
              <p className="text-sm text-destructive flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 shrink-0" /> {error}
              </p>
            )}
            <Button
              className="w-full h-11 gradient-primary text-primary-foreground border-0"
              disabled={submitting || (!!quote && !quote.isServiceable)}
              onClick={handlePlaceOrder}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("Place order")}
            </Button>
            {hasErrors && Object.values(touched).some(Boolean) && (
              <p className="text-xs text-muted-foreground text-center">{t("Fix the highlighted fields above to continue.")}</p>
            )}
          </>
          )}
          </div>
        )}
      </div>

      {/* Cart drawer */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2"><ShoppingCart className="h-4 w-4" /> {t("Your cart")}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto space-y-3 py-2">
            {cartItems.length === 0 ? (
              <div className="text-center py-16">
                <ShoppingCart className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">{t("Your cart is empty.")}</p>
              </div>
            ) : cartItems.map(i => (
              <div key={i.product.productId} className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg overflow-hidden shrink-0">
                  <ProductImageSlider images={i.product.images.slice(0, 1)} name={i.product.name} categoryName={i.product.categoryName} className="h-full w-full rounded-lg" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{i.product.name}</p>
                  <PriceTag original={i.product.originalPrice} price={i.product.unitPrice} />
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(i.product, i.qty - 1)}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-6 text-center text-sm tabular-nums">{i.qty}</span>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(i.product, i.qty + 1)} disabled={i.qty >= i.product.available}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setQty(i.product, 0)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          {cartItems.length > 0 && (
            <div className="space-y-1.5 border-t border-border/60 pt-3 px-0.5">
              <QuoteBreakdown quote={quote} quoteLoading={quoteLoading} cartItems={cartItems} products={products} cartTotal={cartTotal} t={t} showItems={false} />
            </div>
          )}
          <SheetFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full gradient-primary text-primary-foreground border-0"
              disabled={!canCheckout}
              onClick={() => { setCartOpen(false); setStep("checkout"); }}
            >
              {t("Checkout")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Floating cart bar (mobile-friendly quick access) */}
      {step === "browse" && cartCount > 0 && (
        <div className="fixed bottom-4 left-0 right-0 px-4">
          <div className="max-w-3xl mx-auto">
            <Button className="w-full h-12 shadow-lg gap-2 gradient-primary text-primary-foreground border-0" onClick={() => setCartOpen(true)}>
              <ShoppingCart className="h-4 w-4" />
              {t("View cart")} ({cartCount}) — <SARIcon />{cartTotal.toFixed(2)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
