import type { Coupon, Customer, Discount, Offer, Product, TaxFeeRule } from "./api";
import type { CartLine } from "./cart";

export interface DisplayLine {
  product: Product;
  quantity: number; // paid + bonus units
  bonusQty: number;
  isBonusOnly: boolean;
}

export interface PricingRow {
  key: string;
  label: string;
  amount: number;
}

export interface PricingResult {
  displayLines: DisplayLine[];
  subtotal: number;
  couponDiscount: number;
  discountRows: PricingRow[]; // active branch/category/product-wide Discounts
  bundleRows: PricingRow[]; // bogo/buy_a_get_b auto-added bonus units (see displayLines)
  offerRows: PricingRow[]; // non-bundle triggered Offers (product_offer / combo / blanket bogo)
  productDiscountRows: PricingRow[]; // static per-product Discount field
  feeRows: PricingRow[]; // order-level custom fee rules
  totalDiscount: number; // coupon + discountRows + bundleRows + offerRows + productDiscountRows
  tobaccoExcise: number; // KSA excise — added to the taxable base, not netted against discounts
  customFeeTotal: number;
  taxAmount: number;
  totalAmount: number;
  luckyDraws: Offer[]; // eligible "chance to win" banners — no monetary effect, staff runs the draw
}

function parseIdList(json?: string | null): string[] {
  if (!json) return [];
  try {
    const d = JSON.parse(json);
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

function parseComboIds(desc?: string | null): string[] {
  if (!desc) return [];
  try {
    const d = JSON.parse(desc);
    return Array.isArray(d.products) ? d.products : [];
  } catch {
    return [];
  }
}

const TIER_RANK: Record<string, number> = { standard: 0, silver: 1, gold: 2, platinum: 3 };

export function computePricing(args: {
  lines: CartLine[];
  coupon: Coupon | null;
  products: Product[];
  activeDiscounts: Discount[];
  activeOffers: Offer[];
  customFeeRules: TaxFeeRule[];
  taxRate: number;
  branchId: string | null;
  customer: Customer | null;
  tobaccoFeeEnabled: boolean;
}): PricingResult {
  const { lines, coupon, products, activeDiscounts, activeOffers, customFeeRules, taxRate, branchId, customer, tobaccoFeeEnabled } = args;

  // ─── Bundle / multi-buy engine (bogo, buy_a_get_b) — mirrors the staff POS's own logic
  // in src/routes/_app.pos.tsx. Trigger thresholds are evaluated against the paid quantity
  // only, never a total that already includes a previous bonus, so this can't compound.
  const bonusContributions: { offerId: string; offerName: string; productId: string; bonusQty: number; payPerUnit: number }[] = [];
  for (const o of activeOffers) {
    if (o.offerType !== "bogo" && o.offerType !== "buy_a_get_b") continue;
    if (!o.triggerProductId) continue; // blanket BOGO stays a pure discount, handled below
    const triggerLine = lines.find((l) => l.product.id === o.triggerProductId);
    if (!triggerLine) continue;
    const sets = Math.floor(triggerLine.quantity / (o.triggerQuantity || 1));
    if (sets <= 0) continue;
    const getProductId = o.getProductId || o.triggerProductId;
    const payPerUnit = o.offerType === "buy_a_get_b" ? (o.offerPrice ?? 0) : 0;
    bonusContributions.push({ offerId: o.id, offerName: o.name, productId: getProductId, bonusQty: sets * (o.getQuantity || 1), payPerUnit });
  }

  const bonusByProduct = new Map<string, number>();
  for (const c of bonusContributions) bonusByProduct.set(c.productId, (bonusByProduct.get(c.productId) ?? 0) + c.bonusQty);

  const displayLines: DisplayLine[] = lines.map((l) => {
    const bonusQty = bonusByProduct.get(l.product.id) ?? 0;
    return { product: l.product, quantity: l.quantity + bonusQty, bonusQty, isBonusOnly: false };
  });
  const paidProductIds = new Set(lines.map((l) => l.product.id));
  for (const [productId, bonusQty] of bonusByProduct) {
    if (paidProductIds.has(productId) || bonusQty <= 0) continue;
    const product = products.find((p) => p.id === productId);
    if (!product) continue;
    displayLines.push({ product, quantity: bonusQty, bonusQty, isBonusOnly: true });
  }

  const bundleRows: PricingRow[] = [];
  for (const c of bonusContributions) {
    const product = products.find((p) => p.id === c.productId);
    const amount = c.bonusQty * Math.max(0, (product?.basePrice ?? 0) - c.payPerUnit);
    if (amount > 0) bundleRows.push({ key: c.offerId, label: `${c.offerName} (+${c.bonusQty} ${product?.name ?? "free"})`, amount });
  }
  const bundleDiscount = bundleRows.reduce((s, r) => s + r.amount, 0);

  const subtotal = displayLines.reduce((s, l) => s + l.quantity * l.product.basePrice, 0);

  // ─── KSA tobacco excise — min 25 SAR or 100% of base price, whichever is higher, per unit.
  // Bonus units still leave the shelf and are still excisable, so this runs over displayLines
  // (gross), same as the staff POS. Added to the taxable base below, not netted against
  // discounts — VAT applies on top of price + excise, matching how excise tax actually stacks.
  function calcTobaccoFee(basePrice: number): number {
    return basePrice <= 25 ? 25 : basePrice;
  }
  const tobaccoExcise = tobaccoFeeEnabled
    ? displayLines.reduce((sum, l) => (l.product.isTobacco ? sum + l.quantity * calcTobaccoFee(l.product.basePrice) : sum), 0)
    : 0;

  // ─── Coupon ────────────────────────────────────────────────────────────────
  const couponDiscount = coupon
    ? coupon.type === "percentage"
      ? Math.min(subtotal * (coupon.value / 100), subtotal)
      : Math.min(coupon.value, subtotal)
    : 0;

  // ─── Active Discounts (branch/category/product-wide, date-ranged) ─────────
  const discountRows: PricingRow[] = [];
  for (const d of activeDiscounts) {
    const now = new Date();
    if (d.startDate && new Date(d.startDate) > now) continue;
    if (d.endDate && new Date(d.endDate) < now) continue;
    // Loyalty/senior-style discounts must not auto-apply to an anonymous walk-in.
    if (d.requiresCustomer && !customer) continue;
    if (d.minCustomerTier) {
      const customerRank = customer ? TIER_RANK[customer.tier] ?? 0 : -1;
      if (customerRank < (TIER_RANK[d.minCustomerTier] ?? 0)) continue;
    }
    if (d.appliesTo === "branch" && d.branchId && branchId && d.branchId !== branchId) continue;

    const excludedIds = new Set(parseIdList(d.excludedProductIdsJson));
    let amount = 0;
    if (d.appliesTo === "all" || d.appliesTo === "branch") {
      const eligible = displayLines.filter((l) => !excludedIds.has(l.product.id));
      const eligibleSubtotal = eligible.reduce((s, l) => s + l.quantity * l.product.basePrice, 0);
      if (eligibleSubtotal > 0) {
        amount = d.discountType === "percentage" ? eligibleSubtotal * (d.value / 100) : Math.min(d.value, eligibleSubtotal);
      }
    } else if (d.appliesTo === "product" && d.productId && !excludedIds.has(d.productId)) {
      const line = displayLines.find((l) => l.product.id === d.productId);
      if (line) {
        const lineTotal = line.quantity * line.product.basePrice;
        amount = d.discountType === "percentage" ? lineTotal * (d.value / 100) : Math.min(d.value * line.quantity, lineTotal);
      }
    } else if (d.appliesTo === "category" && d.categoryId) {
      const catLines = displayLines.filter((l) => !excludedIds.has(l.product.id) && l.product.categoryId === d.categoryId);
      amount = catLines.reduce((s, l) => {
        const lineTotal = l.quantity * l.product.basePrice;
        return s + (d.discountType === "percentage" ? lineTotal * (d.value / 100) : Math.min(d.value * l.quantity, lineTotal));
      }, 0);
    }
    if (amount > 0) discountRows.push({ key: d.id, label: d.name, amount });
  }
  const discountSavings = discountRows.reduce((s, r) => s + r.amount, 0);

  // ─── Offers (non-bundle: product_offer, combo, blanket bogo) + lucky draw banner ─
  const offerRows: PricingRow[] = [];
  const luckyDraws: Offer[] = [];
  for (const o of activeOffers) {
    if (o.offerType === "bogo" && o.triggerProductId) continue; // handled by bundleDiscount
    if (o.offerType === "buy_a_get_b") continue; // always handled by bundleDiscount (always has a trigger product)

    if (o.offerType === "bogo" && !o.triggerProductId) {
      if (lines.length === 0) continue;
      const triggerQty = o.triggerQuantity || 1;
      const getQty = o.getQuantity || 1;
      const amount = lines.reduce((s, l) => {
        const sets = Math.floor(l.quantity / (triggerQty + getQty));
        return s + sets * getQty * l.product.basePrice;
      }, 0);
      if (amount > 0) offerRows.push({ key: o.id, label: o.name, amount });
      continue;
    }
    if (o.offerType === "product_offer" && o.triggerProductId) {
      const line = lines.find((l) => l.product.id === o.triggerProductId);
      if (!line) continue;
      const amount = o.discountPercentage
        ? line.quantity * line.product.basePrice * (o.discountPercentage / 100)
        : o.offerPrice != null
          ? line.quantity * Math.max(0, line.product.basePrice - o.offerPrice)
          : 0;
      if (amount > 0) offerRows.push({ key: o.id, label: o.name, amount });
      continue;
    }
    if (o.offerType === "combo") {
      const ids = parseComboIds(o.itemsDescription);
      if (ids.length < 2 || !ids.every((id) => lines.some((l) => l.product.id === id))) continue;
      if (o.offerPrice == null) continue;
      const retailTotal = ids.reduce((s, id) => s + (lines.find((l) => l.product.id === id)?.product.basePrice ?? 0), 0);
      const amount = Math.max(0, retailTotal - o.offerPrice);
      if (amount > 0) offerRows.push({ key: o.id, label: o.name, amount });
      continue;
    }
    if (o.offerType === "lucky_draw" && o.minBasketAmount != null && subtotal >= o.minBasketAmount) {
      luckyDraws.push(o);
    }
  }
  const offerDiscount = offerRows.reduce((s, r) => s + r.amount, 0) + bundleDiscount;

  // ─── Per-product static discount (Product.discount / discountType) ────────
  const productDiscountRows: PricingRow[] = [];
  for (const l of displayLines) {
    if (!l.product.discount || l.product.discount <= 0) continue;
    const lineTotal = l.quantity * l.product.basePrice;
    const amount =
      l.product.discountType === "percentage"
        ? lineTotal * (l.product.discount / 100)
        : Math.min(l.product.discount * l.quantity, lineTotal);
    if (amount > 0) productDiscountRows.push({ key: l.product.id, label: `${l.product.name} discount`, amount });
  }
  const productDiscountTotal = productDiscountRows.reduce((s, r) => s + r.amount, 0);

  const totalAutoDiscount = discountSavings + offerDiscount;
  const totalDiscount = couponDiscount + totalAutoDiscount + productDiscountTotal;

  // ─── Order-level custom fee rules ──────────────────────────────────────────
  const feeRows: PricingRow[] = [];
  if (lines.length > 0) {
    for (const f of customFeeRules) {
      if (f.applicableTo !== "all_products" && f.applicableTo !== "all_orders") continue;
      const amount =
        f.customFeeAmount > 0 ? f.customFeeAmount : f.excisePercentage > 0 ? (subtotal * f.excisePercentage) / 100 : 0;
      if (amount > 0) feeRows.push({ key: f.id, label: f.ruleName, amount });
    }
  }
  const customFeeTotal = feeRows.reduce((s, r) => s + r.amount, 0);

  const taxable = subtotal - totalDiscount + tobaccoExcise;
  const taxAmount = Math.max(0, taxable) * taxRate;
  const totalAmount = Math.max(0, taxable) + taxAmount + customFeeTotal;

  return {
    displayLines,
    subtotal,
    couponDiscount,
    discountRows,
    bundleRows,
    offerRows,
    productDiscountRows,
    feeRows,
    totalDiscount,
    tobaccoExcise,
    customFeeTotal,
    taxAmount,
    totalAmount,
    luckyDraws,
  };
}
