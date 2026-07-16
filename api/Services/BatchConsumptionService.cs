using BaqalaPOS.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

// Sales (and other stock-reducing actions) only ever touch the aggregate InventoryStock/
// WarehouseStock row — that stays the sole source of truth for checkout. This keeps each
// InventoryBatch's RemainingQuantity roughly in sync with that aggregate by walking the
// product's batches FEFO (earliest expiry first; batches with no expiry sort last, then by
// received date) and decrementing until `quantity` is exhausted, so the batch drill-down UI
// isn't stuck showing a static "still full" remaining quantity forever after items sell.
// Deliberately best-effort: batch remaining-quantity is traceability data, not transactional
// state — callers must invoke this in a try/catch AFTER their own stock write has already
// succeeded, exactly like IStockAlertService.CheckStockLevelAsync, so a bug here can never fail
// or slow down an actual sale. No row locking (matches every other stock mutation in this
// codebase, none of which lock either) — under concurrent sales this can under/over-consume a
// specific batch, which is an acceptable trade-off for analytics data.
public interface IBatchConsumptionService
{
    Task ConsumeFefoAsync(Guid productId, Guid? branchId, Guid? warehouseId, decimal quantity, CancellationToken ct = default);
    Task RestoreFefoAsync(Guid productId, Guid? branchId, Guid? warehouseId, decimal quantity, CancellationToken ct = default);
}

public class BatchConsumptionService(BaqalaDbContext db) : IBatchConsumptionService
{
    public async Task ConsumeFefoAsync(Guid productId, Guid? branchId, Guid? warehouseId, decimal quantity, CancellationToken ct = default)
    {
        if (quantity <= 0 || (!branchId.HasValue && !warehouseId.HasValue)) return;

        var query = db.InventoryBatches.Where(b =>
            b.ProductId == productId && b.Status != "expired" && b.Status != "consumed" && b.RemainingQuantity > 0);
        query = branchId.HasValue ? query.Where(b => b.BranchId == branchId) : query.Where(b => b.WarehouseId == warehouseId);

        var batches = await query
            .OrderBy(b => b.ExpiryDate ?? DateTime.MaxValue).ThenBy(b => b.ReceivedDate)
            .ToListAsync(ct);
        if (batches.Count == 0) return;

        var remaining = quantity;
        foreach (var batch in batches)
        {
            if (remaining <= 0) break;
            var take = Math.Min(batch.RemainingQuantity, remaining);
            batch.RemainingQuantity -= take;
            batch.UpdatedAt = DateTime.UtcNow;
            remaining -= take;
        }

        await db.SaveChangesAsync(ct);
    }

    // Inverse of ConsumeFefoAsync — a void or a completed customer return hands stock back to the
    // branch, but until now only ever bumped the aggregate InventoryStock row, never the specific
    // batch ConsumeFefoAsync had drawn down at sale time. That left a batch's RemainingQuantity
    // permanently understated (and its expiry invisible in the batch drill-down, which filters to
    // remainingQuantity > 0) even after the sale that consumed it was reversed. Since no per-item
    // batch is actually recorded on the sale (see OrdersController.Create's comment on
    // ConsumeFefoAsync — traceability data, not transactional state), this credits back in the
    // same FEFO order consumption used, capping each batch at how much room it has to be topped
    // back up to its original received Quantity — the same convention
    // InventoryController.Adjust/StockTransfersController.RestoreSourceAsync already use for
    // crediting a batch: RemainingQuantity can rise, Quantity (originally received) never does.
    public async Task RestoreFefoAsync(Guid productId, Guid? branchId, Guid? warehouseId, decimal quantity, CancellationToken ct = default)
    {
        if (quantity <= 0 || (!branchId.HasValue && !warehouseId.HasValue)) return;

        var query = db.InventoryBatches.Where(b => b.ProductId == productId && b.Status != "expired" && b.RemainingQuantity < b.Quantity);
        query = branchId.HasValue ? query.Where(b => b.BranchId == branchId) : query.Where(b => b.WarehouseId == warehouseId);

        var batches = await query
            .OrderBy(b => b.ExpiryDate ?? DateTime.MaxValue).ThenBy(b => b.ReceivedDate)
            .ToListAsync(ct);
        if (batches.Count == 0) return;

        var remaining = quantity;
        foreach (var batch in batches)
        {
            if (remaining <= 0) break;
            var room = batch.Quantity - batch.RemainingQuantity;
            var give = Math.Min(room, remaining);
            batch.RemainingQuantity += give;
            batch.UpdatedAt = DateTime.UtcNow;
            if (batch.Status == "consumed" && batch.RemainingQuantity > 0) batch.Status = "active";
            remaining -= give;
        }

        await db.SaveChangesAsync(ct);
    }
}
