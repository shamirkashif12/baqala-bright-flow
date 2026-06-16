using BaqalaPOS.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DashboardController(BaqalaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetMetrics()
    {
        var today = DateTime.UtcNow.Date;
        var todayEnd = today.AddDays(1);

        // Order counts by status (today)
        var ordersByStatus = await db.Orders
            .Where(o => o.CreatedAt >= today && o.CreatedAt < todayEnd)
            .GroupBy(o => o.OrderStatus)
            .Select(g => new { status = g.Key, count = g.Count() })
            .ToListAsync();

        var statusMap = ordersByStatus.ToDictionary(x => x.status, x => x.count);

        // Total sales today (paid orders)
        var totalSalesToday = await db.Orders
            .Where(o => o.CreatedAt >= today && o.CreatedAt < todayEnd && o.PaymentStatus == "paid")
            .SumAsync(o => o.TotalAmount);

        // Payment method breakdown today
        var paymentMix = await db.OrderPayments
            .Where(p => p.CreatedAt >= today && p.CreatedAt < todayEnd && p.Status == "completed")
            .GroupBy(p => p.PaymentMethod)
            .Select(g => new { method = g.Key, total = g.Sum(p => p.Amount) })
            .ToListAsync();

        var payTotal = paymentMix.Sum(p => p.total);
        var paymentBreakdown = paymentMix.Select(p => new
        {
            method = p.method,
            amount = p.total,
            pct = payTotal > 0 ? Math.Round(p.total / payTotal * 100, 1) : 0
        }).ToList();

        // Active shifts
        var activeShifts = await db.CashierShifts.CountAsync(s => s.Status == "open");
        var totalCashiers = await db.Users.CountAsync(u => u.Status == "active");

        // Terminals
        var totalTerminals = await db.Terminals.CountAsync();
        var activeTerminals = await db.Terminals.CountAsync(t => t.Status == "active");

        // Low stock items
        var lowStockCount = await db.InventoryStocks
            .CountAsync(s => s.Quantity > 0 && s.Quantity <= s.ReorderLevel);
        var outOfStockCount = await db.InventoryStocks.CountAsync(s => s.Quantity == 0);

        // Low stock detail (top 5)
        var lowStockItems = await db.InventoryStocks
            .Include(s => s.Product)
            .Include(s => s.Branch)
            .Where(s => s.Quantity > 0 && s.Quantity <= s.ReorderLevel)
            .OrderBy(s => s.Quantity)
            .Take(5)
            .Select(s => new
            {
                name = s.Product.Name,
                qty = s.Quantity,
                branch = s.Branch.Name
            })
            .ToListAsync();

        // Expiring batches (next 7 days)
        var cutoff7 = DateOnly.FromDateTime(DateTime.UtcNow.AddDays(7));
        var today2 = DateOnly.FromDateTime(DateTime.UtcNow);
        var expiringCount = await db.InventoryBatches
            .CountAsync(b => b.ExpiryDate != null && b.ExpiryDate >= today2 && b.ExpiryDate <= cutoff7 && b.RemainingQuantity > 0);

        // Expiring detail (top 5 soonest)
        var expiringItems = await db.InventoryBatches
            .Include(b => b.Product)
            .Include(b => b.Branch)
            .Where(b => b.ExpiryDate != null && b.ExpiryDate >= today2 && b.ExpiryDate <= cutoff7 && b.RemainingQuantity > 0)
            .OrderBy(b => b.ExpiryDate)
            .Take(5)
            .Select(b => new
            {
                name = b.Product.Name,
                daysLeft = (int)(b.ExpiryDate!.Value.DayNumber - today2.DayNumber),
                branch = b.Branch.Name
            })
            .ToListAsync();

        // Cashier performance from shifts (today)
        var cashierPerf = await db.CashierShifts
            .Include(s => s.Cashier)
            .Where(s => s.OpenedAt >= today)
            .Select(s => new
            {
                name = s.Cashier != null ? s.Cashier.FullName : "Unknown",
                sales = s.TotalSales,
                status = s.Status
            })
            .OrderByDescending(s => s.sales)
            .Take(5)
            .ToListAsync();

        // Branch performance from orders (today) — split into two queries to avoid
        // EF Core MySQL limitation with navigation properties inside GroupBy keys
        var branchPerfRaw = await db.Orders
            .Where(o => o.CreatedAt >= today && o.CreatedAt < todayEnd && o.PaymentStatus == "paid")
            .GroupBy(o => o.BranchId)
            .Select(g => new { branchId = g.Key, orders = g.Count(), sales = g.Sum(o => o.TotalAmount) })
            .ToListAsync();

        var branchNameMap = (await db.Branches
            .Select(b => new { b.Id, b.Name })
            .ToListAsync())
            .ToDictionary(b => b.Id, b => b.Name);

        var branchPerf = branchPerfRaw
            .Select(b => new
            {
                branch = branchNameMap.GetValueOrDefault(b.branchId, "Unknown"),
                orders = b.orders,
                sales = b.sales
            })
            .OrderByDescending(b => b.sales)
            .ToList();

        // Returns today
        var returnsToday = await db.CustomerReturns
            .Where(r => r.CreatedAt >= today && r.CreatedAt < todayEnd)
            .CountAsync();
        var refundedToday = await db.CustomerReturns
            .Where(r => r.CreatedAt >= today && r.CreatedAt < todayEnd)
            .SumAsync(r => r.RefundAmount);

        return Ok(new
        {
            orders = new
            {
                pending = statusMap.GetValueOrDefault("pending", 0),
                processing = statusMap.GetValueOrDefault("processing", 0),
                readyToDeliver = statusMap.GetValueOrDefault("ready_to_deliver", 0),
                delivered = statusMap.GetValueOrDefault("delivered", 0),
                cancelled = statusMap.GetValueOrDefault("cancelled", 0),
                totalToday = statusMap.Values.Sum()
            },
            sales = new
            {
                totalToday = totalSalesToday,
                paymentBreakdown
            },
            shifts = new { active = activeShifts, totalCashiers },
            terminals = new { active = activeTerminals, total = totalTerminals },
            inventory = new
            {
                lowStockCount,
                outOfStockCount,
                lowStockItems,
                expiringCount,
                expiringItems
            },
            cashierPerformance = cashierPerf,
            branchPerformance = branchPerf,
            returns = new { count = returnsToday, refundedAmount = refundedToday }
        });
    }
}
