import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, type ProductPerformanceDetail, type StockMovement } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { toast } from "sonner";

// Mirrors batch-tracking.tsx's MOVEMENT_TYPE_LABELS — same ledger, same labels. Covers every
// literal movementType string actually written by StockMovementService.Record() call sites
// (adjustments are recorded as "adjustment_{AdjustmentType}", not the bare wastage-type name).
const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  manual_receive: "Manual Receive",
  purchase_receive: "PO Receive",
  transfer_out: "Transfer Out",
  transfer_in: "Transfer In",
  transfer_restore: "Transfer Restore",
  sale: "Sale",
  return_restock: "Customer Return Restock",
  adjustment_addition: "Adjustment (Addition)",
  adjustment_subtraction: "Adjustment (Subtraction)",
  adjustment_waste: "Waste",
  adjustment_damage: "Damage",
  adjustment_theft: "Theft",
  adjustment_expired: "Expiry Write-off",
  adjustment_other: "Other Adjustment",
  adjustment_return_to_supplier: "Return to Supplier",
  adjustment_reversal: "Adjustment Reversal",
  reconciliation_addition: "Stocktake Addition",
  reconciliation_subtraction: "Stocktake Subtraction",
  damage: "Damage (Recall)",
};

// Shared drill-down behind a single product row — used by both the Inventory Aging and the
// Product Performance reports (same underlying data: recent sales, current batches, stock
// movement history), so a product's detail can never disagree between the two pages.
//
// One product's aggregate row can't show per-transaction detail itself (that's the point of an
// aggregate), so drill-down is a second, on-demand fetch scoped to the clicked product rather
// than embedding every sale/movement in the list payload.
export function ProductDrillDownDrawer({ productId, from, to, onClose }: { productId: string | null; from: string; to: string; onClose: () => void }) {
  const [detail, setDetail] = useState<ProductPerformanceDetail | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productId) { setDetail(null); setMovements([]); return; }
    setLoading(true);
    Promise.all([
      api.getProductPerformanceDetail(productId, { from, to }),
      api.getStockMovements({ productId, from, to, limit: 50 }),
    ])
      .then(([d, m]) => { setDetail(d); setMovements(m); })
      .catch(() => toast.error("Failed to load product detail"))
      .finally(() => setLoading(false));
  }, [productId, from, to]);

  return (
    <Sheet open={!!productId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[560px] overflow-y-auto">
        {loading ? (
          <div className="text-muted-foreground text-sm py-4">Loading…</div>
        ) : detail && (
          <>
            <SheetHeader className="pb-4 border-b border-border/60">
              <SheetTitle className="text-base">{detail.productName}</SheetTitle>
              <p className="text-xs text-muted-foreground font-mono">{detail.sku}</p>
            </SheetHeader>
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Recent Sales ({detail.recentSales.length})
              </p>
              {detail.recentSales.length === 0 ? (
                <p className="text-xs text-muted-foreground">No sales in the selected date range.</p>
              ) : (
                <div className="space-y-1.5">
                  {detail.recentSales.map((s, idx) => (
                    <div key={idx} className="rounded-xl border border-border/40 px-3 py-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{new Date(s.date).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        <span className="font-semibold"><SARIcon />{fmtSAR(s.netAmount)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-muted-foreground">
                        <span>{s.branch}</span>
                        <span>Sold by {s.employee}</span>
                        <span>Qty {s.quantity}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Current Batches ({detail.batches.length})
              </p>
              {detail.batches.length === 0 ? (
                <p className="text-xs text-muted-foreground">No stock on hand.</p>
              ) : (
                <div className="space-y-1.5">
                  {detail.batches.map((b, idx) => (
                    <div key={idx} className="rounded-xl border border-border/40 px-3 py-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{b.location}</span>
                        <span className="font-semibold">{b.remainingQuantity} remaining</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-muted-foreground">
                        {b.supplier && <span>Supplier: {b.supplier}</span>}
                        {b.batchNumber && <span className="font-mono">{b.batchNumber}</span>}
                        <span>Received {new Date(b.receivedDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
                        {b.expiryDate && <span>Expires {new Date(b.expiryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Stock Movement History ({movements.length})
              </p>
              {movements.length === 0 ? (
                <p className="text-xs text-muted-foreground">No recorded movements in the selected date range.</p>
              ) : (
                <div className="space-y-1.5">
                  {movements.map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded-xl border border-border/40 px-3 py-2.5 text-xs">
                      <div>
                        <p className="font-medium">{MOVEMENT_TYPE_LABELS[m.movementType] ?? m.movementType}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground">
                          <span>{new Date(m.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          <span>{m.branch?.name ?? m.warehouse?.name ?? "—"}</span>
                          {m.referenceNumber && <span>{m.referenceNumber}</span>}
                          {m.createdByUser && <span>By {m.createdByUser.fullName}</span>}
                        </div>
                      </div>
                      <span className={m.quantity < 0 ? "text-destructive font-semibold" : "text-success font-semibold"}>
                        {m.quantity > 0 ? "+" : ""}{m.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
