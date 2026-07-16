using BaqalaPOS.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

// Low stock / out-of-stock / near-expiry / expired / terminal-offline aren't discrete actions
// with a single call site to hook (unlike "shift opened" or "return created") — they're standing
// conditions that become true between requests, so nothing fires a notification on its own. This
// background scan periodically checks for those conditions and creates one, mirroring the same
// thresholds DashboardController's live tiles already use (InventoryStock.ReorderLevel, 7-day
// expiry horizon) so the Bell and the dashboard agree on what counts as "low"/"near expiry".
//
// Dedup is coarse (skip if ANY unread notification of that Type+EntityId+BranchId already
// exists) rather than per-recipient — simple, and re-notifies once the existing one is read if
// the condition is still true next cycle, which is an acceptable amount of repetition for an
// alert that's still active.
public class OperationalAlertsService(IServiceScopeFactory scopeFactory, ILogger<OperationalAlertsService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan InitialDelay = TimeSpan.FromSeconds(20);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(InitialDelay, stoppingToken); } catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunScanAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Operational alert scan failed");
            }

            try { await Task.Delay(Interval, stoppingToken); } catch (OperationCanceledException) { break; }
        }
    }

    private async Task RunScanAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BaqalaDbContext>();
        var notifications = scope.ServiceProvider.GetRequiredService<INotificationService>();
        var stockMovements = scope.ServiceProvider.GetRequiredService<IStockMovementService>();

        await ScanStockLevelsAsync(db, notifications, ct);
        await ScanExpiringBatchesAsync(db, notifications, stockMovements, ct);
        await ScanOfflineTerminalsAsync(db, notifications, ct);
    }

    private async Task ScanStockLevelsAsync(BaqalaDbContext db, INotificationService notifications, CancellationToken ct)
    {
        var lowOrOutStocks = await db.InventoryStocks
            .Include(s => s.Product)
            .Where(s => s.Product != null && s.Product.Status == "active" && s.Quantity <= s.ReorderLevel)
            .ToListAsync(ct);

        foreach (var stock in lowOrOutStocks)
        {
            var isOutOfStock = stock.Quantity <= 0;
            var type = isOutOfStock ? "Out of Stock" : "Low Stock Alert";

            var alreadyNotified = await db.Notifications.AnyAsync(n =>
                n.Type == type && n.EntityId == stock.ProductId && n.BranchId == stock.BranchId && !n.IsRead, ct);
            if (alreadyNotified) continue;

            var message = isOutOfStock
                ? $"Out of stock: {stock.Product!.Name}"
                : $"Low stock: {stock.Product!.Name} only {stock.Quantity:F0} units left";

            await notifications.NotifyRoleAsync(["Manager", "Admin"], stock.BranchId,
                "Inventory", type, type, message,
                severity: isOutOfStock ? "error" : "warning",
                entityType: "Product", entityId: stock.ProductId);
        }
    }

    // Previously this only sent notifications and never touched the batch itself — Status stayed
    // "active" forever, RemainingQuantity was never written off, and the aggregate stock
    // (InventoryStock/WarehouseStock) kept counting expired units as sellable on-hand stock. Now
    // it actually transitions the batch (active → near_expiry → expired), and on the transition
    // INTO expired, writes off the batch's remaining quantity: decrements the aggregate stock,
    // zeroes the batch, and logs an InventoryAdjustment audit row (AdjustmentType "expired") — that
    // adjustment log, plus the Batches & Expiry page filtered to status=expired, IS the "expiry
    // table" the write-off lands in; no separate table needed.
    private async Task ScanExpiringBatchesAsync(BaqalaDbContext db, INotificationService notifications, IStockMovementService stockMovements, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var horizon = now.AddDays(7); // matches DashboardController's "expiring soon" tile

        var batches = await db.InventoryBatches
            .Include(b => b.Product)
            .Where(b => b.Status != "expired" && b.Status != "consumed" && b.RemainingQuantity > 0
                && b.ExpiryDate != null && b.ExpiryDate <= horizon)
            .ToListAsync(ct);

        foreach (var batch in batches)
        {
            var isExpired = batch.ExpiryDate!.Value.Date < now.Date;
            var writtenOff = batch.RemainingQuantity;

            if (isExpired)
            {
                if (batch.BranchId.HasValue)
                {
                    var stock = await db.InventoryStocks.FirstOrDefaultAsync(s => s.BranchId == batch.BranchId && s.ProductId == batch.ProductId, ct);
                    if (stock != null) { stock.Quantity = Math.Max(0, stock.Quantity - writtenOff); stock.LastUpdated = stock.UpdatedAt = now; }
                }
                else if (batch.WarehouseId.HasValue)
                {
                    var stock = await db.WarehouseStocks.FirstOrDefaultAsync(s => s.WarehouseId == batch.WarehouseId && s.ProductId == batch.ProductId, ct);
                    if (stock != null) { stock.Quantity = Math.Max(0, stock.Quantity - writtenOff); stock.LastUpdated = stock.UpdatedAt = now; }
                }

                db.InventoryAdjustments.Add(new Models.InventoryAdjustment
                {
                    Id = Guid.NewGuid(),
                    ProductId = batch.ProductId,
                    BranchId = batch.BranchId,
                    WarehouseId = batch.WarehouseId,
                    BatchId = batch.Id,
                    AdjustmentType = "expired",
                    Quantity = writtenOff,
                    Reason = "Automatic write-off: batch expired",
                    AdjustedBy = null,
                    CreatedAt = now,
                });

                batch.Status = "expired";
                batch.RemainingQuantity = 0;
                batch.UpdatedAt = now;

                stockMovements.Record(
                    batch.ProductId, batch.BranchId, batch.WarehouseId, "expired", -writtenOff,
                    batchId: batch.Id, referenceType: "batch_expiry", referenceId: batch.Id,
                    notes: "Automatic write-off: batch expired");
            }
            else if (batch.Status == "active")
            {
                batch.Status = "near_expiry";
                batch.UpdatedAt = now;
            }

            var type = isExpired ? "Product Expired" : "Product Near Expiry";
            var alreadyNotified = await db.Notifications.AnyAsync(n =>
                n.Type == type && n.EntityId == batch.ProductId && n.BranchId == batch.BranchId && !n.IsRead, ct);
            if (!alreadyNotified)
            {
                var message = isExpired
                    ? $"Expired item detected: {batch.Product?.Name} — {writtenOff} unit(s) written off"
                    : $"Expiry alert: {batch.Product?.Name} expires in {Math.Max(0, (int)(batch.ExpiryDate!.Value.Date - now.Date).TotalDays)} days";

                await notifications.NotifyRoleAsync(["Manager", "Admin"], batch.BranchId,
                    "Expiry / Perishable", type, type, message,
                    severity: isExpired ? "error" : "warning",
                    entityType: "Product", entityId: batch.ProductId);
            }
        }

        if (batches.Count > 0) await db.SaveChangesAsync(ct);
    }

    // TerminalsController.UpdateStatus only fires "Terminal Offline" on the transition into
    // offline — a terminal that was already offline before that endpoint was called (or before
    // this notification system existed) would otherwise never surface here. Scanning the
    // standing `Status == "offline"` condition on the same cadence as stock/expiry closes that
    // gap and matches what the old client-computed "offline terminals" tile showed, just backed
    // by a real persisted row instead of a per-poll recomputation.
    private async Task ScanOfflineTerminalsAsync(BaqalaDbContext db, INotificationService notifications, CancellationToken ct)
    {
        var offlineTerminals = await db.Terminals.Where(t => t.Status == "offline").ToListAsync(ct);

        foreach (var terminal in offlineTerminals)
        {
            var alreadyNotified = await db.Notifications.AnyAsync(n =>
                n.Type == "Terminal Offline" && n.EntityId == terminal.Id && !n.IsRead, ct);
            if (alreadyNotified) continue;

            await notifications.NotifyRoleAsync(["Manager", "Admin"], terminal.BranchId,
                "Terminal / Branch", "Terminal Offline", "Terminal Offline",
                $"Terminal {terminal.Name} is offline",
                severity: "error", entityType: "Terminal", entityId: terminal.Id);
        }
    }
}
