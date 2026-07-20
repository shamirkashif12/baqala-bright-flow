using BaqalaPOS.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

// What a consume actually drew down: which lot, how much, and at what cost.
//
// This is the return value that makes FIFO *costing* possible. FEFO/FIFO picking only decided the
// order batches were walked; the caller learned nothing about what it consumed, so the actual
// purchase cost of the units sold was discarded and every report fell back to Product.CostPrice —
// a single moving value that retroactively re-costs historic sales whenever it changes.
public record BatchConsumption(Guid BatchId, string? BatchNumber, decimal Quantity, decimal? UnitCost)
{
    // Null UnitCost (a batch received with no recorded PurchaseCost) contributes nothing rather
    // than zero — a zero would understate COGS and silently inflate margin, which is worse than
    // the caller knowing the cost is incomplete.
    public decimal? LineCost => UnitCost.HasValue ? UnitCost.Value * Quantity : null;
}

// Sales (and other stock-reducing actions) only ever touch the aggregate InventoryStock/
// WarehouseStock row — that stays the sole source of truth for checkout. This keeps each
// InventoryBatch's RemainingQuantity roughly in sync with that aggregate by walking the product's
// batches in the configured picking order and decrementing until `quantity` is exhausted, so the
// batch drill-down UI isn't stuck showing a static "still full" remaining quantity forever after
// items sell.
//
// Deliberately best-effort: batch remaining-quantity is traceability data, not transactional
// state — callers must invoke this in a try/catch AFTER their own stock write has already
// succeeded, exactly like IStockAlertService.CheckStockLevelAsync, so a bug here can never fail or
// slow down an actual sale. That contract is unchanged, and it is also why a caller that wants the
// returned cost must tolerate getting an empty list back.
//
// No row locking (matches every other stock mutation in this codebase, none of which lock either) —
// under concurrent sales this can under/over-consume a specific batch, which is an acceptable
// trade-off for analytics data.
public interface IBatchConsumptionService
{
    // Returns the batches actually drawn down, in pick order. Empty when nothing could be
    // consumed (no batches, or the product isn't batch-tracked at this location) — which is not an
    // error: batch tracking is optional per product.
    //
    // The name is historical (this used to be FEFO-only). It now honours the location's configured
    // picking strategy — FEFO by default, FIFO when set — resolved per call unless `strategy` is
    // passed explicitly. Kept as-is so existing call sites (sales, returns, voids) stay untouched.
    Task<IReadOnlyList<BatchConsumption>> ConsumeFefoAsync(
        Guid productId, Guid? branchId, Guid? warehouseId, decimal quantity,
        string? strategy = null, CancellationToken ct = default);

    Task RestoreFefoAsync(
        Guid productId, Guid? branchId, Guid? warehouseId, decimal quantity,
        string? strategy = null, CancellationToken ct = default);

    // Resolves the picking strategy configured for a location. Exposed so callers that need to
    // record *which* strategy produced a consumption (or show it in the UI) don't have to
    // duplicate the settings lookup.
    Task<string> GetStrategyAsync(Guid? branchId, CancellationToken ct = default);
}

public class BatchConsumptionService(BaqalaDbContext db) : IBatchConsumptionService
{
    // FEFO — First Expired, First Out: pick whatever spoils soonest. The right default for a
    // grocery, and the behaviour this service has always had, so an unconfigured tenant sees no
    // change.
    public const string Fefo = "fefo";

    // FIFO — First In, First Out: pick whatever was received earliest, regardless of expiry.
    public const string Fifo = "fifo";

    // Per-branch tenant_settings key. Absent (the default) means FEFO.
    public const string StrategySettingKey = "inventory_picking_strategy";

    public async Task<string> GetStrategyAsync(Guid? branchId, CancellationToken ct = default)
    {
        // A warehouse has no branch to hang a setting off (tenant_settings.branch_id is required),
        // so warehouse picking always uses the default.
        if (!branchId.HasValue) return Fefo;

        var value = await db.TenantSettings
            .Where(s => s.BranchId == branchId && s.SettingKey == StrategySettingKey)
            .Select(s => s.SettingValue)
            .FirstOrDefaultAsync(ct);

        return Normalize(value);
    }

