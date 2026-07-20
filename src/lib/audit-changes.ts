import type { AuditLog } from "@/lib/api";

/**
 * Employee Audit Center — derives the discrete, human-readable changes behind an audit row.
 *
 * The backend records an order edit as one `edit_order` row carrying a full before/after JSON
 * snapshot, not as separate "discount changed" / "price changed" / "item added" events. That's the
 * right shape to store (one edit is one atomic action), but the spec asks the activity page to
 * surface Discounts, Price Changes, Added Items and Deleted Items as things a reviewer can
 * actually see. So the snapshots are diffed here, at read time, instead of duplicating event rows.
 */

export type ChangeKind =
  | "discount" | "price" | "item_added" | "item_removed" | "quantity"
  | "payment_method" | "customer" | "total" | "status" | "quantity_on_hand" | "other";

/** Catalog fields diffed for create_product / update_product / delete_product rows. */
const PRODUCT_FIELDS: { key: keyof Snapshot; label: string; kind: ChangeKind; money?: boolean }[] = [
  { key: "name", label: "Product name", kind: "other" },
  { key: "sku", label: "SKU", kind: "other" },
  { key: "barcode", label: "Barcode", kind: "other" },
  { key: "basePrice", label: "Selling price", kind: "price", money: true },
  { key: "costPrice", label: "Cost price", kind: "price", money: true },
  { key: "taxPercentage", label: "VAT %", kind: "other" },
  { key: "customFee", label: "Custom fee", kind: "other", money: true },
  { key: "reorderLevel", label: "Reorder level", kind: "quantity" },
  { key: "status", label: "Status", kind: "status" },
  { key: "isTobacco", label: "Tobacco / excise", kind: "other" },
];

export interface FieldChange {
  kind: ChangeKind;
  label: string;
  before?: string;
  after?: string;
}

interface SnapshotItem { productId?: string; quantity?: number; unitPrice?: number; totalPrice?: number }
interface Snapshot {
  subtotal?: number; discountAmount?: number; taxAmount?: number; totalAmount?: number;
  notes?: string; customerId?: string | null; paymentMethod?: string;
  status?: string; approvedBy?: string; refundAmount?: number;
  quantityBefore?: number; quantityAfter?: number;
  adjustmentType?: string; reason?: string;
  items?: SnapshotItem[];
  // Catalog snapshot (ProductsController) — "Added Items" / "Price Changes" / "Deleted Items".
  name?: string; sku?: string; barcode?: string | null;
  basePrice?: number; costPrice?: number; taxPercentage?: number; customFee?: number;
  reorderLevel?: number; isTobacco?: boolean; categoryId?: string | null;
  // Batch receipt (InventoryController.ReceiveBatch) — "Added Items" as stock, not catalog.
  batchNumber?: string; purchaseCost?: number; expiryDate?: string | null;
}

/**
 * Snapshots are written with a bare `JsonSerializer.Serialize(new {...})` in the controllers, which
 * ignores the MVC camelCase policy (that only governs response bodies) and emits PascalCase keys —
 * `{"Subtotal":5.0,"Items":[{"ProductId":…}]}`. Reading camelCase off that yields `undefined` for
 * every field, so every diff below silently came back empty. Normalising at read time rather than
 * fixing the writers is deliberate: it also repairs the PascalCase rows already in the database,
 * which a writer-side fix alone would leave permanently unreadable.
 */
function lowerKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(lowerKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, val]) => [
        k.charAt(0).toLowerCase() + k.slice(1),
        lowerKeys(val),
      ]),
    );
  }
  return v;
}

function parse(json?: string): Snapshot | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" && !Array.isArray(v) ? (lowerKeys(v) as Snapshot) : null;
  } catch {
    // Not every audit row carries JSON — older/simpler rows store a plain sentence. Those have
    // nothing to diff, and a parse failure here is expected rather than an error worth surfacing.
    return null;
  }
}

const money = (n?: number) => (n == null ? undefined : `SAR ${n.toFixed(2)}`);

/**
 * Product names aren't stored in the snapshot (only ids), so the caller passes a lookup built from
 * the product list it already has. Falls back to a short id when a product has since been deleted.
 */
