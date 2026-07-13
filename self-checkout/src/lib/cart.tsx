import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getActiveDiscounts,
  getActiveOffers,
  getTaxRules,
  listActiveProducts,
  type Coupon,
  type Customer,
  type Discount,
  type Offer,
  type Product,
  type TaxFeeRule,
} from "./api";
import { computePricing, type PricingResult } from "./pricing";
import { useSession } from "./session";

export interface CartLine {
  product: Product;
  quantity: number;
}

export interface HeldOrder {
  id: string;
  lines: CartLine[];
  coupon: Coupon | null;
  customer: Customer | null;
  total: number;
  at: string;
}

interface CartContextValue extends PricingResult {
  lines: CartLine[];
  coupon: Coupon | null;
  customer: Customer | null;
  holds: HeldOrder[];
  products: Product[];
  taxLabel: string;
  addProduct: (product: Product) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  removeLine: (productId: string) => void;
  applyCoupon: (coupon: Coupon) => void;
  removeCoupon: () => void;
  setCustomer: (customer: Customer | null) => void;
  clear: () => void;
  hold: () => void;
  reopen: (id: string) => void;
  discardHold: (id: string) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const { paired, branchId } = useSession();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [holds, setHolds] = useState<HeldOrder[]>([]);

  // Reference data — pricing rules configured by staff elsewhere in the app. Preloaded once
  // per session rather than re-fetched per scan/keystroke (same reasoning as the product
  // catalog: it's what makes the global scanner listener and live search instant).
  const [products, setProducts] = useState<Product[]>([]);
  const [activeDiscounts, setActiveDiscounts] = useState<Discount[]>([]);
  const [activeOffers, setActiveOffers] = useState<Offer[]>([]);
  const [taxRules, setTaxRules] = useState<TaxFeeRule[]>([]);

  useEffect(() => {
    if (!paired) return;
    listActiveProducts().then(setProducts).catch(() => {});
    getActiveDiscounts().then(setActiveDiscounts).catch(() => {});
    getActiveOffers().then(setActiveOffers).catch(() => {});
    getTaxRules().then(setTaxRules).catch(() => {});
  }, [paired]);

  const vatRule = taxRules.find((r) => r.ruleType === "vat" && r.status === "active");
  const taxRate = vatRule ? vatRule.vatPercentage / 100 : 0.15;
  const taxLabel = vatRule ? `VAT ${vatRule.vatPercentage}%` : "VAT 15%";
  const customFeeRules = useMemo(() => taxRules.filter((r) => r.ruleType === "custom_fee" && r.status === "active"), [taxRules]);
  // Defaults to enabled when no explicit rule row exists yet, same as the staff POS.
  const tobaccoRule = taxRules.find((r) => r.ruleType === "tobacco_excise");
  const tobaccoFeeEnabled = tobaccoRule ? tobaccoRule.status === "active" : true;

  function addProduct(product: Product) {
    setLines((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { product, quantity: 1 }];
    });
  }

  function updateQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      removeLine(productId);
      return;
    }
    setLines((prev) => prev.map((l) => (l.product.id === productId ? { ...l, quantity } : l)));
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.product.id !== productId));
  }

  function clear() {
    setLines([]);
    setCoupon(null);
    setCustomer(null);
  }

  const pricing = useMemo(
    () =>
      computePricing({
        lines,
        coupon,
        products,
        activeDiscounts,
        activeOffers,
        customFeeRules,
        taxRate,
        branchId,
        customer,
        tobaccoFeeEnabled,
      }),
    [lines, coupon, products, activeDiscounts, activeOffers, customFeeRules, taxRate, branchId, customer, tobaccoFeeEnabled],
  );

  function hold() {
    if (lines.length === 0) return;
    const holdId = `HOLD-${String(101 + holds.length).padStart(3, "0")}`;
    setHolds((h) => [
      {
        id: holdId,
        lines,
        coupon,
        customer,
        total: pricing.totalAmount,
        at: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
      },
      ...h,
    ]);
    clear();
  }

  function reopen(id: string) {
    const h = holds.find((x) => x.id === id);
    if (!h) return;
    setLines(h.lines);
    setCoupon(h.coupon);
    setCustomer(h.customer);
    setHolds((hs) => hs.filter((x) => x.id !== id));
  }

  function discardHold(id: string) {
    setHolds((hs) => hs.filter((x) => x.id !== id));
  }

  return (
    <CartContext.Provider
      value={{
        lines,
        coupon,
        customer,
        holds,
        products,
        taxLabel,
        addProduct,
        updateQuantity,
        removeLine,
        applyCoupon: setCoupon,
        removeCoupon: () => setCoupon(null),
        setCustomer,
        clear,
        hold,
        reopen,
        discardHold,
        ...pricing,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