    // Anything unrecognised falls back to FEFO rather than throwing: a typo in a settings row must
    // not be able to fail a sale.
    private static string Normalize(string? value) =>
        string.Equals(value, Fifo, StringComparison.OrdinalIgnoreCase) ? Fifo : Fefo;

    public async Task<IReadOnlyList<BatchConsumption>> ConsumeFefoAsync(
        Guid productId, Guid? branchId, Guid? warehouseId, decimal quantity,
        string? strategy = null, CancellationToken ct = default)
    {
        if (quantity <= 0 || (!branchId.HasValue && !warehouseId.HasValue)) return [];

        var batches = await PickOrdered(
            db.InventoryBatches.Where(b =>
                b.ProductId == productId && b.Status != "expired" && b.Status != "consumed" && b.RemainingQuantity > 0),
            branchId, warehouseId,
            strategy is null ? await GetStrategyAsync(branchId, ct) : Normalize(strategy))
            .ToListAsync(ct);

        if (batches.Count == 0) return [];

        var consumed = new List<BatchConsumption>();
        var remaining = quantity;

        foreach (var batch in batches)
        {
            if (remaining <= 0) break;
            var take = Math.Min(batch.RemainingQuantity, remaining);
            batch.RemainingQuantity -= take;
            batch.UpdatedAt = DateTime.UtcNow;

            // Retire the lot once it's empty. Nothing ever wrote this status before, even though
            // both the consume filter above and RestoreFefoAsync's active-revival below already branch
            // on it — so "consumed" was a documented state the data could never reach, and an
            // exhausted lot stayed "active" forever.
            if (batch.RemainingQuantity <= 0) batch.Status = "consumed";

            consumed.Add(new BatchConsumption(batch.Id, batch.BatchNumber, take, batch.PurchaseCost));
            remaining -= take;
        }

        await db.SaveChangesAsync(ct);
        return consumed;
    }

    // Inverse of ConsumeFefoAsync — a void or a completed customer return hands stock back to the
    // branch, but until now only ever bumped the aggregate InventoryStock row, never the specific
    // batch ConsumeFefoAsync had drawn down at sale time. That left a batch's RemainingQuantity
    // permanently understated (and its expiry invisible in the batch drill-down, which filters to
    // remainingQuantity > 0) even after the sale that consumed it was reversed. Since no per-item
    // batch is recorded on the sale, this credits back in the same order consumption used, capping
    // each batch at how much room it has to be topped back up to its original received Quantity —
    // the same convention InventoryController.Adjust and
    // StockTransfersController.RestoreSourceAsync already use for crediting a batch:
    // RemainingQuantity can rise, Quantity (originally received) never does.
    public async Task RestoreFefoAsync(
        Guid productId, Guid? branchId, Guid? warehouseId, decimal quantity,
        string? strategy = null, CancellationToken ct = default)
    {
        if (quantity <= 0 || (!branchId.HasValue && !warehouseId.HasValue)) return;

        var batches = await PickOrdered(
            db.InventoryBatches.Where(b =>
                b.ProductId == productId && b.Status != "expired" && b.RemainingQuantity < b.Quantity),
            branchId, warehouseId,
            strategy is null ? await GetStrategyAsync(branchId, ct) : Normalize(strategy))
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

    // The one place pick order is defined, shared by consume and restore so a return always credits
    // back in the same order the sale drew down.
    private static IQueryable<Models.InventoryBatch> PickOrdered(
        IQueryable<Models.InventoryBatch> query, Guid? branchId, Guid? warehouseId, string strategy)
    {
        query = branchId.HasValue
            ? query.Where(b => b.BranchId == branchId)
            : query.Where(b => b.WarehouseId == warehouseId);

        return strategy == Fifo
            // FIFO: oldest received first. Expiry is only a tiebreak between same-day receipts.
            ? query.OrderBy(b => b.ReceivedDate).ThenBy(b => b.ExpiryDate ?? DateTime.MaxValue)
            // FEFO: earliest expiry first; batches with no expiry sort last, then by received date.
            : query.OrderBy(b => b.ExpiryDate ?? DateTime.MaxValue).ThenBy(b => b.ReceivedDate);
    }
}
