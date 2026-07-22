import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { api, type InventoryBatch } from "@/lib/api";
import { BatchStatusBadge } from "@/components/batch-status-badge";

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-SA", { day: "2-digit", month: "short", year: "numeric" });
}

function daysLeft(expiryDate?: string): number | null {
  if (!expiryDate) return null;
  return Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86400000);
}

// Inline sub-row shown when a product row is expanded — lists that product's batches still
// contributing on-hand stock at the given branch/warehouse (batch #, remaining qty, received/expiry
// dates, status). Fully consumed batches (remainingQuantity <= 0) are historical, not part of
// current stock, so they're excluded here rather than cluttering the list. Pass `batches` when the
// caller already has the full array in memory (avoids a per-row fetch); omit it to lazy-fetch on
// first expand.
//
// `aggregateQuantity` (the same on-hand number shown on the collapsed row) drives a reconciliation
// line: batch remaining-quantities aren't always the full picture (older stock received before
// batch tracking existed, manual stock adjustments, seed data, etc. only ever touch the aggregate
// InventoryStock/WarehouseStock row) — so if the batches sum to less than the aggregate, the gap
// is shown as an explicit "No batch / untracked" row instead of silently vanishing, so the numbers
// on screen always add up to the on-hand total.
export function BatchExpandRow({
  productId, locationType, locationId, colSpan, batches, aggregateQuantity,
}: {
  productId: string;
  locationType: "branch" | "warehouse";
  locationId: string;
  colSpan: number;
  batches?: InventoryBatch[];
  aggregateQuantity?: number;
}) {
  const [lazyBatches, setLazyBatches] = useState<InventoryBatch[] | null>(null);
  const [loading, setLoading] = useState(batches === undefined);

  useEffect(() => {
    if (batches !== undefined) return;
    setLoading(true);
    api.getBatches(locationType === "branch" ? { productId, branchId: [locationId] } : { productId, warehouseId: [locationId] })
      .then(setLazyBatches)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, locationId, locationType]);

  // Expired batches are written off, not sellable stock — they belong on the Batch Tracking /
  // Expiry & Perishable pages, not here. Excluded by both the `status` field (set by the periodic
  // expiry scan) and the raw expiry date, so a batch never lingers in this view during the gap
  // between its expiry passing and the next scan cycle flipping its status. Compared as UTC
  // calendar dates, not instants — expiryDate is a date-only value serialized at UTC midnight, so
  // comparing it directly against `new Date()` would call a batch expiring "today" expired the
  // moment the clock ticks past midnight, hours before its day is actually over.
  const isExpired = (b: InventoryBatch) => {
    if (b.status === "expired") return true;
    if (!b.expiryDate) return false;
    const expiry = new Date(b.expiryDate);
    const now = new Date();
    return Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate())
      < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  };

  const rows = (batches ?? lazyBatches ?? [])
    .filter(b => b.productId === productId && (locationType === "branch" ? b.branchId === locationId : b.warehouseId === locationId) && b.remainingQuantity > 0 && !isExpired(b))
    .sort((a, b) => (a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity) - (b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity));

  const trackedTotal = rows.reduce((s, b) => s + b.remainingQuantity, 0);
  const untracked = aggregateQuantity != null ? Math.max(0, aggregateQuantity - trackedTotal) : 0;

  return (
    <tr className="bg-muted/20">
      <td colSpan={colSpan} className="px-4 py-3">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading batches…
          </div>
        ) : rows.length === 0 && untracked <= 0 ? (
          <p className="text-xs text-muted-foreground py-2">No batches on hand for this product here.</p>
        ) : (
          // Deliberately a CSS grid of <div>s, not a nested <table> — a second <table> here would
          // feed ITS preferred content width back into the outer product table's own column-width
          // negotiation (that's what broke the layout: long batch numbers/headers forced the whole
          // outer table, and the narrow Sheet drawer around it, wider). A plain grid div is always
          // exactly the width of its containing <td> regardless of its content, so the batch#
          // column truncates (min-w-0 lets a grid item shrink below its content's natural width)
          // instead of pushing anything else around.
          //
          // Columns are all `fr` units (proportional to the full row width) rather than `auto`
          // (content-sized) — `auto` columns pack tightly together with dead space left over on
          // the right, so the block reads like a stranded island instead of a natural extension of
          // the product row above it. `fr` units make it span the same full width as that row, with
          // spacing between columns that scales with the row instead of being fixed/cramped.
          <div className="text-xs">
            <div className="grid grid-cols-[3fr_1fr_1.2fr_1.2fr_1fr] gap-x-6 items-center border-b border-border/30 pb-1.5 text-muted-foreground font-semibold">
              <span>Batch #</span>
              <span className="text-right">Remaining</span>
              <span>Received</span>
              <span>Expiry</span>
              <span>Status</span>
            </div>
            {rows.map(b => {
              const days = daysLeft(b.expiryDate);
              return (
                <div key={b.id} className="grid grid-cols-[3fr_1fr_1.2fr_1.2fr_1fr] gap-x-6 items-center border-t border-border/30 py-1.5">
                  <span className="min-w-0 truncate font-mono" title={b.batchNumber}>{b.batchNumber}</span>
                  <span className="text-right font-medium whitespace-nowrap">{b.remainingQuantity} / {b.quantity}</span>
                  <span className="text-muted-foreground whitespace-nowrap">{fmtDate(b.receivedDate)}</span>
                  <span className="whitespace-nowrap">
                    {b.expiryDate ? (
                      <span className={days !== null && days < 0 ? "text-destructive font-medium" : days !== null && days <= 30 ? "text-warning-foreground font-medium" : "text-muted-foreground"}>
                        {fmtDate(b.expiryDate)}
                      </span>
                    ) : "—"}
                  </span>
                  <span className="whitespace-nowrap"><BatchStatusBadge status={b.status} /></span>
                </div>
              );
            })}
            {untracked > 0 && (
              <div className="grid grid-cols-[3fr_1fr_1.2fr_1.2fr_1fr] gap-x-6 items-center border-t border-dashed border-border/40 py-1.5 text-muted-foreground">
                <span className="italic" title="On-hand quantity not backed by an active batch here — e.g. stock received/adjusted before batch tracking, a manual count correction, or a batch that has since expired (see Batch Tracking).">No batch (untracked)</span>
                <span className="text-right font-medium whitespace-nowrap">{untracked}</span>
                <span>—</span>
                <span>—</span>
                <span>—</span>
              </div>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
