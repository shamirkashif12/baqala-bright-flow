using BaqalaPOS.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DashboardController(BaqalaDbContext db) : ControllerBase
{
    // Branch-scoped roles (anything but tenant_admin) may only see their own branch's metrics —
    // same fix as AuditLogsController/TerminalsController/OrdersController. Previously branchId
    // was just an optional query param the frontend happened to pre-fill with the caller's
    // branch; a direct call with no branchId (e.g. NotificationsPopover's api.getDashboard())
    // returned every branch's low-stock/out-of-stock/expiring counts regardless of caller role,
    // so a Jeddah cashier saw Riyadh's alerts too.
    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    [HttpGet]
    public async Task<IActionResult> GetMetrics(
        [FromQuery] string? period = "today",
        [FromQuery] string? branchId = null)
    {
        // ─── Date range ────────────────────────────────────────────────────
        var now = DateTime.UtcNow;
        var today = now.Date;
        DateTime rangeStart, rangeEnd;
        switch (period?.ToLowerInvariant())
        {
            case "yesterday":
                rangeStart = today.AddDays(-1);
                rangeEnd   = today;
                break;
            case "week":
                rangeStart = today.AddDays(-6);
                rangeEnd   = today.AddDays(1);
                break;
            case "month":
                rangeStart = new DateTime(today.Year, today.Month, 1);
                rangeEnd   = today.AddDays(1);
                break;
            default: // "today"
                rangeStart = today;
                rangeEnd   = today.AddDays(1);
                break;
        }

        // ─── Branch-scoped queryables ───────────────────────────────────────
        var branchGuid = Guid.TryParse(branchId, out var g) ? g : (Guid?)null;
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            branchGuid = callerBranchId;

        var ordersQ    = db.Orders.AsQueryable();
        var paymentsQ  = db.OrderPayments.AsQueryable();
        var shiftsQ    = db.CashierShifts.AsQueryable();
        var terminalsQ = db.Terminals.AsQueryable();
        var stocksQ    = db.InventoryStocks.AsQueryable();
        var batchesQ   = db.InventoryBatches.AsQueryable();
        var usersQ     = db.Users.AsQueryable();
        var returnsQ   = db.CustomerReturns.AsQueryable();

        if (branchGuid.HasValue)
        {
            var bid = branchGuid.Value;
            ordersQ    = ordersQ.Where(o => o.BranchId == bid);
            paymentsQ  = paymentsQ.Where(p => p.Order.BranchId == bid);
            shiftsQ    = shiftsQ.Where(s => s.BranchId == bid);
            terminalsQ = terminalsQ.Where(t => t.BranchId == bid);
            stocksQ    = stocksQ.Where(s => s.BranchId == bid);
            batchesQ   = batchesQ.Where(b => b.BranchId == bid);
            usersQ     = usersQ.Where(u => u.BranchId == bid);
            returnsQ   = returnsQ.Where(r => r.BranchId == bid);
        }

        // ─── Order counts by status (in period) ────────────────────────────
        var ordersByStatus = await ordersQ
            .Where(o => o.CreatedAt >= rangeStart && o.CreatedAt < rangeEnd)
            .GroupBy(o => o.OrderStatus)
            .Select(g => new { status = g.Key, count = g.Count() })
            .ToListAsync();

        var statusMap = ordersByStatus.ToDictionary(x => x.status, x => x.count);

        // ─── Total sales (paid orders in period) ───────────────────────────
        var totalSalesToday = await ordersQ
            .Where(o => o.CreatedAt >= rangeStart && o.CreatedAt < rangeEnd && o.PaymentStatus == "paid")
            .SumAsync(o => o.TotalAmount);

        // ─── Same window, one period earlier — for real trend badges ───────
        // (e.g. "today" compares to yesterday, "week" compares to the prior week).
        var duration = rangeEnd - rangeStart;
        var prevRangeStart = rangeStart - duration;
        var prevRangeEnd = rangeStart;

        var prevOrdersByStatus = await ordersQ
            .Where(o => o.CreatedAt >= prevRangeStart && o.CreatedAt < prevRangeEnd)
            .GroupBy(o => o.OrderStatus)
            .Select(g => new { status = g.Key, count = g.Count() })
            .ToListAsync();
        var prevStatusMap = prevOrdersByStatus.ToDictionary(x => x.status, x => x.count);

        var prevTotalSales = await ordersQ
            .Where(o => o.CreatedAt >= prevRangeStart && o.CreatedAt < prevRangeEnd && o.PaymentStatus == "paid")
            .SumAsync(o => o.TotalAmount);

        static decimal DeltaPct(decimal current, decimal previous)
        {
            if (previous == 0) return current > 0 ? 100 : 0;
            return Math.Round((current - previous) / previous * 100, 1);
        }

        // ─── Payment method breakdown (in period) ──────────────────────────
        var paymentMix = await paymentsQ
            .Where(p => p.CreatedAt >= rangeStart && p.CreatedAt < rangeEnd && p.Status == "completed")
            .GroupBy(p => p.PaymentMethod)
            .Select(g => new { method = g.Key, total = g.Sum(p => p.Amount) })
            .ToListAsync();

        var payTotal = paymentMix.Sum(p => p.total);
        var paymentBreakdown = paymentMix.Select(p => new
        {
            method = p.method,
            amount = p.total,
            pct    = payTotal > 0 ? Math.Round(p.total / payTotal * 100, 1) : 0
        }).ToList();

        // ─── Active shifts & cashier count ─────────────────────────────────
        // activeShifts is constrained to the same population as totalCashiers
        // (active Cashier-role users) so the "X / Y" ratio can never show X > Y —
        // a shift left open by someone since deactivated or reassigned off the
        // Cashier role no longer counts as an "active cashier".
        var activeShifts  = await shiftsQ.CountAsync(s =>
            s.Status == "open" && s.Cashier!.Status == "active" && s.Cashier.Role!.Name == "Cashier");
        var totalCashiers = await usersQ.CountAsync(u => u.Status == "active" && u.Role!.Name == "Cashier");

        // ─── Terminals ─────────────────────────────────────────────────────
        var totalTerminals  = await terminalsQ.CountAsync();
        var activeTerminals = await terminalsQ.CountAsync(t => t.Status == "active");

        // ─── Low stock ─────────────────────────────────────────────────────
        var lowStockCount   = await stocksQ.CountAsync(s => s.Quantity > 0 && s.Quantity <= s.ReorderLevel);
        var outOfStockCount = await stocksQ.CountAsync(s => s.Quantity == 0);

        var lowStockItems = await stocksQ
            .Include(s => s.Product)
            .Include(s => s.Branch)
            .Where(s => s.Quantity > 0 && s.Quantity <= s.ReorderLevel)
            .OrderBy(s => s.Quantity)
            .Take(5)
            .Select(s => new { name = s.Product.Name, qty = s.Quantity, branch = s.Branch.Name })
            .ToListAsync();

        // ─── Expiring batches (next 7 days) ────────────────────────────────
        var cutoff7 = now.AddDays(7);
        var expiringCount = await batchesQ
            .CountAsync(b => b.ExpiryDate != null && b.ExpiryDate >= now && b.ExpiryDate <= cutoff7 && b.RemainingQuantity > 0);

        var expiringRaw = await batchesQ
            .Include(b => b.Product)
            .Include(b => b.Branch)
            .Where(b => b.ExpiryDate != null && b.ExpiryDate >= now && b.ExpiryDate <= cutoff7 && b.RemainingQuantity > 0)
            .OrderBy(b => b.ExpiryDate)
            .Take(5)
            .Select(b => new { name = b.Product.Name, expiryDate = b.ExpiryDate!.Value, branch = b.Branch.Name })
            .ToListAsync();

        var expiringItems = expiringRaw
            .Select(b => new { name = b.name, daysLeft = (int)((b.expiryDate - now).TotalDays), branch = b.branch })
            .ToList();

        // ─── Cashier performance (in period) ───────────────────────────────
        var cashierPerf = await shiftsQ
            .Include(s => s.Cashier)
            .Where(s => s.OpenedAt >= rangeStart)
            .Select(s => new { name = s.Cashier != null ? s.Cashier.FullName : "Unknown", sales = s.TotalSales, status = s.Status })
            .OrderByDescending(s => s.sales)
            .Take(5)
            .ToListAsync();

        // ─── Branch performance (paid orders in period) ────────────────────
        var branchPerfRaw = await ordersQ
            .Where(o => o.CreatedAt >= rangeStart && o.CreatedAt < rangeEnd && o.PaymentStatus == "paid")
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
                sales  = b.sales
            })
            .OrderByDescending(b => b.sales)
            .ToList();

        // ─── Returns (in period) ───────────────────────────────────────────
        var returnsCount   = await returnsQ.Where(r => r.CreatedAt >= rangeStart && r.CreatedAt < rangeEnd).CountAsync();
        var refundedAmount = await returnsQ.Where(r => r.CreatedAt >= rangeStart && r.CreatedAt < rangeEnd).SumAsync(r => r.RefundAmount);

        return Ok(new
        {
            orders = new
            {
                pending         = statusMap.GetValueOrDefault("pending", 0),
                processing      = statusMap.GetValueOrDefault("processing", 0),
                readyToDeliver  = statusMap.GetValueOrDefault("ready_to_deliver", 0),
                delivered       = statusMap.GetValueOrDefault("delivered", 0),
                cancelled       = statusMap.GetValueOrDefault("cancelled", 0),
                totalToday      = statusMap.Values.Sum(),
                pendingDeltaPct        = DeltaPct(statusMap.GetValueOrDefault("pending", 0), prevStatusMap.GetValueOrDefault("pending", 0)),
                processingDeltaPct     = DeltaPct(statusMap.GetValueOrDefault("processing", 0), prevStatusMap.GetValueOrDefault("processing", 0)),
                readyToDeliverDeltaPct = DeltaPct(statusMap.GetValueOrDefault("ready_to_deliver", 0), prevStatusMap.GetValueOrDefault("ready_to_deliver", 0)),
                deliveredDeltaPct      = DeltaPct(statusMap.GetValueOrDefault("delivered", 0), prevStatusMap.GetValueOrDefault("delivered", 0)),
            },
            sales = new { totalToday = totalSalesToday, totalTodayDeltaPct = DeltaPct(totalSalesToday, prevTotalSales), paymentBreakdown },
            shifts    = new { active = activeShifts, totalCashiers },
            terminals = new { active = activeTerminals, total = totalTerminals },
            inventory = new { lowStockCount, outOfStockCount, lowStockItems, expiringCount, expiringItems },
            cashierPerformance = cashierPerf,
            branchPerformance  = branchPerf,
            returns = new { count = returnsCount, refundedAmount }
        });
    }
}
