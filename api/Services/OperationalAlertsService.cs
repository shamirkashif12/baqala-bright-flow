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

    // The one definition of "near expiry" for this service — matches DashboardController's
    // "expiring soon" tile, so the Bell, the dashboard and the daily digest all agree on what
    // counts. (Note InventoryController's /batches/expiring endpoint takes a caller-supplied
    // daysAhead defaulting to 30 — that's an ad-hoc lookahead query, not this standing threshold.)
    private const int NearExpiryDays = 7;

    // Notification.Type for the daily digest. Also the dedup key that keeps it to once a day —
    // see SendDailyExpiryDigestAsync.
    private const string DigestType = "Daily Expiry Digest";

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
        await SendDailyExpiryDigestAsync(db, notifications, ct);
        await ScanOfflineTerminalsAsync(db, notifications, ct);
    }

    // ─── Daily near-expiry digest (FRD §13) ──────────────────────────────────
    //
    // ScanExpiringBatchesAsync already alerts per product as batches cross the 7-day horizon, but
    // those fire once and then stay silent while unread — deliberately, so the Bell isn't spammed
    // every 15 minutes. The consequence is that a near-expiry item nobody actions never surfaces
    // again: the alert is a one-shot on the *transition*, not a standing reminder of the backlog.
    //
    // This is that standing reminder: one summary per branch per day, listing everything currently
    // near expiry or expired, so the wastage watch-list gets looked at on a predictable cadence.
    //
    // "Once a day" is enforced against the Notifications table rather than a timer or an in-memory
    // flag: the scan loop is 15-minutely and the process restarts freely, so anything held in
    // memory would re-send the digest on every deploy. Asking the table "did today's digest already
    // go out for this branch?" is the same dedup approach the rest of this service uses, just
    // scoped by date instead of by unread.
    private const int DigestHourUtc = 5;      // 08:00 in Riyadh (UTC+3, no DST) — the tenant's morning.
    private const int NamesInDigest = 5;      // Beyond this the message becomes unreadable; the rest are counted.

    private async Task SendDailyExpiryDigestAsync(BaqalaDbContext db, INotificationService notifications, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        if (now.Hour < DigestHourUtc) return;

        var horizon = now.AddDays(NearExpiryDays);
        var todayStart = now.Date;

        // Note the RemainingQuantity filter deliberately does NOT apply to the expired side.
        // ScanExpiringBatchesAsync runs earlier in this same scan and writes an expired batch down
        // to RemainingQuantity = 0, so filtering on > 0 across the board would make the "expired"
        // half of this digest permanently empty — the summary would silently only ever report
        // near-expiry. An expired batch is counted if it was written off today, which is exactly
        // the thing the morning summary exists to report.
        var atRisk = await db.InventoryBatches
            .Include(b => b.Product)
            .Where(b => b.ExpiryDate != null && b.ExpiryDate <= horizon &&
                        (
                            // Near expiry: still sellable, still on the shelf.
                            (b.Status != "consumed" && b.Status != "expired" && b.RemainingQuantity > 0) ||
                            // Expired: written off (or awaiting write-off) today.
                            (b.Status == "expired" && b.UpdatedAt >= todayStart)
                        ))
            .ToListAsync(ct);

        if (atRisk.Count == 0) return;

        foreach (var group in atRisk.GroupBy(b => b.BranchId))
        {
            var branchId = group.Key;

            // One digest per branch per day. A branch whose digest already went out is skipped even
            // if new batches have since crossed the horizon — those already got their own per-product
            // alert from ScanExpiringBatchesAsync; this is a summary, not a second alert channel.
            var alreadySent = await db.Notifications.AnyAsync(n =>
                n.Type == DigestType && n.BranchId == branchId && n.CreatedAt >= todayStart, ct);
            if (alreadySent) continue;

            var expired = group.Where(b => b.ExpiryDate!.Value.Date < now.Date).ToList();
            var nearExpiry = group.Where(b => b.ExpiryDate!.Value.Date >= now.Date).ToList();

            var parts = new List<string>();
            if (nearExpiry.Count > 0)
                parts.Add($"{nearExpiry.Count} batch(es) expiring within {NearExpiryDays} days ({Describe(nearExpiry)})");
            if (expired.Count > 0)
                parts.Add($"{expired.Count} expired batch(es) ({Describe(expired)})");
            if (parts.Count == 0) continue;

            var units = group.Sum(b => b.RemainingQuantity);

            await notifications.NotifyRoleAsync(
                ["Manager", "Admin"], branchId,
                "Expiry / Perishable", DigestType, "Daily Expiry Summary",
                $"{string.Join("; ", parts)}. {units:0.##} unit(s) at risk — review the Batches watch-list.",
                severity: expired.Count > 0 ? "error" : "warning",
                entityType: "InventoryBatch");
        }
    }

    // "Milk, Labneh, Yoghurt +3 more" — enough to recognise the problem from the Bell without
    // opening the page, without pasting a hundred SKUs into a notification body.
    private static string Describe(List<Models.InventoryBatch> batches)
    {
        var names = batches
            .Select(b => b.Product?.Name)
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Distinct()
            .ToList();

        if (names.Count == 0) return "unnamed items";
        var shown = string.Join(", ", names.Take(NamesInDigest));
        return names.Count > NamesInDigest ? $"{shown} +{names.Count - NamesInDigest} more" : shown;
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
        var horizon = now.AddDays(NearExpiryDays);

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
                // On-hand either side of the write-off, for the audit trail. Read from the stock row
                // rather than derived from writtenOff: the removal clamps at zero, so a location
                // already short moves by less than the batch's remaining quantity.
                decimal? quantityBefore = null, quantityAfter = null;

                if (batch.BranchId.HasValue)
                {
                    var stock = await db.InventoryStocks.FirstOrDefaultAsync(s => s.BranchId == batch.BranchId && s.ProductId == batch.ProductId, ct);
                    if (stock != null)
                    {
                        quantityBefore = stock.Quantity;
                        stock.Quantity = Math.Max(0, stock.Quantity - writtenOff);
                        quantityAfter = stock.Quantity;
                        stock.LastUpdated = stock.UpdatedAt = now;
                    }
                }
                else if (batch.WarehouseId.HasValue)
                {
                    var stock = await db.WarehouseStocks.FirstOrDefaultAsync(s => s.WarehouseId == batch.WarehouseId && s.ProductId == batch.ProductId, ct);
                    if (stock != null)
                    {
                        quantityBefore = stock.Quantity;
                        stock.Quantity = Math.Max(0, stock.Quantity - writtenOff);
                        quantityAfter = stock.Quantity;
                        stock.LastUpdated = stock.UpdatedAt = now;
                    }
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
                    notes: "Automatic write-off: batch expired",
                    quantityBefore: quantityBefore, quantityAfter: quantityAfter);
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
