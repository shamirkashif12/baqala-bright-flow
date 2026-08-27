using BaqalaPOS.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

// Closes the gap between "the NamiPay terminal took the money" and "a sale exists" when the POS
// isn't there to close it: the browser crashed mid-poll, the cashier cancelled a payment the
// terminal went on to approve, the sale's order creation failed after approval. Terminal card
// transactions resolve in a minute or two, so this runs on a tight loop with a short horizon —
// the POS's own 2–3s polling remains the primary path; this is the safety net.
//
// Three sweeps:
//   1. "processing" rows the till stopped polling — ask NamiPay; approve/decline them, or mark
//      them expired once they're older than any plausible terminal interaction.
//   2. "cancelled" rows that still have a gateway transaction — the terminal may have approved
//      AFTER the cashier hit Cancel; such a row flips back to approved (with a note) so sweep 3
//      can flag it. Confirmed declines and old rows are retired.
//   3. "approved" rows with no order after a grace period — money exists, sale doesn't. Staff
//      are alerted exactly once (AttentionNotifiedAt) to complete the sale or reverse the
//      payment on the terminal; deliberately no automatic reversal, this is an attended till.
public class PosCardPaymentReconcilerService(IServiceScopeFactory scopeFactory, ILogger<PosCardPaymentReconcilerService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan InitialDelay = TimeSpan.FromSeconds(60);
    // Don't chase a payment the till is still actively polling.
    private static readonly TimeSpan MinAge = TimeSpan.FromMinutes(3);
    // A terminal purchase with no result after this long never happened.
    private static readonly TimeSpan MaxAge = TimeSpan.FromMinutes(30);
    // How long an approved payment may sit without an order before staff are alerted.
    private static readonly TimeSpan AttentionAfter = TimeSpan.FromMinutes(5);

    private static readonly string[] StaffRoles = ["Manager", "Admin"];

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
                logger.LogError(ex, "POS card payment reconciliation sweep failed");
            }

            try { await Task.Delay(Interval, stoppingToken); } catch (OperationCanceledException) { break; }
        }
    }

    private async Task RunSweepAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BaqalaDbContext>();
        var payments = scope.ServiceProvider.GetRequiredService<IPosCardPaymentService>();
        var notifications = scope.ServiceProvider.GetRequiredService<INotificationService>();
        var audit = scope.ServiceProvider.GetRequiredService<IAuditService>();

        var now = DateTime.UtcNow;

        // 1. Abandoned in-flight payments.
        var processing = await db.PosCardPayments
            .Where(p => p.Status == "processing" && p.CreatedAt < now - MinAge)
            .OrderBy(p => p.CreatedAt)
            .Take(100)
            .ToListAsync(ct);
        foreach (var payment in processing)
        {
            if (ct.IsCancellationRequested) return;
            if (payment.GatewayTransactionId is null || payment.CreatedAt < now - MaxAge)
            {
                payment.Status = "expired";
                payment.LastError = "No result came back from the NamiPay terminal within the wait window.";
                payment.ResolvedAt = now;
                payment.UpdatedAt = now;
                continue;
            }
            await payments.RefreshFromGatewayAsync(payment, ct);
        }
        await db.SaveChangesAsync(ct);

        // 2. Cancelled at the till but possibly approved on the terminal anyway.
        var cancelled = await db.PosCardPayments
            .Where(p => p.Status == "cancelled" && p.ResolvedAt == null && p.GatewayTransactionId != null)
            .OrderBy(p => p.CreatedAt)
            .Take(100)
            .ToListAsync(ct);
        foreach (var payment in cancelled)
        {
            if (ct.IsCancellationRequested) return;
            if (payment.CreatedAt < now - MaxAge)
            {
                payment.ResolvedAt = now;
                payment.UpdatedAt = now;
                continue;
            }
            await payments.RefreshFromGatewayAsync(payment, ct);
        }
        await db.SaveChangesAsync(ct);

        // 3. Approved with no sale — a customer was charged and nothing here shows for it.
        var unlinked = await db.PosCardPayments
            .Where(p => p.Status == "approved" && p.OrderId == null &&
                        p.AttentionNotifiedAt == null && p.ApprovedAt < now - AttentionAfter)
            .OrderBy(p => p.ApprovedAt)
            .Take(50)
            .ToListAsync(ct);
        foreach (var payment in unlinked)
        {
            if (ct.IsCancellationRequested) return;
            payment.AttentionNotifiedAt = now;
            payment.UpdatedAt = now;
            await audit.LogAsync("POS card payment without sale", entityType: "PosCardPayment", entityId: payment.Id,
                branchId: payment.BranchId, severity: "warning",
                details: $"NamiPay approved SAR {payment.Amount:F2} (RRN {payment.Rrn ?? "?"}, auth {payment.AuthCode ?? "?"}) " +
                         $"but no sale was completed. {payment.LastError}".Trim());
            try
            {
                await notifications.NotifyRoleAsync(
                    StaffRoles, payment.BranchId, "POS", "Card Payment Needs Attention",
                    $"Card charged SAR {payment.Amount:F2} · no sale completed",
                    $"The NamiPay terminal approved SAR {payment.Amount:F2} (RRN {payment.Rrn ?? "unknown"}) but no sale was " +
                    "completed for it. Complete the sale, or reverse the payment on the terminal.",
                    severity: "warning", entityType: "PosCardPayment", entityId: payment.Id);
            }
            catch (Exception ex) { logger.LogError(ex, "Notification failed for POS card payment {Id}", payment.Id); }
            logger.LogWarning("POS card payment {Id} (branch {BranchId}) is approved for SAR {Amount} with no order",
                payment.Id, payment.BranchId, payment.Amount);
        }
        await db.SaveChangesAsync(ct);
    }
}
