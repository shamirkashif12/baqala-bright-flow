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
  Search, ScanBarcode, Pause, RotateCcw, Printer, MessageSquare,
  Plus, Minus, Trash2, CreditCard, Banknote, Wallet, Split,
  Info, CheckCircle2, Loader2, ShoppingCart, Tag, User, X, Package, QrCode, Camera, CameraOff,
} from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { QRCodeSVG } from "qrcode.react";
import { api, type Product, type Coupon, type Customer, type CashierShift, type Order, type Offer, type Discount, type TaxFeeRule } from "@/lib/api";
import { useBranch } from "@/lib/branch-context";
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

// ─── Print invoice in a new window ────────────────────────────────────────────
function printInvoice(contentId: string) {
  const el = document.getElementById(contentId);
  if (!el) return;
  const win = window.open("", "_blank", "width=400,height=700");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>Tax Invoice</title>
    <style>
      body{font-family:monospace;font-size:12px;padding:16px;color:#000;background:#fff}
      .center{text-align:center} .bold{font-weight:bold} .row{display:flex;justify-content:space-between;margin:2px 0}
      .dashed{border-top:1px dashed #000;margin:6px 0;padding-top:6px}
      .discount{color:#16a34a} .total{font-weight:bold;font-size:14px}
      img,svg{display:block;margin:8px auto}
    </style></head><body>${el.innerHTML}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 300);
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
};

function POS() {
  // ─── Branch from global context ───────────────────────────────────────────────
  const { selectedBranch: branch } = useBranch();

  // ─── Data ─────────────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([]);
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());
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
  const [cameraOpen, setCameraOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const zxingRef = useRef<{ stop: () => void } | null>(null);

  // Refs so the global scanner listener always sees fresh values without re-registering
  const productsRef = useRef<Product[]>([]);
  const stockMapRef = useRef<Map<string, number>>(new Map());
  const scanBuf = useRef("");
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKeyAt = useRef(0);

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

  // ─── Holds ────────────────────────────────────────────────────────────────────
  const [holds, setHolds] = useState<{ id: string; items: CartItem[]; total: number; at: string }[]>([]);

  // ─── Dialogs ──────────────────────────────────────────────────────────────────
  const [orderOpen, setOrderOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);

  // ─── Invoice snapshot (preserved after cart is cleared) ───────────────────────
  const [invoice, setInvoice] = useState<InvoiceSnapshot | null>(null);

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

        const shift = shifts.find((s) => s.status === "open") ?? null;
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
  }, []);

  // ─── Reload stock & ZATCA settings whenever selected branch changes ────────────
  useEffect(() => {
    if (!branch) return;
    api
      .getStock({ branchId: branch.id })
      .then((stocks) => {
        const map = new Map<string, number>();
        stocks.forEach((s) => map.set(s.productId, Math.max(0, s.quantity - (s.reservedQuantity ?? 0))));
        setStockMap(map);
      })
      .catch(() => {});

    api.getZatcaSettings(branch.id)
      .then((z) => {
        if (z.vatRegistrationNumber) setVatNumber(z.vatRegistrationNumber);
        if (z.sellerName) setSellerName(z.sellerName);
      })
      .catch(() => {});
  }, [branch]);

  // Keep refs fresh so the scanner listener never has stale closures
  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => { stockMapRef.current = stockMap; }, [stockMap]);

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
          const stock = stockMapRef.current.get(p.id) ?? 999;
          setCart((c) => {
            const ex = c.find((i) => i.sku === p.sku);
            if (ex) return c.map((i) => (i.sku === p.sku ? { ...i, qty: i.qty + 1 } : i));
            return [...c, { name: p.name, sku: p.sku, productId: p.id, qty: 1, price: p.basePrice, stock }];
          });
          setFlashSku(p.sku);
          setTimeout(() => setFlashSku(null), 600);
          setScanFlash(true);
          setTimeout(() => setScanFlash(false), 800);
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

  const stopCamera = () => {
    zxingRef.current?.stop();
    zxingRef.current = null;
    setCameraOpen(false);
  };

  useEffect(() => () => { zxingRef.current?.stop(); }, []);

  const startCamera = async () => {
    setCameraOpen(true);
    // Wait one tick for the video element to mount
    await new Promise((r) => setTimeout(r, 80));
    if (!videoRef.current) return;
    try {
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        videoRef.current,
        (result) => {
          if (!result) return;
          const raw = result.getText();
          stopCamera();
          const p =
            productsRef.current.find((x) => x.barcode === raw) ??
            productsRef.current.find((x) => x.sku === raw);
          if (p) {
            const stock = stockMapRef.current.get(p.id) ?? 999;
            setCart((c) => {
              const ex = c.find((i) => i.sku === p.sku);
              if (ex) return c.map((i) => (i.sku === p.sku ? { ...i, qty: i.qty + 1 } : i));
              return [...c, { name: p.name, sku: p.sku, productId: p.id, qty: 1, price: p.basePrice, stock }];
            });
            setFlashSku(p.sku); setTimeout(() => setFlashSku(null), 600);
            setScanFlash(true); setTimeout(() => setScanFlash(false), 800);
          } else {
            alert(`Barcode "${raw}" not found in products.`);
          }
        }
      );
      zxingRef.current = controls;
    } catch {
      alert("Camera access denied. Please allow camera permission and try again.");
      setCameraOpen(false);
    }
  };

  // ─── Calculations ─────────────────────────────────────────────────────────────
  const subtotal = cart.reduce((s, i) => s + i.qty * i.price, 0);

  // KSA tobacco excise: min 25 SAR OR 100% of base price, whichever is higher
  function calcTobaccoFee(base: number): number {
    return base <= 25 ? 25 : base;
  }
  const tobaccoExcise = cart.reduce((sum, ci) => {
    const prod = products.find(p => p.id === ci.productId);
    if (!prod?.isTobacco) return sum;
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

  const taxable = subtotal - couponDiscount - totalAutoDiscount + tobaccoExcise;
  const vatAmount = Math.max(0, taxable) * taxRate;
  const total = Math.max(0, taxable) + vatAmount + customFeeTotal;

  // ─── Cart ops ─────────────────────────────────────────────────────────────────
  const updateQty = (sku: string, d: number) =>
    setCart((c) => c.map((i) => (i.sku === sku ? { ...i, qty: Math.max(1, i.qty + d) } : i)));

  const remove = (sku: string) => setCart((c) => c.filter((i) => i.sku !== sku));

  const addToCart = (p: Product) => {
    const stock = stockMap.get(p.id) ?? 999;
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
        // Hide products with no stock record or zero stock in the selected branch
        const stock = stockMap.get(p.id);
        if (stock === undefined || stock <= 0) return false;
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
      if (byBarcode) { addToCart(byBarcode); return; }
      const bySku = products.find((p) => p.sku === trimmed);
      if (bySku) { addToCart(bySku); return; }
      if (matches[0]) addToCart(matches[0]);
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
    setHoldOpen(false);
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

    const payments = splitPayments
      ? splitPayments
          .filter((p) => p.amount > 0)
          .map((p) => ({ paymentMethod: p.method, amount: p.amount, status: "completed" }))
      : [{ paymentMethod, amount: total, status: "completed" }];

    const order: Order = await api.createOrder({
      source: "pos",
      branchId: branch.id,
      customerId: customer?.id,
      cashierId: activeShift?.cashierId,
      subtotal,
      discountAmount: couponDiscount + totalAutoDiscount,
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
    setInvoice({
      orderNumber: order.orderNumber,
      createdAt: order.createdAt ?? new Date().toISOString(),
      items: [...cart],
      subtotal,
      discount: couponDiscount + totalAutoDiscount,
      vat: vatAmount,
      total,
      taxLabel,
      branchName: sellerName || branch.name,
      vatNumber,
      sellerName: sellerName || branch.name,
      customerName: customer?.fullName,
      paymentMethod: splitPayments ? "Split" : paymentMethod,
    });
  };

  const onPaymentDone = () => {
    setPayOpen(false);
    setInvOpen(true);
    resetSale();
  };

  return (
    <PageShell
      title="POS Checkout"
      subtitle={`${branch?.name ?? "Loading…"} · ${activeShift ? `Cashier: ${activeShift.cashier?.fullName ?? "Active shift"}` : "No active shift"}`}
    >
      <div className="grid lg:grid-cols-[1fr_420px] gap-4 -mt-2">
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
              <Button
                size="lg"
                variant="outline"
                className="h-14 gap-2 border-border/70"
                onClick={startCamera}
                title="Scan with laptop camera"
              >
                <Camera className="h-5 w-5" />
              </Button>
            </div>

            {/* Camera feed overlay */}
            {cameraOpen && (
              <div className="mt-3 relative rounded-xl overflow-hidden border border-border/70 bg-black">
                <video ref={videoRef} className="w-full rounded-xl" playsInline muted />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-52 h-32 border-2 border-green-400 rounded-lg opacity-70" />
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  className="absolute top-2 right-2 gap-1"
                  onClick={stopCamera}
                >
                  <CameraOff className="h-4 w-4" /> Stop
                </Button>
                <p className="absolute bottom-2 left-0 right-0 text-center text-xs text-white/80">
                  Point barcode at the green box
                </p>
              </div>
            )}

            {scanFlash && (
              <div className="mt-2 flex items-center gap-2 text-sm text-green-600 dark:text-green-400 px-1 font-medium animate-pulse">
                <ScanBarcode className="h-4 w-4" /> Item scanned — added to cart
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
                  return (
                    <button
                      key={p.sku}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); if (!outOfStock) addToCart(p); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left border-b last:border-0 border-border/40 ${outOfStock ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/60"}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          SKU {p.sku}{p.barcode ? ` · ${p.barcode}` : ""}
                        </p>
                      </div>
                      {stock !== undefined && (
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
              {cart.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => setCart([])}>
                  Clear all
                </Button>
              )}
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
                        disabled={item.stock > 0 && item.qty >= item.stock}
                        title={item.stock > 0 && item.qty >= item.stock ? `Only ${item.stock} in stock` : undefined}
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
        </div>

        {/* ─── Right: order panel ───────────────────────────────────────────── */}
        <Card className="border-border/60 shadow-elegant flex flex-col lg:h-[calc(100vh-100px)] lg:sticky lg:top-20 overflow-hidden">
          <div className="p-4 border-b border-border/60 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">New Order</h3>
              <p className="text-xs text-muted-foreground">
                {cart.length} items · {customer ? customer.fullName : "Walk-in"} · {branch?.name ?? "—"}
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
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 relative" onClick={() => setHoldOpen(true)}>
                <RotateCcw className="h-3 w-3" />Held
                {holds.length > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                    {holds.length}
                  </span>
                )}
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => setInvOpen(true)} disabled={!invoice}>
                <Printer className="h-3 w-3" />Print
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1">
                <MessageSquare className="h-3 w-3" />Send
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

      {/* ─── Held orders dialog ────────────────────────────────────────────────── */}
      <Dialog open={holdOpen} onOpenChange={setHoldOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Held Orders ({holds.length})</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {holds.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No held orders</p>}
            {holds.map((h) => (
              <div key={h.id} className="p-3 rounded-xl border border-border/60 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{h.id}</p>
                  <p className="text-xs text-muted-foreground truncate">{h.items.length} items · held at {h.at}</p>
                </div>
                <p className="text-sm font-bold tabular-nums"><SARIcon />{h.total.toFixed(2)}</p>
                <div className="flex gap-1">
                  <Button size="sm" className="gradient-primary text-primary-foreground border-0" onClick={() => reopen(h.id)}>Reopen</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setHolds((hs) => hs.filter((x) => x.id !== h.id))}>Cancel</Button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetSale(); setHoldOpen(false); }}>New Order</Button>
            <Button variant="outline" onClick={() => setHoldOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Invoice dialog ────────────────────────────────────────────────────── */}
      <Dialog open={invOpen} onOpenChange={setInvOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tax Invoice</DialogTitle></DialogHeader>
          {invoice ? (() => {
            const zatcaQr = buildZatcaTlv(
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
                  <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{invoice.subtotal.toFixed(2)}</span></div>
                  {invoice.discount > 0 && (
                    <div className="flex justify-between text-success"><span>Discount</span><span className="tabular-nums">−{invoice.discount.toFixed(2)}</span></div>
                  )}
                  <div className="flex justify-between"><span>{invoice.taxLabel}</span><span className="tabular-nums">{invoice.vat.toFixed(2)}</span></div>
                  <div className="flex justify-between font-bold text-sm pt-1">
                    <span>Total</span>
                    <span className="tabular-nums">SAR {invoice.total.toFixed(2)}</span>
                  </div>
                  {invoice.paymentMethod && (
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
              onClick={() => printInvoice("pos-invoice")}
            >
              <Printer className="h-4 w-4 mr-1" />Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

  // Split payment inputs
  const [splitCash, setSplitCash] = useState("0.00");
  const [splitCard, setSplitCard] = useState("0.00");
  const [splitWallet, setSplitWallet] = useState("0.00");

  const change = Math.max(0, parseFloat(received || "0") - total);
  const splitTotal =
    (parseFloat(splitCash) || 0) + (parseFloat(splitCard) || 0) + (parseFloat(splitWallet) || 0);
  const splitOk = Math.abs(splitTotal - total) < 0.01;

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setReceived(total.toFixed(2));
      setStatus("idle");
      setSplitCash(total.toFixed(2));
      setSplitCard("0.00");
      setSplitWallet("0.00");
    }
  }, [open, total]);

  const charge = async () => {
    setStatus("waiting");
    try {
      if (tab === "split") {
        const splitPayments = [
          { method: "cash", amount: parseFloat(splitCash) || 0 },
          { method: "card", amount: parseFloat(splitCard) || 0 },
          { method: "wallet", amount: parseFloat(splitWallet) || 0 },
        ];
        await onCharge("split", splitPayments);
      } else {
        await onCharge(tab);
      }
      setStatus("success");
      setTimeout(onDone, 800);
    } catch {
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
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="cash"><Banknote className="h-3.5 w-3.5 mr-1" />Cash</TabsTrigger>
            <TabsTrigger value="card"><CreditCard className="h-3.5 w-3.5 mr-1" />Card</TabsTrigger>
            <TabsTrigger value="wallet"><Wallet className="h-3.5 w-3.5 mr-1" />Wallet</TabsTrigger>
            <TabsTrigger value="split"><Split className="h-3.5 w-3.5 mr-1" />Split</TabsTrigger>
          </TabsList>

          <TabsContent value="cash" className="space-y-3 mt-4">
            <div className="space-y-1">
              <Label className="text-xs">Amount Received</Label>
              <Input className="h-11 text-lg font-bold" value={received} onChange={(e) => setReceived(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[50, 100, 200, 500].map((d) => (
                <Button key={d} variant="outline" onClick={() => setReceived(String(d))}><SARIcon />{d}</Button>
              ))}
            </div>
            <div className="rounded-lg bg-muted/40 p-3 flex justify-between">
              <span className="text-sm text-muted-foreground">Change</span>
              <span className="font-bold text-lg text-success tabular-nums"><SARIcon />{change.toFixed(2)}</span>
            </div>
          </TabsContent>

          <TabsContent value="card" className="space-y-3 mt-4">
            <CardMachineStatus status={status} />
            <div className="rounded-lg bg-muted/40 p-3 text-sm">
              Card machine: <strong>Geidea Terminal</strong>
            </div>
          </TabsContent>

          <TabsContent value="wallet" className="space-y-3 mt-4">
            <CardMachineStatus status={status} />
            <div className="grid grid-cols-3 gap-2">
              {["STC Pay", "Apple Pay", "mada Pay"].map((w) => (
                <Button key={w} variant="outline" size="sm">{w}</Button>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="split" className="space-y-3 mt-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px]">Cash</Label>
                <Input className="h-9" value={splitCash} onChange={(e) => setSplitCash(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Card</Label>
                <Input className="h-9" value={splitCard} onChange={(e) => setSplitCard(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px]">Wallet</Label>
                <Input className="h-9" value={splitWallet} onChange={(e) => setSplitWallet(e.target.value)} />
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
          <p className="text-sm text-destructive text-center">Payment failed. Please try again.</p>
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
