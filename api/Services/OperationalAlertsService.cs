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

        await ScanStockLevelsAsync(db, notifications, ct);
        await ScanExpiringBatchesAsync(db, notifications, ct);
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

    private async Task ScanExpiringBatchesAsync(BaqalaDbContext db, INotificationService notifications, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var horizon = now.AddDays(7); // matches DashboardController's "expiring soon" tile

        var batches = await db.InventoryBatches
            .Include(b => b.Product)
            .Where(b => b.Status == "active" && b.RemainingQuantity > 0
                && b.ExpiryDate != null && b.ExpiryDate <= horizon)
            .ToListAsync(ct);

        foreach (var batch in batches)
        {
            var isExpired = batch.ExpiryDate!.Value < now;
            var type = isExpired ? "Product Expired" : "Product Near Expiry";

            var alreadyNotified = await db.Notifications.AnyAsync(n =>
                n.Type == type && n.EntityId == batch.ProductId && n.BranchId == batch.BranchId && !n.IsRead, ct);
            if (alreadyNotified) continue;

            var message = isExpired
                ? $"Expired item detected: {batch.Product?.Name}"
                : $"Expiry alert: {batch.Product?.Name} expires in {Math.Max(0, (int)(batch.ExpiryDate!.Value.Date - now.Date).TotalDays)} days";

            await notifications.NotifyRoleAsync(["Manager", "Admin"], batch.BranchId,
                "Expiry / Perishable", type, type, message,
                severity: isExpired ? "error" : "warning",
                entityType: "Product", entityId: batch.ProductId);
        }
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
