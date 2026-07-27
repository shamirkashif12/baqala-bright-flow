using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

// Sweeps open cashier shifts against the branch's PosSettings.MaxShiftDurationHours (the
// "Cashier shift policy" tab, already editable via SettingsController but never actually
// enforced anywhere) — without this, a shift left open (cashier forgot to check out, terminal
// crashed, etc.) stays "open" forever, which both shows an ever-growing elapsed time on the
// Cashier Shift/Workspace screens AND permanently occupies its terminal for
// ShiftsController.OpenShift's "terminal already has an open shift" conflict check, eventually
// starving a busy branch of free terminals to check in on.
//
// Two modes, picked per branch by PosSettings.AutoCheckoutOnShiftEnd:
//   - true:  hard mode — auto-close the instant the shift crosses the threshold (assumes zero
//            cash variance, since there's no one left to physically count the drawer; recorded
//            in CloseReason).
//   - false: soft mode (the default) — flag it (OverdueFlaggedAt) and start a grace window equal
//            to the same threshold. A manager can check it out normally, or call
//            ShiftsController.OverrideOverdue to explicitly keep it open for another window. If
//            neither happens before the grace window elapses, it auto-closes anyway — per bug
//            report FR "require a manager override to keep them open," staying open is the thing
//            that needs explicit sign-off, not the reverse.
// A manager override (OverdueOverrideUntil) snoozes both modes until it elapses, so this never
// yanks a shift out from under a legitimately long, manager-acknowledged work day without warning.
public class ShiftAutoCloseService(IServiceScopeFactory scopeFactory, ILogger<ShiftAutoCloseService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan InitialDelay = TimeSpan.FromMinutes(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try { await Task.Delay(InitialDelay, stoppingToken); } catch (OperationCanceledException) { return; }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunSweepAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Cashier shift overdue sweep failed");
            }

            try { await Task.Delay(Interval, stoppingToken); } catch (OperationCanceledException) { break; }
        }
    }

    private async Task RunSweepAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BaqalaDbContext>();
        var audit = scope.ServiceProvider.GetRequiredService<IAuditService>();
        var notifications = scope.ServiceProvider.GetRequiredService<INotificationService>();

        var now = DateTime.UtcNow;
        var openShifts = await db.CashierShifts.Where(s => s.Status == "open").ToListAsync(ct);
        if (openShifts.Count == 0) return;

        var settingsByBranch = await db.PosSettings.ToDictionaryAsync(s => s.BranchId, ct);
        var defaultMaxHours = new PosSettings().MaxShiftDurationHours;

        foreach (var shift in openShifts)
        {
            // Still within a manager's "keep it open" snooze — leave it alone entirely.
            if (shift.OverdueOverrideUntil.HasValue && now < shift.OverdueOverrideUntil.Value) continue;

            var settings = settingsByBranch.GetValueOrDefault(shift.BranchId);
            var thresholdHours = settings?.MaxShiftDurationHours ?? defaultMaxHours;
            var elapsedHours = (now - shift.OpenedAt).TotalHours;
            if (elapsedHours < thresholdHours) continue;

            if (settings?.AutoCheckoutOnShiftEnd == true)
            {
                // Hard mode: no grace period, close the moment the threshold is crossed.
                await AutoCloseAsync(db, audit, notifications, shift, thresholdHours, now, ct);
            }
            else if (shift.OverdueFlaggedAt is null)
            {
                // First time crossing the threshold: flag it and start a grace window equal to
                // the same threshold — long enough for a manager to notice and either check it
                // out or explicitly override it, short enough that it can't drift open forever.
                await FlagOverdueAsync(db, audit, notifications, shift, thresholdHours, now, ct);
            }
            else if ((now - shift.OverdueFlaggedAt.Value).TotalHours >= thresholdHours)
            {
                // Grace window elapsed with no manager action — auto-close it. A manager who
                // wants it to stay open must call OverrideOverdue before this point, per bug #4's
                // "require a manager override to keep them open."
                await AutoCloseAsync(db, audit, notifications, shift, thresholdHours, now, ct);
            }
        }
    }

    private static async Task AutoCloseAsync(
        BaqalaDbContext db, IAuditService audit, INotificationService notifications,
        CashierShift shift, int thresholdHours, DateTime now, CancellationToken ct)
    {
        shift.Status = "closed";
        shift.ClosedAt = now;
        shift.ClosingAmount = shift.OpeningAmount + shift.CashSales;
        shift.Variance = 0;
        shift.CloseReason = $"Auto-closed by system — exceeded max shift duration of {thresholdHours}h";
        shift.OverdueFlaggedAt = null;

        if (shift.TerminalId.HasValue)
        {
            var terminal = await db.Terminals.FindAsync([shift.TerminalId.Value], ct);
            if (terminal != null) { terminal.LastSync = now; terminal.UpdatedAt = now; }
        }

        await db.SaveChangesAsync(ct);

        await audit.LogAsync(
            action: "Shift auto-closed — exceeded max duration",
            entityType: "CashierShift",
            entityId: shift.Id,
            userId: shift.CashierId,
            branchId: shift.BranchId,
            details: $"Open since {shift.OpenedAt:u}, exceeded {thresholdHours}h threshold. Closing amount assumed equal to opening + cash sales (no manual count).",
            severity: "warning");

        await notifications.NotifyUserAsync(shift.CashierId,
            "Cashier Shift", "Shift Auto-Closed", "Shift Auto-Closed",
            $"Your shift was automatically closed after exceeding the {thresholdHours}h max shift duration.",
            severity: "warning", entityType: "CashierShift", entityId: shift.Id, branchId: shift.BranchId,
            terminalId: shift.TerminalId);
        await notifications.NotifyRoleAsync(["Manager", "Admin"], shift.BranchId,
            "Cashier Shift", "Shift Auto-Closed", "Shift Auto-Closed",
            $"A cashier shift was automatically closed after exceeding the {thresholdHours}h max shift duration.",
            severity: "warning", entityType: "CashierShift", entityId: shift.Id,
            terminalId: shift.TerminalId);
    }

    private static async Task FlagOverdueAsync(
        BaqalaDbContext db, IAuditService audit, INotificationService notifications,
        CashierShift shift, int thresholdHours, DateTime now, CancellationToken ct)
    {
        shift.OverdueFlaggedAt = now;
        await db.SaveChangesAsync(ct);

        await audit.LogAsync(
            action: "Shift flagged overdue",
            entityType: "CashierShift",
            entityId: shift.Id,
            userId: shift.CashierId,
            branchId: shift.BranchId,
            details: $"Open since {shift.OpenedAt:u}, exceeds the {thresholdHours}h max shift duration.",
            severity: "warning");

        await notifications.NotifyUserAsync(shift.CashierId,
            "Cashier Shift", "Shift Overdue", "Shift Overdue",
            $"Your shift has been open past the {thresholdHours}h max shift duration. Check out, or ask a manager to keep it open.",
            severity: "warning", entityType: "CashierShift", entityId: shift.Id, branchId: shift.BranchId,
            terminalId: shift.TerminalId);
        await notifications.NotifyRoleAsync(["Manager", "Admin"], shift.BranchId,
            "Cashier Shift", "Shift Overdue", "Shift Overdue",
            $"A cashier shift has been open past the {thresholdHours}h max shift duration and needs review.",
            severity: "warning", entityType: "CashierShift", entityId: shift.Id,
            terminalId: shift.TerminalId);
    }
}
