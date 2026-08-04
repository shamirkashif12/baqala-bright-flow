import type { Product } from "@/lib/api";

// Client-side mirror of the server's UnitOfMeasureCatalog (api/Services/UnitOfMeasureCatalog.cs).
//
// The authoritative list is served from GET /api/products/units and that is what the Add/Edit form
// populates its picker from — this table exists for the things that must work synchronously while
// rendering a cart line or a stock row (step size, decimal places, whether to show a +/- stepper),
// where awaiting a fetch per product is not an option. Keep the codes in step with the server: an
// unknown code here degrades to piece-like behaviour rather than breaking, but a weighed product
// treated as countable would refuse the decimal quantity the server accepts.

export type UnitCategory = "count" | "weight" | "volume" | "length";

export interface UnitSpec {
  code: string;
  category: UnitCategory;
  /** Meaningful precision when entering a quantity. 0 = whole numbers only. */
  decimalPlaces: number;
  /** The minor unit a cashier may prefer to type ("gram"), if the unit has a customary one. */
  subUnitLabel?: string;
  /** How many minor units make one major unit (1000 g per kg). */
  subUnitsPerUnit?: number;
}

export const UNIT_SPECS: Record<string, UnitSpec> = {
  piece: { code: "piece", category: "count", decimalPlaces: 0 },
  dozen: { code: "dozen", category: "count", decimalPlaces: 0 },
  box: { code: "box", category: "count", decimalPlaces: 0 },
  kilogram: { code: "kilogram", category: "weight", decimalPlaces: 3, subUnitLabel: "gram", subUnitsPerUnit: 1000 },
  gram: { code: "gram", category: "weight", decimalPlaces: 0 },
  liter: { code: "liter", category: "volume", decimalPlaces: 3, subUnitLabel: "milliliter", subUnitsPerUnit: 1000 },
  milliliter: { code: "milliliter", category: "volume", decimalPlaces: 0 },
  meter: { code: "meter", category: "length", decimalPlaces: 2, subUnitLabel: "centimeter", subUnitsPerUnit: 100 },
};

export const DEFAULT_UNIT = "piece";

/** Short symbol for shelf tags, cart lines and stock tables — "2.5 kg" beats "2.5 kilogram". */
export const UNIT_SYMBOLS: Record<string, string> = {
  piece: "pc", dozen: "dz", box: "box",
  kilogram: "kg", gram: "g",
  liter: "L", milliliter: "ml",
  meter: "m", centimeter: "cm",
};

export function unitSpec(code?: string | null): UnitSpec {
  return UNIT_SPECS[(code ?? "").trim().toLowerCase()] ?? UNIT_SPECS[DEFAULT_UNIT];
}

export function unitSymbol(code?: string | null): string {
  const c = (code ?? "").trim().toLowerCase();
  return UNIT_SYMBOLS[c] ?? unitSpec(c).code;
}

/**
 * Whether this product may carry a fractional quantity. Reads the unit, falling back to the legacy
 * `weightBased` flag — the server derives one from the other on every write, but a product loaded
 * from a cached/older response may only have the bool.
 */
export function isFractional(product: Pick<Product, "unitOfMeasure" | "weightBased">): boolean {
  const spec = unitSpec(product.unitOfMeasure);
  return spec.category !== "count" || product.weightBased === true;
}

/** Quantity input step: 0.001 for kg/L, 0.01 for m, 1 for counted goods. */
export function qtyStep(product: Pick<Product, "unitOfMeasure" | "weightBased">): number {
  if (!isFractional(product)) return 1;
  const places = unitSpec(product.unitOfMeasure).decimalPlaces || 3;
  return Number((10 ** -places).toFixed(places));
}

/** Smallest sellable quantity — one step for measured goods, one whole item for counted ones. */
export function minQty(product: Pick<Product, "unitOfMeasure" | "weightBased">): number {
  return qtyStep(product);
}

/**
 * Clamps a typed quantity to what the unit can express: whole numbers for counted goods, the
 * unit's precision for measured ones. Without this a cashier can type 1.5 pieces, which the server
 * rejects at checkout — after the customer is already standing there.
 */
export function normalizeQty(product: Pick<Product, "unitOfMeasure" | "weightBased">, qty: number): number {
  if (!Number.isFinite(qty)) return 0;
  if (!isFractional(product)) return Math.floor(qty);
  const places = unitSpec(product.unitOfMeasure).decimalPlaces || 3;
  return Number(qty.toFixed(places));
}

/** Display a quantity with its unit: "0.35 kg", "3 pc". */
export function formatQty(product: Pick<Product, "unitOfMeasure" | "weightBased">, qty: number): string {
  const spec = unitSpec(product.unitOfMeasure);
  const places = isFractional(product) ? spec.decimalPlaces : 0;
  // trailing zeros stripped — "0.350 kg" reads as false precision on a scale reading 350 g
  const n = Number(qty.toFixed(places)).toString();
  return `${n} ${unitSymbol(product.unitOfMeasure)}`;
}

/**
 * Converts a sub-unit entry (350 g) into the product's major unit (0.35 kg). Purely an input
 * affordance: quantities are always stored and priced in the major unit, so no second stock unit
 * is ever introduced. Returns null when the unit has no customary sub-unit.
 */
export function qtyFromSubUnit(product: Pick<Product, "unitOfMeasure" | "weightBased">, subUnitQty: number): number | null {
  const spec = unitSpec(product.unitOfMeasure);
  if (!spec.subUnitsPerUnit) return null;
  return normalizeQty(product, subUnitQty / spec.subUnitsPerUnit);
}

/**
 * Converts a piece count into a weight/volume quantity using the product's average unit weight —
 * "3 tomatoes" → 0.36 kg on a per-kg product. This is what lets a weighed item be rung up by the
 * piece without a second SKU. Returns null when the product has no estimate configured, which is
 * the signal that by-count entry must not be offered for it.
 */
export function qtyFromUnitCount(
  product: Pick<Product, "unitOfMeasure" | "weightBased" | "estimatedUnitWeight">,
  count: number,
): number | null {
  if (!isFractional(product)) return null;
  const est = product.estimatedUnitWeight;
  if (!est || est <= 0) return null;
  return normalizeQty(product, count * est);
}

/** Whether the POS should offer a "by piece" entry mode for this weighed product. */
export function supportsCountEntry(
  product: Pick<Product, "unitOfMeasure" | "weightBased" | "estimatedUnitWeight">,
): boolean {
  return qtyFromUnitCount(product, 1) !== null;
}
