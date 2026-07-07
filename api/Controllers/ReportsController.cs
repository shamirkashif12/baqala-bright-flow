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
    // 7. Branch Sales (RPT-SALES-BRANCH)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("branch-sales")]
    public async Task<IActionResult> GetBranchSales([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] string? city)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildBranchSalesAsync(rangeFrom, rangeTo, city));
    }

    [HttpGet("branch-sales/export")]
    public async Task<IActionResult> ExportBranchSales(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] string? city, [FromQuery] Guid? exportedBy,
        [FromQuery] bool includeMargin = true, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildBranchSalesAsync(rangeFrom, rangeTo, city);
        var headers = includeMargin
            ? new[] { "Branch Code", "Branch Name", "City", "Open Terminals", "Transactions", "Gross Sales", "Discounts", "Returns", "Net Sales", "VAT", "Average Basket", "Gross Profit", "Margin %", "Rank" }
            : new[] { "Branch Code", "Branch Name", "City", "Open Terminals", "Transactions", "Gross Sales", "Discounts", "Returns", "Net Sales", "VAT", "Average Basket", "Rank" };
        var rows = result.Rows.Select(r => includeMargin
            ? new object?[] { r.BranchCode, r.BranchName, r.City, r.OpenTerminals, r.Transactions, r.GrossSales, r.Discounts, r.Returns, r.NetSales, r.Vat, r.AvgBasket, r.GrossProfit, r.MarginPct?.ToString("0.0") ?? "N/A", r.Rank }
            : new object?[] { r.BranchCode, r.BranchName, r.City, r.OpenTerminals, r.Transactions, r.GrossSales, r.Discounts, r.Returns, r.NetSales, r.Vat, r.AvgBasket, r.Rank }
        ).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, null,
            $"{{\"report\":\"branch-sales\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new List<(string, string)> {
            ("Top Branch", result.Kpis.TopBranch ?? "—"), ("Lowest Branch", result.Kpis.LowestBranch ?? "—"),
            ("Total Net Sales", result.Kpis.TotalNetSales.ToString("0.##")), ("Average Branch Sales", result.Kpis.AverageBranchSales.ToString("0.##")),
            ("Total Returns", result.Kpis.TotalReturns.ToString("0.##")),
        };
        if (includeMargin) kpis.Add(("Overall Margin %", result.Kpis.OverallMarginPct?.ToString("0.0") ?? "N/A"));
        return BuildExportFile(format, "Branch Sales Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis.ToArray(), headers, rows, $"branch-sales-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<BranchSalesResult> BuildBranchSalesAsync(DateTime rangeFrom, DateTime rangeToExclusive, string? city)
    {
        var branchesQ = db.Branches.Where(b => b.Status == "active");
        if (!string.IsNullOrEmpty(city)) branchesQ = branchesQ.Where(b => b.City == city);
        var branches = await branchesQ.ToListAsync();

        var itemsQ = db.OrderItems.Include(i => i.Order)
            .Where(i => i.Order != null && i.Order.CreatedAt >= rangeFrom && i.Order.CreatedAt < rangeToExclusive && i.Order.PaymentStatus == "paid");
        var rawItems = await itemsQ.Select(i => new {
            BranchId = i.Order!.BranchId, OrderId = i.OrderId, Gross = i.UnitPrice * i.Quantity,
            i.DiscountAmount, i.TaxAmount, Cogs = i.Quantity * (i.Product!.CostPrice ?? 0m),
        }).ToListAsync();
        var itemsByBranch = rawItems.ToLookup(x => x.BranchId);

        var returnsByBranch = (await db.CustomerReturns
            .Where(r => r.CreatedAt >= rangeFrom && r.CreatedAt < rangeToExclusive)
            .Select(r => new { r.BranchId, r.RefundAmount }).ToListAsync())
            .ToLookup(x => x.BranchId, x => x.RefundAmount);

        var terminalsByBranch = (await db.Terminals.Where(t => t.Status != "offline").Select(t => t.BranchId).ToListAsync())
            .ToLookup(x => x);

        var rows = branches.Select(b =>
        {
            var items = itemsByBranch[b.Id].ToList();
            var gross = items.Sum(x => x.Gross);
            var discounts = items.Sum(x => x.DiscountAmount);
            var returns = returnsByBranch[b.Id].Sum();
            var netSales = gross - discounts - returns;
            var cogs = items.Sum(x => x.Cogs);
            var transactions = items.Select(x => x.OrderId).Distinct().Count();
            return new BranchSalesRow
            {
                BranchCode = b.BranchCode ?? "—", BranchName = b.Name, City = b.City ?? "—",
                OpenTerminals = terminalsByBranch[b.Id].Count(),
                Transactions = transactions, GrossSales = gross, Discounts = discounts, Returns = returns, NetSales = netSales,
                Vat = items.Sum(x => x.TaxAmount), AvgBasket = transactions > 0 ? Math.Round(netSales / transactions, 2) : 0m,
                GrossProfit = netSales - cogs, MarginPct = netSales > 0 ? Math.Round((netSales - cogs) / netSales * 100, 1) : null,
            };
        })
        .OrderByDescending(r => r.NetSales)
        .ToList();

        for (var i = 0; i < rows.Count; i++) rows[i].Rank = i + 1;

        var totalNet = rows.Sum(r => r.NetSales);
        var totalGrossProfit = rows.Sum(r => r.GrossProfit);
        return new BranchSalesResult
        {
            Kpis = new BranchSalesKpis
            {
                TopBranch = rows.FirstOrDefault()?.BranchName,
                LowestBranch = rows.Count > 0 ? rows[^1].BranchName : null,
                TotalNetSales = totalNet,
                AverageBranchSales = rows.Count > 0 ? Math.Round(totalNet / rows.Count, 2) : 0m,
                TotalReturns = rows.Sum(r => r.Returns),
                OverallMarginPct = totalNet > 0 ? Math.Round(totalGrossProfit / totalNet * 100, 1) : null,
            },
            Rows = rows,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 8. Terminal Report (RPT-NETWORK-TERMINAL)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("terminal")]
    public async Task<IActionResult> GetTerminalReport(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] Guid? terminalId, [FromQuery] string? status)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: false);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildTerminalReportAsync(rangeFrom, rangeTo, branchId, terminalId, status));
    }

    [HttpGet("terminal/export")]
    public async Task<IActionResult> ExportTerminalReport(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] Guid? terminalId, [FromQuery] string? status,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: false);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildTerminalReportAsync(rangeFrom, rangeTo, branchId, terminalId, status);
        var headers = new[] { "Terminal ID", "Terminal Name", "Branch", "Status", "Assigned Cashier", "Transactions", "Net Sales", "Refunds", "Uptime %", "Last Sync Time" };
        var rows = result.Rows.Select(r => new object?[]
        {
            r.TerminalId, r.TerminalName, r.Branch, r.Status, r.AssignedCashier, r.Transactions, r.NetSales, r.Refunds, r.UptimePct, r.LastSyncTime,
        }).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"terminal\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Active Terminals", result.Kpis.ActiveTerminals.ToString()), ("Offline Terminals", result.Kpis.OfflineTerminals.ToString()),
            ("Terminal Sales", result.Kpis.TerminalSales.ToString("0.##")), ("Avg Uptime %", result.Kpis.AvgUptimePct.ToString("0.0")),
        };
        return BuildExportFile(format, "Terminal Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"terminal-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<TerminalReportResult> BuildTerminalReportAsync(DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, Guid? terminalId, string? status)
    {
        var termQ = db.Terminals.Include(t => t.Branch).Include(t => t.AssignedCashier).AsQueryable();
        if (branchId.HasValue) termQ = termQ.Where(t => t.BranchId == branchId);
        if (terminalId.HasValue) termQ = termQ.Where(t => t.Id == terminalId);
        if (!string.IsNullOrEmpty(status)) termQ = termQ.Where(t => t.Status == status);
        var terminals = await termQ.ToListAsync();

        var ordersQ = db.Orders.Where(o => o.TerminalId != null && o.CreatedAt >= rangeFrom && o.CreatedAt < rangeToExclusive && o.PaymentStatus == "paid");
        if (branchId.HasValue) ordersQ = ordersQ.Where(o => o.BranchId == branchId);
        var orderMap = (await ordersQ
            .GroupBy(o => o.TerminalId!.Value)
            .Select(g => new { terminalId = g.Key, transactions = g.Count(), netSales = g.Sum(o => o.TotalAmount - o.TaxAmount) })
            .ToListAsync())
            .ToDictionary(x => x.terminalId);

        var returnMap = (await db.CustomerReturns.Include(r => r.Order)
            .Where(r => r.Order != null && r.Order.TerminalId != null && r.CreatedAt >= rangeFrom && r.CreatedAt < rangeToExclusive)
            .GroupBy(r => r.Order!.TerminalId!.Value)
            .Select(g => new { terminalId = g.Key, refunds = g.Sum(r => r.RefundAmount) })
            .ToListAsync())
            .ToDictionary(x => x.terminalId, x => x.refunds);

        var tradingMinutes = Math.Max(1, (int)(rangeToExclusive - rangeFrom).TotalMinutes);
        var rows = terminals.Select(t =>
        {
            var agg = orderMap.GetValueOrDefault(t.Id);
            var uptimePct = Math.Round(Math.Min(100m, (decimal)t.UptimeMinutes / tradingMinutes * 100), 1);
            return new TerminalReportRow
            {
                TerminalId = t.TerminalCode ?? t.Id.ToString()[..8], TerminalName = t.Name, Branch = t.Branch?.Name ?? "—",
                Status = t.Status, AssignedCashier = t.AssignedCashier?.FullName ?? "—",
                Transactions = agg?.transactions ?? 0, NetSales = agg?.netSales ?? 0m,
                Refunds = returnMap.GetValueOrDefault(t.Id, 0m), UptimePct = uptimePct, LastSyncTime = t.LastSync,
            };
        })
        .OrderByDescending(r => r.NetSales)
        .ToList();

        return new TerminalReportResult
        {
            Kpis = new TerminalReportKpis
            {
                ActiveTerminals = rows.Count(r => r.Status != "offline"),
                OfflineTerminals = rows.Count(r => r.Status == "offline"),
                TerminalSales = rows.Sum(r => r.NetSales),
                AvgUptimePct = rows.Count > 0 ? Math.Round(rows.Average(r => r.UptimePct), 1) : 0m,
            },
            Rows = rows,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 9. Product Sales (RPT-SALES-PRODUCT)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("product-sales")]
    public async Task<IActionResult> GetProductSales(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] Guid? categoryId, [FromQuery] string? search)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildProductSalesAsync(rangeFrom, rangeTo, branchId, categoryId, search));
    }

    [HttpGet("product-sales/export")]
    public async Task<IActionResult> ExportProductSales(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] Guid? categoryId, [FromQuery] string? search,
        [FromQuery] Guid? exportedBy, [FromQuery] bool includeMargin = true, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildProductSalesAsync(rangeFrom, rangeTo, branchId, categoryId, search);
        var headers = includeMargin
            ? new[] { "SKU", "Barcode", "Product Name", "Category", "Brand", "Units Sold", "Net Sales", "Discounts", "Returns Qty", "Return Rate %", "COGS", "Gross Profit", "Margin %", "Current Stock" }
            : new[] { "SKU", "Barcode", "Product Name", "Category", "Brand", "Units Sold", "Net Sales", "Discounts", "Returns Qty", "Return Rate %", "Current Stock" };
        var rows = result.Rows.Select(r => includeMargin
            ? new object?[] { r.Sku, r.Barcode, r.ProductName, r.Category, r.Brand, r.UnitsSold, r.NetSales, r.Discounts, r.ReturnsQty, r.ReturnRatePct, r.Cogs, r.GrossProfit, r.MarginPct?.ToString("0.0") ?? "N/A", r.CurrentStock }
            : new object?[] { r.Sku, r.Barcode, r.ProductName, r.Category, r.Brand, r.UnitsSold, r.NetSales, r.Discounts, r.ReturnsQty, r.ReturnRatePct, r.CurrentStock }
        ).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"product-sales\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new List<(string, string)> {
            ("Top SKU", result.Kpis.TopSku ?? "—"), ("Units Sold", result.Kpis.UnitsSold.ToString("0.##")),
            ("Net Sales", result.Kpis.NetSales.ToString("0.##")), ("Dead Stock Count", result.Kpis.DeadStockCount.ToString()),
            ("Return Rate %", result.Kpis.ReturnRatePct.ToString("0.0")),
        };
        if (includeMargin) kpis.Add(("Gross Margin %", result.Kpis.GrossMarginPct?.ToString("0.0") ?? "N/A"));
        return BuildExportFile(format, "Product Sales Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis.ToArray(), headers, rows, $"product-sales-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<ProductSalesResult> BuildProductSalesAsync(DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, Guid? categoryId, string? search)
    {
        var itemsQ = db.OrderItems.Include(i => i.Order).Include(i => i.Product).ThenInclude(p => p!.Category)
            .Where(i => i.Order != null && i.Order.CreatedAt >= rangeFrom && i.Order.CreatedAt < rangeToExclusive && i.Order.PaymentStatus == "paid");
        if (branchId.HasValue) itemsQ = itemsQ.Where(i => i.Order!.BranchId == branchId);
        if (categoryId.HasValue) itemsQ = itemsQ.Where(i => i.Product != null && i.Product.CategoryId == categoryId);
        if (!string.IsNullOrEmpty(search)) itemsQ = itemsQ.Where(i => i.Product != null && (i.Product.Name.Contains(search) || i.Product.Sku.Contains(search)));

        var rawItems = await itemsQ.Select(i => new {
            i.ProductId, Sku = i.Product!.Sku, Barcode = i.Product.Barcode, Name = i.Product.Name,
            Category = i.Product.Category != null ? i.Product.Category.Name : "Uncategorized", Brand = i.Product.Brand,
            Qty = i.Quantity, Gross = i.UnitPrice * i.Quantity, i.DiscountAmount, Cogs = i.Quantity * (i.Product.CostPrice ?? 0m),
        }).ToListAsync();

        var returnsQ = db.CustomerReturnItems.Include(ri => ri.Return)
            .Where(ri => ri.Return != null && ri.Return.CreatedAt >= rangeFrom && ri.Return.CreatedAt < rangeToExclusive);
        if (branchId.HasValue) returnsQ = returnsQ.Where(ri => ri.Return!.BranchId == branchId);
        var returnsByProduct = (await returnsQ.Select(ri => new { ri.ProductId, ri.Quantity, ri.RefundAmount }).ToListAsync())
            .GroupBy(x => x.ProductId).ToDictionary(g => g.Key, g => (Qty: g.Sum(x => x.Quantity), Value: g.Sum(x => x.RefundAmount)));

        var stockQ = db.InventoryStocks.AsQueryable();
        if (branchId.HasValue) stockQ = stockQ.Where(s => s.BranchId == branchId);
        var stockByProduct = (await stockQ.GroupBy(s => s.ProductId).Select(g => new { productId = g.Key, qty = g.Sum(s => s.Quantity) }).ToListAsync())
            .ToDictionary(x => x.productId, x => x.qty);

        var soldProductIds = rawItems.Select(x => x.ProductId).ToHashSet();
        var deadStockQ = db.InventoryStocks.Include(s => s.Product).Where(s => s.Quantity > 0);
        if (branchId.HasValue) deadStockQ = deadStockQ.Where(s => s.BranchId == branchId);
        if (categoryId.HasValue) deadStockQ = deadStockQ.Where(s => s.Product!.CategoryId == categoryId);
        var deadStockCount = (await deadStockQ.Select(s => s.ProductId).Distinct().ToListAsync()).Count(pid => !soldProductIds.Contains(pid));

        var rows = rawItems.GroupBy(x => x.ProductId).Select(g =>
        {
            var f = g.First();
            var unitsSold = g.Sum(x => x.Qty);
            var netSales = g.Sum(x => x.Gross - x.DiscountAmount);
            var (retQty, _) = returnsByProduct.GetValueOrDefault(g.Key, (0m, 0m));
            var cogs = g.Sum(x => x.Cogs);
            return new ProductSalesRow
            {
                Sku = f.Sku, Barcode = f.Barcode ?? "—", ProductName = f.Name, Category = f.Category, Brand = f.Brand ?? "—",
                UnitsSold = unitsSold, NetSales = netSales, Discounts = g.Sum(x => x.DiscountAmount),
                ReturnsQty = retQty, ReturnRatePct = unitsSold > 0 ? Math.Round(retQty / unitsSold * 100, 1) : 0m,
                Cogs = cogs, GrossProfit = netSales - cogs, MarginPct = netSales > 0 ? Math.Round((netSales - cogs) / netSales * 100, 1) : null,
                CurrentStock = stockByProduct.GetValueOrDefault(g.Key, 0m),
            };
        })
        .OrderByDescending(r => r.NetSales)
        .ToList();

        var totalNetSales = rows.Sum(r => r.NetSales);
        var totalUnits = rows.Sum(r => r.UnitsSold);
        return new ProductSalesResult
        {
            Kpis = new ProductSalesKpis
            {
                TopSku = rows.FirstOrDefault()?.Sku,
                UnitsSold = totalUnits,
                NetSales = totalNetSales,
                GrossMarginPct = totalNetSales > 0 ? Math.Round(rows.Sum(r => r.GrossProfit) / totalNetSales * 100, 1) : null,
                DeadStockCount = deadStockCount,
                ReturnRatePct = totalUnits > 0 ? Math.Round(rows.Sum(r => r.ReturnsQty) / totalUnits * 100, 1) : 0m,
            },
            Rows = rows,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 10. Category Performance (RPT-SALES-CATEGORY)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("category-performance")]
    public async Task<IActionResult> GetCategoryPerformance([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildCategoryPerformanceAsync(rangeFrom, rangeTo, branchId));
    }

    [HttpGet("category-performance/export")]
    public async Task<IActionResult> ExportCategoryPerformance(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] Guid? exportedBy,
        [FromQuery] bool includeMargin = true, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildCategoryPerformanceAsync(rangeFrom, rangeTo, branchId);
        var headers = includeMargin
            ? new[] { "Category Name", "Parent Category", "SKU Count", "Units Sold", "Gross Sales", "Discounts", "Returns", "Net Sales", "Sales Contribution %", "COGS", "Gross Profit", "Margin %" }
            : new[] { "Category Name", "Parent Category", "SKU Count", "Units Sold", "Gross Sales", "Discounts", "Returns", "Net Sales", "Sales Contribution %" };
        var rows = result.Rows.Select(r => includeMargin
            ? new object?[] { r.CategoryName, r.ParentCategory, r.SkuCount, r.UnitsSold, r.GrossSales, r.Discounts, r.Returns, r.NetSales, r.SalesContributionPct, r.Cogs, r.GrossProfit, r.MarginPct?.ToString("0.0") ?? "N/A" }
            : new object?[] { r.CategoryName, r.ParentCategory, r.SkuCount, r.UnitsSold, r.GrossSales, r.Discounts, r.Returns, r.NetSales, r.SalesContributionPct }
        ).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"category-performance\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Top Category", result.Kpis.TopCategory ?? "—"), ("Total Categories Sold", result.Kpis.TotalCategoriesSold.ToString()),
            ("Category Discount Value", result.Kpis.CategoryDiscountValue.ToString("0.##")),
        };
        return BuildExportFile(format, "Category Performance Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"category-performance-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<CategoryPerformanceResult> BuildCategoryPerformanceAsync(DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId)
    {
        var categoryNames = await db.Categories.ToDictionaryAsync(c => c.Id, c => c.Name);

        var itemsQ = db.OrderItems.Include(i => i.Order).Include(i => i.Product).ThenInclude(p => p!.Category)
            .Where(i => i.Order != null && i.Order.CreatedAt >= rangeFrom && i.Order.CreatedAt < rangeToExclusive && i.Order.PaymentStatus == "paid");
        if (branchId.HasValue) itemsQ = itemsQ.Where(i => i.Order!.BranchId == branchId);

        var rawItems = await itemsQ.Select(i => new {
            CategoryId = i.Product!.CategoryId, ParentId = i.Product.Category != null ? i.Product.Category.ParentId : null,
            i.ProductId, Qty = i.Quantity, Gross = i.UnitPrice * i.Quantity, i.DiscountAmount, Cogs = i.Quantity * (i.Product.CostPrice ?? 0m),
        }).ToListAsync();

        var returnsQ = db.CustomerReturnItems.Include(ri => ri.Return).Include(ri => ri.Product)
            .Where(ri => ri.Return != null && ri.Return.CreatedAt >= rangeFrom && ri.Return.CreatedAt < rangeToExclusive);
        if (branchId.HasValue) returnsQ = returnsQ.Where(ri => ri.Return!.BranchId == branchId);
        var returnsByCategory = (await returnsQ.Select(ri => new { CategoryId = ri.Product!.CategoryId, ri.RefundAmount }).ToListAsync())
            .GroupBy(x => x.CategoryId).ToDictionary(g => g.Key, g => g.Sum(x => x.RefundAmount));

        var totalNetSalesAll = rawItems.Sum(x => x.Gross - x.DiscountAmount);

        var rows = rawItems.GroupBy(x => new { x.CategoryId, x.ParentId }).Select(g =>
        {
            var netSales = g.Sum(x => x.Gross - x.DiscountAmount);
            var cogs = g.Sum(x => x.Cogs);
            var returns = g.Key.CategoryId.HasValue ? returnsByCategory.GetValueOrDefault(g.Key.CategoryId, 0m) : 0m;
            return new CategoryPerformanceRow
            {
                CategoryId = g.Key.CategoryId?.ToString() ?? "—",
                CategoryName = g.Key.CategoryId.HasValue ? categoryNames.GetValueOrDefault(g.Key.CategoryId.Value, "—") : "Uncategorized",
                ParentCategory = g.Key.ParentId.HasValue ? categoryNames.GetValueOrDefault(g.Key.ParentId.Value, "—") : "—",
                SkuCount = g.Select(x => x.ProductId).Distinct().Count(), UnitsSold = g.Sum(x => x.Qty),
                GrossSales = g.Sum(x => x.Gross), Discounts = g.Sum(x => x.DiscountAmount), Returns = returns, NetSales = netSales,
                SalesContributionPct = totalNetSalesAll > 0 ? Math.Round(netSales / totalNetSalesAll * 100, 1) : 0m,
                Cogs = cogs, GrossProfit = netSales - cogs, MarginPct = netSales > 0 ? Math.Round((netSales - cogs) / netSales * 100, 1) : null,
            };
        })
        .OrderByDescending(r => r.NetSales)
        .ToList();

        return new CategoryPerformanceResult
        {
            Kpis = new CategoryPerformanceKpis
            {
                TopCategory = rows.FirstOrDefault()?.CategoryName,
                TotalCategoriesSold = rows.Count,
                CategoryDiscountValue = rows.Sum(r => r.Discounts),
            },
            Rows = rows,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 11. Supplier Performance (RPT-SUPPLIER-PERFORMANCE)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("supplier-performance")]
    public async Task<IActionResult> GetSupplierPerformance([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? supplierId)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildSupplierPerformanceAsync(rangeFrom, rangeTo, supplierId));
    }

    [HttpGet("supplier-performance/export")]
    public async Task<IActionResult> ExportSupplierPerformance(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? supplierId, [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildSupplierPerformanceAsync(rangeFrom, rangeTo, supplierId);
        var headers = new[] { "Supplier ID", "Supplier Name", "PO Count", "Ordered Qty", "Received Qty", "Fill Rate %", "Average Lead Time (days)", "Late Deliveries", "Purchase Value", "Outstanding Dues", "Supplier Returns Qty", "RTS Value", "Last PO Date" };
        var rows = result.Rows.Select(r => new object?[]
        {
            r.SupplierId, r.SupplierName, r.PoCount, r.OrderedQty, r.ReceivedQty, r.FillRatePct, r.AverageLeadTimeDays, r.LateDeliveries,
            r.PurchaseValue, r.OutstandingDues, r.SupplierReturnsQty, r.RtsValue, r.LastPoDate,
        }).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, null,
            $"{{\"report\":\"supplier-performance\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Best Fill Rate %", result.Kpis.BestFillRatePct.ToString("0.0")), ("Average Lead Time (days)", result.Kpis.AverageLeadTimeDays.ToString("0.0")),
            ("Total Purchase Value", result.Kpis.TotalPurchaseValue.ToString("0.##")), ("Outstanding Dues", result.Kpis.OutstandingDues.ToString("0.##")),
            ("RTS Value", result.Kpis.RtsValue.ToString("0.##")),
        };
        return BuildExportFile(format, "Supplier Performance Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"supplier-performance-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<SupplierPerformanceResult> BuildSupplierPerformanceAsync(DateTime rangeFrom, DateTime rangeToExclusive, Guid? supplierId)
    {
        var poQ = db.PurchaseOrders.Include(p => p.Supplier).Include(p => p.Items)
            .Where(p => p.CreatedAt >= rangeFrom && p.CreatedAt < rangeToExclusive && p.Status != "cancelled");
        if (supplierId.HasValue) poQ = poQ.Where(p => p.SupplierId == supplierId);
        var pos = await poQ.ToListAsync();

        var rtsQ = db.StockTransfers.Include(t => t.Items)
            .Where(t => t.TransferType == "warehouse_to_supplier" && t.CreatedAt >= rangeFrom && t.CreatedAt < rangeToExclusive && t.DestSupplierId != null);
        if (supplierId.HasValue) rtsQ = rtsQ.Where(t => t.DestSupplierId == supplierId);
        var rtsBySupplier = (await rtsQ.ToListAsync())
            .GroupBy(t => t.DestSupplierId!.Value)
            .ToDictionary(g => g.Key, g => (
                Qty: g.SelectMany(t => t.Items).Sum(i => i.ReceivedQuantity ?? i.ApprovedQuantity ?? i.RequestedQuantity),
                Value: g.SelectMany(t => t.Items).Sum(i => (i.ReceivedQuantity ?? i.ApprovedQuantity ?? i.RequestedQuantity) * (i.UnitCost ?? 0m))
            ));

        var rows = pos.GroupBy(p => p.SupplierId).Select(g =>
        {
            var s = g.First().Supplier;
            var orderedQty = g.SelectMany(p => p.Items).Sum(i => i.OrderedQuantity);
            var receivedQty = g.SelectMany(p => p.Items).Sum(i => i.ReceivedQuantity);
            var lateDeliveries = g.Count(p => p.ReceivedDate.HasValue && p.ExpectedDeliveryDate.HasValue && p.ReceivedDate > p.ExpectedDeliveryDate);
            var leadTimes = g.Where(p => p.ReceivedDate.HasValue).Select(p => (p.ReceivedDate!.Value - p.CreatedAt).TotalDays).ToList();
            var rts = rtsBySupplier.GetValueOrDefault(g.Key, (Qty: 0m, Value: 0m));
            return new SupplierPerformanceRow
            {
                SupplierId = s?.SupplierCode ?? "—", SupplierName = s?.Name ?? "Unknown", PoCount = g.Count(),
                OrderedQty = orderedQty, ReceivedQty = receivedQty,
                FillRatePct = orderedQty > 0 ? Math.Round(receivedQty / orderedQty * 100, 1) : 0m,
                AverageLeadTimeDays = leadTimes.Count > 0 ? Math.Round((decimal)leadTimes.Average(), 1) : 0m,
                LateDeliveries = lateDeliveries, PurchaseValue = g.Sum(p => p.TotalAmount),
                OutstandingDues = g.Sum(p => p.TotalAmount - p.PaidAmount),
                SupplierReturnsQty = rts.Qty, RtsValue = rts.Value,
                LastPoDate = g.Max(p => p.CreatedAt),
            };
        })
        .OrderByDescending(r => r.PurchaseValue)
        .ToList();

        return new SupplierPerformanceResult
        {
            Kpis = new SupplierPerformanceKpis
            {
                BestFillRatePct = rows.Count > 0 ? rows.Max(r => r.FillRatePct) : 0m,
                AverageLeadTimeDays = rows.Count > 0 ? Math.Round(rows.Average(r => r.AverageLeadTimeDays), 1) : 0m,
                TotalPurchaseValue = rows.Sum(r => r.PurchaseValue),
                OutstandingDues = rows.Sum(r => r.OutstandingDues),
                RtsValue = rows.Sum(r => r.RtsValue),
            },
            Rows = rows,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 12. Waste / Spoilage (RPT-INVENTORY-WASTE-SPOILAGE)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("waste-spoilage")]
    public async Task<IActionResult> GetWasteSpoilage([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] string? reason)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildWasteSpoilageAsync(rangeFrom, rangeTo, branchId, reason));
    }

    [HttpGet("waste-spoilage/export")]
    public async Task<IActionResult> ExportWasteSpoilage(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] string? reason,
        [FromQuery] Guid? exportedBy, [FromQuery] bool includeCost = true, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildWasteSpoilageAsync(rangeFrom, rangeTo, branchId, reason);
        var headers = includeCost
            ? new[] { "Waste ID", "Date/Time", "SKU", "Product Name", "Category", "Branch", "Qty", "Reason", "Cost Value", "Notes" }
            : new[] { "Waste ID", "Date/Time", "SKU", "Product Name", "Category", "Branch", "Qty", "Reason", "Notes" };
        var rows = result.Rows.Select(r => includeCost
            ? new object?[] { r.WasteId, r.DateTime, r.Sku, r.ProductName, r.Category, r.Branch, r.Qty, r.Reason, r.CostValue, r.Notes }
            : new object?[] { r.WasteId, r.DateTime, r.Sku, r.ProductName, r.Category, r.Branch, r.Qty, r.Reason, r.Notes }
        ).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"waste-spoilage\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new List<(string, string)> {
            ("Damaged Items", result.Kpis.DamagedItems.ToString()), ("Expired Items", result.Kpis.ExpiredItems.ToString()),
            ("Top Waste Category", result.Kpis.TopWasteCategory ?? "—"),
        };
        if (includeCost) kpis.Insert(0, ("Total Write-off Value", result.Kpis.TotalWriteOffValue.ToString("0.##")));
        if (includeCost) kpis.Add(("Waste % of Sales", result.Kpis.WastePctOfSales.ToString("0.00")));
        return BuildExportFile(format, "Waste / Spoilage Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis.ToArray(), headers, rows, $"waste-spoilage-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<WasteSpoilageResult> BuildWasteSpoilageAsync(DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, string? reasonFilter)
    {
        var adjQ = db.InventoryAdjustments.Include(a => a.Product).ThenInclude(p => p!.Category).Include(a => a.Branch)
            .Where(a => (a.AdjustmentType == "waste" || a.AdjustmentType == "damage") && a.CreatedAt >= rangeFrom && a.CreatedAt < rangeToExclusive);
        if (branchId.HasValue) adjQ = adjQ.Where(a => a.BranchId == branchId);
        if (!string.IsNullOrEmpty(reasonFilter)) adjQ = adjQ.Where(a => a.AdjustmentType == reasonFilter);
        var adjustments = await adjQ.OrderByDescending(a => a.CreatedAt).ToListAsync();

        var salesQ = db.Orders.Where(o => o.CreatedAt >= rangeFrom && o.CreatedAt < rangeToExclusive && o.PaymentStatus == "paid");
        if (branchId.HasValue) salesQ = salesQ.Where(o => o.BranchId == branchId);
        var totalSales = await salesQ.SumAsync(o => o.TotalAmount - o.TaxAmount);

        var rows = adjustments.Select(a =>
        {
            var costOrPrice = a.Product?.CostPrice ?? a.Product?.BasePrice ?? 0m;
            return new WasteSpoilageRow
            {
                WasteId = a.Id.ToString()[..8], DateTime = a.CreatedAt, Sku = a.Product?.Sku ?? "—", ProductName = a.Product?.Name ?? "—",
                Category = a.Product?.Category?.Name ?? "—", Branch = a.Branch?.Name ?? "—", Qty = a.Quantity, Reason = a.AdjustmentType,
                CostValue = a.Quantity * costOrPrice, Notes = a.Reason,
            };
        }).ToList();

        var totalWriteOff = rows.Sum(r => r.CostValue);
        return new WasteSpoilageResult
        {
            Kpis = new WasteSpoilageKpis
            {
                TotalWriteOffValue = totalWriteOff,
                // The schema's adjustment_type enum has no distinct "expired" value — approximated from free-text reason.
                ExpiredItems = rows.Count(r => r.Notes != null && r.Notes.Contains("expir", StringComparison.OrdinalIgnoreCase)),
                DamagedItems = rows.Count(r => r.Reason == "damage"),
                TopWasteCategory = rows.Count > 0
                    ? rows.GroupBy(r => r.Category).OrderByDescending(g => g.Sum(r => r.CostValue)).First().Key
                    : null,
                WastePctOfSales = totalSales > 0 ? Math.Round(totalWriteOff / totalSales * 100, 2) : 0m,
            },
            Rows = rows,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 13. Return / Refund (RPT-FINANCE-RETURNS-REFUNDS)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("returns-refunds")]
    public async Task<IActionResult> GetReturnsRefunds(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] string? refundMethod, [FromQuery] string? status)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildReturnsRefundsAsync(rangeFrom, rangeTo, branchId, refundMethod, status));
    }

    [HttpGet("returns-refunds/export")]
    public async Task<IActionResult> ExportReturnsRefunds(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] string? refundMethod, [FromQuery] string? status,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildReturnsRefundsAsync(rangeFrom, rangeTo, branchId, refundMethod, status);
        var headers = new[] { "Return ID", "Original Order ID", "Date/Time", "Branch", "Cashier", "Customer", "Return Type", "Reason", "Refund Method", "Refund Amount", "VAT Reversal", "Status" };
        var rows = result.Rows.Select(r => new object?[]
        {
            r.ReturnId, r.OriginalOrderId, r.DateTime, r.Branch, r.Cashier, r.Customer, r.ReturnType, r.Reason, r.RefundMethod, r.RefundAmount, r.VatReversal, r.Status,
        }).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"returns-refunds\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Return Count", result.Kpis.ReturnCount.ToString()), ("Refund Value", result.Kpis.RefundValue.ToString("0.##")),
            ("VAT Reversed", result.Kpis.VatReversed.ToString("0.##")), ("Top Return Reason", result.Kpis.TopReturnReason ?? "—"),
            ("Refunds Pending", result.Kpis.RefundsPending.ToString()),
        };
        return BuildExportFile(format, "Return / Refund Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"returns-refunds-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<ReturnsRefundsResult> BuildReturnsRefundsAsync(DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, string? refundMethod, string? status)
    {
        var retQ = db.CustomerReturns.Include(r => r.Order).ThenInclude(o => o!.Cashier).Include(r => r.Customer).Include(r => r.Branch)
            .Where(r => r.CreatedAt >= rangeFrom && r.CreatedAt < rangeToExclusive);
        if (branchId.HasValue) retQ = retQ.Where(r => r.BranchId == branchId);
        if (!string.IsNullOrEmpty(refundMethod)) retQ = retQ.Where(r => r.RefundMethod == refundMethod);
        if (!string.IsNullOrEmpty(status)) retQ = retQ.Where(r => r.Status == status);
        var returns = await retQ.OrderByDescending(r => r.CreatedAt).ToListAsync();

        var orderIds = returns.Select(r => r.OrderId).Distinct().ToList();
        var orderTaxMap = (await db.Orders.Where(o => orderIds.Contains(o.Id))
            .Select(o => new { o.Id, o.TotalAmount, o.TaxAmount }).ToListAsync())
            .ToDictionary(o => o.Id);

        var rows = returns.Select(r =>
        {
            var vatReversal = 0m;
            if (orderTaxMap.TryGetValue(r.OrderId, out var o) && o.TotalAmount > 0)
                vatReversal = Math.Round(r.RefundAmount / o.TotalAmount * o.TaxAmount, 2);
            return new ReturnRefundRow
            {
                ReturnId = r.ReturnNumber ?? r.Id.ToString()[..8], OriginalOrderId = r.Order?.OrderNumber ?? "—",
                DateTime = r.CreatedAt, Branch = r.Branch?.Name ?? "—", Cashier = r.Order?.Cashier?.FullName ?? "—",
                Customer = r.Customer?.FullName ?? "Walk-in", ReturnType = r.ReturnType, Reason = r.Reason,
                RefundMethod = r.RefundMethod, RefundAmount = r.RefundAmount, VatReversal = vatReversal, Status = r.Status,
            };
        }).ToList();

        return new ReturnsRefundsResult
        {
            Kpis = new ReturnsRefundsKpis
            {
                ReturnCount = rows.Count, RefundValue = rows.Sum(r => r.RefundAmount), VatReversed = rows.Sum(r => r.VatReversal),
                TopReturnReason = rows.Count > 0 ? rows.GroupBy(r => r.Reason).OrderByDescending(g => g.Count()).First().Key : null,
                HighestReturnBranch = rows.Count > 0 ? rows.GroupBy(r => r.Branch).OrderByDescending(g => g.Sum(x => x.RefundAmount)).First().Key : null,
                RefundsPending = rows.Count(r => r.Status == "pending"),
            },
            Rows = rows,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 14. Attendance / Shift (RPT-HR-SHIFT)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("attendance-shift")]
    public async Task<IActionResult> GetAttendanceShift(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] Guid? staffId, [FromQuery] string? status)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: false);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildAttendanceShiftAsync(rangeFrom, rangeTo, branchId, staffId, status));
    }

    [HttpGet("attendance-shift/export")]
    public async Task<IActionResult> ExportAttendanceShift(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] Guid? staffId, [FromQuery] string? status,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: false);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildAttendanceShiftAsync(rangeFrom, rangeTo, branchId, staffId, status);
        var headers = new[] { "Staff ID", "Staff Name", "Role", "Branch", "Shift ID", "Terminal", "Check-in Time", "Shift Open Time", "Shift Close Time", "Hours Worked", "Opening Float", "Expected Cash", "Counted Cash", "Variance", "Status" };
        var rows = result.Rows.Select(r => new object?[]
        {
            r.StaffId, r.StaffName, r.Role, r.Branch, r.ShiftId, r.Terminal, r.CheckInTime, r.ShiftOpenTime, r.ShiftCloseTime,
            r.HoursWorked, r.OpeningFloat, r.ExpectedCash, r.CountedCash, r.Variance, r.Status,
        }).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"attendance-shift\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Open Shifts", result.Kpis.OpenShifts.ToString()), ("Closed Shifts", result.Kpis.ClosedShifts.ToString()),
            ("Cash Variance", result.Kpis.CashVariance.ToString("0.##")), ("Total Staff Hours", result.Kpis.TotalStaffHours.ToString("0.#")),
            ("Missing Closures", result.Kpis.MissingClosures.ToString()),
        };
        return BuildExportFile(format, "Attendance / Shift Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"attendance-shift-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<AttendanceShiftResult> BuildAttendanceShiftAsync(DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, Guid? staffId, string? status)
    {
        var shiftsQ = db.CashierShifts.Include(s => s.Cashier).ThenInclude(c => c!.Role).Include(s => s.Terminal).Include(s => s.Branch)
            .Where(s => s.OpenedAt >= rangeFrom && s.OpenedAt < rangeToExclusive);
        if (branchId.HasValue) shiftsQ = shiftsQ.Where(s => s.BranchId == branchId);
        if (staffId.HasValue) shiftsQ = shiftsQ.Where(s => s.CashierId == staffId);
        if (!string.IsNullOrEmpty(status)) shiftsQ = shiftsQ.Where(s => s.Status == status);
        var shifts = await shiftsQ.OrderByDescending(s => s.OpenedAt).ToListAsync();

        var attendance = await db.StaffAttendances
            .Where(a => a.CheckIn != null && a.CheckIn >= rangeFrom && a.CheckIn < rangeToExclusive)
            .ToListAsync();
        // Best-effort match to a shift: same staff member, same calendar day as the shift opened.
        var attendanceByUserDay = attendance
            .GroupBy(a => (a.UserId, Day: a.CheckIn!.Value.Date))
            .ToDictionary(g => g.Key, g => g.First());

        var rows = shifts.Select(s =>
        {
            attendanceByUserDay.TryGetValue((s.CashierId, s.OpenedAt.Date), out var att);
            var hoursWorked = s.ClosedAt.HasValue ? Math.Round((decimal)(s.ClosedAt.Value - s.OpenedAt).TotalHours, 2) : 0m;
            return new AttendanceShiftRow
            {
                StaffId = s.CashierId.ToString()[..8], StaffName = s.Cashier?.FullName ?? "Unknown", Role = s.Cashier?.Role?.Name ?? "—",
                Branch = s.Branch?.Name ?? "—", ShiftId = s.Id.ToString()[..8], Terminal = s.Terminal?.Name ?? "—",
                CheckInTime = att?.CheckIn, ShiftOpenTime = s.OpenedAt, ShiftCloseTime = s.ClosedAt, HoursWorked = hoursWorked,
                OpeningFloat = s.OpeningAmount, ExpectedCash = s.OpeningAmount + s.CashSales, CountedCash = s.ClosingAmount,
                Variance = s.Status == "closed" ? s.Variance : null, Status = s.Status,
            };
        }).ToList();

        return new AttendanceShiftResult
        {
            Kpis = new AttendanceShiftKpis
            {
                OpenShifts = rows.Count(r => r.Status == "open"),
                ClosedShifts = rows.Count(r => r.Status == "closed"),
                CashVariance = rows.Where(r => r.Variance.HasValue).Sum(r => r.Variance!.Value),
                TotalStaffHours = rows.Sum(r => r.HoursWorked),
                MissingClosures = rows.Count(r => r.Status == "open" && r.ShiftOpenTime < DateTime.UtcNow.AddHours(-12)),
            },
            Rows = rows,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 15. Audit Trail (RPT-ADMIN-AUDIT-TRAIL)
    // ───────────────────────────────────────────────────────────────────────

    // Sensitive entity types whose before/after JSON is masked in both the UI and exports, per FRD §6.1.
    private static readonly string[] SensitiveAuditEntities = ["ZatcaSettings", "PosSettingsRecord", "TaxFeeRule", "User"];

    [HttpGet("audit-trail")]
    public async Task<IActionResult> GetAuditTrail(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? userId, [FromQuery] string? module,
        [FromQuery] string? severity, [FromQuery] Guid? branchId)
    {
        var (rangeFrom, rangeTo, error) = ResolveAuditRange(from, to);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildAuditTrailAsync(rangeFrom, rangeTo, userId, module, severity, branchId));
    }

    [HttpGet("audit-trail/export")]
    public async Task<IActionResult> ExportAuditTrail(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? userId, [FromQuery] string? module,
        [FromQuery] string? severity, [FromQuery] Guid? branchId, [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveAuditRange(from, to);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildAuditTrailAsync(rangeFrom, rangeTo, userId, module, severity, branchId);
        var headers = new[] { "Event ID", "Timestamp", "Severity", "Module", "Action", "Entity ID", "User", "Role", "Branch", "IP Address", "Before Value", "After Value" };
        var rows = result.Rows.Select(r => new object?[]
        {
            r.EventId, r.Timestamp, r.Severity, r.Module, r.Action, r.EntityId, r.User, r.Role, r.Branch, r.IpAddress, r.BeforeValue, r.AfterValue,
        }).ToList();
        // Exporting the audit trail is itself an auditable event (FRD AC#67).
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"audit-trail\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Critical Events", result.Kpis.CriticalEvents.ToString()), ("Failed Logins", result.Kpis.FailedLogins.ToString()),
            ("Override Count", result.Kpis.OverrideCount.ToString()), ("Configuration Changes", result.Kpis.ConfigurationChanges.ToString()),
            ("Exports Generated", result.Kpis.ExportsGenerated.ToString()),
        };
        return BuildExportFile(format, "Audit Trail Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"audit-trail-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private static (DateTime From, DateTime ToExclusive, string? Error) ResolveAuditRange(DateTime? from, DateTime? to)
    {
        // Audit Trail's FRD default window is the last 7 days, not "today" like the operational reports.
        if (!from.HasValue && !to.HasValue)
        {
            var toExclusive = DateTime.UtcNow.Date.AddDays(1);
            return (toExclusive.AddDays(-7), toExclusive, null);
        }
        return ResolveRange(from, to, defaultToFirstOfMonth: false);
    }

    private async Task<AuditTrailResult> BuildAuditTrailAsync(DateTime rangeFrom, DateTime rangeToExclusive, Guid? userId, string? module, string? severity, Guid? branchId)
    {
        var q = db.AuditLogs.Include(a => a.User).ThenInclude(u => u!.Role).Include(a => a.Branch)
            .Where(a => a.CreatedAt >= rangeFrom && a.CreatedAt < rangeToExclusive);
        if (userId.HasValue) q = q.Where(a => a.UserId == userId);
        if (!string.IsNullOrEmpty(module)) q = q.Where(a => a.EntityType == module);
        if (!string.IsNullOrEmpty(severity)) q = q.Where(a => a.Severity == severity);
        if (branchId.HasValue) q = q.Where(a => a.BranchId == branchId);
        // Safety cap — audit_logs can grow unbounded; large ranges should use Export instead (FRD §5.3 Apply Filters rule).
        var logs = await q.OrderByDescending(a => a.CreatedAt).Take(2000).ToListAsync();

        var rows = logs.Select(a =>
        {
            var masked = a.EntityType != null && SensitiveAuditEntities.Contains(a.EntityType);
            return new AuditTrailRow
            {
                EventId = a.Id.ToString()[..8], Timestamp = a.CreatedAt, Severity = a.Severity, Module = a.EntityType ?? "—",
                Action = a.Action, EntityId = a.EntityId?.ToString() ?? "—", User = a.User?.FullName ?? "System",
                Role = a.User?.Role?.Name ?? "—", Branch = a.Branch?.Name ?? "—", IpAddress = a.IpAddress ?? "—",
                BeforeValue = masked ? "***masked***" : a.OldValues, AfterValue = masked ? "***masked***" : a.NewValues,
            };
        }).ToList();

        return new AuditTrailResult
        {
            Kpis = new AuditTrailKpis
            {
                CriticalEvents = rows.Count(r => r.Severity == "critical"),
                FailedLogins = rows.Count(r => r.Action.Contains("login_failed", StringComparison.OrdinalIgnoreCase) || r.Action.Contains("failed_login", StringComparison.OrdinalIgnoreCase)),
                OverrideCount = rows.Count(r => r.Action.Contains("override", StringComparison.OrdinalIgnoreCase)),
                ConfigurationChanges = rows.Count(r => r.Action.Contains("update", StringComparison.OrdinalIgnoreCase) || r.Action.Contains("settings", StringComparison.OrdinalIgnoreCase)),
                ExportsGenerated = rows.Count(r => r.Action == "export_report"),
            },
            Rows = rows,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 16. Discount Report (RPT-FINANCE-DISCOUNTS)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("discounts")]
    public async Task<IActionResult> GetDiscounts([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] string? discountType)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildDiscountsAsync(rangeFrom, rangeTo, branchId, discountType));
    }

    [HttpGet("discounts/export")]
    public async Task<IActionResult> ExportDiscounts(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] string? discountType,
        [FromQuery] Guid? exportedBy, [FromQuery] bool includeMargin = true, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildDiscountsAsync(rangeFrom, rangeTo, branchId, discountType);
        var headers = includeMargin
            ? new[] { "Transaction ID", "Invoice No.", "Date/Time", "Branch", "Cashier", "Customer Type", "Discount Type", "Coupon Code", "Discount %", "Discount Amount", "Net Sales After Discount", "Margin Impact" }
            : new[] { "Transaction ID", "Invoice No.", "Date/Time", "Branch", "Cashier", "Customer Type", "Discount Type", "Coupon Code", "Discount %", "Discount Amount", "Net Sales After Discount" };
        var rows = result.Rows.Select(r => includeMargin
            ? new object?[] { r.TransactionId, r.InvoiceNo, r.DateTime, r.Branch, r.Cashier, r.CustomerType, r.DiscountType, r.CouponCode, r.DiscountPct, r.DiscountAmount, r.NetSalesAfterDiscount, r.DiscountAmount }
            : new object?[] { r.TransactionId, r.InvoiceNo, r.DateTime, r.Branch, r.Cashier, r.CustomerType, r.DiscountType, r.CouponCode, r.DiscountPct, r.DiscountAmount, r.NetSalesAfterDiscount }
        ).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"discounts\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Total Discount Value", result.Kpis.TotalDiscountValue.ToString("0.##")), ("Manual Discount Value", result.Kpis.ManualDiscountValue.ToString("0.##")),
            ("Coupon Usage", result.Kpis.CouponUsage.ToString()), ("Discount % of Sales", result.Kpis.DiscountPctOfSales.ToString("0.0")),
        };
        return BuildExportFile(format, "Discount Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"discounts-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<DiscountsResult> BuildDiscountsAsync(DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, string? discountType)
    {
        var ordersQ = db.Orders.Include(o => o.Branch).Include(o => o.Cashier).Include(o => o.Coupon)
            .Where(o => o.DiscountAmount > 0 && o.CreatedAt >= rangeFrom && o.CreatedAt < rangeToExclusive && o.PaymentStatus == "paid");
        if (branchId.HasValue) ordersQ = ordersQ.Where(o => o.BranchId == branchId);
        var orders = await ordersQ.OrderByDescending(o => o.CreatedAt).ToListAsync();

        var rows = orders.Select(o =>
        {
            var type = o.CouponId.HasValue ? "coupon" : "manual";
            return new DiscountRow
            {
                TransactionId = o.Id.ToString()[..8], InvoiceNo = o.OrderNumber, DateTime = o.CreatedAt,
                Branch = o.Branch?.Name ?? "—", Cashier = o.Cashier?.FullName ?? "—",
                CustomerType = o.CustomerId.HasValue ? "Registered" : "Walk-in",
                DiscountType = type, CouponCode = o.Coupon?.Code,
                DiscountPct = o.Subtotal > 0 ? Math.Round(o.DiscountAmount / o.Subtotal * 100, 1) : 0m,
                DiscountAmount = o.DiscountAmount, NetSalesAfterDiscount = o.Subtotal - o.DiscountAmount,
            };
        })
        .Where(r => discountType == null || r.DiscountType == discountType)
        .ToList();

        var totalNet = rows.Sum(r => r.NetSalesAfterDiscount);
        return new DiscountsResult
        {
            Kpis = new DiscountsKpis
            {
                TotalDiscountValue = rows.Sum(r => r.DiscountAmount),
                ManualDiscountValue = rows.Where(r => r.DiscountType == "manual").Sum(r => r.DiscountAmount),
                CouponUsage = rows.Count(r => r.DiscountType == "coupon"),
                DiscountPctOfSales = totalNet > 0 ? Math.Round(rows.Sum(r => r.DiscountAmount) / totalNet * 100, 1) : 0m,
            },
            Rows = rows,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 17. VAT / ZATCA (RPT-COMPLIANCE-ZATCA-VAT)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("vat-zatca")]
    public async Task<IActionResult> GetVatZatca(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] string? zatcaStatus, [FromQuery] string? invoiceType)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildVatZatcaAsync(rangeFrom, rangeTo, branchId, zatcaStatus, invoiceType));
    }

    [HttpGet("vat-zatca/export")]
    public async Task<IActionResult> ExportVatZatca(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] string? zatcaStatus, [FromQuery] string? invoiceType,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildVatZatcaAsync(rangeFrom, rangeTo, branchId, zatcaStatus, invoiceType);
        var headers = new[] { "Invoice No.", "Issue Date/Time", "Branch", "Invoice Type", "Customer VAT No.", "Taxable Amount", "VAT Amount", "Total With VAT", "ZATCA Status" };
        var rows = result.Rows.Select(r => new object?[]
        {
            r.InvoiceNo, r.IssueDateTime, r.Branch, r.InvoiceType, r.CustomerVatNo, r.TaxableAmount, r.VatAmount, r.TotalWithVat, r.ZatcaStatus,
        }).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"vat-zatca\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Taxable Sales", result.Kpis.TaxableSales.ToString("0.##")), ("VAT Collected", result.Kpis.VatCollected.ToString("0.##")),
            ("VAT Reversed", result.Kpis.VatReversed.ToString("0.##")), ("ZATCA Success", result.Kpis.ZatcaSuccess.ToString()),
            ("ZATCA Pending", result.Kpis.ZatcaPending.ToString()), ("ZATCA Errors", result.Kpis.ZatcaErrors.ToString()),
        };
        return BuildExportFile(format, "VAT / ZATCA Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"vat-zatca-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<VatZatcaResult> BuildVatZatcaAsync(DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, string? zatcaStatus, string? invoiceType)
    {
        var q = db.ZatcaInvoices.Include(z => z.Branch).Where(z => z.IssueDate >= rangeFrom && z.IssueDate < rangeToExclusive);
        if (branchId.HasValue) q = q.Where(z => z.BranchId == branchId);
        if (!string.IsNullOrEmpty(zatcaStatus)) q = q.Where(z => z.ZatcaStatus == zatcaStatus);
        if (!string.IsNullOrEmpty(invoiceType)) q = q.Where(z => z.InvoiceType == invoiceType);
        var invoices = await q.OrderByDescending(z => z.IssueDate).ToListAsync();

        var rows = invoices.Select(z => new VatZatcaRow
        {
            InvoiceNo = z.InvoiceNumber ?? z.Id.ToString()[..8], IssueDateTime = z.IssueDate, Branch = z.Branch?.Name ?? "—",
            InvoiceType = z.InvoiceType, CustomerVatNo = z.BuyerVatNumber, TaxableAmount = z.TotalAmount - z.TaxAmount,
            VatAmount = z.TaxAmount, TotalWithVat = z.TotalAmount, ZatcaStatus = z.ZatcaStatus, IsReversal = z.InvoiceType == "credit",
        }).ToList();

        return new VatZatcaResult
        {
            Kpis = new VatZatcaKpis
            {
                TaxableSales = rows.Where(r => !r.IsReversal).Sum(r => r.TaxableAmount),
                VatCollected = rows.Where(r => !r.IsReversal).Sum(r => r.VatAmount),
                VatReversed = rows.Where(r => r.IsReversal).Sum(r => r.VatAmount),
                ZatcaSuccess = rows.Count(r => r.ZatcaStatus == "accepted"),
                ZatcaPending = rows.Count(r => r.ZatcaStatus is "pending" or "submitted"),
                ZatcaErrors = rows.Count(r => r.ZatcaStatus == "rejected"),
            },
            Rows = rows,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 18. Tax Report (RPT-FINANCE-TAX)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("tax")]
    public async Task<IActionResult> GetTaxReport([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] Guid? cashierId)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildTaxReportAsync(rangeFrom, rangeTo, branchId, cashierId));
    }

    [HttpGet("tax/export")]
    public async Task<IActionResult> ExportTaxReport(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] Guid? cashierId,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildTaxReportAsync(rangeFrom, rangeTo, branchId, cashierId);
        var headers = new[] { "Branch", "Cashier", "Tax Code", "Tax Type", "Tax Rate", "Taxable Amount", "Tax Amount", "Zero-rated Amount", "Exempt Amount", "Tax Reversed", "Net Tax Amount", "Transactions" };
        var rows = result.Rows.Select(r => new object?[]
        {
            r.Branch, r.Cashier, r.TaxCode, r.TaxType, r.TaxRate, r.TaxableAmount, r.TaxAmount, r.ZeroRatedAmount, r.ExemptAmount, r.TaxReversed, r.NetTaxAmount, r.Transactions,
        }).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"tax\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Total Taxable Amount", result.Kpis.TotalTaxableAmount.ToString("0.##")), ("VAT Amount", result.Kpis.VatAmount.ToString("0.##")),
            ("Zero-rated Sales", result.Kpis.ZeroRatedSales.ToString("0.##")), ("Net Tax Payable", result.Kpis.NetTaxPayable.ToString("0.##")),
        };
        return BuildExportFile(format, "Tax Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"tax-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<TaxReportResult> BuildTaxReportAsync(DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, Guid? cashierId)
    {
        var itemsQ = db.OrderItems.Include(i => i.Order).ThenInclude(o => o!.Branch).Include(i => i.Order).ThenInclude(o => o!.Cashier).Include(i => i.Product)
            .Where(i => i.Order != null && i.Order.CreatedAt >= rangeFrom && i.Order.CreatedAt < rangeToExclusive && i.Order.PaymentStatus == "paid");
        if (branchId.HasValue) itemsQ = itemsQ.Where(i => i.Order!.BranchId == branchId);
        if (cashierId.HasValue) itemsQ = itemsQ.Where(i => i.Order!.CashierId == cashierId);

        var rawItems = await itemsQ.Select(i => new {
            Branch = i.Order!.Branch!.Name, Cashier = i.Order.Cashier != null ? i.Order.Cashier.FullName : "—",
            TaxRate = i.Product!.TaxPercentage, Taxable = i.UnitPrice * i.Quantity - i.DiscountAmount, i.TaxAmount,
        }).ToListAsync();

        // The schema stores a flat tax rate per product, not a distinct exempt/zero-rated flag —
        // 0% items are treated as zero-rated since there's no separate "exempt" classification to source from.
        var rows = rawItems.GroupBy(x => new { x.Branch, x.Cashier, x.TaxRate })
            .Select(g => new TaxReportRow
            {
                Branch = g.Key.Branch, Cashier = g.Key.Cashier, TaxCode = $"VAT-{g.Key.TaxRate:0.#}%",
                TaxType = g.Key.TaxRate > 0 ? "standard" : "zero_rated", TaxRate = g.Key.TaxRate,
                TaxableAmount = g.Sum(x => x.Taxable), TaxAmount = g.Sum(x => x.TaxAmount),
                ZeroRatedAmount = g.Key.TaxRate == 0 ? g.Sum(x => x.Taxable) : 0m, ExemptAmount = 0m,
                TaxReversed = 0m, Transactions = g.Count(),
            })
            .OrderByDescending(r => r.TaxAmount)
            .ToList();

        return new TaxReportResult
        {
            Kpis = new TaxReportKpis
            {
                TotalTaxableAmount = rows.Sum(r => r.TaxableAmount),
                VatAmount = rows.Sum(r => r.TaxAmount),
                ZeroRatedSales = rows.Sum(r => r.ZeroRatedAmount),
                NetTaxPayable = rows.Sum(r => r.NetTaxAmount),
            },
            Rows = rows,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 19. Fee Report (RPT-FINANCE-FEES)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("fees")]
    public async Task<IActionResult> GetFeeReport([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] Guid? cashierId)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildFeeReportAsync(rangeFrom, rangeTo, branchId, cashierId));
    }

    [HttpGet("fees/export")]
    public async Task<IActionResult> ExportFeeReport(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] Guid? cashierId,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildFeeReportAsync(rangeFrom, rangeTo, branchId, cashierId);
        var headers = new[] { "Fee ID", "Fee Type", "Transaction ID", "Invoice No.", "Date/Time", "Branch", "Cashier", "Customer Type", "Fee Amount", "Net Fee" };
        var rows = result.Rows.Select(r => new object?[]
        {
            r.FeeId, r.FeeType, r.TransactionId, r.InvoiceNo, r.DateTime, r.Branch, r.Cashier, r.CustomerType, r.FeeAmount, r.NetFee,
        }).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"fees\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Total Fees Collected", result.Kpis.TotalFeesCollected.ToString("0.##")), ("Transactions with Fees", result.Kpis.TransactionsWithFees.ToString()),
            ("Average Fee per Transaction", result.Kpis.AverageFeePerTransaction.ToString("0.##")),
        };
        return BuildExportFile(format, "Fee Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"fees-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<FeeReportResult> BuildFeeReportAsync(DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, Guid? cashierId)
    {
        var ordersQ = db.Orders.Include(o => o.Branch).Include(o => o.Cashier)
            .Where(o => o.CustomFeeAmount > 0 && o.CreatedAt >= rangeFrom && o.CreatedAt < rangeToExclusive && o.PaymentStatus == "paid");
        if (branchId.HasValue) ordersQ = ordersQ.Where(o => o.BranchId == branchId);
        if (cashierId.HasValue) ordersQ = ordersQ.Where(o => o.CashierId == cashierId);
        var orders = await ordersQ.OrderByDescending(o => o.CreatedAt).ToListAsync();

        // The schema tracks a single custom_fee_amount per order — there is no per-fee-type breakdown,
        // refunded-fee tracking or fee-specific VAT split to source "Fee Type"/"Refunded Fee"/"VAT on Fee" from.
        var rows = orders.Select(o => new FeeRow
        {
            FeeId = o.Id.ToString()[..8], FeeType = "Custom Fee", TransactionId = o.Id.ToString()[..8], InvoiceNo = o.OrderNumber,
            DateTime = o.CreatedAt, Branch = o.Branch?.Name ?? "—", Cashier = o.Cashier?.FullName ?? "—",
            CustomerType = o.CustomerId.HasValue ? "Registered" : "Walk-in", FeeAmount = o.CustomFeeAmount, NetFee = o.CustomFeeAmount,
        }).ToList();

        return new FeeReportResult
        {
            Kpis = new FeeReportKpis
            {
                TotalFeesCollected = rows.Sum(r => r.FeeAmount),
                TransactionsWithFees = rows.Count,
                AverageFeePerTransaction = rows.Count > 0 ? Math.Round(rows.Sum(r => r.FeeAmount) / rows.Count, 2) : 0m,
            },
            Rows = rows,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 20. Tobacco Excise (RPT-COMPLIANCE-TOBACCO-EXCISE)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("tobacco-excise")]
    public async Task<IActionResult> GetTobaccoExcise([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildTobaccoExciseAsync(rangeFrom, rangeTo, branchId));
    }

    [HttpGet("tobacco-excise/export")]
    public async Task<IActionResult> ExportTobaccoExcise(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildTobaccoExciseAsync(rangeFrom, rangeTo, branchId);
        var headers = new[] { "SKU", "Barcode", "Product Name", "Brand", "Category", "Branch", "Units Sold", "Taxable Price", "Excise Rate", "Excise Amount", "VAT Amount", "Returns Qty", "Excise Reversal", "Net Excise", "Compliance Status" };
        var rows = result.Rows.Select(r => new object?[]
        {
            r.Sku, r.Barcode, r.ProductName, r.Brand, r.Category, r.Branch, r.UnitsSold, r.TaxablePrice, r.ExciseRate, r.ExciseAmount,
            r.VatAmount, r.ReturnsQty, r.ExciseReversal, r.NetExcise, r.ComplianceStatus,
        }).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"tobacco-excise\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Excise Sales Value", result.Kpis.ExciseSalesValue.ToString("0.##")), ("Excise Tax Amount", result.Kpis.ExciseTaxAmount.ToString("0.##")),
            ("Tobacco Units Sold", result.Kpis.TobaccoUnitsSold.ToString("0.##")), ("Excise Refunds", result.Kpis.ExciseRefunds.ToString("0.##")),
            ("Top Tobacco SKU", result.Kpis.TopTobaccoSku ?? "—"), ("Compliance Exceptions", result.Kpis.ComplianceExceptions.ToString()),
        };
        return BuildExportFile(format, "Tobacco Excise Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"tobacco-excise-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<TobaccoExciseResult> BuildTobaccoExciseAsync(DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId)
    {
        var itemsQ = db.OrderItems.Include(i => i.Order).ThenInclude(o => o!.Branch).Include(i => i.Product).ThenInclude(p => p!.Category)
            .Where(i => i.Order != null && i.Product != null && i.Product.IsTobacco
                && i.Order.CreatedAt >= rangeFrom && i.Order.CreatedAt < rangeToExclusive && i.Order.PaymentStatus == "paid");
        if (branchId.HasValue) itemsQ = itemsQ.Where(i => i.Order!.BranchId == branchId);

        var rawItems = await itemsQ.Select(i => new {
            i.ProductId, Sku = i.Product!.Sku, Barcode = i.Product.Barcode, Name = i.Product.Name, Brand = i.Product.Brand,
            Category = i.Product.Category != null ? i.Product.Category.Name : "—", Branch = i.Order!.Branch!.Name,
            Qty = i.Quantity, TaxablePrice = i.UnitPrice, VatAmount = i.TaxAmount,
        }).ToListAsync();

        var defaultExcisePct = (await db.TaxFeeRules.Where(r => r.IsTobacco && r.Status == "active").FirstOrDefaultAsync())?.ExcisePercentage ?? 0m;

        var returnsQ = db.CustomerReturnItems.Include(ri => ri.Return).Include(ri => ri.Product)
            .Where(ri => ri.Return != null && ri.Product != null && ri.Product.IsTobacco && ri.Return.CreatedAt >= rangeFrom && ri.Return.CreatedAt < rangeToExclusive);
        if (branchId.HasValue) returnsQ = returnsQ.Where(ri => ri.Return!.BranchId == branchId);
        var returnsByProduct = (await returnsQ.Select(ri => new { ri.ProductId, ri.Quantity }).ToListAsync())
            .GroupBy(x => x.ProductId).ToDictionary(g => g.Key, g => g.Sum(x => x.Quantity));

        var rows = rawItems.GroupBy(x => x.ProductId).Select(g =>
        {
            var f = g.First();
            var unitsSold = g.Sum(x => x.Qty);
            var taxableBase = g.Sum(x => x.TaxablePrice * x.Qty);
            var exciseAmount = taxableBase * (defaultExcisePct / 100m);
            var returnsQty = returnsByProduct.GetValueOrDefault(g.Key, 0m);
            var exciseReversal = unitsSold > 0 ? Math.Round(exciseAmount * (returnsQty / unitsSold), 2) : 0m;
            return new TobaccoExciseRow
            {
                Sku = f.Sku, Barcode = f.Barcode ?? "—", ProductName = f.Name, Brand = f.Brand ?? "—", Category = f.Category, Branch = f.Branch,
                UnitsSold = unitsSold, TaxablePrice = f.TaxablePrice, ExciseRate = defaultExcisePct, ExciseAmount = exciseAmount,
                VatAmount = g.Sum(x => x.VatAmount), ReturnsQty = returnsQty, ExciseReversal = exciseReversal, NetExcise = exciseAmount - exciseReversal,
                ComplianceStatus = defaultExcisePct > 0 ? "ok" : "missing excise config",
            };
        })
        .OrderByDescending(r => r.ExciseAmount)
        .ToList();

        return new TobaccoExciseResult
        {
            Kpis = new TobaccoExciseKpis
            {
                ExciseSalesValue = rows.Sum(r => r.TaxablePrice * r.UnitsSold), ExciseTaxAmount = rows.Sum(r => r.ExciseAmount),
                TobaccoUnitsSold = rows.Sum(r => r.UnitsSold), ExciseRefunds = rows.Sum(r => r.ExciseReversal),
                TopTobaccoSku = rows.FirstOrDefault()?.Sku, ComplianceExceptions = rows.Count(r => r.ComplianceStatus != "ok"),
            },
            Rows = rows,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 21. Profit Margin (RPT-FINANCE-PROFIT-MARGIN) — margin-permission gated end-to-end
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("profit-margin")]
    public async Task<IActionResult> GetProfitMargin(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] string? groupBy = "product")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildProfitMarginAsync(rangeFrom, rangeTo, branchId, groupBy ?? "product"));
    }

    [HttpGet("profit-margin/export")]
    public async Task<IActionResult> ExportProfitMargin(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] string? groupBy,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildProfitMarginAsync(rangeFrom, rangeTo, branchId, groupBy ?? "product");
        var headers = new[] { "Group", "Branch", "Units Sold", "Net Sales", "COGS", "Gross Profit", "Gross Margin %", "Discount Value", "Return Impact", "Net Profit", "Net Margin %" };
        var rows = result.Rows.Select(r => new object?[]
        {
            r.GroupName, r.Branch, r.UnitsSold, r.NetSales, r.Cogs, r.GrossProfit, r.MarginPct?.ToString("0.0") ?? "N/A",
            r.DiscountValue, r.ReturnImpact, r.NetProfit, r.NetMarginPct?.ToString("0.0") ?? "N/A",
        }).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"profit-margin\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Gross Profit", result.Kpis.GrossProfit.ToString("0.##")), ("Gross Margin %", result.Kpis.GrossMarginPct?.ToString("0.0") ?? "N/A"),
            ("Net Margin %", result.Kpis.NetMarginPct?.ToString("0.0") ?? "N/A"), ("Low Margin SKUs", result.Kpis.LowMarginSkus.ToString()),
        };
        return BuildExportFile(format, "Profit Margin Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd} · Grouped by {groupBy ?? "product"}",
            kpis, headers, rows, $"profit-margin-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<ProfitMarginResult> BuildProfitMarginAsync(DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, string groupBy)
    {
        var itemsQ = db.OrderItems.Include(i => i.Order).ThenInclude(o => o!.Branch).Include(i => i.Product).ThenInclude(p => p!.Category)
            .Where(i => i.Order != null && i.Order.CreatedAt >= rangeFrom && i.Order.CreatedAt < rangeToExclusive && i.Order.PaymentStatus == "paid");
        if (branchId.HasValue) itemsQ = itemsQ.Where(i => i.Order!.BranchId == branchId);

        var rawItems = await itemsQ.Select(i => new {
            ProductId = i.ProductId, ProductName = i.Product!.Name, CategoryId = i.Product.CategoryId,
            CategoryName = i.Product.Category != null ? i.Product.Category.Name : "Uncategorized",
            BranchId = i.Order!.BranchId, BranchName = i.Order.Branch!.Name,
            Qty = i.Quantity, Gross = i.UnitPrice * i.Quantity, i.DiscountAmount, Cogs = i.Quantity * (i.Product.CostPrice ?? 0m),
        }).ToListAsync();

        var returnsQ = db.CustomerReturnItems.Include(ri => ri.Return).Include(ri => ri.Product)
            .Where(ri => ri.Return != null && ri.Return.CreatedAt >= rangeFrom && ri.Return.CreatedAt < rangeToExclusive);
        if (branchId.HasValue) returnsQ = returnsQ.Where(ri => ri.Return!.BranchId == branchId);
        var returns = await returnsQ.Select(ri => new { ri.ProductId, CategoryId = ri.Product!.CategoryId, BranchId = ri.Return!.BranchId, ri.RefundAmount }).ToListAsync();

        List<ProfitMarginRow> rows;
        // Note: Net Profit here is Gross Profit minus Return Impact — the schema has no per-product/category/branch
        // "fees/costs" breakdown beyond the order-level custom fee, so that adjustment (FRD AC#104) isn't attributable at this granularity.
        if (groupBy == "category")
        {
            var returnsByKey = returns.GroupBy(r => r.CategoryId).ToDictionary(g => g.Key, g => g.Sum(x => x.RefundAmount));
            rows = rawItems.GroupBy(x => new { x.CategoryId, x.CategoryName }).Select(g =>
            {
                var netSales = g.Sum(x => x.Gross - x.DiscountAmount);
                var cogs = g.Sum(x => x.Cogs);
                var returnImpact = returnsByKey.GetValueOrDefault(g.Key.CategoryId, 0m);
                var grossProfit = netSales - cogs;
                var netProfit = grossProfit - returnImpact;
                return new ProfitMarginRow
                {
                    GroupKey = g.Key.CategoryId?.ToString() ?? "—", GroupName = g.Key.CategoryName, Branch = "—",
                    UnitsSold = g.Sum(x => x.Qty), NetSales = netSales, Cogs = cogs, GrossProfit = grossProfit,
                    MarginPct = netSales > 0 ? Math.Round(grossProfit / netSales * 100, 1) : null,
                    DiscountValue = g.Sum(x => x.DiscountAmount), ReturnImpact = returnImpact, NetProfit = netProfit,
                    NetMarginPct = netSales > 0 ? Math.Round(netProfit / netSales * 100, 1) : null,
                };
            }).ToList();
        }
        else if (groupBy == "branch")
        {
            var returnsByKey = returns.GroupBy(r => r.BranchId).ToDictionary(g => g.Key, g => g.Sum(x => x.RefundAmount));
            rows = rawItems.GroupBy(x => new { x.BranchId, x.BranchName }).Select(g =>
            {
                var netSales = g.Sum(x => x.Gross - x.DiscountAmount);
                var cogs = g.Sum(x => x.Cogs);
                var returnImpact = returnsByKey.GetValueOrDefault(g.Key.BranchId, 0m);
                var grossProfit = netSales - cogs;
                var netProfit = grossProfit - returnImpact;
                return new ProfitMarginRow
                {
                    GroupKey = g.Key.BranchId.ToString()[..8], GroupName = g.Key.BranchName, Branch = g.Key.BranchName,
                    UnitsSold = g.Sum(x => x.Qty), NetSales = netSales, Cogs = cogs, GrossProfit = grossProfit,
                    MarginPct = netSales > 0 ? Math.Round(grossProfit / netSales * 100, 1) : null,
                    DiscountValue = g.Sum(x => x.DiscountAmount), ReturnImpact = returnImpact, NetProfit = netProfit,
                    NetMarginPct = netSales > 0 ? Math.Round(netProfit / netSales * 100, 1) : null,
                };
            }).ToList();
        }
        else
        {
            var returnsByKey = returns.GroupBy(r => r.ProductId).ToDictionary(g => g.Key, g => g.Sum(x => x.RefundAmount));
            rows = rawItems.GroupBy(x => new { x.ProductId, x.ProductName }).Select(g =>
            {
                var netSales = g.Sum(x => x.Gross - x.DiscountAmount);
                var cogs = g.Sum(x => x.Cogs);
                var returnImpact = returnsByKey.GetValueOrDefault(g.Key.ProductId, 0m);
                var grossProfit = netSales - cogs;
                var netProfit = grossProfit - returnImpact;
                return new ProfitMarginRow
                {
                    GroupKey = g.Key.ProductId.ToString()[..8], GroupName = g.Key.ProductName, Branch = "—",
                    UnitsSold = g.Sum(x => x.Qty), NetSales = netSales, Cogs = cogs, GrossProfit = grossProfit,
                    MarginPct = netSales > 0 ? Math.Round(grossProfit / netSales * 100, 1) : null,
                    DiscountValue = g.Sum(x => x.DiscountAmount), ReturnImpact = returnImpact, NetProfit = netProfit,
                    NetMarginPct = netSales > 0 ? Math.Round(netProfit / netSales * 100, 1) : null,
                };
            }).ToList();
        }
        rows = rows.OrderByDescending(r => r.GrossProfit).ToList();

        var totalNetSales = rows.Sum(r => r.NetSales);
        return new ProfitMarginResult
        {
            Kpis = new ProfitMarginKpis
            {
                GrossProfit = rows.Sum(r => r.GrossProfit),
                GrossMarginPct = totalNetSales > 0 ? Math.Round(rows.Sum(r => r.GrossProfit) / totalNetSales * 100, 1) : null,
                NetMarginPct = totalNetSales > 0 ? Math.Round(rows.Sum(r => r.NetProfit) / totalNetSales * 100, 1) : null,
                LowMarginSkus = rows.Count(r => r.MarginPct.HasValue && r.MarginPct < 10),
                DiscountImpact = rows.Sum(r => r.DiscountValue),
                ReturnImpact = rows.Sum(r => r.ReturnImpact),
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

public sealed class BranchSalesRow
{
    public string BranchCode { get; init; } = "";
    public string BranchName { get; init; } = "";
    public string City { get; init; } = "";
    public int OpenTerminals { get; init; }
    public int Transactions { get; init; }
    public decimal GrossSales { get; init; }
    public decimal Discounts { get; init; }
    public decimal Returns { get; init; }
    public decimal NetSales { get; init; }
    public decimal Vat { get; init; }
    public decimal AvgBasket { get; init; }
    public decimal GrossProfit { get; init; }
    public decimal? MarginPct { get; init; }
    public int Rank { get; set; }
}

public sealed class BranchSalesKpis
{
    public string? TopBranch { get; init; }
    public string? LowestBranch { get; init; }
    public decimal TotalNetSales { get; init; }
    public decimal AverageBranchSales { get; init; }
    public decimal TotalReturns { get; init; }
    public decimal? OverallMarginPct { get; init; }
}

public sealed class BranchSalesResult
{
    public BranchSalesKpis Kpis { get; init; } = new();
    public List<BranchSalesRow> Rows { get; init; } = [];
}

public sealed class TerminalReportRow
{
    public string TerminalId { get; init; } = "";
    public string TerminalName { get; init; } = "";
    public string Branch { get; init; } = "";
    public string Status { get; init; } = "";
    public string AssignedCashier { get; init; } = "";
    public int Transactions { get; init; }
    public decimal NetSales { get; init; }
    public decimal Refunds { get; init; }
    public decimal UptimePct { get; init; }
    public DateTime? LastSyncTime { get; init; }
}

public sealed class TerminalReportKpis
{
    public int ActiveTerminals { get; init; }
    public int OfflineTerminals { get; init; }
    public decimal TerminalSales { get; init; }
    public decimal AvgUptimePct { get; init; }
}

public sealed class TerminalReportResult
{
    public TerminalReportKpis Kpis { get; init; } = new();
    public List<TerminalReportRow> Rows { get; init; } = [];
}

public sealed class ProductSalesRow
{
    public string Sku { get; init; } = "";
    public string Barcode { get; init; } = "";
    public string ProductName { get; init; } = "";
    public string Category { get; init; } = "";
    public string Brand { get; init; } = "";
    public decimal UnitsSold { get; init; }
    public decimal NetSales { get; init; }
    public decimal Discounts { get; init; }
    public decimal ReturnsQty { get; init; }
    public decimal ReturnRatePct { get; init; }
    public decimal Cogs { get; init; }
    public decimal GrossProfit { get; init; }
    public decimal? MarginPct { get; init; }
    public decimal CurrentStock { get; init; }
}

public sealed class ProductSalesKpis
{
    public string? TopSku { get; init; }
    public decimal UnitsSold { get; init; }
    public decimal NetSales { get; init; }
    public decimal? GrossMarginPct { get; init; }
    public int DeadStockCount { get; init; }
    public decimal ReturnRatePct { get; init; }
}

public sealed class ProductSalesResult
{
    public ProductSalesKpis Kpis { get; init; } = new();
    public List<ProductSalesRow> Rows { get; init; } = [];
}

public sealed class CategoryPerformanceRow
{
    public string CategoryId { get; init; } = "";
    public string CategoryName { get; init; } = "";
    public string ParentCategory { get; init; } = "";
    public int SkuCount { get; init; }
    public decimal UnitsSold { get; init; }
    public decimal GrossSales { get; init; }
    public decimal Discounts { get; init; }
    public decimal Returns { get; init; }
    public decimal NetSales { get; init; }
    public decimal SalesContributionPct { get; init; }
    public decimal Cogs { get; init; }
    public decimal GrossProfit { get; init; }
    public decimal? MarginPct { get; init; }
}

public sealed class CategoryPerformanceKpis
{
    public string? TopCategory { get; init; }
    public int TotalCategoriesSold { get; init; }
    public decimal CategoryDiscountValue { get; init; }
}

public sealed class CategoryPerformanceResult
{
    public CategoryPerformanceKpis Kpis { get; init; } = new();
    public List<CategoryPerformanceRow> Rows { get; init; } = [];
}

public sealed class SupplierPerformanceRow
{
    public string SupplierId { get; init; } = "";
    public string SupplierName { get; init; } = "";
    public int PoCount { get; init; }
    public decimal OrderedQty { get; init; }
    public decimal ReceivedQty { get; init; }
    public decimal FillRatePct { get; init; }
    public decimal AverageLeadTimeDays { get; init; }
    public int LateDeliveries { get; init; }
    public decimal PurchaseValue { get; init; }
    public decimal OutstandingDues { get; init; }
    public decimal SupplierReturnsQty { get; init; }
    public decimal RtsValue { get; init; }
    public DateTime LastPoDate { get; init; }
}

public sealed class SupplierPerformanceKpis
{
    public decimal BestFillRatePct { get; init; }
    public decimal AverageLeadTimeDays { get; init; }
    public decimal TotalPurchaseValue { get; init; }
    public decimal OutstandingDues { get; init; }
    public decimal RtsValue { get; init; }
}

public sealed class SupplierPerformanceResult
{
    public SupplierPerformanceKpis Kpis { get; init; } = new();
    public List<SupplierPerformanceRow> Rows { get; init; } = [];
}

public sealed class WasteSpoilageRow
{
    public string WasteId { get; init; } = "";
    public DateTime DateTime { get; init; }
    public string Sku { get; init; } = "";
    public string ProductName { get; init; } = "";
    public string Category { get; init; } = "";
    public string Branch { get; init; } = "";
    public decimal Qty { get; init; }
    public string Reason { get; init; } = "";
    public decimal CostValue { get; init; }
    public string? Notes { get; init; }
}

public sealed class WasteSpoilageKpis
{
    public decimal TotalWriteOffValue { get; init; }
    public int ExpiredItems { get; init; }
    public int DamagedItems { get; init; }
    public string? TopWasteCategory { get; init; }
    public decimal WastePctOfSales { get; init; }
}

public sealed class WasteSpoilageResult
{
    public WasteSpoilageKpis Kpis { get; init; } = new();
    public List<WasteSpoilageRow> Rows { get; init; } = [];
}

public sealed class ReturnRefundRow
{
    public string ReturnId { get; init; } = "";
    public string OriginalOrderId { get; init; } = "";
    public DateTime DateTime { get; init; }
    public string Branch { get; init; } = "";
    public string Cashier { get; init; } = "";
    public string Customer { get; init; } = "";
    public string ReturnType { get; init; } = "";
    public string Reason { get; init; } = "";
    public string RefundMethod { get; init; } = "";
    public decimal RefundAmount { get; init; }
    public decimal VatReversal { get; init; }
    public string Status { get; init; } = "";
}

public sealed class ReturnsRefundsKpis
{
    public int ReturnCount { get; init; }
    public decimal RefundValue { get; init; }
    public decimal VatReversed { get; init; }
    public string? TopReturnReason { get; init; }
    public string? HighestReturnBranch { get; init; }
    public int RefundsPending { get; init; }
}

public sealed class ReturnsRefundsResult
{
    public ReturnsRefundsKpis Kpis { get; init; } = new();
    public List<ReturnRefundRow> Rows { get; init; } = [];
}

public sealed class AttendanceShiftRow
{
    public string StaffId { get; init; } = "";
    public string StaffName { get; init; } = "";
    public string Role { get; init; } = "";
    public string Branch { get; init; } = "";
    public string ShiftId { get; init; } = "";
    public string Terminal { get; init; } = "";
    public DateTime? CheckInTime { get; init; }
    public DateTime ShiftOpenTime { get; init; }
    public DateTime? ShiftCloseTime { get; init; }
    public decimal HoursWorked { get; init; }
    public decimal OpeningFloat { get; init; }
    public decimal ExpectedCash { get; init; }
    public decimal? CountedCash { get; init; }
    public decimal? Variance { get; init; }
    public string Status { get; init; } = "";
}

public sealed class AttendanceShiftKpis
{
    public int OpenShifts { get; init; }
    public int ClosedShifts { get; init; }
    public decimal CashVariance { get; init; }
    public decimal TotalStaffHours { get; init; }
    public int MissingClosures { get; init; }
}

public sealed class AttendanceShiftResult
{
    public AttendanceShiftKpis Kpis { get; init; } = new();
    public List<AttendanceShiftRow> Rows { get; init; } = [];
}

public sealed class AuditTrailRow
{
    public string EventId { get; init; } = "";
    public DateTime Timestamp { get; init; }
    public string Severity { get; init; } = "";
    public string Module { get; init; } = "";
    public string Action { get; init; } = "";
    public string EntityId { get; init; } = "";
    public string User { get; init; } = "";
    public string Role { get; init; } = "";
    public string Branch { get; init; } = "";
    public string IpAddress { get; init; } = "";
    public string? BeforeValue { get; init; }
    public string? AfterValue { get; init; }
}

public sealed class AuditTrailKpis
{
    public int CriticalEvents { get; init; }
    public int FailedLogins { get; init; }
    public int OverrideCount { get; init; }
    public int ConfigurationChanges { get; init; }
    public int ExportsGenerated { get; init; }
}

public sealed class AuditTrailResult
{
    public AuditTrailKpis Kpis { get; init; } = new();
    public List<AuditTrailRow> Rows { get; init; } = [];
}

public sealed class DiscountRow
{
    public string TransactionId { get; init; } = "";
    public string InvoiceNo { get; init; } = "";
    public DateTime DateTime { get; init; }
    public string Branch { get; init; } = "";
    public string Cashier { get; init; } = "";
    public string CustomerType { get; init; } = "";
    public string DiscountType { get; init; } = "";
    public string? CouponCode { get; init; }
    public decimal DiscountPct { get; init; }
    public decimal DiscountAmount { get; init; }
    public decimal NetSalesAfterDiscount { get; init; }
}

public sealed class DiscountsKpis
{
    public decimal TotalDiscountValue { get; init; }
    public decimal ManualDiscountValue { get; init; }
    public int CouponUsage { get; init; }
    public decimal DiscountPctOfSales { get; init; }
}

public sealed class DiscountsResult
{
    public DiscountsKpis Kpis { get; init; } = new();
    public List<DiscountRow> Rows { get; init; } = [];
}

public sealed class VatZatcaRow
{
    public string InvoiceNo { get; init; } = "";
    public DateTime IssueDateTime { get; init; }
    public string Branch { get; init; } = "";
    public string InvoiceType { get; init; } = "";
    public string? CustomerVatNo { get; init; }
    public decimal TaxableAmount { get; init; }
    public decimal VatAmount { get; init; }
    public decimal TotalWithVat { get; init; }
    public string ZatcaStatus { get; init; } = "";
    public bool IsReversal { get; init; }
}

public sealed class VatZatcaKpis
{
    public decimal TaxableSales { get; init; }
    public decimal VatCollected { get; init; }
    public decimal VatReversed { get; init; }
    public int ZatcaSuccess { get; init; }
    public int ZatcaPending { get; init; }
    public int ZatcaErrors { get; init; }
}

public sealed class VatZatcaResult
{
    public VatZatcaKpis Kpis { get; init; } = new();
    public List<VatZatcaRow> Rows { get; init; } = [];
}

public sealed class TaxReportRow
{
    public string Branch { get; init; } = "";
    public string Cashier { get; init; } = "";
    public string TaxCode { get; init; } = "";
    public string TaxType { get; init; } = "";
    public decimal TaxRate { get; init; }
    public decimal TaxableAmount { get; init; }
    public decimal TaxAmount { get; init; }
    public decimal ZeroRatedAmount { get; init; }
    public decimal ExemptAmount { get; init; }
    public decimal TaxReversed { get; init; }
    public decimal NetTaxAmount => TaxAmount - TaxReversed;
    public int Transactions { get; init; }
}

public sealed class TaxReportKpis
{
    public decimal TotalTaxableAmount { get; init; }
    public decimal VatAmount { get; init; }
    public decimal ZeroRatedSales { get; init; }
    public decimal NetTaxPayable { get; init; }
}

public sealed class TaxReportResult
{
    public TaxReportKpis Kpis { get; init; } = new();
    public List<TaxReportRow> Rows { get; init; } = [];
}

public sealed class FeeRow
{
    public string FeeId { get; init; } = "";
    public string FeeType { get; init; } = "";
    public string TransactionId { get; init; } = "";
    public string InvoiceNo { get; init; } = "";
    public DateTime DateTime { get; init; }
    public string Branch { get; init; } = "";
    public string Cashier { get; init; } = "";
    public string CustomerType { get; init; } = "";
    public decimal FeeAmount { get; init; }
    public decimal NetFee { get; init; }
}

public sealed class FeeReportKpis
{
    public decimal TotalFeesCollected { get; init; }
    public int TransactionsWithFees { get; init; }
    public decimal AverageFeePerTransaction { get; init; }
}

public sealed class FeeReportResult
{
    public FeeReportKpis Kpis { get; init; } = new();
    public List<FeeRow> Rows { get; init; } = [];
}

public sealed class TobaccoExciseRow
{
    public string Sku { get; init; } = "";
    public string Barcode { get; init; } = "";
    public string ProductName { get; init; } = "";
    public string Brand { get; init; } = "";
    public string Category { get; init; } = "";
    public string Branch { get; init; } = "";
    public decimal UnitsSold { get; init; }
    public decimal TaxablePrice { get; init; }
    public decimal ExciseRate { get; init; }
    public decimal ExciseAmount { get; init; }
    public decimal VatAmount { get; init; }
    public decimal ReturnsQty { get; init; }
    public decimal ExciseReversal { get; init; }
    public decimal NetExcise { get; init; }
    public string ComplianceStatus { get; init; } = "";
}

public sealed class TobaccoExciseKpis
{
    public decimal ExciseSalesValue { get; init; }
    public decimal ExciseTaxAmount { get; init; }
    public decimal TobaccoUnitsSold { get; init; }
    public decimal ExciseRefunds { get; init; }
    public string? TopTobaccoSku { get; init; }
    public int ComplianceExceptions { get; init; }
}

public sealed class TobaccoExciseResult
{
    public TobaccoExciseKpis Kpis { get; init; } = new();
    public List<TobaccoExciseRow> Rows { get; init; } = [];
}

public sealed class ProfitMarginRow
{
    public string GroupKey { get; init; } = "";
    public string GroupName { get; init; } = "";
    public string Branch { get; init; } = "";
    public decimal UnitsSold { get; init; }
    public decimal NetSales { get; init; }
    public decimal Cogs { get; init; }
    public decimal GrossProfit { get; init; }
    public decimal? MarginPct { get; init; }
    public decimal DiscountValue { get; init; }
    public decimal ReturnImpact { get; init; }
    public decimal NetProfit { get; init; }
    public decimal? NetMarginPct { get; init; }
}

public sealed class ProfitMarginKpis
{
    public decimal GrossProfit { get; init; }
    public decimal? GrossMarginPct { get; init; }
    public decimal? NetMarginPct { get; init; }
    public int LowMarginSkus { get; init; }
    public decimal DiscountImpact { get; init; }
    public decimal ReturnImpact { get; init; }
}

public sealed class ProfitMarginResult
{
    public ProfitMarginKpis Kpis { get; init; } = new();
    public List<ProfitMarginRow> Rows { get; init; } = [];
}
