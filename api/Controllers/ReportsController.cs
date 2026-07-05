using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReportsController(BaqalaDbContext db, IAuditService audit) : ControllerBase
{
    private const int MaxRangeDays = 366;

    // ───────────────────────────────────────────────────────────────────────
    // 1. Daily Sales (RPT-SALES-DAILY)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("daily-sales")]
    public async Task<IActionResult> GetDailySales(
        [FromQuery] DateTime? date, [FromQuery] Guid? branchId, [FromQuery] Guid? terminalId,
        [FromQuery] Guid? cashierId, [FromQuery] string? paymentMethod, [FromQuery] string? orderStatus)
    {
        var result = await BuildDailySalesAsync(date, branchId, terminalId, cashierId, paymentMethod, orderStatus);
        return Ok(result);
    }

    [HttpGet("daily-sales/export")]
    public async Task<IActionResult> ExportDailySales(
        [FromQuery] DateTime? date, [FromQuery] Guid? branchId, [FromQuery] Guid? terminalId,
        [FromQuery] Guid? cashierId, [FromQuery] string? paymentMethod, [FromQuery] string? orderStatus,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var result = await BuildDailySalesAsync(date, branchId, terminalId, cashierId, paymentMethod, orderStatus);
        var headers = new[] { "Hour", "Transactions", "Gross Sales", "Discounts", "Returns", "Net Sales", "VAT Collected", "Cash", "Card", "Wallet", "Avg Basket" };
        var rows = result.Hourly.Select(h => new object?[]
        {
            $"{h.Hour:00}:00", h.Transactions, h.GrossSales, h.Discounts, h.Returns, h.NetSales, h.Vat, h.Cash, h.Card, h.Wallet, h.AvgBasket,
        }).ToList();
        var day = (date ?? DateTime.UtcNow).Date;
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"daily-sales\",\"date\":\"{day:yyyy-MM-dd}\",\"rows\":{result.Hourly.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Gross Sales", result.Kpis.GrossSales.ToString("0.##")), ("Net Sales", result.Kpis.NetSales.ToString("0.##")),
            ("Transactions", result.Kpis.Transactions.ToString()), ("VAT Collected", result.Kpis.VatCollected.ToString("0.##")),
        };
        return BuildExportFile(format, "Daily Sales Report", $"Date: {day:yyyy-MM-dd}", kpis, headers, rows, $"daily-sales-{day:yyyy-MM-dd}");
    }

    private async Task<DailySalesResult> BuildDailySalesAsync(
        DateTime? date, Guid? branchId, Guid? terminalId, Guid? cashierId, string? paymentMethod, string? orderStatus)
    {
        var day = (date ?? DateTime.UtcNow).Date;
        var dayEnd = day.AddDays(1);

        var ordersQ = db.Orders.Where(o => o.CreatedAt >= day && o.CreatedAt < dayEnd);
        if (branchId.HasValue) ordersQ = ordersQ.Where(o => o.BranchId == branchId);
        if (terminalId.HasValue) ordersQ = ordersQ.Where(o => o.TerminalId == terminalId);
        if (cashierId.HasValue) ordersQ = ordersQ.Where(o => o.CashierId == cashierId);
        if (!string.IsNullOrEmpty(orderStatus)) ordersQ = ordersQ.Where(o => o.OrderStatus == orderStatus);

        var paymentsQ = db.OrderPayments
            .Include(p => p.Order)
            .Where(p => p.CreatedAt >= day && p.CreatedAt < dayEnd && p.Status == "completed" && p.Order != null);
        if (branchId.HasValue) paymentsQ = paymentsQ.Where(p => p.Order!.BranchId == branchId);
        if (terminalId.HasValue) paymentsQ = paymentsQ.Where(p => p.Order!.TerminalId == terminalId);
        if (cashierId.HasValue) paymentsQ = paymentsQ.Where(p => p.Order!.CashierId == cashierId);
        if (!string.IsNullOrEmpty(paymentMethod)) paymentsQ = paymentsQ.Where(p => p.PaymentMethod == paymentMethod);

        var returnsQ = db.CustomerReturns.Where(r => r.CreatedAt >= day && r.CreatedAt < dayEnd);
        if (branchId.HasValue) returnsQ = returnsQ.Where(r => r.BranchId == branchId);

        var ordersByHour = await ordersQ
            .GroupBy(o => o.CreatedAt.Hour)
            .Select(g => new
            {
                hour = g.Key,
                transactions = g.Count(o => o.PaymentStatus == "paid"),
                grossSales = g.Sum(o => o.Subtotal),
                discounts = g.Sum(o => o.DiscountAmount),
                vat = g.Sum(o => o.TaxAmount),
                netSales = g.Sum(o => o.TotalAmount - o.TaxAmount),
            })
            .ToListAsync();

        var returnsByHour = await returnsQ
            .GroupBy(r => r.CreatedAt.Hour)
            .Select(g => new { hour = g.Key, amount = g.Sum(r => r.RefundAmount) })
            .ToListAsync();
        var returnsMap = returnsByHour.ToDictionary(x => x.hour, x => x.amount);

        var paymentsByHourMethod = await paymentsQ
            .GroupBy(p => new { p.CreatedAt.Hour, p.PaymentMethod })
            .Select(g => new { g.Key.Hour, g.Key.PaymentMethod, amount = g.Sum(p => p.Amount) })
            .ToListAsync();

        var hourly = new List<DailySalesHour>();
        for (var h = 0; h < 24; h++)
        {
            var o = ordersByHour.FirstOrDefault(x => x.hour == h);
            var returns = returnsMap.GetValueOrDefault(h, 0m);
            var cash = paymentsByHourMethod.Where(p => p.Hour == h && p.PaymentMethod == "cash").Sum(p => p.amount);
            var card = paymentsByHourMethod.Where(p => p.Hour == h && p.PaymentMethod == "card").Sum(p => p.amount);
            var wallet = paymentsByHourMethod.Where(p => p.Hour == h && p.PaymentMethod == "wallet").Sum(p => p.amount);
            var transactions = o?.transactions ?? 0;
            var netSales = (o?.netSales ?? 0m) - returns;
            hourly.Add(new DailySalesHour
            {
                Hour = h,
                Transactions = transactions,
                GrossSales = o?.grossSales ?? 0m,
                Discounts = o?.discounts ?? 0m,
                Returns = returns,
                NetSales = netSales,
                Vat = o?.vat ?? 0m,
                Cash = cash,
                Card = card,
                Wallet = wallet,
                AvgBasket = transactions > 0 ? Math.Round(netSales / transactions, 2) : 0m,
            });
        }

        var paymentSplit = await paymentsQ
            .GroupBy(p => p.PaymentMethod)
            .Select(g => new PaymentSplitRow { Method = g.Key, Amount = g.Sum(p => p.Amount) })
            .ToListAsync();

        var kpiTransactions = hourly.Sum(h => h.Transactions);
        var kpiNetSales = hourly.Sum(h => h.NetSales);

        return new DailySalesResult
        {
            Kpis = new DailySalesKpis
            {
                GrossSales = hourly.Sum(h => h.GrossSales),
                NetSales = kpiNetSales,
                Transactions = kpiTransactions,
                AvgBasket = kpiTransactions > 0 ? Math.Round(kpiNetSales / kpiTransactions, 2) : 0m,
                VatCollected = hourly.Sum(h => h.Vat),
                ReturnsRefunds = hourly.Sum(h => h.Returns),
            },
            Hourly = hourly,
            PaymentSplit = paymentSplit,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 2. Monthly Sales (RPT-SALES-MONTHLY)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("monthly-sales")]
    public async Task<IActionResult> GetMonthlySales(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId,
        [FromQuery] Guid? categoryId, [FromQuery] bool comparePrevious = false)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });

        var result = await BuildMonthlySalesAsync(rangeFrom, rangeTo, branchId, categoryId, comparePrevious);
        return Ok(result);
    }

    [HttpGet("monthly-sales/export")]
    public async Task<IActionResult> ExportMonthlySales(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId,
        [FromQuery] Guid? categoryId, [FromQuery] bool comparePrevious = false, [FromQuery] Guid? exportedBy = null,
        [FromQuery] bool includeMargin = true, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });

        var result = await BuildMonthlySalesAsync(rangeFrom, rangeTo, branchId, categoryId, comparePrevious);

        // Cost/margin fields are caller-declared via includeMargin (the frontend only ever passes true when
        // the exporting user has Accounting & Finance view access) — this mirrors the FRD's column-masking
        // rule for exports, though it's advisory rather than JWT-enforced, matching this API's existing RBAC model.
        var headers = includeMargin
            ? new[] { "Date", "Transactions", "Gross Sales", "Discounts", "Returns", "Net Sales", "VAT", "COGS", "Gross Profit", "Margin %", "Avg Basket", "Previous Period Sales", "Growth %" }
            : new[] { "Date", "Transactions", "Gross Sales", "Discounts", "Returns", "Net Sales", "VAT", "Avg Basket", "Previous Period Sales", "Growth %" };
        var rows = result.Daily.Select(d => includeMargin
            ? new object?[]
            {
                d.Date.ToString("yyyy-MM-dd"), d.Transactions, d.GrossSales, d.Discounts, d.Returns, d.NetSales, d.Vat, d.Cogs, d.GrossProfit,
                d.MarginPct?.ToString("0.0") ?? "N/A", d.AvgBasket, d.PreviousPeriodSales, d.GrowthPct,
            }
            : new object?[]
            {
                d.Date.ToString("yyyy-MM-dd"), d.Transactions, d.GrossSales, d.Discounts, d.Returns, d.NetSales, d.Vat, d.AvgBasket, d.PreviousPeriodSales, d.GrowthPct,
            }).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"monthly-sales\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Daily.Count}}}");
        var kpis = new List<(string, string)> { ("Net Sales", result.Kpis.NetSales.ToString("0.##")) };
        if (includeMargin)
        {
            kpis.Add(("Gross Profit", result.Kpis.GrossProfit.ToString("0.##")));
            kpis.Add(("Margin %", result.Kpis.MarginPct?.ToString("0.0") ?? "N/A"));
        }
        kpis.Add(("Transactions", result.Kpis.Transactions.ToString()));
        return BuildExportFile(format, "Monthly Sales Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis.ToArray(), headers, rows, $"monthly-sales-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<MonthlySalesResult> BuildMonthlySalesAsync(
        DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, Guid? categoryId, bool comparePrevious)
    {
        var days = (int)(rangeToExclusive - rangeFrom).TotalDays;

        var current = await LoadDailyLineItemsAsync(rangeFrom, rangeToExclusive, branchId, categoryId);

        List<(DateOnly Date, decimal NetSales)> previous = [];
        if (comparePrevious)
        {
            var prevTo = rangeFrom;
            var prevFrom = prevTo.AddDays(-days);
            var prevRows = await LoadDailyLineItemsAsync(prevFrom, prevTo, branchId, categoryId);
            previous = prevRows.Select((r, i) => (Date: DateOnly.FromDateTime(rangeFrom.AddDays(i)), r.NetSales)).ToList();
        }
        var prevMap = previous.ToDictionary(p => p.Date, p => p.NetSales);

        var daily = new List<MonthlyDayRow>();
        for (var i = 0; i < days; i++)
        {
            var d = current[i];
            var dateOnly = DateOnly.FromDateTime(rangeFrom.AddDays(i));
            decimal? prevSales = comparePrevious ? prevMap.GetValueOrDefault(dateOnly, 0m) : null;
            decimal? growthPct = prevSales is > 0 ? Math.Round((d.NetSales - prevSales.Value) / prevSales.Value * 100, 1) : null;
            daily.Add(new MonthlyDayRow
            {
                Date = dateOnly,
                Transactions = d.Transactions,
                GrossSales = d.GrossSales,
                Discounts = d.Discounts,
                Returns = d.Returns,
                NetSales = d.NetSales,
                Vat = d.Vat,
                Cogs = d.Cogs,
                GrossProfit = d.NetSales - d.Cogs,
                MarginPct = d.NetSales > 0 ? Math.Round((d.NetSales - d.Cogs) / d.NetSales * 100, 1) : null,
                AvgBasket = d.Transactions > 0 ? Math.Round(d.NetSales / d.Transactions, 2) : 0m,
                PreviousPeriodSales = prevSales,
                GrowthPct = growthPct,
            });
        }

        var totalNetSales = daily.Sum(d => d.NetSales);
        var totalGrossProfit = daily.Sum(d => d.GrossProfit);

        return new MonthlySalesResult
        {
            Kpis = new MonthlySalesKpis
            {
                NetSales = totalNetSales,
                GrossProfit = totalGrossProfit,
                MarginPct = totalNetSales > 0 ? Math.Round(totalGrossProfit / totalNetSales * 100, 1) : null,
                Transactions = daily.Sum(d => d.Transactions),
                ReturnValue = daily.Sum(d => d.Returns),
                DiscountValue = daily.Sum(d => d.Discounts),
            },
            Daily = daily,
        };
    }

    /// <summary>Aggregates order-line-level sales per calendar day in [from, toExclusive), materialized
    /// in memory so category filtering and per-day distinct order counts work reliably across providers.</summary>
    private async Task<List<DailyLineAgg>> LoadDailyLineItemsAsync(DateTime from, DateTime toExclusive, Guid? branchId, Guid? categoryId)
    {
        var itemsQ = db.OrderItems
            .Include(i => i.Order)
            .Include(i => i.Product)
            .Where(i => i.Order != null && i.Order.CreatedAt >= from && i.Order.CreatedAt < toExclusive && i.Order.PaymentStatus == "paid");
        if (branchId.HasValue) itemsQ = itemsQ.Where(i => i.Order!.BranchId == branchId);
        if (categoryId.HasValue) itemsQ = itemsQ.Where(i => i.Product != null && i.Product.CategoryId == categoryId);

        var rawItems = await itemsQ
            .Select(i => new
            {
                Date = i.Order!.CreatedAt.Date,
                OrderId = i.OrderId,
                Gross = i.UnitPrice * i.Quantity,
                i.DiscountAmount,
                i.TaxAmount,
                Cogs = i.Quantity * (i.Product!.CostPrice ?? 0m),
            })
            .ToListAsync();

        var returnsQ = db.CustomerReturnItems
            .Include(ri => ri.Return)
            .Include(ri => ri.Product)
            .Where(ri => ri.Return != null && ri.Return.CreatedAt >= from && ri.Return.CreatedAt < toExclusive);
        if (branchId.HasValue) returnsQ = returnsQ.Where(ri => ri.Return!.BranchId == branchId);
        if (categoryId.HasValue) returnsQ = returnsQ.Where(ri => ri.Product != null && ri.Product.CategoryId == categoryId);

        var rawReturns = await returnsQ
            .Select(ri => new { Date = ri.Return!.CreatedAt.Date, ri.RefundAmount })
            .ToListAsync();

        var itemsByDate = rawItems.ToLookup(x => x.Date);
        var returnsByDate = rawReturns.ToLookup(x => x.Date);

        var days = (int)(toExclusive - from).TotalDays;
        var result = new List<DailyLineAgg>(days);
        for (var i = 0; i < days; i++)
        {
            var day = from.AddDays(i).Date;
            var items = itemsByDate[day].ToList();
            var returns = returnsByDate[day].ToList();
            var gross = items.Sum(x => x.Gross);
            var discounts = items.Sum(x => x.DiscountAmount);
            var returnValue = returns.Sum(x => x.RefundAmount);
            result.Add(new DailyLineAgg
            {
                Transactions = items.Select(x => x.OrderId).Distinct().Count(),
                GrossSales = gross,
                Discounts = discounts,
                Returns = returnValue,
                NetSales = gross - discounts - returnValue,
                Vat = items.Sum(x => x.TaxAmount),
                Cogs = items.Sum(x => x.Cogs),
            });
        }
        return result;
    }

    // ───────────────────────────────────────────────────────────────────────
    // 3. Cashier Sales (RPT-SALES-CASHIER)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("cashier-sales")]
    public async Task<IActionResult> GetCashierSales(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId,
        [FromQuery] Guid? cashierId, [FromQuery] Guid? terminalId)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: false);
        if (error != null) return BadRequest(new { message = error });

        var result = await BuildCashierSalesAsync(rangeFrom, rangeTo, branchId, cashierId, terminalId);
        return Ok(result);
    }

    [HttpGet("cashier-sales/export")]
    public async Task<IActionResult> ExportCashierSales(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId,
        [FromQuery] Guid? cashierId, [FromQuery] Guid? terminalId, [FromQuery] Guid? exportedBy,
        [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: false);
        if (error != null) return BadRequest(new { message = error });

        var result = await BuildCashierSalesAsync(rangeFrom, rangeTo, branchId, cashierId, terminalId);
        var headers = new[] { "Cashier", "Branch", "Terminal", "Shift Start", "Shift End", "Transactions", "Gross Sales", "Discounts", "Returns", "Voids", "Net Sales", "Cash Expected", "Cash Counted", "Variance" };
        var rows = result.Rows.Select(r => new object?[]
        {
            r.CashierName, r.Branch, r.Terminal, r.ShiftStart, r.ShiftEnd, r.Transactions, r.GrossSales, r.Discounts, r.Returns, r.Voids,
            r.NetSales, r.CashExpected, r.CashCounted, r.Variance,
        }).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"cashier-sales\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Top Cashier", result.Kpis.TopCashier ?? "—"), ("Total Sales", result.Kpis.TotalSales.ToString("0.##")),
            ("Cash Variance", result.Kpis.CashVariance.ToString("0.##")), ("Voids", result.Kpis.VoidCount.ToString()),
        };
        return BuildExportFile(format, "Cashier Sales Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"cashier-sales-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<CashierSalesResult> BuildCashierSalesAsync(
        DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, Guid? cashierId, Guid? terminalId)
    {
        var shiftsQ = db.CashierShifts
            .Include(s => s.Cashier)
            .Include(s => s.Terminal)
            .Include(s => s.Branch)
            .Where(s => s.OpenedAt >= rangeFrom && s.OpenedAt < rangeToExclusive);
        if (branchId.HasValue) shiftsQ = shiftsQ.Where(s => s.BranchId == branchId);
        if (cashierId.HasValue) shiftsQ = shiftsQ.Where(s => s.CashierId == cashierId);
        if (terminalId.HasValue) shiftsQ = shiftsQ.Where(s => s.TerminalId == terminalId);

        var shifts = await shiftsQ.OrderByDescending(s => s.TotalSales).ToListAsync();

        // Scope Orders/Returns by the same range + branch/cashier/terminal filters as the shifts query
        // (rather than a shiftIds.Contains(...) list) — the MySQL EF Core provider used here cannot
        // assign a type mapping to a parameterized List<Guid> IN-list, which throws at query time.
        var ordersQ = db.Orders.Where(o => o.ShiftId != null && o.CreatedAt >= rangeFrom && o.CreatedAt < rangeToExclusive);
        if (branchId.HasValue) ordersQ = ordersQ.Where(o => o.BranchId == branchId);
        if (cashierId.HasValue) ordersQ = ordersQ.Where(o => o.CashierId == cashierId);
        if (terminalId.HasValue) ordersQ = ordersQ.Where(o => o.TerminalId == terminalId);

        var orderAggByShift = await ordersQ
            .GroupBy(o => o.ShiftId!.Value)
            .Select(g => new
            {
                shiftId = g.Key,
                transactions = g.Count(o => o.PaymentStatus == "paid"),
                grossSales = g.Sum(o => o.Subtotal),
                discounts = g.Sum(o => o.DiscountAmount),
                voids = g.Count(o => o.OrderStatus == "cancelled"),
            })
            .ToListAsync();
        var orderAggMap = orderAggByShift.ToDictionary(x => x.shiftId);

        var returnsQ = db.CustomerReturns
            .Include(r => r.Order)
            .Where(r => r.Order != null && r.Order.ShiftId != null && r.CreatedAt >= rangeFrom && r.CreatedAt < rangeToExclusive);
        if (branchId.HasValue) returnsQ = returnsQ.Where(r => r.BranchId == branchId);

        var returnsByShift = await returnsQ
            .GroupBy(r => r.Order!.ShiftId!.Value)
            .Select(g => new { shiftId = g.Key, amount = g.Sum(r => r.RefundAmount) })
            .ToListAsync();
        var returnsMap = returnsByShift.ToDictionary(x => x.shiftId, x => x.amount);

        var rows = shifts.Select(s =>
        {
            var agg = orderAggMap.GetValueOrDefault(s.Id);
            var returns = returnsMap.GetValueOrDefault(s.Id, 0m);
            var gross = agg?.grossSales ?? 0m;
            var discounts = agg?.discounts ?? 0m;
            return new CashierSalesRow
            {
                CashierId = s.CashierId,
                CashierName = s.Cashier?.FullName ?? "Unknown",
                Branch = s.Branch?.Name ?? "—",
                ShiftId = s.Id,
                ShiftStart = s.OpenedAt,
                ShiftEnd = s.ClosedAt,
                Terminal = s.Terminal?.Name ?? "—",
                Transactions = agg?.transactions ?? 0,
                GrossSales = gross,
                Discounts = discounts,
                Returns = returns,
                Voids = agg?.voids ?? 0,
                NetSales = gross - discounts - returns,
                CashExpected = s.OpeningAmount + s.CashSales,
                CashCounted = s.ClosingAmount,
                Variance = s.Variance,
            };
        }).ToList();

        return new CashierSalesResult
        {
            Kpis = new CashierSalesKpis
            {
                TopCashier = rows.OrderByDescending(r => r.NetSales).FirstOrDefault()?.CashierName,
                TotalSales = shifts.Sum(s => s.TotalSales),
                CashVariance = shifts.Where(s => s.Status == "closed").Sum(s => s.Variance ?? 0m),
                ReturnCount = returnsMap.Count,
                VoidCount = rows.Sum(r => r.Voids),
            },
            Rows = rows,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 4. Payment Methods (RPT-FINANCE-PAYMENT-METHODS)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("payment-methods")]
    public async Task<IActionResult> GetPaymentMethods(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId,
        [FromQuery] Guid? terminalId, [FromQuery] Guid? cashierId, [FromQuery] string? paymentMethod)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: false);
        if (error != null) return BadRequest(new { message = error });

        var result = await BuildPaymentMethodsAsync(rangeFrom, rangeTo, branchId, terminalId, cashierId, paymentMethod);
        return Ok(result);
    }

    [HttpGet("payment-methods/export")]
    public async Task<IActionResult> ExportPaymentMethods(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId,
        [FromQuery] Guid? terminalId, [FromQuery] Guid? cashierId, [FromQuery] string? paymentMethod, [FromQuery] Guid? exportedBy,
        [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: false);
        if (error != null) return BadRequest(new { message = error });

        var result = await BuildPaymentMethodsAsync(rangeFrom, rangeTo, branchId, terminalId, cashierId, paymentMethod);
        var headers = new[] { "Payment Method", "Branch", "Transactions", "Gross Amount", "Net Settled", "Pending Amount", "Status" };
        var rows = result.Rows.Select(r => new object?[] { r.Method, r.Branch, r.Transactions, r.GrossAmount, r.NetSettled, r.PendingAmount, r.Status }).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"payment-methods\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Cash Collected", result.Kpis.CashCollected.ToString("0.##")), ("Card Settled", result.Kpis.CardSettled.ToString("0.##")),
            ("Wallet Amount", result.Kpis.WalletAmount.ToString("0.##")), ("Refund Value", result.Kpis.RefundValue.ToString("0.##")),
            ("Payment Fees", result.Kpis.PaymentFees.ToString("0.##")),
        };
        return BuildExportFile(format, "Payment Methods Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"payment-methods-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<PaymentMethodsResult> BuildPaymentMethodsAsync(
        DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, Guid? terminalId, Guid? cashierId, string? paymentMethod)
    {
        var paymentsQ = db.OrderPayments
            .Include(p => p.Order).ThenInclude(o => o!.Branch)
            .Where(p => p.Order != null && p.CreatedAt >= rangeFrom && p.CreatedAt < rangeToExclusive);
        if (branchId.HasValue) paymentsQ = paymentsQ.Where(p => p.Order!.BranchId == branchId);
        if (terminalId.HasValue) paymentsQ = paymentsQ.Where(p => p.Order!.TerminalId == terminalId);
        if (cashierId.HasValue) paymentsQ = paymentsQ.Where(p => p.Order!.CashierId == cashierId);
        if (!string.IsNullOrEmpty(paymentMethod)) paymentsQ = paymentsQ.Where(p => p.PaymentMethod == paymentMethod);

        var rawPayments = await paymentsQ
            .Select(p => new { p.PaymentMethod, BranchName = p.Order!.Branch!.Name, p.Amount, p.Status })
            .ToListAsync();

        var rows = rawPayments
            .GroupBy(p => new { p.PaymentMethod, p.BranchName })
            .Select(g => new PaymentMethodRow
            {
                Method = g.Key.PaymentMethod,
                Branch = g.Key.BranchName,
                Transactions = g.Count(),
                GrossAmount = g.Sum(x => x.Amount),
                NetSettled = g.Where(x => x.Status == "completed").Sum(x => x.Amount),
                PendingAmount = g.Where(x => x.Status != "completed").Sum(x => x.Amount),
                Status = g.All(x => x.Status == "completed") ? "settled" : g.Any(x => x.Status == "completed") ? "partial" : "pending",
            })
            .OrderByDescending(r => r.GrossAmount)
            .ToList();

        var returnsQ = db.CustomerReturns.Where(r => r.CreatedAt >= rangeFrom && r.CreatedAt < rangeToExclusive);
        if (branchId.HasValue) returnsQ = returnsQ.Where(r => r.BranchId == branchId);
        var refunds = await returnsQ
            .GroupBy(r => r.RefundMethod)
            .Select(g => new RefundMethodRow { Method = g.Key, Amount = g.Sum(r => r.RefundAmount) })
            .ToListAsync();

        // Payment Fees KPI (FRD §7.16) — custom/service fees are recorded on the order, not the payment row.
        var feesQ = db.Orders.Where(o => o.CreatedAt >= rangeFrom && o.CreatedAt < rangeToExclusive && o.PaymentStatus == "paid");
        if (branchId.HasValue) feesQ = feesQ.Where(o => o.BranchId == branchId);
        if (terminalId.HasValue) feesQ = feesQ.Where(o => o.TerminalId == terminalId);
        if (cashierId.HasValue) feesQ = feesQ.Where(o => o.CashierId == cashierId);
        var totalFees = await feesQ.SumAsync(o => o.CustomFeeAmount);

        return new PaymentMethodsResult
        {
            Kpis = new PaymentMethodsKpis
            {
                CashCollected = rows.Where(r => r.Method == "cash").Sum(r => r.GrossAmount),
                CardSettled = rows.Where(r => r.Method == "card").Sum(r => r.GrossAmount),
                WalletAmount = rows.Where(r => r.Method == "wallet").Sum(r => r.GrossAmount),
                PendingAmount = rows.Sum(r => r.PendingAmount),
                RefundValue = refunds.Sum(r => r.Amount),
                PaymentFees = totalFees,
            },
            Rows = rows,
            Refunds = refunds,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 5. Low Stock / Inventory Snapshot (RPT-INVENTORY-LOW-STOCK / RPT-INVENTORY-SNAPSHOT)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("low-stock")]
    public async Task<IActionResult> GetLowStock(
        [FromQuery] Guid? branchId, [FromQuery] Guid? categoryId, [FromQuery] bool onlyLowStock = true)
    {
        var result = await BuildLowStockAsync(branchId, categoryId, onlyLowStock);
        return Ok(result);
    }

    [HttpGet("low-stock/export")]
    public async Task<IActionResult> ExportLowStock(
        [FromQuery] Guid? branchId, [FromQuery] Guid? categoryId, [FromQuery] bool onlyLowStock = true, [FromQuery] Guid? exportedBy = null,
        [FromQuery] string? format = "csv")
    {
        var result = await BuildLowStockAsync(branchId, categoryId, onlyLowStock);
        var headers = new[] { "SKU", "Product Name", "Category", "Branch", "Available Qty", "Reorder Level", "Recommended Reorder Qty", "Preferred Supplier", "Last Sold Date", "Urgency" };
        var rows = result.Rows.Select(r => new object?[]
        {
            r.Sku, r.ProductName, r.Category, r.Branch, r.AvailableQty, r.ReorderLevel, r.RecommendedReorderQty, r.PreferredSupplier, r.LastSoldDate, r.Urgency,
        }).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"low-stock\",\"onlyLowStock\":{onlyLowStock.ToString().ToLowerInvariant()},\"rows\":{result.Rows.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Low Stock SKUs", result.Kpis.LowStockSkus.ToString()), ("Critical SKUs", result.Kpis.CriticalSkus.ToString()),
            ("Out of Stock", result.Kpis.OutOfStockSkus.ToString()), ("Est. Reorder Value", result.Kpis.EstimatedReorderValue.ToString("0.##")),
            ("Suppliers to Contact", result.Kpis.SuppliersToContact.ToString()),
        };
        return BuildExportFile(format, "Low Stock Report", onlyLowStock ? "Below reorder threshold only" : "All stock",
            kpis, headers, rows, $"low-stock-{DateTime.UtcNow:yyyy-MM-dd}");
    }

    private async Task<LowStockResult> BuildLowStockAsync(Guid? branchId, Guid? categoryId, bool onlyLowStock)
    {
        var stockQ = db.InventoryStocks
            .Include(s => s.Product).ThenInclude(p => p!.Category)
            .Include(s => s.Branch)
            .Where(s => s.Product != null && s.Branch != null);
        if (branchId.HasValue) stockQ = stockQ.Where(s => s.BranchId == branchId);
        if (categoryId.HasValue) stockQ = stockQ.Where(s => s.Product!.CategoryId == categoryId);

        var stocks = await stockQ.ToListAsync();
        var withAvailability = stocks
            .Select(s => new { Stock = s, Available = s.Quantity - s.ReservedQuantity })
            .Where(x => !onlyLowStock || x.Available <= x.Stock.ReorderLevel)
            .ToList();

        var productIdSet = withAvailability.Select(x => x.Stock.ProductId).ToHashSet();
        var branchIdSet = withAvailability.Select(x => x.Stock.BranchId).ToHashSet();

        // Best-effort "preferred supplier" = most recently received batch's supplier for that product+branch.
        // Scoped by the same branchId/categoryId filters as the stock query (rather than a
        // productIds/branchIds.Contains(...) list) — the MySQL EF Core provider used here cannot assign
        // a type mapping to a parameterized List<Guid> IN-list, which throws at query time.
        var batchesQ = db.InventoryBatches.Include(b => b.Product).Include(b => b.Supplier).Where(b => b.Supplier != null);
        if (branchId.HasValue) batchesQ = batchesQ.Where(b => b.BranchId == branchId);
        if (categoryId.HasValue) batchesQ = batchesQ.Where(b => b.Product != null && b.Product.CategoryId == categoryId);
        var latestBatches = await batchesQ
            .OrderByDescending(b => b.ReceivedDate)
            .Select(b => new { b.ProductId, b.BranchId, SupplierName = b.Supplier!.Name })
            .ToListAsync();
        var supplierMap = latestBatches
            .Where(b => productIdSet.Contains(b.ProductId) && branchIdSet.Contains(b.BranchId))
            .GroupBy(b => (b.ProductId, b.BranchId))
            .ToDictionary(g => g.Key, g => g.First().SupplierName);

        var lastSoldQ = db.OrderItems.Include(i => i.Order).Include(i => i.Product).Where(i => i.Order != null);
        if (branchId.HasValue) lastSoldQ = lastSoldQ.Where(i => i.Order!.BranchId == branchId);
        if (categoryId.HasValue) lastSoldQ = lastSoldQ.Where(i => i.Product != null && i.Product.CategoryId == categoryId);
        var lastSold = await lastSoldQ
            .GroupBy(i => new { i.ProductId, BranchId = i.Order!.BranchId })
            .Select(g => new { g.Key.ProductId, g.Key.BranchId, LastSold = g.Max(i => i.Order!.CreatedAt) })
            .ToListAsync();
        var lastSoldMap = lastSold
            .Where(x => productIdSet.Contains(x.ProductId) && branchIdSet.Contains(x.BranchId))
            .ToDictionary(x => (x.ProductId, x.BranchId), x => x.LastSold);

        var rows = withAvailability.Select(x =>
        {
            var s = x.Stock;
            var urgency = x.Available <= 0 ? "critical" : x.Available <= s.ReorderLevel ? "low" : "ok";
            var recommendedQty = Math.Max(0, s.ReorderLevel * 2 - (int)x.Available);
            var costOrPrice = s.Product!.CostPrice ?? s.Product.BasePrice;
            return new LowStockRow
            {
                Sku = s.Product.Sku,
                ProductName = s.Product.Name,
                Category = s.Product.Category?.Name ?? "—",
                Branch = s.Branch!.Name,
                AvailableQty = x.Available,
                ReorderLevel = s.ReorderLevel,
                RecommendedReorderQty = recommendedQty,
                PreferredSupplier = supplierMap.GetValueOrDefault((s.ProductId, s.BranchId)),
                LastSoldDate = lastSoldMap.TryGetValue((s.ProductId, s.BranchId), out var lastSold) ? lastSold : null,
                Urgency = urgency,
                EstimatedReorderValue = recommendedQty * costOrPrice,
            };
        })
        .OrderBy(r => r.AvailableQty)
        .ToList();

        return new LowStockResult
        {
            Kpis = new LowStockKpis
            {
                LowStockSkus = rows.Count(r => r.Urgency == "low"),
                CriticalSkus = rows.Count(r => r.Urgency == "critical"),
                OutOfStockSkus = rows.Count(r => r.AvailableQty <= 0),
                EstimatedReorderValue = rows.Sum(r => r.EstimatedReorderValue),
                AffectedBranches = rows.Select(r => r.Branch).Distinct().Count(),
                SuppliersToContact = rows.Where(r => r.PreferredSupplier != null).Select(r => r.PreferredSupplier).Distinct().Count(),
            },
            Rows = rows,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 6. Inventory Snapshot (RPT-INVENTORY-SNAPSHOT)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("inventory-snapshot")]
    public async Task<IActionResult> GetInventorySnapshot([FromQuery] Guid? branchId, [FromQuery] Guid? categoryId)
    {
        var result = await BuildInventorySnapshotAsync(branchId, categoryId);
        return Ok(result);
    }

    [HttpGet("inventory-snapshot/export")]
    public async Task<IActionResult> ExportInventorySnapshot(
        [FromQuery] Guid? branchId, [FromQuery] Guid? categoryId, [FromQuery] Guid? exportedBy = null, [FromQuery] string? format = "csv")
    {
        var result = await BuildInventorySnapshotAsync(branchId, categoryId);
        var headers = new[] { "SKU", "Product Name", "Category", "Branch", "On Hand Qty", "Reserved Qty", "Available Qty", "Reorder Level", "Cost Price", "Stock Cost Value", "Retail Value", "Last Movement Date", "Stock Status" };
        var rows = result.Rows.Select(r => new object?[]
        {
            r.Sku, r.ProductName, r.Category, r.Branch, r.OnHandQty, r.ReservedQty, r.AvailableQty, r.ReorderLevel,
            r.CostPrice, r.StockCostValue, r.RetailValue, r.LastMovementDate, r.StockStatus,
        }).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"inventory-snapshot\",\"rows\":{result.Rows.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Total Stock Value", result.Kpis.TotalStockValue.ToString("0.##")), ("SKU Count", result.Kpis.SkuCount.ToString()),
            ("Available Qty", result.Kpis.AvailableQty.ToString("0.##")), ("Reserved Qty", result.Kpis.ReservedQty.ToString("0.##")),
            ("Out of Stock SKUs", result.Kpis.OutOfStockSkus.ToString()), ("Negative Stock Exceptions", result.Kpis.NegativeStockExceptions.ToString()),
        };
        return BuildExportFile(format, "Inventory Snapshot Report", "Current stock snapshot", kpis, headers, rows, $"inventory-snapshot-{DateTime.UtcNow:yyyy-MM-dd}");
    }

    private async Task<InventorySnapshotResult> BuildInventorySnapshotAsync(Guid? branchId, Guid? categoryId)
    {
        var stockQ = db.InventoryStocks
            .Include(s => s.Product).ThenInclude(p => p!.Category)
            .Include(s => s.Branch)
            .Where(s => s.Product != null && s.Branch != null);
        if (branchId.HasValue) stockQ = stockQ.Where(s => s.BranchId == branchId);
        if (categoryId.HasValue) stockQ = stockQ.Where(s => s.Product!.CategoryId == categoryId);

        var stocks = await stockQ.ToListAsync();

        var rows = stocks.Select(s =>
        {
            var available = s.Quantity - s.ReservedQuantity;
            var costPrice = s.Product!.CostPrice ?? s.Product.BasePrice;
            var status = s.Quantity < 0 ? "negative" : available <= 0 ? "out of stock" : available <= s.ReorderLevel ? "low" : "in stock";
            return new InventorySnapshotRow
            {
                Sku = s.Product.Sku,
                ProductName = s.Product.Name,
                Category = s.Product.Category?.Name ?? "—",
                Branch = s.Branch!.Name,
                OnHandQty = s.Quantity,
                ReservedQty = s.ReservedQuantity,
                AvailableQty = available,
                ReorderLevel = s.ReorderLevel,
                CostPrice = costPrice,
                StockCostValue = s.Quantity * costPrice,
                RetailValue = s.Quantity * s.Product.BasePrice,
                // This system tracks branch-level stock (InventoryStock) separately from warehouse stock
                // (WarehouseStock) — they are different pools, not one snapshot, so LastUpdated is the closest
                // available proxy for "last movement" at the branch-stock granularity the FRD's snapshot covers.
                LastMovementDate = s.LastUpdated,
                StockStatus = status,
            };
        })
        .OrderByDescending(r => r.StockCostValue)
        .ToList();

        return new InventorySnapshotResult
        {
            Kpis = new InventorySnapshotKpis
            {
                TotalStockValue = rows.Sum(r => r.StockCostValue),
                SkuCount = rows.Select(r => r.Sku).Distinct().Count(),
                AvailableQty = rows.Sum(r => r.AvailableQty),
                ReservedQty = rows.Sum(r => r.ReservedQty),
                OutOfStockSkus = rows.Count(r => r.StockStatus == "out of stock"),
                NegativeStockExceptions = rows.Count(r => r.StockStatus == "negative"),
            },
            Rows = rows,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // Shared helpers
    // ───────────────────────────────────────────────────────────────────────

    /// <summary>Builds a CSV or PDF export file from the same headers/rows/KPIs, per the FRD's multi-format export rule.</summary>
    private FileContentResult BuildExportFile(
        string? format, string title, string filterSummary, (string Label, string Value)[] kpis,
        string[] headers, IReadOnlyList<object?[]> rows, string baseFileName)
    {
        if (string.Equals(format, "pdf", StringComparison.OrdinalIgnoreCase))
        {
            var pdfBytes = ReportPdfWriter.Write(title, filterSummary, kpis, headers, rows);
            return File(pdfBytes, "application/pdf", $"{baseFileName}.pdf");
        }
        var csvBytes = CsvWriter.Write(headers, rows);
        return File(csvBytes, "text/csv", $"{baseFileName}.csv");
    }

    private static (DateTime From, DateTime ToExclusive, string? Error) ResolveRange(DateTime? from, DateTime? to, bool defaultToFirstOfMonth)
    {
        var today = DateTime.UtcNow.Date;
        var rangeFrom = (from ?? (defaultToFirstOfMonth ? new DateTime(today.Year, today.Month, 1) : today)).Date;
        var rangeToExclusive = (to ?? today).Date.AddDays(1);
        if (rangeToExclusive <= rangeFrom) rangeToExclusive = rangeFrom.AddDays(1);
        if ((rangeToExclusive - rangeFrom).TotalDays > MaxRangeDays)
        {
            return (rangeFrom, rangeToExclusive, $"Date range too large — please narrow to {MaxRangeDays} days or fewer, or use Export for bulk data.");
        }
        return (rangeFrom, rangeToExclusive, null);
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Result shapes (no shared DTO layer exists in this API yet — these are
// scoped to the Reports feature, mirroring the anonymous-object convention
// used by DashboardController but named for CSV-export reuse).
// ─────────────────────────────────────────────────────────────────────────

public sealed class DailySalesHour
{
    public int Hour { get; init; }
    public int Transactions { get; init; }
    public decimal GrossSales { get; init; }
    public decimal Discounts { get; init; }
    public decimal Returns { get; init; }
    public decimal NetSales { get; init; }
    public decimal Vat { get; init; }
    public decimal Cash { get; init; }
    public decimal Card { get; init; }
    public decimal Wallet { get; init; }
    public decimal AvgBasket { get; init; }
}

public sealed class DailySalesKpis
{
    public decimal GrossSales { get; init; }
    public decimal NetSales { get; init; }
    public int Transactions { get; init; }
    public decimal AvgBasket { get; init; }
    public decimal VatCollected { get; init; }
    public decimal ReturnsRefunds { get; init; }
}

public sealed class PaymentSplitRow
{
    public string Method { get; init; } = "";
    public decimal Amount { get; init; }
}

public sealed class DailySalesResult
{
    public DailySalesKpis Kpis { get; init; } = new();
    public List<DailySalesHour> Hourly { get; init; } = [];
    public List<PaymentSplitRow> PaymentSplit { get; init; } = [];
}

public sealed class DailyLineAgg
{
    public int Transactions { get; init; }
    public decimal GrossSales { get; init; }
    public decimal Discounts { get; init; }
    public decimal Returns { get; init; }
    public decimal NetSales { get; init; }
    public decimal Vat { get; init; }
    public decimal Cogs { get; init; }
}

public sealed class MonthlyDayRow
{
    public DateOnly Date { get; init; }
    public int Transactions { get; init; }
    public decimal GrossSales { get; init; }
    public decimal Discounts { get; init; }
    public decimal Returns { get; init; }
    public decimal NetSales { get; init; }
    public decimal Vat { get; init; }
    public decimal Cogs { get; init; }
    public decimal GrossProfit { get; init; }
    public decimal? MarginPct { get; init; }
    public decimal AvgBasket { get; init; }
    public decimal? PreviousPeriodSales { get; init; }
    public decimal? GrowthPct { get; init; }
}

public sealed class MonthlySalesKpis
{
    public decimal NetSales { get; init; }
    public decimal GrossProfit { get; init; }
    public decimal? MarginPct { get; init; }
    public int Transactions { get; init; }
    public decimal ReturnValue { get; init; }
    public decimal DiscountValue { get; init; }
}

public sealed class MonthlySalesResult
{
    public MonthlySalesKpis Kpis { get; init; } = new();
    public List<MonthlyDayRow> Daily { get; init; } = [];
}

public sealed class CashierSalesRow
{
    public Guid CashierId { get; init; }
    public string CashierName { get; init; } = "";
    public string Branch { get; init; } = "";
    public Guid ShiftId { get; init; }
    public DateTime ShiftStart { get; init; }
    public DateTime? ShiftEnd { get; init; }
    public string Terminal { get; init; } = "";
    public int Transactions { get; init; }
    public decimal GrossSales { get; init; }
    public decimal Discounts { get; init; }
    public decimal Returns { get; init; }
    public int Voids { get; init; }
    public decimal NetSales { get; init; }
    public decimal CashExpected { get; init; }
    public decimal? CashCounted { get; init; }
    public decimal? Variance { get; init; }
}

public sealed class CashierSalesKpis
{
    public string? TopCashier { get; init; }
    public decimal TotalSales { get; init; }
    public decimal CashVariance { get; init; }
    public int ReturnCount { get; init; }
    public int VoidCount { get; init; }
}

public sealed class CashierSalesResult
{
    public CashierSalesKpis Kpis { get; init; } = new();
    public List<CashierSalesRow> Rows { get; init; } = [];
}

public sealed class PaymentMethodRow
{
    public string Method { get; init; } = "";
    public string Branch { get; init; } = "";
    public int Transactions { get; init; }
    public decimal GrossAmount { get; init; }
    public decimal NetSettled { get; init; }
    public decimal PendingAmount { get; init; }
    public string Status { get; init; } = "";
}

public sealed class RefundMethodRow
{
    public string Method { get; init; } = "";
    public decimal Amount { get; init; }
}

public sealed class PaymentMethodsKpis
{
    public decimal CashCollected { get; init; }
    public decimal CardSettled { get; init; }
    public decimal WalletAmount { get; init; }
    public decimal PendingAmount { get; init; }
    public decimal RefundValue { get; init; }
    public decimal PaymentFees { get; init; }
}

public sealed class PaymentMethodsResult
{
    public PaymentMethodsKpis Kpis { get; init; } = new();
    public List<PaymentMethodRow> Rows { get; init; } = [];
    public List<RefundMethodRow> Refunds { get; init; } = [];
}

public sealed class LowStockRow
{
    public string Sku { get; init; } = "";
    public string ProductName { get; init; } = "";
    public string Category { get; init; } = "";
    public string Branch { get; init; } = "";
    public decimal AvailableQty { get; init; }
    public int ReorderLevel { get; init; }
    public int RecommendedReorderQty { get; init; }
    public string? PreferredSupplier { get; init; }
    public DateTime? LastSoldDate { get; init; }
    public string Urgency { get; init; } = "";
    public decimal EstimatedReorderValue { get; init; }
}

public sealed class LowStockKpis
{
    public int LowStockSkus { get; init; }
    public int CriticalSkus { get; init; }
    public int OutOfStockSkus { get; init; }
    public decimal EstimatedReorderValue { get; init; }
    public int AffectedBranches { get; init; }
    public int SuppliersToContact { get; init; }
}

public sealed class LowStockResult
{
    public LowStockKpis Kpis { get; init; } = new();
    public List<LowStockRow> Rows { get; init; } = [];
}

public sealed class InventorySnapshotRow
{
    public string Sku { get; init; } = "";
    public string ProductName { get; init; } = "";
    public string Category { get; init; } = "";
    public string Branch { get; init; } = "";
    public decimal OnHandQty { get; init; }
    public decimal ReservedQty { get; init; }
    public decimal AvailableQty { get; init; }
    public int ReorderLevel { get; init; }
    public decimal CostPrice { get; init; }
    public decimal StockCostValue { get; init; }
    public decimal RetailValue { get; init; }
    public DateTime LastMovementDate { get; init; }
    public string StockStatus { get; init; } = "";
}

public sealed class InventorySnapshotKpis
{
    public decimal TotalStockValue { get; init; }
    public int SkuCount { get; init; }
    public decimal AvailableQty { get; init; }
    public decimal ReservedQty { get; init; }
    public int OutOfStockSkus { get; init; }
    public int NegativeStockExceptions { get; init; }
}

public sealed class InventorySnapshotResult
{
    public InventorySnapshotKpis Kpis { get; init; } = new();
    public List<InventorySnapshotRow> Rows { get; init; } = [];
}
