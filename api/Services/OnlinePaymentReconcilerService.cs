using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

// Closes the gap between "shopper paid" and "order exists" when the shopper's browser isn't
// there to close it: the tab was shut mid-payment, the phone lost signal, the API restarted
// while the page was polling. Every OnlinePayment row that's still "created" is asked about at
// MyFatoorah; the ones that turn out Paid get their order created from the recorded checkout
// exactly as the status poll would have done (OnlineCheckoutService.PlaceFromPaymentAsync —
// same verification, same code path). Rows whose placement keeps failing (stock gone, price
// moved) are retried a few times and then left for staff, who were notified on the first failure
// and can place or refund from Orders → Online Orders → Payments needing attention.
//
// Also retires "created" rows MyFatoorah reports Expired/Canceled, and stops asking about rows
// older than MyFatoorah's own invoice expiry (~3 days) so the list of things to poll never grows
// without bound.
public class OnlinePaymentReconcilerService(IServiceScopeFactory scopeFactory, ILogger<OnlinePaymentReconcilerService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(2);
    private static readonly TimeSpan InitialDelay = TimeSpan.FromSeconds(45);
    // Don't chase an invoice the browser is still actively polling — give it a couple of minutes.
    private static readonly TimeSpan MinAge = TimeSpan.FromMinutes(2);
    // MyFatoorah invoices expire ~3 days after creation; a "created" row older than this is dead.
    private static readonly TimeSpan MaxAge = TimeSpan.FromDays(4);
    private const int MaxPlacementAttempts = 4;

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
                logger.LogError(ex, "Online payment reconciliation sweep failed");
            }

            try { await Task.Delay(Interval, stoppingToken); } catch (OperationCanceledException) { break; }
        }
    }

    private async Task RunSweepAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BaqalaDbContext>();
        var checkout = scope.ServiceProvider.GetRequiredService<IOnlineCheckoutService>();
        var myFatoorah = scope.ServiceProvider.GetRequiredService<IMyFatoorahServiceClient>();

        var now = DateTime.UtcNow;

        // 1. Unpaid-as-far-as-we-know invoices: ask MyFatoorah.
        var created = await db.OnlinePayments
            .Where(p => p.Status == "created" && p.CreatedAt < now - MinAge)
            .OrderBy(p => p.CreatedAt)
            .Take(200)
            .ToListAsync(ct);

        foreach (var payment in created)
        {
            if (ct.IsCancellationRequested) return;
            if (payment.CreatedAt < now - MaxAge)
            {
                payment.Status = "expired";
                payment.ResolvedAt = now;
                payment.UpdatedAt = now;
                continue;
            }

            var account = await checkout.ResolveMyFatoorahAccountAsync(payment.BranchId, ct);
            if (account is null) continue; // integration switched off; nothing we can ask

            var (ok, status, _) = await myFatoorah.GetPaymentStatusAsync(account, payment.GatewayInvoiceId, ct);
            if (!ok || status is null) continue; // transient; next sweep

            switch (status.Status)
            {
                case "Paid":
                    payment.Status = "paid";
                    payment.PaidAt ??= now;
                    payment.GatewayPaymentId ??= status.PaymentId;
                    payment.UpdatedAt = now;
                    await db.SaveChangesAsync(ct);
                    logger.LogInformation("Reconciler: invoice {InvoiceId} is Paid with no order — placing it", payment.GatewayInvoiceId);
                    await checkout.PlaceFromPaymentAsync(payment, ct);
                    break;
                case "Expired" or "Canceled":
                    payment.Status = "expired";
                    payment.ResolvedAt = now;
                    payment.UpdatedAt = now;
                    break;
            }
        }
        await db.SaveChangesAsync(ct);

        // 2. Paid rows whose order still doesn't exist: retry placement a few times (stock may
        //    have come back, a transient error may have cleared), then leave them to staff.
        var stuck = await db.OnlinePayments
            .Where(p => p.Status == "paid" && p.PlacementAttempts < MaxPlacementAttempts)
            .OrderBy(p => p.PaidAt)
            .Take(50)
            .ToListAsync(ct);
        foreach (var payment in stuck)
        {
            if (ct.IsCancellationRequested) return;
            var result = await checkout.PlaceFromPaymentAsync(payment, ct, notifyOnFailure: true);
            if (result.Ok)
                logger.LogInformation("Reconciler: order {OrderNumber} created for paid invoice {InvoiceId}", result.Value!.OrderNumber, payment.GatewayInvoiceId);
        }
    }
}
