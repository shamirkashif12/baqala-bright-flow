using BaqalaPOS.Api.Authorization;
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

    // Server-side truth for cost/margin visibility — reports that mix ordinary sales columns
    // with COGS/Gross Profit/Margin % must mask those specific fields for callers without
    // "Accounting & Finance" view access, per FRD §6.1. Independent of the coarse "Reports"
    // View/Export gate above, which only decides whether the endpoint can be called at all.
    private Task<bool> CanViewFinanceAsync() =>
        PermissionCheck.HasPermissionAsync(HttpContext.User, db, "Accounting & Finance", PermAction.View);

    // Branch-scoped roles (anything but tenant_admin) may only see their own branch's report data —
    // mirrors the scoping InventoryController already applies to batches/stock. Without this, a
    // Branch Manager/Cashier Supervisor could pass a different branchId query param and read another
    // branch's sales/cash/margin figures, violating the FRD's role table (§6).
    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value
                      ?? User.FindFirst("sub")?.Value, out var id) ? id : null;

    // ASP.NET Core binds an absent `[FromQuery] Guid[]?` to an EMPTY ARRAY, not null — so
    // `branchId?.FirstOrDefault()` yields Guid.Empty rather than null whenever the caller omits
    // the filter. Every export endpoint below fed that straight into the audit log's branch_id,
    // which then failed FK_audit_logs_branches_branch_id and 500'd the whole download: exporting
    // any report without first picking a branch was impossible. Use this instead of
    // ?.FirstOrDefault() for anything that reaches a foreign key.
    private static Guid? FirstBranchOrNull(Guid[]? ids) => ids is { Length: > 0 } ? ids[0] : null;

    // Cashier-sales and attendance-shift double as a Cashier's OWN self-service "My Shift
    // Report"/check-in history — real Cashier permission rows have Reports.View = false (that
    // gates the manager-facing branch/mart-wide reports), which previously 403'd every single
    // attempt to view their own shift, permanently — the mobile app's "My Shift Report" screen
    // had no way to ever succeed for the exact role it's built for. Allow the narrower case: no
    // "Reports" permission, but the request is scoped to the caller's own id.
    private async Task<bool> CanViewReportOrSelfAsync(Guid? selfScopedId)
    {
        if (await PermissionCheck.HasPermissionAsync(HttpContext.User, db, "Reports", PermAction.View)) return true;
        var callerId = CallerId();
        return callerId != null && selfScopedId == callerId;
    }

    // Roles whose stock lives in a warehouse rather than a shop floor. Deliberately NOT including
    // "storekeeper" or "picker": storekeeper is branch-side inventory staff (DataSeeder gives it
    // full Stocks CRUD at the branch), and picker is a fulfilment role — neither owns warehouse
    // stock, and silently flipping them to the warehouse pool would empty a report they use today.
    private static readonly string[] WarehouseScopedRoles = ["warehouse_staff", "warehouse_manager"];

    /// <summary>
    /// Which stock pool(s) a caller may see, and which locations within them.
    ///
    /// The system has two disjoint ledgers — inventory_stock (branch) and warehouse_stock
    /// (warehouse) — so "inventory" means a different set of rows depending on who is asking.
    /// There is no warehouse claim on the JWT (User has no warehouse_id column at all), so a
    /// warehouse user's warehouses are resolved through branch_warehouses from their branch claim:
    /// that M2M is the only link between a user and a warehouse this schema has.
    /// </summary>
    /// <param name="WarehouseScopeBranchId">
    /// When set, warehouses are limited to those linked to this branch. Carried as the branch id
    /// rather than a resolved List&lt;Guid&gt; of warehouse ids on purpose: the MySQL EF provider
    /// cannot translate a parameterized list into an IN clause ("Expression … does not have a type
    /// mapping assigned"), a limitation this file already works around at BuildLowStockAsync. Kept
    /// as a scalar, the restriction composes into the query as a correlated EXISTS instead.
    /// </param>
    private sealed record InventoryScope(
        bool IncludeBranchStock, bool IncludeWarehouseStock, Guid? ForcedBranchId, Guid? WarehouseScopeBranchId);

    private InventoryScope ResolveInventoryScope()
    {
        var (role, branchId) = GetCallerContext();

        if (role is null || role == "tenant_admin")
            return new InventoryScope(true, true, null, null);

        if (WarehouseScopedRoles.Contains(role))
            // No branch claim means there is nothing to resolve warehouses from. Mirrors the
            // existing convention elsewhere in this controller (`branchId.HasValue` guards every
            // scope override) — an unscoped claim is left unscoped rather than fenced to zero rows,
            // because the permission matrix, not the claim, is the authorization boundary here.
            return new InventoryScope(false, true, null, branchId);

        // Everyone else (cashier, branch_manager, storekeeper, …) is a branch user: branch pool
        // only, fenced to their own branch. They get no warehouse rows and no warehouse filter.
        return new InventoryScope(true, false, branchId, null);
    }

    // ───────────────────────────────────────────────────────────────────────
    // 1. Daily Sales (RPT-SALES-DAILY)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("daily-sales")]
    [RequirePermission("Reports", PermAction.View)]
    public async Task<IActionResult> GetDailySales(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? branchId, [FromQuery] Guid[]? terminalId,
        [FromQuery] Guid[]? cashierId, [FromQuery] string[]? paymentMethod, [FromQuery] string? orderStatus, [FromQuery] string[]? customerType,
        [FromQuery] bool hasTobaccoFee = false)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: false);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildDailySalesAsync(rangeFrom, rangeTo, branchId ?? [], terminalId ?? [], cashierId ?? [], paymentMethod ?? [], orderStatus, customerType ?? [], hasTobaccoFee);
        return Ok(result);
    }

    [HttpGet("daily-sales/export")]
    [RequirePermission("Reports", PermAction.Export)]
    public async Task<IActionResult> ExportDailySales(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? branchId, [FromQuery] Guid[]? terminalId,
        [FromQuery] Guid[]? cashierId, [FromQuery] string[]? paymentMethod, [FromQuery] string? orderStatus, [FromQuery] string[]? customerType,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv", [FromQuery] bool hasTobaccoFee = false)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: false);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildDailySalesAsync(rangeFrom, rangeTo, branchId ?? [], terminalId ?? [], cashierId ?? [], paymentMethod ?? [], orderStatus, customerType ?? [], hasTobaccoFee);
        var headers = new[] { "Hour", "Transactions", "Gross Sales", "Discounts", "Returns", "Net Sales", "VAT Collected", "Tobacco Fees", "Cash", "Card", "Wallet", "Avg Basket" };
        var rows = result.Hourly.Select(h => new object?[]
        {
            $"{h.Hour:00}:00", h.Transactions, h.GrossSales, h.Discounts, h.Returns, h.NetSales, h.Vat, h.TobaccoFees, h.Cash, h.Card, h.Wallet, h.AvgBasket,
        }).ToList();
        var rangeToInclusive = rangeTo.AddDays(-1);
        await audit.LogAsync("export_report", "Report", null, exportedBy, FirstBranchOrNull(branchId),
            $"{{\"report\":\"daily-sales\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeToInclusive:yyyy-MM-dd}\",\"rows\":{result.Hourly.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Gross Sales", result.Kpis.GrossSales.ToString("0.##")), ("Net Sales", result.Kpis.NetSales.ToString("0.##")),
            ("Transactions", result.Kpis.Transactions.ToString()), ("VAT Collected", result.Kpis.VatCollected.ToString("0.##")),
            ("Tobacco Fees", result.Kpis.TobaccoFees.ToString("0.##")),
        };
        var rangeLabel = rangeFrom == rangeToInclusive ? $"Date: {rangeFrom:yyyy-MM-dd}" : $"Date: {rangeFrom:yyyy-MM-dd} to {rangeToInclusive:yyyy-MM-dd}";
        var fileLabel = rangeFrom == rangeToInclusive ? $"{rangeFrom:yyyy-MM-dd}" : $"{rangeFrom:yyyy-MM-dd}_to_{rangeToInclusive:yyyy-MM-dd}";
        return await BuildExportFile(format, "Daily Sales Report", rangeLabel, kpis, headers, rows, $"daily-sales-{fileLabel}");
    }

    private async Task<DailySalesResult> BuildDailySalesAsync(
        DateTime rangeFrom, DateTime rangeToExclusive, Guid[] branchIds, Guid[] terminalIds, Guid[] cashierIds,
        string[] paymentMethods, string? orderStatus, string[] customerTypes, bool hasTobaccoFee = false)
    {
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) branchIds = [scopeBranchId.Value];
        var wantRegistered = customerTypes.Contains("registered");
        var wantWalkIn = customerTypes.Contains("walk-in");

        var ordersQ = db.Orders.Where(o => o.CreatedAt >= rangeFrom && o.CreatedAt < rangeToExclusive);
        if (branchIds.Length > 0) ordersQ = ordersQ.Where(o => branchIds.Contains(o.BranchId));
        if (terminalIds.Length > 0) ordersQ = ordersQ.Where(o => o.TerminalId != null && terminalIds.Contains(o.TerminalId.Value));
        if (cashierIds.Length > 0) ordersQ = ordersQ.Where(o => o.CashierId.HasValue && cashierIds.Contains(o.CashierId.Value));
        if (!string.IsNullOrEmpty(orderStatus)) ordersQ = ordersQ.Where(o => o.OrderStatus == orderStatus);
        if (wantRegistered && !wantWalkIn) ordersQ = ordersQ.Where(o => o.CustomerId != null);
        else if (wantWalkIn && !wantRegistered) ordersQ = ordersQ.Where(o => o.CustomerId == null);
        // Narrow to orders carrying excise. Applied to the payment and return queries below too —
        // filtering only the orders would leave the Cash/Card/Wallet and Returns columns still
        // reporting non-tobacco money, so an hour's row wouldn't reconcile against its own totals.
        if (hasTobaccoFee) ordersQ = ordersQ.Where(o => o.TobaccoFeeAmount > 0);

        var paymentsQ = db.OrderPayments
            .Include(p => p.Order)
            .Where(p => p.CreatedAt >= rangeFrom && p.CreatedAt < rangeToExclusive && p.Status == "completed" && p.Order != null);
        if (branchIds.Length > 0) paymentsQ = paymentsQ.Where(p => branchIds.Contains(p.Order!.BranchId));
        if (terminalIds.Length > 0) paymentsQ = paymentsQ.Where(p => p.Order!.TerminalId != null && terminalIds.Contains(p.Order!.TerminalId!.Value));
        if (cashierIds.Length > 0) paymentsQ = paymentsQ.Where(p => p.Order!.CashierId.HasValue && cashierIds.Contains(p.Order!.CashierId!.Value));
        if (paymentMethods.Length > 0) paymentsQ = paymentsQ.Where(p => paymentMethods.Contains(p.PaymentMethod));
        if (wantRegistered && !wantWalkIn) paymentsQ = paymentsQ.Where(p => p.Order!.CustomerId != null);
        else if (wantWalkIn && !wantRegistered) paymentsQ = paymentsQ.Where(p => p.Order!.CustomerId == null);
        if (hasTobaccoFee) paymentsQ = paymentsQ.Where(p => p.Order!.TobaccoFeeAmount > 0);

        var returnsQ = db.CustomerReturns.Where(r => r.CreatedAt >= rangeFrom && r.CreatedAt < rangeToExclusive);
        if (branchIds.Length > 0) returnsQ = returnsQ.Where(r => branchIds.Contains(r.BranchId));
        if (wantRegistered && !wantWalkIn) returnsQ = returnsQ.Where(r => r.CustomerId != null);
        else if (wantWalkIn && !wantRegistered) returnsQ = returnsQ.Where(r => r.CustomerId == null);
        if (hasTobaccoFee) returnsQ = returnsQ.Where(r => r.Order != null && r.Order.TobaccoFeeAmount > 0);

        var ordersByHour = await ordersQ
            .GroupBy(o => o.CreatedAt.Hour)
            .Select(g => new
            {
                hour = g.Key,
                transactions = g.Count(o => o.PaymentStatus == "paid"),
                grossSales = g.Sum(o => o.Subtotal),
                discounts = g.Sum(o => o.DiscountAmount),
                vat = g.Sum(o => o.TaxAmount),
                // True net revenue — gross less discounts, net of tax/tobacco excise/custom fees
                // (those are pass-through charges, not product sales). Matches the NetSales formula
                // already used everywhere else in this report suite (see LoadDailyLineItemsAsync:
                // `gross - discounts - returnValue`) — this hand-rolled query previously used
                // `TotalAmount - TaxAmount`, which adds tobacco excise back in and could show Net
                // Sales higher than Gross Sales on any day with meaningful tobacco volume.
                netSales = g.Sum(o => o.Subtotal - o.DiscountAmount),
                tobaccoFees = g.Sum(o => o.TobaccoFeeAmount),
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
            var grossSales = o?.grossSales ?? 0m;
            var netSales = (o?.netSales ?? 0m) - returns;
            hourly.Add(new DailySalesHour
            {
                Hour = h,
                Transactions = transactions,
                GrossSales = grossSales,
                Discounts = o?.discounts ?? 0m,
                Returns = returns,
                NetSales = netSales,
                Vat = o?.vat ?? 0m,
                TobaccoFees = o?.tobaccoFees ?? 0m,
                Cash = cash,
                Card = card,
                Wallet = wallet,
                // Avg basket = typical transaction size before discounts/returns, so it's the
                // (now-corrected, no-longer-inflated) Net Sales figure's gross counterpart — see
                // note above; using Net Sales here previously overstated it further.
                AvgBasket = transactions > 0 ? Math.Round(grossSales / transactions, 2) : 0m,
            });
        }

        var paymentSplit = await paymentsQ
            .GroupBy(p => p.PaymentMethod)
            .Select(g => new PaymentSplitRow { Method = g.Key, Amount = g.Sum(p => p.Amount) })
            .ToListAsync();

        // Sales per item — same day/branch/terminal/cashier/status/customerType/tobacco scope as
        // ordersQ above, just at OrderItem granularity instead of order granularity. The report
        // previously showed hourly totals only, with no way to see which products made up a day.
        var itemsQ = db.OrderItems.Include(i => i.Product)
            .Where(i => i.Order != null && i.Order.CreatedAt >= rangeFrom && i.Order.CreatedAt < rangeToExclusive);
        if (branchIds.Length > 0) itemsQ = itemsQ.Where(i => branchIds.Contains(i.Order!.BranchId));
        if (terminalIds.Length > 0) itemsQ = itemsQ.Where(i => i.Order!.TerminalId != null && terminalIds.Contains(i.Order!.TerminalId!.Value));
        if (cashierIds.Length > 0) itemsQ = itemsQ.Where(i => i.Order!.CashierId.HasValue && cashierIds.Contains(i.Order!.CashierId!.Value));
        if (!string.IsNullOrEmpty(orderStatus)) itemsQ = itemsQ.Where(i => i.Order!.OrderStatus == orderStatus);
        if (wantRegistered && !wantWalkIn) itemsQ = itemsQ.Where(i => i.Order!.CustomerId != null);
        else if (wantWalkIn && !wantRegistered) itemsQ = itemsQ.Where(i => i.Order!.CustomerId == null);
        if (hasTobaccoFee) itemsQ = itemsQ.Where(i => i.Order!.TobaccoFeeAmount > 0);

        var items = await itemsQ
            .GroupBy(i => new { i.ProductId, Name = i.Product != null ? i.Product.Name : "Unknown", Sku = i.Product != null ? i.Product.Sku : "—" })
            .Select(g => new DailySalesItemRow
            {
                ProductName = g.Key.Name,
                Sku = g.Key.Sku,
                QuantitySold = g.Sum(i => i.Quantity),
                GrossSales = g.Sum(i => i.UnitPrice * i.Quantity),
            })
            .OrderByDescending(r => r.GrossSales)
            .ToListAsync();

        var kpiTransactions = hourly.Sum(h => h.Transactions);
        var kpiGrossSales = hourly.Sum(h => h.GrossSales);
        var kpiNetSales = hourly.Sum(h => h.NetSales);

        return new DailySalesResult
        {
            Kpis = new DailySalesKpis
            {
                GrossSales = kpiGrossSales,
                NetSales = kpiNetSales,
                Transactions = kpiTransactions,
                AvgBasket = kpiTransactions > 0 ? Math.Round(kpiGrossSales / kpiTransactions, 2) : 0m,
                VatCollected = hourly.Sum(h => h.Vat),
                ReturnsRefunds = hourly.Sum(h => h.Returns),
                TobaccoFees = ordersByHour.Sum(x => x.tobaccoFees),
            },
            Hourly = hourly,
            PaymentSplit = paymentSplit,
            Items = items,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // KPI Evaluation — real, directly-derivable metrics only (RPT-KPI). Per-scan timing/
    // misscan-rate KPIs are NOT computed here: nothing in this system instruments individual
    // scan events, so there is no real data to report for those, and this endpoint doesn't
    // invent a number to fill the gap. What IS real and derivable from existing Orders/OrderItems
    // data — scan volume, completed order counts, per-branch performance — is computed below.
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("kpi-summary")]
    [RequirePermission("Reports", PermAction.View)]
    [RequirePlanFeature("kpi_bi")]
    public async Task<IActionResult> GetKpiSummary([FromQuery] DateTime? date, [FromQuery] Guid? branchId)
    {
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) branchId = scopeBranchId;
        var day = (date ?? DateTime.UtcNow).Date;
        var dayEnd = day.AddDays(1);

        var ordersQ = db.Orders.Where(o => o.CreatedAt >= day && o.CreatedAt < dayEnd);
        if (branchId.HasValue) ordersQ = ordersQ.Where(o => o.BranchId == branchId);
        var orders = await ordersQ.Select(o => new { o.Id, o.OrderStatus, o.BranchId, o.TotalAmount }).ToListAsync();

        var itemsQ = db.OrderItems.Include(i => i.Order)
            .Where(i => i.Order != null && i.Order.CreatedAt >= day && i.Order.CreatedAt < dayEnd);
        if (branchId.HasValue) itemsQ = itemsQ.Where(i => i.Order!.BranchId == branchId);
        var totalScansToday = await itemsQ.SumAsync(i => (int?)i.Quantity) ?? 0;

        var transactionsToday = orders.Count;
        var ordersCompletedToday = orders.Count(o => o.OrderStatus == "completed");

        var branchKpi = orders
            .GroupBy(o => o.BranchId)
            .Select(g => new
            {
                branchId = g.Key,
                ordersToday = g.Count(),
                salesToday = g.Sum(o => o.TotalAmount),
                avgBasketToday = g.Count() > 0 ? Math.Round(g.Sum(o => o.TotalAmount) / g.Count(), 2) : 0m,
            })
            .ToList();

        return Ok(new
        {
            totalScansToday,
            ordersCompletedToday,
            transactionsToday,
            itemsPerOrderToday = transactionsToday > 0 ? Math.Round((decimal)totalScansToday / transactionsToday, 1) : 0m,
            branchKpi,
        });
    }

    // ───────────────────────────────────────────────────────────────────────
    // Business Intelligence dashboard summary (BI-DASH). Every figure here is a real aggregate
    // over existing Orders/OrderItems/InventoryStocks/InventoryAdjustments/StockTransfers/
    // PurchaseOrders data. The BI page previously rendered several widgets (Sales Trends, Best
    // Selling Products, Slow Moving SKUs, Expiry Loss, Warehouse Insights) as hardcoded "Sample
    // data" sitting right next to genuinely live tiles (Revenue Today, Orders Today) — easy to
    // mistake for real figures. Nothing here is invented; where there's genuinely no backing
    // definition anywhere in this system (e.g. a "stock turnover" spec beyond the COGS/current-
    // stock-value approximation already used in the Inventory Dashboard report), this reuses that
    // same approximation rather than making up a new formula.
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("bi-summary")]
    [RequirePermission("Reports", PermAction.View)]
    [RequirePlanFeature("kpi_bi")]
    public async Task<IActionResult> GetBiSummary([FromQuery] Guid? branchId)
    {
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) branchId = scopeBranchId;

        var today = DateTime.UtcNow.Date;
        var weekStart = today.AddDays(-6);
        var monthStart = new DateTime(today.Year, today.Month, 1);
        var trendStart = today.AddDays(-13);

        // Sales trend — net sales per day, last 14 days
        var trendOrdersQ = db.Orders.Where(o => o.CreatedAt >= trendStart && o.CreatedAt < today.AddDays(1) && o.PaymentStatus == "paid");
        if (branchId.HasValue) trendOrdersQ = trendOrdersQ.Where(o => o.BranchId == branchId);
        var trendRaw = await trendOrdersQ
            .GroupBy(o => o.CreatedAt.Date)
            .Select(g => new { date = g.Key, netSales = g.Sum(o => o.Subtotal - o.DiscountAmount) })
            .ToListAsync();
        var trendMap = trendRaw.ToDictionary(x => x.date, x => x.netSales);
        var salesTrend = Enumerable.Range(0, 14)
            .Select(i => trendStart.AddDays(i))
            .Select(d => new { date = d.ToString("yyyy-MM-dd"), netSales = trendMap.GetValueOrDefault(d, 0m) })
            .ToList();

        // Best selling products — units sold this month, top 5
        var itemsQ = db.OrderItems.Include(i => i.Order).Include(i => i.Product)
            .Where(i => i.Order != null && i.Order.CreatedAt >= monthStart && i.Order.PaymentStatus == "paid");
        if (branchId.HasValue) itemsQ = itemsQ.Where(i => i.Order!.BranchId == branchId);
        var itemRows = await itemsQ.Select(i => new { i.ProductId, Name = i.Product!.Name, i.Quantity }).ToListAsync();
        var bestSellers = itemRows.GroupBy(x => x.ProductId)
            .Select(g => new { productName = g.First().Name, unitsSold = g.Sum(x => x.Quantity) })
            .OrderByDescending(x => x.unitsSold)
            .Take(5)
            .ToList();
        var maxUnits = bestSellers.Count > 0 ? bestSellers.Max(x => x.unitsSold) : 1;
        var bestSellersOut = bestSellers
            .Select(x => new { x.productName, x.unitsSold, pct = maxUnits > 0 ? (int)Math.Round(x.unitsSold / maxUnits * 100) : 0 })
            .ToList();

        // Slow moving SKUs — currently in stock, zero sales in the last 30 days
        var recentSaleStart = today.AddDays(-30);
        var recentItemsQ = db.OrderItems.Include(i => i.Order)
            .Where(i => i.Order != null && i.Order.CreatedAt >= recentSaleStart && i.Order.PaymentStatus == "paid");
        if (branchId.HasValue) recentItemsQ = recentItemsQ.Where(i => i.Order!.BranchId == branchId);
        var recentlySoldProductIds = (await recentItemsQ.Select(i => i.ProductId).Distinct().ToListAsync()).ToHashSet();

        var stockQ = db.InventoryStocks.Include(s => s.Product).Where(s => s.Quantity > 0);
        if (branchId.HasValue) stockQ = stockQ.Where(s => s.BranchId == branchId);
        var stockRows = await stockQ.Select(s => new { s.ProductId, Name = s.Product!.Name, s.Quantity }).ToListAsync();
        var slowMovers = stockRows
            .Where(s => !recentlySoldProductIds.Contains(s.ProductId))
            .GroupBy(s => s.ProductId)
            .Select(g => new { productName = g.First().Name, stockQty = g.Sum(x => x.Quantity) })
            .OrderByDescending(x => x.stockQty)
            .Take(5)
            .ToList();

        // Expiry loss this month — real write-offs whose reason is "expired" (mirrors the Waste &
        // Spoilage report's own "only value that actually left inventory" rule).
        var expiredQ = db.InventoryAdjustments.Include(a => a.Product).ThenInclude(p => p!.Category)
            .Where(a => a.AdjustmentType == "expired" && (a.ApprovalStatus == null || a.ApprovalStatus == "approved") && a.CreatedAt >= monthStart);
        if (branchId.HasValue) expiredQ = expiredQ.Where(a => a.BranchId == branchId);
        var expiredRows = await expiredQ.Select(a => new
        {
            Category = a.Product != null && a.Product.Category != null ? a.Product.Category.Name : "Other",
            Value = a.Quantity * (a.Product!.CostPrice ?? a.Product.BasePrice),
        }).ToListAsync();
        var expiryLossByCategory = expiredRows.GroupBy(x => x.Category)
            .Select(g => new { category = g.Key, value = g.Sum(x => x.Value) })
            .OrderByDescending(x => x.value)
            .ToList();

        // Warehouse insights — this week
        var poReceivedQ = db.PurchaseOrderItems.Include(i => i.PurchaseOrder)
            .Where(i => i.PurchaseOrder != null && i.PurchaseOrder.ReceivedDate != null && i.PurchaseOrder.ReceivedDate >= weekStart);
        if (branchId.HasValue) poReceivedQ = poReceivedQ.Where(i => i.PurchaseOrder!.BranchId == branchId);
        var poInbound = await poReceivedQ.SumAsync(i => (decimal?)i.ReceivedQuantity) ?? 0m;

        var transferReceivedQ = db.StockTransferItems.Include(i => i.Transfer)
            .Where(i => i.Transfer != null && i.Transfer.CompletedDate != null && i.Transfer.CompletedDate >= weekStart);
        if (branchId.HasValue) transferReceivedQ = transferReceivedQ.Where(i => i.Transfer!.DestBranchId == branchId);
        var transferInbound = await transferReceivedQ.SumAsync(i => (decimal?)i.ReceivedQuantity) ?? 0m;

        var weekOutboundQ = db.OrderItems.Include(i => i.Order)
            .Where(i => i.Order != null && i.Order.CreatedAt >= weekStart && i.Order.PaymentStatus == "paid");
        if (branchId.HasValue) weekOutboundQ = weekOutboundQ.Where(i => i.Order!.BranchId == branchId);
        var outboundUnits = await weekOutboundQ.SumAsync(i => (int?)i.Quantity) ?? 0;

        var transfersThisWeekQ = db.StockTransfers.Where(t => t.Status == "completed" && t.CompletedDate != null && t.CompletedDate >= weekStart);
        if (branchId.HasValue) transfersThisWeekQ = transfersThisWeekQ.Where(t => t.DestBranchId == branchId || t.SourceBranchId == branchId);
        var transfersCount = await transfersThisWeekQ.CountAsync();

        var adjustmentsThisWeekQ = db.InventoryAdjustments.Where(a => a.CreatedAt >= weekStart);
        if (branchId.HasValue) adjustmentsThisWeekQ = adjustmentsThisWeekQ.Where(a => a.BranchId == branchId);
        var adjustmentsCount = await adjustmentsThisWeekQ.CountAsync();

        // Turnover — COGS of units sold this month ÷ current inventory value at cost. Current
        // value stands in for "average inventory" since there are no historical stock snapshots
        // (same approximation the Inventory Dashboard report uses).
        var monthCogsQ = db.OrderItems.Include(i => i.Order).Include(i => i.Product)
            .Where(i => i.Order != null && i.Order.CreatedAt >= monthStart && i.Order.PaymentStatus == "paid");
        if (branchId.HasValue) monthCogsQ = monthCogsQ.Where(i => i.Order!.BranchId == branchId);
        var monthCogs = await monthCogsQ.SumAsync(i => (decimal?)(i.Quantity * (i.Product!.CostPrice ?? 0m))) ?? 0m;

        var stockValueQ = db.InventoryStocks.Include(s => s.Product).Where(s => s.Quantity > 0);
        if (branchId.HasValue) stockValueQ = stockValueQ.Where(s => s.BranchId == branchId);
        var stockValue = await stockValueQ.SumAsync(s => (decimal?)(s.Quantity * (s.Product!.CostPrice ?? 0m))) ?? 0m;
        var turnover = stockValue > 0 ? Math.Round(monthCogs / stockValue, 2) : 0m;

        return Ok(new
        {
            salesTrend,
            bestSellers = bestSellersOut,
            slowMovers,
            expiryLoss = new { total = expiredRows.Sum(x => x.Value), byCategory = expiryLossByCategory },
            warehouse = new
            {
                inboundUnits = poInbound + transferInbound,
                outboundUnits,
                transfersCount,
                adjustmentsCount,
                turnover,
            },
        });
    }

    // ───────────────────────────────────────────────────────────────────────
    // 2. Monthly Sales (RPT-SALES-MONTHLY)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("monthly-sales")]
    [RequirePermission("Reports", PermAction.View)]
    public async Task<IActionResult> GetMonthlySales(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId,
        [FromQuery] Guid? categoryId, [FromQuery] Guid? cashierId, [FromQuery] Guid? terminalId,
        [FromQuery] Guid? productId, [FromQuery] bool hasTobaccoFee = false, [FromQuery] bool comparePrevious = false)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });

        var result = await BuildMonthlySalesAsync(rangeFrom, rangeTo, branchId, categoryId, cashierId, terminalId, productId, hasTobaccoFee, comparePrevious);
        if (!await CanViewFinanceAsync()) MaskMonthlySalesMargin(result);
        return Ok(result);
    }

    [HttpGet("monthly-sales/export")]
    [RequirePermission("Reports", PermAction.Export)]
    public async Task<IActionResult> ExportMonthlySales(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId,
        [FromQuery] Guid? categoryId, [FromQuery] Guid? cashierId, [FromQuery] Guid? terminalId,
        [FromQuery] Guid? productId, [FromQuery] bool hasTobaccoFee = false,
        [FromQuery] bool comparePrevious = false, [FromQuery] Guid? exportedBy = null,
        [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });

        var result = await BuildMonthlySalesAsync(rangeFrom, rangeTo, branchId, categoryId, cashierId, terminalId, productId, hasTobaccoFee, comparePrevious);

        // Cost/margin visibility is resolved server-side from the caller's actual "Accounting & Finance"
        // permission (FRD §6.1 column masking) rather than trusting a client-supplied flag.
        var includeMargin = await CanViewFinanceAsync();
        if (!includeMargin) MaskMonthlySalesMargin(result);
        var headers = includeMargin
            ? new[] { "Date", "Transactions", "Gross Sales", "Discounts", "Returns", "Net Sales", "VAT", "Tobacco Fees", "COGS", "Gross Profit", "Margin %", "Avg Basket", "Previous Period Sales", "Growth %" }
            : new[] { "Date", "Transactions", "Gross Sales", "Discounts", "Returns", "Net Sales", "VAT", "Tobacco Fees", "Avg Basket", "Previous Period Sales", "Growth %" };
        var rows = result.Daily.Select(d => includeMargin
            ? new object?[]
            {
                d.Date.ToString("yyyy-MM-dd"), d.Transactions, d.GrossSales, d.Discounts, d.Returns, d.NetSales, d.Vat, d.TobaccoFees, d.Cogs, d.GrossProfit,
                d.MarginPct?.ToString("0.0") ?? "N/A", d.AvgBasket, d.PreviousPeriodSales, d.GrowthPct,
            }
            : new object?[]
            {
                d.Date.ToString("yyyy-MM-dd"), d.Transactions, d.GrossSales, d.Discounts, d.Returns, d.NetSales, d.Vat, d.TobaccoFees, d.AvgBasket, d.PreviousPeriodSales, d.GrowthPct,
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
        kpis.Add(("Tobacco Fees", result.Kpis.TobaccoFees.ToString("0.##")));
        return await BuildExportFile(format, "Monthly Sales Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis.ToArray(), headers, rows, $"monthly-sales-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private static void MaskMonthlySalesMargin(MonthlySalesResult r)
    {
        r.Kpis.GrossProfit = 0; r.Kpis.MarginPct = null;
        foreach (var d in r.Daily) { d.Cogs = 0; d.GrossProfit = 0; d.MarginPct = null; }
    }

    private async Task<MonthlySalesResult> BuildMonthlySalesAsync(
        DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, Guid? categoryId,
        Guid? cashierId, Guid? terminalId, Guid? productId, bool hasTobaccoFee, bool comparePrevious)
    {
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) branchId = scopeBranchId;
        var days = (int)(rangeToExclusive - rangeFrom).TotalDays;

        var current = await LoadDailyLineItemsAsync(rangeFrom, rangeToExclusive, branchId, categoryId, cashierId, terminalId, productId, hasTobaccoFee);

        List<(DateOnly Date, decimal NetSales)> previous = [];
        if (comparePrevious)
        {
            var prevTo = rangeFrom;
            var prevFrom = prevTo.AddDays(-days);
            var prevRows = await LoadDailyLineItemsAsync(prevFrom, prevTo, branchId, categoryId, cashierId, terminalId, productId, hasTobaccoFee);
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
                TobaccoFees = d.TobaccoFees,
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
                TobaccoFees = daily.Sum(d => d.TobaccoFees),
            },
            Daily = daily,
        };
    }

    /// <summary>Aggregates order-line-level sales per calendar day in [from, toExclusive), materialized
    /// in memory so category filtering and per-day distinct order counts work reliably across providers.</summary>
    private async Task<List<DailyLineAgg>> LoadDailyLineItemsAsync(
        DateTime from, DateTime toExclusive, Guid? branchId, Guid? categoryId,
        Guid? cashierId = null, Guid? terminalId = null, Guid? productId = null, bool hasTobaccoFee = false)
    {
        var itemsQ = db.OrderItems
            .Include(i => i.Order)
            .Include(i => i.Product)
            .Where(i => i.Order != null && i.Order.CreatedAt >= from && i.Order.CreatedAt < toExclusive && i.Order.PaymentStatus == "paid");
        if (branchId.HasValue) itemsQ = itemsQ.Where(i => i.Order!.BranchId == branchId);
        if (categoryId.HasValue) itemsQ = itemsQ.Where(i => i.Product != null && i.Product.CategoryId == categoryId);
        if (cashierId.HasValue) itemsQ = itemsQ.Where(i => i.Order!.CashierId == cashierId);
        if (terminalId.HasValue) itemsQ = itemsQ.Where(i => i.Order!.TerminalId == terminalId);
        if (productId.HasValue) itemsQ = itemsQ.Where(i => i.ProductId == productId);
        if (hasTobaccoFee) itemsQ = itemsQ.Where(i => i.TobaccoFeeAmount > 0);

        var rawItems = await itemsQ
            .Select(i => new
            {
                Date = i.Order!.CreatedAt.Date,
                OrderId = i.OrderId,
                Gross = i.UnitPrice * i.Quantity,
                i.DiscountAmount,
                OrderDiscountAmount = i.Order!.DiscountAmount,
                i.TaxAmount,
                OrderTaxAmount = i.Order!.TaxAmount,
                i.TobaccoFeeAmount,
                Cogs = i.Quantity * (i.Product!.CostPrice ?? 0m),
            })
            .ToListAsync();

        // A line-level filter (category/product/cashier/terminal) can select only some of an
        // order's items, so the order's own TaxAmount can't be attributed to that subset — VAT
        // for a filtered report still has to sum the (independently rounded) per-item TaxAmount.
        // Unfiltered, though, every item of every matching order is present, so summing
        // OrderTaxAmount once per distinct order matches the single order-level rounding Orders
        // and ZATCA invoices use, instead of drifting by rounding each line separately and adding
        // the pieces back up (visible as a ±0.01 SAR gap against the Orders/ZATCA total for the
        // same transaction).
        var isLineFiltered = categoryId.HasValue || cashierId.HasValue || terminalId.HasValue || productId.HasValue || hasTobaccoFee;

        var returnsQ = db.CustomerReturnItems
            .Include(ri => ri.Return)
            .Include(ri => ri.Product)
            .Where(ri => ri.Return != null && ri.Return.CreatedAt >= from && ri.Return.CreatedAt < toExclusive);
        if (branchId.HasValue) returnsQ = returnsQ.Where(ri => ri.Return!.BranchId == branchId);
        if (categoryId.HasValue) returnsQ = returnsQ.Where(ri => ri.Product != null && ri.Product.CategoryId == categoryId);
        // Returns follow the same line-level filters as sales, so a filtered report never nets a
        // refund for a product/cashier/terminal whose sale was excluded from Gross in the first place.
        if (productId.HasValue) returnsQ = returnsQ.Where(ri => ri.ProductId == productId);
        if (cashierId.HasValue) returnsQ = returnsQ.Where(ri => ri.Return!.ProcessedBy == cashierId);
        if (hasTobaccoFee) returnsQ = returnsQ.Where(ri => ri.Product != null && ri.Product.IsTobacco);

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
            // Mirrors the VAT logic below: OrderItem.DiscountAmount is only proportionally
            // allocated for orders created after that allocation was added, so historical rows
            // (and any order the allocation didn't touch) still sit at 0 there even though
            // Order.DiscountAmount is correctly populated. Unfiltered, every item of every
            // matching order is present, so summing the header amount once per distinct order is
            // both correct and immune to that gap; a line-level filter still has to fall back to
            // the per-item figure since only some of an order's items may be selected.
            var discounts = isLineFiltered
                ? items.Sum(x => x.DiscountAmount)
                : items.DistinctBy(x => x.OrderId).Sum(x => x.OrderDiscountAmount);
            var returnValue = returns.Sum(x => x.RefundAmount);
            var vat = isLineFiltered
                ? items.Sum(x => x.TaxAmount)
                : items.DistinctBy(x => x.OrderId).Sum(x => x.OrderTaxAmount);
            result.Add(new DailyLineAgg
            {
                Transactions = items.Select(x => x.OrderId).Distinct().Count(),
                GrossSales = gross,
                Discounts = discounts,
                Returns = returnValue,
                NetSales = gross - discounts - returnValue,
                Vat = vat,
                Cogs = items.Sum(x => x.Cogs),
                TobaccoFees = items.Sum(x => x.TobaccoFeeAmount),
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
        // See CanViewReportOrSelfAsync — a Cashier with no "Reports" permission can still call
        // this scoped to their own cashierId ("My Shift Report"); anyone else needs the real
        // permission.
        if (!await CanViewReportOrSelfAsync(cashierId))
            return StatusCode(403, new { message = "You do not have permission to view Reports." });

        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: false);
        if (error != null) return BadRequest(new { message = error });

        var result = await BuildCashierSalesAsync(rangeFrom, rangeTo, branchId, cashierId, terminalId);
        return Ok(result);
    }

    [HttpGet("cashier-sales/export")]
    [RequirePermission("Reports", PermAction.Export)]
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
        return await BuildExportFile(format, "Cashier Sales Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"cashier-sales-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<CashierSalesResult> BuildCashierSalesAsync(
        DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, Guid? cashierId, Guid? terminalId)
    {
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) branchId = scopeBranchId;
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
    [RequirePermission("Reports", PermAction.View)]
    public async Task<IActionResult> GetPaymentMethods(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId,
        [FromQuery] Guid? terminalId, [FromQuery] Guid? cashierId, [FromQuery] string? paymentMethod,
        [FromQuery] bool hasTobaccoFee = false)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: false);
        if (error != null) return BadRequest(new { message = error });

        var result = await BuildPaymentMethodsAsync(rangeFrom, rangeTo, branchId, terminalId, cashierId, paymentMethod, hasTobaccoFee);
        return Ok(result);
    }

    [HttpGet("payment-methods/export")]
    [RequirePermission("Reports", PermAction.Export)]
    public async Task<IActionResult> ExportPaymentMethods(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId,
        [FromQuery] Guid? terminalId, [FromQuery] Guid? cashierId, [FromQuery] string? paymentMethod,
        [FromQuery] bool hasTobaccoFee = false, [FromQuery] Guid? exportedBy = null,
        [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: false);
        if (error != null) return BadRequest(new { message = error });

        var result = await BuildPaymentMethodsAsync(rangeFrom, rangeTo, branchId, terminalId, cashierId, paymentMethod, hasTobaccoFee);
        var headers = new[] { "Payment Method", "Branch", "Transactions", "Gross Amount", "Net Settled", "Pending Amount", "Status" };
        var rows = result.Rows.Select(r => new object?[] { r.Method, r.Branch, r.Transactions, r.GrossAmount, r.NetSettled, r.PendingAmount, r.Status }).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"payment-methods\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Cash Collected", result.Kpis.CashCollected.ToString("0.##")), ("Card Settled", result.Kpis.CardSettled.ToString("0.##")),
            ("Wallet Amount", result.Kpis.WalletAmount.ToString("0.##")), ("Refund Value", result.Kpis.RefundValue.ToString("0.##")),
            ("Payment Fees", result.Kpis.PaymentFees.ToString("0.##")), ("Tobacco Fees", result.Kpis.TobaccoFees.ToString("0.##")),
        };
        return await BuildExportFile(format, "Payment Methods Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"payment-methods-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<PaymentMethodsResult> BuildPaymentMethodsAsync(
        DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, Guid? terminalId, Guid? cashierId, string? paymentMethod,
        bool hasTobaccoFee = false)
    {
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) branchId = scopeBranchId;
        var paymentsQ = db.OrderPayments
            .Include(p => p.Order).ThenInclude(o => o!.Branch)
            .Where(p => p.Order != null && p.CreatedAt >= rangeFrom && p.CreatedAt < rangeToExclusive);
        if (branchId.HasValue) paymentsQ = paymentsQ.Where(p => p.Order!.BranchId == branchId);
        if (terminalId.HasValue) paymentsQ = paymentsQ.Where(p => p.Order!.TerminalId == terminalId);
        if (cashierId.HasValue) paymentsQ = paymentsQ.Where(p => p.Order!.CashierId == cashierId);
        if (!string.IsNullOrEmpty(paymentMethod)) paymentsQ = paymentsQ.Where(p => p.PaymentMethod == paymentMethod);
        // "Tobacco only" narrows to payments settling an order that carried excise — the payment row
        // itself has no tobacco dimension, so it's filtered via its parent order.
        if (hasTobaccoFee) paymentsQ = paymentsQ.Where(p => p.Order!.TobaccoFeeAmount > 0);

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
        if (cashierId.HasValue) returnsQ = returnsQ.Where(r => r.ProcessedBy == cashierId);
        if (hasTobaccoFee) returnsQ = returnsQ.Where(r => r.Order != null && r.Order.TobaccoFeeAmount > 0);
        var refunds = await returnsQ
            .GroupBy(r => r.RefundMethod)
            .Select(g => new RefundMethodRow { Method = g.Key, Amount = g.Sum(r => r.RefundAmount) })
            .ToListAsync();

        // Payment Fees KPI (FRD §7.16) — custom/service fees are recorded on the order, not the payment row.
        // Tobacco excise is likewise an order-level amount, so both are summed off the same query.
        var feesQ = db.Orders.Where(o => o.CreatedAt >= rangeFrom && o.CreatedAt < rangeToExclusive && o.PaymentStatus == "paid");
        if (branchId.HasValue) feesQ = feesQ.Where(o => o.BranchId == branchId);
        if (terminalId.HasValue) feesQ = feesQ.Where(o => o.TerminalId == terminalId);
        if (cashierId.HasValue) feesQ = feesQ.Where(o => o.CashierId == cashierId);
        if (hasTobaccoFee) feesQ = feesQ.Where(o => o.TobaccoFeeAmount > 0);
        var totalFees = await feesQ.SumAsync(o => o.CustomFeeAmount);
        var totalTobaccoFees = await feesQ.SumAsync(o => o.TobaccoFeeAmount);

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
                TobaccoFees = totalTobaccoFees,
            },
            Rows = rows,
            Refunds = refunds,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 5. Low Stock / Inventory Snapshot (RPT-INVENTORY-LOW-STOCK / RPT-INVENTORY-SNAPSHOT)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("low-stock")]
    [RequirePermission("Reports", PermAction.View)]
    public async Task<IActionResult> GetLowStock(
        [FromQuery] Guid[]? branchId, [FromQuery] Guid[]? categoryId, [FromQuery] Guid[]? productId,
        [FromQuery] bool isTobacco = false, [FromQuery] bool onlyLowStock = true)
    {
        var result = await BuildLowStockAsync(branchId ?? [], categoryId ?? [], productId ?? [], isTobacco, onlyLowStock);
        return Ok(result);
    }

    [HttpGet("low-stock/export")]
    [RequirePermission("Reports", PermAction.Export)]
    public async Task<IActionResult> ExportLowStock(
        [FromQuery] Guid[]? branchId, [FromQuery] Guid[]? categoryId, [FromQuery] Guid[]? productId,
        [FromQuery] bool isTobacco = false, [FromQuery] bool onlyLowStock = true, [FromQuery] Guid? exportedBy = null,
        [FromQuery] string? format = "csv")
    {
        var result = await BuildLowStockAsync(branchId ?? [], categoryId ?? [], productId ?? [], isTobacco, onlyLowStock);
        var headers = new[] { "SKU", "Product Name", "Category", "Branch", "Tobacco", "Available Qty", "Reorder Level", "Recommended Reorder Qty", "Preferred Supplier", "Last Sold Date", "Urgency" };
        var rows = result.Rows.Select(r => new object?[]
        {
            r.Sku, r.ProductName, r.Category, r.Branch, r.IsTobacco ? "Yes" : "No", r.AvailableQty, r.ReorderLevel, r.RecommendedReorderQty, r.PreferredSupplier, r.LastSoldDate, r.Urgency,
        }).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, FirstBranchOrNull(branchId),
            $"{{\"report\":\"low-stock\",\"onlyLowStock\":{onlyLowStock.ToString().ToLowerInvariant()},\"rows\":{result.Rows.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Low Stock SKUs", result.Kpis.LowStockSkus.ToString()), ("Critical SKUs", result.Kpis.CriticalSkus.ToString()),
            ("Out of Stock", result.Kpis.OutOfStockSkus.ToString()), ("Est. Reorder Value", result.Kpis.EstimatedReorderValue.ToString("0.##")),
            ("Suppliers to Contact", result.Kpis.SuppliersToContact.ToString()),
        };
        return await BuildExportFile(format, "Low Stock Report", onlyLowStock ? "Below reorder threshold only" : "All stock",
            kpis, headers, rows, $"low-stock-{DateTime.UtcNow:yyyy-MM-dd}");
    }

    private async Task<LowStockResult> BuildLowStockAsync(Guid[] branchIds, Guid[] categoryIds, Guid[] productIds, bool isTobacco, bool onlyLowStock)
    {
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) branchIds = [scopeBranchId.Value];

        // Branch/category/product are narrowed in-memory below, not via SQL .Contains(...) — the
        // MySQL EF Core provider used here cannot assign a type mapping to a parameterized Guid[]
        // IN-list, which throws at query time (see the ef-mysql-inlist-gotcha memory).
        var stockQ = db.InventoryStocks
            .Include(s => s.Product).ThenInclude(p => p!.Category)
            .Include(s => s.Branch)
            .Where(s => s.Product != null && s.Branch != null);
        if (isTobacco) stockQ = stockQ.Where(s => s.Product!.IsTobacco);

        var stocks = await stockQ.ToListAsync();
        if (branchIds.Length > 0) stocks = [.. stocks.Where(s => branchIds.Contains(s.BranchId))];
        if (categoryIds.Length > 0) stocks = [.. stocks.Where(s => s.Product!.CategoryId.HasValue && categoryIds.Contains(s.Product!.CategoryId!.Value))];
        if (productIds.Length > 0) stocks = [.. stocks.Where(s => productIds.Contains(s.ProductId))];

        var withAvailability = stocks
            .Select(s => new { Stock = s, Available = s.Quantity - s.ReservedQuantity })
            .Where(x => !onlyLowStock || x.Available <= x.Stock.ReorderLevel)
            .ToList();

        var productIdSet = withAvailability.Select(x => x.Stock.ProductId).ToHashSet();
        var branchIdSet = withAvailability.Select(x => x.Stock.BranchId).ToHashSet();

        // Best-effort "preferred supplier" = most recently received batch's supplier for that
        // product+branch. Fetched with only the tobacco filter at the SQL level, then narrowed
        // in-memory the same way as stockQ above, for the same IN-list reason.
        var batchesQ = db.InventoryBatches.Include(b => b.Product).Include(b => b.Supplier).Where(b => b.Supplier != null);
        if (isTobacco) batchesQ = batchesQ.Where(b => b.Product != null && b.Product.IsTobacco);
        var latestBatches = await batchesQ
            .OrderByDescending(b => b.ReceivedDate)
            .Select(b => new { b.ProductId, b.BranchId, SupplierName = b.Supplier!.Name })
            .ToListAsync();
        var supplierMap = latestBatches
            .Where(b => productIdSet.Contains(b.ProductId) && b.BranchId.HasValue && branchIdSet.Contains(b.BranchId.Value))
            .GroupBy(b => (b.ProductId, BranchId: b.BranchId!.Value))
            .ToDictionary(g => g.Key, g => g.First().SupplierName);

        var lastSoldQ = db.OrderItems.Include(i => i.Order).Include(i => i.Product).Where(i => i.Order != null);
        if (isTobacco) lastSoldQ = lastSoldQ.Where(i => i.Product != null && i.Product.IsTobacco);
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
                IsTobacco = s.Product.IsTobacco,
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
    [RequirePermission("Reports", PermAction.View)]
    public async Task<IActionResult> GetInventorySnapshot(
        [FromQuery] Guid[]? branchId, [FromQuery] Guid[]? categoryId, [FromQuery] Guid[]? productId, [FromQuery] bool isTobacco = false,
        [FromQuery] Guid[]? warehouseId = null, [FromQuery] string? locationType = null)
    {
        var result = await BuildInventorySnapshotFilteredAsync(branchId ?? [], categoryId ?? [], productId ?? [], isTobacco, warehouseId ?? [], locationType);
        if (!await CanViewFinanceAsync()) MaskInventorySnapshotCost(result);
        return Ok(result);
    }

    // Multi-select wrapper: BuildInventorySnapshotAsync's own two-pool/scope logic stays single-
    // value (it's shared by the dashboard and product-performance builders too, and its
    // scope-resolution is delicate) — this calls it unfiltered by id lists, then narrows to the
    // requested branch/warehouse/category/product ids in memory and recomputes Kpis from the
    // narrowed set. Never via SQL .Contains(...) — the MySQL EF Core provider throws on a
    // parameterized Guid[] IN-list (see the ef-mysql-inlist-gotcha memory).
    private async Task<InventorySnapshotResult> BuildInventorySnapshotFilteredAsync(
        Guid[] branchIds, Guid[] categoryIds, Guid[] productIds, bool isTobacco, Guid[] warehouseIds, string? locationType)
    {
        var full = await BuildInventorySnapshotAsync(null, null, null, isTobacco, null, locationType);
        var rows = await FilterSnapshotRowsAsync(full.Rows, branchIds, warehouseIds, categoryIds, productIds);
        rows = [.. rows.OrderByDescending(r => r.StockCostValue)];
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
            SnapshotAt = full.SnapshotAt,
        };
    }

    // Shared by the snapshot report and the dashboard's own multi-select narrowing — a branch
    // selection also narrows the warehouse pool to warehouses linked to any of the selected
    // branches, mirroring BuildInventorySnapshotAsync's single-value behavior (branchId narrows
    // both pools via BranchWarehouse) so multi-select doesn't quietly change what "select a branch"
    // means for a caller who never touches the warehouse filter.
    private async Task<List<InventorySnapshotRow>> FilterSnapshotRowsAsync(
        List<InventorySnapshotRow> rows, Guid[] branchIds, Guid[] warehouseIds, Guid[] categoryIds, Guid[] productIds)
    {
        if (branchIds.Length == 0 && warehouseIds.Length == 0 && categoryIds.Length == 0 && productIds.Length == 0)
            return rows;

        HashSet<Guid>? linkedWarehouseIds = null;
        if (branchIds.Length > 0 && warehouseIds.Length == 0)
        {
            var allBw = await db.BranchWarehouses.ToListAsync();
            linkedWarehouseIds = [.. allBw.Where(bw => branchIds.Contains(bw.BranchId)).Select(bw => bw.WarehouseId)];
        }

        Dictionary<Guid, Guid?>? productCategoryIds = categoryIds.Length > 0
            ? await db.Products.Select(p => new { p.Id, p.CategoryId }).ToDictionaryAsync(p => p.Id, p => p.CategoryId)
            : null;

        // A warehouse-only selection (warehouses picked, no branch picked) means the caller wants
        // just those warehouses' stock - branch rows must not leak through via the "no branch
        // filter set" fallback below, or a Warehouse filter silently returns every branch too.
        var warehouseOnlySelection = warehouseIds.Length > 0 && branchIds.Length == 0;

        return [.. rows.Where(r =>
            (warehouseOnlySelection
                ? r.LocationType != "branch"
                : (branchIds.Length == 0 || r.LocationType != "branch" || branchIds.Contains(r.LocationId)))
            && (warehouseIds.Length > 0
                ? (r.LocationType != "warehouse" || warehouseIds.Contains(r.LocationId))
                : (linkedWarehouseIds == null || r.LocationType != "warehouse" || linkedWarehouseIds.Contains(r.LocationId)))
            && (productCategoryIds == null || (productCategoryIds.TryGetValue(r.ProductId, out var cid) && cid.HasValue && categoryIds.Contains(cid.Value)))
            && (productIds.Length == 0 || productIds.Contains(r.ProductId)))];
    }

    /// <summary>
    /// Tells the client which pools and filters this caller may use, so the UI can render the right
    /// controls instead of guessing from the role string. Without this the frontend would need its
    /// own copy of the scoping rules — and `AuthUser` has no warehouse field to base one on.
    /// </summary>
    [HttpGet("inventory-snapshot/scope")]
    [RequirePermission("Reports", PermAction.View)]
    public async Task<IActionResult> GetInventorySnapshotScope()
    {
        var scope = ResolveInventoryScope();
        var warehouseQ = db.Warehouses.AsQueryable();
        if (scope.WarehouseScopeBranchId is { } wsb)
            warehouseQ = warehouseQ.Where(w => db.BranchWarehouses.Any(bw => bw.BranchId == wsb && bw.WarehouseId == w.Id));
        var warehouses = scope.IncludeWarehouseStock
            ? await warehouseQ.OrderBy(w => w.Name).Select(w => new { w.Id, w.Name }).ToListAsync()
            : [];
        return Ok(new
        {
            canFilterBranch = scope.IncludeBranchStock,
            canFilterWarehouse = scope.IncludeWarehouseStock,
            forcedBranchId = scope.ForcedBranchId,
            warehouses,
        });
    }

    [HttpGet("inventory-snapshot/export")]
    [RequirePermission("Reports", PermAction.Export)]
    public async Task<IActionResult> ExportInventorySnapshot(
        [FromQuery] Guid[]? branchId, [FromQuery] Guid[]? categoryId, [FromQuery] Guid[]? productId, [FromQuery] bool isTobacco = false,
        [FromQuery] Guid? exportedBy = null, [FromQuery] string? format = "csv",
        [FromQuery] Guid[]? warehouseId = null, [FromQuery] string? locationType = null)
    {
        var result = await BuildInventorySnapshotFilteredAsync(branchId ?? [], categoryId ?? [], productId ?? [], isTobacco, warehouseId ?? [], locationType);
        var includeCost = await CanViewFinanceAsync();
        if (!includeCost) MaskInventorySnapshotCost(result);
        var headers = includeCost
            ? new[] { "SKU", "Product Name", "Category", "Location", "Location Type", "Tobacco", "On Hand Qty", "Reserved Qty", "Available Qty", "Reorder Level", "Cost Price", "Stock Cost Value", "Retail Value", "Last Movement Date", "Stock Status" }
            : new[] { "SKU", "Product Name", "Category", "Location", "Location Type", "Tobacco", "On Hand Qty", "Reserved Qty", "Available Qty", "Reorder Level", "Retail Value", "Last Movement Date", "Stock Status" };
        var rows = result.Rows.Select(r => includeCost
            ? new object?[]
              {
                  r.Sku, r.ProductName, r.Category, r.Location, r.LocationType, r.IsTobacco ? "Yes" : "No", r.OnHandQty, r.ReservedQty, r.AvailableQty, r.ReorderLevel,
                  r.CostPrice, r.StockCostValue, r.RetailValue, r.LastMovementDate, r.StockStatus,
              }
            : new object?[]
              {
                  r.Sku, r.ProductName, r.Category, r.Location, r.LocationType, r.IsTobacco ? "Yes" : "No", r.OnHandQty, r.ReservedQty, r.AvailableQty, r.ReorderLevel,
                  r.RetailValue, r.LastMovementDate, r.StockStatus,
              }
        ).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, FirstBranchOrNull(branchId),
            $"{{\"report\":\"inventory-snapshot\",\"rows\":{result.Rows.Count}}}");
        var kpis = new List<(string, string)>();
        if (includeCost) kpis.Add(("Total Stock Value", result.Kpis.TotalStockValue.ToString("0.##")));
        kpis.Add(("SKU Count", result.Kpis.SkuCount.ToString()));
        kpis.Add(("Available Qty", result.Kpis.AvailableQty.ToString("0.##")));
        kpis.Add(("Reserved Qty", result.Kpis.ReservedQty.ToString("0.##")));
        kpis.Add(("Out of Stock SKUs", result.Kpis.OutOfStockSkus.ToString()));
        kpis.Add(("Negative Stock Exceptions", result.Kpis.NegativeStockExceptions.ToString()));
        return await BuildExportFile(format, "Inventory Snapshot Report", $"Snapshot as of {result.SnapshotAt:yyyy-MM-dd HH:mm} UTC", kpis.ToArray(), headers, rows, $"inventory-snapshot-{DateTime.UtcNow:yyyy-MM-dd}");
    }

    private static void MaskInventorySnapshotCost(InventorySnapshotResult r)
    {
        r.Kpis.TotalStockValue = 0;
        foreach (var row in r.Rows) { row.CostPrice = 0; row.StockCostValue = 0; }
    }

    private async Task<InventorySnapshotResult> BuildInventorySnapshotAsync(
        Guid? branchId, Guid? categoryId, Guid? productId = null, bool isTobacco = false,
        Guid? warehouseId = null, string? locationType = null)
    {
        var scope = ResolveInventoryScope();
        if (scope.ForcedBranchId.HasValue) branchId = scope.ForcedBranchId;

        // An explicit warehouseId means "only that warehouse", which is a warehouse-pool question —
        // asking for it must not also return every branch row. Same for the explicit locationType
        // tab. Scope wins over both: a branch user passing ?warehouseId= still gets nothing from a
        // pool they can't see, rather than a filter that quietly widens their access.
        var wantBranch = scope.IncludeBranchStock && locationType != "warehouse" && !warehouseId.HasValue;
        var wantWarehouse = scope.IncludeWarehouseStock && locationType != "branch";

        var rows = new List<InventorySnapshotRow>();

        if (wantBranch)
        {
            var stockQ = db.InventoryStocks
                .Include(s => s.Product).ThenInclude(p => p!.Category)
                .Include(s => s.Branch)
                .Where(s => s.Product != null && s.Branch != null);
            if (branchId.HasValue) stockQ = stockQ.Where(s => s.BranchId == branchId);
            if (categoryId.HasValue) stockQ = stockQ.Where(s => s.Product!.CategoryId == categoryId);
            if (productId.HasValue) stockQ = stockQ.Where(s => s.ProductId == productId);
            if (isTobacco) stockQ = stockQ.Where(s => s.Product!.IsTobacco);

            // LastUpdated is a proxy for "last movement" — the stock row records when it last
            // changed, not why. stock_movements has the real history but only since the ledger
            // shipped, so joining it would regress this column for older rows.
            rows.AddRange((await stockQ.ToListAsync()).Select(s => BuildSnapshotRow(
                s.Product!, "branch", s.Branch!.Name, s.Branch.Id,
                s.Quantity, s.ReservedQuantity, s.ReorderLevel, s.LastUpdated)));
        }

        if (wantWarehouse)
        {
            var whQ = db.WarehouseStocks
                .Include(s => s.Product).ThenInclude(p => p!.Category)
                .Include(s => s.Warehouse)
                .Where(s => s.Product != null && s.Warehouse != null);
            if (warehouseId.HasValue) whQ = whQ.Where(s => s.WarehouseId == warehouseId);
            // Correlated EXISTS rather than an id list — see InventoryScope.WarehouseScopeBranchId.
            if (scope.WarehouseScopeBranchId is { } wsb)
                whQ = whQ.Where(s => db.BranchWarehouses.Any(bw => bw.BranchId == wsb && bw.WarehouseId == s.WarehouseId));
            // A branch filter narrows warehouses to those linked to that branch — branch_warehouses
            // is the only branch↔warehouse relation, and WarehouseStock itself has no BranchId.
            if (branchId.HasValue)
                whQ = whQ.Where(s => db.BranchWarehouses.Any(bw => bw.BranchId == branchId && bw.WarehouseId == s.WarehouseId));
            if (categoryId.HasValue) whQ = whQ.Where(s => s.Product!.CategoryId == categoryId);
            if (productId.HasValue) whQ = whQ.Where(s => s.ProductId == productId);
            if (isTobacco) whQ = whQ.Where(s => s.Product!.IsTobacco);

            rows.AddRange((await whQ.ToListAsync()).Select(s => BuildSnapshotRow(
                s.Product!, "warehouse", s.Warehouse!.Name, s.Warehouse.Id,
                s.Quantity, s.ReservedQuantity, s.ReorderLevel, s.LastUpdated)));
        }

        rows = [.. rows.OrderByDescending(r => r.StockCostValue)];

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

    // Shared by both pools so a branch row and a warehouse row can never disagree on how status,
    // availability or valuation are derived — InventoryStock and WarehouseStock are structurally
    // identical (quantity / reserved_quantity / reorder_level) but share no base type.
    private static InventorySnapshotRow BuildSnapshotRow(
        Models.Product product, string locationType, string locationName, Guid locationId,
        decimal quantity, decimal reserved, int reorderLevel, DateTime lastUpdated)
    {
        var available = quantity - reserved;
        var costPrice = product.CostPrice ?? product.BasePrice;
        var status = quantity < 0 ? "negative"
            : available <= 0 ? "out of stock"
            : available <= reorderLevel ? "low"
            : "in stock";
        return new InventorySnapshotRow
        {
            ProductId = product.Id,
            Sku = product.Sku,
            ProductName = product.Name,
            Category = product.Category?.Name ?? "—",
            LocationType = locationType,
            Location = locationName,
            LocationId = locationId,
            IsTobacco = product.IsTobacco,
            OnHandQty = quantity,
            ReservedQty = reserved,
            AvailableQty = available,
            ReorderLevel = reorderLevel,
            CostPrice = costPrice,
            StockCostValue = quantity * costPrice,
            RetailValue = quantity * product.BasePrice,
            LastMovementDate = lastUpdated,
            StockStatus = status,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 6b. Inventory Dashboard — KPIs (§2.6) + Aging (§2.7)
    //
    // Both sections read stock_movements, which is why they share an endpoint: turnover, top/slow
    // movers and days-since-last-movement are all the same scan.
    //
    // ⚠ The ledger only records movements written since it shipped. Anything older is genuinely
    // absent, so turnover and mover ranks understate until the ledger has a full period behind it.
    // Rather than present that as fact, the response carries a DataWindow the UI renders as a
    // caveat — a silently-low turnover number is worse than an explicitly-partial one.
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("inventory-dashboard")]
    [RequirePermission("Reports", PermAction.View)]
    public async Task<IActionResult> GetInventoryDashboard(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? branchId,
        [FromQuery] Guid[]? warehouseId, [FromQuery] Guid[]? categoryId, [FromQuery] string? locationType,
        // Product / Product Status / Classification / Age Bucket — the aging analysis is only
        // actionable once it can be narrowed to the SKUs an operator is actually chasing.
        [FromQuery] Guid[]? productId, [FromQuery] Guid[]? supplierId, [FromQuery] Guid[]? employeeId,
        [FromQuery] string[]? productStatus,
        [FromQuery] string[]? classification, [FromQuery] string[]? ageBucket,
        [FromQuery] int moverLimit = 10)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildInventoryDashboardAsync(rangeFrom, rangeTo, branchId ?? [], warehouseId ?? [], categoryId ?? [], locationType,
            productId ?? [], supplierId ?? [], employeeId ?? [], productStatus ?? [], classification ?? [], ageBucket ?? [], moverLimit);
        if (!await CanViewFinanceAsync())
        {
            result.Kpis.TotalStockValue = 0;
            result.Kpis.WastageValue = 0;
            result.DeadStockValue = 0;
            foreach (var b in result.Aging) b.StockValue = 0;
            foreach (var r in result.AgingRows) { r.StockValue = 0; r.GrossProfit = 0; r.MarginPct = null; }
        }
        return Ok(result);
    }

    private async Task<InventoryDashboardResult> BuildInventoryDashboardAsync(
        DateTime rangeFrom, DateTime rangeToExclusive, Guid[] branchIds, Guid[] warehouseIds,
        Guid[] categoryIds, string? locationType, Guid[] productIdFilters, Guid[] supplierIds, Guid[] employeeIds,
        string[] productStatuses, string[] classifications, string[] ageBuckets, int moverLimit)
    {
        var scope = ResolveInventoryScope();
        if (scope.ForcedBranchId.HasValue) { branchIds = [scope.ForcedBranchId.Value]; warehouseIds = []; }
        moverLimit = Math.Clamp(moverLimit, 1, 50);
        var hasLocationFilter = branchIds.Length > 0 || warehouseIds.Length > 0;

        // Reuse the snapshot builder so the dashboard's stock figures can never disagree with the
        // Inventory report's — same scoping, same two-pool union, same status ladder. Fetched
        // unfiltered by id lists (scope/tobacco/locationType only), then narrowed to the requested
        // branch/warehouse/category in memory — never via SQL .Contains(...) on a Guid[] (see the
        // ef-mysql-inlist-gotcha memory), which is why every sub-query below follows the same shape.
        var fullSnapshot = await BuildInventorySnapshotAsync(null, null, null, false, null, locationType);
        var snapshot = await FilterSnapshotRowsAsync(fullSnapshot.Rows, branchIds, warehouseIds, categoryIds, productIdFilters);

        // Product Status (active | inactive | discontinued) — the catalog state of the SKU, which
        // is what tells a deliberate discontinuation apart from stock that quietly stopped moving.
        var productStatusById = await db.Products.Select(p => new { p.Id, p.Status }).ToDictionaryAsync(p => p.Id, p => p.Status);
        if (productStatuses.Length > 0)
            snapshot = [.. snapshot.Where(r => productStatuses.Contains(productStatusById.GetValueOrDefault(r.ProductId) ?? "active"))];

        // Supplier filter: which products this supplier has ever supplied a batch of — resolved
        // from inventory_batches rather than Product itself (no direct Product→Supplier column;
        // supplier history lives at the batch/receiving level), same approach as Product
        // Performance's own supplier filter.
        if (supplierIds.Length > 0)
        {
            var supplierBatches = await db.InventoryBatches.Where(b => b.SupplierId != null)
                .Select(b => new { b.ProductId, b.SupplierId }).ToListAsync();
            var supplierMatchedProductIds = supplierBatches.Where(b => supplierIds.Contains(b.SupplierId!.Value)).Select(b => b.ProductId).ToHashSet();
            snapshot = [.. snapshot.Where(r => supplierMatchedProductIds.Contains(r.ProductId))];
        }

        // Employee filter: which products this employee moved (received, adjusted, transferred,
        // sold) during the period — resolved from the stock movement ledger's CreatedBy, since a
        // product itself has no owning employee.
        if (employeeIds.Length > 0)
        {
            var employeeMoves = await db.StockMovements
                .Where(m => m.CreatedBy != null && m.CreatedAt >= rangeFrom && m.CreatedAt < rangeToExclusive)
                .Select(m => new { m.ProductId, m.CreatedBy }).ToListAsync();
            var employeeMatchedProductIds = employeeMoves.Where(m => employeeIds.Contains(m.CreatedBy!.Value)).Select(m => m.ProductId).ToHashSet();
            snapshot = [.. snapshot.Where(r => employeeMatchedProductIds.Contains(r.ProductId))];
        }

        var ledgerStart = await db.StockMovements.OrderBy(m => m.CreatedAt).Select(m => (DateTime?)m.CreatedAt).FirstOrDefaultAsync();

        // Sales are the only movement type that represents genuine outbound demand — transfers just
        // relocate stock, and counting them would rank a heavily-restocked SKU as "fast moving".
        // Not category-scoped, matching the report's original single-value behavior.
        var salesRaw = await db.StockMovements
            .Where(m => m.MovementType == "sale" && m.CreatedAt >= rangeFrom && m.CreatedAt < rangeToExclusive)
            .Select(m => new { m.ProductId, m.BranchId, m.WarehouseId, m.Quantity })
            .ToListAsync();
        var scopedSales = hasLocationFilter
            ? salesRaw.Where(m =>
                (branchIds.Length > 0 && m.BranchId.HasValue && branchIds.Contains(m.BranchId.Value)) ||
                (warehouseIds.Length > 0 && m.WarehouseId.HasValue && warehouseIds.Contains(m.WarehouseId.Value)))
            : salesRaw.AsEnumerable();

        var soldByProduct = scopedSales
            .GroupBy(m => m.ProductId)
            // Sale quantities are stored negative (outbound); negate so "units moved" reads positive.
            .Select(g => new { ProductId = g.Key, Units = g.Sum(x => -x.Quantity) })
            .ToList();

        var productIds = soldByProduct.Select(x => x.ProductId).ToList();
        var productMeta = new Dictionary<Guid, (string Sku, string Name, decimal Cost)>();
        foreach (var pid in productIds)
        {
            var p = await db.Products.Where(x => x.Id == pid)
                .Select(x => new { x.Sku, x.Name, x.CostPrice, x.BasePrice }).FirstOrDefaultAsync();
            if (p != null) productMeta[pid] = (p.Sku, p.Name, p.CostPrice ?? p.BasePrice);
        }

        var movers = soldByProduct
            .Where(x => productMeta.ContainsKey(x.ProductId))
            .Select(x => new InventoryMoverRow
            {
                ProductId = x.ProductId,
                Sku = productMeta[x.ProductId].Sku,
                ProductName = productMeta[x.ProductId].Name,
                UnitsMoved = x.Units,
                CogsValue = x.Units * productMeta[x.ProductId].Cost,
            })
            .ToList();

        // Cost of goods sold over the period, from the ledger.
        var cogs = movers.Sum(m => m.CogsValue);
        var stockValue = snapshot.Sum(r => r.StockCostValue);

        // Turnover = COGS ÷ average inventory at cost. There are no historical stock snapshots, so
        // *current* value stands in for the average — it drifts from the textbook figure whenever
        // stock levels have moved a lot across the period. Reported as an approximation, not a
        // headline accounting number.
        var turnover = stockValue <= 0 ? 0 : Math.Round(cogs / stockValue, 2);

        var wastageRaw = await db.InventoryAdjustments.Include(a => a.Product).Where(a =>
            (a.AdjustmentType == "waste" || a.AdjustmentType == "damage" || a.AdjustmentType == "expired"
                || a.AdjustmentType == "theft" || a.AdjustmentType == "other")
            // Only value that has actually left inventory: auto/immediate write-offs (approval_status
            // null) or approved ones. A pending write-off hasn't been signed off or reduced stock yet.
            && (a.ApprovalStatus == null || a.ApprovalStatus == "approved")
            && a.CreatedAt >= rangeFrom && a.CreatedAt < rangeToExclusive)
            .ToListAsync();
        var wastage = wastageRaw.Where(a =>
            (!hasLocationFilter
                || (branchIds.Length > 0 && a.BranchId.HasValue && branchIds.Contains(a.BranchId.Value))
                || (warehouseIds.Length > 0 && a.WarehouseId.HasValue && warehouseIds.Contains(a.WarehouseId.Value)))
            && (categoryIds.Length == 0 || (a.Product != null && a.Product.CategoryId.HasValue && categoryIds.Contains(a.Product.CategoryId.Value))));
        var wastageValue = wastage.Sum(a => a.Quantity * (a.Product?.CostPrice ?? a.Product?.BasePrice ?? 0));

        // "Pending" = raised but not yet fully received — the POs someone is still waiting on.
        // Cancelled and fully_received are settled and deliberately excluded.
        var pendingPosRaw = await db.PurchaseOrders.Where(p =>
            p.Status == "draft" || p.Status == "sent" || p.Status == "partial_received")
            .Select(p => new { p.BranchId, p.WarehouseId })
            .ToListAsync();
        var pendingPos = hasLocationFilter
            ? pendingPosRaw.Count(p =>
                (branchIds.Length > 0 && p.BranchId.HasValue && branchIds.Contains(p.BranchId.Value)) ||
                (warehouseIds.Length > 0 && p.WarehouseId.HasValue && warehouseIds.Contains(p.WarehouseId.Value)))
            : pendingPosRaw.Count;

        var aging = BuildAgingBuckets(snapshot);

        // §2.7 — per-product aging. "Days since last movement" comes from the ledger where the
        // ledger has a row for that product+location, and falls back to the stock row's LastUpdated
        // otherwise. The two are distinguished by LastMovementSource so the UI can say which it is:
        // a ledger-backed number is a real movement, a stock-row one is only "last time this row
        // changed", and conflating them would make pre-ledger stock look freshly moved.
        var lastMoves = await db.StockMovements
            .GroupBy(m => new { m.ProductId, m.BranchId, m.WarehouseId })
            .Select(g => new { g.Key.ProductId, g.Key.BranchId, g.Key.WarehouseId, Last = g.Max(x => x.CreatedAt) })
            .ToListAsync();
        var lastMoveByKey = lastMoves.ToDictionary(
            x => (x.ProductId, x.BranchId ?? x.WarehouseId ?? Guid.Empty), x => x.Last);

        // Product age in stock = age of the oldest batch still holding quantity at that location.
        // Batches are where a received date exists at all; the stock row only knows when it last
        // changed, which is not the same thing.
        var oldestBatches = await db.InventoryBatches
            .Where(b => b.RemainingQuantity > 0)
            .GroupBy(b => new { b.ProductId, b.BranchId, b.WarehouseId })
            .Select(g => new { g.Key.ProductId, g.Key.BranchId, g.Key.WarehouseId, Oldest = g.Min(x => x.ReceivedDate) })
            .ToListAsync();
        var oldestByKey = oldestBatches.ToDictionary(
            x => (x.ProductId, x.BranchId ?? x.WarehouseId ?? Guid.Empty), x => x.Oldest);

        var nowUtc = DateTime.UtcNow;
        var soldLookup = soldByProduct.ToDictionary(x => x.ProductId, x => x.Units);

        // Same Star/High/Average/Slow/Dead Stock classification the Product Performance report
        // uses (composite sales+turnover+margin+recency score — see ProductPerformanceThresholds),
        // computed with this report's own filters so a product's tier can never disagree between
        // the two pages. Keyed by product, since the score is a per-product figure, not per-location.
        var perf = await BuildProductPerformanceAsync(rangeFrom, rangeToExclusive, branchIds, warehouseIds, categoryIds, productIdFilters, supplierIds, employeeIds, productStatuses, []);
        // Profitability (gross profit / margin %) is carried through from the same composite build
        // rather than recomputed, so the two reports can never disagree on a product's numbers —
        // this is the FRD's "profitability" dimension surfaced directly on the aging row.
        var classificationByProduct = perf.Rows.ToDictionary(r => r.ProductId, r => (r.Classification, r.PerformanceScore, r.GrossProfit, r.MarginPct));

        var agingRows = snapshot
            .Where(r => r.OnHandQty > 0)
            .Select(r =>
            {
                var key = (r.ProductId, r.LocationId);
                var hasLedger = lastMoveByKey.TryGetValue(key, out var ledgerLast);
                var lastMovement = hasLedger ? ledgerLast : r.LastMovementDate;
                var daysSince = (int)(nowUtc - lastMovement).TotalDays;
                int? ageDays = oldestByKey.TryGetValue(key, out var received)
                    ? (int)(nowUtc - received).TotalDays
                    : null;
                var unitsMoved = soldLookup.TryGetValue(r.ProductId, out var u) ? u : 0;
                var (tier, score, grossProfit, marginPct) = classificationByProduct.TryGetValue(r.ProductId, out var c)
                    ? c : ("Slow Moving Products", 0m, 0m, (decimal?)null);
                return new InventoryAgingRow
                {
                    ProductId = r.ProductId,
                    Sku = r.Sku,
                    ProductName = r.ProductName,
                    Category = r.Category,
                    ProductStatus = productStatusById.GetValueOrDefault(r.ProductId) ?? "active",
                    Location = r.Location,
                    LocationType = r.LocationType,
                    OnHandQty = r.OnHandQty,
                    StockValue = r.StockCostValue,
                    GrossProfit = grossProfit,
                    MarginPct = marginPct,
                    ProductAgeDays = ageDays,
                    DaysSinceLastMovement = daysSince,
                    LastMovementDate = lastMovement,
                    LastMovementSource = hasLedger ? "ledger" : "stock_row",
                    UnitsMovedInPeriod = unitsMoved,
                    AgeBucket = BucketFor(daysSince),
                    // Dead stock: on hand, and nothing recorded moving it in the whole period.
                    // Distinct from slow-moving (moved, just not much) — dead stock is capital that
                    // hasn't turned at all.
                    IsDeadStock = unitsMoved <= 0,
                    Classification = tier,
                    PerformanceScore = score,
                };
            })
            .OrderByDescending(r => r.DaysSinceLastMovement).ThenByDescending(r => r.StockValue)
            .ToList();

        // Classification and age bucket are both derived above (one from the composite performance
        // score, one from days-since-movement), so they can only be narrowed after the rows exist.
        if (classifications.Length > 0) agingRows = [.. agingRows.Where(r => classifications.Contains(r.Classification))];
        if (ageBuckets.Length > 0) agingRows = [.. agingRows.Where(r => ageBuckets.Contains(r.AgeBucket))];

        // Tier counts are distinct PRODUCTS on hand in this scope (not location-rows), matching how
        // Product Performance's own KPI tiles count — a product held at 3 branches is still one SKU.
        var productIdsOnHand = agingRows.Select(r => r.ProductId).Distinct().ToList();
        int CountTier(string tier) => productIdsOnHand.Count(pid => classificationByProduct.TryGetValue(pid, out var c) && c.Classification == tier);

        // Rank once; Top takes the busiest, Slow takes the least-busy of what's LEFT, so a product
        // can never appear in both cards (see the comment at the assignment below).
        var rankedMovers = movers.Where(m => m.UnitsMoved > 0).OrderByDescending(m => m.UnitsMoved).ToList();
        var topMovers = rankedMovers.Take(moverLimit).ToList();
        var topMoverIds = topMovers.Select(m => m.ProductId).ToHashSet();

        return new InventoryDashboardResult
        {
            Kpis = new InventoryDashboardKpis
            {
                TotalStockValue = stockValue,
                // On-hand minus reserved — what could actually be sold or shipped right now.
                AvailableStockQty = snapshot.Sum(r => r.AvailableQty),
                OutOfStockProducts = snapshot.Count(r => r.StockStatus == "out of stock"),
                // Reported as they are: stock is allowed to go negative (sales don't clamp, and a
                // missing row is created negative), so this is a real exception count to chase,
                // not a decorative zero.
                NegativeInventoryItems = snapshot.Count(r => r.StockStatus == "negative"),
                LowStockProducts = snapshot.Count(r => r.StockStatus == "low"),
                PendingPurchaseOrders = pendingPos,
                WastageValue = wastageValue,
                InventoryTurnover = turnover,
                CogsValue = cogs,
                StarCount = CountTier("Star Products"),
                HighPerformerCount = CountTier("High Performers"),
                AveragePerformerCount = CountTier("Average Performers"),
                SlowMovingCount = CountTier("Slow Moving Products"),
            },
            // Top and slow movers are drawn from the same ranked list but must never overlap — with
            // fewer than 2×moverLimit products that moved, the single busiest product was otherwise
            // both the #1 top mover and (ordered the other way) the #1 slow mover, showing the same
            // item in both cards. Slow excludes anything already claimed by Top, and only ranks
            // products that actually moved (a zero-sales product has no ledger row and belongs in
            // DeadStockSkus below, not here).
            TopMoving = [.. topMovers],
            SlowMoving = [.. rankedMovers.Where(m => !topMoverIds.Contains(m.ProductId)).OrderBy(m => m.UnitsMoved).Take(moverLimit)],
            Aging = aging,
            AgingRows = agingRows,
            // Aligned with the Classification tier rather than the row-level IsDeadStock flag, so
            // this count and the Star/High/Average/Slow tiles above always add up to the same total.
            DeadStockSkus = CountTier("Dead Stock"),
            DeadStockValue = agingRows.Where(r => r.Classification == "Dead Stock").Sum(r => r.StockValue),
            DataWindow = new InventoryDataWindow
            {
                LedgerStart = ledgerStart,
                From = rangeFrom,
                To = rangeToExclusive.AddDays(-1),
                // True only when the ledger predates the requested period — i.e. the movement-based
                // figures cover the whole window rather than just the tail of it.
                CoversFullPeriod = ledgerStart.HasValue && ledgerStart.Value <= rangeFrom,
                SaleMovementsInPeriod = movers.Count,
            },
        };
    }

    // Aging by time since the location's stock row last changed. LastMovementDate is InventoryStock/
    // WarehouseStock.LastUpdated — see BuildInventorySnapshotAsync for why the ledger isn't used
    // here: it only reaches back to the ledger's start, which would age every older row into "90+"
    // regardless of whether it actually moved.
    // Single source of truth for the bucket boundaries, so the chart and the per-product rows can
    // never label the same stock differently.
    private static readonly (string Label, int MinDays, int? MaxDays)[] AgingBucketDefs =
    [
        ("0-30 days", 0, 30), ("31-60 days", 31, 60), ("61-90 days", 61, 90), ("90+ days", 91, null),
    ];

    private static string BucketFor(int days)
    {
        foreach (var d in AgingBucketDefs)
            if (days >= d.MinDays && (d.MaxDays == null || days <= d.MaxDays)) return d.Label;
        // Only reachable for a negative age (a future-dated row) — clamp into the youngest bucket
        // rather than returning an empty label the UI would render as a blank cell.
        return AgingBucketDefs[0].Label;
    }

    private static List<InventoryAgingBucket> BuildAgingBuckets(List<InventorySnapshotRow> rows)
    {
        var now = DateTime.UtcNow;
        var defs = AgingBucketDefs;
        return [.. defs.Select(d =>
        {
            var inBucket = rows.Where(r =>
            {
                // Stock that isn't on hand isn't aging — a zero/negative row would otherwise pile
                // into "90+" and overstate dead stock.
                if (r.OnHandQty <= 0) return false;
                var days = (int)(now - r.LastMovementDate).TotalDays;
                return days >= d.MinDays && (d.MaxDays == null || days <= d.MaxDays);
            }).ToList();
            return new InventoryAgingBucket
            {
                Bucket = d.Label,
                SkuCount = inBucket.Count,
                OnHandQty = inBucket.Sum(r => r.OnHandQty),
                StockValue = inBucket.Sum(r => r.StockCostValue),
            };
        })];
    }

    // ───────────────────────────────────────────────────────────────────────
    // 7. Branch Sales (RPT-SALES-BRANCH)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("branch-sales")]
    [RequirePermission("Reports", PermAction.View)]
    public async Task<IActionResult> GetBranchSales(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] string? city, [FromQuery] string? customerType,
        [FromQuery] Guid? cashierId, [FromQuery] Guid? terminalId, [FromQuery] Guid? productId, [FromQuery] Guid? categoryId, [FromQuery] bool hasTobaccoFee = false)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildBranchSalesAsync(rangeFrom, rangeTo, branchId, city, customerType, cashierId, terminalId, productId, categoryId, hasTobaccoFee);
        if (!await CanViewFinanceAsync()) MaskBranchSalesMargin(result);
        return Ok(result);
    }

    [HttpGet("branch-sales/export")]
    [RequirePermission("Reports", PermAction.Export)]
    public async Task<IActionResult> ExportBranchSales(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] string? city, [FromQuery] string? customerType,
        [FromQuery] Guid? cashierId, [FromQuery] Guid? terminalId, [FromQuery] Guid? productId, [FromQuery] Guid? categoryId,
        [FromQuery] bool hasTobaccoFee = false, [FromQuery] Guid? exportedBy = null,
        [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildBranchSalesAsync(rangeFrom, rangeTo, branchId, city, customerType, cashierId, terminalId, productId, categoryId, hasTobaccoFee);
        var includeMargin = await CanViewFinanceAsync();
        if (!includeMargin) MaskBranchSalesMargin(result);
        var headers = includeMargin
            ? new[] { "Branch Code", "Branch Name", "City", "Open Terminals", "Transactions", "Gross Sales", "Discounts", "Returns", "Net Sales", "VAT", "Tobacco Fees", "Average Basket", "Gross Profit", "Margin %", "Rank" }
            : new[] { "Branch Code", "Branch Name", "City", "Open Terminals", "Transactions", "Gross Sales", "Discounts", "Returns", "Net Sales", "VAT", "Tobacco Fees", "Average Basket", "Rank" };
        var rows = result.Rows.Select(r => includeMargin
            ? new object?[] { r.BranchCode, r.BranchName, r.City, r.OpenTerminals, r.Transactions, r.GrossSales, r.Discounts, r.Returns, r.NetSales, r.Vat, r.TobaccoFees, r.AvgBasket, r.GrossProfit, r.MarginPct?.ToString("0.0") ?? "N/A", r.Rank }
            : new object?[] { r.BranchCode, r.BranchName, r.City, r.OpenTerminals, r.Transactions, r.GrossSales, r.Discounts, r.Returns, r.NetSales, r.Vat, r.TobaccoFees, r.AvgBasket, r.Rank }
        ).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, null,
            $"{{\"report\":\"branch-sales\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new List<(string, string)> {
            ("Top Branch", result.Kpis.TopBranch ?? "—"), ("Lowest Branch", result.Kpis.LowestBranch ?? "—"),
            ("Total Net Sales", result.Kpis.TotalNetSales.ToString("0.##")), ("Average Branch Sales", result.Kpis.AverageBranchSales.ToString("0.##")),
            ("Total Returns", result.Kpis.TotalReturns.ToString("0.##")),
            ("Total Tobacco Fees", result.Kpis.TotalTobaccoFees.ToString("0.##")),
        };
        if (includeMargin) kpis.Add(("Overall Margin %", result.Kpis.OverallMarginPct?.ToString("0.0") ?? "N/A"));
        return await BuildExportFile(format, "Branch Sales Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis.ToArray(), headers, rows, $"branch-sales-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private static void MaskBranchSalesMargin(BranchSalesResult r)
    {
        r.Kpis.OverallMarginPct = null;
        foreach (var row in r.Rows) { row.GrossProfit = 0; row.MarginPct = null; }
    }

    private async Task<BranchSalesResult> BuildBranchSalesAsync(
        DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, string? city, string? customerType = null,
        Guid? cashierId = null, Guid? terminalId = null, Guid? productId = null, Guid? categoryId = null, bool hasTobaccoFee = false)
    {
        var (scopeRole, scopeBranchId) = GetCallerContext();
        var branchesQ = db.Branches.Where(b => b.Status == "active");
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue)
            branchesQ = branchesQ.Where(b => b.Id == scopeBranchId);
        else if (branchId.HasValue)
            branchesQ = branchesQ.Where(b => b.Id == branchId);
        else if (!string.IsNullOrEmpty(city))
            branchesQ = branchesQ.Where(b => b.City == city);
        var branches = await branchesQ.ToListAsync();

        var itemsQ = db.OrderItems.Include(i => i.Order).Include(i => i.Product)
            .Where(i => i.Order != null && i.Order.CreatedAt >= rangeFrom && i.Order.CreatedAt < rangeToExclusive && i.Order.PaymentStatus == "paid");
        if (customerType == "registered") itemsQ = itemsQ.Where(i => i.Order!.CustomerId != null);
        else if (customerType == "walk-in") itemsQ = itemsQ.Where(i => i.Order!.CustomerId == null);
        if (cashierId.HasValue) itemsQ = itemsQ.Where(i => i.Order!.CashierId == cashierId);
        if (terminalId.HasValue) itemsQ = itemsQ.Where(i => i.Order!.TerminalId == terminalId);
        if (productId.HasValue) itemsQ = itemsQ.Where(i => i.ProductId == productId);
        if (categoryId.HasValue) itemsQ = itemsQ.Where(i => i.Product != null && i.Product.CategoryId == categoryId);
        if (hasTobaccoFee) itemsQ = itemsQ.Where(i => i.TobaccoFeeAmount > 0);
        var rawItems = await itemsQ.Select(i => new {
            BranchId = i.Order!.BranchId, OrderId = i.OrderId, Gross = i.UnitPrice * i.Quantity,
            i.DiscountAmount, i.TaxAmount, i.TobaccoFeeAmount, Cogs = i.Quantity * (i.Product!.CostPrice ?? 0m),
        }).ToListAsync();
        var itemsByBranch = rawItems.ToLookup(x => x.BranchId);

        // Returns are matched to the same line-level filters as sales (see LoadDailyLineItemsAsync) —
        // when a product/category/tobacco filter is active this must aggregate return *items*, not
        // whole-return RefundAmount, or an unrelated line on the same return would be netted off.
        var lineFiltered = productId.HasValue || categoryId.HasValue || hasTobaccoFee;
        ILookup<Guid, decimal> returnsByBranch;
        if (lineFiltered)
        {
            var returnItemsQ = db.CustomerReturnItems.Include(ri => ri.Return).Include(ri => ri.Product)
                .Where(ri => ri.Return != null && ri.Return.CreatedAt >= rangeFrom && ri.Return.CreatedAt < rangeToExclusive);
            if (customerType == "registered") returnItemsQ = returnItemsQ.Where(ri => ri.Return!.CustomerId != null);
            else if (customerType == "walk-in") returnItemsQ = returnItemsQ.Where(ri => ri.Return!.CustomerId == null);
            if (cashierId.HasValue) returnItemsQ = returnItemsQ.Where(ri => ri.Return!.ProcessedBy == cashierId);
            if (productId.HasValue) returnItemsQ = returnItemsQ.Where(ri => ri.ProductId == productId);
            if (categoryId.HasValue) returnItemsQ = returnItemsQ.Where(ri => ri.Product != null && ri.Product.CategoryId == categoryId);
            if (hasTobaccoFee) returnItemsQ = returnItemsQ.Where(ri => ri.Product != null && ri.Product.IsTobacco);
            returnsByBranch = (await returnItemsQ.Select(ri => new { ri.Return!.BranchId, ri.RefundAmount }).ToListAsync())
                .ToLookup(x => x.BranchId, x => x.RefundAmount);
        }
        else
        {
            var returnsQ = db.CustomerReturns.Where(r => r.CreatedAt >= rangeFrom && r.CreatedAt < rangeToExclusive);
            if (customerType == "registered") returnsQ = returnsQ.Where(r => r.CustomerId != null);
            else if (customerType == "walk-in") returnsQ = returnsQ.Where(r => r.CustomerId == null);
            if (cashierId.HasValue) returnsQ = returnsQ.Where(r => r.ProcessedBy == cashierId);
            returnsByBranch = (await returnsQ.Select(r => new { r.BranchId, r.RefundAmount }).ToListAsync())
                .ToLookup(x => x.BranchId, x => x.RefundAmount);
        }

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
                Vat = items.Sum(x => x.TaxAmount), TobaccoFees = items.Sum(x => x.TobaccoFeeAmount),
                AvgBasket = transactions > 0 ? Math.Round(netSales / transactions, 2) : 0m,
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
                TotalTobaccoFees = rows.Sum(r => r.TobaccoFees),
            },
            Rows = rows,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 8. Terminal Report (RPT-NETWORK-TERMINAL)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("terminal")]
    [RequirePermission("Reports", PermAction.View)]
    public async Task<IActionResult> GetTerminalReport(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] Guid? terminalId,
        [FromQuery] Guid? cashierId, [FromQuery] string? status, [FromQuery] bool hasTobaccoFee = false)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: false);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildTerminalReportAsync(rangeFrom, rangeTo, branchId, terminalId, cashierId, status, hasTobaccoFee));
    }

    [HttpGet("terminal/export")]
    [RequirePermission("Reports", PermAction.Export)]
    public async Task<IActionResult> ExportTerminalReport(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] Guid? terminalId,
        [FromQuery] Guid? cashierId, [FromQuery] string? status, [FromQuery] bool hasTobaccoFee = false,
        [FromQuery] Guid? exportedBy = null, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: false);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildTerminalReportAsync(rangeFrom, rangeTo, branchId, terminalId, cashierId, status, hasTobaccoFee);
        var headers = new[] { "Terminal ID", "Terminal Name", "Branch", "Status", "Assigned Cashier", "Transactions", "Net Sales", "Tobacco Fees", "Refunds", "Uptime %", "Last Sync Time" };
        var rows = result.Rows.Select(r => new object?[]
        {
            r.TerminalId, r.TerminalName, r.Branch, r.Status, r.AssignedCashier, r.Transactions, r.NetSales, r.TobaccoFees, r.Refunds, r.UptimePct, r.LastSyncTime,
        }).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"terminal\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Active Terminals", result.Kpis.ActiveTerminals.ToString()), ("Offline Terminals", result.Kpis.OfflineTerminals.ToString()),
            ("Terminal Sales", result.Kpis.TerminalSales.ToString("0.##")), ("Avg Uptime %", result.Kpis.AvgUptimePct.ToString("0.0")),
        };
        return await BuildExportFile(format, "Terminal Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"terminal-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<TerminalReportResult> BuildTerminalReportAsync(
        DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, Guid? terminalId,
        Guid? cashierId, string? status, bool hasTobaccoFee = false)
    {
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) branchId = scopeBranchId;
        var termQ = db.Terminals.Include(t => t.Branch).Include(t => t.AssignedCashier).AsQueryable();
        if (branchId.HasValue) termQ = termQ.Where(t => t.BranchId == branchId);
        if (terminalId.HasValue) termQ = termQ.Where(t => t.Id == terminalId);
        if (!string.IsNullOrEmpty(status)) termQ = termQ.Where(t => t.Status == status);
        var terminals = await termQ.ToListAsync();

        var ordersQ = db.Orders.Where(o => o.TerminalId != null && o.CreatedAt >= rangeFrom && o.CreatedAt < rangeToExclusive && o.PaymentStatus == "paid");
        if (branchId.HasValue) ordersQ = ordersQ.Where(o => o.BranchId == branchId);
        // Employee filter reports each terminal's sales *by that cashier* — the terminal rows
        // themselves still list every terminal, so an unused one correctly shows zero.
        if (cashierId.HasValue) ordersQ = ordersQ.Where(o => o.CashierId == cashierId);
        if (hasTobaccoFee) ordersQ = ordersQ.Where(o => o.TobaccoFeeAmount > 0);
        var orderMap = (await ordersQ
            .GroupBy(o => o.TerminalId!.Value)
            .Select(g => new { terminalId = g.Key, transactions = g.Count(), netSales = g.Sum(o => o.TotalAmount - o.TaxAmount), tobaccoFees = g.Sum(o => o.TobaccoFeeAmount) })
            .ToListAsync())
            .ToDictionary(x => x.terminalId);

        var returnsQ = db.CustomerReturns.Include(r => r.Order)
            .Where(r => r.Order != null && r.Order.TerminalId != null && r.CreatedAt >= rangeFrom && r.CreatedAt < rangeToExclusive);
        if (branchId.HasValue) returnsQ = returnsQ.Where(r => r.BranchId == branchId);
        if (cashierId.HasValue) returnsQ = returnsQ.Where(r => r.ProcessedBy == cashierId);
        if (hasTobaccoFee) returnsQ = returnsQ.Where(r => r.Order!.TobaccoFeeAmount > 0);
        var returnMap = (await returnsQ
            .GroupBy(r => r.Order!.TerminalId!.Value)
            .Select(g => new { terminalId = g.Key, refunds = g.Sum(r => r.RefundAmount) })
            .ToListAsync())
            .ToDictionary(x => x.terminalId, x => x.refunds);

        // Whoever is actually checked into the terminal right now (an open shift) is more useful
        // to a manager reading this report than Terminal.AssignedCashierId — a static, admin-set
        // "usually works here" label that doesn't change when a different cashier is using it —
        // so prefer the live shift's cashier and only fall back to the static assignment.
        // Materialized before grouping (rather than GroupBy(...).Select(g => g.First()...) in the
        // query itself) — grouped-aggregate ordering isn't guaranteed to translate correctly on
        // the MySQL EF Core provider used here, and a terminal should never have more than one
        // open shift anyway (enforced at open time), so this is just defensive against stale data.
        var openShifts = await db.CashierShifts.Include(s => s.Cashier)
            .Where(s => s.Status == "open" && s.TerminalId != null)
            .Select(s => new { TerminalId = s.TerminalId!.Value, s.OpenedAt, CashierName = s.Cashier!.FullName })
            .ToListAsync();
        var openShiftCashierByTerminal = openShifts
            .GroupBy(s => s.TerminalId)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(s => s.OpenedAt).First().CashierName);

        var tradingMinutes = Math.Max(1, (int)(rangeToExclusive - rangeFrom).TotalMinutes);
        var rows = terminals.Select(t =>
        {
            var agg = orderMap.GetValueOrDefault(t.Id);
            var uptimePct = Math.Round(Math.Min(100m, (decimal)t.UptimeMinutes / tradingMinutes * 100), 1);
            return new TerminalReportRow
            {
                TerminalId = t.TerminalCode ?? t.Id.ToString()[..8], TerminalName = t.Name, Branch = t.Branch?.Name ?? "—",
                Status = t.Status, AssignedCashier = openShiftCashierByTerminal.GetValueOrDefault(t.Id) ?? t.AssignedCashier?.FullName ?? "—",
                Transactions = agg?.transactions ?? 0, NetSales = agg?.netSales ?? 0m, TobaccoFees = agg?.tobaccoFees ?? 0m,
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
    [RequirePermission("Reports", PermAction.View)]
    public async Task<IActionResult> GetProductSales(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? branchId, [FromQuery] Guid[]? categoryId, [FromQuery] Guid[]? productId, [FromQuery] string? search,
        [FromQuery] Guid[]? cashierId, [FromQuery] bool hasTobaccoFee = false)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildProductSalesAsync(rangeFrom, rangeTo, branchId ?? [], categoryId ?? [], productId ?? [], search, cashierId ?? [], hasTobaccoFee);
        if (!await CanViewFinanceAsync()) MaskProductSalesMargin(result);
        return Ok(result);
    }

    [HttpGet("product-sales/export")]
    [RequirePermission("Reports", PermAction.Export)]
    public async Task<IActionResult> ExportProductSales(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? branchId, [FromQuery] Guid[]? categoryId, [FromQuery] Guid[]? productId, [FromQuery] string? search,
        [FromQuery] Guid[]? cashierId, [FromQuery] bool hasTobaccoFee, [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildProductSalesAsync(rangeFrom, rangeTo, branchId ?? [], categoryId ?? [], productId ?? [], search, cashierId ?? [], hasTobaccoFee);
        var includeMargin = await CanViewFinanceAsync();
        if (!includeMargin) MaskProductSalesMargin(result);
        var headers = includeMargin
            ? new[] { "SKU", "Barcode", "Product Name", "Category", "Brand", "Units Sold", "Net Sales", "Discounts", "Tobacco Fees", "Returns Qty", "Return Rate %", "COGS", "Gross Profit", "Margin %", "Current Stock" }
            : new[] { "SKU", "Barcode", "Product Name", "Category", "Brand", "Units Sold", "Net Sales", "Discounts", "Tobacco Fees", "Returns Qty", "Return Rate %", "Current Stock" };
        var rows = result.Rows.Select(r => includeMargin
            ? new object?[] { r.Sku, r.Barcode, r.ProductName, r.Category, r.Brand, r.UnitsSold, r.NetSales, r.Discounts, r.TobaccoFeeAmount, r.ReturnsQty, r.ReturnRatePct, r.Cogs, r.GrossProfit, r.MarginPct?.ToString("0.0") ?? "N/A", r.CurrentStock }
            : new object?[] { r.Sku, r.Barcode, r.ProductName, r.Category, r.Brand, r.UnitsSold, r.NetSales, r.Discounts, r.TobaccoFeeAmount, r.ReturnsQty, r.ReturnRatePct, r.CurrentStock }
        ).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, FirstBranchOrNull(branchId),
            $"{{\"report\":\"product-sales\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new List<(string, string)> {
            ("Top SKU", result.Kpis.TopSku ?? "—"), ("Units Sold", result.Kpis.UnitsSold.ToString("0.##")),
            ("Net Sales", result.Kpis.NetSales.ToString("0.##")), ("Dead Stock Count", result.Kpis.DeadStockCount.ToString()),
            ("Return Rate %", result.Kpis.ReturnRatePct.ToString("0.0")), ("Total Tobacco Fees", result.Kpis.TotalTobaccoFees.ToString("0.##")),
        };
        if (includeMargin) kpis.Add(("Gross Margin %", result.Kpis.GrossMarginPct?.ToString("0.0") ?? "N/A"));
        return await BuildExportFile(format, "Product Sales Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis.ToArray(), headers, rows, $"product-sales-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private static void MaskProductSalesMargin(ProductSalesResult r)
    {
        r.Kpis.GrossMarginPct = null;
        foreach (var row in r.Rows) { row.Cogs = 0; row.GrossProfit = 0; row.MarginPct = null; }
    }

    private async Task<ProductSalesResult> BuildProductSalesAsync(DateTime rangeFrom, DateTime rangeToExclusive, Guid[] branchIds, Guid[] categoryIds, Guid[] productIds, string? search, Guid[] cashierIds, bool hasTobaccoFee = false)
    {
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) branchIds = [scopeBranchId.Value];

        var itemsQ = db.OrderItems.Include(i => i.Order).Include(i => i.Product).ThenInclude(p => p!.Category)
            .Where(i => i.Order != null && i.Order.CreatedAt >= rangeFrom && i.Order.CreatedAt < rangeToExclusive && i.Order.PaymentStatus == "paid");
        if (hasTobaccoFee) itemsQ = itemsQ.Where(i => i.TobaccoFeeAmount > 0);
        if (!string.IsNullOrEmpty(search)) itemsQ = itemsQ.Where(i => i.Product != null && (i.Product.Name.Contains(search) || i.Product.Sku.Contains(search) || (i.Product.Barcode != null && i.Product.Barcode.Contains(search))));

        // Branch/Category/Product/Employee are narrowed in memory below, not via SQL .Contains(...)
        // on the array — the MySQL EF Core provider throws on a parameterized Guid[] IN-list.
        var rawItemsAll = await itemsQ.Select(i => new {
            i.ProductId, Sku = i.Product!.Sku, Barcode = i.Product.Barcode, Name = i.Product.Name,
            Category = i.Product.Category != null ? i.Product.Category.Name : "Uncategorized", CategoryId = i.Product.CategoryId, Brand = i.Product.Brand,
            BranchId = i.Order!.BranchId, CashierId = i.Order.CashierId,
            Qty = i.Quantity, Gross = i.UnitPrice * i.Quantity, i.DiscountAmount, i.TobaccoFeeAmount, Cogs = i.Quantity * (i.Product.CostPrice ?? 0m),
        }).ToListAsync();

        var rawItems = rawItemsAll.Where(x =>
            (branchIds.Length == 0 || branchIds.Contains(x.BranchId))
            && (categoryIds.Length == 0 || (x.CategoryId.HasValue && categoryIds.Contains(x.CategoryId.Value)))
            && (productIds.Length == 0 || productIds.Contains(x.ProductId))
            && (cashierIds.Length == 0 || (x.CashierId.HasValue && cashierIds.Contains(x.CashierId.Value)))
        ).ToList();

        var returnsAll = await db.CustomerReturnItems.Include(ri => ri.Return)
            .Where(ri => ri.Return != null && ri.Return.CreatedAt >= rangeFrom && ri.Return.CreatedAt < rangeToExclusive)
            .Select(ri => new { ri.ProductId, ri.Quantity, ri.RefundAmount, BranchId = ri.Return!.BranchId })
            .ToListAsync();
        var returnsByProduct = returnsAll.Where(x => branchIds.Length == 0 || branchIds.Contains(x.BranchId))
            .GroupBy(x => x.ProductId).ToDictionary(g => g.Key, g => (Qty: g.Sum(x => x.Quantity), Value: g.Sum(x => x.RefundAmount)));

        var stockAll = await db.InventoryStocks.Select(s => new { s.ProductId, s.BranchId, s.Quantity }).ToListAsync();
        var stockByProduct = stockAll.Where(x => branchIds.Length == 0 || branchIds.Contains(x.BranchId))
            .GroupBy(x => x.ProductId).ToDictionary(g => g.Key, g => g.Sum(x => x.Quantity));

        var soldProductIds = rawItems.Select(x => x.ProductId).ToHashSet();
        var deadStockAll = await db.InventoryStocks.Include(s => s.Product).Where(s => s.Quantity > 0)
            .Select(s => new { s.ProductId, s.BranchId, CategoryId = s.Product!.CategoryId }).ToListAsync();
        var deadStockCount = deadStockAll.Where(x =>
            (branchIds.Length == 0 || branchIds.Contains(x.BranchId))
            && (categoryIds.Length == 0 || (x.CategoryId.HasValue && categoryIds.Contains(x.CategoryId.Value)))
        ).Select(x => x.ProductId).Distinct().Count(pid => !soldProductIds.Contains(pid));

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
                UnitsSold = unitsSold, NetSales = netSales, Discounts = g.Sum(x => x.DiscountAmount), TobaccoFeeAmount = g.Sum(x => x.TobaccoFeeAmount),
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
                TotalTobaccoFees = rows.Sum(r => r.TobaccoFeeAmount),
            },
            Rows = rows,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 9b. Inventory Aging & Product Performance
    //
    // Classifies every product into one of five tiers — Star Products, High Performers, Average
    // Performers, Slow Moving Products, Dead Stock — by combining sales performance (units, value,
    // margin — same aggregation as BuildProductSalesAsync), aging/turnover (from the stock ledger,
    // same idea as BuildInventoryDashboardAsync's per-product aging), and on-hand value (reusing
    // BuildInventorySnapshotAsync so the stock figures can never disagree with the Inventory report).
    //
    // Classification is a weighted percentile rank across the filtered product set, not a hardcoded
    // score — see ProductPerformanceThresholds for the exact weights/cutoffs, kept in one place so
    // they're auditable and easy to retune. Dead Stock is a separate override, checked first: stock
    // sitting on hand with no sale in DeadStockDays (or ever) is dead regardless of how it scores on
    // everything else.
    // ───────────────────────────────────────────────────────────────────────

    private static class ProductPerformanceThresholds
    {
        // Weight of each dimension in the composite 0-100 score. Sums to 1.0.
        public const decimal WeightSalesValue = 0.35m;
        public const decimal WeightUnitsSold = 0.20m;
        public const decimal WeightTurnover = 0.20m;
        public const decimal WeightMargin = 0.15m;
        public const decimal WeightRecency = 0.10m;

        // On-hand stock with no sale in this many days (or never sold) is Dead Stock regardless of
        // composite score — capital that hasn't turned at all is the report's headline finding, not
        // something a middling score on other dimensions should be able to hide.
        public const int DeadStockDays = 90;

        // Composite-percentile cutoffs for the remaining four tiers (checked top-down).
        public const decimal StarCutoff = 80m;
        public const decimal HighPerformerCutoff = 60m;
        public const decimal AveragePerformerCutoff = 40m;
        public const decimal SlowMovingCutoff = 20m;
    }

    [HttpGet("inventory-aging-performance")]
    [RequirePermission("Reports", PermAction.View)]
    [RequirePlanFeature("kpi_bi")]
    public async Task<IActionResult> GetProductPerformance(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? branchId,
        [FromQuery] Guid[]? warehouseId, [FromQuery] Guid[]? categoryId, [FromQuery] Guid[]? productId,
        [FromQuery] Guid[]? supplierId, [FromQuery] Guid[]? employeeId,
        [FromQuery] string[]? productStatus, [FromQuery] string[]? classification)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildProductPerformanceAsync(rangeFrom, rangeTo, branchId ?? [], warehouseId ?? [], categoryId ?? [], productId ?? [],
            supplierId ?? [], employeeId ?? [], productStatus ?? [], classification ?? []);
        if (!await CanViewFinanceAsync()) MaskProductPerformanceCost(result);
        return Ok(result);
    }

    [HttpGet("inventory-aging-performance/export")]
    [RequirePermission("Reports", PermAction.Export)]
    [RequirePlanFeature("kpi_bi")]
    public async Task<IActionResult> ExportProductPerformance(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? branchId,
        [FromQuery] Guid[]? warehouseId, [FromQuery] Guid[]? categoryId, [FromQuery] Guid[]? productId,
        [FromQuery] Guid[]? supplierId, [FromQuery] Guid[]? employeeId,
        [FromQuery] string[]? productStatus, [FromQuery] string[]? classification,
        [FromQuery] Guid? exportedBy = null, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildProductPerformanceAsync(rangeFrom, rangeTo, branchId ?? [], warehouseId ?? [], categoryId ?? [], productId ?? [],
            supplierId ?? [], employeeId ?? [], productStatus ?? [], classification ?? []);
        var includeCost = await CanViewFinanceAsync();
        if (!includeCost) MaskProductPerformanceCost(result);
        var headers = includeCost
            ? new[] { "SKU", "Product Name", "Category", "Product Status", "Units Sold", "Sales Value", "COGS", "Gross Profit", "Margin %", "Current Stock Qty", "Current Stock Value", "Days In Stock", "Days Since Last Sale", "Turnover", "Score", "Classification" }
            : new[] { "SKU", "Product Name", "Category", "Product Status", "Units Sold", "Sales Value", "Current Stock Qty", "Days In Stock", "Days Since Last Sale", "Turnover", "Score", "Classification" };
        var rows = result.Rows.Select(r => includeCost
            ? new object?[] { r.Sku, r.ProductName, r.Category, r.ProductStatus, r.UnitsSold, r.SalesValue, r.Cogs, r.GrossProfit, r.MarginPct?.ToString("0.0") ?? "N/A", r.CurrentStockQty, r.CurrentStockValue, r.DaysInStock, r.DaysSinceLastSale, r.TurnoverRatio, r.PerformanceScore, r.Classification }
            : new object?[] { r.Sku, r.ProductName, r.Category, r.ProductStatus, r.UnitsSold, r.SalesValue, r.CurrentStockQty, r.DaysInStock, r.DaysSinceLastSale, r.TurnoverRatio, r.PerformanceScore, r.Classification }
        ).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, FirstBranchOrNull(branchId),
            $"{{\"report\":\"inventory-aging-performance\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new List<(string, string)> {
            ("Products Analyzed", result.Kpis.ProductCount.ToString()),
            ("Star Products", result.Kpis.StarCount.ToString()),
            ("High Performers", result.Kpis.HighPerformerCount.ToString()),
            ("Average Performers", result.Kpis.AveragePerformerCount.ToString()),
            ("Slow Moving", result.Kpis.SlowMovingCount.ToString()),
            ("Dead Stock SKUs", result.Kpis.DeadStockCount.ToString()),
        };
        if (includeCost)
        {
            kpis.Add(("Total Sales Value", result.Kpis.TotalSalesValue.ToString("0.##")));
            kpis.Add(("Dead Stock Value", result.Kpis.DeadStockValue.ToString("0.##")));
        }
        return await BuildExportFile(format, "Inventory Aging & Product Performance Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis.ToArray(), headers, rows, $"inventory-aging-performance-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private static void MaskProductPerformanceCost(ProductPerformanceResult r)
    {
        r.Kpis.TotalSalesValue = 0; r.Kpis.DeadStockValue = 0;
        foreach (var row in r.Rows) { row.Cogs = 0; row.GrossProfit = 0; row.MarginPct = null; row.CurrentStockValue = 0; }
    }

    private async Task<ProductPerformanceResult> BuildProductPerformanceAsync(
        DateTime rangeFrom, DateTime rangeToExclusive, Guid[] branchIds, Guid[] warehouseIds,
        Guid[] categoryIds, Guid[] productIds, Guid[] supplierIds, Guid[] employeeIds,
        string[] productStatuses, string[] classifications)
    {
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) branchIds = [scopeBranchId.Value];

        var hasLocationFilter = branchIds.Length > 0 || warehouseIds.Length > 0;

        // Sales leg — same aggregation as BuildProductSalesAsync: units, net sales, COGS, gross
        // profit for the requested period. Orders are branch-only (warehouses don't sell directly),
        // so a warehouse-only filter with no branch legitimately yields zero sales rows.
        // Branch/category/product are NOT applied as SQL .Contains(...) here — the MySQL EF Core
        // provider throws on a parameterized Guid[] IN-list (see the ef-mysql-inlist-gotcha memory);
        // fetch scoped only by date range + payment status, then narrow in-memory below.
        var rawItems = await db.OrderItems.Include(i => i.Order).Include(i => i.Product).ThenInclude(p => p!.Category)
            .Where(i => i.Order != null && i.Order.CreatedAt >= rangeFrom && i.Order.CreatedAt < rangeToExclusive && i.Order.PaymentStatus == "paid")
            .Select(i => new {
                i.ProductId, BranchId = i.Order!.BranchId, CategoryId = i.Product!.CategoryId, CashierId = i.Order!.CashierId,
                Sku = i.Product!.Sku, Name = i.Product.Name,
                Category = i.Product.Category != null ? i.Product.Category.Name : "Uncategorized",
                Qty = i.Quantity, Gross = i.UnitPrice * i.Quantity, i.DiscountAmount, Cogs = i.Quantity * (i.Product.CostPrice ?? 0m),
            }).ToListAsync();

        // Employee filter narrows to products this employee actually rang up in the period — it's
        // a "which products did they touch" gate, not a re-aggregation, so it's applied to the
        // product-id universe below rather than to rawItems (which must keep summing ALL employees'
        // sales for a product once that product is in scope).
        var employeeMatchedProductIds = employeeIds.Length > 0
            ? rawItems.Where(x => x.CashierId.HasValue && employeeIds.Contains(x.CashierId.Value)).Select(x => x.ProductId).ToHashSet()
            : null;

        if (branchIds.Length > 0) rawItems = [.. rawItems.Where(x => branchIds.Contains(x.BranchId))];
        if (categoryIds.Length > 0) rawItems = [.. rawItems.Where(x => x.CategoryId.HasValue && categoryIds.Contains(x.CategoryId.Value))];
        if (productIds.Length > 0) rawItems = [.. rawItems.Where(x => productIds.Contains(x.ProductId))];

        // Supplier filter: which products has this supplier ever supplied a batch of — resolved from
        // inventory_batches rather than Product itself (no direct Product→Supplier column exists;
        // a product's supplier history lives at the batch/receiving level). Fetched unfiltered and
        // narrowed in-memory, same as oldestByLocation/lastSaleByLocation below, since the MySQL EF
        // provider can't translate a parameterized Guid[] into an IN-list.
        HashSet<Guid>? supplierMatchedProductIds = null;
        if (supplierIds.Length > 0)
        {
            var supplierBatches = await db.InventoryBatches.Where(b => b.SupplierId != null)
                .Select(b => new { b.ProductId, b.SupplierId }).ToListAsync();
            supplierMatchedProductIds = supplierBatches.Where(b => supplierIds.Contains(b.SupplierId!.Value)).Select(b => b.ProductId).ToHashSet();
        }

        var salesByProduct = rawItems.GroupBy(x => x.ProductId).ToDictionary(g => g.Key, g => new
        {
            Sku = g.First().Sku, Name = g.First().Name, Category = g.First().Category,
            UnitsSold = g.Sum(x => x.Qty),
            NetSales = g.Sum(x => x.Gross - x.DiscountAmount),
            Cogs = g.Sum(x => x.Cogs),
        });

        // On-hand leg — reuse the snapshot builder unfiltered (it already applies the caller's own
        // branch/warehouse scope) so stock qty/value here can never disagree with the Inventory
        // report, then narrow to the requested locations/category/product in memory.
        var snapshot = await BuildInventorySnapshotAsync(null, null, null, false, null, null);
        var productCategoryIds = await db.Products.Select(p => new { p.Id, p.CategoryId }).ToDictionaryAsync(p => p.Id, p => p.CategoryId);

        var scopedStockRows = snapshot.Rows.Where(r =>
            (!hasLocationFilter
                || (branchIds.Length > 0 && r.LocationType == "branch" && branchIds.Contains(r.LocationId))
                || (warehouseIds.Length > 0 && r.LocationType == "warehouse" && warehouseIds.Contains(r.LocationId)))
            && (productIds.Length == 0 || productIds.Contains(r.ProductId))
            && (categoryIds.Length == 0 || (productCategoryIds.TryGetValue(r.ProductId, out var cid) && cid.HasValue && categoryIds.Contains(cid.Value))));

        var stockByProduct = scopedStockRows.GroupBy(r => r.ProductId).ToDictionary(g => g.Key, g => new
        {
            Sku = g.First().Sku, Name = g.First().ProductName, Category = g.First().Category,
            OnHandQty = g.Sum(r => r.OnHandQty), StockValue = g.Sum(r => r.StockCostValue),
        });

        // Age of the oldest batch still holding quantity, across whichever locations are in scope —
        // same idea as BuildInventoryDashboardAsync's per-location aging, aggregated to one number
        // per product (the oldest stock anywhere it's held). Grouped by location at the SQL level
        // (cheap — no Guid[] IN-list involved), then narrowed to the requested locations in-memory.
        var oldestByLocation = await db.InventoryBatches.Where(b => b.RemainingQuantity > 0)
            .GroupBy(b => new { b.ProductId, b.BranchId, b.WarehouseId })
            .Select(g => new { g.Key.ProductId, g.Key.BranchId, g.Key.WarehouseId, Oldest = g.Min(b => b.ReceivedDate) })
            .ToListAsync();
        var scopedOldest = hasLocationFilter
            ? oldestByLocation.Where(x =>
                (branchIds.Length > 0 && x.BranchId.HasValue && branchIds.Contains(x.BranchId.Value)) ||
                (warehouseIds.Length > 0 && x.WarehouseId.HasValue && warehouseIds.Contains(x.WarehouseId.Value)))
            : oldestByLocation.AsEnumerable();
        var oldestByProduct = scopedOldest.GroupBy(x => x.ProductId).ToDictionary(g => g.Key, g => g.Min(x => x.Oldest));

        // Last SALE specifically (not "last movement" — that conflates sales with transfers/
        // adjustments). Deliberately unbounded by the report's date range: a product that sold last
        // quarter but not this month is not "never sold", and clipping to the period would make every
        // report window manufacture its own dead stock. Bound only by how far the ledger reaches back.
        // Same grouped-then-narrow-in-memory approach as oldestByLocation above.
        var lastSaleByLocation = await db.StockMovements.Where(m => m.MovementType == "sale")
            .GroupBy(m => new { m.ProductId, m.BranchId, m.WarehouseId })
            .Select(g => new { g.Key.ProductId, g.Key.BranchId, g.Key.WarehouseId, Last = g.Max(m => m.CreatedAt) })
            .ToListAsync();
        var scopedLastSale = hasLocationFilter
            ? lastSaleByLocation.Where(x =>
                (branchIds.Length > 0 && x.BranchId.HasValue && branchIds.Contains(x.BranchId.Value)) ||
                (warehouseIds.Length > 0 && x.WarehouseId.HasValue && warehouseIds.Contains(x.WarehouseId.Value)))
            : lastSaleByLocation.AsEnumerable();
        var lastSaleByProduct = scopedLastSale.GroupBy(x => x.ProductId).ToDictionary(g => g.Key, g => g.Max(x => x.Last));

        var nowUtc = DateTime.UtcNow;
        // Product Status (active | inactive | discontinued) — the filter the client asked for, and
        // a column in its own right: a "Dead Stock" line reads very differently once you can see
        // the product was discontinued on purpose rather than quietly stopping selling.
        var statusByProduct = await db.Products.Select(p => new { p.Id, p.Status }).ToDictionaryAsync(p => p.Id, p => p.Status);
        var productIdUniverse = stockByProduct.Keys.Union(salesByProduct.Keys).ToList();
        if (productStatuses.Length > 0)
            productIdUniverse = [.. productIdUniverse.Where(pid => statusByProduct.TryGetValue(pid, out var st) && productStatuses.Contains(st))];
        if (supplierMatchedProductIds != null)
            productIdUniverse = [.. productIdUniverse.Where(supplierMatchedProductIds.Contains)];
        if (employeeMatchedProductIds != null)
            productIdUniverse = [.. productIdUniverse.Where(employeeMatchedProductIds.Contains)];

        var draft = productIdUniverse.Select(pid =>
        {
            var stock = stockByProduct.GetValueOrDefault(pid);
            var sales = salesByProduct.GetValueOrDefault(pid);
            var onHandQty = stock?.OnHandQty ?? 0;
            var stockValue = stock?.StockValue ?? 0;
            var unitsSold = sales?.UnitsSold ?? 0;
            var netSales = sales?.NetSales ?? 0;
            var cogs = sales?.Cogs ?? 0;
            var grossProfit = netSales - cogs;
            decimal? marginPct = netSales > 0 ? Math.Round(grossProfit / netSales * 100, 1) : null;
            int? daysInStock = oldestByProduct.TryGetValue(pid, out var received) ? (int)(nowUtc - received).TotalDays : null;
            int? daysSinceLastSale = lastSaleByProduct.TryGetValue(pid, out var last) ? (int)(nowUtc - last).TotalDays : null;
            var turnover = stockValue > 0 ? Math.Round(cogs / stockValue, 2) : 0;
            return (
                ProductId: pid,
                Sku: stock?.Sku ?? sales?.Sku ?? "—",
                Name: stock?.Name ?? sales?.Name ?? "—",
                Category: stock?.Category ?? sales?.Category ?? "Uncategorized",
                UnitsSold: unitsSold, NetSales: netSales, Cogs: cogs, GrossProfit: grossProfit, MarginPct: marginPct,
                OnHandQty: onHandQty, StockValue: stockValue, DaysInStock: daysInStock, DaysSinceLastSale: daysSinceLastSale,
                Turnover: turnover
            );
        })
        // A product with neither current stock nor any sale in the period has nothing to say —
        // excluding it keeps the report to products that are actually in play, not the full catalog.
        .Where(x => x.OnHandQty > 0 || x.UnitsSold > 0)
        .ToList();

        // Percentile-rank each dimension across this filtered set (0 = worst, 100 = best), so the
        // composite score is relative to what's actually in view rather than an arbitrary absolute
        // scale that would need retuning per tenant/catalog size.
        static Dictionary<Guid, decimal> PercentileRanks(IEnumerable<(Guid Id, decimal Value)> values)
        {
            var sorted = values.OrderBy(v => v.Value).ToList();
            var result = new Dictionary<Guid, decimal>();
            for (var i = 0; i < sorted.Count; i++)
                result[sorted[i].Id] = sorted.Count == 1 ? 100m : Math.Round((decimal)i / (sorted.Count - 1) * 100, 2);
            return result;
        }

        var salesValuePct = PercentileRanks(draft.Select(x => (x.ProductId, x.NetSales)));
        var unitsSoldPct = PercentileRanks(draft.Select(x => (x.ProductId, x.UnitsSold)));
        var turnoverPct = PercentileRanks(draft.Select(x => (x.ProductId, x.Turnover)));
        var marginPct = PercentileRanks(draft.Select(x => (x.ProductId, x.MarginPct ?? 0)));
        // Recency inverted: a HIGH days-since-last-sale is bad, so its percentile rank is flipped
        // before folding into the composite. Never sold at all is worst-case — ranked as if it were
        // older than the oldest observed sale, not silently excluded from the ranking.
        var worstDays = draft.Count == 0 ? 0 : draft.Max(x => x.DaysSinceLastSale ?? 0) + 1;
        var recencyPct = PercentileRanks(draft.Select(x => (x.ProductId, (decimal)(x.DaysSinceLastSale ?? worstDays))))
            .ToDictionary(kv => kv.Key, kv => 100m - kv.Value);

        var rows = draft.Select(x =>
        {
            var score = Math.Round(
                ProductPerformanceThresholds.WeightSalesValue * salesValuePct.GetValueOrDefault(x.ProductId) +
                ProductPerformanceThresholds.WeightUnitsSold * unitsSoldPct.GetValueOrDefault(x.ProductId) +
                ProductPerformanceThresholds.WeightTurnover * turnoverPct.GetValueOrDefault(x.ProductId) +
                ProductPerformanceThresholds.WeightMargin * marginPct.GetValueOrDefault(x.ProductId) +
                ProductPerformanceThresholds.WeightRecency * recencyPct.GetValueOrDefault(x.ProductId), 1);

            var isDeadStockOverride = x.OnHandQty > 0
                && (x.DaysSinceLastSale == null || x.DaysSinceLastSale > ProductPerformanceThresholds.DeadStockDays);

            var classification = isDeadStockOverride ? "Dead Stock"
                : score >= ProductPerformanceThresholds.StarCutoff ? "Star Products"
                : score >= ProductPerformanceThresholds.HighPerformerCutoff ? "High Performers"
                : score >= ProductPerformanceThresholds.AveragePerformerCutoff ? "Average Performers"
                : score >= ProductPerformanceThresholds.SlowMovingCutoff ? "Slow Moving Products"
                : x.OnHandQty > 0 ? "Dead Stock" : "Slow Moving Products";

            return new ProductPerformanceRow
            {
                ProductId = x.ProductId,
                Sku = x.Sku,
                ProductName = x.Name,
                Category = x.Category,
                ProductStatus = statusByProduct.GetValueOrDefault(x.ProductId) ?? "active",
                UnitsSold = x.UnitsSold,
                SalesValue = x.NetSales,
                Cogs = x.Cogs,
                GrossProfit = x.GrossProfit,
                MarginPct = x.MarginPct,
                CurrentStockQty = x.OnHandQty,
                CurrentStockValue = x.StockValue,
                DaysInStock = x.DaysInStock,
                DaysSinceLastSale = x.DaysSinceLastSale,
                TurnoverRatio = x.Turnover,
                PerformanceScore = score,
                Classification = classification,
            };
        })
        .OrderByDescending(r => r.PerformanceScore)
        .ToList();

        // Classification is derived from percentile ranks across the whole in-scope set, so it can
        // only be filtered AFTER scoring — narrowing earlier would re-rank the survivors against
        // each other and change the very tiers being filtered on.
        if (classifications.Length > 0) rows = [.. rows.Where(r => classifications.Contains(r.Classification))];

        return new ProductPerformanceResult
        {
            Kpis = new ProductPerformanceKpis
            {
                ProductCount = rows.Count,
                StarCount = rows.Count(r => r.Classification == "Star Products"),
                HighPerformerCount = rows.Count(r => r.Classification == "High Performers"),
                AveragePerformerCount = rows.Count(r => r.Classification == "Average Performers"),
                SlowMovingCount = rows.Count(r => r.Classification == "Slow Moving Products"),
                DeadStockCount = rows.Count(r => r.Classification == "Dead Stock"),
                DeadStockValue = rows.Where(r => r.Classification == "Dead Stock").Sum(r => r.CurrentStockValue),
                TotalSalesValue = rows.Sum(r => r.SalesValue),
            },
            Rows = rows,
        };
    }

    // Drill-down behind a single product row on the Inventory Aging & Product Performance report —
    // the aggregated row can't show per-transaction detail itself (that's the whole point of an
    // aggregate), so this is a second, on-demand fetch scoped to one product, mirroring the
    // audit-detail/{id} drill-down pattern used by the Employee Audit Center.
    [HttpGet("inventory-aging-performance/product-detail/{productId:guid}")]
    [RequirePermission("Reports", PermAction.View)]
    public async Task<IActionResult> GetProductPerformanceDetail(
        Guid productId, [FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });

        var product = await db.Products.FirstOrDefaultAsync(p => p.Id == productId);
        if (product is null) return NotFound();

        var (scopeRole, scopeBranchId) = GetCallerContext();
        var branchScoped = scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue;

        var salesQ = db.OrderItems.Include(i => i.Order).ThenInclude(o => o!.Branch)
            .Include(i => i.Order).ThenInclude(o => o!.Cashier)
            .Where(i => i.ProductId == productId && i.Order != null
                && i.Order.CreatedAt >= rangeFrom && i.Order.CreatedAt < rangeTo && i.Order.PaymentStatus == "paid");
        if (branchScoped) salesQ = salesQ.Where(i => i.Order!.BranchId == scopeBranchId);

        var recentSales = await salesQ
            .OrderByDescending(i => i.Order!.CreatedAt)
            .Take(50)
            .Select(i => new ProductDrillDownSaleRow
            {
                Date = i.Order!.CreatedAt,
                Branch = i.Order!.Branch != null ? i.Order!.Branch.Name : "—",
                Employee = i.Order!.Cashier != null ? i.Order!.Cashier.FullName : "—",
                Quantity = i.Quantity,
                NetAmount = i.UnitPrice * i.Quantity - i.DiscountAmount,
            }).ToListAsync();

        var batchesQ = db.InventoryBatches.Include(b => b.Branch).Include(b => b.Warehouse).Include(b => b.Supplier)
            .Where(b => b.ProductId == productId && b.RemainingQuantity > 0);
        if (branchScoped) batchesQ = batchesQ.Where(b => b.BranchId == scopeBranchId);

        var batches = await batchesQ
            .OrderByDescending(b => b.ReceivedDate)
            .Take(50)
            .Select(b => new ProductDrillDownBatchRow
            {
                Location = b.Branch != null ? b.Branch.Name : (b.Warehouse != null ? b.Warehouse.Name : "—"),
                LocationType = b.BranchId != null ? "branch" : "warehouse",
                Supplier = b.Supplier != null ? b.Supplier.Name : null,
                BatchNumber = b.BatchNumber,
                ReceivedDate = b.ReceivedDate,
                ExpiryDate = b.ExpiryDate,
                RemainingQuantity = b.RemainingQuantity,
                Status = b.Status,
            }).ToListAsync();

        return Ok(new ProductDrillDownResult
        {
            ProductName = product.Name,
            Sku = product.Sku,
            RecentSales = recentSales,
            Batches = batches,
        });
    }

    // ───────────────────────────────────────────────────────────────────────
    // 9c. Stock Movement History (FRD §INV-007) — first-class, filterable, exportable view over
    // the stock_movements ledger. Distinct from the Inventory Aging / Product Performance drill-
    // downs (which scope the same ledger to one product on demand): this report is the ledger
    // itself, filtered across products/branches/suppliers/employees, for audit and reconciliation
    // rather than per-product investigation.
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("stock-movement-history")]
    [RequirePermission("Reports", PermAction.View)]
    public async Task<IActionResult> GetStockMovementHistory(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? branchId,
        [FromQuery] Guid[]? warehouseId, [FromQuery] Guid[]? categoryId, [FromQuery] Guid[]? productId,
        [FromQuery] Guid[]? supplierId, [FromQuery] Guid[]? employeeId, [FromQuery] string[]? movementType)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildStockMovementHistoryAsync(rangeFrom, rangeTo, branchId ?? [], warehouseId ?? [], categoryId ?? [],
            productId ?? [], supplierId ?? [], employeeId ?? [], movementType ?? []);
        if (!await CanViewFinanceAsync())
        {
            result.Kpis.NetValue = 0;
            foreach (var r in result.Rows) r.Value = 0;
        }
        return Ok(result);
    }

    [HttpGet("stock-movement-history/export")]
    [RequirePermission("Reports", PermAction.Export)]
    public async Task<IActionResult> ExportStockMovementHistory(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? branchId,
        [FromQuery] Guid[]? warehouseId, [FromQuery] Guid[]? categoryId, [FromQuery] Guid[]? productId,
        [FromQuery] Guid[]? supplierId, [FromQuery] Guid[]? employeeId, [FromQuery] string[]? movementType,
        [FromQuery] Guid? exportedBy = null, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildStockMovementHistoryAsync(rangeFrom, rangeTo, branchId ?? [], warehouseId ?? [], categoryId ?? [],
            productId ?? [], supplierId ?? [], employeeId ?? [], movementType ?? []);
        var includeCost = await CanViewFinanceAsync();
        if (!includeCost)
        {
            result.Kpis.NetValue = 0;
            foreach (var r in result.Rows) r.Value = 0;
        }
        var headers = includeCost
            ? new[] { "Date/Time", "SKU", "Product Name", "Category", "Location", "Type", "Movement Type", "Quantity", "Qty Before", "Qty After", "Value", "Supplier", "Batch Number", "Reference", "Created By" }
            : new[] { "Date/Time", "SKU", "Product Name", "Category", "Location", "Type", "Movement Type", "Quantity", "Qty Before", "Qty After", "Supplier", "Batch Number", "Reference", "Created By" };
        var rows = result.Rows.Select(r => includeCost
            ? new object?[] { r.CreatedAt, r.Sku, r.ProductName, r.Category, r.Location, r.LocationType, r.MovementType, r.Quantity, r.QuantityBefore, r.QuantityAfter, r.Value, r.Supplier, r.BatchNumber, r.ReferenceNumber, r.CreatedBy }
            : new object?[] { r.CreatedAt, r.Sku, r.ProductName, r.Category, r.Location, r.LocationType, r.MovementType, r.Quantity, r.QuantityBefore, r.QuantityAfter, r.Supplier, r.BatchNumber, r.ReferenceNumber, r.CreatedBy }
        ).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, FirstBranchOrNull(branchId),
            $"{{\"report\":\"stock-movement-history\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new List<(string, string)>
        {
            ("Total Movements", result.Kpis.TotalMovements.ToString()),
            ("Inbound Qty", result.Kpis.InboundQty.ToString("0.##")),
            ("Outbound Qty", result.Kpis.OutboundQty.ToString("0.##")),
        };
        if (includeCost) kpis.Add(("Net Value", result.Kpis.NetValue.ToString("0.##")));
        return await BuildExportFile(format, "Stock Movement History Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis.ToArray(), headers, rows, $"stock-movement-history-{rangeFrom:yyyy-MM-dd}-to-{rangeTo.AddDays(-1):yyyy-MM-dd}");
    }

    private async Task<StockMovementHistoryResult> BuildStockMovementHistoryAsync(
        DateTime rangeFrom, DateTime rangeToExclusive, Guid[] branchIds, Guid[] warehouseIds, Guid[] categoryIds,
        Guid[] productIds, Guid[] supplierIds, Guid[] employeeIds, string[] movementTypes)
    {
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) branchIds = [scopeBranchId.Value];

        var query = db.StockMovements
            .Include(m => m.Product).ThenInclude(p => p!.Category)
            .Include(m => m.Branch)
            .Include(m => m.Warehouse)
            .Include(m => m.Batch).ThenInclude(b => b!.Supplier)
            .Include(m => m.CreatedByUser)
            .Where(m => m.CreatedAt >= rangeFrom && m.CreatedAt < rangeToExclusive)
            .AsQueryable();
        if (movementTypes.Length > 0) query = query.Where(m => movementTypes.Contains(m.MovementType));
        if (productIds.Length > 0) query = query.Where(m => productIds.Contains(m.ProductId));

        // Guid[] filters are never .Contains()'d against a DbSet-backed IQueryable on this repo's
        // MySQL provider (ef-mysql-inlist-gotcha memory) — materialize first, then narrow branch/
        // warehouse/category/supplier/employee in memory below.
        var all = await query.OrderByDescending(m => m.CreatedAt).ToListAsync();

        var scoped = all.AsEnumerable();
        if (branchIds.Length > 0 || warehouseIds.Length > 0)
            scoped = scoped.Where(m =>
                (branchIds.Length > 0 && m.BranchId.HasValue && branchIds.Contains(m.BranchId.Value)) ||
                (warehouseIds.Length > 0 && m.WarehouseId.HasValue && warehouseIds.Contains(m.WarehouseId.Value)));
        if (categoryIds.Length > 0)
            scoped = scoped.Where(m => m.Product != null && m.Product.CategoryId.HasValue && categoryIds.Contains(m.Product.CategoryId.Value));
        if (supplierIds.Length > 0)
            scoped = scoped.Where(m => m.Batch != null && m.Batch.SupplierId.HasValue && supplierIds.Contains(m.Batch.SupplierId.Value));
        if (employeeIds.Length > 0)
            scoped = scoped.Where(m => m.CreatedBy.HasValue && employeeIds.Contains(m.CreatedBy.Value));

        var materialized = scoped.ToList();

        var rows = materialized.Select(m => new StockMovementHistoryRow
        {
            Id = m.Id,
            CreatedAt = m.CreatedAt,
            ProductId = m.ProductId,
            Sku = m.Product?.Sku ?? "—",
            ProductName = m.Product?.Name ?? "—",
            Category = m.Product?.Category?.Name ?? "Uncategorized",
            Location = m.Branch?.Name ?? m.Warehouse?.Name ?? "—",
            LocationType = m.BranchId.HasValue ? "branch" : "warehouse",
            MovementType = m.MovementType,
            Quantity = m.Quantity,
            QuantityBefore = m.QuantityBefore,
            QuantityAfter = m.QuantityAfter,
            // Cost, not sale price — the value of the stock that moved, priced at the batch it came
            // from where known, falling back to the product's current cost.
            Value = Math.Abs(m.Quantity) * (m.Batch?.PurchaseCost ?? m.Product?.CostPrice ?? m.Product?.BasePrice ?? 0),
            Supplier = m.Batch?.Supplier?.Name,
            BatchNumber = m.Batch?.BatchNumber,
            ReferenceType = m.ReferenceType,
            ReferenceNumber = m.ReferenceNumber,
            Notes = m.Notes,
            CreatedBy = m.CreatedByUser?.FullName,
            CreatedById = m.CreatedBy,
        }).ToList();

        return new StockMovementHistoryResult
        {
            Kpis = new StockMovementHistoryKpis
            {
                TotalMovements = rows.Count,
                InboundQty = materialized.Where(m => m.Quantity > 0).Sum(m => m.Quantity),
                OutboundQty = materialized.Where(m => m.Quantity < 0).Sum(m => -m.Quantity),
                NetValue = rows.Sum(r => r.Value),
            },
            Rows = rows,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 10. Category Performance (RPT-SALES-CATEGORY)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("category-performance")]
    [RequirePermission("Reports", PermAction.View)]
    [RequirePlanFeature("kpi_bi")]
    public async Task<IActionResult> GetCategoryPerformance(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? branchId, [FromQuery] Guid[]? categoryId,
        [FromQuery] Guid[]? cashierId, [FromQuery] Guid[]? terminalId, [FromQuery] Guid[]? productId, [FromQuery] bool hasTobaccoFee = false)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildCategoryPerformanceAsync(rangeFrom, rangeTo, branchId ?? [], categoryId ?? [], cashierId ?? [], terminalId ?? [], productId ?? [], hasTobaccoFee);
        if (!await CanViewFinanceAsync()) MaskCategoryPerformanceMargin(result);
        return Ok(result);
    }

    [HttpGet("category-performance/export")]
    [RequirePermission("Reports", PermAction.Export)]
    [RequirePlanFeature("kpi_bi")]
    public async Task<IActionResult> ExportCategoryPerformance(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? branchId, [FromQuery] Guid[]? categoryId,
        [FromQuery] Guid[]? cashierId, [FromQuery] Guid[]? terminalId, [FromQuery] Guid[]? productId,
        [FromQuery] bool hasTobaccoFee = false, [FromQuery] Guid? exportedBy = null,
        [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildCategoryPerformanceAsync(rangeFrom, rangeTo, branchId ?? [], categoryId ?? [], cashierId ?? [], terminalId ?? [], productId ?? [], hasTobaccoFee);
        var includeMargin = await CanViewFinanceAsync();
        if (!includeMargin) MaskCategoryPerformanceMargin(result);
        var headers = includeMargin
            ? new[] { "Category Name", "Parent Category", "SKU Count", "Units Sold", "Gross Sales", "Discounts", "Returns", "Return Rate %", "Net Sales", "Sales Contribution %", "Tobacco Fees", "COGS", "Gross Profit", "Margin %" }
            : new[] { "Category Name", "Parent Category", "SKU Count", "Units Sold", "Gross Sales", "Discounts", "Returns", "Return Rate %", "Net Sales", "Sales Contribution %", "Tobacco Fees" };
        var rows = result.Rows.Select(r => includeMargin
            ? new object?[] { r.CategoryName, r.ParentCategory, r.SkuCount, r.UnitsSold, r.GrossSales, r.Discounts, r.Returns, r.ReturnRatePct, r.NetSales, r.SalesContributionPct, r.TobaccoFees, r.Cogs, r.GrossProfit, r.MarginPct?.ToString("0.0") ?? "N/A" }
            : new object?[] { r.CategoryName, r.ParentCategory, r.SkuCount, r.UnitsSold, r.GrossSales, r.Discounts, r.Returns, r.ReturnRatePct, r.NetSales, r.SalesContributionPct, r.TobaccoFees }
        ).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, FirstBranchOrNull(branchId),
            $"{{\"report\":\"category-performance\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new List<(string, string)>
        {
            ("Top Category", result.Kpis.TopCategory ?? "—"), ("Category Return Rate %", result.Kpis.CategoryReturnRatePct.ToString("0.0")),
            ("Total Categories Sold", result.Kpis.TotalCategoriesSold.ToString()), ("Category Discount Value", result.Kpis.CategoryDiscountValue.ToString("0.##")),
            ("Total Tobacco Fees", result.Kpis.TotalTobaccoFees.ToString("0.##")),
        };
        if (includeMargin) kpis.Add(("Highest Margin Category", result.Kpis.HighestMarginCategory ?? "—"));
        return await BuildExportFile(format, "Category Performance Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis.ToArray(), headers, rows, $"category-performance-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private static void MaskCategoryPerformanceMargin(CategoryPerformanceResult r)
    {
        r.Kpis.HighestMarginCategory = null;
        foreach (var row in r.Rows) { row.Cogs = 0; row.GrossProfit = 0; row.MarginPct = null; }
    }

    private async Task<CategoryPerformanceResult> BuildCategoryPerformanceAsync(
        DateTime rangeFrom, DateTime rangeToExclusive, Guid[] branchId, Guid[] categoryId,
        Guid[] cashierId, Guid[] terminalId, Guid[] productId, bool hasTobaccoFee = false)
    {
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) branchId = [scopeBranchId.Value];
        var categoryNames = await db.Categories.ToDictionaryAsync(c => c.Id, c => c.Name);

        var itemsQ = db.OrderItems.Include(i => i.Order).Include(i => i.Product).ThenInclude(p => p!.Category)
            .Where(i => i.Order != null && i.Order.CreatedAt >= rangeFrom && i.Order.CreatedAt < rangeToExclusive && i.Order.PaymentStatus == "paid");
        if (hasTobaccoFee) itemsQ = itemsQ.Where(i => i.TobaccoFeeAmount > 0);

        var rawItems = await itemsQ.Select(i => new {
            CategoryId = i.Product!.CategoryId, ParentId = i.Product.Category != null ? i.Product.Category.ParentId : null,
            i.ProductId, Qty = i.Quantity, Gross = i.UnitPrice * i.Quantity, i.DiscountAmount, i.TobaccoFeeAmount,
            Cogs = i.Quantity * (i.Product.CostPrice ?? 0m),
            OrderBranchId = i.Order!.BranchId, CashierId = i.Order.CashierId, TerminalId = i.Order.TerminalId,
        }).ToListAsync();

        // Branch/category/cashier/terminal/product are narrowed in memory below, not via SQL
        // .Contains(...) — the MySQL EF Core provider throws on a parameterized Guid[] IN-list
        // (see the ef-mysql-inlist-gotcha memory).
        var items = rawItems;
        if (branchId.Length > 0) items = [.. items.Where(x => branchId.Contains(x.OrderBranchId))];
        // Selecting a parent category includes its direct subcategories, matching the FRD's
        // expand/collapse hierarchy intent even though this report's table itself stays flat.
        if (categoryId.Length > 0) items = [.. items.Where(x => (x.CategoryId.HasValue && categoryId.Contains(x.CategoryId.Value)) || (x.ParentId.HasValue && categoryId.Contains(x.ParentId.Value)))];
        if (cashierId.Length > 0) items = [.. items.Where(x => x.CashierId.HasValue && cashierId.Contains(x.CashierId.Value))];
        if (terminalId.Length > 0) items = [.. items.Where(x => x.TerminalId.HasValue && terminalId.Contains(x.TerminalId.Value))];
        if (productId.Length > 0) items = [.. items.Where(x => productId.Contains(x.ProductId))];

        var returnsQ = db.CustomerReturnItems.Include(ri => ri.Return).Include(ri => ri.Product)
            .Where(ri => ri.Return != null && ri.Return.CreatedAt >= rangeFrom && ri.Return.CreatedAt < rangeToExclusive);
        if (hasTobaccoFee) returnsQ = returnsQ.Where(ri => ri.Product != null && ri.Product.IsTobacco);
        var rawReturnRows = await returnsQ.Select(ri => new {
            CategoryId = ri.Product!.CategoryId, ParentId = ri.Product.Category != null ? ri.Product.Category.ParentId : null,
            ri.ProductId, ri.RefundAmount, ri.Quantity,
            ReturnBranchId = ri.Return!.BranchId, ProcessedBy = ri.Return.ProcessedBy,
        }).ToListAsync();

        // Returns mirror the sales-side filters so Net Sales nets only refunds this report counted.
        // Note: Returns carry no terminal id, so terminalId is not applied here (matches prior behavior).
        var returnRows = rawReturnRows;
        if (branchId.Length > 0) returnRows = [.. returnRows.Where(x => branchId.Contains(x.ReturnBranchId))];
        if (categoryId.Length > 0) returnRows = [.. returnRows.Where(x => (x.CategoryId.HasValue && categoryId.Contains(x.CategoryId.Value)) || (x.ParentId.HasValue && categoryId.Contains(x.ParentId.Value)))];
        if (cashierId.Length > 0) returnRows = [.. returnRows.Where(x => x.ProcessedBy.HasValue && cashierId.Contains(x.ProcessedBy.Value))];
        if (productId.Length > 0) returnRows = [.. returnRows.Where(x => productId.Contains(x.ProductId))];
        var returnsByCategory = returnRows.GroupBy(x => x.CategoryId).ToDictionary(g => g.Key, g => g.Sum(x => x.RefundAmount));
        var returnsQtyByCategory = returnRows.GroupBy(x => x.CategoryId).ToDictionary(g => g.Key, g => g.Sum(x => x.Quantity));

        // Net Sales here follows the same Gross − Discounts − Returns convention as every other sales
        // report (FRD §8), rather than the pre-fix version which never subtracted Returns at all.
        var totalNetSalesAll = items.Sum(x => x.Gross - x.DiscountAmount) - returnRows.Sum(x => x.RefundAmount);

        var rows = items.GroupBy(x => new { x.CategoryId, x.ParentId }).Select(g =>
        {
            var grossLessDiscount = g.Sum(x => x.Gross - x.DiscountAmount);
            var cogs = g.Sum(x => x.Cogs);
            var returns = g.Key.CategoryId.HasValue ? returnsByCategory.GetValueOrDefault(g.Key.CategoryId, 0m) : 0m;
            var returnsQty = g.Key.CategoryId.HasValue ? returnsQtyByCategory.GetValueOrDefault(g.Key.CategoryId, 0m) : 0m;
            var netSales = grossLessDiscount - returns;
            var unitsSold = g.Sum(x => x.Qty);
            return new CategoryPerformanceRow
            {
                CategoryId = g.Key.CategoryId?.ToString() ?? "—",
                CategoryName = g.Key.CategoryId.HasValue ? categoryNames.GetValueOrDefault(g.Key.CategoryId.Value, "—") : "Uncategorized",
                ParentCategory = g.Key.ParentId.HasValue ? categoryNames.GetValueOrDefault(g.Key.ParentId.Value, "—") : "—",
                SkuCount = g.Select(x => x.ProductId).Distinct().Count(), UnitsSold = unitsSold,
                GrossSales = g.Sum(x => x.Gross), Discounts = g.Sum(x => x.DiscountAmount), Returns = returns,
                ReturnsQty = returnsQty, ReturnRatePct = unitsSold > 0 ? Math.Round(returnsQty / unitsSold * 100, 1) : 0m,
                NetSales = netSales,
                SalesContributionPct = totalNetSalesAll > 0 ? Math.Round(netSales / totalNetSalesAll * 100, 1) : 0m,
                TobaccoFees = g.Sum(x => x.TobaccoFeeAmount),
                Cogs = cogs, GrossProfit = netSales - cogs, MarginPct = netSales > 0 ? Math.Round((netSales - cogs) / netSales * 100, 1) : null,
            };
        })
        .OrderByDescending(r => r.NetSales)
        .ToList();

        var totalUnitsAll = rows.Sum(r => r.UnitsSold);
        var totalReturnsQtyAll = rows.Sum(r => r.ReturnsQty);

        return new CategoryPerformanceResult
        {
            Kpis = new CategoryPerformanceKpis
            {
                TopCategory = rows.FirstOrDefault()?.CategoryName,
                HighestMarginCategory = rows.Where(r => r.MarginPct.HasValue).OrderByDescending(r => r.MarginPct).FirstOrDefault()?.CategoryName,
                CategoryReturnRatePct = totalUnitsAll > 0 ? Math.Round(totalReturnsQtyAll / totalUnitsAll * 100, 1) : 0m,
                TotalCategoriesSold = rows.Count,
                CategoryDiscountValue = rows.Sum(r => r.Discounts),
                TotalTobaccoFees = rows.Sum(r => r.TobaccoFees),
            },
            Rows = rows,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 11. Supplier Performance (RPT-SUPPLIER-PERFORMANCE)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("supplier-performance")]
    [RequirePermission("Reports", PermAction.View)]
    [RequirePlanFeature("kpi_bi")]
    public async Task<IActionResult> GetSupplierPerformance(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? supplierId,
        [FromQuery] Guid[]? branchId, [FromQuery] Guid[]? warehouseId, [FromQuery] Guid[]? productId, [FromQuery] Guid[]? createdBy, [FromQuery] Guid[]? approvedBy)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildSupplierPerformanceAsync(rangeFrom, rangeTo, supplierId ?? [], branchId ?? [], warehouseId ?? [], productId ?? [], createdBy ?? [], approvedBy ?? []));
    }

    [HttpGet("supplier-performance/export")]
    [RequirePermission("Reports", PermAction.Export)]
    [RequirePlanFeature("kpi_bi")]
    public async Task<IActionResult> ExportSupplierPerformance(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? supplierId,
        [FromQuery] Guid[]? branchId, [FromQuery] Guid[]? warehouseId, [FromQuery] Guid[]? productId, [FromQuery] Guid[]? createdBy, [FromQuery] Guid[]? approvedBy,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildSupplierPerformanceAsync(rangeFrom, rangeTo, supplierId ?? [], branchId ?? [], warehouseId ?? [], productId ?? [], createdBy ?? [], approvedBy ?? []);
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
        return await BuildExportFile(format, "Supplier Performance Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"supplier-performance-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<SupplierPerformanceResult> BuildSupplierPerformanceAsync(
        DateTime rangeFrom, DateTime rangeToExclusive, Guid[] supplierIds, Guid[] branchIds, Guid[] warehouseIds, Guid[] productIds, Guid[] createdByIds, Guid[] approvedByIds)
    {
        // Supplier/branch/warehouse/product/actor are narrowed in memory below, not via SQL .Contains(...) —
        // the MySQL EF Core provider throws on a parameterized Guid[] IN-list (see the
        // ef-mysql-inlist-gotcha memory).
        var pos = await db.PurchaseOrders.Include(p => p.Supplier).Include(p => p.Items)
            .Where(p => p.CreatedAt >= rangeFrom && p.CreatedAt < rangeToExclusive && p.Status != "cancelled")
            .ToListAsync();
        if (supplierIds.Length > 0) pos = [.. pos.Where(p => supplierIds.Contains(p.SupplierId))];
        if (branchIds.Length > 0) pos = [.. pos.Where(p => p.BranchId.HasValue && branchIds.Contains(p.BranchId.Value))];
        if (warehouseIds.Length > 0) pos = [.. pos.Where(p => p.WarehouseId.HasValue && warehouseIds.Contains(p.WarehouseId.Value))];
        if (productIds.Length > 0) pos = [.. pos.Where(p => p.Items.Any(i => productIds.Contains(i.ProductId)))];
        if (createdByIds.Length > 0) pos = [.. pos.Where(p => createdByIds.Contains(p.CreatedBy))];
        if (approvedByIds.Length > 0) pos = [.. pos.Where(p => p.ApprovedBy.HasValue && approvedByIds.Contains(p.ApprovedBy.Value))];

        var rtsRaw = await db.StockTransfers.Include(t => t.Items)
            .Where(t => t.TransferType == "warehouse_to_supplier" && t.CreatedAt >= rangeFrom && t.CreatedAt < rangeToExclusive && t.DestSupplierId != null)
            .ToListAsync();
        var rtsBySupplier = (supplierIds.Length > 0 ? rtsRaw.Where(t => supplierIds.Contains(t.DestSupplierId!.Value)) : rtsRaw.AsEnumerable())
            .GroupBy(t => t.DestSupplierId!.Value)
            .ToDictionary(g => g.Key, g => (
                Qty: g.SelectMany(t => t.Items).Sum(i => i.ReceivedQuantity ?? i.ApprovedQuantity ?? i.RequestedQuantity),
                Value: g.SelectMany(t => t.Items).Sum(i => (i.ReceivedQuantity ?? i.ApprovedQuantity ?? i.RequestedQuantity) * (i.UnitCost ?? 0m))
            ));

        var rows = pos.GroupBy(p => p.SupplierId).Select(g =>
        {
            var s = g.First().Supplier;
            // Fill rate covers completed/partially-received POs only (FRD §7.8 AC36) — draft/pending/sent
            // POs haven't been received at all yet and would otherwise inflate Ordered Qty with zero Received Qty.
            var receivedPos = g.Where(p => p.Status is "fully_received" or "partial_received").ToList();
            var orderedQty = receivedPos.SelectMany(p => p.Items).Sum(i => i.OrderedQuantity);
            var receivedQty = receivedPos.SelectMany(p => p.Items).Sum(i => i.ReceivedQuantity);
            var lateDeliveries = g.Count(p => p.ReceivedDate.HasValue && p.ExpectedDeliveryDate.HasValue && p.ReceivedDate > p.ExpectedDeliveryDate);
            var leadTimes = g.Where(p => p.ReceivedDate.HasValue).Select(p => (p.ReceivedDate!.Value - p.CreatedAt).TotalDays).ToList();
            var rts = rtsBySupplier.GetValueOrDefault(g.Key, (Qty: 0m, Value: 0m));
            return new SupplierPerformanceRow
            {
                SupplierId = s?.SupplierCode ?? "—", SupplierName = s?.Name ?? "Unknown", SupplierStatus = s?.Status ?? "—", PoCount = g.Count(),
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
    [RequirePermission("Reports", PermAction.View)]
    public async Task<IActionResult> GetWasteSpoilage(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? branchId, [FromQuery] string? reason,
        [FromQuery] Guid[]? productId, [FromQuery] Guid[]? categoryId, [FromQuery] Guid[]? adjustedBy, [FromQuery] bool isTobacco = false,
        [FromQuery] Guid[]? warehouseId = null, [FromQuery] Guid[]? approvedBy = null, [FromQuery] string[]? approvalStatus = null)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildWasteSpoilageAsync(rangeFrom, rangeTo, branchId ?? [], reason, productId ?? [], categoryId ?? [], adjustedBy ?? [], isTobacco, warehouseId ?? [], approvedBy ?? [], approvalStatus ?? []);
        if (!await CanViewFinanceAsync()) MaskWasteSpoilageCost(result);
        return Ok(result);
    }

    [HttpGet("waste-spoilage/export")]
    [RequirePermission("Reports", PermAction.Export)]
    public async Task<IActionResult> ExportWasteSpoilage(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? branchId, [FromQuery] string? reason,
        [FromQuery] Guid[]? productId, [FromQuery] Guid[]? categoryId, [FromQuery] Guid[]? adjustedBy, [FromQuery] bool isTobacco = false,
        [FromQuery] Guid? exportedBy = null, [FromQuery] string? format = "csv",
        [FromQuery] Guid[]? warehouseId = null, [FromQuery] Guid[]? approvedBy = null, [FromQuery] string[]? approvalStatus = null)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildWasteSpoilageAsync(rangeFrom, rangeTo, branchId ?? [], reason, productId ?? [], categoryId ?? [], adjustedBy ?? [], isTobacco, warehouseId ?? [], approvedBy ?? [], approvalStatus ?? []);
        var includeCost = await CanViewFinanceAsync();
        if (!includeCost) MaskWasteSpoilageCost(result);
        var headers = includeCost
            ? new[] { "Waste ID", "Date/Time", "SKU", "Product Name", "Category", "Branch", "Tobacco", "Batch/Lot", "Expiry Date", "Qty", "Reason", "Created By", "Approved By", "Approval Status", "Cost Value", "Notes" }
            : new[] { "Waste ID", "Date/Time", "SKU", "Product Name", "Category", "Branch", "Tobacco", "Batch/Lot", "Expiry Date", "Qty", "Reason", "Created By", "Approved By", "Approval Status", "Notes" };
        var rows = result.Rows.Select(r => includeCost
            ? new object?[] { r.WasteId, r.DateTime, r.Sku, r.ProductName, r.Category, r.Branch, r.IsTobacco ? "Yes" : "No", r.BatchNumber ?? "—", r.ExpiryDate, r.Qty, r.Reason, r.CreatedBy, r.ApprovedBy ?? "—", r.ApprovalStatus ?? "—", r.CostValue, r.Notes }
            : new object?[] { r.WasteId, r.DateTime, r.Sku, r.ProductName, r.Category, r.Branch, r.IsTobacco ? "Yes" : "No", r.BatchNumber ?? "—", r.ExpiryDate, r.Qty, r.Reason, r.CreatedBy, r.ApprovedBy ?? "—", r.ApprovalStatus ?? "—", r.Notes }
        ).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, FirstBranchOrNull(branchId),
            $"{{\"report\":\"waste-spoilage\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new List<(string, string)> {
            ("Damaged Items", result.Kpis.DamagedItems.ToString()), ("Expired Items", result.Kpis.ExpiredItems.ToString()),
            ("Top Waste Category", result.Kpis.TopWasteCategory ?? "—"),
        };
        if (includeCost) kpis.Insert(0, ("Total Write-off Value", result.Kpis.TotalWriteOffValue.ToString("0.##")));
        if (includeCost) kpis.Add(("Waste % of Sales", result.Kpis.WastePctOfSales.ToString("0.00")));
        return await BuildExportFile(format, "Waste / Spoilage Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis.ToArray(), headers, rows, $"waste-spoilage-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private static void MaskWasteSpoilageCost(WasteSpoilageResult r)
    {
        r.Kpis.TotalWriteOffValue = 0; r.Kpis.WastePctOfSales = 0;
        foreach (var row in r.Rows) row.CostValue = 0;
    }

    // ───────────────────────────────────────────────────────────────────────
    // 12b. Stock Reconciliation (RPT-INV-RECON)
    //
    // The FRD names three filters — "Stock Review", "Stock Audit", "Inventory Reconciliation" —
    // which in this schema are one thing: a StockCount session (start → count → review → approve,
    // posting variance as adjustments only on final approval). stock_count_items already carries
    // system_quantity, counted_quantity and variance; nothing has ever read them. This report is
    // that read.
    //
    // Branch AND warehouse: StockCount now carries an optional warehouse_id alongside branch_id
    // (exactly one set, same pair as InventoryAdjustment), so a warehouse stock-take reports here
    // too — each row names whichever location the session was for.
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("stock-reconciliation")]
    [RequirePermission("Reports", PermAction.View)]
    [RequirePlanFeature("stocktaking")]
    public async Task<IActionResult> GetStockReconciliation(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? branchId,
        [FromQuery] Guid[]? warehouseId, [FromQuery] Guid[]? productId, [FromQuery] Guid[]? categoryId,
        [FromQuery] Guid[]? countedBy, [FromQuery] string[]? status, [FromQuery] bool varianceOnly = false,
        [FromQuery] string? countType = null)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildStockReconciliationAsync(rangeFrom, rangeTo, branchId ?? [], warehouseId ?? [],
            productId ?? [], categoryId ?? [], countedBy ?? [], status ?? [], varianceOnly, countType);
        if (!await CanViewFinanceAsync()) MaskStockReconciliationCost(result);
        return Ok(result);
    }

    [HttpGet("stock-reconciliation/export")]
    [RequirePermission("Reports", PermAction.Export)]
    [RequirePlanFeature("stocktaking")]
    public async Task<IActionResult> ExportStockReconciliation(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? branchId,
        [FromQuery] Guid[]? warehouseId, [FromQuery] Guid[]? productId, [FromQuery] Guid[]? categoryId,
        [FromQuery] Guid[]? countedBy, [FromQuery] string[]? status, [FromQuery] bool varianceOnly = false,
        [FromQuery] string? countType = null, [FromQuery] Guid? exportedBy = null, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildStockReconciliationAsync(rangeFrom, rangeTo, branchId ?? [], warehouseId ?? [],
            productId ?? [], categoryId ?? [], countedBy ?? [], status ?? [], varianceOnly, countType);
        var includeCost = await CanViewFinanceAsync();
        if (!includeCost) MaskStockReconciliationCost(result);
        var headers = includeCost
            ? new[] { "Count ID", "Count Type", "Started At", "Completed At", "Branch/Warehouse", "SKU", "Product Name", "Category", "System Qty", "Counted Qty", "Variance", "Variance Value", "Started By", "Performed By", "Reviewed By", "Approved By", "Reconciliation Status" }
            : new[] { "Count ID", "Count Type", "Started At", "Completed At", "Branch/Warehouse", "SKU", "Product Name", "Category", "System Qty", "Counted Qty", "Variance", "Started By", "Performed By", "Reviewed By", "Approved By", "Reconciliation Status" };
        var rows = result.Rows.Select(r => includeCost
            ? new object?[] { r.CountId, r.CountType ?? "unspecified", r.StartedAt, r.CompletedAt, r.Branch ?? r.Warehouse ?? "—", r.Sku, r.ProductName, r.Category, r.SystemQty, r.CountedQty, r.Variance, r.VarianceValue, r.StartedBy, r.PerformedBy ?? "—", r.ReviewedBy ?? "—", r.ApprovedBy ?? "—", r.Status }
            : new object?[] { r.CountId, r.CountType ?? "unspecified", r.StartedAt, r.CompletedAt, r.Branch ?? r.Warehouse ?? "—", r.Sku, r.ProductName, r.Category, r.SystemQty, r.CountedQty, r.Variance, r.StartedBy, r.PerformedBy ?? "—", r.ReviewedBy ?? "—", r.ApprovedBy ?? "—", r.Status }
        ).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, FirstBranchOrNull(branchId),
            $"{{\"report\":\"stock-reconciliation\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new List<(string, string)> {
            ("Count Sessions", result.Kpis.SessionCount.ToString()),
            ("Items Counted", result.Kpis.ItemsCounted.ToString()),
            ("Items With Variance", result.Kpis.ItemsWithVariance.ToString()),
            ("Count Accuracy %", result.Kpis.AccuracyPct.ToString("0.00")),
            ("Net Variance Units", result.Kpis.NetVarianceUnits.ToString("0.##")),
            ("Pending Review", result.Kpis.PendingReviewCount.ToString()),
            ("Pending Approval", result.Kpis.PendingApprovalCount.ToString()),
        };
        if (includeCost) kpis.Add(("Net Variance Value", result.Kpis.NetVarianceValue.ToString("0.##")));
        return await BuildExportFile(format, "Stock Reconciliation Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis.ToArray(), headers, rows, $"stock-reconciliation-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private static void MaskStockReconciliationCost(StockReconciliationResult r)
    {
        r.Kpis.NetVarianceValue = 0; r.Kpis.AbsVarianceValue = 0;
        foreach (var row in r.Rows) row.VarianceValue = 0;
    }

    private async Task<StockReconciliationResult> BuildStockReconciliationAsync(
        DateTime rangeFrom, DateTime rangeToExclusive, Guid[] branchIds, Guid[] warehouseIds, Guid[] productIds,
        Guid[] categoryIds, Guid[] countedByIds, string[] statuses, bool varianceOnly, string? countType = null)
    {
        var (scopeRole, scopeBranchId) = GetCallerContext();
        // Branch-scoped roles are pinned to their own branch regardless of what was requested, and
        // never see warehouse sessions — reviewing/approving a warehouse count is tenant_admin-only
        // (see StockCountsController), so surfacing them here would show a branch user a session
        // they can never act on.
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue)
        {
            branchIds = [scopeBranchId.Value];
            warehouseIds = [];
        }

        // Ranged on StartedAt, not CompletedAt: an open session has no completion date, and a
        // reconciliation report that hides in-progress counts is exactly the one you can't use to
        // chase them up. Branch/warehouse/status/countedBy are NOT applied as SQL .Contains(...)
        // filters here — the MySQL EF Core provider used in this repo throws at query time on a
        // parameterized Guid[]/string[] IN-list (see the ef-mysql-inlist-gotcha memory / the
        // identical comment on the StockCountItems loop below). Sessions in a date range are few
        // — "a branch runs a handful a month" — so fetching them all and narrowing in-memory is cheap.
        var counts = await db.StockCounts
            .Include(c => c.Branch)
            .Include(c => c.Warehouse)
            .Where(c => c.StartedAt >= rangeFrom && c.StartedAt < rangeToExclusive)
            .ToListAsync();

        if (branchIds.Length > 0 || warehouseIds.Length > 0)
            counts = [.. counts.Where(c =>
                (branchIds.Length > 0 && c.BranchId.HasValue && branchIds.Contains(c.BranchId.Value)) ||
                (warehouseIds.Length > 0 && c.WarehouseId.HasValue && warehouseIds.Contains(c.WarehouseId.Value)))];
        if (statuses.Length > 0) counts = [.. counts.Where(c => statuses.Contains(c.Status))];
        // The FRD's three filters. "unspecified" selects sessions that predate count_type — they
        // are a real group a user needs to find, not an absence to hide.
        if (countType == "unspecified") counts = [.. counts.Where(c => c.CountType == null)];
        else if (!string.IsNullOrEmpty(countType)) counts = [.. counts.Where(c => c.CountType == countType)];
        // Either end of the session — whoever opened it or whoever performed/signed it off.
        if (countedByIds.Length > 0) counts = [.. counts.Where(c =>
            (c.StartedBy.HasValue && countedByIds.Contains(c.StartedBy.Value)) ||
            (c.CompletedBy.HasValue && countedByIds.Contains(c.CompletedBy.Value)))];

        var countIds = counts.Select(c => c.Id).ToList();

        // One query per session rather than a `countIds.Contains(...)` IN-list — same provider
        // limitation. Product/category narrowing also happens in-memory below rather than as a
        // second .Contains(...) on this query, for the same reason.
        var items = new List<Models.StockCountItem>();
        foreach (var id in countIds)
        {
            var itemQ = db.StockCountItems
                .Include(i => i.Product).ThenInclude(p => p!.Category)
                .Where(i => i.StockCountId == id && i.Product != null);
            if (varianceOnly) itemQ = itemQ.Where(i => i.Variance != null && i.Variance != 0);
            items.AddRange(await itemQ.ToListAsync());
        }
        if (productIds.Length > 0) items = [.. items.Where(i => productIds.Contains(i.ProductId))];
        if (categoryIds.Length > 0) items = [.. items.Where(i => i.Product!.CategoryId.HasValue && categoryIds.Contains(i.Product!.CategoryId!.Value))];

        // Resolve the four actor columns to names in one pass. StockCount's actor fields are bare
        // Guids with no FK, so this is a manual join.
        var userIds = counts.SelectMany(c => new[] { c.StartedBy, c.CompletedBy, c.ReviewedBy, c.ApprovedBy })
            .Where(g => g.HasValue).Select(g => g!.Value).Distinct().ToList();
        var userNames = new Dictionary<Guid, string>();
        foreach (var uid in userIds)
        {
            var name = await db.Users.Where(u => u.Id == uid).Select(u => u.FullName).FirstOrDefaultAsync();
            if (name != null) userNames[uid] = name;
        }
        string NameOf(Guid? id) => id.HasValue && userNames.TryGetValue(id.Value, out var n) ? n : "—";

        var countsById = counts.ToDictionary(c => c.Id);
        var rows = items.Select(i =>
        {
            var c = countsById[i.StockCountId];
            var costPrice = i.Product!.CostPrice ?? i.Product.BasePrice;
            return new StockReconciliationRow
            {
                CountId = c.Id.ToString()[..8],
                StockCountId = c.Id,
                CountType = c.CountType,
                StartedAt = c.StartedAt,
                CompletedAt = c.CompletedAt,
                Branch = c.Branch?.Name,
                Warehouse = c.Warehouse?.Name,
                Sku = i.Product.Sku,
                ProductName = i.Product.Name,
                Category = i.Product.Category?.Name ?? "—",
                SystemQty = i.SystemQuantity,
                CountedQty = i.CountedQuantity,
                Variance = i.Variance,
                // Signed: a negative variance is stock that was there on paper and isn't on the
                // shelf, i.e. a loss. Summing these nets shrinkage against overage, which is the
                // number finance actually wants.
                VarianceValue = (i.Variance ?? 0) * costPrice,
                StartedBy = NameOf(c.StartedBy),
                // Who physically performed the count (submitted it for review) — distinct from
                // StartedBy, which is whoever opened the session.
                PerformedBy = c.CompletedBy.HasValue ? NameOf(c.CompletedBy) : null,
                ReviewedBy = c.ReviewedBy.HasValue ? NameOf(c.ReviewedBy) : null,
                ApprovedBy = c.ApprovedBy.HasValue ? NameOf(c.ApprovedBy) : null,
                Status = c.Status,
                RejectionReason = c.RejectionReason,
                CountedAt = i.CountedAt,
            };
        })
        .OrderByDescending(r => r.StartedAt).ThenBy(r => r.ProductName)
        .ToList();

        // Accuracy is over *counted* lines only — a pending line is not evidence of accuracy, and
        // counting it as a match would flatter an unfinished session towards 100%.
        var counted = rows.Where(r => r.CountedQty != null).ToList();
        var withVariance = counted.Count(r => (r.Variance ?? 0) != 0);
        return new StockReconciliationResult
        {
            Kpis = new StockReconciliationKpis
            {
                SessionCount = rows.Select(r => r.StockCountId).Distinct().Count(),
                ItemsCounted = counted.Count,
                ItemsPending = rows.Count - counted.Count,
                ItemsWithVariance = withVariance,
                AccuracyPct = counted.Count == 0 ? 0 : Math.Round((decimal)(counted.Count - withVariance) / counted.Count * 100, 2),
                NetVarianceUnits = counted.Sum(r => r.Variance ?? 0),
                NetVarianceValue = counted.Sum(r => r.VarianceValue),
                AbsVarianceValue = counted.Sum(r => Math.Abs(r.VarianceValue)),
                PendingReviewCount = counts.Count(c => c.Status == "pending_review"),
                PendingApprovalCount = counts.Count(c => c.Status == "pending_approval"),
            },
            Rows = rows,
        };
    }

    private async Task<WasteSpoilageResult> BuildWasteSpoilageAsync(
        DateTime rangeFrom, DateTime rangeToExclusive, Guid[] branchIds, string? reasonFilter,
        Guid[] productIds, Guid[] categoryIds, Guid[] adjustedByIds, bool isTobacco,
        Guid[] warehouseIds, Guid[] approvedByIds, string[] approvalStatuses)
    {
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) { branchIds = [scopeBranchId.Value]; warehouseIds = []; }

        // Branch/warehouse/category/product/actor/status are narrowed in memory below, not via SQL
        // .Contains(...) — the MySQL EF Core provider throws on a parameterized Guid[]/string[]
        // IN-list (see the ef-mysql-inlist-gotcha memory).
        var adjQ = db.InventoryAdjustments.Include(a => a.Product).ThenInclude(p => p!.Category).Include(a => a.Branch).Include(a => a.Batch)
            // Both user navigations are needed for the FRD's "created by" / "approved by" columns —
            // without them the projection below only has Guids to render.
            .Include(a => a.AdjustedByUser).Include(a => a.ApprovedByUser)
            .Where(a => (a.AdjustmentType == "waste" || a.AdjustmentType == "damage" || a.AdjustmentType == "expired"
                || a.AdjustmentType == "theft" || a.AdjustmentType == "other") && a.CreatedAt >= rangeFrom && a.CreatedAt < rangeToExclusive);
        if (!string.IsNullOrEmpty(reasonFilter)) adjQ = adjQ.Where(a => a.AdjustmentType == reasonFilter);
        if (isTobacco) adjQ = adjQ.Where(a => a.Product != null && a.Product.IsTobacco);
        var adjustments = await adjQ.OrderByDescending(a => a.CreatedAt).ToListAsync();

        if (branchIds.Length > 0 || warehouseIds.Length > 0)
            adjustments = [.. adjustments.Where(a =>
                (branchIds.Length > 0 && a.BranchId.HasValue && branchIds.Contains(a.BranchId.Value)) ||
                (warehouseIds.Length > 0 && a.WarehouseId.HasValue && warehouseIds.Contains(a.WarehouseId.Value)))];
        if (productIds.Length > 0) adjustments = [.. adjustments.Where(a => productIds.Contains(a.ProductId))];
        if (categoryIds.Length > 0) adjustments = [.. adjustments.Where(a => a.Product != null && a.Product.CategoryId.HasValue && categoryIds.Contains(a.Product.CategoryId.Value))];
        if (adjustedByIds.Length > 0) adjustments = [.. adjustments.Where(a => a.AdjustedBy.HasValue && adjustedByIds.Contains(a.AdjustedBy.Value))];
        if (approvedByIds.Length > 0) adjustments = [.. adjustments.Where(a => a.ApprovedBy.HasValue && approvedByIds.Contains(a.ApprovedBy.Value))];
        if (approvalStatuses.Length > 0) adjustments = [.. adjustments.Where(a => a.ApprovalStatus != null && approvalStatuses.Contains(a.ApprovalStatus))];

        var salesByBranch = await db.Orders
            .Where(o => o.CreatedAt >= rangeFrom && o.CreatedAt < rangeToExclusive && o.PaymentStatus == "paid")
            .GroupBy(o => o.BranchId)
            .Select(g => new { BranchId = g.Key, Total = g.Sum(o => o.TotalAmount - o.TaxAmount) })
            .ToListAsync();
        var totalSales = branchIds.Length > 0
            ? salesByBranch.Where(x => branchIds.Contains(x.BranchId)).Sum(x => x.Total)
            : salesByBranch.Sum(x => x.Total);

        var rows = adjustments.Select(a =>
        {
            var costOrPrice = a.Product?.CostPrice ?? a.Product?.BasePrice ?? 0m;
            return new WasteSpoilageRow
            {
                WasteId = a.Id.ToString()[..8], DateTime = a.CreatedAt, Sku = a.Product?.Sku ?? "—", ProductName = a.Product?.Name ?? "—",
                Category = a.Product?.Category?.Name ?? "—", Branch = a.Branch?.Name ?? "—", IsTobacco = a.Product?.IsTobacco ?? false,
                Qty = a.Quantity, Reason = a.AdjustmentType,
                // Disposal Note should be the adjustment's own free-text Notes; fall back to the (mandatory)
                // Reason narrative when no separate note was recorded, since Notes is optional and often unset.
                CostValue = a.Quantity * costOrPrice, Notes = a.Notes ?? a.Reason,
                BatchNumber = a.Batch?.BatchNumber, ExpiryDate = a.Batch?.ExpiryDate,
                AdjustmentId = a.Id,
                CreatedBy = a.AdjustedByUser?.FullName ?? "—",
                CreatedById = a.AdjustedBy,
                ApprovedBy = a.ApprovedByUser?.FullName,
                ApprovalStatus = a.ApprovalStatus,
                ApprovedAt = a.ApprovedAt,
                RejectionReason = a.RejectionReason,
            };
        }).ToList();

        // Headline value counts only write-offs that actually left inventory (immediate/auto or
        // approved). Pending rows still appear in the list below so they can be reviewed, but they
        // haven't destroyed value yet, so they must not inflate the total or the %-of-sales figure.
        var totalWriteOff = rows.Where(r => r.ApprovalStatus == null || r.ApprovalStatus == "approved").Sum(r => r.CostValue);
        return new WasteSpoilageResult
        {
            Kpis = new WasteSpoilageKpis
            {
                TotalWriteOffValue = totalWriteOff,
                ExpiredItems = rows.Count(r => r.Reason == "expired"),
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
    [RequirePermission("Reports", PermAction.View)]
    public async Task<IActionResult> GetReturnsRefunds(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] string? refundMethod, [FromQuery] string? status,
        [FromQuery] string? customerType, [FromQuery] string? reason, [FromQuery] Guid? productId, [FromQuery] Guid? processedBy)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildReturnsRefundsAsync(rangeFrom, rangeTo, branchId, refundMethod, status, customerType, reason, productId, processedBy));
    }

    [HttpGet("returns-refunds/export")]
    [RequirePermission("Reports", PermAction.Export)]
    public async Task<IActionResult> ExportReturnsRefunds(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] string? refundMethod, [FromQuery] string? status,
        [FromQuery] string? customerType, [FromQuery] string? reason, [FromQuery] Guid? productId, [FromQuery] Guid? processedBy,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildReturnsRefundsAsync(rangeFrom, rangeTo, branchId, refundMethod, status, customerType, reason, productId, processedBy);
        var headers = new[] { "Return ID", "Original Order ID", "Invoice No.", "Date/Time", "Branch", "Cashier", "Customer", "Return Type", "Reason", "SKU(s)", "Qty", "Refund Method", "Refund Amount", "VAT Reversal", "Approved By", "Status" };
        var rows = result.Rows.Select(r => new object?[]
        {
            r.ReturnId, r.OriginalOrderId, r.InvoiceNo, r.DateTime, r.Branch, r.Cashier, r.Customer, r.ReturnType, r.Reason,
            r.Skus, r.Qty, r.RefundMethod, r.RefundAmount, r.VatReversal, r.ApprovedBy, r.Status,
        }).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"returns-refunds\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Return Count", result.Kpis.ReturnCount.ToString()), ("Refund Value", result.Kpis.RefundValue.ToString("0.##")),
            ("VAT Reversed", result.Kpis.VatReversed.ToString("0.##")), ("Top Return Reason", result.Kpis.TopReturnReason ?? "—"),
            ("Refunds Pending", result.Kpis.RefundsPending.ToString()),
        };
        return await BuildExportFile(format, "Return / Refund Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"returns-refunds-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<ReturnsRefundsResult> BuildReturnsRefundsAsync(
        DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, string? refundMethod, string? status,
        string? customerType = null, string? reason = null, Guid? productId = null, Guid? processedBy = null)
    {
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) branchId = scopeBranchId;
        var retQ = db.CustomerReturns
            .Include(r => r.Order).ThenInclude(o => o!.Cashier)
            .Include(r => r.Customer).Include(r => r.Branch).Include(r => r.ApprovedByUser)
            .Include(r => r.Items).ThenInclude(i => i.Product)
            .Where(r => r.CreatedAt >= rangeFrom && r.CreatedAt < rangeToExclusive);
        if (branchId.HasValue) retQ = retQ.Where(r => r.BranchId == branchId);
        if (!string.IsNullOrEmpty(refundMethod)) retQ = retQ.Where(r => r.RefundMethod == refundMethod);
        if (!string.IsNullOrEmpty(status)) retQ = retQ.Where(r => r.Status == status);
        if (!string.IsNullOrEmpty(reason)) retQ = retQ.Where(r => r.Reason == reason);
        if (productId.HasValue) retQ = retQ.Where(r => r.Items.Any(i => i.ProductId == productId));
        if (processedBy.HasValue) retQ = retQ.Where(r => r.ProcessedBy == processedBy);
        if (customerType == "registered") retQ = retQ.Where(r => r.CustomerId != null);
        else if (customerType == "walk-in") retQ = retQ.Where(r => r.CustomerId == null);
        // Look up invoice numbers via a correlated subquery (retQ.Select(...) as the Contains
        // argument), not an in-memory List<Guid> — the MySQL EF Core provider used here can't
        // assign a type mapping to a parameterized List<Guid> IN-list (same constraint noted in
        // BuildCashierSalesAsync), which throws InvalidOperationException at query time.
        var returnOrderIds = retQ.Select(r => r.OrderId);
        var invoiceMap = await db.ZatcaInvoices.Where(z => returnOrderIds.Contains(z.OrderId))
            .ToDictionaryAsync(z => z.OrderId, z => z.InvoiceNumber);

        var returns = await retQ.OrderByDescending(r => r.CreatedAt).ToListAsync();

        var rows = returns.Select(r =>
        {
            // r.Order is already eager-loaded via .Include(r => r.Order) above, so its
            // TotalAmount/TaxAmount are available directly — no second Orders query needed.
            var vatReversal = 0m;
            if (r.Order is { TotalAmount: > 0 } o)
                vatReversal = Math.Round(r.RefundAmount / o.TotalAmount * o.TaxAmount, 2);
            return new ReturnRefundRow
            {
                ReturnId = r.ReturnNumber ?? r.Id.ToString()[..8], OriginalOrderId = r.Order?.OrderNumber ?? "—",
                InvoiceNo = invoiceMap.GetValueOrDefault(r.OrderId) ?? "—",
                DateTime = r.CreatedAt, Branch = r.Branch?.Name ?? "—", Cashier = r.Order?.Cashier?.FullName ?? "—",
                Customer = r.Customer?.FullName ?? "Walk-in", ReturnType = r.ReturnType, Reason = r.Reason,
                Skus = r.Items.Count > 0 ? string.Join(", ", r.Items.Select(i => i.Product?.Sku ?? "—")) : "—",
                Qty = r.Items.Sum(i => i.Quantity),
                RefundMethod = r.RefundMethod, RefundAmount = r.RefundAmount, VatReversal = vatReversal,
                ApprovedBy = r.ApprovedByUser?.FullName ?? "—", Status = r.Status,
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
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] Guid? staffId, [FromQuery] string? status,
        [FromQuery] Guid? roleId, [FromQuery] Guid? terminalId)
    {
        // See CanViewReportOrSelfAsync — same self-scoped carve-out as cashier-sales, for a
        // staff member viewing only their own check-in/out history.
        if (!await CanViewReportOrSelfAsync(staffId))
            return StatusCode(403, new { message = "You do not have permission to view Reports." });

        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: false);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildAttendanceShiftAsync(rangeFrom, rangeTo, branchId, staffId, status, roleId, terminalId));
    }

    [HttpGet("attendance-shift/export")]
    [RequirePermission("Reports", PermAction.Export)]
    public async Task<IActionResult> ExportAttendanceShift(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] Guid? staffId, [FromQuery] string? status,
        [FromQuery] Guid? roleId, [FromQuery] Guid? terminalId,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: false);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildAttendanceShiftAsync(rangeFrom, rangeTo, branchId, staffId, status, roleId, terminalId);
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
        return await BuildExportFile(format, "Attendance / Shift Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"attendance-shift-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<AttendanceShiftResult> BuildAttendanceShiftAsync(
        DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, Guid? staffId, string? status,
        Guid? roleId = null, Guid? terminalId = null)
    {
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) branchId = scopeBranchId;
        var shiftsQ = db.CashierShifts.Include(s => s.Cashier).ThenInclude(c => c!.Role).Include(s => s.Terminal).Include(s => s.Branch)
            .Where(s => s.OpenedAt >= rangeFrom && s.OpenedAt < rangeToExclusive);
        if (branchId.HasValue) shiftsQ = shiftsQ.Where(s => s.BranchId == branchId);
        if (staffId.HasValue) shiftsQ = shiftsQ.Where(s => s.CashierId == staffId);
        if (!string.IsNullOrEmpty(status)) shiftsQ = shiftsQ.Where(s => s.Status == status);
        if (roleId.HasValue) shiftsQ = shiftsQ.Where(s => s.Cashier != null && s.Cashier.RoleId == roleId);
        if (terminalId.HasValue) shiftsQ = shiftsQ.Where(s => s.TerminalId == terminalId);
        var shifts = await shiftsQ.OrderByDescending(s => s.OpenedAt).ToListAsync();

        var attendance = await db.StaffAttendances
            .Where(a => a.CheckIn != null && a.CheckIn >= rangeFrom && a.CheckIn < rangeToExclusive)
            .ToListAsync();
        // Best-effort match to a shift: same staff member, same calendar day as the shift opened.
        var attendanceByUserDay = attendance
            .GroupBy(a => (a.UserId, Day: a.CheckIn!.Value.Date))
            .ToDictionary(g => g.Key, g => g.First());

        // Scoped by the same date/branch/staff filters as shiftsQ rather than a shiftIds.Contains(...)
        // list — the MySQL EF Core provider used here cannot assign a type mapping to a parameterized
        // List<Guid> IN-list (see the identical note on BuildCashierSalesAsync above).
        var ordersQ = db.Orders.Where(o => o.ShiftId != null && o.CreatedAt >= rangeFrom && o.CreatedAt < rangeToExclusive);
        if (branchId.HasValue) ordersQ = ordersQ.Where(o => o.BranchId == branchId);
        if (staffId.HasValue) ordersQ = ordersQ.Where(o => o.CashierId == staffId);
        var orderCountByShift = await ordersQ
            .GroupBy(o => o.ShiftId!.Value).Select(g => new { ShiftId = g.Key, Count = g.Count() }).ToDictionaryAsync(g => g.ShiftId, g => g.Count);

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
                Orders = orderCountByShift.GetValueOrDefault(s.Id), Sales = s.TotalSales,
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
    // "PosSettingsRecord" was a typo that matched nothing — SettingsController writes "PosSettings",
    // so POS settings changes were never actually masked despite being listed here.
    private static readonly string[] SensitiveAuditEntities = ["ZatcaSettings", "ZatcaIdentity", "PosSettings", "TaxFeeRule", "User"];

    // Masking "User" hid the one field that makes a failed login reviewable: the attempted email.
    // AuthController logs login_failed against entityType "User", so the FRD's own "Auditor reviews
    // failed login attempts" scenario produced rows reading ***masked*** / ***masked*** with a null
    // actor — identifying neither who tried nor what they tried. The attempted address is the
    // forensic payload, not the secret; credentials are never written to the log in the first place.
    private static readonly string[] UnmaskedAuditActions = ["login_failed"];

    [HttpGet("audit-trail")]
    [RequirePermission("Reports", PermAction.View)]
    public async Task<IActionResult> GetAuditTrail(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? userId, [FromQuery] string? module,
        [FromQuery] string? severity, [FromQuery] Guid? branchId)
    {
        var (rangeFrom, rangeTo, error) = ResolveAuditRange(from, to);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildAuditTrailAsync(rangeFrom, rangeTo, userId, module, severity, branchId));
    }

    [HttpGet("audit-trail/export")]
    [RequirePermission("Reports", PermAction.Export)]
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
        return await BuildExportFile(format, "Audit Trail Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
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
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) branchId = scopeBranchId;
        var q = db.AuditLogs.Include(a => a.User).ThenInclude(u => u!.Role).Include(a => a.Branch)
            .Where(a => a.CreatedAt >= rangeFrom && a.CreatedAt < rangeToExclusive);
        if (userId.HasValue) q = q.Where(a => a.UserId == userId);
        if (!string.IsNullOrEmpty(module)) q = q.Where(a => a.EntityType == module);
        if (!string.IsNullOrEmpty(severity)) q = q.Where(a => a.Severity == severity);
        if (branchId.HasValue) q = q.Where(a => a.BranchId == branchId);
        // Safety cap — audit_logs can grow unbounded; large ranges should use Export instead (FRD §5.3 Apply Filters rule).
        // Default view sorts severity first (FRD §7.14) — critical, then warning, then info — each bucket newest first.
        var logs = await q
            .OrderByDescending(a => a.Severity == "critical" ? 2 : a.Severity == "warning" ? 1 : 0)
            .ThenByDescending(a => a.CreatedAt)
            .Take(2000)
            .ToListAsync();

        var rows = logs.Select(a =>
        {
            var masked = a.EntityType != null
                && SensitiveAuditEntities.Contains(a.EntityType)
                && !UnmaskedAuditActions.Contains(a.Action);
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
    [RequirePermission("Reports", PermAction.View)]
    [RequirePlanFeature("pricing_promotions")]
    public async Task<IActionResult> GetDiscounts([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] string? discountType)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildDiscountsAsync(rangeFrom, rangeTo, branchId, discountType);
        if (!await CanViewFinanceAsync()) MaskDiscountsMargin(result);
        return Ok(result);
    }

    [HttpGet("discounts/export")]
    [RequirePermission("Reports", PermAction.Export)]
    [RequirePlanFeature("pricing_promotions")]
    public async Task<IActionResult> ExportDiscounts(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] string? discountType,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildDiscountsAsync(rangeFrom, rangeTo, branchId, discountType);
        var includeMargin = await CanViewFinanceAsync();
        if (!includeMargin) MaskDiscountsMargin(result);
        var headers = includeMargin
            ? new[] { "Transaction ID", "Invoice No.", "Date/Time", "Branch", "Cashier", "Customer Type", "Discount Type", "Coupon Code", "Discount %", "Discount Amount", "Loyalty Amount", "Net Sales After Discount", "Margin Impact" }
            : new[] { "Transaction ID", "Invoice No.", "Date/Time", "Branch", "Cashier", "Customer Type", "Discount Type", "Coupon Code", "Discount %", "Discount Amount", "Loyalty Amount", "Net Sales After Discount" };
        var rows = result.Rows.Select(r => includeMargin
            ? new object?[] { r.TransactionId, r.InvoiceNo, r.DateTime, r.Branch, r.Cashier, r.CustomerType, r.DiscountType, r.CouponCode, r.DiscountPct, r.DiscountAmount, r.LoyaltyDiscountAmount, r.NetSalesAfterDiscount, r.MarginImpact }
            : new object?[] { r.TransactionId, r.InvoiceNo, r.DateTime, r.Branch, r.Cashier, r.CustomerType, r.DiscountType, r.CouponCode, r.DiscountPct, r.DiscountAmount, r.LoyaltyDiscountAmount, r.NetSalesAfterDiscount }
        ).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"discounts\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new List<(string, string)>
        {
            ("Total Discount Value", result.Kpis.TotalDiscountValue.ToString("0.##")), ("Manual Discount Value", result.Kpis.ManualDiscountValue.ToString("0.##")),
            ("Loyalty Discount Value", result.Kpis.LoyaltyDiscountValue.ToString("0.##")),
            ("Coupon Usage", result.Kpis.CouponUsage.ToString()), ("Discount % of Sales", result.Kpis.DiscountPctOfSales.ToString("0.0")),
        };
        if (includeMargin) kpis.Add(("Margin Impact", result.Kpis.MarginImpact?.ToString("0.##") ?? "N/A"));
        return await BuildExportFile(format, "Discount Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis.ToArray(), headers, rows, $"discounts-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private static void MaskDiscountsMargin(DiscountsResult r)
    {
        r.Kpis.MarginImpact = null;
        foreach (var row in r.Rows) row.MarginImpact = null;
    }

    private async Task<DiscountsResult> BuildDiscountsAsync(DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, string? discountType)
    {
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) branchId = scopeBranchId;
        var ordersQ = db.Orders.Include(o => o.Branch).Include(o => o.Cashier).Include(o => o.Coupon)
            .Where(o => o.DiscountAmount > 0 && o.CreatedAt >= rangeFrom && o.CreatedAt < rangeToExclusive && o.PaymentStatus == "paid");
        if (branchId.HasValue) ordersQ = ordersQ.Where(o => o.BranchId == branchId);
        var orders = await ordersQ.OrderByDescending(o => o.CreatedAt).ToListAsync();

        var rows = orders.Select(o =>
        {
            // Coupon takes precedence in the (rare) case an order combines a coupon with loyalty
            // redemption — same simplification this report already made for coupon+manual-discount
            // combos (one row, one primary type). LoyaltyDiscountAmount below still captures the
            // loyalty slice regardless of which bucket the row lands in.
            var type = o.CouponId.HasValue ? "coupon" : o.LoyaltyDiscountAmount > 0 ? "loyalty" : "manual";
            return new DiscountRow
            {
                TransactionId = o.Id.ToString()[..8], InvoiceNo = o.OrderNumber, DateTime = o.CreatedAt,
                Branch = o.Branch?.Name ?? "—", Cashier = o.Cashier?.FullName ?? "—",
                CustomerType = o.CustomerId.HasValue ? "Registered" : "Walk-in",
                DiscountType = type, CouponCode = o.Coupon?.Code,
                DiscountPct = o.Subtotal > 0 ? Math.Round(o.DiscountAmount / o.Subtotal * 100, 1) : 0m,
                DiscountAmount = o.DiscountAmount, LoyaltyDiscountAmount = o.LoyaltyDiscountAmount,
                NetSalesAfterDiscount = o.Subtotal - o.DiscountAmount,
                // A discount reduces net sales with no corresponding change to COGS, so it reduces
                // gross margin dollar-for-dollar (FRD §7.15).
                MarginImpact = o.DiscountAmount,
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
                // Sums the loyalty slice across ALL rows (not just ones tagged "loyalty"), so a
                // coupon+loyalty combo order's redeemed points still count here.
                LoyaltyDiscountValue = rows.Sum(r => r.LoyaltyDiscountAmount),
                CouponUsage = rows.Count(r => r.DiscountType == "coupon"),
                DiscountPctOfSales = totalNet > 0 ? Math.Round(rows.Sum(r => r.DiscountAmount) / totalNet * 100, 1) : 0m,
                MarginImpact = rows.Sum(r => r.MarginImpact ?? 0m),
            },
            Rows = rows,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 17. VAT / ZATCA (RPT-COMPLIANCE-ZATCA-VAT)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("vat-zatca")]
    [RequirePermission("Reports", PermAction.View)]
    [RequirePlanFeature("zatca_compliance")]
    public async Task<IActionResult> GetVatZatca(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] string? zatcaStatus, [FromQuery] string? invoiceType)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildVatZatcaAsync(rangeFrom, rangeTo, branchId, zatcaStatus, invoiceType));
    }

    [HttpGet("vat-zatca/export")]
    [RequirePermission("Reports", PermAction.Export)]
    [RequirePlanFeature("zatca_compliance")]
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
        return await BuildExportFile(format, "VAT / ZATCA Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"vat-zatca-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<VatZatcaResult> BuildVatZatcaAsync(DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, string? zatcaStatus, string? invoiceType)
    {
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) branchId = scopeBranchId;
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
    [RequirePermission("Reports", PermAction.View)]
    public async Task<IActionResult> GetTaxReport([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] Guid? cashierId)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildTaxReportAsync(rangeFrom, rangeTo, branchId, cashierId));
    }

    [HttpGet("tax/export")]
    [RequirePermission("Reports", PermAction.Export)]
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
        return await BuildExportFile(format, "Tax Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"tax-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<TaxReportResult> BuildTaxReportAsync(DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, Guid? cashierId)
    {
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) branchId = scopeBranchId;
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

    // Service Charges (formerly "Fee Report" / briefly "Tobacco Fee Report"). This is NOT a tax
    // report — KSA only recognizes VAT and tobacco excise as real taxes (see the Tobacco Excise
    // report above for that). This one covers Order.CustomFeeAmount only: business-configured
    // surcharges like a delivery fee or card-payment surcharge, entirely separate from tobacco.
    // A prior version of this endpoint merged CustomFeeAmount with TobaccoFeeAmount on the theory
    // they were always the same charge — that was wrong: the seeded "Delivery Service Fee" is a
    // real, active, non-tobacco charge, so an order with just that fee (no tobacco item at all)
    // was being mislabeled "Tobacco Fee". Un-merged here; see BuildTobaccoExciseAsync for the
    // genuinely tobacco-only report, which now carries the company-identity/subtotal treatment
    // this report doesn't need (it isn't reporting a tax).
    [HttpGet("service-charges")]
    [RequirePermission("Reports", PermAction.View)]
    public async Task<IActionResult> GetFeeReport([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] Guid? cashierId)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildFeeReportAsync(rangeFrom, rangeTo, branchId, cashierId));
    }

    [HttpGet("service-charges/export")]
    [RequirePermission("Reports", PermAction.Export)]
    public async Task<IActionResult> ExportFeeReport(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] Guid? cashierId,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildFeeReportAsync(rangeFrom, rangeTo, branchId, cashierId);
        var headers = new[] { "Transaction ID", "Invoice No.", "Date/Time", "Branch", "Cashier", "Customer Type", "Charge Name", "Service Charge Amount" };

        var rows = new List<object?[]>();
        foreach (var branchGroup in result.Rows.GroupBy(r => r.Branch))
        {
            foreach (var r in branchGroup)
                rows.Add(new object?[] { r.TransactionId, r.InvoiceNo, r.DateTime, r.Branch, r.Cashier, r.CustomerType, r.ChargeName, r.ServiceChargeAmount });
            rows.Add(new object?[] { "", "", "", $"Subtotal — {branchGroup.Key}", "", "", "", branchGroup.Sum(r => r.ServiceChargeAmount) });
        }
        if (result.Rows.Count > 0)
            rows.Add(new object?[] { "", "", "", "GRAND TOTAL", "", "", "", result.Rows.Sum(r => r.ServiceChargeAmount) });

        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"service_charges\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Total Service Charges", result.Kpis.TotalServiceCharges.ToString("0.##")), ("Transactions with Charge", result.Kpis.TransactionsWithFees.ToString()),
            ("Average Charge per Transaction", result.Kpis.AverageFeePerTransaction.ToString("0.##")),
        };
        return await BuildExportFile(format, "Service Charges Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"service-charges-{rangeFrom:yyyy-MM-dd}-to-{rangeTo.AddDays(-1):yyyy-MM-dd}");
    }

    private async Task<FeeReportResult> BuildFeeReportAsync(DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, Guid? cashierId)
    {
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) branchId = scopeBranchId;

        // Order.CustomFeeAmount is the business-configured surcharge/delivery-fee total (TaxFeeRule
        // rows with RuleType == "custom_fee"), not tobacco excise. Which named charge(s) made up
        // that total lives in OrderServiceCharge (added alongside OrderDiscount) — orders from
        // before that existed (or from a caller not yet updated to send it) have no rows there, so
        // they fall back to one generic "Service Charge" row for the full amount.
        var ordersQ = db.Orders.Include(o => o.Branch).Include(o => o.Cashier).Include(o => o.ServiceCharges)
            .Where(o => o.CustomFeeAmount > 0 && o.CreatedAt >= rangeFrom && o.CreatedAt < rangeToExclusive && o.PaymentStatus == "paid");
        if (branchId.HasValue) ordersQ = ordersQ.Where(o => o.BranchId == branchId);
        if (cashierId.HasValue) ordersQ = ordersQ.Where(o => o.CashierId == cashierId);
        var orders = await ordersQ.OrderBy(o => o.Branch!.Name).ThenByDescending(o => o.CreatedAt).ToListAsync();

        var rows = new List<FeeRow>();
        foreach (var o in orders)
        {
            var transactionId = o.Id.ToString()[..8];
            var invoiceNo = o.OrderNumber;
            var branch = o.Branch?.Name ?? "—";
            var cashier = o.Cashier?.FullName ?? "—";
            var customerType = o.CustomerId.HasValue ? "Registered" : "Walk-in";

            if (o.ServiceCharges.Count == 0)
            {
                rows.Add(new FeeRow
                {
                    TransactionId = transactionId, InvoiceNo = invoiceNo, DateTime = o.CreatedAt,
                    Branch = branch, Cashier = cashier, CustomerType = customerType,
                    ChargeName = "Service Charge", ServiceChargeAmount = o.CustomFeeAmount,
                });
                continue;
            }

            foreach (var sc in o.ServiceCharges)
            {
                rows.Add(new FeeRow
                {
                    TransactionId = transactionId, InvoiceNo = invoiceNo, DateTime = o.CreatedAt,
                    Branch = branch, Cashier = cashier, CustomerType = customerType,
                    ChargeName = sc.Name, ServiceChargeAmount = sc.Amount,
                });
            }

            // Guards against partial/rounding drift between the named breakdown and the
            // order-level total — the total is what was actually charged, so any unaccounted
            // remainder still needs to show up rather than silently vanish from the report.
            var unaccounted = o.CustomFeeAmount - o.ServiceCharges.Sum(sc => sc.Amount);
            if (unaccounted > 0.005m)
            {
                rows.Add(new FeeRow
                {
                    TransactionId = transactionId, InvoiceNo = invoiceNo, DateTime = o.CreatedAt,
                    Branch = branch, Cashier = cashier, CustomerType = customerType,
                    ChargeName = "Other Charges", ServiceChargeAmount = unaccounted,
                });
            }
        }

        return new FeeReportResult
        {
            Kpis = new FeeReportKpis
            {
                TotalServiceCharges = rows.Sum(r => r.ServiceChargeAmount),
                TransactionsWithFees = orders.Count,
                AverageFeePerTransaction = orders.Count > 0 ? Math.Round(rows.Sum(r => r.ServiceChargeAmount) / orders.Count, 2) : 0m,
            },
            Rows = rows,
        };
    }

    // Shared by tax-compliance reports (Tobacco Excise) that need the legal entity's name/CR/VAT
    // on export/print — NOT used by the Service Charges report, which isn't reporting a tax.
    // When a specific branch is in scope, use that branch's own ZATCA identity (same SellerName
    // ?? Branch.Name / VatRegistrationNumber ?? CommercialRegistration fallback ZatcaService uses
    // for invoices). For "All Branches", there's no single legal entity to pick correctly, so
    // fall back to the branch with the earliest CreatedAt as a representative default rather
    // than leaving the field blank.
    private async Task<(string LegalName, string Cr, string Vat)> ResolveCompanyInfoAsync(Guid? branchId)
    {
        var branchQ = db.Branches.AsQueryable();
        branchQ = branchId.HasValue ? branchQ.Where(b => b.Id == branchId) : branchQ.OrderBy(b => b.CreatedAt);
        var branch = await branchQ.FirstOrDefaultAsync();
        if (branch is null) return ("—", "—", "—");
        var settings = await db.ZatcaSettings.FirstOrDefaultAsync(z => z.BranchId == branch.Id);
        return (settings?.SellerName ?? branch.Name, branch.CommercialRegistration ?? "—", settings?.VatRegistrationNumber ?? "—");
    }

    // ───────────────────────────────────────────────────────────────────────
    // 20. Tobacco Excise (RPT-COMPLIANCE-TOBACCO-EXCISE)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("tobacco-excise")]
    [RequirePermission("Reports", PermAction.View)]
    public async Task<IActionResult> GetTobaccoExcise([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] Guid? cashierId, [FromQuery] Guid? productId)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildTobaccoExciseAsync(rangeFrom, rangeTo, branchId, cashierId, productId));
    }

    [HttpGet("tobacco-excise/export")]
    [RequirePermission("Reports", PermAction.Export)]
    public async Task<IActionResult> ExportTobaccoExcise(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] Guid? cashierId, [FromQuery] Guid? productId, [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildTobaccoExciseAsync(rangeFrom, rangeTo, branchId, cashierId, productId);
        var headers = new[] { "SKU", "Barcode", "Product Name", "Brand", "Category", "Branch", "Employee", "Units Sold", "Taxable Price", "Excise Rate", "Excise Amount", "VAT Amount", "Returns Qty", "Excise Reversal", "Net Excise", "Compliance Status" };

        var rows = new List<object?[]>
        {
            new object?[] { "Legal Company Name", result.LegalCompanyName, "", "", "", "", "", "", "", "", "", "", "", "", "", "" },
            new object?[] { "Commercial Registration (CR)", result.CommercialRegistrationNumber, "", "", "", "", "", "", "", "", "", "", "", "", "", "" },
            new object?[] { "VAT Registration Number", result.VatRegistrationNumber, "", "", "", "", "", "", "", "", "", "", "", "", "", "" },
            new object?[] { "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "" },
        };
        // Subtotal per branch, then a grand total — same "clear subtotal and grand total
        // calculations" requirement REP-002 asked for, applied to the report that's actually
        // tobacco-only (BuildFeeReportAsync's generic Service Charges report doesn't need this
        // company-identity treatment since it isn't reporting a tax).
        foreach (var branchGroup in result.Rows.GroupBy(r => r.Branch))
        {
            foreach (var r in branchGroup)
                rows.Add(new object?[]
                {
                    r.Sku, r.Barcode, r.ProductName, r.Brand, r.Category, r.Branch, r.Employee, r.UnitsSold, r.TaxablePrice, r.ExciseRate, r.ExciseAmount,
                    r.VatAmount, r.ReturnsQty, r.ExciseReversal, r.NetExcise, r.ComplianceStatus,
                });
            rows.Add(new object?[] { "", "", "", "", "", $"Subtotal — {branchGroup.Key}", "", "", "", "", branchGroup.Sum(r => r.ExciseAmount), "", "", "", branchGroup.Sum(r => r.NetExcise), "" });
        }
        rows.Add(new object?[] { "", "", "", "", "", "GRAND TOTAL", "", "", "", "", result.Rows.Sum(r => r.ExciseAmount), "", "", "", result.Rows.Sum(r => r.NetExcise), "" });

        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"tobacco-excise\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.Rows.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Excise Sales Value", result.Kpis.ExciseSalesValue.ToString("0.##")), ("Excise Tax Amount", result.Kpis.ExciseTaxAmount.ToString("0.##")),
            ("Tobacco Units Sold", result.Kpis.TobaccoUnitsSold.ToString("0.##")), ("Excise Refunds", result.Kpis.ExciseRefunds.ToString("0.##")),
            ("Top Tobacco SKU", result.Kpis.TopTobaccoSku ?? "—"), ("Compliance Exceptions", result.Kpis.ComplianceExceptions.ToString()),
        };
        return await BuildExportFile(format, "Tobacco Excise Report",
            $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}\n{result.LegalCompanyName} · CR: {result.CommercialRegistrationNumber} · VAT: {result.VatRegistrationNumber}",
            kpis, headers, rows, $"tobacco-excise-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    // Drill-down behind one aggregated row (rows are grouped Product+Cashier over the whole period,
    // so the row itself can't show individual transactions) — same on-demand, scoped-by-id pattern
    // as inventory-aging-performance/product-detail and audit-detail/{id}.
    [HttpGet("tobacco-excise/transactions")]
    [RequirePermission("Reports", PermAction.View)]
    public async Task<IActionResult> GetTobaccoExciseTransactions(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid productId, [FromQuery] Guid? cashierId, [FromQuery] Guid? branchId)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) branchId = scopeBranchId;

        var itemsQ = db.OrderItems.Include(i => i.Order).ThenInclude(o => o!.Branch).Include(i => i.Order).ThenInclude(o => o!.Cashier)
            .Where(i => i.ProductId == productId && i.Order != null
                && i.Order.CreatedAt >= rangeFrom && i.Order.CreatedAt < rangeTo && i.Order.PaymentStatus == "paid");
        if (branchId.HasValue) itemsQ = itemsQ.Where(i => i.Order!.BranchId == branchId);
        if (cashierId.HasValue) itemsQ = itemsQ.Where(i => i.Order!.CashierId == cashierId);

        var rows = await itemsQ
            .OrderByDescending(i => i.Order!.CreatedAt)
            .Take(100)
            .Select(i => new TobaccoExciseTransactionRow
            {
                OrderNumber = i.Order!.OrderNumber,
                DateTime = i.Order!.CreatedAt,
                Branch = i.Order!.Branch != null ? i.Order!.Branch.Name : "—",
                Employee = i.Order!.Cashier != null ? i.Order!.Cashier.FullName : "—",
                Quantity = i.Quantity,
                TaxablePrice = i.UnitPrice,
                ExciseAmount = i.TobaccoFeeAmount,
            }).ToListAsync();

        return Ok(rows);
    }

    private async Task<TobaccoExciseResult> BuildTobaccoExciseAsync(DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, Guid? cashierId = null, Guid? productId = null)
    {
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) branchId = scopeBranchId;
        var itemsQ = db.OrderItems.Include(i => i.Order).ThenInclude(o => o!.Branch).Include(i => i.Product).ThenInclude(p => p!.Category)
            .Where(i => i.Order != null && i.Product != null && i.Product.IsTobacco
                && i.Order.CreatedAt >= rangeFrom && i.Order.CreatedAt < rangeToExclusive && i.Order.PaymentStatus == "paid");
        if (branchId.HasValue) itemsQ = itemsQ.Where(i => i.Order!.BranchId == branchId);
        if (cashierId.HasValue) itemsQ = itemsQ.Where(i => i.Order!.CashierId == cashierId);
        if (productId.HasValue) itemsQ = itemsQ.Where(i => i.ProductId == productId);

        var rawItems = await itemsQ.Select(i => new {
            i.ProductId, Sku = i.Product!.Sku, Barcode = i.Product.Barcode, Name = i.Product.Name, Brand = i.Product.Brand,
            Category = i.Product.Category != null ? i.Product.Category.Name : "—", Branch = i.Order!.Branch!.Name,
            CashierId = i.Order.CashierId, Employee = i.Order.Cashier != null ? i.Order.Cashier.FullName : "—",
            Qty = i.Quantity, TaxablePrice = i.UnitPrice, VatAmount = i.TaxAmount, ExciseAmount = i.TobaccoFeeAmount,
        }).ToListAsync();

        var returnsQ = db.CustomerReturnItems.Include(ri => ri.Return).Include(ri => ri.Product)
            .Where(ri => ri.Return != null && ri.Product != null && ri.Product.IsTobacco && ri.Return.CreatedAt >= rangeFrom && ri.Return.CreatedAt < rangeToExclusive);
        if (branchId.HasValue) returnsQ = returnsQ.Where(ri => ri.Return!.BranchId == branchId);
        if (productId.HasValue) returnsQ = returnsQ.Where(ri => ri.ProductId == productId);
        var returnsByProduct = (await returnsQ.Select(ri => new { ri.ProductId, ri.Quantity }).ToListAsync())
            .GroupBy(x => x.ProductId).ToDictionary(g => g.Key, g => g.Sum(x => x.Quantity));

        // Employee breakdown ("sold products by ... employee") — grouped by product AND cashier
        // rather than product alone, so the same tobacco SKU sold by different cashiers shows as
        // separate rows instead of one row that can only ever be attributed to whichever cashier
        // EF's grouping happened to pick first.
        var totalUnitsByProduct = rawItems.GroupBy(x => x.ProductId).ToDictionary(g => g.Key, g => g.Sum(x => x.Qty));

        var rows = rawItems.GroupBy(x => new { x.ProductId, x.CashierId }).Select(g =>
        {
            var f = g.First();
            var unitsSold = g.Sum(x => x.Qty);
            var taxableBase = g.Sum(x => x.TaxablePrice * x.Qty);
            // ExciseAmount is the amount actually persisted per line at checkout (OrderItem.TobaccoFeeAmount)
            // rather than recomputed from a report-wide TaxFeeRule percentage — it now reflects exactly
            // what each transaction charged. ExciseRate is derived from that for display/reference only.
            var exciseAmount = g.Sum(x => x.ExciseAmount);
            var exciseRate = taxableBase > 0 ? Math.Round(exciseAmount / taxableBase * 100, 2) : 0m;
            // Returns aren't cashier-attributed in this schema — split this product's total
            // returns proportionally by each employee's share of units sold, rather than
            // crediting the full return against every employee's row for the same product.
            var productTotalUnits = totalUnitsByProduct.GetValueOrDefault(g.Key.ProductId, 0m);
            var productReturnsQty = returnsByProduct.GetValueOrDefault(g.Key.ProductId, 0m);
            var returnsQty = productTotalUnits > 0 ? Math.Round(productReturnsQty * (unitsSold / productTotalUnits), 2) : 0m;
            var exciseReversal = unitsSold > 0 ? Math.Round(exciseAmount * (returnsQty / unitsSold), 2) : 0m;
            return new TobaccoExciseRow
            {
                ProductId = g.Key.ProductId, CashierId = g.Key.CashierId,
                Sku = f.Sku, Barcode = f.Barcode ?? "—", ProductName = f.Name, Brand = f.Brand ?? "—", Category = f.Category, Branch = f.Branch,
                Employee = f.Employee,
                UnitsSold = unitsSold, TaxablePrice = f.TaxablePrice, ExciseRate = exciseRate, ExciseAmount = exciseAmount,
                VatAmount = g.Sum(x => x.VatAmount), ReturnsQty = returnsQty, ExciseReversal = exciseReversal, NetExcise = exciseAmount - exciseReversal,
                ComplianceStatus = exciseAmount > 0 ? "ok" : "missing excise fee",
            };
        })
        .OrderByDescending(r => r.ExciseAmount)
        .ToList();

        var (legalName, cr, vat) = await ResolveCompanyInfoAsync(branchId);

        return new TobaccoExciseResult
        {
            Kpis = new TobaccoExciseKpis
            {
                ExciseSalesValue = rows.Sum(r => r.TaxablePrice * r.UnitsSold), ExciseTaxAmount = rows.Sum(r => r.ExciseAmount),
                TobaccoUnitsSold = rows.Sum(r => r.UnitsSold), ExciseRefunds = rows.Sum(r => r.ExciseReversal),
                TopTobaccoSku = rows.FirstOrDefault()?.Sku, ComplianceExceptions = rows.Count(r => r.ComplianceStatus != "ok"),
            },
            Rows = rows,
            LegalCompanyName = legalName,
            CommercialRegistrationNumber = cr,
            VatRegistrationNumber = vat,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // 21. Profit Margin (RPT-FINANCE-PROFIT-MARGIN) — margin-permission gated end-to-end
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("profit-margin")]
    [RequirePermission("Reports", PermAction.View)]
    [RequirePermission("Accounting & Finance", PermAction.View)]
    public async Task<IActionResult> GetProfitMargin(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId, [FromQuery] string? groupBy = "product")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildProfitMarginAsync(rangeFrom, rangeTo, branchId, groupBy ?? "product"));
    }

    [HttpGet("profit-margin/export")]
    [RequirePermission("Reports", PermAction.Export)]
    [RequirePermission("Accounting & Finance", PermAction.Export)]
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
        return await BuildExportFile(format, "Profit Margin Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd} · Grouped by {groupBy ?? "product"}",
            kpis, headers, rows, $"profit-margin-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<ProfitMarginResult> BuildProfitMarginAsync(DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId, string groupBy)
    {
        // Missing from this one builder (every sibling — daily/monthly/cashier-sales etc. —
        // already does this): without it, a branch-scoped caller could pass a different
        // branchId (or omit it) and read another branch's COGS/gross-margin figures.
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) branchId = scopeBranchId;

        // Category/product grouping can legitimately span multiple branches, so there's no single
        // branch name to attribute a row to UNLESS the caller has filtered to one specific branch
        // (via the branch selector, or branch-scoped role above) — in that case every row IS that
        // branch, so show its name instead of the placeholder "—".
        string? filterBranchName = branchId.HasValue
            ? await db.Branches.Where(b => b.Id == branchId).Select(b => b.Name).FirstOrDefaultAsync()
            : null;

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
                    GroupKey = g.Key.CategoryId?.ToString() ?? "—", GroupName = g.Key.CategoryName, Branch = filterBranchName ?? "—",
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
                    GroupKey = g.Key.ProductId.ToString()[..8], GroupName = g.Key.ProductName, Branch = filterBranchName ?? "—",
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
    // Supplier Returns Report — full transaction detail for stock returned to suppliers (RTS),
    // one row per returned line item. RTS has no dedicated entity — it's StockTransfer/
    // StockTransferItem rows where TransferType == "warehouse_to_supplier".
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("supplier-returns")]
    [RequirePermission("Reports", PermAction.View)]
    [RequirePlanFeature("supplier_returns")]
    public async Task<IActionResult> GetSupplierReturnsReport(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? supplierId,
        [FromQuery] Guid[]? warehouseId, [FromQuery] Guid[]? branchId, [FromQuery] string[]? status, [FromQuery] string[]? reason,
        [FromQuery] Guid[]? productId, [FromQuery] Guid[]? categoryId, [FromQuery] Guid[]? returnedBy, [FromQuery] Guid[]? approvedBy)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildSupplierReturnsReportAsync(rangeFrom, rangeTo, supplierId ?? [], warehouseId ?? [], branchId ?? [], status ?? [], reason ?? [],
            productId ?? [], categoryId ?? [], returnedBy ?? [], approvedBy ?? []));
    }

    [HttpGet("supplier-returns/export")]
    [RequirePermission("Reports", PermAction.Export)]
    [RequirePlanFeature("supplier_returns")]
    public async Task<IActionResult> ExportSupplierReturnsReport(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? supplierId,
        [FromQuery] Guid[]? warehouseId, [FromQuery] Guid[]? branchId, [FromQuery] string[]? status, [FromQuery] string[]? reason,
        [FromQuery] Guid[]? productId, [FromQuery] Guid[]? categoryId, [FromQuery] Guid[]? returnedBy, [FromQuery] Guid[]? approvedBy,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var rows = await BuildSupplierReturnsReportAsync(rangeFrom, rangeTo, supplierId ?? [], warehouseId ?? [], branchId ?? [], status ?? [], reason ?? [],
            productId ?? [], categoryId ?? [], returnedBy ?? [], approvedBy ?? []);
        var headers = new[] { "Return Number", "Return Date", "Supplier", "Warehouse", "Returned By", "Approved By", "Product", "SKU", "Returned Qty", "Unit Cost", "Total Value", "Reason", "Status", "Notes" };
        var exportRows = rows.SelectMany(r => r.Items.Select(i => new object?[]
        {
            r.ReturnNumber, r.ReturnDate, r.SupplierName, r.WarehouseName, r.ReturnedBy, r.ApprovedBy,
            i.ProductName, i.Sku, i.ReturnedQuantity, i.UnitCost, i.TotalValue, i.Reason, r.Status, i.Notes,
        })).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, FirstBranchOrNull(branchId),
            $"{{\"report\":\"supplier-returns\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{rows.Count}}}");
        return await BuildExportFile(format, "Supplier Returns Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            [], headers, exportRows, $"supplier-returns-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<List<SupplierReturnsReportRow>> BuildSupplierReturnsReportAsync(
        DateTime rangeFrom, DateTime rangeToExclusive, Guid[] supplierIds, Guid[] warehouseIdFilters, Guid[] branchIds, string[] statuses, string[] reasons,
        Guid[] productIds, Guid[] categoryIds, Guid[] returnedByIds, Guid[] approvedByIds)
    {
        var (callerRole, callerBranchId) = GetCallerContext();

        // Supplier/warehouse/status/reason are narrowed in memory below, not via SQL .Contains(...)
        // — the MySQL EF Core provider throws on a parameterized Guid[]/string[] IN-list (see the
        // ef-mysql-inlist-gotcha memory).
        var q = db.StockTransfers
            .Include(t => t.DestSupplier).Include(t => t.SourceWarehouse).Include(t => t.CreatedByUser).Include(t => t.ApprovedByUser)
            .Include(t => t.Items).ThenInclude(i => i.Product)
            .Where(t => t.TransferType == "warehouse_to_supplier" && t.CreatedAt >= rangeFrom && t.CreatedAt < rangeToExclusive);

        var transfers = await q.OrderByDescending(t => t.CreatedAt).ToListAsync();

        if (reasons.Length > 0) transfers = [.. transfers.Where(t => t.ReturnReason != null && reasons.Contains(t.ReturnReason))];
        if (supplierIds.Length > 0) transfers = [.. transfers.Where(t => t.DestSupplierId.HasValue && supplierIds.Contains(t.DestSupplierId.Value))];
        if (warehouseIdFilters.Length > 0) transfers = [.. transfers.Where(t => t.SourceWarehouseId.HasValue && warehouseIdFilters.Contains(t.SourceWarehouseId.Value))];
        if (statuses.Length > 0) transfers = [.. transfers.Where(t => statuses.Contains(t.Status))];
        // Returned By / Approved By — the two people an auditor traces an RTS through. Same
        // in-memory narrowing as everything else here (MySQL provider can't take a Guid[] IN-list).
        if (returnedByIds.Length > 0) transfers = [.. transfers.Where(t => returnedByIds.Contains(t.CreatedBy))];
        if (approvedByIds.Length > 0) transfers = [.. transfers.Where(t => t.ApprovedBy.HasValue && approvedByIds.Contains(t.ApprovedBy.Value))];
        // Product narrows to returns CONTAINING the product; the line items themselves are also
        // narrowed below, so picking a product shows exactly that product's returned quantity
        // rather than every line of every return it happened to appear on.
        if (productIds.Length > 0) transfers = [.. transfers.Where(t => t.Items.Any(i => productIds.Contains(i.ProductId)))];
        if (categoryIds.Length > 0) transfers = [.. transfers.Where(t => t.Items.Any(i => i.Product != null && i.Product.CategoryId.HasValue && categoryIds.Contains(i.Product.CategoryId.Value)))];

        // A warehouse can serve more than one branch (many-to-many branch_warehouses) — resolve a
        // "primary" branch per warehouse, best-effort like the RTS tab does. Used ONLY to apply the
        // branch filter / role-based branch scoping below — RTS has no real BranchId of its own, so
        // this never becomes a "Branch" field on the row (see SupplierReturnsReportRow). Filtered
        // in-memory (not via .Where(warehouseIds.Contains(...))) — the MySQL EF Core provider used
        // here cannot assign a type mapping to a parameterized List<Guid> IN-list (same constraint
        // noted throughout this controller and OrdersController).
        var distinctWarehouseIds = transfers.Where(t => t.SourceWarehouseId.HasValue).Select(t => t.SourceWarehouseId!.Value).Distinct().ToHashSet();
        var branchIdByWarehouse = (await db.BranchWarehouses.ToListAsync())
            .Where(bw => distinctWarehouseIds.Contains(bw.WarehouseId))
            .GroupBy(bw => bw.WarehouseId)
            .ToDictionary(g => g.Key, g => (Guid?)g.First().BranchId);

        bool MatchesBranch(BaqalaPOS.Api.Models.StockTransfer t, Guid branch) =>
            t.SourceWarehouseId.HasValue && branchIdByWarehouse.TryGetValue(t.SourceWarehouseId.Value, out var bId) && bId == branch;

        if (branchIds.Length > 0) transfers = [.. transfers.Where(t => branchIds.Any(b => MatchesBranch(t, b)))];
        else if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            transfers = [.. transfers.Where(t => MatchesBranch(t, callerBranchId.Value))];

        return transfers.Select(t =>
        {
            var lines = t.Items.Where(i =>
                (productIds.Length == 0 || productIds.Contains(i.ProductId))
                && (categoryIds.Length == 0 || (i.Product != null && i.Product.CategoryId.HasValue && categoryIds.Contains(i.Product.CategoryId.Value))));
            var items = lines.Select(i => new SupplierReturnsReportItem
            {
                ProductId = i.ProductId,
                ProductName = i.Product?.Name ?? "—",
                Sku = i.Product?.Sku ?? "—",
                RequestedQuantity = i.RequestedQuantity,
                ApprovedQuantity = i.ApprovedQuantity,
                ReceivedQuantity = i.ReceivedQuantity,
                ReturnedQuantity = i.ReceivedQuantity ?? i.ApprovedQuantity ?? i.RequestedQuantity,
                UnitCost = i.UnitCost ?? 0m,
                TotalValue = (i.ReceivedQuantity ?? i.ApprovedQuantity ?? i.RequestedQuantity) * (i.UnitCost ?? 0m),
                Reason = i.ReturnReason ?? t.ReturnReason ?? "—",
                Notes = i.Notes ?? t.Notes,
            }).ToList();
            return new SupplierReturnsReportRow
            {
                Id = t.Id,
                ReturnNumber = t.TransferNumber ?? "—",
                ReturnDate = t.CompletedDate ?? t.CreatedAt,
                SupplierName = t.DestSupplier?.Name ?? "—",
                WarehouseName = t.SourceWarehouse?.Name ?? "—",
                ReturnedBy = t.CreatedByUser?.FullName ?? "—",
                ApprovedBy = t.ApprovedByUser?.FullName ?? "—",
                Status = t.Status,
                ReturnReason = t.ReturnReason,
                Notes = t.Notes,
                TotalQuantity = items.Sum(i => i.ReturnedQuantity),
                TotalValue = items.Sum(i => i.TotalValue),
                Items = items,
            };
        }).ToList();
    }

    // ───────────────────────────────────────────────────────────────────────
    // Stock Transfer Report — full transaction detail for warehouse↔warehouse, branch↔branch and
    // warehouse↔branch stock movements, one row per transferred line item. Excludes
    // "warehouse_to_supplier" (RTS), which has its own Supplier Returns Report above.
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("stock-transfer-report")]
    [RequirePermission("Reports", PermAction.View)]
    public async Task<IActionResult> GetStockTransferReport(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] string? transferType, [FromQuery] string[]? status,
        [FromQuery] Guid[]? sourceBranchId, [FromQuery] Guid[]? sourceWarehouseId, [FromQuery] Guid[]? destBranchId, [FromQuery] Guid[]? destWarehouseId,
        [FromQuery] Guid[]? productId, [FromQuery] Guid[]? createdBy, [FromQuery] Guid[]? approvedBy, [FromQuery] Guid[]? receivedBy)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildStockTransferReportAsync(rangeFrom, rangeTo, transferType, status ?? [], sourceBranchId ?? [], sourceWarehouseId ?? [], destBranchId ?? [], destWarehouseId ?? [], productId ?? [], createdBy ?? [], approvedBy ?? [], receivedBy ?? []));
    }

    [HttpGet("stock-transfer-report/export")]
    [RequirePermission("Reports", PermAction.Export)]
    public async Task<IActionResult> ExportStockTransferReport(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] string? transferType, [FromQuery] string[]? status,
        [FromQuery] Guid[]? sourceBranchId, [FromQuery] Guid[]? sourceWarehouseId, [FromQuery] Guid[]? destBranchId, [FromQuery] Guid[]? destWarehouseId,
        [FromQuery] Guid[]? productId, [FromQuery] Guid[]? createdBy, [FromQuery] Guid[]? approvedBy, [FromQuery] Guid[]? receivedBy,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var rows = await BuildStockTransferReportAsync(rangeFrom, rangeTo, transferType, status ?? [], sourceBranchId ?? [], sourceWarehouseId ?? [], destBranchId ?? [], destWarehouseId ?? [], productId ?? [], createdBy ?? [], approvedBy ?? [], receivedBy ?? []);
        var headers = new[] { "Transfer Number", "Type", "Source Branch", "Destination Branch", "Sending Warehouse", "Receiving Warehouse", "Status", "Created By", "Approved By", "Received By", "Product", "SKU", "Ordered Quantity", "Received Quantity", "Unit Cost", "Total Cost", "Transfer Date & Time", "Completed Date & Time", "Notes" };
        var exportRows = rows.Select(r => new object?[]
        {
            r.TransferNumber, r.TransferType, r.SourceBranch, r.DestinationBranch, r.SendingWarehouse, r.ReceivingWarehouse, r.Status, r.CreatedBy, r.ApprovedBy, r.ReceivedBy,
            r.ProductName, r.Sku, r.OrderedQuantity, r.ReceivedQuantity, r.UnitCost, r.TotalCost, r.CreatedAt, r.CompletedDate, r.Notes,
        }).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, FirstBranchOrNull(sourceBranchId) ?? FirstBranchOrNull(destBranchId),
            $"{{\"report\":\"stock-transfer\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{rows.Count}}}");
        return await BuildExportFile(format, "Stock Transfer Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            [], headers, exportRows, $"stock-transfer-report-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<List<StockTransferReportRow>> BuildStockTransferReportAsync(
        DateTime rangeFrom, DateTime rangeToExclusive, string? transferType, string[] statuses,
        Guid[] sourceBranchIds, Guid[] sourceWarehouseIds, Guid[] destBranchIds, Guid[] destWarehouseIds,
        Guid[] productIds, Guid[] createdByIds, Guid[] approvedByIds, Guid[] receivedByIds)
    {
        var (callerRole, callerBranchId) = GetCallerContext();

        // Branch/warehouse/product/status/actor filters are narrowed in memory below, not via SQL
        // .Contains(...) — the MySQL EF Core provider throws on a parameterized Guid[]/string[]
        // IN-list (see the ef-mysql-inlist-gotcha memory).
        var q = db.StockTransfers
            .Include(t => t.SourceBranch).Include(t => t.SourceWarehouse).Include(t => t.DestBranch).Include(t => t.DestWarehouse)
            .Include(t => t.CreatedByUser).Include(t => t.ApprovedByUser).Include(t => t.ReceivedByUser)
            .Include(t => t.Items).ThenInclude(i => i.Product)
            .Where(t => t.TransferType != "warehouse_to_supplier" && t.CreatedAt >= rangeFrom && t.CreatedAt < rangeToExclusive);

        if (!string.IsNullOrEmpty(transferType)) q = q.Where(t => t.TransferType == transferType);
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            q = q.Where(t => t.SourceBranchId == callerBranchId || t.DestBranchId == callerBranchId);

        var transfers = await q.OrderByDescending(t => t.CreatedAt).ToListAsync();

        if (statuses.Length > 0) transfers = [.. transfers.Where(t => statuses.Contains(t.Status))];
        if (sourceBranchIds.Length > 0) transfers = [.. transfers.Where(t => t.SourceBranchId.HasValue && sourceBranchIds.Contains(t.SourceBranchId.Value))];
        if (sourceWarehouseIds.Length > 0) transfers = [.. transfers.Where(t => t.SourceWarehouseId.HasValue && sourceWarehouseIds.Contains(t.SourceWarehouseId.Value))];
        if (destBranchIds.Length > 0) transfers = [.. transfers.Where(t => t.DestBranchId.HasValue && destBranchIds.Contains(t.DestBranchId.Value))];
        if (destWarehouseIds.Length > 0) transfers = [.. transfers.Where(t => t.DestWarehouseId.HasValue && destWarehouseIds.Contains(t.DestWarehouseId.Value))];
        if (productIds.Length > 0) transfers = [.. transfers.Where(t => t.Items.Any(i => productIds.Contains(i.ProductId)))];
        if (createdByIds.Length > 0) transfers = [.. transfers.Where(t => createdByIds.Contains(t.CreatedBy))];
        if (approvedByIds.Length > 0) transfers = [.. transfers.Where(t => t.ApprovedBy.HasValue && approvedByIds.Contains(t.ApprovedBy.Value))];
        if (receivedByIds.Length > 0) transfers = [.. transfers.Where(t => t.ReceivedBy.HasValue && receivedByIds.Contains(t.ReceivedBy.Value))];

        return transfers.SelectMany(t => t.Items.Select(i => new StockTransferReportRow
        {
            TransferNumber = t.TransferNumber ?? "—",
            TransferType = t.TransferType,
            SourceBranch = t.SourceBranch?.Name ?? "—",
            DestinationBranch = t.DestBranch?.Name ?? "—",
            SendingWarehouse = t.SourceWarehouse?.Name ?? "—",
            ReceivingWarehouse = t.DestWarehouse?.Name ?? "—",
            Status = t.Status,
            CreatedBy = t.CreatedByUser?.FullName ?? "—",
            ApprovedBy = t.ApprovedByUser?.FullName ?? "—",
            ReceivedBy = t.ReceivedByUser?.FullName ?? "—",
            ProductName = i.Product?.Name ?? "—",
            Sku = i.Product?.Sku ?? "—",
            OrderedQuantity = i.RequestedQuantity,
            ReceivedQuantity = i.ReceivedQuantity ?? i.ApprovedQuantity ?? i.RequestedQuantity,
            UnitCost = i.UnitCost ?? 0m,
            TotalCost = (i.ReceivedQuantity ?? i.ApprovedQuantity ?? i.RequestedQuantity) * (i.UnitCost ?? 0m),
            CreatedAt = t.CreatedAt,
            CompletedDate = t.CompletedDate,
            Notes = i.Notes ?? t.Notes,
        })).ToList();
    }

    // ───────────────────────────────────────────────────────────────────────
    // Purchase Reports — full purchase-order detail with nested line items, so a manager can
    // drill into a PO's products/quantities/costs without leaving the report.
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("purchase-order-report")]
    [RequirePermission("Reports", PermAction.View)]
    [RequirePlanFeature("purchase_orders")]
    public async Task<IActionResult> GetPurchaseOrderReport(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? supplierId, [FromQuery] Guid[]? branchId,
        [FromQuery] Guid[]? warehouseId, [FromQuery] string[]? status, [FromQuery] Guid[]? createdBy, [FromQuery] Guid[]? approvedBy, [FromQuery] Guid[]? productId)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildPurchaseOrderReportAsync(rangeFrom, rangeTo, supplierId ?? [], branchId ?? [], warehouseId ?? [], status ?? [], createdBy ?? [], approvedBy ?? [], productId ?? []));
    }

    [HttpGet("purchase-order-report/export")]
    [RequirePermission("Reports", PermAction.Export)]
    [RequirePlanFeature("purchase_orders")]
    public async Task<IActionResult> ExportPurchaseOrderReport(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? supplierId, [FromQuery] Guid[]? branchId,
        [FromQuery] Guid[]? warehouseId, [FromQuery] string[]? status, [FromQuery] Guid[]? createdBy, [FromQuery] Guid[]? approvedBy, [FromQuery] Guid[]? productId,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var pos = await BuildPurchaseOrderReportAsync(rangeFrom, rangeTo, supplierId ?? [], branchId ?? [], warehouseId ?? [], status ?? [], createdBy ?? [], approvedBy ?? [], productId ?? []);
        var headers = new[] { "PO Number", "Supplier", "Branch", "Warehouse", "Purchase Date", "Status", "Payment Status", "Requested By", "Created By", "Approved By", "Received By", "Product", "SKU", "Qty Ordered", "Qty Received", "Unit Cost", "Line Total", "PO Total" };
        var exportRows = pos.SelectMany(p => p.Items.Select(i => new object?[]
        {
            p.PoNumber, p.SupplierName, p.BranchName, p.WarehouseName, p.PurchaseDate, p.Status, p.PaymentStatus, p.RequestedBy, p.CreatedBy, p.ApprovedBy, p.ReceivedBy,
            i.ProductName, i.Sku, i.OrderedQuantity, i.ReceivedQuantity, i.UnitCost, i.Subtotal, p.TotalAmount,
        })).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, FirstBranchOrNull(branchId),
            $"{{\"report\":\"purchase-order\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{exportRows.Count}}}");
        return await BuildExportFile(format, "Purchase Reports", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            [], headers, exportRows, $"purchase-order-report-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<List<PurchaseOrderReportRow>> BuildPurchaseOrderReportAsync(
        DateTime rangeFrom, DateTime rangeToExclusive, Guid[] supplierIds, Guid[] branchIds, Guid[] warehouseIds,
        string[] statuses, Guid[] createdByIds, Guid[] approvedByIds, Guid[] productIds)
    {
        var (callerRole, callerBranchId) = GetCallerContext();

        // Supplier/branch/warehouse/status/actor/product are narrowed in memory below, not via SQL
        // .Contains(...) — the MySQL EF Core provider throws on a parameterized Guid[]/string[]
        // IN-list (see the ef-mysql-inlist-gotcha memory).
        var q = db.PurchaseOrders
            .Include(p => p.Supplier).Include(p => p.Branch).Include(p => p.Warehouse)
            .Include(p => p.CreatedByUser).Include(p => p.ApprovedByUser).Include(p => p.ReceivedByUser).Include(p => p.OrderedByUser)
            .Include(p => p.Items).ThenInclude(i => i.Product)
            .Where(p => p.CreatedAt >= rangeFrom && p.CreatedAt < rangeToExclusive);

        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            q = q.Where(p => p.BranchId == callerBranchId);

        var pos = await q.OrderByDescending(p => p.CreatedAt).ToListAsync();

        if (supplierIds.Length > 0) pos = [.. pos.Where(p => supplierIds.Contains(p.SupplierId))];
        if (branchIds.Length > 0) pos = [.. pos.Where(p => p.BranchId.HasValue && branchIds.Contains(p.BranchId.Value))];
        if (warehouseIds.Length > 0) pos = [.. pos.Where(p => p.WarehouseId.HasValue && warehouseIds.Contains(p.WarehouseId.Value))];
        if (statuses.Length > 0) pos = [.. pos.Where(p => statuses.Contains(p.Status))];
        if (createdByIds.Length > 0) pos = [.. pos.Where(p => createdByIds.Contains(p.CreatedBy))];
        if (approvedByIds.Length > 0) pos = [.. pos.Where(p => p.ApprovedBy.HasValue && approvedByIds.Contains(p.ApprovedBy.Value))];
        if (productIds.Length > 0) pos = [.. pos.Where(p => p.Items.Any(i => productIds.Contains(i.ProductId)))];

        return pos.Select(p => new PurchaseOrderReportRow
        {
            Id = p.Id,
            PoNumber = p.PoNumber ?? "—",
            SupplierName = p.Supplier?.Name ?? "—",
            BranchName = p.Branch?.Name ?? "—",
            WarehouseName = p.Warehouse?.Name ?? "—",
            PurchaseDate = p.CreatedAt,
            Status = p.Status,
            PaymentStatus = p.PaymentStatus,
            RequestedBy = p.OrderedByUser?.FullName ?? "—",
            CreatedBy = p.CreatedByUser?.FullName ?? "—",
            ApprovedBy = p.ApprovedByUser?.FullName ?? "—",
            ReceivedBy = p.ReceivedByUser?.FullName ?? "—",
            TotalAmount = p.TotalAmount,
            // With a product filter on, the drawer lists only the filtered product's lines —
            // otherwise picking one SKU still shows every other line on the same PO, which reads
            // as if the filter hadn't applied.
            Items = (productIds.Length > 0 ? p.Items.Where(i => productIds.Contains(i.ProductId)) : p.Items)
                .Select(i => new PurchaseOrderReportItem
            {
                ProductName = i.Product?.Name ?? "—",
                Sku = i.Product?.Sku ?? "—",
                OrderedQuantity = i.OrderedQuantity,
                ReceivedQuantity = i.ReceivedQuantity,
                UnitCost = i.UnitCost,
                Subtotal = i.Subtotal,
            }).ToList(),
        }).ToList();
    }

    // ───────────────────────────────────────────────────────────────────────
    // Supplier Report — one row per supplier with accurate payment tracking (Purchases, Total
    // Purchase, Paid, Due, Returns, Net Purchase, Avg Purchase, Last Purchase), plus a detail
    // endpoint that drills into that supplier's individual purchase orders and their line-item
    // pricing (unit price / line total). "Returns" is sourced from StockTransfer rows with
    // TransferType == "warehouse_to_supplier" (RTS) — the same source BuildSupplierReturnsReportAsync
    // uses — not from PurchaseOrder itself, which has no returned-amount column.
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("supplier-report")]
    [RequirePermission("Reports", PermAction.View)]
    public async Task<IActionResult> GetSupplierReport(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? supplierId, [FromQuery] Guid[]? branchId,
        [FromQuery] Guid[]? warehouseId, [FromQuery] string[]? paymentStatus, [FromQuery] string[]? reason, [FromQuery] Guid[]? createdBy)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildSupplierReportAsync(rangeFrom, rangeTo, supplierId ?? [], branchId ?? [], warehouseId ?? [], paymentStatus ?? [], reason ?? [], createdBy ?? []));
    }

    [HttpGet("supplier-report/export")]
    [RequirePermission("Reports", PermAction.Export)]
    public async Task<IActionResult> ExportSupplierReport(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? supplierId, [FromQuery] Guid[]? branchId,
        [FromQuery] Guid[]? warehouseId, [FromQuery] string[]? paymentStatus, [FromQuery] string[]? reason, [FromQuery] Guid[]? createdBy,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var rows = await BuildSupplierReportAsync(rangeFrom, rangeTo, supplierId ?? [], branchId ?? [], warehouseId ?? [], paymentStatus ?? [], reason ?? [], createdBy ?? []);
        var headers = new[] { "Supplier", "Purchases", "Total Purchase", "Paid", "Due", "Returns", "Net Purchase", "Avg Purchase", "Last Purchase" };
        var exportRows = rows.Select(r => new object?[]
        {
            r.SupplierName, r.PurchaseCount, r.TotalPurchaseAmount, r.PaidAmount, r.DueAmount, r.ReturnAmount, r.NetPurchaseAmount, r.AveragePurchaseValue, r.LastPurchaseDate,
        }).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, FirstBranchOrNull(branchId),
            $"{{\"report\":\"supplier-report\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{exportRows.Count}}}");
        return await BuildExportFile(format, "Supplier Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            [], headers, exportRows, $"supplier-report-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    [HttpGet("supplier-report/detail")]
    [RequirePermission("Reports", PermAction.View)]
    public async Task<IActionResult> GetSupplierReportDetail(
        [FromQuery] Guid supplierId, [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? branchId,
        [FromQuery] Guid[]? warehouseId, [FromQuery] string[]? paymentStatus, [FromQuery] Guid[]? createdBy)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var detail = await BuildSupplierReportDetailAsync(supplierId, rangeFrom, rangeTo, branchId ?? [], warehouseId ?? [], paymentStatus ?? [], createdBy ?? []);
        if (detail == null) return NotFound(new { message = "Supplier has no purchases in the selected range." });
        return Ok(detail);
    }

    private async Task<List<SupplierReportRow>> BuildSupplierReportAsync(
        DateTime rangeFrom, DateTime rangeToExclusive, Guid[] supplierIds, Guid[] branchIds, Guid[] warehouseIds,
        string[] paymentStatuses, string[] reasons, Guid[] createdByIds)
    {
        var (callerRole, callerBranchId) = GetCallerContext();

        // Narrowed in memory below, not via SQL .Contains(...) — the MySQL EF Core provider throws
        // on a parameterized Guid[]/string[] IN-list (see the ef-mysql-inlist-gotcha memory).
        var q = db.PurchaseOrders
            .Include(p => p.Supplier)
            .Where(p => p.CreatedAt >= rangeFrom && p.CreatedAt < rangeToExclusive);

        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            q = q.Where(p => p.BranchId == callerBranchId);

        var pos = await q.ToListAsync();

        if (supplierIds.Length > 0) pos = [.. pos.Where(p => supplierIds.Contains(p.SupplierId))];
        if (branchIds.Length > 0) pos = [.. pos.Where(p => p.BranchId.HasValue && branchIds.Contains(p.BranchId.Value))];
        if (warehouseIds.Length > 0) pos = [.. pos.Where(p => p.WarehouseId.HasValue && warehouseIds.Contains(p.WarehouseId.Value))];
        if (paymentStatuses.Length > 0) pos = [.. pos.Where(p => paymentStatuses.Contains(p.PaymentStatus))];
        if (createdByIds.Length > 0) pos = [.. pos.Where(p => createdByIds.Contains(p.CreatedBy))];

        // Returns value per supplier, same source and date range as BuildSupplierReturnsReportAsync.
        var returnTransfers = await db.StockTransfers
            .Include(t => t.Items)
            .Where(t => t.TransferType == "warehouse_to_supplier" && t.DestSupplierId.HasValue
                     && t.CreatedAt >= rangeFrom && t.CreatedAt < rangeToExclusive)
            .ToListAsync();
        if (reasons.Length > 0) returnTransfers = [.. returnTransfers.Where(t => t.ReturnReason != null && reasons.Contains(t.ReturnReason))];

        var returnValueBySupplier = returnTransfers
            .GroupBy(t => t.DestSupplierId!.Value)
            .ToDictionary(g => g.Key, g => g.Sum(t => t.Items.Sum(i => (i.ReceivedQuantity ?? i.ApprovedQuantity ?? i.RequestedQuantity) * (i.UnitCost ?? 0m))));

        // A Reason filter narrows to suppliers who actually have a matching return — same
        // "the filter narrows rows, not just one column" convention every other report filter here follows.
        if (reasons.Length > 0) pos = [.. pos.Where(p => returnValueBySupplier.ContainsKey(p.SupplierId))];

        return pos
            .GroupBy(p => new { p.SupplierId, SupplierName = p.Supplier?.Name ?? "—" })
            .Select(g =>
            {
                var totalPurchase = g.Sum(p => p.TotalAmount);
                var returnAmount = returnValueBySupplier.TryGetValue(g.Key.SupplierId, out var rv) ? rv : 0m;
                return new SupplierReportRow
                {
                    SupplierId = g.Key.SupplierId,
                    SupplierName = g.Key.SupplierName,
                    PurchaseCount = g.Count(),
                    TotalPurchaseAmount = totalPurchase,
                    PaidAmount = g.Sum(p => p.PaidAmount),
                    DueAmount = g.Sum(p => p.TotalAmount - p.PaidAmount),
                    ReturnAmount = returnAmount,
                    NetPurchaseAmount = totalPurchase - returnAmount,
                    AveragePurchaseValue = g.Average(p => p.TotalAmount),
                    LastPurchaseDate = g.Max(p => p.CreatedAt),
                };
            })
            .OrderByDescending(s => s.TotalPurchaseAmount)
            .ToList();
    }

    private async Task<SupplierReportDetail?> BuildSupplierReportDetailAsync(
        Guid supplierId, DateTime rangeFrom, DateTime rangeToExclusive, Guid[] branchIds, Guid[] warehouseIds,
        string[] paymentStatuses, Guid[] createdByIds)
    {
        var (callerRole, callerBranchId) = GetCallerContext();

        var q = db.PurchaseOrders
            .Include(p => p.Supplier).Include(p => p.Branch).Include(p => p.Warehouse).Include(p => p.CreatedByUser)
            .Include(p => p.Items).ThenInclude(i => i.Product).ThenInclude(pr => pr!.Category)
            .Where(p => p.SupplierId == supplierId && p.CreatedAt >= rangeFrom && p.CreatedAt < rangeToExclusive);

        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            q = q.Where(p => p.BranchId == callerBranchId);

        var pos = await q.OrderByDescending(p => p.CreatedAt).ToListAsync();
        if (pos.Count == 0) return null;

        if (branchIds.Length > 0) pos = [.. pos.Where(p => p.BranchId.HasValue && branchIds.Contains(p.BranchId.Value))];
        if (warehouseIds.Length > 0) pos = [.. pos.Where(p => p.WarehouseId.HasValue && warehouseIds.Contains(p.WarehouseId.Value))];
        if (paymentStatuses.Length > 0) pos = [.. pos.Where(p => paymentStatuses.Contains(p.PaymentStatus))];
        if (createdByIds.Length > 0) pos = [.. pos.Where(p => createdByIds.Contains(p.CreatedBy))];

        var poIds = pos.Select(p => p.Id).ToHashSet();
        // Returned qty per (PO, product) — best-effort: only counts RTS transfers explicitly linked
        // back to this PO via StockTransfer.PurchaseOrderId. Returns raised without that link show 0
        // here rather than guessing which PO they came from. Narrowed to poIds in memory, not via
        // SQL .Contains(...) — the MySQL EF Core provider throws on a parameterized Guid[] IN-list
        // (see the ef-mysql-inlist-gotcha memory, same constraint as everywhere else in this file).
        var allReturnTransfers = await db.StockTransfers
            .Include(t => t.Items)
            .Where(t => t.TransferType == "warehouse_to_supplier" && t.PurchaseOrderId.HasValue)
            .ToListAsync();
        var relevantReturns = allReturnTransfers.Where(t => poIds.Contains(t.PurchaseOrderId!.Value)).ToList();
        var returnedQtyByPoProduct = relevantReturns
            .SelectMany(t => t.Items.Select(i => (PoId: t.PurchaseOrderId!.Value, i.ProductId, Qty: i.ReceivedQuantity ?? i.ApprovedQuantity ?? i.RequestedQuantity)))
            .GroupBy(x => (x.PoId, x.ProductId))
            .ToDictionary(g => g.Key, g => g.Sum(x => x.Qty));
        var returnValueTotal = relevantReturns.Sum(t => t.Items.Sum(i => (i.ReceivedQuantity ?? i.ApprovedQuantity ?? i.RequestedQuantity) * (i.UnitCost ?? 0m)));

        var purchases = pos.Select(p => new SupplierReportPurchaseRow
        {
            Id = p.Id,
            PoNumber = p.PoNumber ?? "—",
            PurchaseDate = p.CreatedAt,
            LocationName = p.Branch?.Name ?? p.Warehouse?.Name ?? "—",
            Status = p.Status,
            CreatedBy = p.CreatedByUser?.FullName ?? "—",
            TotalAmount = p.TotalAmount,
            PaidAmount = p.PaidAmount,
            DueAmount = p.TotalAmount - p.PaidAmount,
            Items = p.Items.Select(i => new SupplierReportPurchaseItem
            {
                ProductName = i.Product?.Name ?? "—",
                Sku = i.Product?.Sku ?? "—",
                Category = i.Product?.Category?.Name ?? "—",
                UnitOfMeasure = i.Product?.UnitOfMeasure ?? "—",
                Quantity = i.OrderedQuantity,
                ReturnedQuantity = returnedQtyByPoProduct.TryGetValue((p.Id, i.ProductId), out var rq) ? rq : 0m,
                UnitPrice = i.UnitCost,
                LineTotal = i.Subtotal,
            }).ToList(),
        }).ToList();

        var totalPurchase = purchases.Sum(p => p.TotalAmount);
        return new SupplierReportDetail
        {
            SupplierId = supplierId,
            SupplierName = pos[0].Supplier?.Name ?? "—",
            PurchaseCount = purchases.Count,
            TotalPurchaseAmount = totalPurchase,
            PaidAmount = purchases.Sum(p => p.PaidAmount),
            DueAmount = purchases.Sum(p => p.DueAmount),
            ReturnAmount = returnValueTotal,
            NetPurchaseAmount = totalPurchase - returnValueTotal,
            Purchases = purchases,
        };
    }

    // ───────────────────────────────────────────────────────────────────────
    // Employee Audit Center — a curated, human-readable activity history for misuse tracking:
    // item add/edit/delete, cancellations, approvals, discounts, refunds, and stock movement.
    // Deliberately separate from the HRM Employee Activity Report (the raw audit trail under
    // Human Resources) — this is a general Reports-tab report scoped to exactly these 8 action
    // categories, with JSON old/new-value snapshots humanized into plain text instead of raw JSON.
    // ───────────────────────────────────────────────────────────────────────

    // Maps a raw AuditLog.Action string to (broad filter category, specific display label). Only
    // actions present here are ever shown in this report — everything else (logins, HR admin
    // changes, report exports, etc.) is out of scope by design.
    private static readonly Dictionary<string, (string Category, string Label)> EmployeeAuditActionMap =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["create_product"] = ("Added Item", "Added Item"),
            ["update_product"] = ("Edited Item", "Edited Item"),
            ["delete_product"] = ("Deleted Item", "Deleted Item"),
            ["void_order"] = ("Cancelled Item", "Cancelled Order"),
            // Order Modifications and Price Overrides — operational activities the client flagged
            // as untraceable. Both are their own filter category rather than being folded into
            // "Edited Item": a manager auditing misuse looks for repriced lines specifically, not
            // for every catalog edit.
            ["edit_order"] = ("Modified Order", "Modified Order"),
            ["price_override"] = ("Price Override", "Overrode Item Price"),
            // Approval decisions on the generic maker-checker queue (ApprovalsController.Decide) —
            // previously only the four legacy flows' decisions appeared here.
            ["approve_order_cancellation"] = ("Approved Request", "Approved Order Cancellation"),
            ["reject_order_cancellation"] = ("Approved Request", "Rejected Order Cancellation"),
            ["approve_order_modification"] = ("Approved Request", "Approved Order Modification"),
            ["reject_order_modification"] = ("Approved Request", "Rejected Order Modification"),
            ["approve_item_deletion"] = ("Approved Request", "Approved Item Deletion"),
            ["reject_item_deletion"] = ("Approved Request", "Rejected Item Deletion"),
            ["approve_discount"] = ("Approved Request", "Approved Discount"),
            ["reject_discount"] = ("Approved Request", "Rejected Discount"),
            ["approve_offer"] = ("Approved Request", "Approved Offer"),
            ["reject_offer"] = ("Approved Request", "Rejected Offer"),
            ["approve_coupon"] = ("Approved Request", "Approved Coupon"),
            ["reject_coupon"] = ("Approved Request", "Rejected Coupon"),
            // Requests raised (the maker half) — an audit trail that only records the approver
            // can't answer "who asked for this".
            ["request_order_cancellation"] = ("Cancelled Item", "Requested Order Cancellation"),
            ["request_order_modification"] = ("Modified Order", "Requested Order Modification"),
            ["request_item_deletion"] = ("Deleted Item", "Requested Item Deletion"),
            ["Leave approved"] = ("Approved Request", "Approved Leave Request"),
            ["Leave rejected"] = ("Approved Request", "Rejected Leave Request"),
            ["approve_inventory_adjustment"] = ("Approved Request", "Approved Inventory Adjustment"),
            ["reject_inventory_adjustment"] = ("Approved Request", "Rejected Inventory Adjustment"),
            ["approve_stock_count"] = ("Approved Request", "Approved Stock Count"),
            ["reject_stock_count"] = ("Approved Request", "Rejected Stock Count"),
            ["Gave Discount"] = ("Gave Discount", "Gave Discount"),
            ["create_refund"] = ("Refunded Order", "Processed Refund"),
            ["approve_refund"] = ("Refunded Order", "Approved Refund"),
            ["reject_refund"] = ("Refunded Order", "Rejected Refund"),
            ["create_stock_transfer"] = ("Moved Stock", "Created Stock Transfer"),
            ["receive_stock_transfer"] = ("Moved Stock", "Received Stock Transfer"),
            ["approve_stock_transfer"] = ("Moved Stock", "Approved Stock Transfer"),
            ["reject_stock_transfer"] = ("Moved Stock", "Rejected Stock Transfer"),
            ["ship_stock_transfer"] = ("Moved Stock", "Shipped Stock Transfer"),
            ["cancel_stock_transfer"] = ("Moved Stock", "Cancelled Stock Transfer"),
            ["receive_batch"] = ("Moved Stock", "Received Stock Batch"),
            ["Rule deleted"] = ("Deleted Item", "Deleted Rule"),
            ["Discount deleted"] = ("Deleted Item", "Deleted Discount"),
            ["Expense deleted"] = ("Deleted Item", "Deleted Expense"),
            ["Expense type deactivated"] = ("Deleted Item", "Deactivated Expense Type"),
            ["Coupon deleted"] = ("Deleted Item", "Deleted Coupon"),
            ["Inventory stock row deleted"] = ("Deleted Item", "Deleted Inventory Stock Row"),
            ["Leave type deactivated"] = ("Deleted Item", "Deactivated Leave Type"),
            ["Leave policy deactivated"] = ("Deleted Item", "Deactivated Leave Policy"),
            ["Loyalty program deleted"] = ("Deleted Item", "Deleted Loyalty Program"),
            ["Offer deleted"] = ("Deleted Item", "Deleted Offer"),
            ["Product variant deleted"] = ("Deleted Item", "Deleted Product Variant"),
            ["Role deleted"] = ("Deleted Item", "Deleted Role"),
            ["Supplier deactivated"] = ("Deleted Item", "Deactivated Supplier"),
            ["Kiosk lockdown PIN cleared"] = ("Deleted Item", "Cleared Kiosk Lockdown PIN"),
            ["User permission overrides reset"] = ("Deleted Item", "Reset User Permission Overrides"),
            ["User deactivated"] = ("Deleted Item", "Deactivated User"),
            ["Branch unlinked from warehouse"] = ("Deleted Item", "Unlinked Branch from Warehouse"),
        };

    [HttpGet("employee-audit-center")]
    [RequirePermission("Reports", PermAction.View)]
    [RequirePlanFeature("employee_shift_management")]
    public async Task<IActionResult> GetEmployeeAuditCenter(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? branchId,
        [FromQuery] Guid[]? employeeId, [FromQuery] string[]? category, [FromQuery] string? search,
        [FromQuery] Guid[]? deviceId, [FromQuery] string[]? transactionType)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildEmployeeAuditCenterAsync(rangeFrom, rangeTo, branchId ?? [], employeeId ?? [], category ?? [], search, deviceId ?? [], transactionType ?? []));
    }

    [HttpGet("employee-audit-center/export")]
    [RequirePermission("Reports", PermAction.Export)]
    [RequirePlanFeature("employee_shift_management")]
    public async Task<IActionResult> ExportEmployeeAuditCenter(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid[]? branchId,
        [FromQuery] Guid[]? employeeId, [FromQuery] string[]? category, [FromQuery] string? search,
        [FromQuery] Guid[]? deviceId, [FromQuery] string[]? transactionType,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var rows = await BuildEmployeeAuditCenterAsync(rangeFrom, rangeTo, branchId ?? [], employeeId ?? [], category ?? [], search, deviceId ?? [], transactionType ?? []);
        var headers = new[] { "Date & Time", "Employee", "Action", "Products Affected", "Total Quantity", "Old Value", "New Value", "Branch", "Device", "Related Transaction" };
        var exportRows = rows.Select(r => new object?[]
        {
            r.CreatedAt, r.EmployeeName, r.ActionLabel, r.ItemCount, r.TotalQuantity,
            r.OldValueSummary, r.NewValueSummary, r.BranchName, r.DeviceName, r.RelatedTransaction,
        }).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, FirstBranchOrNull(branchId),
            $"{{\"report\":\"employee-audit-center\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{rows.Count}}}");
        return await BuildExportFile(format, "Employee Audit Center", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            [], headers, exportRows, $"employee-audit-center-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    // Mirrors HrReportsController.IsHrManagerTierAsync — whoever actually manages other employees
    // (Approve/Edit on HR Attendance/Shifts/Leave, or Edit on Employees) sees the full branch + an
    // employee filter; everyone else (e.g. Cashier) only sees rows tied to their own user/employee
    // record. Kept local rather than shared — a small, self-contained predicate, and
    // ReportsController has no other dependency on HrReportsController.
    private async Task<bool> IsAuditManagerTierAsync() =>
        await PermissionCheck.HasPermissionAsync(User, db, "HR Attendance", PermAction.Approve)
        || await PermissionCheck.HasPermissionAsync(User, db, "HR Attendance", PermAction.Edit)
        || await PermissionCheck.HasPermissionAsync(User, db, "HR Shifts", PermAction.Approve)
        || await PermissionCheck.HasPermissionAsync(User, db, "HR Shifts", PermAction.Edit)
        || await PermissionCheck.HasPermissionAsync(User, db, "Leave Management", PermAction.Approve)
        || await PermissionCheck.HasPermissionAsync(User, db, "Leave Management", PermAction.Edit)
        || await PermissionCheck.HasPermissionAsync(User, db, "Employees", PermAction.Edit);

    private async Task<Guid?> GetOwnEmployeeIdForAuditAsync(Guid? callerId) =>
        callerId.HasValue ? await db.Employees.Where(e => e.UserId == callerId).Select(e => (Guid?)e.Id).FirstOrDefaultAsync() : null;

    private async Task<List<EmployeeAuditRow>> BuildEmployeeAuditCenterAsync(
        DateTime rangeFrom, DateTime rangeToExclusive, Guid[] branchIds, Guid[] employeeIds, string[] categories, string? search,
        Guid[] deviceIds, string[] transactionTypes)
    {
        var (callerRole, callerBranchId) = GetCallerContext();

        // Branch/employee/device/transaction-type selection is narrowed in memory below, not via
        // SQL .Contains(...) — the MySQL EF Core provider throws on a parameterized Guid[]/string[]
        // IN-list (see the ef_mysql_inlist_gotcha lesson). Date range stays a SQL-side filter since it's scalar.
        var query = db.AuditLogs.Include(a => a.User).Include(a => a.Employee).Include(a => a.Branch).Include(a => a.Terminal)
            .Where(a => a.CreatedAt >= rangeFrom && a.CreatedAt < rangeToExclusive);

        var all = await query.OrderByDescending(a => a.CreatedAt).Take(2000).ToListAsync();

        if (!await IsAuditManagerTierAsync())
        {
            var callerId = CallerId();
            var ownEmployeeId = await GetOwnEmployeeIdForAuditAsync(callerId);
            all = [.. all.Where(a => a.UserId == callerId || (ownEmployeeId.HasValue && a.EmployeeId == ownEmployeeId))];
        }
        else
        {
            if (employeeIds.Length > 0) all = [.. all.Where(a => a.EmployeeId.HasValue && employeeIds.Contains(a.EmployeeId.Value))];
            if (branchIds.Length > 0) all = [.. all.Where(a => a.BranchId.HasValue && branchIds.Contains(a.BranchId.Value))];
            else if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
                all = [.. all.Where(a => a.BranchId == callerBranchId)];
        }

        var curated = all.Where(a => EmployeeAuditActionMap.ContainsKey(a.Action)).ToList();

        if (categories.Length > 0)
            curated = curated.Where(a => categories.Contains(EmployeeAuditActionMap[a.Action].Category)).ToList();
        if (deviceIds.Length > 0)
            curated = curated.Where(a => a.TerminalId.HasValue && deviceIds.Contains(a.TerminalId.Value)).ToList();
        if (transactionTypes.Length > 0)
            curated = curated.Where(a => a.EntityType != null && transactionTypes.Contains(a.EntityType)).ToList();
        if (!string.IsNullOrEmpty(search))
            curated = curated.Where(a =>
                (a.Employee?.FullName?.Contains(search, StringComparison.OrdinalIgnoreCase) ?? false) ||
                (a.User?.FullName?.Contains(search, StringComparison.OrdinalIgnoreCase) ?? false) ||
                EmployeeAuditActionMap[a.Action].Label.Contains(search, StringComparison.OrdinalIgnoreCase)).ToList();

        // "Related Transaction" — resolve a human reference number per entity type actually
        // present, one id at a time (not a batch .Contains() lookup — same IN-list constraint as
        // above). The working set here is small (the curated/filtered rows only), so this stays cheap.
        var orderIds = curated.Where(a => a.EntityType == "Order" && a.EntityId.HasValue).Select(a => a.EntityId!.Value).Distinct().ToList();
        var transferIds = curated.Where(a => a.EntityType == "StockTransfer" && a.EntityId.HasValue).Select(a => a.EntityId!.Value).Distinct().ToList();
        var returnIds = curated.Where(a => a.EntityType == "CustomerReturn" && a.EntityId.HasValue).Select(a => a.EntityId!.Value).Distinct().ToList();
        var productIds = curated.Where(a => a.EntityType == "Product" && a.EntityId.HasValue).Select(a => a.EntityId!.Value).Distinct().ToList();

        var orderNumbers = new Dictionary<Guid, string?>();
        foreach (var id in orderIds) orderNumbers[id] = await db.Orders.Where(o => o.Id == id).Select(o => o.OrderNumber).FirstOrDefaultAsync();
        var transferNumbers = new Dictionary<Guid, string?>();
        foreach (var id in transferIds) transferNumbers[id] = await db.StockTransfers.Where(t => t.Id == id).Select(t => t.TransferNumber).FirstOrDefaultAsync();
        var returnNumbers = new Dictionary<Guid, string?>();
        foreach (var id in returnIds) returnNumbers[id] = await db.CustomerReturns.Where(r => r.Id == id).Select(r => r.ReturnNumber).FirstOrDefaultAsync();
        var productNames = new Dictionary<Guid, string?>();
        foreach (var id in productIds)
        {
            var p = await db.Products.Where(x => x.Id == id).Select(x => new { x.Name, x.Sku }).FirstOrDefaultAsync();
            productNames[id] = p is null ? null : $"{p.Name} ({p.Sku})";
        }

        string RelatedTransaction(BaqalaPOS.Api.Models.AuditLog a)
        {
            if (!a.EntityId.HasValue) return "—";
            var id = a.EntityId.Value;
            var resolved = a.EntityType switch
            {
                "Order" => orderNumbers.GetValueOrDefault(id),
                "StockTransfer" => transferNumbers.GetValueOrDefault(id),
                "CustomerReturn" => returnNumbers.GetValueOrDefault(id),
                "Product" => productNames.GetValueOrDefault(id),
                _ => null,
            };
            return resolved ?? $"{a.EntityType ?? "Record"} #{id.ToString()[..8]}";
        }

        // Affected-product count/quantity per row. The snapshot is the cheap path; rows whose
        // snapshot carries no Items array (a refund APPROVAL, a stock-count sign-off, anything
        // logged before the snapshots were enriched) fall back to counting the live entity, which
        // is why those rows used to show "—" in the Products/Total Qty columns. Cached per
        // (entityType, entityId) so a burst of actions on one order costs one lookup.
        var statsCache = new Dictionary<(string, Guid), (int Count, decimal Qty)>();
        var statsByLog = new Dictionary<Guid, (int Count, decimal Qty)>();
        foreach (var a in curated)
        {
            var fromSnapshot = SnapshotItemStats(a);
            if (fromSnapshot.Count > 0) { statsByLog[a.Id] = fromSnapshot; continue; }
            if (a.EntityType is null || !a.EntityId.HasValue) { statsByLog[a.Id] = (0, 0m); continue; }

            var key = (a.EntityType, a.EntityId.Value);
            if (!statsCache.TryGetValue(key, out var stats))
            {
                stats = await ResolveEntityItemStatsAsync(a.EntityType, a.EntityId.Value);
                statsCache[key] = stats;
            }
            statsByLog[a.Id] = stats;
        }

        return curated.Select(a =>
        {
            var (cat, label) = EmployeeAuditActionMap[a.Action];
            var (itemCount, totalQty) = statsByLog.GetValueOrDefault(a.Id);
            return new EmployeeAuditRow
            {
                Id = a.Id,
                CreatedAt = a.CreatedAt,
                EmployeeName = a.Employee?.FullName ?? a.User?.FullName ?? "—",
                ActionCategory = cat,
                ActionLabel = label,
                OldValueSummary = HumanizeJsonSnapshot(a.OldValues),
                NewValueSummary = HumanizeJsonSnapshot(a.NewValues) ?? a.Notes,
                BranchName = a.Branch?.Name ?? "—",
                DeviceName = a.Terminal?.Name ?? "—",
                RelatedTransaction = RelatedTransaction(a),
                EntityType = a.EntityType,
                Severity = a.Severity,
                ItemCount = itemCount,
                TotalQuantity = totalQty,
            };
        }).ToList();
    }

    // Affected-product count/quantity for the list column, read straight out of the stored JSON
    // snapshot — no per-row database lookup, so this stays cheap across the full 2000-row window.
    // The Details drawer (GetAuditDetail) does the richer entity-backed resolution for one row.
    private static (int Count, decimal Quantity) SnapshotItemStats(BaqalaPOS.Api.Models.AuditLog log)
    {
        foreach (var json in new[] { log.NewValues, log.OldValues })
        {
            if (string.IsNullOrWhiteSpace(json)) continue;
            try
            {
                using var doc = System.Text.Json.JsonDocument.Parse(json);
                if (doc.RootElement.ValueKind != System.Text.Json.JsonValueKind.Object) continue;
                if (!doc.RootElement.TryGetProperty("Items", out var items)
                    && !doc.RootElement.TryGetProperty("items", out items)) continue;
                if (items.ValueKind != System.Text.Json.JsonValueKind.Array) continue;

                var count = 0;
                var qty = 0m;
                foreach (var el in items.EnumerateArray())
                {
                    count++;
                    var q = ReadDecimal(el, "Quantity") ?? ReadDecimal(el, "quantity");
                    if (q.HasValue) qty += q.Value;
                }
                if (count > 0) return (count, qty);
            }
            catch { /* not JSON — no item stats to derive */ }
        }
        return (0, 0m);
    }

    // Fallback for rows whose stored snapshot has no Items array — counts the product lines on the
    // live entity instead. One scalar aggregate per entity, filtered by a single id (never a
    // Guid[] IN-list, which this MySQL provider can't translate).
    private async Task<(int Count, decimal Qty)> ResolveEntityItemStatsAsync(string entityType, Guid entityId)
    {
        switch (entityType)
        {
            case "Order":
            {
                var lines = await db.OrderItems.Where(i => i.OrderId == entityId).Select(i => i.Quantity).ToListAsync();
                return (lines.Count, lines.Sum());
            }
            case "CustomerReturn":
            {
                var lines = await db.CustomerReturnItems.Where(i => i.ReturnId == entityId).Select(i => i.Quantity).ToListAsync();
                return (lines.Count, lines.Sum());
            }
            case "StockTransfer":
            {
                var lines = await db.StockTransferItems.Where(i => i.TransferId == entityId)
                    .Select(i => i.ReceivedQuantity ?? i.ApprovedQuantity ?? i.RequestedQuantity).ToListAsync();
                return (lines.Count, lines.Sum());
            }
            case "StockCount":
            {
                // Only lines that actually moved — a 500-SKU session whose count column reads "500
                // products" when 2 had a variance is worse than useless to an auditor.
                var lines = await db.StockCountItems
                    .Where(i => i.StockCountId == entityId && i.CountedQuantity != null && i.Variance != 0)
                    .Select(i => i.CountedQuantity!.Value).ToListAsync();
                return (lines.Count, lines.Sum());
            }
            case "Product":
            {
                var branchQty = await db.InventoryStocks.Where(s => s.ProductId == entityId).SumAsync(s => (decimal?)s.Quantity) ?? 0m;
                var warehouseQty = await db.WarehouseStocks.Where(s => s.ProductId == entityId).SumAsync(s => (decimal?)s.Quantity) ?? 0m;
                return (1, branchQty + warehouseQty);
            }
            case "InventoryAdjustment":
            {
                var adj = await db.InventoryAdjustments.Where(a => a.Id == entityId).Select(a => (decimal?)a.Quantity).FirstOrDefaultAsync();
                return adj.HasValue ? (1, adj.Value) : (0, 0m);
            }
            // InventoryStock rows are hard-deleted, so there is nothing left to count — those rows
            // rely entirely on the snapshot written at deletion time (see InventoryController).
            default:
                return (0, 0m);
        }
    }

    // Turns a JSON snapshot like {"OrderNumber":"ORD-2","DiscountAmount":15} into a plain-text
    // summary — "Order Number: ORD-2, Discount Amount: 15" — instead of showing raw JSON in the
    // report. Falls back to the raw string if it isn't a JSON object (already human text).
    private static string? HumanizeJsonSnapshot(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != System.Text.Json.JsonValueKind.Object) return json;
            var parts = new List<string>();
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                if (prop.Name.Equals("Items", StringComparison.OrdinalIgnoreCase)) continue; // line items — too verbose for a one-line summary
                if (IsRawGuidIdField(prop)) continue; // e.g. "productId": "b2ee88ee-..." — meaningless without a lookup; the Details drawer resolves the real name separately
                var value = prop.Value.ValueKind switch
                {
                    System.Text.Json.JsonValueKind.Array => $"{prop.Value.GetArrayLength()} item(s)",
                    System.Text.Json.JsonValueKind.Null => null,
                    System.Text.Json.JsonValueKind.Object => null,
                    System.Text.Json.JsonValueKind.True => "Yes",
                    System.Text.Json.JsonValueKind.False => "No",
                    _ => prop.Value.ToString(),
                };
                if (value != null) parts.Add($"{HumanizePropertyName(prop.Name)}: {value}");
            }
            return parts.Count > 0 ? string.Join(", ", parts) : null;
        }
        catch { return json; }
    }

    // True for a scalar property that's a foreign-key reference ("productId", "CategoryId",
    // "ApprovedBy"...) whose value is actually a GUID. A raw id is noise in a summary meant for a
    // human auditor — it's never the answer to "which product/employee", only a lookup key — so it's
    // dropped from both the one-line Old/New Value summary and the Details drawer's field diff.
    private static bool IsRawGuidIdField(System.Text.Json.JsonProperty prop)
    {
        if (prop.Value.ValueKind != System.Text.Json.JsonValueKind.String) return false;
        var name = prop.Name;
        var looksLikeId = name.EndsWith("Id", StringComparison.OrdinalIgnoreCase) || name.EndsWith("By", StringComparison.OrdinalIgnoreCase);
        return looksLikeId && Guid.TryParse(prop.Value.GetString(), out _);
    }

    // "OrderNumber" -> "Order Number", "discountAmount" -> "Discount Amount"
    private static string HumanizePropertyName(string name)
    {
        var sb = new System.Text.StringBuilder();
        for (var i = 0; i < name.Length; i++)
        {
            if (i > 0 && char.IsUpper(name[i]) && !char.IsUpper(name[i - 1])) sb.Append(' ');
            sb.Append(i == 0 ? char.ToUpperInvariant(name[i]) : name[i]);
        }
        return sb.ToString();
    }

    // ───────────────────────────────────────────────────────────────────────
    // Audit Detail — the full "what was actually affected" record behind one audit row.
    //
    // Both the Employee Activity Report (HR-facing) and the Employee Audit Center (Reports-facing)
    // list one line per action with a one-line humanized summary. That summary deliberately drops
    // line items (see HumanizeJsonSnapshot's "Items" skip), so a deleted product or a cancelled
    // order showed WHO and WHEN but never WHAT — which products, in what quantity, at what price.
    // This endpoint backs the "Details" drawer on both reports: field-level before/after changes,
    // every affected product line, and a summary of the underlying transaction.
    //
    // Item lines are resolved from the audit snapshot's own Items array where present (that's the
    // state as it was at the time of the action — the correct source for an edit or a void), and
    // fall back to the live entity for actions logged before the snapshot carried items.
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("audit-detail/{id:guid}")]
    public async Task<IActionResult> GetAuditDetail(Guid id)
    {
        // Reachable from two reports with two different gates — the Employee Audit Center is
        // "Reports", the Employee Activity Report is "Audit Logs" (FRD 3/16 scopes it to
        // admin/auditor). Either grant is enough; holding neither is a 403.
        var canView = await PermissionCheck.HasPermissionAsync(User, db, "Reports", PermAction.View)
                      || await PermissionCheck.HasPermissionAsync(User, db, "Audit Logs", PermAction.View);
        if (!canView) return StatusCode(403, new { message = "You do not have permission to view audit detail." });

        var log = await db.AuditLogs
            .Include(a => a.User).Include(a => a.Employee).Include(a => a.Branch).Include(a => a.Terminal)
            .FirstOrDefaultAsync(a => a.Id == id);
        if (log is null) return NotFound();

        // Same self-scoping the two list endpoints apply — a non-manager may only open detail for
        // their own activity, so this drawer can't be used to read around the list-level filter.
        if (!await IsAuditManagerTierAsync())
        {
            var callerId = CallerId();
            var ownEmployeeId = await GetOwnEmployeeIdForAuditAsync(callerId);
            if (log.UserId != callerId && !(ownEmployeeId.HasValue && log.EmployeeId == ownEmployeeId))
                return NotFound();
        }
        else
        {
            var (callerRole, callerBranchId) = GetCallerContext();
            if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue
                && log.BranchId.HasValue && log.BranchId != callerBranchId)
                return NotFound();
        }

        var items = await ResolveAuditItemsAsync(log);
        var (transactionLabel, transactionFields) = await ResolveAuditTransactionAsync(log);

        return Ok(new AuditDetailResult
        {
            Id = log.Id,
            CreatedAt = log.CreatedAt,
            Action = log.Action,
            ActionLabel = EmployeeAuditActionMap.TryGetValue(log.Action, out var mapped) ? mapped.Label : HumanizePropertyName(log.Action.Replace('_', ' ')),
            Module = log.Module,
            EntityType = log.EntityType,
            EntityId = log.EntityId,
            EmployeeName = log.Employee?.FullName ?? log.User?.FullName ?? "—",
            PerformedBy = log.User?.FullName ?? "—",
            BranchName = log.Branch?.Name ?? "—",
            DeviceName = log.Terminal?.Name ?? "—",
            IpAddress = log.IpAddress,
            Severity = log.Severity,
            Notes = log.Notes,
            RelatedTransaction = transactionLabel,
            TransactionFields = transactionFields,
            Changes = BuildFieldChanges(log.OldValues, log.NewValues),
            Items = items,
        });
    }

    // Field-level before/after diff between the two JSON snapshots. Only fields that actually
    // differ are returned (plus every field of a one-sided snapshot, e.g. a create or a delete),
    // so the drawer doesn't bury the one changed price under twenty unchanged columns.
    private static List<AuditFieldChange> BuildFieldChanges(string? oldJson, string? newJson)
    {
        var before = ParseFlatJsonObject(oldJson);
        var after = ParseFlatJsonObject(newJson);
        if (before is null && after is null) return [];

        var keys = new List<string>();
        foreach (var k in (after ?? []).Keys) keys.Add(k);
        foreach (var k in (before ?? []).Keys) if (!keys.Contains(k)) keys.Add(k);

        var changes = new List<AuditFieldChange>();
        foreach (var key in keys)
        {
            var oldValue = before is not null && before.TryGetValue(key, out var o) ? o : null;
            var newValue = after is not null && after.TryGetValue(key, out var n) ? n : null;
            if (oldValue == newValue) continue;
            changes.Add(new AuditFieldChange { Field = HumanizePropertyName(key), OldValue = oldValue, NewValue = newValue });
        }
        return changes;
    }

    // Scalar properties of a JSON object as display strings. Arrays/objects are skipped — nested
    // structure (line items) is rendered by the Items list, not as a "field".
    private static Dictionary<string, string?>? ParseFlatJsonObject(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != System.Text.Json.JsonValueKind.Object) return null;
            var map = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                if (IsRawGuidIdField(prop)) continue; // same rule as HumanizeJsonSnapshot — a raw id isn't a meaningful "what changed" field
                map[prop.Name] = prop.Value.ValueKind switch
                {
                    System.Text.Json.JsonValueKind.Array or System.Text.Json.JsonValueKind.Object => null,
                    System.Text.Json.JsonValueKind.Null => null,
                    System.Text.Json.JsonValueKind.True => "Yes",
                    System.Text.Json.JsonValueKind.False => "No",
                    _ => prop.Value.ToString(),
                };
            }
            return map;
        }
        catch { return null; }
    }

    // Product lines affected by this action. Snapshot first (the state at the time of the action),
    // live entity second (covers rows logged before their snapshot carried an Items array).
    private async Task<List<AuditDetailItem>> ResolveAuditItemsAsync(BaqalaPOS.Api.Models.AuditLog log)
    {
        var fromSnapshot = await ItemsFromSnapshotAsync(log.NewValues) ?? await ItemsFromSnapshotAsync(log.OldValues);
        if (fromSnapshot is { Count: > 0 }) return fromSnapshot;

        if (!log.EntityId.HasValue) return [];
        var entityId = log.EntityId.Value;

        switch (log.EntityType)
        {
            case "Order":
            {
                var order = await db.Orders.Include(o => o.Items).ThenInclude(i => i.Product)
                    .FirstOrDefaultAsync(o => o.Id == entityId);
                return order is null ? [] : order.Items.Select(i => new AuditDetailItem
                {
                    ProductName = i.Product?.Name ?? "—",
                    Sku = i.Product?.Sku ?? "—",
                    Quantity = i.Quantity,
                    UnitPrice = i.UnitPrice,
                    LineTotal = i.TotalPrice,
                }).ToList();
            }
            case "Product":
            {
                var product = await db.Products.FirstOrDefaultAsync(p => p.Id == entityId);
                if (product is null) return [];
                // A deleted/discontinued product's "quantity" is what was still on the shelf when
                // it went — the number an auditor actually asks about. Summed across every branch
                // the product was stocked in.
                var onHand = await db.InventoryStocks.Where(s => s.ProductId == entityId).SumAsync(s => (decimal?)s.Quantity) ?? 0m;
                var inWarehouse = await db.WarehouseStocks.Where(s => s.ProductId == entityId).SumAsync(s => (decimal?)s.Quantity) ?? 0m;
                return [new AuditDetailItem
                {
                    ProductName = product.Name,
                    Sku = product.Sku,
                    Quantity = onHand + inWarehouse,
                    UnitPrice = product.BasePrice,
                    LineTotal = (onHand + inWarehouse) * product.BasePrice,
                    Note = $"On hand at branches {onHand:0.##}, warehouses {inWarehouse:0.##}",
                }];
            }
            case "CustomerReturn":
            {
                var ret = await db.CustomerReturns.Include(r => r.Items).ThenInclude(i => i.Product)
                    .FirstOrDefaultAsync(r => r.Id == entityId);
                return ret is null ? [] : ret.Items.Select(i => new AuditDetailItem
                {
                    ProductName = i.Product?.Name ?? "—",
                    Sku = i.Product?.Sku ?? "—",
                    Quantity = i.Quantity,
                    UnitPrice = i.UnitPrice,
                    LineTotal = i.RefundAmount,
                    Note = i.Condition is null ? null : $"Condition: {i.Condition}{(i.Restock ? ", restocked" : ", not restocked")}",
                }).ToList();
            }
            case "StockTransfer":
            {
                var transfer = await db.StockTransfers.Include(t => t.Items).ThenInclude(i => i.Product)
                    .FirstOrDefaultAsync(t => t.Id == entityId);
                return transfer is null ? [] : transfer.Items.Select(i => new AuditDetailItem
                {
                    ProductName = i.Product?.Name ?? "—",
                    Sku = i.Product?.Sku ?? "—",
                    Quantity = i.ReceivedQuantity ?? i.ApprovedQuantity ?? i.RequestedQuantity,
                    UnitPrice = i.UnitCost,
                    LineTotal = (i.ReceivedQuantity ?? i.ApprovedQuantity ?? i.RequestedQuantity) * (i.UnitCost ?? 0m),
                    Note = i.Notes,
                }).ToList();
            }
            case "StockCount":
            {
                var count = await db.StockCounts.Include(c => c.Items).ThenInclude(i => i.Product)
                    .FirstOrDefaultAsync(c => c.Id == entityId);
                // Only the lines that actually moved — a 500-SKU count session whose drawer lists
                // 498 zero-variance rows hides the two that matter.
                return count is null ? [] : count.Items
                    .Where(i => i.CountedQuantity.HasValue && i.Variance != 0)
                    .Select(i => new AuditDetailItem
                    {
                        ProductName = i.Product?.Name ?? "—",
                        Sku = i.Product?.Sku ?? "—",
                        Quantity = i.CountedQuantity ?? 0m,
                        Note = $"System {i.SystemQuantity:0.##}, counted {i.CountedQuantity:0.##}, variance {i.Variance:+0.##;-0.##;0}",
                    }).ToList();
            }
            case "InventoryAdjustment":
            {
                var adj = await db.InventoryAdjustments.Include(a => a.Product).FirstOrDefaultAsync(a => a.Id == entityId);
                return adj is null ? [] : [new AuditDetailItem
                {
                    ProductName = adj.Product?.Name ?? "—",
                    Sku = adj.Product?.Sku ?? "—",
                    Quantity = adj.Quantity,
                    Note = $"{adj.AdjustmentType}{(string.IsNullOrWhiteSpace(adj.Reason) ? "" : $" — {adj.Reason}")}",
                }];
            }
            case "InventoryStock":
            {
                // The row is hard-deleted, so nothing can be looked up by entityId. Newer
                // deletions carry a full snapshot (handled by ItemsFromSnapshotAsync above); older
                // ones only ever stored the bare string "productId=<guid>", which is still enough
                // to name the product even though its quantity is gone for good.
                var legacyProductId = ParseLegacyProductId(log.OldValues) ?? ParseLegacyProductId(log.NewValues);
                if (!legacyProductId.HasValue) return [];
                var p = await db.Products.Where(x => x.Id == legacyProductId.Value)
                    .Select(x => new { x.Name, x.Sku, x.BasePrice }).FirstOrDefaultAsync();
                return p is null ? [] : [new AuditDetailItem
                {
                    ProductName = p.Name,
                    Sku = p.Sku,
                    Quantity = 0,
                    UnitPrice = p.BasePrice,
                    Note = "Stock row deleted before quantities were captured — quantity unavailable",
                }];
            }
            default:
                return [];
        }
    }

    // Reads an "Items"/"items" array out of an audit snapshot. Entries carry ProductId rather than
    // a name (they're serialized straight off the entity), so names/SKUs are resolved one id at a
    // time — the MySQL provider can't take a parameterized Guid[] IN-list, and a single audit row's
    // item count is small.
    private async Task<List<AuditDetailItem>?> ItemsFromSnapshotAsync(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != System.Text.Json.JsonValueKind.Object) return null;
            if (!doc.RootElement.TryGetProperty("Items", out var itemsEl)
                && !doc.RootElement.TryGetProperty("items", out itemsEl)) return null;
            if (itemsEl.ValueKind != System.Text.Json.JsonValueKind.Array) return null;

            var result = new List<AuditDetailItem>();
            foreach (var el in itemsEl.EnumerateArray())
            {
                if (el.ValueKind != System.Text.Json.JsonValueKind.Object) continue;
                var productId = ReadGuid(el, "ProductId") ?? ReadGuid(el, "productId");
                string name = "—", sku = "—";
                if (productId.HasValue)
                {
                    var p = await db.Products.Where(x => x.Id == productId.Value)
                        .Select(x => new { x.Name, x.Sku }).FirstOrDefaultAsync();
                    if (p is not null) { name = p.Name; sku = p.Sku; }
                }
                result.Add(new AuditDetailItem
                {
                    ProductName = name,
                    Sku = sku,
                    Quantity = ReadDecimal(el, "Quantity") ?? ReadDecimal(el, "quantity") ?? 0m,
                    UnitPrice = ReadDecimal(el, "UnitPrice") ?? ReadDecimal(el, "unitPrice"),
                    LineTotal = ReadDecimal(el, "TotalPrice") ?? ReadDecimal(el, "totalPrice"),
                });
            }
            return result;
        }
        catch { return null; }
    }

    // Pre-snapshot inventory stock deletions stored their before-value as the literal string
    // "productId=<guid>" rather than JSON.
    private static Guid? ParseLegacyProductId(string? raw) =>
        raw is not null && raw.StartsWith("productId=", StringComparison.OrdinalIgnoreCase)
        && Guid.TryParse(raw["productId=".Length..].Trim(), out var g) ? g : null;

    private static Guid? ReadGuid(System.Text.Json.JsonElement el, string name) =>
        el.TryGetProperty(name, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.String
        && Guid.TryParse(v.GetString(), out var g) ? g : null;

    private static decimal? ReadDecimal(System.Text.Json.JsonElement el, string name) =>
        el.TryGetProperty(name, out var v) && v.ValueKind == System.Text.Json.JsonValueKind.Number
        && v.TryGetDecimal(out var d) ? d : null;

    // Human reference number plus the headline fields of whatever this action touched, so the
    // drawer answers "which order / which return / which product" without a second lookup.
    private async Task<(string Label, List<AuditFieldChange> Fields)> ResolveAuditTransactionAsync(BaqalaPOS.Api.Models.AuditLog log)
    {
        if (!log.EntityId.HasValue) return ("—", []);
        var entityId = log.EntityId.Value;
        var fields = new List<AuditFieldChange>();
        void Add(string field, string? value) { if (!string.IsNullOrWhiteSpace(value)) fields.Add(new AuditFieldChange { Field = field, NewValue = value }); }

        switch (log.EntityType)
        {
            case "Order":
            {
                var o = await db.Orders.Include(x => x.Cashier).FirstOrDefaultAsync(x => x.Id == entityId);
                if (o is null) break;
                Add("Order Status", o.OrderStatus);
                Add("Payment Status", o.PaymentStatus);
                Add("Subtotal", o.Subtotal.ToString("0.##"));
                Add("Discount", o.DiscountAmount.ToString("0.##"));
                Add("Tax", o.TaxAmount.ToString("0.##"));
                Add("Total", o.TotalAmount.ToString("0.##"));
                Add("Cashier", o.Cashier?.FullName);
                Add("Void Reason", o.VoidReason);
                return (o.OrderNumber ?? $"Order #{entityId.ToString()[..8]}", fields);
            }
            case "Product":
            {
                var p = await db.Products.Include(x => x.Category).FirstOrDefaultAsync(x => x.Id == entityId);
                if (p is null) break;
                Add("Category", p.Category?.Name);
                Add("Selling Price", p.BasePrice.ToString("0.##"));
                Add("Status", p.Status);
                Add("Barcode", p.Barcode);
                return ($"{p.Name} ({p.Sku})", fields);
            }
            case "CustomerReturn":
            {
                var r = await db.CustomerReturns.Include(x => x.Order).FirstOrDefaultAsync(x => x.Id == entityId);
                if (r is null) break;
                Add("Original Order", r.Order?.OrderNumber);
                Add("Return Type", r.ReturnType);
                Add("Refund Method", r.RefundMethod);
                Add("Refund Amount", r.RefundAmount.ToString("0.##"));
                Add("Status", r.Status);
                Add("Reason", r.Reason);
                return (r.ReturnNumber ?? $"Return #{entityId.ToString()[..8]}", fields);
            }
            case "StockTransfer":
            {
                var t = await db.StockTransfers.FirstOrDefaultAsync(x => x.Id == entityId);
                if (t is null) break;
                Add("Transfer Type", t.TransferType);
                Add("Status", t.Status);
                Add("Notes", t.Notes);
                return (t.TransferNumber ?? $"Transfer #{entityId.ToString()[..8]}", fields);
            }
            case "StockCount":
            {
                var c = await db.StockCounts.Include(x => x.Branch).Include(x => x.Warehouse).FirstOrDefaultAsync(x => x.Id == entityId);
                if (c is null) break;
                Add("Location", c.Branch?.Name ?? c.Warehouse?.Name);
                Add("Count Type", c.CountType);
                Add("Status", c.Status);
                return ($"Stock count #{entityId.ToString()[..8]}", fields);
            }
        }
        return ($"{log.EntityType ?? "Record"} #{entityId.ToString()[..8]}", fields);
    }

    // ───────────────────────────────────────────────────────────────────────
    // Shared helpers
    // ───────────────────────────────────────────────────────────────────────

    // ───────────────────────────────────────────────────────────────────────
    // N. Loyalty Program (LOY-001)
    // ───────────────────────────────────────────────────────────────────────

    [HttpGet("loyalty")]
    [RequirePermission("Reports", PermAction.View)]
    public async Task<IActionResult> GetLoyaltyReport([FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId)
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        return Ok(await BuildLoyaltyReportAsync(rangeFrom, rangeTo, branchId));
    }

    [HttpGet("loyalty/export")]
    [RequirePermission("Reports", PermAction.Export)]
    public async Task<IActionResult> ExportLoyaltyReport(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildLoyaltyReportAsync(rangeFrom, rangeTo, branchId);
        var headers = new[] { "Branch", "Points Earned", "Points Redeemed", "Points Expired", "Redemption Value (SAR)", "Active Members" };
        var rows = result.ByBranch.Select(r => new object?[]
        {
            r.BranchName, r.PointsEarned, r.PointsRedeemed, r.PointsExpired, r.RedemptionValue, r.ActiveMembers,
        }).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"loyalty\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.ByBranch.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Points Earned", result.Kpis.TotalPointsEarned.ToString("0.##")),
            ("Points Redeemed", result.Kpis.TotalPointsRedeemed.ToString("0.##")),
            ("Points Expired", result.Kpis.TotalPointsExpired.ToString("0.##")),
            ("Redemption Value (SAR)", result.Kpis.TotalRedemptionValue.ToString("0.##")),
            ("Active Members", result.Kpis.TotalActiveMembers.ToString()),
        };
        return await BuildExportFile(format, "Loyalty Program Report", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"loyalty-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    // Separate export (own headers/rows shape) rather than folding into ExportLoyaltyReport
    // above — BuildExportFile only writes one flat table per file, and the branch table's
    // columns don't line up with the customer table's.
    [HttpGet("loyalty/customers/export")]
    [RequirePermission("Reports", PermAction.Export)]
    public async Task<IActionResult> ExportLoyaltyCustomersReport(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to, [FromQuery] Guid? branchId,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var (rangeFrom, rangeTo, error) = ResolveRange(from, to, defaultToFirstOfMonth: true);
        if (error != null) return BadRequest(new { message = error });
        var result = await BuildLoyaltyReportAsync(rangeFrom, rangeTo, branchId);
        var headers = new[] { "Customer", "Phone", "Branch(es)", "Tier", "Current Balance", "Points Earned", "Points Redeemed", "Points Expired", "Redemption Value (SAR)", "Last Activity" };
        var rows = result.ByCustomer.Select(r => new object?[]
        {
            r.CustomerName, r.Phone, r.Branches, r.Tier, r.CurrentBalance, r.PointsEarned, r.PointsRedeemed, r.PointsExpired, r.RedemptionValue, r.LastActivityAt.ToString("yyyy-MM-dd HH:mm"),
        }).ToList();
        await audit.LogAsync("export_report", "Report", null, exportedBy, branchId,
            $"{{\"report\":\"loyalty_customers\",\"from\":\"{rangeFrom:yyyy-MM-dd}\",\"to\":\"{rangeTo:yyyy-MM-dd}\",\"rows\":{result.ByCustomer.Count}}}");
        var kpis = new (string, string)[]
        {
            ("Points Earned", result.Kpis.TotalPointsEarned.ToString("0.##")),
            ("Points Redeemed", result.Kpis.TotalPointsRedeemed.ToString("0.##")),
            ("Points Expired", result.Kpis.TotalPointsExpired.ToString("0.##")),
            ("Redemption Value (SAR)", result.Kpis.TotalRedemptionValue.ToString("0.##")),
            ("Active Members", result.Kpis.TotalActiveMembers.ToString()),
        };
        return await BuildExportFile(format, "Loyalty Program Report — By Customer", $"Period: {rangeFrom:yyyy-MM-dd} to {rangeTo.AddDays(-1):yyyy-MM-dd}",
            kpis, headers, rows, $"loyalty-customers-{rangeFrom:yyyy-MM-dd}-to-{rangeTo:yyyy-MM-dd}");
    }

    private async Task<LoyaltyReportResult> BuildLoyaltyReportAsync(DateTime rangeFrom, DateTime rangeToExclusive, Guid? branchId)
    {
        // Same branch-claim override every other report in this controller applies — a Branch
        // Manager cannot see another branch's loyalty activity by passing a different branchId.
        var (scopeRole, scopeBranchId) = GetCallerContext();
        if (scopeRole is not null && scopeRole != "tenant_admin" && scopeBranchId.HasValue) branchId = scopeBranchId;

        var branchesQ = db.Branches.Where(b => b.Status == "active");
        if (branchId.HasValue) branchesQ = branchesQ.Where(b => b.Id == branchId);
        var branches = await branchesQ.ToListAsync();

        // Joined via navigation (Include), not a Contains() over a materialized id list — the
        // MySQL EF provider in use here fails to type-map a List<Guid> parameter in a Contains()
        // translation (same issue worked around elsewhere in OrdersController/DataSeeder).
        var txnQ = db.LoyaltyTransactions.Include(t => t.Customer)
            .Where(t => t.CreatedAt >= rangeFrom && t.CreatedAt < rangeToExclusive);
        if (branchId.HasValue) txnQ = txnQ.Where(t => t.BranchId == branchId);
        var txns = await txnQ.Select(t => new
        {
            t.BranchId,
            t.CustomerId,
            t.TransactionType,
            t.Points,
            t.MonetaryValue,
            t.CreatedAt,
            CustomerName = t.Customer!.FullName,
            CustomerPhone = t.Customer!.Phone,
            CustomerTier = t.Customer!.Tier,
            CustomerBalance = t.Customer!.LoyaltyBalance,
        }).ToListAsync();

        var byBranch = txns.Where(t => t.BranchId.HasValue).ToLookup(t => t.BranchId!.Value);
        var rows = branches.Select(b =>
        {
            var branchTxns = byBranch[b.Id];
            return new LoyaltyReportRow
            {
                BranchId = b.Id,
                BranchName = b.Name,
                PointsEarned = branchTxns.Where(t => t.TransactionType == "earn").Sum(t => t.Points),
                PointsRedeemed = -branchTxns.Where(t => t.TransactionType == "redeem").Sum(t => t.Points),
                PointsExpired = -branchTxns.Where(t => t.TransactionType == "expire").Sum(t => t.Points),
                RedemptionValue = branchTxns.Where(t => t.TransactionType == "redeem").Sum(t => t.MonetaryValue ?? 0),
                ActiveMembers = branchTxns.Select(t => t.CustomerId).Distinct().Count(),
            };
        }).ToList();

        var tierBreakdown = txns
            .GroupBy(t => t.CustomerId)
            .Select(g => g.First())
            .GroupBy(t => t.CustomerTier)
            .Select(g => new LoyaltyTierRow { Tier = g.Key, Members = g.Count(), TotalBalance = g.Sum(t => t.CustomerBalance) })
            .ToList();

        // Full id->name map, not just the (possibly branch-filtered) `branches` list above — a
        // customer transacting at a branch outside the current filter/active set (e.g. it was
        // since deactivated) should still show a real name here instead of falling through to
        // the "—" placeholder.
        var branchNameMap = await db.Branches.ToDictionaryAsync(b => b.Id, b => b.Name);
        var byCustomer = txns
            .GroupBy(t => t.CustomerId)
            .Select(g =>
            {
                var first = g.First();
                var branchNames = g.Where(t => t.BranchId.HasValue)
                    .Select(t => t.BranchId!.Value).Distinct()
                    .Select(id => branchNameMap.GetValueOrDefault(id, "—"))
                    .OrderBy(n => n).ToList();
                return new LoyaltyCustomerRow
                {
                    CustomerId = g.Key,
                    CustomerName = first.CustomerName,
                    Phone = first.CustomerPhone,
                    Branches = string.Join(", ", branchNames),
                    Tier = first.CustomerTier,
                    CurrentBalance = first.CustomerBalance,
                    PointsEarned = g.Where(t => t.TransactionType == "earn").Sum(t => t.Points),
                    PointsRedeemed = -g.Where(t => t.TransactionType == "redeem").Sum(t => t.Points),
                    PointsExpired = -g.Where(t => t.TransactionType == "expire").Sum(t => t.Points),
                    RedemptionValue = g.Where(t => t.TransactionType == "redeem").Sum(t => t.MonetaryValue ?? 0),
                    LastActivityAt = g.Max(t => t.CreatedAt),
                };
            })
            .OrderByDescending(r => r.CurrentBalance)
            .ToList();

        return new LoyaltyReportResult
        {
            ByBranch = rows,
            ByCustomer = byCustomer,
            TierBreakdown = tierBreakdown,
            Kpis = new LoyaltyReportKpis
            {
                TotalPointsEarned = rows.Sum(r => r.PointsEarned),
                TotalPointsRedeemed = rows.Sum(r => r.PointsRedeemed),
                TotalPointsExpired = rows.Sum(r => r.PointsExpired),
                TotalRedemptionValue = rows.Sum(r => r.RedemptionValue),
                TotalActiveMembers = txns.Select(t => t.CustomerId).Distinct().Count(),
            },
        };
    }

    /// <summary>Builds a CSV or PDF export file from the same headers/rows/KPIs, per the FRD's multi-format export rule.</summary>
    private async Task<FileContentResult> BuildExportFile(
        string? format, string title, string filterSummary, (string Label, string Value)[] kpis,
        string[] headers, IReadOnlyList<object?[]> rows, string baseFileName)
    {
        var company = await db.CompanyProfiles.FindAsync(BaqalaPOS.Api.Models.CompanyProfile.SingletonId);
        var companyHeader = ExportFileBuilder.FormatCompanyHeader(company);

        if (string.Equals(format, "pdf", StringComparison.OrdinalIgnoreCase))
        {
            var pdfBytes = ReportPdfWriter.Write(title, filterSummary, kpis, headers, rows, companyHeader);
            return File(pdfBytes, "application/pdf", $"{baseFileName}.pdf");
        }
        var csvBytes = CsvWriter.Write(headers, rows, companyHeader);
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
    public decimal TobaccoFees { get; init; }
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
    // Displayed as a separate value alongside VAT/discounts — KSA tobacco excise charged on this
    // day's orders, distinct from ordinary VAT/custom fees.
    public decimal TobaccoFees { get; init; }
}

public sealed class PaymentSplitRow
{
    public string Method { get; init; } = "";
    public decimal Amount { get; init; }
}

public sealed class DailySalesItemRow
{
    public string ProductName { get; init; } = "";
    public string Sku { get; init; } = "";
    public decimal QuantitySold { get; init; }
    public decimal GrossSales { get; init; }
}

public sealed class DailySalesResult
{
    public DailySalesKpis Kpis { get; init; } = new();
    public List<DailySalesHour> Hourly { get; init; } = [];
    public List<PaymentSplitRow> PaymentSplit { get; init; } = [];
    public List<DailySalesItemRow> Items { get; init; } = [];
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
    public decimal TobaccoFees { get; init; }
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
    public decimal TobaccoFees { get; init; }
    public decimal Cogs { get; set; }
    public decimal GrossProfit { get; set; }
    public decimal? MarginPct { get; set; }
    public decimal AvgBasket { get; init; }
    public decimal? PreviousPeriodSales { get; init; }
    public decimal? GrowthPct { get; init; }
}

public sealed class MonthlySalesKpis
{
    public decimal NetSales { get; init; }
    public decimal GrossProfit { get; set; }
    public decimal? MarginPct { get; set; }
    public int Transactions { get; init; }
    public decimal ReturnValue { get; init; }
    public decimal DiscountValue { get; init; }
    public decimal TobaccoFees { get; init; }
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
    // Tobacco fees are recorded on the order, not the payment row — so this is a period total
    // alongside PaymentFees rather than a per-method split, which a payment row can't attribute.
    public decimal TobaccoFees { get; init; }
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
    public bool IsTobacco { get; init; }
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

// FRD §2.6 / §2.7 — inventory KPIs and aging.
public sealed class InventoryDashboardKpis
{
    public decimal TotalStockValue { get; set; }
    public decimal AvailableStockQty { get; init; }
    public int OutOfStockProducts { get; init; }
    public int NegativeInventoryItems { get; init; }
    public int LowStockProducts { get; init; }
    public int PendingPurchaseOrders { get; init; }
    public decimal WastageValue { get; set; }
    public decimal InventoryTurnover { get; init; }
    public decimal CogsValue { get; init; }
    // Same five-tier classification as the Product Performance report (see ProductPerformanceThresholds),
    // counted across distinct products on hand in this scope. Dead Stock's own count/value live on
    // the result as DeadStockSkus/DeadStockValue, matching where they already were.
    public int StarCount { get; init; }
    public int HighPerformerCount { get; init; }
    public int AveragePerformerCount { get; init; }
    public int SlowMovingCount { get; init; }
}

public sealed class InventoryMoverRow
{
    public Guid ProductId { get; init; }
    public string Sku { get; init; } = "";
    public string ProductName { get; init; } = "";
    public decimal UnitsMoved { get; init; }
    public decimal CogsValue { get; init; }
}

public sealed class InventoryAgingBucket
{
    public string Bucket { get; init; } = "";
    public int SkuCount { get; init; }
    public decimal OnHandQty { get; init; }
    public decimal StockValue { get; set; }
}

/// <summary>
/// How much of the requested period the movement ledger actually covers. The UI renders this as a
/// caveat next to turnover/movers so a partial figure is never mistaken for a complete one.
/// </summary>
public sealed class InventoryDataWindow
{
    public DateTime? LedgerStart { get; init; }
    public DateTime From { get; init; }
    public DateTime To { get; init; }
    public bool CoversFullPeriod { get; init; }
    public int SaleMovementsInPeriod { get; init; }
}

// FRD §INV-007 — one row per stock_movements entry, the same ledger the Inventory Aging and
// Product Performance drill-downs already read per-product, exposed here as its own first-class,
// filterable, exportable report rather than only an embedded drawer.
public sealed class StockMovementHistoryRow
{
    public Guid Id { get; init; }
    public DateTime CreatedAt { get; init; }
    public Guid ProductId { get; init; }
    public string Sku { get; init; } = "";
    public string ProductName { get; init; } = "";
    public string Category { get; init; } = "";
    public string Location { get; init; } = "";
    public string LocationType { get; init; } = "";
    // manual_receive | purchase_receive | sale | transfer_out | transfer_in | transfer_restore |
    // addition | reduction | waste | damage | return_to_supplier | expired
    public string MovementType { get; init; } = "";
    // Signed: positive = stock increased at this location, negative = decreased.
    public decimal Quantity { get; init; }
    public decimal? QuantityBefore { get; init; }
    public decimal? QuantityAfter { get; init; }
    public decimal Value { get; set; }
    public string? Supplier { get; init; }
    public string? BatchNumber { get; init; }
    public string? ReferenceType { get; init; }
    public string? ReferenceNumber { get; init; }
    public string? Notes { get; init; }
    public string? CreatedBy { get; init; }
    public Guid? CreatedById { get; init; }
}

public sealed class StockMovementHistoryKpis
{
    public int TotalMovements { get; init; }
    public decimal InboundQty { get; init; }
    public decimal OutboundQty { get; init; }
    public decimal NetValue { get; set; }
}

public sealed class StockMovementHistoryResult
{
    public StockMovementHistoryKpis Kpis { get; init; } = new();
    public List<StockMovementHistoryRow> Rows { get; init; } = [];
}

/// <summary>
/// FRD §2.7 — one row per product held at one location. Covers all four required items: Product Age
/// in Stock (<see cref="ProductAgeDays"/>), Days Since Last Movement, Slow Moving
/// (<see cref="UnitsMovedInPeriod"/>), and Dead Stock Analysis (<see cref="IsDeadStock"/>).
/// </summary>
public sealed class InventoryAgingRow
{
    public Guid ProductId { get; init; }
    public string Sku { get; init; } = "";
    public string ProductName { get; init; } = "";
    public string Category { get; init; } = "";
    // active | inactive | discontinued — catalog state of the SKU, distinct from Classification.
    public string ProductStatus { get; init; } = "active";
    public string Location { get; init; } = "";
    public string LocationType { get; init; } = "";
    public decimal OnHandQty { get; init; }
    public decimal StockValue { get; set; }
    // Profitability (FRD §INV-007) — same per-product gross profit / margin the Product Performance
    // report computes, carried through rather than recomputed so the two reports never disagree.
    public decimal GrossProfit { get; set; }
    public decimal? MarginPct { get; set; }
    // Age of the oldest batch still holding stock here. Null when no batch record exists — the
    // stock row alone cannot say when the goods arrived.
    public int? ProductAgeDays { get; init; }
    public int DaysSinceLastMovement { get; init; }
    public DateTime LastMovementDate { get; init; }
    // "ledger" = a real recorded movement. "stock_row" = fallback to the stock row's LastUpdated,
    // which predates the ledger and is only an approximation.
    public string LastMovementSource { get; init; } = "";
    public decimal UnitsMovedInPeriod { get; init; }
    public string AgeBucket { get; init; } = "";
    public bool IsDeadStock { get; init; }
    // Star Products | High Performers | Average Performers | Slow Moving Products | Dead Stock —
    // same composite classification as the Product Performance report, per product (identical
    // across every location-row that product appears in).
    public string Classification { get; init; } = "";
    public decimal PerformanceScore { get; init; }
}

public sealed class InventoryDashboardResult
{
    public InventoryDashboardKpis Kpis { get; init; } = new();
    public List<InventoryMoverRow> TopMoving { get; init; } = [];
    public List<InventoryMoverRow> SlowMoving { get; init; } = [];
    public List<InventoryAgingBucket> Aging { get; init; } = [];
    public List<InventoryAgingRow> AgingRows { get; init; } = [];
    public int DeadStockSkus { get; init; }
    public decimal DeadStockValue { get; set; }
    public InventoryDataWindow DataWindow { get; init; } = new();
}

// FRD §2.1 — "Stock Review" / "Stock Audit" / "Inventory Reconciliation" are one report over
// StockCount + StockCountItem. One row per counted line, not per session.
public sealed class StockReconciliationRow
{
    // Truncated for display; StockCountId is the real key for drilling into the session.
    public string CountId { get; init; } = "";
    public Guid StockCountId { get; init; }
    // review | audit | reconciliation, or null for sessions predating the column ("unspecified").
    public string? CountType { get; init; }
    public DateTime StartedAt { get; init; }
    public DateTime? CompletedAt { get; init; }
    // Exactly one of Branch/Warehouse is set, matching the session's own nullable-pair scope.
    public string? Branch { get; init; }
    public string? Warehouse { get; init; }
    public string Sku { get; init; } = "";
    public string ProductName { get; init; } = "";
    public string Category { get; init; } = "";
    public decimal SystemQty { get; init; }
    // Null while a line is still pending — rendered as "—", never as a 0 that would read as
    // "counted, found nothing".
    public decimal? CountedQty { get; init; }
    public decimal? Variance { get; init; }
    public decimal VarianceValue { get; set; }
    public string StartedBy { get; init; } = "";
    // Who physically performed the count (submitted it for review).
    public string? PerformedBy { get; init; }
    public string? ReviewedBy { get; init; }
    public string? ApprovedBy { get; init; }
    // draft | pending_review | pending_approval | approved | rejected | cancelled
    public string Status { get; init; } = "";
    public string? RejectionReason { get; init; }
    public DateTime? CountedAt { get; init; }
}

public sealed class StockReconciliationKpis
{
    public int SessionCount { get; init; }
    public int ItemsCounted { get; init; }
    public int ItemsPending { get; init; }
    public int ItemsWithVariance { get; init; }
    public decimal AccuracyPct { get; init; }
    public decimal NetVarianceUnits { get; init; }
    public decimal NetVarianceValue { get; set; }
    public decimal AbsVarianceValue { get; set; }
    public int PendingReviewCount { get; init; }
    public int PendingApprovalCount { get; init; }
}

public sealed class StockReconciliationResult
{
    public StockReconciliationKpis Kpis { get; init; } = new();
    public List<StockReconciliationRow> Rows { get; init; } = [];
}

public sealed class InventorySnapshotRow
{
    public Guid ProductId { get; init; }
    public string Sku { get; init; } = "";
    public string ProductName { get; init; } = "";
    public string Category { get; init; } = "";
    // Replaces the old branch-only `Branch` field: this report now spans both stock pools, so a row
    // names whichever location holds it and says which kind that is. LocationId lets the UI filter
    // without matching on display names.
    public string LocationType { get; init; } = "";
    public string Location { get; init; } = "";
    public Guid LocationId { get; init; }
    public bool IsTobacco { get; init; }
    public decimal OnHandQty { get; init; }
    public decimal ReservedQty { get; init; }
    public decimal AvailableQty { get; init; }
    public int ReorderLevel { get; init; }
    public decimal CostPrice { get; set; }
    public decimal StockCostValue { get; set; }
    public decimal RetailValue { get; init; }
    public DateTime LastMovementDate { get; init; }
    public string StockStatus { get; init; } = "";
}

public sealed class InventorySnapshotKpis
{
    public decimal TotalStockValue { get; set; }
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
    // This report always reflects live stock, not a stored historical snapshot (FRD AC44's "snapshot
    // timestamp" is this — the moment the data was read, not a point the caller can pick).
    public DateTime SnapshotAt { get; init; } = DateTime.UtcNow;
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
    public decimal TobaccoFees { get; init; }
    public decimal AvgBasket { get; init; }
    public decimal GrossProfit { get; set; }
    public decimal? MarginPct { get; set; }
    public int Rank { get; set; }
}

public sealed class BranchSalesKpis
{
    public string? TopBranch { get; init; }
    public string? LowestBranch { get; init; }
    public decimal TotalNetSales { get; init; }
    public decimal AverageBranchSales { get; init; }
    public decimal TotalReturns { get; init; }
    public decimal? OverallMarginPct { get; set; }
    public decimal TotalTobaccoFees { get; init; }
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
    public decimal TobaccoFees { get; init; }
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
    public decimal TobaccoFeeAmount { get; init; }
    public decimal ReturnsQty { get; init; }
    public decimal ReturnRatePct { get; init; }
    public decimal Cogs { get; set; }
    public decimal GrossProfit { get; set; }
    public decimal? MarginPct { get; set; }
    public decimal CurrentStock { get; init; }
}

public sealed class ProductSalesKpis
{
    public string? TopSku { get; init; }
    public decimal UnitsSold { get; init; }
    public decimal NetSales { get; init; }
    public decimal? GrossMarginPct { get; set; }
    public int DeadStockCount { get; init; }
    public decimal ReturnRatePct { get; init; }
    public decimal TotalTobaccoFees { get; init; }
}

public sealed class ProductSalesResult
{
    public ProductSalesKpis Kpis { get; init; } = new();
    public List<ProductSalesRow> Rows { get; init; } = [];
}

public sealed class ProductPerformanceRow
{
    public Guid ProductId { get; init; }
    public string Sku { get; init; } = "";
    public string ProductName { get; init; } = "";
    public string Category { get; init; } = "";
    // active | inactive | discontinued — the catalog status of the product itself, not its
    // performance Classification below.
    public string ProductStatus { get; init; } = "active";
    public decimal UnitsSold { get; init; }
    public decimal SalesValue { get; init; }
    public decimal Cogs { get; set; }
    public decimal GrossProfit { get; set; }
    public decimal? MarginPct { get; set; }
    public decimal CurrentStockQty { get; init; }
    public decimal CurrentStockValue { get; set; }
    // Age of the oldest batch still holding quantity anywhere in scope. Null when there's no batch
    // record at all (stock predates batch tracking, or there's no stock on hand).
    public int? DaysInStock { get; init; }
    // Null = never sold (within what the ledger can see) — distinct from 0, which is "sold today".
    public int? DaysSinceLastSale { get; init; }
    public decimal TurnoverRatio { get; init; }
    // 0-100 weighted composite rank that produced Classification — exposed so the tier is never a
    // black box; see ProductPerformanceThresholds for the exact weights.
    public decimal PerformanceScore { get; init; }
    // Star Products | High Performers | Average Performers | Slow Moving Products | Dead Stock
    public string Classification { get; init; } = "";
}

public sealed class ProductPerformanceKpis
{
    public int ProductCount { get; init; }
    public int StarCount { get; init; }
    public int HighPerformerCount { get; init; }
    public int AveragePerformerCount { get; init; }
    public int SlowMovingCount { get; init; }
    public int DeadStockCount { get; init; }
    public decimal DeadStockValue { get; set; }
    public decimal TotalSalesValue { get; set; }
}

public sealed class ProductPerformanceResult
{
    public ProductPerformanceKpis Kpis { get; init; } = new();
    public List<ProductPerformanceRow> Rows { get; init; } = [];
}

public sealed class ProductDrillDownSaleRow
{
    public DateTime Date { get; init; }
    public string Branch { get; init; } = "";
    public string Employee { get; init; } = "";
    public decimal Quantity { get; init; }
    public decimal NetAmount { get; init; }
}

public sealed class ProductDrillDownBatchRow
{
    public string Location { get; init; } = "";
    public string LocationType { get; init; } = ""; // branch | warehouse
    public string? Supplier { get; init; }
    public string? BatchNumber { get; init; }
    public DateTime ReceivedDate { get; init; }
    public DateTime? ExpiryDate { get; init; }
    public decimal RemainingQuantity { get; init; }
    public string Status { get; init; } = "";
}

public sealed class ProductDrillDownResult
{
    public string ProductName { get; init; } = "";
    public string Sku { get; init; } = "";
    public List<ProductDrillDownSaleRow> RecentSales { get; init; } = [];
    public List<ProductDrillDownBatchRow> Batches { get; init; } = [];
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
    public decimal ReturnsQty { get; init; }
    public decimal ReturnRatePct { get; init; }
    public decimal NetSales { get; init; }
    public decimal SalesContributionPct { get; init; }
    public decimal TobaccoFees { get; init; }
    public decimal Cogs { get; set; }
    public decimal GrossProfit { get; set; }
    public decimal? MarginPct { get; set; }
}

public sealed class CategoryPerformanceKpis
{
    public string? TopCategory { get; init; }
    public string? HighestMarginCategory { get; set; }
    public decimal CategoryReturnRatePct { get; init; }
    public int TotalCategoriesSold { get; init; }
    public decimal CategoryDiscountValue { get; init; }
    public decimal TotalTobaccoFees { get; init; }
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
    public string SupplierStatus { get; init; } = "";
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
    public bool IsTobacco { get; init; }
    public decimal Qty { get; init; }
    public string Reason { get; init; } = "";
    public decimal CostValue { get; set; }
    public string? Notes { get; init; }
    public string? BatchNumber { get; init; }
    public DateTime? ExpiryDate { get; init; }
    // FRD §2.3 — the report must name both the employee who raised the write-off and the one who
    // approved it. AdjustmentId is the real Guid (WasteId above is a truncated display string and
    // can't be used to call the approval endpoint).
    public Guid AdjustmentId { get; init; }
    public string CreatedBy { get; init; } = "";
    // The raiser's id, so the UI can disable Approve on a write-off the viewer raised themselves
    // rather than offering a button the endpoint will 403. Separate from the display name because
    // matching on names would break for two staff who share one.
    public Guid? CreatedById { get; init; }
    public string? ApprovedBy { get; init; }
    public string? ApprovalStatus { get; init; }
    public DateTime? ApprovedAt { get; init; }
    public string? RejectionReason { get; init; }
}

public sealed class WasteSpoilageKpis
{
    public decimal TotalWriteOffValue { get; set; }
    public int ExpiredItems { get; init; }
    public int DamagedItems { get; init; }
    public string? TopWasteCategory { get; init; }
    public decimal WastePctOfSales { get; set; }
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
    public string InvoiceNo { get; init; } = "";
    public DateTime DateTime { get; init; }
    public string Branch { get; init; } = "";
    public string Cashier { get; init; } = "";
    public string Customer { get; init; } = "";
    public string ReturnType { get; init; } = "";
    public string Reason { get; init; } = "";
    public string Skus { get; init; } = "";
    public decimal Qty { get; init; }
    public string RefundMethod { get; init; } = "";
    public decimal RefundAmount { get; init; }
    public decimal VatReversal { get; init; }
    public string ApprovedBy { get; init; } = "";
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
    public int Orders { get; init; }
    public decimal Sales { get; init; }
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
    // The slice of DiscountAmount that came from redeemed loyalty points — populated regardless
    // of DiscountType, so an order combining a coupon with loyalty redemption still reports its
    // loyalty portion even though the row's primary type is "coupon".
    public decimal LoyaltyDiscountAmount { get; init; }
    public decimal NetSalesAfterDiscount { get; init; }
    // A discount comes straight off net sales with no change to COGS, so its margin impact
    // equals the discount amount given up (FRD §7.15 "Margin Impact" column).
    public decimal? MarginImpact { get; set; }
}

public sealed class DiscountsKpis
{
    public decimal TotalDiscountValue { get; init; }
    public decimal ManualDiscountValue { get; init; }
    public decimal LoyaltyDiscountValue { get; init; }
    public int CouponUsage { get; init; }
    public decimal DiscountPctOfSales { get; init; }
    public decimal? MarginImpact { get; set; }
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

// Business-configured surcharges (delivery fee, card-payment surcharge) — Order.CustomFeeAmount.
// Deliberately NOT tobacco: KSA only recognizes VAT and tobacco excise as real taxes, so this
// report doesn't carry the legal-entity/CR/VAT treatment the Tobacco Excise report does — a
// service charge isn't a tax and shouldn't be presented like one on a compliance export.
public sealed class FeeRow
{
    public string TransactionId { get; init; } = "";
    public string InvoiceNo { get; init; } = "";
    public DateTime DateTime { get; init; }
    public string Branch { get; init; } = "";
    public string Cashier { get; init; } = "";
    public string CustomerType { get; init; } = "";
    // Which configured charge this row is (e.g. "Delivery Service Fee (SAR 5)"). Orders that
    // predate the named breakdown (OrderServiceCharge) fall back to "Service Charge" so the
    // amount still appears somewhere rather than being silently dropped.
    public string ChargeName { get; init; } = "";
    public decimal ServiceChargeAmount { get; init; }
}

public sealed class FeeReportKpis
{
    public decimal TotalServiceCharges { get; init; }
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
    // Carried so the client can request the transaction-level drill-down behind this aggregated
    // Product+Cashier row (see GetTobaccoExciseTransactions) — not rendered as its own column.
    public Guid ProductId { get; init; }
    public Guid? CashierId { get; init; }
    public string Sku { get; init; } = "";
    public string Barcode { get; init; } = "";
    public string ProductName { get; init; } = "";
    public string Brand { get; init; } = "";
    public string Category { get; init; } = "";
    public string Branch { get; init; } = "";
    public string Employee { get; init; } = "";
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

public sealed class TobaccoExciseTransactionRow
{
    public string OrderNumber { get; init; } = "";
    public DateTime DateTime { get; init; }
    public string Branch { get; init; } = "";
    public string Employee { get; init; } = "";
    public decimal Quantity { get; init; }
    public decimal TaxablePrice { get; init; }
    public decimal ExciseAmount { get; init; }
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
    // REP-002: legal entity identity for export/print — this is a real KSA tax (tobacco excise),
    // unlike the generic Service Charges report, which doesn't carry this since it isn't a tax.
    public string LegalCompanyName { get; init; } = "";
    public string CommercialRegistrationNumber { get; init; } = "";
    public string VatRegistrationNumber { get; init; } = "";
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

public sealed class SupplierReturnsReportItem
{
    public Guid ProductId { get; init; }
    public string ProductName { get; init; } = "—";
    public string Sku { get; init; } = "—";
    // Requested/approved/received are all shown in the per-return detail drawer — "returned
    // quantity" alone can't tell a manager that 40 units were sent back but only 32 accepted.
    public decimal RequestedQuantity { get; init; }
    public decimal? ApprovedQuantity { get; init; }
    public decimal? ReceivedQuantity { get; init; }
    public decimal ReturnedQuantity { get; init; }
    public decimal UnitCost { get; init; }
    public decimal TotalValue { get; init; }
    public string Reason { get; init; } = "—";
    public string? Notes { get; init; }
}

// One row per RTS transaction with nested line items (mirrors PurchaseOrderReportRow's
// Items list + eye-icon drawer) rather than one row per product — a return with several
// products used to repeat every header field across rows instead. Deliberately has no
// Branch field: RTS is a warehouse-only transaction (StockTransfer.SourceWarehouseId) with
// no real BranchId of its own — any "branch" is a best-effort inference through the
// warehouse's branch associations, so it's used only for role-based scoping in
// BuildSupplierReturnsReportAsync, never surfaced as a column here.
public sealed class SupplierReturnsReportRow
{
    public Guid Id { get; init; }
    public string ReturnNumber { get; init; } = "—";
    public DateTime ReturnDate { get; init; }
    public string SupplierName { get; init; } = "—";
    public string WarehouseName { get; init; } = "—";
    public string ReturnedBy { get; init; } = "—";
    public string ApprovedBy { get; init; } = "—";
    public string Status { get; init; } = "—";
    public string? ReturnReason { get; init; }
    public string? Notes { get; init; }
    public decimal TotalQuantity { get; init; }
    public decimal TotalValue { get; init; }
    public List<SupplierReturnsReportItem> Items { get; init; } = [];
}

public sealed class StockTransferReportRow
{
    public string TransferNumber { get; init; } = "—";
    public string TransferType { get; init; } = "—";
    // Split into dedicated branch/warehouse columns (rather than one merged Source/Destination
    // string) so branch-to-branch transfers show their own Source/Destination Branch columns
    // distinct from Sending/Receiving Warehouse — each is "—" when not applicable to this transfer.
    public string SourceBranch { get; init; } = "—";
    public string DestinationBranch { get; init; } = "—";
    public string SendingWarehouse { get; init; } = "—";
    public string ReceivingWarehouse { get; init; } = "—";
    public string Status { get; init; } = "—";
    public string CreatedBy { get; init; } = "—";
    public string ApprovedBy { get; init; } = "—";
    public string ReceivedBy { get; init; } = "—";
    public string ProductName { get; init; } = "—";
    public string Sku { get; init; } = "—";
    public decimal OrderedQuantity { get; init; }
    public decimal ReceivedQuantity { get; init; }
    public decimal UnitCost { get; init; }
    public decimal TotalCost { get; init; }
    public DateTime CreatedAt { get; init; }
    public DateTime? CompletedDate { get; init; }
    public string? Notes { get; init; }
}

public sealed class PurchaseOrderReportItem
{
    public string ProductName { get; init; } = "—";
    public string Sku { get; init; } = "—";
    public decimal OrderedQuantity { get; init; }
    public decimal ReceivedQuantity { get; init; }
    public decimal UnitCost { get; init; }
    public decimal Subtotal { get; init; }
}

public sealed class PurchaseOrderReportRow
{
    public Guid Id { get; init; }
    public string PoNumber { get; init; } = "—";
    public string SupplierName { get; init; } = "—";
    public string BranchName { get; init; } = "—";
    public string WarehouseName { get; init; } = "—";
    public DateTime PurchaseDate { get; init; }
    public string Status { get; init; } = "—";
    public string PaymentStatus { get; init; } = "—";
    public string RequestedBy { get; init; } = "—";
    public string CreatedBy { get; init; } = "—";
    public string ApprovedBy { get; init; } = "—";
    public string ReceivedBy { get; init; } = "—";
    public decimal TotalAmount { get; init; }
    public List<PurchaseOrderReportItem> Items { get; init; } = [];
}

public sealed class SupplierReportRow
{
    public Guid SupplierId { get; init; }
    public string SupplierName { get; init; } = "—";
    public int PurchaseCount { get; init; }
    public decimal TotalPurchaseAmount { get; init; }
    public decimal PaidAmount { get; init; }
    public decimal DueAmount { get; init; }
    public decimal ReturnAmount { get; init; }
    public decimal NetPurchaseAmount { get; init; }
    public decimal AveragePurchaseValue { get; init; }
    public DateTime LastPurchaseDate { get; init; }
}

public sealed class SupplierReportPurchaseItem
{
    public string ProductName { get; init; } = "—";
    public string Sku { get; init; } = "—";
    public string Category { get; init; } = "—";
    public string UnitOfMeasure { get; init; } = "—";
    public decimal Quantity { get; init; }
    public decimal ReturnedQuantity { get; init; }
    public decimal UnitPrice { get; init; }
    public decimal LineTotal { get; init; }
}

public sealed class SupplierReportPurchaseRow
{
    public Guid Id { get; init; }
    public string PoNumber { get; init; } = "—";
    public DateTime PurchaseDate { get; init; }
    public string LocationName { get; init; } = "—";
    public string Status { get; init; } = "—";
    public string CreatedBy { get; init; } = "—";
    public decimal TotalAmount { get; init; }
    public decimal PaidAmount { get; init; }
    public decimal DueAmount { get; init; }
    public List<SupplierReportPurchaseItem> Items { get; init; } = [];
}

public sealed class SupplierReportDetail
{
    public Guid SupplierId { get; init; }
    public string SupplierName { get; init; } = "—";
    public int PurchaseCount { get; init; }
    public decimal TotalPurchaseAmount { get; init; }
    public decimal PaidAmount { get; init; }
    public decimal DueAmount { get; init; }
    public decimal ReturnAmount { get; init; }
    public decimal NetPurchaseAmount { get; init; }
    public List<SupplierReportPurchaseRow> Purchases { get; init; } = [];
}

public sealed class EmployeeAuditRow
{
    public Guid Id { get; init; }
    public DateTime CreatedAt { get; init; }
    public string EmployeeName { get; init; } = "—";
    public string ActionCategory { get; init; } = "—";
    public string ActionLabel { get; init; } = "—";
    public string? OldValueSummary { get; init; }
    public string? NewValueSummary { get; init; }
    public string BranchName { get; init; } = "—";
    public string DeviceName { get; init; } = "—";
    public string RelatedTransaction { get; init; } = "—";
    // Raw AuditLog.EntityType ("Order", "StockTransfer", ...) — lets the frontend build the
    // Transaction Type filter's option list from whatever types actually occur, instead of
    // hardcoding a set that would drift out of sync with EmployeeAuditActionMap's action list.
    public string? EntityType { get; init; }
    public string Severity { get; init; } = "info";
    // How many product lines the Details drawer will show — lets the list column say
    // "3 products" instead of making the reader open every row to find out which ones have any.
    public int ItemCount { get; init; }
    public decimal TotalQuantity { get; init; }
}

// One product line affected by an audited action — the "what was actually touched" the one-line
// summary on both employee reports deliberately omits.
public sealed class AuditDetailItem
{
    public string ProductName { get; init; } = "—";
    public string Sku { get; init; } = "—";
    public decimal Quantity { get; init; }
    public decimal? UnitPrice { get; init; }
    public decimal? LineTotal { get; init; }
    public string? Note { get; init; }
}

// A single before/after pair. Also reused (with OldValue null) for the flat "transaction
// summary" fields, which have no before-state by definition.
public sealed class AuditFieldChange
{
    public string Field { get; init; } = "";
    public string? OldValue { get; init; }
    public string? NewValue { get; init; }
}

public sealed class AuditDetailResult
{
    public Guid Id { get; init; }
    public DateTime CreatedAt { get; init; }
    public string Action { get; init; } = "";
    public string ActionLabel { get; init; } = "";
    public string? Module { get; init; }
    public string? EntityType { get; init; }
    public Guid? EntityId { get; init; }
    public string EmployeeName { get; init; } = "—";
    public string PerformedBy { get; init; } = "—";
    public string BranchName { get; init; } = "—";
    public string DeviceName { get; init; } = "—";
    public string? IpAddress { get; init; }
    public string Severity { get; init; } = "info";
    public string? Notes { get; init; }
    public string RelatedTransaction { get; init; } = "—";
    public List<AuditFieldChange> TransactionFields { get; init; } = [];
    public List<AuditFieldChange> Changes { get; init; } = [];
    public List<AuditDetailItem> Items { get; init; } = [];
}

public sealed class LoyaltyReportRow
{
    public Guid BranchId { get; init; }
    public string BranchName { get; init; } = "";
    public decimal PointsEarned { get; init; }
    public decimal PointsRedeemed { get; init; }
    public decimal PointsExpired { get; init; }
    public decimal RedemptionValue { get; init; }
    public int ActiveMembers { get; init; }
}

public sealed class LoyaltyTierRow
{
    public string Tier { get; init; } = "";
    public int Members { get; init; }
    public decimal TotalBalance { get; init; }
}

public sealed class LoyaltyCustomerRow
{
    public Guid CustomerId { get; init; }
    public string CustomerName { get; init; } = "";
    public string Phone { get; init; } = "";
    // Comma-joined names of every branch this customer had loyalty activity at within the
    // selected range — a customer can earn/redeem at more than one branch, so this isn't a
    // single BranchId the way LoyaltyReportRow's is.
    public string Branches { get; init; } = "";
    public string Tier { get; init; } = "";
    public decimal CurrentBalance { get; init; }
    public decimal PointsEarned { get; init; }
    public decimal PointsRedeemed { get; init; }
    public decimal PointsExpired { get; init; }
    public decimal RedemptionValue { get; init; }
    public DateTime LastActivityAt { get; init; }
}

public sealed class LoyaltyReportKpis
{
    public decimal TotalPointsEarned { get; init; }
    public decimal TotalPointsRedeemed { get; init; }
    public decimal TotalPointsExpired { get; init; }
    public decimal TotalRedemptionValue { get; init; }
    public int TotalActiveMembers { get; init; }
}

public sealed class LoyaltyReportResult
{
    public List<LoyaltyReportRow> ByBranch { get; init; } = [];
    public List<LoyaltyCustomerRow> ByCustomer { get; init; } = [];
    public List<LoyaltyTierRow> TierBreakdown { get; init; } = [];
    public LoyaltyReportKpis Kpis { get; init; } = new();
}