export function describeChanges(log: AuditLog, productName?: (id: string) => string): FieldChange[] {
  const before = parse(log.oldValues);
  const after = parse(log.newValues);
  if (!after && !before) return [];

  const changes: FieldChange[] = [];
  const nameOf = (id?: string) => (id ? (productName?.(id) ?? `${id.slice(0, 8)}…`) : "Unknown product");

  // Inventory adjustment — the only action that records a true on-hand quantity before/after.
  if (before?.quantityBefore != null || after?.quantityAfter != null) {
    // Which product was adjusted — shown first so a reviewer reads the item before the numbers.
    // Prefer the name denormalised into the payload (InventoryController.Adjust); fall back to the
    // productName resolver, then to a shortened id, so older rows without the name still resolve.
    const adjProductId = (after as { productId?: string }).productId;
    const adjProductName = (after as { productName?: string }).productName;
    if (adjProductName || adjProductId) {
      changes.push({ kind: "other", label: "Product", after: adjProductName ?? nameOf(adjProductId) });
    }
    changes.push({
      kind: "quantity_on_hand",
      label: "Quantity on hand",
      before: before?.quantityBefore != null ? String(before.quantityBefore) : undefined,
      after: after?.quantityAfter != null ? String(after.quantityAfter) : undefined,
    });
    // Why the stock moved. Both live only in the "after" payload (they describe the action, not a
    // prior state), so they're stated rather than diffed — a reviewer looking at a write-off needs
    // the reason next to the quantity, not one screen away.
    if (after?.adjustmentType) {
      changes.push({ kind: "other", label: "Adjustment type", after: after.adjustmentType.replace(/_/g, " ") });
    }
    if (after?.reason) changes.push({ kind: "other", label: "Reason", after: after.reason });
  }

  // Scalar order/return fields. Only emitted when they actually differ, so an edit that only
  // touched one line doesn't render five "unchanged" rows.
  const scalar = (kind: ChangeKind, label: string, b?: string, a?: string) => {
    if (b !== a && (b != null || a != null)) changes.push({ kind, label, before: b, after: a });
  };
  scalar("discount", "Discount", money(before?.discountAmount), money(after?.discountAmount));
  scalar("total", "Order total", money(before?.totalAmount), money(after?.totalAmount));
  scalar("payment_method", "Payment method", before?.paymentMethod, after?.paymentMethod);

  // Catalog rows. On a create there is no `before`, so every field would read as a change and bury
  // the reviewer in ten "— → value" lines; the whole row is the news, so only the identifying
  // fields are surfaced. Edits and deletes diff properly against their snapshot.
  const isProduct = (before ?? after)?.sku != null && (before ?? after)?.basePrice != null;
  if (isProduct && !before) {
    changes.push({ kind: "other", label: "Product created", after: `${after?.name ?? "—"} (${after?.sku ?? "—"})` });
    scalar("price", "Selling price", undefined, money(after?.basePrice));
  } else if (isProduct) {
    for (const f of PRODUCT_FIELDS) {
      const b = before?.[f.key];
      const a = after?.[f.key];
      const fmt = (v: unknown) =>
        v == null ? undefined : typeof v === "boolean" ? (v ? "Yes" : "No") : f.money ? money(v as number) : String(v);
      scalar(f.kind, f.label, fmt(b), fmt(a));
    }
  } else {
    scalar("status", "Status", before?.status, after?.status);
  }

  // Batch receipt — the batch itself is the addition; on-hand before/after is handled above.
  if (after?.batchNumber) {
    const productId = (after as { productId?: string }).productId;
    changes.push({
      kind: "item_added",
      label: `Batch received — ${nameOf(productId)}`,
      after: `${after.batchNumber} · ${money(after.purchaseCost) ?? "—"} cost`,
    });
    if (after.expiryDate) {
      changes.push({ kind: "other", label: "Batch expiry", after: new Date(after.expiryDate).toLocaleDateString() });
    }
  }
  if (before?.customerId !== after?.customerId && (before?.customerId || after?.customerId)) {
    changes.push({
      kind: "customer",
      label: "Customer",
      before: before?.customerId ? `${before.customerId.slice(0, 8)}…` : "Walk-in",
      after: after?.customerId ? `${after.customerId.slice(0, 8)}…` : "Walk-in",
    });
  }

  // Line-level diff: added / removed / price / quantity. Grouped by product so a line that only
  // changed quantity reads as one "quantity" change rather than a remove + re-add pair.
  if (before?.items || after?.items) {
    const sum = (items: SnapshotItem[] | undefined) => {
      const m = new Map<string, { qty: number; price?: number }>();
      for (const i of items ?? []) {
        if (!i.productId) continue;
        const prev = m.get(i.productId);
        m.set(i.productId, { qty: (prev?.qty ?? 0) + (i.quantity ?? 0), price: i.unitPrice });
      }
      return m;
    };
    const b = sum(before?.items);
    const a = sum(after?.items);

    for (const id of new Set([...b.keys(), ...a.keys()])) {
      const bi = b.get(id);
      const ai = a.get(id);
      if (!bi && ai) {
        changes.push({ kind: "item_added", label: `Item added — ${nameOf(id)}`, after: `${ai.qty} × ${money(ai.price) ?? "—"}` });
      } else if (bi && !ai) {
        changes.push({ kind: "item_removed", label: `Item removed — ${nameOf(id)}`, before: `${bi.qty} × ${money(bi.price) ?? "—"}` });
      } else if (bi && ai) {
        if (bi.price !== ai.price) {
          changes.push({ kind: "price", label: `Price changed — ${nameOf(id)}`, before: money(bi.price), after: money(ai.price) });
        }
        if (bi.qty !== ai.qty) {
          changes.push({ kind: "quantity", label: `Quantity changed — ${nameOf(id)}`, before: String(bi.qty), after: String(ai.qty) });
        }
      }
    }
  }

  return changes;
}
