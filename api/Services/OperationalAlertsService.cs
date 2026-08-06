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
        var audit = scope.ServiceProvider.GetRequiredService<IAuditService>();

        await ScanStockLevelsAsync(db, notifications, ct);
        await ScanExpiringBatchesAsync(db, notifications, ct);
        await ScanUnrecalledExpiredBatchesAsync(db, notifications, ct);
        await SendDailyExpiryDigestAsync(db, notifications, ct);
        await ScanOfflineTerminalsAsync(db, notifications, ct);
        await ScanOverdueLeaveRequestsAsync(db, notifications, audit, ct);
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

        // Expired batches keep their RemainingQuantity (ScanExpiringBatchesAsync no longer
        // zeroes it on transition — see that method), so both halves of this digest use the
        // same RemainingQuantity > 0 filter: an expired batch keeps showing up here every
        // morning until someone Discards or Reclaims it, not just on the day it expired.
        var atRisk = await db.InventoryBatches
            .Include(b => b.Product)
            .Where(b => b.ExpiryDate != null && b.ExpiryDate <= horizon && b.RemainingQuantity > 0 &&
                        (
                            // Near expiry: still sellable, still on the shelf.
                            (b.Status != "consumed" && b.Status != "expired") ||
                            // Expired: awaiting Discard/Reclaim.
                            b.Status == "expired"
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
        if (lowOrOutStocks.Count == 0) return;

        // InventoryStock has no Branch navigation property — one small dictionary lookup for the
        // whole sweep (instead of a per-row query) names the branch in every message.
        var branchNames = await db.Branches.ToDictionaryAsync(b => b.Id, b => b.Name, ct);

        foreach (var stock in lowOrOutStocks)
        {
            var isOutOfStock = stock.Quantity <= 0;
            var type = isOutOfStock ? "Out of Stock" : "Low Stock Alert";

            var alreadyNotified = await db.Notifications.AnyAsync(n =>
                n.Type == type && n.EntityId == stock.ProductId && n.BranchId == stock.BranchId && !n.IsRead, ct);
            if (alreadyNotified) continue;

            var branchSuffix = branchNames.TryGetValue(stock.BranchId, out var bn) ? $" at {bn}" : "";
            var message = isOutOfStock
                ? $"Out of stock: {stock.Product!.Name}{branchSuffix}"
                : $"Low stock: {stock.Product!.Name} only {stock.Quantity:F0} units left{branchSuffix}";

            await notifications.NotifyRoleAsync(["Manager", "Admin"], stock.BranchId,
                "Inventory", type, type, message,
                severity: isOutOfStock ? "error" : "warning",
                entityType: "Product", entityId: stock.ProductId);
        }
    }

    // Transitions the batch (active → near_expiry → expired) and fires the matching alert.
    // Deliberately does NOT write off the batch's remaining quantity on the transition into
    // expired — that used to happen here automatically (decrementing aggregate stock, zeroing
    // RemainingQuantity, logging an InventoryAdjustment), which pre-empted the manual
    // Discard/Reclaim flow on the Batches & Expiry page: by the time a person looked at an
    // "Expired" row, RemainingQuantity was already 0 and there was nothing left to action.
    // Now expiry only flips Status (which already blocks sale — OrdersController checks
    // ExpiryDate/Status directly, not RemainingQuantity) and RemainingQuantity stays real until
    // a person actually Discards (wastage, maker-checker approved — InventoryController) or
    // Reclaims (return-to-supplier) it.
    private async Task ScanExpiringBatchesAsync(BaqalaDbContext db, INotificationService notifications, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var horizon = now.AddDays(NearExpiryDays);

        // Status == "expired" is included here too, not just active/near_expiry, so a batch that's
        // already expired but still sitting with real stock (nobody has Discarded/Reclaimed it yet)
        // keeps getting picked up on every sweep — the Status flip below only fires once, but the
        // batch itself needs to keep surfacing until it's actually actioned. RemainingQuantity > 0
        // is what makes this idempotent-in-effect: once a person zeroes it out via Discard or
        // Reclaim, the batch drops out of this query on its own.
        var batches = await db.InventoryBatches
            .Include(b => b.Product)
            .Where(b => b.Status != "consumed" && b.RemainingQuantity > 0
                && b.ExpiryDate != null && b.ExpiryDate <= horizon)
            .ToListAsync(ct);

        // Named once for the whole sweep — a batch is branch- or warehouse-held, never both, so
        // exactly one of these two lookups resolves per batch below.
        var branchNames = batches.Count > 0 ? await db.Branches.ToDictionaryAsync(b => b.Id, b => b.Name, ct) : new Dictionary<Guid, string>();
        var warehouseNames = batches.Count > 0 ? await db.Warehouses.ToDictionaryAsync(w => w.Id, w => w.Name, ct) : new Dictionary<Guid, string>();

        foreach (var batch in batches)
        {
            var isExpired = batch.ExpiryDate!.Value.Date < now.Date;

            if (isExpired)
            {
                batch.Status = "expired";
                batch.UpdatedAt = now;

                await TryAutoRecallAsync(db, notifications, batch, now, ct);
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
                var locationName =
                    (batch.BranchId.HasValue && branchNames.TryGetValue(batch.BranchId.Value, out var bn)) ? bn :
                    (batch.WarehouseId.HasValue && warehouseNames.TryGetValue(batch.WarehouseId.Value, out var wn)) ? wn : null;
                var locationSuffix = locationName is null ? "" : $" at {locationName}";
                var message = isExpired
                    ? $"Expired item detected: {batch.Product?.Name}{locationSuffix} — {batch.RemainingQuantity} unit(s) awaiting write-off"
                    : $"Expiry alert: {batch.Product?.Name}{locationSuffix} expires in {Math.Max(0, (int)(batch.ExpiryDate!.Value.Date - now.Date).TotalDays)} days";

                await notifications.NotifyRoleAsync(["Manager", "Admin"], batch.BranchId,
                    "Expiry / Perishable", type, type, message,
                    severity: isExpired ? "error" : "warning",
                    entityType: "Product", entityId: batch.ProductId);
            }
        }

        if (batches.Count > 0) await db.SaveChangesAsync(ct);
    }

    // Auto-open a recall for the expired lot instead of leaving it to a manager to notice the
    // "Expired" badge on the informational watch-list and file one by hand — sale of this batch
    // is already blocked (OrdersController separately checks ExpiryDate/Status regardless of
    // recalls), but until now nothing here ever wrote a ProductRecall row, so the Recalls tab and
    // its audit/notification trail stayed silent about expired stock unless a person opened one
    // manually. Skipped if a recall already covers this batch or the whole product — safe to call
    // repeatedly (every sweep, and from two different call sites) since it's a no-op once one exists.
    private async Task TryAutoRecallAsync(BaqalaDbContext db, INotificationService notifications, Models.InventoryBatch batch, DateTime now, CancellationToken ct)
    {
        var alreadyRecalled = await db.ProductRecalls.AnyAsync(r =>
            r.ProductId == batch.ProductId && r.Status == "open" &&
            (r.BatchId == batch.Id || r.BatchId == null), ct);
        if (alreadyRecalled) return;

        db.ProductRecalls.Add(new Models.ProductRecall
        {
            Id = Guid.NewGuid(),
            RecallNumber = $"RCL-{now:yyyyMMdd}-{Guid.NewGuid().ToString()[..4]}",
            ProductId = batch.ProductId,
            BatchId = batch.Id,
            BranchId = batch.BranchId,
            Reason = $"Auto-recalled: batch {batch.BatchNumber ?? batch.Id.ToString()[..8]} passed its expiry date ({batch.ExpiryDate:yyyy-MM-dd}).",
            RecallType = "quality_issue",
            Severity = "high",
            Status = "open",
            CreatedAt = now,
            UpdatedAt = now,
        });

        await notifications.NotifyRoleAsync(["Manager", "Admin"], batch.BranchId,
            "Expiry / Perishable", "Auto-Recall Opened", "Auto-Recall Opened",
            $"{batch.Product?.Name} (batch {batch.BatchNumber}) auto-recalled — expired stock is blocked from sale.",
            severity: "error", entityType: "Product", entityId: batch.ProductId);
    }

    // Catches batches that are ALREADY sitting at Status "expired" but were never auto-recalled —
    // not just ones transitioning into that state during THIS sweep (ScanExpiringBatchesAsync
    // above only ever sees a batch once, on the transition). A batch can land in "expired" by a
    // path other than that transition — imported/seeded data, or simply having expired before this
    // auto-recall feature existed — and would otherwise sit unrecalled forever. Runs every cycle;
    // TryAutoRecallAsync's own existence check keeps it a no-op once a batch has been covered.
    private async Task ScanUnrecalledExpiredBatchesAsync(BaqalaDbContext db, INotificationService notifications, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var expiredBatches = await db.InventoryBatches.Include(b => b.Product)
            .Where(b => b.Status == "expired")
            .ToListAsync(ct);

        foreach (var batch in expiredBatches)
            await TryAutoRecallAsync(db, notifications, batch, now, ct);

        if (expiredBatches.Count > 0) await db.SaveChangesAsync(ct);
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
                severity: "error", entityType: "Terminal", entityId: terminal.Id,
                terminalId: terminal.Id);
        }
    }

    // A Pending leave request whose start date has already arrived is leave that's already
    // underway with no decision made — nothing transitions it there on its own (it just sits,
    // untouched, past its own FromDate), so this is the same "standing condition" shape as
    // ScanOfflineTerminalsAsync above rather than a one-shot action tied to a single call site.
    private async Task ScanOverdueLeaveRequestsAsync(BaqalaDbContext db, INotificationService notifications, IAuditService audit, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var overdue = await db.LeaveRequests
            .Include(l => l.Employee)
            .Where(l => l.Status == "pending" && l.FromDate <= today)
            .ToListAsync(ct);

        foreach (var leave in overdue)
        {
            if (leave.Employee is null) continue;

            var alreadyNotified = await db.Notifications.AnyAsync(n =>
                n.Type == "Leave Request Overdue" && n.EntityId == leave.Id && !n.IsRead, ct);
            if (alreadyNotified) continue;

            var message = $"{leave.Employee.FullName} — leave starting {leave.FromDate:yyyy-MM-dd} is still Pending and needs a decision.";

            await audit.LogAsync(
                action: "Leave request overdue — still pending",
                entityType: "LeaveRequest",
                entityId: leave.Id,
                branchId: leave.Employee.BranchId,
                details: message,
                severity: "warning",
                module: "Leave Management",
                employeeId: leave.EmployeeId);

            await notifications.NotifyRoleAsync(["Manager", "Admin"], leave.Employee.BranchId,
                "Leave Management", "Leave Request Overdue", "Leave Request Overdue", message,
                severity: "warning", entityType: "LeaveRequest", entityId: leave.Id,
                alsoUserId: leave.ApproverId);
        }
    }
}
