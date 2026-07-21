using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

// Sweeps loyalty points past their configured expiry. The ledger has no per-row "remaining
// balance of this specific earn transaction" concept (unlike InventoryBatch.RemainingQuantity),
// so this deliberately does NOT do full FIFO lot accounting — that's real complexity the
// requirement never asked for (it asked for "earning rules"/"redemption rules"/"transactions
// history", not lot-precision expiry). Instead, each cycle expires the customer's oldest
// still-open earn transaction's points out of their CURRENT total balance: conservative (never
// takes a balance negative, never expires more than the customer holds), and always processes
// the oldest unexpired earn on schedule.
public class LoyaltyExpiryService(IServiceScopeFactory scopeFactory, ILogger<LoyaltyExpiryService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(6);
    private static readonly TimeSpan InitialDelay = TimeSpan.FromMinutes(2);

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
                logger.LogError(ex, "Loyalty points expiry sweep failed");
            }

            try { await Task.Delay(Interval, stoppingToken); } catch (OperationCanceledException) { break; }
        }
    }

    private async Task RunSweepAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BaqalaDbContext>();

        var now = DateTime.UtcNow;
        var customerIds = await db.Customers
            .Where(c => c.LoyaltyBalance > 0)
            .Select(c => c.Id)
            .ToListAsync(ct);

        foreach (var customerId in customerIds)
        {
            var earnTxn = await db.LoyaltyTransactions
                .Where(t => t.CustomerId == customerId && t.TransactionType == "earn"
                    && !t.ExpiredFlag && t.ExpiryDate != null && t.ExpiryDate <= now)
                .OrderBy(t => t.ExpiryDate)
                .FirstOrDefaultAsync(ct);
            if (earnTxn is null) continue;

            var customer = await db.Customers.FindAsync([customerId], ct);
            if (customer is null) continue;

            var pointsToExpire = Math.Min(earnTxn.Points, customer.LoyaltyBalance);
            if (pointsToExpire > 0)
            {
                customer.LoyaltyBalance -= pointsToExpire;
                db.LoyaltyTransactions.Add(new LoyaltyTransaction
                {
                    Id = Guid.NewGuid(),
                    CustomerId = customer.Id,
                    OrderId = null,
                    BranchId = earnTxn.BranchId,
                    TransactionType = "expire",
                    Points = -pointsToExpire,
                    BalanceAfter = customer.LoyaltyBalance,
                    Description = "Points expired",
                    CreatedAt = now,
                });
            }

            earnTxn.ExpiredFlag = true;
            await db.SaveChangesAsync(ct);
        }
    }
}
