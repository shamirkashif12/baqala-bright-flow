using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OrdersController(BaqalaDbContext db, IEmailService emailService, IZatcaService zatcaService, IAuditService audit, INotificationService notifications, IStockAlertService stockAlerts, IBatchConsumptionService batchConsumption, IPackBreakService packBreaks, IStockMovementService stockMovements, IOrderVoidService orderVoidService, IOrderEditService orderEditService, IApprovalNotificationService approvalNotifications, ILogger<OrdersController> logger) : ControllerBase
{
    // Branch-scoped roles (anything but tenant_admin) may only see their own branch's orders —
    // mirrors ReportsController.GetCallerContext. Previously branchId was just an optional query
    // param the frontend happened to pre-fill with the caller's branch; a direct API call with a
    // different/no branchId returned every branch's orders regardless of role.
    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    // Online orders are managed in Orders → Online Orders (OnlineOrdersController), which knows
    // about their reservation-vs-deduction ledger timing, delivery fee, and — for card-paid ones —
    // the MyFatoorah payment that has to be refunded when they're rejected. The generic POS Edit /
    // Void / status / add-payment paths here know none of that: an edit here recomputes the total
    // without the delivery fee, and Void just stamps the payment "cancelled" ("Refund Due"), leaving
    // the customer's card payment untouched at the gateway. So they refuse online orders outright
    // and point staff to the right screen. Returns null when the order is a normal POS/kiosk one.
    private static string? OnlineOrderGuard(Order order)
    {
        if (order.Source != "online") return null;
        return order.PaymentStatus is "paid" or "refunded"
            ? "This is an online order paid by card — manage it from Orders → Online Orders (Reject there refunds the customer through MyFatoorah)."
            : "This is an online order — manage it from Orders → Online Orders (approve, edit lines, reject, deliver).";
    }

    // Branch-specific active program if one exists, else the one guaranteed business-wide
    // default (BranchId == null, seeded in BaqalaDbContext) — mirrors LoyaltyController's
    // identically-named resolver, duplicated per-controller like GetCallerContext above since
    // this codebase has no shared service layer for per-entity logic. Governs EARNING/REDEMPTION
    // terms only (rate, redemption value, min/max redeem) — these are allowed to vary per branch.
    // Implementation lives on OrderEditService (which needs the identical answer when replaying an
    // approved order modification) — delegated rather than duplicated so the two can't drift.
    private Task<LoyaltyProgram?> ResolveLoyaltyProgramAsync(Guid branchId) =>
        OrderEditService.ResolveLoyaltyProgramAsync(db, branchId);

    // Tier (Standard/Silver/Gold/Platinum) is a single field on Customer, shared across every
    // branch — it can't be recomputed against whichever branch's program happens to be active for
    // the order just processed, or the SAME customer's tier would flip depending on which branch's
    // thresholds last touched them. So tier thresholds and per-tier earn multipliers are
    // deliberately read ONLY from the one business-wide default program (BranchId == null),
    // never from a branch override, regardless of which branch this order belongs to. If the
    // default program itself is inactive, tier is frozen (not recomputed) rather than falling
    // back to some other branch's numbers.
    private Task<LoyaltyProgram?> ResolveGlobalTierConfigAsync() =>
        OrderEditService.ResolveGlobalTierConfigAsync(db);

    // FRD 16.1 "POS Actions" — the Employee Activity Report can only surface these rows if they
    // carry module/employeeId like every HRM audit call already does; POS-side actions predate
    // that addition and only ever passed userId.
    private async Task<Guid?> ResolveEmployeeIdAsync(Guid? userId) =>
        userId.HasValue ? (await db.Employees.Where(e => e.UserId == userId).Select(e => (Guid?)e.Id).FirstOrDefaultAsync()) : null;

    // Sum of this order's line items whose product belongs to the given category — used to
    // recompute a "category"-scoped Discount/Coupon's contribution server-side. Materializes the
    // category's product ids first and filters in memory rather than a `.Contains()` against a
    // parameterized Guid list inside the EF query itself — that throws on this MySQL provider
    // ("Expression '@Select' in the SQL tree does not have a type mapping assigned"), same
    // workaround already used in StockTransfersController.Create.
    private async Task<decimal> CategoryDiscountBasisAsync(Guid? categoryId, IEnumerable<OrderItem> items)
    {
        if (categoryId is null) return 0;
        var categoryProductIds = (await db.Products.Where(p => p.CategoryId == categoryId).Select(p => p.Id).ToListAsync()).ToHashSet();
        return items.Where(i => categoryProductIds.Contains(i.ProductId)).Sum(i => i.TotalPrice);
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] Guid[]? branchId,
        [FromQuery] string[]? status,
        [FromQuery] string[]? paymentStatus,
        [FromQuery] string[]? paymentMethod,
        [FromQuery] Guid? customerId,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int? page,
        [FromQuery] int? pageSize)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue) branchId = [callerBranchId.Value];

        var query = db.Orders
            .Include(o => o.Branch)
            .Include(o => o.Cashier)
            .Include(o => o.Customer)
            .Include(o => o.Payments)
            .Include(o => o.Items)
            .AsQueryable();
        // Branch/status/paymentStatus are arrays — never `.Contains()` a Guid[]/string[] directly
        // against a DbSet-backed IQueryable on this repo's MySQL provider (see the
        // ef-mysql-inlist-gotcha memory: it throws at execution time on 2+ values despite compiling
        // and passing a single-value smoke test). Only the date-range filters run in SQL below; the
        // array filters are applied in-memory after materializing.
        if (from.HasValue) query = query.Where(o => o.CreatedAt >= from);
        if (to.HasValue) query = query.Where(o => o.CreatedAt <= to);
        if (customerId.HasValue) query = query.Where(o => o.CustomerId == customerId);

        // MIMONY-PII-ORDERS-CROSSBRANCH-001: id+fullName alone (the fix below) still named a
        // cashier who has since transferred to another branch — a branch-scoped viewer could see
        // WHO a no-longer-local cashier is by name. Hide the cashier entirely (not just its PII
        // fields) once their CURRENT branch differs from the caller's own; tenant_admin still
        // sees everyone, matching every other cross-branch exemption in this controller.
        var isAdmin = callerRole == "tenant_admin";
        var allOrders = await query.OrderByDescending(o => o.CreatedAt)
            .Select(o => new
            {
                o.Id, o.OrderNumber, o.Source, o.BranchId, o.CustomerId, o.CashierId, o.TerminalId, o.ShiftId, o.CouponId,
                o.Subtotal, o.DiscountAmount, o.LoyaltyPointsRedeemed, o.LoyaltyDiscountAmount, o.TaxAmount, o.CustomFeeAmount, o.TobaccoFeeAmount, o.TotalAmount,
                o.PaymentStatus, o.OrderStatus, o.Notes, o.ClientRequestId, o.VoidReason, o.CreatedAt, o.UpdatedAt,
                Branch = o.Branch == null ? null : new { o.Branch.Id, o.Branch.Name },
                Cashier = o.Cashier == null || (!isAdmin && callerBranchId.HasValue && o.Cashier.BranchId != callerBranchId)
                    ? null
                    : new { o.Cashier.Id, o.Cashier.FullName },
                Customer = o.Customer == null ? null : new { o.Customer.Id, o.Customer.FullName, o.Customer.Phone },
                Items = o.Items.Select(i => new { i.Id, i.ProductId, i.Quantity, i.UnitPrice, i.TotalPrice, i.DiscountAmount, i.TaxAmount, i.TobaccoFeeAmount }),
                Payments = o.Payments.Select(p => new { p.Id, p.PaymentMethod, p.Amount, p.ReferenceNumber, p.Status }),
                Discounts = o.Discounts.Select(d => new { d.Id, d.DiscountId, d.Name, d.Amount }),
                ServiceCharges = o.ServiceCharges.Select(s => new { s.Id, s.TaxFeeRuleId, s.Name, s.Amount }),
            })
            .ToListAsync();

        var scoped = allOrders.AsEnumerable();
        if (branchId is { Length: > 0 }) scoped = scoped.Where(o => branchId.Contains(o.BranchId));
        if (status is { Length: > 0 }) scoped = scoped.Where(o => status.Contains(o.OrderStatus));
        if (paymentStatus is { Length: > 0 }) scoped = scoped.Where(o => paymentStatus.Contains(o.PaymentStatus));
        if (paymentMethod is { Length: > 0 }) scoped = scoped.Where(o => o.Payments.Any(p => paymentMethod.Contains(p.PaymentMethod)));
        var filtered = scoped.ToList();

        var totalCount = filtered.Count;
        var effectivePageSize = pageSize is > 0 and <= 200 ? pageSize.Value : 50;
        var effectivePage = page is > 0 ? page.Value : 1;
        // page/pageSize are optional — omitting them keeps the old "return up to 200, no paging"
        // behavior for callers that don't paginate (Cashier dashboard, Branches, Sales, Returns).
        var paged = page.HasValue || pageSize.HasValue
            ? filtered.Skip((effectivePage - 1) * effectivePageSize).Take(effectivePageSize).ToList()
            : filtered.Take(200).ToList();

        // A queued cancellation/modification left no trace on the order itself — the order simply
        // looked untouched, so a manager had no way to know from this screen that someone was
        // waiting on them. Attach the pending request so the list can badge the row and offer
        // Approve/Reject inline. Only the current page's orders are annotated.
        var pendingByOrder = (await db.ApprovalRequests
                .Include(a => a.RequestedByUser)
                .Where(a => a.Status == "pending" && a.EntityType == "Order")
                .OrderByDescending(a => a.RequestedAt)
                .ToListAsync())
            .Where(a => a.EntityId.HasValue)
            .GroupBy(a => a.EntityId!.Value)
            .ToDictionary(g => g.Key, g => g.First());

        var orders = paged.Select(o => new
        {
            o.Id, o.OrderNumber, o.Source, o.BranchId, o.CustomerId, o.CashierId, o.TerminalId, o.ShiftId, o.CouponId,
            o.Subtotal, o.DiscountAmount, o.LoyaltyPointsRedeemed, o.LoyaltyDiscountAmount, o.TaxAmount, o.CustomFeeAmount, o.TobaccoFeeAmount, o.TotalAmount,
            o.PaymentStatus, o.OrderStatus, o.Notes, o.ClientRequestId, o.VoidReason, o.CreatedAt, o.UpdatedAt,
            o.Branch, o.Cashier, o.Customer, o.Items, o.Payments, o.Discounts, o.ServiceCharges,
            PendingApproval = pendingByOrder.TryGetValue(o.Id, out var pa)
                ? new
                {
                    pa.Id,
                    pa.RequestType,
                    pa.RequestedAt,
                    RequestedByName = pa.RequestedByUser?.FullName,
                    pa.Reason,
                    Summary = ApprovalsController.EntityLabel(pa),
                }
                : null,
        }).ToList();

        if (!page.HasValue && !pageSize.HasValue) return Ok(orders);
        return Ok(new { total = totalCount, page = effectivePage, pageSize = effectivePageSize, items = orders });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        var isAdmin = callerRole == "tenant_admin";

        var order = await db.Orders
            .Where(o => o.Id == id)
            .Select(o => new
            {
                o.Id, o.OrderNumber, o.Source, o.BranchId, o.CustomerId, o.CashierId, o.TerminalId, o.ShiftId, o.CouponId,
                o.Subtotal, o.DiscountAmount, o.LoyaltyPointsRedeemed, o.LoyaltyDiscountAmount, o.TaxAmount, o.CustomFeeAmount, o.TobaccoFeeAmount, o.TotalAmount,
                o.PaymentStatus, o.OrderStatus, o.Notes, o.ClientRequestId, o.VoidReason, o.CreatedAt, o.UpdatedAt,
                Branch = o.Branch == null ? null : new { o.Branch.Id, o.Branch.Name },
                // Redacted — same reason as GetAll above, plus MIMONY-PII-ORDERS-CROSSBRANCH-001:
                // hide the cashier entirely once their current branch differs from the caller's.
                Cashier = o.Cashier == null || (!isAdmin && callerBranchId.HasValue && o.Cashier.BranchId != callerBranchId)
                    ? null
                    : new { o.Cashier.Id, o.Cashier.FullName },
                Customer = o.Customer == null ? null : new { o.Customer.Id, o.Customer.FullName, o.Customer.Phone, o.Customer.Email },
                Items = o.Items.Select(i => new
                {
                    i.Id, i.ProductId, i.Quantity, i.UnitPrice, i.TotalPrice, i.DiscountAmount, i.TaxAmount, i.TobaccoFeeAmount,
                    Product = i.Product == null ? null : new { i.Product.Id, i.Product.Name, i.Product.Sku }
                }),
                Payments = o.Payments.Select(p => new { p.Id, p.PaymentMethod, p.Amount, p.ReferenceNumber, p.Status }),
                Discounts = o.Discounts.Select(d => new { d.Id, d.DiscountId, d.Name, d.Amount }),
                ServiceCharges = o.ServiceCharges.Select(s => new { s.Id, s.TaxFeeRuleId, s.Name, s.Amount }),
            })
            .FirstOrDefaultAsync();
        if (order is null) return NotFound(new { message = "Order not found." });

        // Branch-scoped roles may only look up an order from their own branch — mirrors GetAll's
        // filter, which this direct-by-id lookup previously bypassed entirely (any authenticated
        // caller could fetch any order, and its embedded cashier PII, given just its GUID).
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue && order.BranchId != callerBranchId)
            return NotFound(new { message = "Order not found." });

        return Ok(order);
    }

    [HttpGet("by-number/{orderNumber}")]
    public async Task<IActionResult> GetByOrderNumber(string orderNumber)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        var isAdmin = callerRole == "tenant_admin";

        // Same lean projection as GetById — was previously `.Include()`-ing and returning the
        // raw entity graph, which pulls a product's full `ImageUrl` (an inline base64 data-URI,
        // sometimes tens of KB) into the response. See MIMONY-ORDERS-CREATE-RAWENTITY-001.
        var order = await db.Orders
            .Where(o => o.OrderNumber == orderNumber)
            .Select(o => new
            {
                o.Id, o.OrderNumber, o.Source, o.BranchId, o.CustomerId, o.CashierId, o.TerminalId, o.ShiftId, o.CouponId,
                o.Subtotal, o.DiscountAmount, o.LoyaltyPointsRedeemed, o.LoyaltyDiscountAmount, o.TaxAmount, o.CustomFeeAmount, o.TobaccoFeeAmount, o.TotalAmount,
                o.PaymentStatus, o.OrderStatus, o.Notes, o.ClientRequestId, o.VoidReason, o.CreatedAt, o.UpdatedAt,
                Branch = o.Branch == null ? null : new { o.Branch.Id, o.Branch.Name },
                Cashier = o.Cashier == null || (!isAdmin && callerBranchId.HasValue && o.Cashier.BranchId != callerBranchId)
                    ? null
                    : new { o.Cashier.Id, o.Cashier.FullName },
                Customer = o.Customer == null ? null : new { o.Customer.Id, o.Customer.FullName, o.Customer.Phone, o.Customer.Email },
                Items = o.Items.Select(i => new
                {
                    i.Id, i.ProductId, i.Quantity, i.UnitPrice, i.TotalPrice, i.DiscountAmount, i.TaxAmount, i.TobaccoFeeAmount,
                    Product = i.Product == null ? null : new { i.Product.Id, i.Product.Name, i.Product.Sku }
                }),
                Payments = o.Payments.Select(p => new { p.Id, p.PaymentMethod, p.Amount, p.ReferenceNumber, p.Status }),
                Discounts = o.Discounts.Select(d => new { d.Id, d.DiscountId, d.Name, d.Amount }),
                ServiceCharges = o.ServiceCharges.Select(s => new { s.Id, s.TaxFeeRuleId, s.Name, s.Amount }),
            })
            .FirstOrDefaultAsync();
        if (order is null) return NotFound(new { message = "Order not found." });

        // Same branch-scoping gap as GetById above — a direct order-number lookup previously
        // bypassed the caller's branch entirely.
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue && order.BranchId != callerBranchId)
            return NotFound(new { message = "Order not found." });

        return Ok(order);
    }

    // Downloadable PDF for the "Download" button next to Print on the Orders/Sales/ZATCA invoice
    // views — mirrors the on-screen "Tax Invoice" receipt card (OrderInvoiceDialog / the POS
    // checkout dialog), not EmailService's separate, more formal A4 invoice used for emailing
    // customers. qr lets the ZATCA Invoices page pass the real Phase 2-signed QR
    // (ZatcaInvoice.QrCodeValue) it already has on hand instead of this rebuilding a weaker
    // Phase-1 fallback.
    [HttpGet("{id:guid}/invoice-pdf")]
    public async Task<IActionResult> GetInvoicePdf(Guid id, [FromQuery] string? qr)
    {
        var (callerRole, callerBranchId) = GetCallerContext();

        var order = await db.Orders
            .Include(o => o.Branch)
            .Include(o => o.Customer)
            .Include(o => o.Payments)
            .Include(o => o.ServiceCharges)
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .FirstOrDefaultAsync(o => o.Id == id);
        if (order is null) return NotFound(new { message = "Order not found." });

        // Same branch-scoping as GetById — a direct-by-id lookup must not let a branch-scoped
        // caller download another branch's invoice.
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue && order.BranchId != callerBranchId)
            return NotFound(new { message = "Order not found." });

        var zatca = await db.ZatcaSettings.FirstOrDefaultAsync(z => z.BranchId == order.BranchId);
        var company = await db.CompanyProfiles.FindAsync(CompanyProfile.SingletonId);
        var pdfBytes = ReceiptPdfWriter.Write(order, zatca?.VatRegistrationNumber, zatca?.SellerName ?? order.Branch?.Name, company?.CrNumber, qr);
        return File(pdfBytes, "application/pdf", $"invoice-{order.OrderNumber}.pdf");
    }

    /// <param name="allowPackBreak">
    /// The cashier has confirmed that unopened packs may be broken open to cover a shortfall of
    /// loose units (see the pack-break suggestion in the stock pre-flight below). A query flag
    /// rather than a body field so no existing caller's payload changes shape; it defaults off
    /// because opening a carton is a physical act nobody should be doing on the customer's behalf
    /// without being asked.
    /// </param>
    [RequirePermission("POS", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Order order, [FromQuery] bool allowPackBreak = false)
    {
        // Packs the stock pre-flight decided must be opened to fulfil this order, applied inside
        // the locked stock-reduction transaction further down so concurrent sales can't both open
        // the same last carton. Keyed by the loose product that came up short.
        var packBreaksNeeded = new Dictionary<Guid, (Product PackProduct, decimal Packs)>();

        // Idempotency: if the client already successfully created an order for this exact
        // checkout attempt (its response was lost to a network drop/timeout and it's retrying
        // the same Confirm click), return the existing order instead of creating a duplicate —
        // double stock decrement and double shift total for one real sale otherwise.
        if (order.ClientRequestId.HasValue)
        {
            var existing = await db.Orders
                .Include(o => o.Items).Include(o => o.Payments).Include(o => o.Discounts).Include(o => o.ServiceCharges)
                .FirstOrDefaultAsync(o => o.ClientRequestId == order.ClientRequestId);
            if (existing is not null) return Ok(existing);
        }

        // An order with a total but no line items is unauditable and fails ZATCA
        // itemised-invoice requirements — reject at the source rather than persist it.
        if (order.Items.Count == 0)
            return BadRequest(new { message = "An order must have at least one line item." });

        // Self-checkout kiosk orders: the caller is a device credential (see
        // KioskAuthController), never a cashier, so every field that would normally come from
        // the client or from a cashier's shift is instead forced from the kiosk's own JWT
        // claims — a kiosk has no reason to ever send a different branch/terminal than the one
        // it was paired to, and letting it do so would let a compromised kiosk token attribute
        // sales to (and drain stock from) a branch it isn't physically in. This must happen
        // BEFORE the expired-batch check below, which trusts order.BranchId.
        if (User.FindFirst("role")?.Value == "kiosk")
        {
            if (!Guid.TryParse(User.FindFirst("branchId")?.Value, out var kioskBranchId))
                return Unauthorized(new { message = "Kiosk token is missing a branch." });
            order.Source = "kiosk";
            order.CashierId = null;
            order.ShiftId = null;
            order.BranchId = kioskBranchId;

            // The kiosk's terminalId claim is minted once at pairing time and lives for 24h —
            // if that terminal row gets deleted/recreated in the meantime (demo-data reset, or
            // staff removing/re-adding the kiosk in Terminals admin), a stale-but-well-formed
            // GUID here would otherwise blow up the INSERT below with a foreign-key violation
            // and fail the entire sale for a reason the customer/kiosk has no way to fix. There is
            // no real payment terminal to protect by hard-failing here, so just drop the link.
            order.TerminalId = Guid.TryParse(User.FindFirst("terminalId")?.Value, out var kioskTerminalId)
                && await db.Terminals.AnyAsync(t => t.Id == kioskTerminalId)
                ? kioskTerminalId : null;

            var settings = await db.PosSettings.FirstOrDefaultAsync(s => s.BranchId == kioskBranchId);
            var maxOrderValue = settings?.SelfCheckoutMaxOrderValueSar ?? 500m;
            if (order.TotalAmount > maxOrderValue)
                return BadRequest(new { message = $"This order exceeds the self-checkout limit of {maxOrderValue:0.##} SAR — please see an attendant." });

            // Loop per item rather than a single Where(productIds.Contains(...)) query — the
            // MySQL EF provider in use here fails to assign a type mapping to a List<Guid>
            // parameter in a Contains() translation (same issue worked around in DataSeeder's
            // PatchPermissionsAsync/PatchMarketingPermissionsAsync).
            var ineligible = new List<string>();
            foreach (var productId in order.Items.Select(i => i.ProductId).Distinct())
            {
                var product = await db.Products.FirstOrDefaultAsync(p => p.Id == productId);
                if (product is not null && !product.AllowSelfCheckout)
                    ineligible.Add(product.Name);
            }
            if (ineligible.Count > 0)
                return BadRequest(new { message = $"These items require an attendant: {string.Join(", ", ineligible)}." });
        }

        // Single per-branch settings row backs every "block expired items" toggle the admin can
        // see (Compliance → "Auto-block expired items" and POS Settings → Scan & Expiry both read
        // and write this same PosSettings.BlockExpiredItems column) — this is the one place
        // checkout actually consults it, so flipping either UI now has a real effect instead of
        // being purely decorative. Defaults to true (block) when a branch has no settings row yet.
        var posSettings = await db.PosSettings.FirstOrDefaultAsync(s => s.BranchId == order.BranchId);
        var blockExpiredItems = posSettings?.BlockExpiredItems ?? true;

        // Discount policy cap (POS Settings → CashierMaxDiscountPct / ManagerMaxDiscountPct). These
        // columns were settable via the Settings API but nothing ever read them at checkout — only
        // EditOrder enforced ManagerMaxDiscountPct (see below), and only on a later dashboard edit, so
        // the original sale could still carry any uncapped discount. Catalog-level Product.Discount
        // (a fixed markdown the cashier never chose, not a discretionary discount) is backed out of
        // order.DiscountAmount before the cap is applied — recomputed here from the line items the
        // same way the POS frontend computes its own productDiscountTotal, since Create only ever
        // receives the combined figure. tenant_admin is exempt, same as EditOrder.
        if (order.Source != "kiosk" && order.Subtotal > 0 && order.DiscountAmount > 0)
        {
            var callerRole = User.FindFirst("role")?.Value;
            if (callerRole != "tenant_admin")
            {
                var catalogDiscountTotal = 0m;
                foreach (var item in order.Items)
                {
                    var product = await db.Products.FindAsync(item.ProductId);
                    if (product is null || product.Discount is null || product.Discount <= 0) continue;
                    var lineSubtotal = item.Quantity * item.UnitPrice;
                    catalogDiscountTotal += product.DiscountType == "percentage"
                        ? lineSubtotal * (product.Discount.Value / 100m)
                        : Math.Min(product.Discount.Value * item.Quantity, lineSubtotal);
                }
                var discretionaryDiscount = Math.Max(0, order.DiscountAmount - catalogDiscountTotal);
                var requestedDiscountPct = discretionaryDiscount / order.Subtotal * 100m;
                var cap = callerRole == "cashier" ? (posSettings?.CashierMaxDiscountPct ?? 5m) : (posSettings?.ManagerMaxDiscountPct ?? 25m);
                if (requestedDiscountPct > cap)
                    return BadRequest(new { message = $"A discount of {requestedDiscountPct:0.##}% exceeds the {cap:0.##}% maximum allowed on this branch." });
            }
        }

        // Block sale of expired items: if a product's only tracked batches at this
        // branch are expired, it cannot be sold — mirrors the "Block sale of expired
        // items" Rules Engine rule, enforced here since checkout must not rely solely
        // on client-side checks.
        if (blockExpiredItems)
        {
            foreach (var item in order.Items)
            {
                var hasAnyBatches = await db.InventoryBatches
                    .AnyAsync(b => b.ProductId == item.ProductId && b.BranchId == order.BranchId);
                if (!hasAnyBatches) continue;

                var hasSellableStock = await db.InventoryBatches.AnyAsync(b =>
                    b.ProductId == item.ProductId && b.BranchId == order.BranchId &&
                    b.RemainingQuantity > 0 && b.Status != "expired" &&
                    (b.ExpiryDate == null || b.ExpiryDate.Value.Date >= DateTime.UtcNow.Date));

                if (!hasSellableStock)
                {
                    var product = await db.Products.FindAsync(item.ProductId);
                    return BadRequest(new { message = $"Cannot sell '{product?.Name ?? "item"}' — all available stock for this product is expired." });
                }
            }
        }

        // Block a sale that would take on-hand stock negative, unless the branch's PosSettings
        // explicitly opt in (AllowNegativeStock, default false). This flag has been stored and
        // editable from Settings since it was added, but nothing ever read it — the "reduce
        // inventory stock" step below always let quantity go negative regardless, so toggling it
        // off in the UI had no effect. Checked per-product (summed across duplicate line items)
        // against current on-hand before any stock row is mutated, so a multi-item sale either
        // fully succeeds or is rejected before touching the ledger. Branches that have never saved
        // a PosSettings row (settings created lazily by SettingsController.UpsertPosSettings on
        // first save) must still default to blocking, same as BlockExpiredItems above — a null
        // posSettings used to skip this check entirely, letting a brand-new branch sell into
        // unlimited negative stock. This is just a fast pre-flight to fail obviously-bad sales
        // before the order/payment/loyalty work below runs; the authoritative, race-safe check is
        // the locked recheck in the stock-reduction block further down.
        if (!(posSettings?.AllowNegativeStock ?? false))
        {
            foreach (var group in order.Items.GroupBy(i => i.ProductId))
            {
                var needed = group.Sum(i => i.Quantity);
                var onHand = await db.InventoryStocks
                    .Where(s => s.ProductId == group.Key && s.BranchId == order.BranchId)
                    .Select(s => (decimal?)s.Quantity)
                    .FirstOrDefaultAsync() ?? 0;
                if (onHand - needed >= 0) continue;

                var product = await db.Products.FindAsync(group.Key);

                // Short on loose stock, but the shelf may still hold unopened packs of the same
                // goods — 4 loose eggs and 3 unopened dozens can absolutely fill an order for 6.
                // Rather than failing a sale the store can physically serve, tell the client
                // exactly which pack to open and how many, so the cashier can confirm (opening a
                // carton is a real physical act, so it is never done silently) and retry with
                // AllowPackBreak set.
                var availability = await packBreaks.GetAvailabilityAsync(group.Key, order.BranchId);
                if (availability.PackProduct is { } packProduct && availability.TotalAvailable - needed >= 0)
                {
                    var shortfall = needed - onHand;
                    var packsNeeded = Math.Ceiling(shortfall / availability.ItemsPerPack);

                    if (!allowPackBreak)
                    {
                        return BadRequest(new
                        {
                            message = $"Only {onHand:0.##} of '{product?.Name ?? "item"}' loose — open {packsNeeded:0} × {packProduct.Name} to complete this sale?",
                            packBreakSuggestion = new
                            {
                                productId = group.Key,
                                productName = product?.Name,
                                packProductId = packProduct.Id,
                                packProductName = packProduct.Name,
                                itemsPerPack = availability.ItemsPerPack,
                                packsNeeded,
                                looseOnHand = onHand,
                                totalAvailable = availability.TotalAvailable,
                            },
                        });
                    }

                    // The break is deferred to the locked stock-reduction block below rather than
                    // applied here: this pre-flight reads stock without a lock, so breaking now
                    // would let two concurrent sales both open the last carton.
                    packBreaksNeeded[group.Key] = (packProduct, packsNeeded);
                    continue;
                }

                return BadRequest(new { message = $"Cannot sell '{product?.Name ?? "item"}' — only {onHand:0.##} on hand and this branch does not allow negative stock." });
            }
        }

        // Block sale of recalled items (FRD §13). Same rationale as the expired guard above:
        // enforced server-side because checkout must not rely on the client having refreshed its
        // recall list. A recall withdraws goods from sale without zeroing stock, so the block lives
        // here rather than in the quantity check — the stock is physically still on the shelf, it
        // just must not go out the door.
        //
        // A recall with no batch_id covers every lot of the product; one with a batch_id covers only
        // that lot, and can only be judged against what the sale actually consumes. Since picking
        // happens after this point (and is best-effort), a batch-scoped recall blocks the product at
        // this branch whenever any of the recalled lot is still on hand — the safe direction to err
        // for a food-safety control.
        foreach (var productId in order.Items.Select(i => i.ProductId).Distinct())
        {
            var recalls = await db.ProductRecalls
                .Where(r => r.ProductId == productId && r.Status == "open" &&
                            (r.BranchId == null || r.BranchId == order.BranchId))
                .Select(r => new { r.RecallNumber, r.BatchId, r.Reason })
                .ToListAsync();
            if (recalls.Count == 0) continue;

            var blocking = recalls.FirstOrDefault(r => r.BatchId == null);
            if (blocking is null)
            {
                // Materialize this product's batches at the branch first, then filter against the
                // recalled batch ids in memory — a `recalledBatchIds.Contains(b.Id)` filter inside
                // the live query fails to type-map on this MySQL EF provider (same gotcha worked
                // around throughout this file, e.g. the self-checkout eligibility loop above).
                var branchBatches = await db.InventoryBatches
                    .Where(b => b.ProductId == productId && b.BranchId == order.BranchId && b.RemainingQuantity > 0)
                    .Select(b => b.Id)
                    .ToListAsync();
                var stillOnHand = branchBatches.ToHashSet();
                blocking = recalls.FirstOrDefault(r => stillOnHand.Contains(r.BatchId!.Value));
            }

            if (blocking is not null)
            {
                var product = await db.Products.FindAsync(productId);
                return BadRequest(new
                {
                    message = $"Cannot sell '{product?.Name ?? "item"}' — under active recall {blocking.RecallNumber} ({blocking.Reason}).",
                });
            }
        }

        // Terminal binding: derive the shift/terminal from the cashier's actual open shift
        // server-side rather than trusting client input (which never sent these at all) —
        // otherwise a sale has no verifiable link back to the terminal/shift that rang it up.
        // FR-CHK-06: Cashier and Branch Manager accounts must be checked into an active shift
        // before a sale is allowed, same as the client-side gate in _app.pos.tsx. Tenant
        // Administrator is exempt — an admin has full POS access regardless of shift status.
        CashierShift? activeShift = null;
        string? checkoutWithoutShiftRole = null;
        if (order.CashierId.HasValue)
        {
            // A cashier should only ever have one open shift (ShiftsController.OpenShift rejects
            // opening a second one) — ordered defensively in case stale data still has more than
            // one, so a sale always binds to whichever shift the cashier most recently checked
            // into rather than an arbitrary row the database happens to return first. Also scoped
            // to this order's own branch: a Tenant Admin's open shift can be at a different branch
            // than the one they're currently selling from (e.g. checked in at Branch A, then
            // switched the POS page to Branch B) — binding the sale to a shift/terminal opened at
            // a different branch would silently corrupt that shift's totals and the terminal
            // assignment, so treat that the same as having no active shift at all.
            activeShift = await db.CashierShifts
                .Where(s => s.CashierId == order.CashierId && s.Status == "open" && s.BranchId == order.BranchId)
                .OrderByDescending(s => s.OpenedAt)
                .FirstOrDefaultAsync();
            if (activeShift is not null)
            {
                order.ShiftId = activeShift.Id;
                order.TerminalId = activeShift.TerminalId;
            }
            else
            {
                var cashierUser = await db.Users.Include(u => u.Role)
                    .FirstOrDefaultAsync(u => u.Id == order.CashierId);
                var cashierAppRole = cashierUser?.Role?.Name is { } roleName ? RoleNormalizer.ToAppRole(roleName) : null;
                if (cashierAppRole is "cashier" or "branch_manager")
                    return BadRequest(new { message = "No active shift found for you at this terminal — check in before processing sales." });

                // Tenant Administrator (exempt from the shift gate above) or a role that
                // structurally can't hold a shift at all (not in CheckInDialog's list) rang up a
                // sale — the sale proceeds with no ShiftId to reconcile against, so log who did it
                // (see audit entry after save below).
                checkoutWithoutShiftRole = cashierUser?.Role?.Name ?? "Unknown role";
            }
        }

        order.Id = Guid.NewGuid();
        order.OrderNumber = $"ORD-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}";
        order.CreatedAt = order.UpdatedAt = DateTime.UtcNow;
        foreach (var item in order.Items)
        {
            item.Id = Guid.NewGuid();
            item.OrderId = order.Id;
            // The POS checkout only ever sends a single order-level tax total, never a per-line
            // figure, so OrderItem.TaxAmount would otherwise stay at its 0 default forever — which
            // is why the Tax Report (which sums this column) always read 0. Allocate the order's
            // tax proportionally by each item's share of the subtotal.
            if (item.TaxAmount == 0 && order.Subtotal > 0)
                item.TaxAmount = Math.Round(item.TotalPrice / order.Subtotal * order.TaxAmount, 2);
        }
        foreach (var pay in order.Payments) { pay.Id = Guid.NewGuid(); pay.OrderId = order.Id; }
        foreach (var d in order.Discounts) { d.Id = Guid.NewGuid(); d.OrderId = order.Id; d.CreatedAt = DateTime.UtcNow; }
        foreach (var s in order.ServiceCharges) { s.Id = Guid.NewGuid(); s.OrderId = order.Id; s.CreatedAt = DateTime.UtcNow; }

        // Card payments taken on the NamiPay terminal: the POS references the authorization it
        // obtained (POST /api/pos/card-payments) rather than just asserting "card was paid" —
        // verify it here (approved, this branch, this amount, never spent on another sale) and
        // stamp the terminal's own reference onto the recorded payment. The link is saved in the
        // same SaveChanges as the order itself, and any rejection below discards it along with
        // everything else. Card payments without a posCardPaymentId (standalone terminals) are
        // recorded exactly as before.
        foreach (var pay in order.Payments)
        {
            if (pay.PosCardPaymentId is not { } cardPaymentId) continue;
            var cardPayment = await db.PosCardPayments.FirstOrDefaultAsync(p => p.Id == cardPaymentId);
            if (cardPayment is null)
                return BadRequest(new { message = "The card payment for this sale could not be found — take the card payment again." });
            if (cardPayment.BranchId != order.BranchId)
                return BadRequest(new { message = "The card payment belongs to a different branch." });
            if (cardPayment.OrderId is not null)
                return BadRequest(new { message = "That card payment was already used on another sale." });
            if (cardPayment.Status != "approved")
                return BadRequest(new { message = $"The card payment isn't approved (status: {cardPayment.Status}) — take the card payment again." });
            if (Math.Abs(cardPayment.Amount - pay.Amount) > 0.01m)
                return BadRequest(new { message = $"The approved card amount (SAR {cardPayment.Amount:F2}) doesn't match this sale's card portion (SAR {pay.Amount:F2}) — take the card payment again." });

            pay.PaymentMethod = "card";
            pay.Status = "completed";
            pay.ReferenceNumber = cardPayment.Rrn ?? cardPayment.GatewayTransactionId;
            cardPayment.OrderId = order.Id;
            cardPayment.Status = "ordered";
            cardPayment.ResolvedAt = DateTime.UtcNow;
            cardPayment.UpdatedAt = DateTime.UtcNow;
        }

        // ── Re-validate coupon/discount server-side ─────────────────────────────
        // Previously the client's DiscountAmount/CouponId were persisted verbatim with zero
        // re-checking (unlike loyalty-point redemption below, which IS re-validated) —
        // Coupon.UsedCount was also never incremented anywhere, making its usage limit purely
        // decorative. Only runs when a real coupon/discount reference is present; a plain manual
        // discount with neither stays exactly as client-computed, same as before.
        Coupon? appliedCoupon = null;
        var nowUtc = DateTime.UtcNow;
        if (order.CouponId.HasValue)
        {
            appliedCoupon = await db.Coupons.FindAsync(order.CouponId.Value);
            if (appliedCoupon is null || appliedCoupon.Status != "active")
                return BadRequest(new { message = "This coupon is no longer valid." });
            if (appliedCoupon.StartDate > nowUtc || appliedCoupon.EndDate < nowUtc)
                return BadRequest(new { message = "This coupon has expired or isn't active yet." });
            // Null BranchId means valid at every branch — same convention as Discount/Offer.
            if (appliedCoupon.BranchId.HasValue && appliedCoupon.BranchId != order.BranchId)
                return BadRequest(new { message = "This coupon is not valid at this branch." });
            // Riyadh is UTC+3, no DST (see ValidateCoupon/OperationalAlertsService for the same offset).
            if (appliedCoupon.StartTime.HasValue && appliedCoupon.EndTime.HasValue)
            {
                var localTimeOfDay = nowUtc.AddHours(3).TimeOfDay;
                if (localTimeOfDay < appliedCoupon.StartTime.Value || localTimeOfDay > appliedCoupon.EndTime.Value)
                    return BadRequest(new { message = "This coupon is only valid during specific hours." });
            }
            if (appliedCoupon.UsageLimit.HasValue && appliedCoupon.UsedCount >= appliedCoupon.UsageLimit.Value)
                return BadRequest(new { message = "This coupon has reached its usage limit." });
            if (appliedCoupon.MinOrderAmount.HasValue && order.Subtotal < appliedCoupon.MinOrderAmount.Value)
                return BadRequest(new { message = $"This coupon requires a minimum order of SAR {appliedCoupon.MinOrderAmount:F2}." });
            var restrictedTo = await db.CustomerCoupons.Where(cc => cc.CouponId == appliedCoupon.Id).Select(cc => cc.CustomerId).ToListAsync();
            if (restrictedTo.Count > 0 && (order.CustomerId is null || !restrictedTo.Contains(order.CustomerId.Value)))
                return BadRequest(new { message = "This coupon is restricted to specific customers." });
        }

        // "No discount on tobacco items" — Rules Engine rule (seeded RuleType "discount",
        // RuleConfig condition "Category = Tobacco"). Tobacco is tracked per-product
        // (Product.IsTobacco), not via an actual "Tobacco" category, so this resolves the rule
        // against that flag directly rather than a category name match. Only enforced when the
        // rule is actually Active — this is the one place checkout consults the Rules Engine
        // table at all, so toggling this specific rule off/on now has a real effect.
        var tobaccoRuleActive = await db.RulesEngine.AnyAsync(r =>
            r.IsActive && r.RuleType == "discount" && r.RuleName == "No discount on tobacco items" &&
            (r.BranchId == null || r.BranchId == order.BranchId));
        // Looked up one product at a time rather than a Where(productIds.Contains(...)) query —
        // the MySQL EF provider in use here fails to type-map a List<Guid> inside Contains().
        var tobaccoProductCategories = new Dictionary<Guid, Guid?>();
        if (tobaccoRuleActive)
        {
            foreach (var productId in order.Items.Select(i => i.ProductId).Distinct())
            {
                var product = await db.Products.FindAsync(productId);
                if (product is { IsTobacco: true }) tobaccoProductCategories[productId] = product.CategoryId;
            }
        }
        var tobaccoProductIds = tobaccoProductCategories.Keys.ToHashSet();

        bool DiscountCoversTobacco(string appliesTo, Guid? productId, Guid? categoryId) => appliesTo switch
        {
            "product" => productId.HasValue && tobaccoProductIds.Contains(productId.Value),
            "category" => categoryId.HasValue && tobaccoProductCategories.Values.Contains(categoryId),
            _ => tobaccoProductIds.Count > 0, // "all"/"branch"
        };

        // Only one manual (basket-wide, no DiscountId) discount is allowed per order — the POS UI
        // enforces this too, but that's a client convenience, not the guarantee. Stacking manual
        // discounts (e.g. two 100% ones) is how the discretionary-discount cap above and the
        // tobacco excise floor below could both be walked around by piling up entries.
        if (order.Discounts.Count(d => d.DiscountId is null) > 1)
            return BadRequest(new { message = "Only one manual discount is allowed per order." });

        var validatedDiscountTotal = 0m;
        var anyRuleReference = appliedCoupon != null;
        var referencedRuleCount = appliedCoupon != null ? 1 : 0;
        var nonCombinableRuleNames = new List<string>();
        foreach (var d in order.Discounts)
        {
            // No DiscountId means this is a POS "Manual discount" line (basket-wide, no
            // Discount row to re-verify against) — client-computed-and-trusted for the amount
            // itself, but it still has to honor the tobacco carve-out below, same as a named
            // "all"/"branch" Discount does. Without this it was a silent bypass: a cashier could
            // manually discount a tobacco item that a named Discount/Coupon would be refused for.
            if (d.DiscountId is null)
            {
                if (tobaccoProductIds.Count > 0)
                    return BadRequest(new { message = $"\"{d.Name}\" cannot be applied — tobacco items are not eligible for discounts." });
                validatedDiscountTotal += d.Amount;
                // A manual discount used to skip the whole anyRuleReference recompute block below
                // (that flag only ever considered a coupon or a named Discount row), so an order
                // discounted ONLY via a manual discount left order.DiscountAmount/TaxAmount/
                // TotalAmount/TobaccoFeeAmount exactly as the client sent them — completely
                // unvalidated, tobacco excise included. Must be set here too.
                anyRuleReference = true;
                continue;
            }
            anyRuleReference = true;
            referencedRuleCount++;
            var rule = await db.Discounts.FindAsync(d.DiscountId.Value);
            if (rule is null || !rule.IsActive)
                return BadRequest(new { message = $"The discount \"{d.Name}\" is no longer active." });
            if (rule.StartDate.HasValue && rule.StartDate > nowUtc)
                return BadRequest(new { message = $"The discount \"{d.Name}\" hasn't started yet." });
            if (rule.EndDate.HasValue && rule.EndDate < nowUtc)
                return BadRequest(new { message = $"The discount \"{d.Name}\" has expired." });
            if (rule.RequiresCustomer && order.CustomerId is null)
                return BadRequest(new { message = $"The discount \"{d.Name}\" requires a customer to be selected." });
            if (!string.IsNullOrEmpty(rule.ExcludedProductIdsJson))
            {
                var excluded = System.Text.Json.JsonSerializer.Deserialize<List<Guid>>(rule.ExcludedProductIdsJson) ?? [];
                if (order.Items.Any(i => excluded.Contains(i.ProductId)))
                    return BadRequest(new { message = $"The discount \"{d.Name}\" doesn't apply to one or more items in this order." });
            }
            if (tobaccoProductIds.Count > 0 && DiscountCoversTobacco(rule.AppliesTo, rule.ProductId, rule.CategoryId))
                return BadRequest(new { message = $"The discount \"{d.Name}\" cannot be applied — tobacco items are not eligible for discounts." });
            if (!rule.Combinable) nonCombinableRuleNames.Add(d.Name);

            var basis = rule.AppliesTo switch
            {
                "product" => order.Items.Where(i => i.ProductId == rule.ProductId).Sum(i => i.TotalPrice),
                "category" => await CategoryDiscountBasisAsync(rule.CategoryId, order.Items),
                _ => order.Subtotal, // "all" or "branch" — applies to the whole order
            };
            var computed = rule.DiscountType == "fixed" ? Math.Min(rule.Value, basis) : Math.Round(basis * rule.Value / 100m, 2);
            if (rule.MaxDiscountAmount.HasValue) computed = Math.Min(computed, rule.MaxDiscountAmount.Value);
            d.Amount = computed;
            validatedDiscountTotal += computed;
        }

        // A discount marked non-combinable can't ride alongside any other discount or a coupon —
        // the cashier has to pick one or the other. Checked here (not per-item above) since it's
        // only a conflict once a SECOND discount/coupon is also present on the same order.
        if (nonCombinableRuleNames.Count > 0 && referencedRuleCount > 1)
            return BadRequest(new { message = $"\"{nonCombinableRuleNames[0]}\" cannot be combined with other discounts or coupons — remove the others first." });

        if (appliedCoupon != null)
        {
            if (tobaccoProductIds.Count > 0 && DiscountCoversTobacco(appliedCoupon.ApplicableTo, appliedCoupon.ApplicableId, appliedCoupon.ApplicableId))
                return BadRequest(new { message = "This coupon cannot be applied — tobacco items are not eligible for discounts." });

            var couponBasis = appliedCoupon.ApplicableTo switch
            {
                "product" => order.Items.Where(i => i.ProductId == appliedCoupon.ApplicableId).Sum(i => i.TotalPrice),
                "category" => await CategoryDiscountBasisAsync(appliedCoupon.ApplicableId, order.Items),
                _ => order.Subtotal,
            };
            var couponAmount = appliedCoupon.Type == "fixed" ? Math.Min(appliedCoupon.Value, couponBasis) : Math.Round(couponBasis * appliedCoupon.Value / 100m, 2);
            if (appliedCoupon.MaxDiscountAmount.HasValue) couponAmount = Math.Min(couponAmount, appliedCoupon.MaxDiscountAmount.Value);
            validatedDiscountTotal += couponAmount;
            appliedCoupon.UsedCount += 1;
        }

        if (anyRuleReference)
        {
            // Catalog-level Product.Discount/DiscountType markdowns and any Loyalty-point redemption
            // are both folded into the client's own DiscountAmount (see _app.pos.tsx's
            // `discountAmount: couponDiscount + totalAutoDiscount + productDiscountTotal +
            // loyaltyDiscount`), but validatedDiscountTotal above only re-derives the Coupon/
            // Discount/Manual portions — overwriting order.DiscountAmount with just that silently
            // dropped the catalog and loyalty portions whenever a Coupon/Discount was ALSO present,
            // re-inflating TotalAmount (most visible on tobacco items, where excise then sits on an
            // artificially-large taxable base). Catalog discount is re-derived from the product's
            // own current record — never trusted from the client, same as Coupon/Discount above.
            // The loyalty portion is the client's requested figure; it gets trued up to the
            // server-clamped actual redemption by the loyalty block further down, which adjusts
            // order.DiscountAmount by (actual - requested) starting from this same total.
            foreach (var item in order.Items)
            {
                var product = await db.Products.FindAsync(item.ProductId);
                if (product?.Discount is not > 0) continue;
                validatedDiscountTotal += product.DiscountType == "fixed"
                    ? Math.Min(product.Discount.Value * item.Quantity, item.TotalPrice)
                    : Math.Round(item.TotalPrice * product.Discount.Value / 100m, 2);
            }
            validatedDiscountTotal += order.LoyaltyDiscountAmount;

            order.DiscountAmount = Math.Min(validatedDiscountTotal, order.Subtotal);

            // Tobacco excise (TaxFeeRules "tobacco_excise") is a statutory per-unit floor — it must
            // hold no matter how many discounts (manual, coupon, or Rules Engine, stacked or not)
            // chip away at a tobacco item's net price, and regardless of whatever TobaccoFeeAmount
            // the client itself computed and sent. Recomputed here from each tobacco item's own
            // post-discount net price (never trusted from the client) now that order.DiscountAmount
            // above is final, mirroring OrderEditService's edit-order recompute.
            var (minExciseAmount, excisePercentage) = await ResolveTobaccoExciseConfigAsync();
            var hasTobaccoItem = false;
            var recomputedTobaccoFee = 0m;
            foreach (var item in order.Items)
            {
                var itemProduct = await db.Products.FindAsync(item.ProductId);
                if (itemProduct is not { IsTobacco: true } || item.Quantity <= 0) continue;
                hasTobaccoItem = true;
                var itemDiscountShare = order.Subtotal > 0 ? item.TotalPrice / order.Subtotal * order.DiscountAmount : 0m;
                var netUnitPrice = Math.Max(0, (item.TotalPrice - itemDiscountShare) / item.Quantity);
                item.TobaccoFeeAmount = item.Quantity * CalcTobaccoFee(netUnitPrice, minExciseAmount, excisePercentage);
                recomputedTobaccoFee += item.TobaccoFeeAmount;
            }
            if (hasTobaccoItem) order.TobaccoFeeAmount = recomputedTobaccoFee;

            var taxableBase = Math.Max(0, order.Subtotal - order.DiscountAmount + order.TobaccoFeeAmount);
            order.TaxAmount = Math.Round(taxableBase * 0.15m, 2);
            order.TotalAmount = order.Subtotal - order.DiscountAmount + order.TobaccoFeeAmount + order.TaxAmount + order.CustomFeeAmount;
        }

        // Same gap as OrderItem.TaxAmount above: the client only ever sends one order-level
        // discount total, so OrderItem.DiscountAmount stayed at its 0 default forever — which is
        // why Monthly Sales/Category Performance/Product Sales (which sum this column) always
        // read a 0.00 Discount Value even though orders.discount_amount was correctly populated.
        // Allocate the order's final discount proportionally by each item's share of the subtotal.
        if (order.DiscountAmount > 0 && order.Subtotal > 0)
        {
            foreach (var item in order.Items)
                if (item.DiscountAmount == 0)
                    item.DiscountAmount = Math.Round(item.TotalPrice / order.Subtotal * order.DiscountAmount, 2);
        }

        db.Orders.Add(order);

        // Keep the till's running totals live so "expected cash"/variance at close-out
        // reflects real sales instead of staying frozen at the opening amount — previously
        // nothing on the whole codebase ever wrote CashSales/CardSales/DigitalSales/TotalSales
        // after a shift opened, so every consumer of those fields (Closing Report, My Shift,
        // cashier-sales report) was silently wrong for any shift opened through the real app.
        if (activeShift is not null)
        {
            foreach (var pay in order.Payments)
            {
                switch (pay.PaymentMethod)
                {
                    case "cash": activeShift.CashSales += pay.Amount; break;
                    case "card": activeShift.CardSales += pay.Amount; break;
                    default: activeShift.DigitalSales += pay.Amount; break;
                }
                activeShift.TotalSales += pay.Amount;
            }
        }

        // ── Reduce inventory stock for each item ───────────────────────────────
        // When AllowNegativeStock is on, a sale is never blocked here; the on-hand count is
        // allowed to go negative when a sale outpaces what was actually received, so the next
        // stock-in (Receive Batch/PO receive) can see the true negative balance to reconcile
        // against it. When it's off, this is the authoritative, race-safe gate: the pre-flight
        // check above reads stock without a lock, so two concurrent sales of the same product's
        // last unit(s) could both pass it against the same stale on-hand figure and both decrement
        // — still landing stock negative even with the guard on. Locking each product's stock row
        // (SELECT ... FOR UPDATE, same technique as ZatcaService.SubmitInvoiceAsync's identity-row
        // lock) for the rest of this transaction serializes concurrent sales of the same product,
        // so the recheck below always sees the true post-lock on-hand quantity.
        var blockNegativeStock = !(posSettings?.AllowNegativeStock ?? false);
        await using var stockTx = await db.Database.BeginTransactionAsync();
        foreach (var group in order.Items.GroupBy(i => i.ProductId))
        {
            // Branch-exact match only — the previous fallback to "any stock record for this
            // product" silently adjusted a DIFFERENT branch's stock row whenever the selling
            // branch had none, corrupting that other branch's inventory on every such sale.
            var stock = await db.InventoryStocks
                .FromSqlRaw("SELECT * FROM inventory_stock WHERE product_id = {0} AND branch_id = {1} FOR UPDATE", group.Key, order.BranchId)
                .FirstOrDefaultAsync();
            var needed = group.Sum(i => i.Quantity);

            // Break open the packs the cashier approved, now that the loose row is locked and its
            // true on-hand is known. Recomputed from the locked quantity rather than trusting the
            // unlocked pre-flight's figure, so a concurrent sale that consumed loose units in
            // between still opens enough — and one that already opened a carton doesn't open a
            // second unnecessarily. Inside the same transaction as the sale: if anything below
            // fails, the carton un-breaks with it.
            if (packBreaksNeeded.TryGetValue(group.Key, out var pending))
            {
                var shortfall = needed - (stock?.Quantity ?? 0);
                if (shortfall > 0)
                {
                    var itemsPerPack = pending.PackProduct.ItemsPerPack is > 0 ? pending.PackProduct.ItemsPerPack.Value : 1;
                    var packsToBreak = Math.Ceiling(shortfall / itemsPerPack);
                    try
                    {
                        await packBreaks.BreakAsync(
                            pending.PackProduct, order.BranchId, packsToBreak, CallerId(),
                            noteSuffix: $"sale {order.OrderNumber}");
                        await db.SaveChangesAsync();
                        // Re-read under the same lock so the deduction below sees the units the
                        // break just added.
                        stock = await db.InventoryStocks
                            .FromSqlRaw("SELECT * FROM inventory_stock WHERE product_id = {0} AND branch_id = {1} FOR UPDATE", group.Key, order.BranchId)
                            .FirstOrDefaultAsync();
                    }
                    catch (InvalidOperationException ex)
                    {
                        // Someone else took the last carton between pre-flight and here.
                        return BadRequest(new { message = ex.Message });
                    }
                }
            }

            if (blockNegativeStock && (stock?.Quantity ?? 0) - needed < 0)
            {
                var product = await db.Products.FindAsync(group.Key);
                return BadRequest(new { message = $"Cannot sell '{product?.Name ?? "item"}' — only {(stock?.Quantity ?? 0):0.##} on hand and this branch does not allow negative stock." });
            }

            foreach (var item in group)
            {
                // Captured before the mutation — the ledger's before/after is the audit trail's
                // only record of on-hand either side of a sale. A product with no stock row yet
                // was at 0.
                var quantityBefore = stock?.Quantity ?? 0;
                if (stock != null)
                {
                    stock.Quantity -= item.Quantity;
                    stock.LastUpdated = DateTime.UtcNow;
                    stock.UpdatedAt = DateTime.UtcNow;
                }
                else
                {
                    stock = new InventoryStock
                    {
                        Id = Guid.NewGuid(),
                        ProductId = item.ProductId,
                        BranchId = order.BranchId,
                        Quantity = -item.Quantity,
                        LastUpdated = DateTime.UtcNow,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow,
                    };
                    db.InventoryStocks.Add(stock);
                }

                stockMovements.Record(
                    item.ProductId, order.BranchId, warehouseId: null, movementType: "sale", quantity: -item.Quantity,
                    referenceType: "order", referenceId: order.Id, referenceNumber: order.OrderNumber,
                    quantityBefore: quantityBefore, quantityAfter: quantityBefore - item.Quantity);
            }
        }

        await db.SaveChangesAsync();
        await stockTx.CommitAsync();

        // A sale that drops on-hand to/under the reorder point should surface a Low Stock / Out of
        // Stock alert immediately, not up to 15 minutes later on the next background sweep. Best-
        // effort per product — a notification hiccup must never fail an otherwise-completed sale.
        foreach (var productId in order.Items.Select(i => i.ProductId).Distinct())
        {
            try { await stockAlerts.CheckStockLevelAsync(productId, order.BranchId); }
            catch (Exception ex) { logger.LogError(ex, "Low-stock check failed after sale for product {ProductId}", productId); }
        }

        // Keep each sold product's batch(es) in sync with the aggregate stock write above, in the
        // branch's configured picking order (FEFO by default, FIFO if configured), so the batch
        // drill-down UI reflects what actually sold instead of a static "still full" quantity.
        // Same best-effort treatment as the low-stock check: batch remaining-quantity is
        // traceability data, never allowed to fail or slow down the sale.
        //
        // The consumption result additionally gives this line its true cost — the specific lots'
        // purchase costs — which is recorded below. Every report today derives COGS from the
        // product's *current* CostPrice, so a sale made when cost was 4 is silently re-costed the
        // moment purchase cost moves to 5. Capturing it here is what makes historic margin stable.
        var costed = false;
        foreach (var item in order.Items)
        {
            try
            {
                var consumed = await batchConsumption.ConsumeFefoAsync(
                    item.ProductId, order.BranchId, warehouseId: null, item.Quantity);
                if (consumed.Count == 0) continue;

                // Only cost the line when every consumed lot knew its purchase cost. A partial sum
                // would understate COGS and inflate margin — worse than leaving it null and letting
                // reports fall back to the existing Product.CostPrice path, which is what they do
                // for every pre-existing row anyway.
                if (consumed.All(c => c.UnitCost.HasValue))
                    item.CostAmount = Math.Round(consumed.Sum(c => c.LineCost!.Value), 4, MidpointRounding.AwayFromZero);

                // Traceability: which lot did this customer actually get? This is the question a
                // recall asks, and it was previously unanswerable — order_items.batch_id has
                // existed all along and was never written.
                item.BatchId = consumed[0].BatchId;
                item.BatchBreakdown = System.Text.Json.JsonSerializer.Serialize(
                    consumed.Select(c => new { batchId = c.BatchId, batchNumber = c.BatchNumber, quantity = c.Quantity, unitCost = c.UnitCost }));
                costed = true;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Batch consumption failed after sale for product {ProductId}", item.ProductId);
            }
        }

        // Persist the costing/traceability fields written above. Separate from the sale's own
        // SaveChanges (line 326) on purpose — the sale is already committed and paid for by this
        // point, so a failure here must lose only the analytics, never the order.
        if (costed)
        {
            try { await db.SaveChangesAsync(); }
            catch (Exception ex) { logger.LogError(ex, "Persisting batch cost/traceability failed for order {OrderId}", order.Id); }
        }

        // Employee Audit Center — the sale itself is an employee action and has to appear on the
        // cashier's activity trail, not just the void/edit that might follow it. There is no
        // before-state for a brand-new order, so only the after-snapshot is recorded. Best-effort:
        // an audit write must never roll back a sale the customer has already paid for.
        try
        {
            await audit.LogAsync(
                action: "create_order",
                entityType: "Order",
                entityId: order.Id,
                userId: order.CashierId,
                branchId: order.BranchId,
                details: System.Text.Json.JsonSerializer.Serialize(new
                {
                    order.OrderNumber,
                    order.Subtotal,
                    order.DiscountAmount,
                    order.TaxAmount,
                    order.TobaccoFeeAmount,
                    order.TotalAmount,
                    order.CustomerId,
                    PaymentMethod = order.Payments.FirstOrDefault()?.PaymentMethod,
                    Items = order.Items.Select(i => new { i.ProductId, i.Quantity, i.UnitPrice, i.TotalPrice }),
                }),
                // A discounted sale is the one a manager actually wants to spot in the trail.
                severity: order.DiscountAmount > 0 ? "warning" : "info",
                module: "POS", employeeId: await ResolveEmployeeIdAsync(order.CashierId), terminalId: order.TerminalId);

            // Employee Audit Center — "Gave discount" needs to be its own filterable activity
            // type, not just a field buried inside create_order's snapshot.
            if (order.DiscountAmount > 0)
            {
                await audit.LogAsync(
                    action: "Gave Discount",
                    entityType: "Order",
                    entityId: order.Id,
                    userId: order.CashierId,
                    branchId: order.BranchId,
                    details: System.Text.Json.JsonSerializer.Serialize(new
                    {
                        order.OrderNumber, order.DiscountAmount, order.Subtotal,
                        DiscountPct = order.Subtotal > 0 ? Math.Round(order.DiscountAmount / order.Subtotal * 100m, 2) : 0m,
                        Items = order.Items.Select(i => new { i.ProductId, i.Quantity, i.UnitPrice, i.TotalPrice }),
                    }),
                    severity: "warning",
                    module: "POS", employeeId: await ResolveEmployeeIdAsync(order.CashierId), terminalId: order.TerminalId);
            }

            // Price Overrides at the till. Line prices arrive from the client, so a cashier
            // selling at anything other than the resolved price left no trace at all — this is
            // the activity the client flagged as missing from the audit trail. One row per
            // repriced product, matching what an order EDIT records (see OrderEditService).
            var expectedPrices = await orderEditService.ResolveExpectedPricesAsync(
                order.Items.Select(i => i.ProductId), order.BranchId, order.CustomerId);
            foreach (var line in order.Items)
            {
                if (!expectedPrices.TryGetValue(line.ProductId, out var listPrice)) continue;
                if (line.UnitPrice == listPrice) continue;
                await audit.LogAsync(
                    action: "price_override",
                    entityType: "Order",
                    entityId: order.Id,
                    userId: order.CashierId,
                    branchId: order.BranchId,
                    details: System.Text.Json.JsonSerializer.Serialize(new
                    {
                        order.OrderNumber,
                        ListPrice = listPrice,
                        OverriddenPrice = line.UnitPrice,
                        Variance = line.UnitPrice - listPrice,
                        Items = new[] { new { line.ProductId, line.Quantity, line.UnitPrice, line.TotalPrice } },
                    }),
                    severity: "warning",
                    beforeValue: System.Text.Json.JsonSerializer.Serialize(new { UnitPrice = listPrice }),
                    module: "POS", employeeId: await ResolveEmployeeIdAsync(order.CashierId), terminalId: order.TerminalId);
            }
        }
        catch (Exception ex) { logger.LogError(ex, "Audit log failed for order {OrderId}", order.Id); }

        if (checkoutWithoutShiftRole is not null)
        {
            await audit.LogAsync(
                action: "Checkout without active shift (elevated-role override)",
                entityType: "Order",
                entityId: order.Id,
                userId: order.CashierId,
                branchId: order.BranchId,
                details: $"{checkoutWithoutShiftRole} completed order {order.OrderNumber} with no open shift — sale has no ShiftId to reconcile against.",
                severity: "warning",
                module: "POS", employeeId: await ResolveEmployeeIdAsync(order.CashierId), terminalId: order.TerminalId);
        }

        // ── ZATCA Phase 2: auto-create + submit e-invoice ──────────────────────
        var zatcaIdentity = await db.ZatcaIdentities.FindAsync(ZatcaIdentity.SingletonId);
        if (zatcaIdentity is { Phase2Enabled: true, OnboardingStatus: "production_ready" })
        {
            string? buyerName = null;
            if (order.CustomerId.HasValue)
            {
                buyerName = (await db.Customers.FindAsync(order.CustomerId.Value))?.FullName;
            }

            var zatcaInvoice = new ZatcaInvoice
            {
                Id = Guid.NewGuid(),
                OrderId = order.Id,
                BranchId = order.BranchId,
                // Matches DataSeeder's convention (InvoiceNumber = $"INV-{order.OrderNumber}") — left
                // unset here, every real-checkout invoice fell back to displaying the row's raw GUID
                // prefix (e.g. "ca8bf511") on the ZATCA Invoices page instead of a readable number.
                InvoiceNumber = $"INV-{order.OrderNumber}",
                InvoiceType = "simplified", // POS sales are always B2C — no buyer VAT captured on Customer
                IssueDate = order.CreatedAt,
                TotalAmount = order.TotalAmount,
                TaxAmount = order.TaxAmount,
                DiscountAmount = order.DiscountAmount,
                BuyerName = buyerName,
                ZatcaStatus = "pending",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            };

            // Creating the invoice row itself was the one step in this block NOT covered by the
            // "a ZATCA failure must never fail the sale" guarantee below — a save failure here
            // (e.g. a schema mismatch on the ZatcaInvoices table) previously threw all the way out
            // to the global exception handler and 500'd an already-completed, already-paid sale.
            bool invoiceSaved;
            try
            {
                db.ZatcaInvoices.Add(zatcaInvoice);
                await db.SaveChangesAsync();
                invoiceSaved = true;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Failed to create ZATCA invoice row for order {OrderId}", order.Id);
                db.Entry(zatcaInvoice).State = EntityState.Detached;
                invoiceSaved = false;

                await notifications.NotifyRoleAsync(["Admin"], order.BranchId,
                    "ZATCA", "ZATCA Submission Failed", "ZATCA Submission Failed",
                    $"ZATCA invoice creation failed for Invoice {order.OrderNumber}",
                    severity: "error", entityType: "Order", entityId: order.Id,
                    terminalId: order.TerminalId, triggeredBy: order.CashierId);
            }

            // Submitted synchronously (not fire-and-forget) so the checkout response — and thus
            // the printed receipt — carries the real ZATCA-signed QR code, not a client-side
            // approximation. A ZATCA failure must not fail the sale itself; the invoice is left
            // in whatever status SubmitInvoiceAsync set (e.g. "rejected") for later retry via
            // POST zatca/invoices/{id}/submit.
            if (invoiceSaved)
            try
            {
                var submitted = await zatcaService.SubmitInvoiceAsync(zatcaInvoice.Id);
                order.ZatcaQrCode = submitted.QrCodeValue;
                order.ZatcaInvoiceStatus = submitted.ZatcaStatus;

                if (submitted.ZatcaStatus == "rejected")
                {
                    await notifications.NotifyRoleAsync(["Admin"], order.BranchId,
                        "ZATCA", "ZATCA Submission Failed", "ZATCA Submission Failed",
                        $"ZATCA submission failed for Invoice {order.OrderNumber}",
                        severity: "error", entityType: "ZatcaInvoice", entityId: zatcaInvoice.Id,
                        terminalId: order.TerminalId, triggeredBy: order.CashierId);
                }
                else
                {
                    await notifications.NotifyRoleAsync(["Admin"], order.BranchId,
                        "ZATCA", "ZATCA Invoice Generated", "ZATCA Invoice Generated",
                        "ZATCA invoice generated",
                        entityType: "ZatcaInvoice", entityId: zatcaInvoice.Id,
                        terminalId: order.TerminalId, triggeredBy: order.CashierId);
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "ZATCA submission failed for invoice {InvoiceId}", zatcaInvoice.Id);
                order.ZatcaInvoiceStatus = "pending";

                await notifications.NotifyRoleAsync(["Admin"], order.BranchId,
                    "ZATCA", "ZATCA Submission Failed", "ZATCA Submission Failed",
                    $"ZATCA submission failed for Invoice {order.OrderNumber}",
                    severity: "error", entityType: "ZatcaInvoice", entityId: zatcaInvoice.Id,
                    terminalId: order.TerminalId, triggeredBy: order.CashierId);
                await notifications.NotifyRoleAsync(["Admin"], order.BranchId,
                    "ZATCA", "ZATCA Pending Queue", "ZATCA Pending Queue",
                    $"Invoice {order.OrderNumber} pending ZATCA sync",
                    severity: "warning", entityType: "ZatcaInvoice", entityId: zatcaInvoice.Id,
                    terminalId: order.TerminalId, triggeredBy: order.CashierId);
            }
        }

        // ── Loyalty points: redeem, then earn ──────────────────────────────────
        // By this point (SaveChangesAsync at line 393) the order/items/payments/stock are
        // already committed and the customer has already paid — same "never fail an
        // already-completed sale" rule the ZATCA block above follows. So unlike a normal
        // discount/coupon (client computes, server just persists), redemption DOES get
        // validated server-side here (a balance can't go negative), but any problem — no
        // active program, a stale/over-large request, falling under the minimum after
        // clamping — is handled by silently reducing the redemption to what's actually valid
        // (down to zero if necessary), never by rejecting the request outright.
        if (order.CustomerId.HasValue)
        {
            var customer = await db.Customers.FindAsync(order.CustomerId.Value);
            if (customer != null)
            {
                var program = await ResolveLoyaltyProgramAsync(order.BranchId);

                var requestedPoints = Math.Max(0, order.LoyaltyPointsRedeemed);
                decimal redeemedPoints = 0;
                if (requestedPoints > 0 && program != null)
                {
                    redeemedPoints = Math.Min(requestedPoints, customer.LoyaltyBalance);
                    if (program.MaxRedeemPctOfOrder.HasValue && program.RedemptionValuePerPoint > 0)
                    {
                        var maxByPct = Math.Floor(order.Subtotal * (program.MaxRedeemPctOfOrder.Value / 100m) / program.RedemptionValuePerPoint);
                        redeemedPoints = Math.Min(redeemedPoints, maxByPct);
                    }
                    if (redeemedPoints < program.MinPointsToRedeem) redeemedPoints = 0;
                }

                var originalLoyaltyDiscount = order.LoyaltyDiscountAmount;
                if (redeemedPoints > 0)
                {
                    var monetaryValue = redeemedPoints * program!.RedemptionValuePerPoint;
                    customer.LoyaltyBalance -= redeemedPoints;
                    order.LoyaltyPointsRedeemed = redeemedPoints;
                    order.LoyaltyDiscountAmount = monetaryValue;
                    // The client already folded its intended loyalty discount into the
                    // all-inclusive DiscountAmount before checkout (same as it does for coupons) —
                    // true that figure up/down if server-side clamping changed what's actually valid.
                    order.DiscountAmount += monetaryValue - originalLoyaltyDiscount;

                    db.LoyaltyTransactions.Add(new LoyaltyTransaction
                    {
                        Id = Guid.NewGuid(),
                        CustomerId = customer.Id,
                        OrderId = order.Id,
                        BranchId = order.BranchId,
                        TransactionType = "redeem",
                        Points = -redeemedPoints,
                        BalanceAfter = customer.LoyaltyBalance,
                        MonetaryValue = monetaryValue,
                        Description = $"Redeemed on order {order.OrderNumber}",
                        CreatedAt = DateTime.UtcNow,
                    });
                }
                else
                {
                    order.LoyaltyPointsRedeemed = 0;
                    order.LoyaltyDiscountAmount = 0;
                    order.DiscountAmount -= originalLoyaltyDiscount;
                }

                // No active program for this branch (branch override inactive/missing AND the
                // business-wide default is also inactive) means loyalty is genuinely OFF here —
                // no earning. Previously this fell back to hardcoded defaults (1 pt/SAR) and kept
                // earning even with the toggle off, which defeated the point of IsActive entirely.
                decimal earned = 0;
                if (program != null)
                {
                    customer.TotalSpend += order.TotalAmount;

                    // Tier is one field shared across every branch — thresholds/multipliers come
                    // ONLY from the global default program (see ResolveGlobalTierConfigAsync),
                    // never from this branch's own override, so the same customer can't be told
                    // they're a different tier depending on which branch rang up the sale. If the
                    // default program is inactive, tier is frozen rather than guessed.
                    var tierConfig = await ResolveGlobalTierConfigAsync();
                    if (tierConfig != null)
                    {
                        customer.Tier = customer.TotalSpend >= tierConfig.PlatinumThreshold ? "platinum"
                            : customer.TotalSpend >= tierConfig.GoldThreshold ? "gold"
                            : customer.TotalSpend >= tierConfig.SilverThreshold ? "silver"
                            : "standard";
                    }

                    var earnMultiplier = tierConfig is null ? 1m : customer.Tier switch
                    {
                        "platinum" => tierConfig.PlatinumEarnMultiplier,
                        "gold" => tierConfig.GoldEarnMultiplier,
                        "silver" => tierConfig.SilverEarnMultiplier,
                        _ => 1m,
                    };

                    earned = Math.Floor(order.TotalAmount * program.PointsPerCurrencyUnit * earnMultiplier);
                    if (earned > 0)
                    {
                        customer.LoyaltyBalance += earned;
                        db.LoyaltyTransactions.Add(new LoyaltyTransaction
                        {
                            Id = Guid.NewGuid(),
                            CustomerId = customer.Id,
                            OrderId = order.Id,
                            BranchId = order.BranchId,
                            TransactionType = "earn",
                            Points = earned,
                            BalanceAfter = customer.LoyaltyBalance,
                            Description = $"Earned from order {order.OrderNumber}",
                            ExpiryDate = program.PointsExpiryDays.HasValue
                                ? DateTime.UtcNow.AddDays(program.PointsExpiryDays.Value)
                                : null,
                            CreatedAt = DateTime.UtcNow,
                        });
                    }
                }

                await db.SaveChangesAsync();

                if (order.CashierId.HasValue && earned > 0)
                {
                    await notifications.NotifyUserAsync(order.CashierId.Value,
                        "Customer / Loyalty", "Loyalty Points Earned", "Loyalty Points Earned",
                        $"Customer earned {earned:F0} loyalty points",
                        entityType: "Order", entityId: order.Id, branchId: order.BranchId,
                        terminalId: order.TerminalId, triggeredBy: order.CashierId);
                }

                // ── Send invoice email ─────────────────────────────────────────
                if (!string.IsNullOrWhiteSpace(customer.Email))
                {
                    foreach (var item in order.Items)
                        item.Product = await db.Products.FindAsync(item.ProductId);

                    var zatca = await db.ZatcaSettings.FirstOrDefaultAsync(z => z.BranchId == order.BranchId);
                    _ = emailService.SendInvoiceAsync(
                        customer.Email,
                        customer.FullName ?? customer.Email,
                        order,
                        zatca?.VatRegistrationNumber,
                        zatca?.SellerName ?? order.Branch?.Name);
                }
            }
        }

        // MIMONY-ORDERS-CREATE-RAWENTITY-001: this used to return the raw, EF-tracked `order`
        // entity directly, unlike every other read endpoint here (GetAll/GetById), which
        // deliberately project down to a lean DTO — GetById's Product projection explicitly
        // excludes `ImageUrl` for exactly this reason. A product with a large inline base64
        // image (data-URI, tens of KB) reliably 500'd checkout for that product only: JSON-
        // serializing the tracked entity graph pulls in every navigation property behind it,
        // and this is the one path that was never guarded against that. Building the response
        // straight from the in-memory `order` object's own scalar properties — never touching
        // its Items[].Product/Branch/Cashier navigations — sidesteps the whole class of bug.
        return CreatedAtAction(nameof(GetById), new { id = order.Id }, new
        {
            order.Id, order.OrderNumber, order.Source, order.BranchId, order.CustomerId, order.CashierId, order.TerminalId, order.ShiftId, order.CouponId,
            order.Subtotal, order.DiscountAmount, order.LoyaltyPointsRedeemed, order.LoyaltyDiscountAmount, order.TaxAmount, order.CustomFeeAmount, order.TobaccoFeeAmount, order.TotalAmount,
            order.PaymentStatus, order.OrderStatus, order.Notes, order.ClientRequestId, order.VoidReason, order.CreatedAt, order.UpdatedAt,
            order.ZatcaQrCode, order.ZatcaInvoiceStatus,
            Items = order.Items.Select(i => new { i.Id, i.ProductId, i.Quantity, i.UnitPrice, i.TotalPrice, i.DiscountAmount, i.TaxAmount, i.TobaccoFeeAmount }),
            Payments = order.Payments.Select(p => new { p.Id, p.PaymentMethod, p.Amount, p.ReferenceNumber, p.Status }),
            Discounts = order.Discounts.Select(d => new { d.Id, d.DiscountId, d.Name, d.Amount }),
            ServiceCharges = order.ServiceCharges.Select(s => new { s.Id, s.TaxFeeRuleId, s.Name, s.Amount }),
        });
    }

    [RequirePermission("Orders", PermAction.Edit)]
    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateStatusRequest req)
    {
        var order = await db.Orders.FindAsync(id);
        if (order is null) return NotFound(new { message = "Order not found." });

        // Cancelling has to reverse stock and the cashier shift's running totals — VoidOrder
        // (the DELETE endpoint) already does that correctly. This endpoint used to accept
        // "cancelled" too and just overwrite the status label with none of that reversal,
        // silently leaving sold stock permanently gone and the shift overstated. Route callers
        // to Void instead of reproducing (and re-diverging from) that logic here.
        if (req.Status == "cancelled")
            return BadRequest(new { message = "Use Void to cancel an order — it reverses stock and shift totals; this endpoint only changes the status label." });

        // MIMONY-RETURNS-ORDERSTATUS-001: "refunded" must only ever be set by ReturnsController.
        // Complete, once a return is genuinely approved and completed — never as a raw status
        // label here, which is exactly how an order previously ended up permanently marked
        // "refunded" backed by a return that was later rejected (or never approved at all).
        if (req.Status == "refunded")
            return BadRequest(new { message = "An order can only become Refunded by completing an approved return — use the Returns workflow." });

        if (order.OrderStatus is "cancelled" or "refunded")
            return BadRequest(new { message = $"This order is already {order.OrderStatus} and cannot be changed further." });
        if (OnlineOrderGuard(order) is { } blocked) return BadRequest(new { message = blocked });

        // A completed (paid, fulfilled) order can no longer be walked back through the
        // fulfillment pipeline or cancelled outright — the only legitimate reversal left is a
        // refund, which the frontend's Refund dialog routes through the Returns approval flow.
        if (order.OrderStatus == "completed" && req.Status != "refunded")
            return BadRequest(new { message = "A completed order can only move to Refunded." });

        order.OrderStatus = req.Status;
        order.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(order);
    }

    // MIMONY-ORPHANED-CHECKOUT-001: an elevated-role checkout (Branch Manager/Supervisor/Admin)
    // with no open shift is an intentional, documented exception (FR-SLS-05 — those roles
    // structurally can't hold a shift), not a bug in itself. What QA correctly flagged as missing
    // is a way to reconcile the resulting shiftless order afterward — there was no endpoint to
    // retroactively attach one. This is that path: manager/admin-only, only for an order that's
    // genuinely still unassigned, only to a shift in the SAME branch (never a cross-branch fix-up).
    [RequirePermission("Orders", PermAction.Approve)]
    [HttpPatch("{id:guid}/reconcile-shift")]
    public async Task<IActionResult> ReconcileShift(Guid id, [FromBody] ReconcileShiftRequest req)
    {
        var order = await db.Orders.FindAsync(id);
        if (order is null) return NotFound(new { message = "Order not found." });
        if (order.ShiftId.HasValue)
            return BadRequest(new { message = "This order already has a shift assigned — nothing to reconcile." });

        var shift = await db.CashierShifts.FindAsync(req.ShiftId);
        if (shift is null) return BadRequest(new { message = "Shift not found." });
        if (shift.BranchId != order.BranchId)
            return BadRequest(new { message = "That shift belongs to a different branch than this order." });

        var beforeSnapshot = System.Text.Json.JsonSerializer.Serialize(new { order.ShiftId });
        order.ShiftId = shift.Id;
        order.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync(
            action: "reconcile_order_shift",
            entityType: "Order",
            entityId: order.Id,
            userId: CallerId(),
            branchId: order.BranchId,
            beforeValue: beforeSnapshot,
            details: System.Text.Json.JsonSerializer.Serialize(new { order.OrderNumber, ShiftId = shift.Id }),
            severity: "warning",
            module: "POS", employeeId: await ResolveEmployeeIdAsync(CallerId()));

        return Ok(order);
    }

    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : null;

    // KSA tobacco excise: min <MinimumExciseAmount> SAR OR <ExcisePercentage>% of base price per
    // unit, whichever is higher — configurable via the tobacco_excise TaxFeeRule row (Tax & Fees
    // settings) rather than a hardcoded literal, mirroring calcTobaccoFee in src/routes/_app.pos.tsx.
    // Recomputed here (rather than carried over) whenever items are edited, since quantities/
    // lines/prices can all change including brand-new lines.
    private static decimal CalcTobaccoFee(decimal unitPrice, decimal minimumExciseAmount, decimal excisePercentage) =>
        OrderEditService.CalcTobaccoFee(unitPrice, minimumExciseAmount, excisePercentage);

    // Falls back to the historical hardcoded values (25 SAR / 100%) only if no tobacco_excise
    // rule row exists at all — every seeded/live environment has exactly one, so this is a safety
    // net, not the expected path. Deliberately ignores the rule's Status: tobacco excise is a
    // mandatory KSA tax on tobacco items, not an optional toggle, so an inactive rule still
    // supplies its configured rate/minimum here (this mirrors EditOrder's pre-existing behavior
    // of always charging excise on tobacco items regardless of rule status — unchanged by this).
    private Task<(decimal MinimumExciseAmount, decimal ExcisePercentage)> ResolveTobaccoExciseConfigAsync() =>
        OrderEditService.ResolveTobaccoExciseConfigAsync(db);

    // Order Editing (FR: "Edit orders from dashboard" — manager corrects mistakes, editable order
    // with audit log). Scope: line items (qty/price/add/remove), notes, discount override, payment
    // method (single-payment orders only — split payments must be corrected via void + re-sale),
    // and which customer the order is attributed to.
    //
    // Approval Workflow: an order modification rewrites money that has already been taken, so it
    // follows the same maker-checker shape as VoidOrder below — a caller holding Orders:Approve
    // (i.e. already a manager) edits immediately (self-approve), anyone else's edit is queued in
    // the Approval Center and the order is left untouched until a manager decides. The edit itself
    // lives in IOrderEditService so both paths run identical code.
    [RequirePermission("Orders", PermAction.Edit)]
    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> EditOrder(Guid id, [FromBody] OrderEditRequest req)
    {
        if (req.Items.Count == 0) return BadRequest(new { message = "An order must have at least one line item." });

        var order = await db.Orders.Include(o => o.Items).Include(o => o.Payments).FirstOrDefaultAsync(o => o.Id == id);
        if (order is null) return NotFound(new { message = "Order not found." });
        if (order.OrderStatus == "cancelled") return BadRequest(new { message = "A cancelled order can't be edited." });
        if (OnlineOrderGuard(order) is { } blocked) return BadRequest(new { message = blocked });

        var canSelfApprove = await PermissionCheck.HasPermissionAsync(User, db, "Orders", PermAction.Approve);

        // Discount policy caps (POS Settings → CashierMaxDiscountPct / ManagerMaxDiscountPct) were
        // configurable but never actually enforced anywhere — a cashier could set any discount they
        // liked. The manager cap is a hard ceiling for everyone except tenant_admin; the cashier cap
        // is what routes an over-cap edit into the approval queue below.
        var settings = await db.PosSettings.AsNoTracking().FirstOrDefaultAsync(s => s.BranchId == order.BranchId);
        var requestedSubtotal = req.Items.Sum(i => i.Quantity * i.UnitPrice);
        var requestedDiscountPct = req.DiscountAmount.HasValue && requestedSubtotal > 0
            ? req.DiscountAmount.Value / requestedSubtotal * 100m
            : 0m;
        var isAdmin = User.FindFirst("role")?.Value == "tenant_admin";
        var managerCap = settings?.ManagerMaxDiscountPct ?? 25m;
        var cashierCap = settings?.CashierMaxDiscountPct ?? 5m;
        if (!isAdmin && requestedDiscountPct > managerCap)
            return BadRequest(new { message = $"A discount of {requestedDiscountPct:0.##}% exceeds the {managerCap:0.##}% maximum allowed on this branch." });

        // A repriced line is a Price Override — an approval-based action in its own right, so it
        // routes to the queue for a caller who can't self-approve even when no discount is involved.
        var expectedPrices = await orderEditService.ResolveExpectedPricesAsync(
            req.Items.Select(i => i.ProductId), order.BranchId, order.CustomerId);
        var oldPriceByProduct = order.Items.GroupBy(i => i.ProductId).ToDictionary(g => g.Key, g => g.First().UnitPrice);
        var hasPriceOverride = req.Items.Any(i =>
            expectedPrices.TryGetValue(i.ProductId, out var listPrice)
            && i.UnitPrice != listPrice
            && (!oldPriceByProduct.TryGetValue(i.ProductId, out var was) || was != i.UnitPrice));

        if (!canSelfApprove)
        {
            var pending = new ApprovalRequest
            {
                RequestType = "order_modification",
                EntityType = "Order",
                EntityId = order.Id,
                BranchId = order.BranchId,
                RequestedBy = CallerId() ?? Guid.Empty,
                Reason = req.Notes,
                // The full edit payload — replayed verbatim by ApprovalsController.Decide, which is
                // the only way the approved edit can be exactly the edit that was reviewed.
                DetailsJson = System.Text.Json.JsonSerializer.Serialize(req),
            };
            db.ApprovalRequests.Add(pending);
            await db.SaveChangesAsync();

            await audit.LogAsync(
                action: "request_order_modification",
                entityType: "Order",
                entityId: order.Id,
                userId: CallerId(),
                branchId: order.BranchId,
                details: System.Text.Json.JsonSerializer.Serialize(new
                {
                    order.OrderNumber,
                    RequestedSubtotal = requestedSubtotal,
                    RequestedDiscount = req.DiscountAmount,
                    RequestedDiscountPct = Math.Round(requestedDiscountPct, 2),
                    PriceOverride = hasPriceOverride,
                    Items = req.Items.Select(i => new { i.ProductId, i.Quantity, i.UnitPrice, TotalPrice = i.Quantity * i.UnitPrice }),
                }),
                severity: "warning",
                notes: req.Notes,
                // "Orders", not "POS" — this happens on the Orders management screen, not at the
                // till. The module is what an auditor filters the activity report by, so it has to
                // name where the action was actually taken.
                module: "Orders", employeeId: await ResolveEmployeeIdAsync(CallerId()), terminalId: order.TerminalId);

            await approvalNotifications.NotifyPendingAsync(pending, "Orders",
                hasPriceOverride ? "Price override awaiting approval" : "Order modification awaiting approval",
                $"Order {order.OrderNumber}: {req.Items.Count} line(s), SAR {requestedSubtotal:0.##}"
                    + (requestedDiscountPct > 0 ? $", {requestedDiscountPct:0.##}% discount" : "")
                    + (hasPriceOverride ? ", includes a price override" : "")
                    + " — needs your approval.");

            return Accepted(new
            {
                message = requestedDiscountPct > cashierCap
                    ? $"A discount of {requestedDiscountPct:0.##}% is above your {cashierCap:0.##}% limit — the change was sent for manager approval."
                    : "Order modification sent for manager approval.",
                approvalRequestId = pending.Id,
            });
        }

        var outcome = await orderEditService.ApplyAsync(id, req, CallerId());
        if (!outcome.Success)
        {
            return outcome.ErrorMessage == "Order not found."
                ? NotFound(new { message = outcome.ErrorMessage })
                : BadRequest(new { message = outcome.ErrorMessage });
        }

        var updated = await db.Orders
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .Include(o => o.Payments)
            .Include(o => o.Customer)
            .Include(o => o.Discounts)
            .Include(o => o.ServiceCharges)
            .FirstOrDefaultAsync(o => o.Id == id);
        return Ok(updated);
    }

    // Order void — a caller with Orders:Approve (i.e. already a manager) voids immediately
    // (self-approve, same precedent as the Wastage/InventoryAdjustment flow). Anyone else's void
    // request is queued in the Approval Center instead of executing — the order is left
    // untouched until a manager approves or rejects it there.
    [RequirePermission("Orders", PermAction.Delete)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> VoidOrder(Guid id, [FromBody] OrderVoidRequest req)
    {
        var order = await db.Orders.Include(o => o.Items).Include(o => o.Payments).Include(o => o.Discounts).Include(o => o.ServiceCharges).FirstOrDefaultAsync(o => o.Id == id);
        if (order is null) return NotFound(new { message = "Order not found." });
        if (order.OrderStatus == "cancelled") return BadRequest(new { message = "This order is already cancelled." });
        // "refunded" means a return already restocked some or all of this order's items
        // (ReturnsController.Complete) — VoidAsync unconditionally restores every line's full
        // original quantity with no awareness of returns, so voiding on top of that would add those
        // units back to stock a second time.
        if (order.OrderStatus == "refunded") return BadRequest(new { message = "This order has already been refunded — void the remaining return instead of voiding the whole order." });
        if (OnlineOrderGuard(order) is { } blocked) return BadRequest(new { message = blocked });

        var settings = await db.PosSettings.AsNoTracking().FirstOrDefaultAsync(s => s.BranchId == order.BranchId);
        if (settings?.RequireReasonForVoid == true && string.IsNullOrWhiteSpace(req.Reason))
            return BadRequest(new { message = "A reason is required to void this order." });

        var canSelfApprove = await PermissionCheck.HasPermissionAsync(User, db, "Orders", PermAction.Approve);
        if (!canSelfApprove)
        {
            var pending = new ApprovalRequest
            {
                RequestType = "order_cancellation",
                EntityType = "Order",
                EntityId = order.Id,
                BranchId = order.BranchId,
                RequestedBy = CallerId() ?? Guid.Empty,
                Reason = req.Reason,
            };
            db.ApprovalRequests.Add(pending);
            await db.SaveChangesAsync();

            // The maker half of the maker-checker pair. Without this, a cancellation request that
            // a manager later rejects left no trace at all of who asked for it — the Approval
            // Center row is the only record, and the employee reports never saw it.
            await audit.LogAsync(
                action: "request_order_cancellation",
                entityType: "Order",
                entityId: order.Id,
                userId: CallerId(),
                branchId: order.BranchId,
                details: System.Text.Json.JsonSerializer.Serialize(new
                {
                    order.OrderNumber, order.Subtotal, order.DiscountAmount, order.TotalAmount,
                    Reason = req.Reason,
                    Items = order.Items.Select(i => new { i.ProductId, i.Quantity, i.UnitPrice, i.TotalPrice }),
                }),
                severity: "warning",
                notes: req.Reason,
                module: "Orders", employeeId: await ResolveEmployeeIdAsync(CallerId()), terminalId: order.TerminalId);

            await approvalNotifications.NotifyPendingAsync(pending, "Orders",
                "Order cancellation awaiting approval",
                $"Order {order.OrderNumber} (SAR {order.TotalAmount:0.##}) is queued for cancellation"
                    + (string.IsNullOrWhiteSpace(req.Reason) ? "" : $" — \"{req.Reason}\"") + ".");

            return Accepted(new { message = "Void request sent for manager approval.", approvalRequestId = pending.Id });
        }

        // Captured BEFORE the void — the cancelled state is what the trail needs to show was
        // undone, including every line that went back on the shelf. The old snapshot recorded
        // only the order number and reason, so the Employee Activity Report / Audit Center could
        // never answer "which products, how many" for a cancellation.
        var beforeSnapshot = System.Text.Json.JsonSerializer.Serialize(new
        {
            order.OrderStatus,
            order.PaymentStatus,
            order.Subtotal,
            order.DiscountAmount,
            order.TaxAmount,
            order.TotalAmount,
            Items = order.Items.Select(i => new { i.ProductId, i.Quantity, i.UnitPrice, i.TotalPrice }),
        });
        var voidedItems = order.Items.Select(i => new { i.ProductId, i.Quantity, i.UnitPrice, i.TotalPrice }).ToList();
        var voidedTotals = new { order.Subtotal, order.DiscountAmount, order.TaxAmount, order.TotalAmount };

        await orderVoidService.VoidAsync(order, req.Reason);

        await audit.LogAsync(
            action: "void_order",
            entityType: "Order",
            entityId: order.Id,
            userId: CallerId(),
            branchId: order.BranchId,
            details: System.Text.Json.JsonSerializer.Serialize(new
            {
                order.OrderNumber,
                OrderStatus = order.OrderStatus,
                PaymentStatus = order.PaymentStatus,
                voidedTotals.Subtotal,
                voidedTotals.DiscountAmount,
                voidedTotals.TaxAmount,
                voidedTotals.TotalAmount,
                Reason = req.Reason,
                Items = voidedItems,
            }),
            // A cancellation reverses money and stock — it belongs on the same "spot this" tier as
            // a refund or a deletion, not filed under routine info.
            severity: "warning",
            beforeValue: beforeSnapshot,
            notes: req.Reason,
            module: "Orders", employeeId: await ResolveEmployeeIdAsync(CallerId()), terminalId: order.TerminalId);

        return Ok(order);
    }

    [RequirePermission("POS", PermAction.Create)]
    [HttpPost("{id:guid}/payments")]
    public async Task<IActionResult> AddPayment(Guid id, [FromBody] OrderPayment payment)
    {
        var order = await db.Orders.FindAsync(id);
        if (order is null) return NotFound(new { message = "Order not found." });
        if (OnlineOrderGuard(order) is { } blocked) return BadRequest(new { message = blocked });
        payment.Id = Guid.NewGuid();
        payment.OrderId = id;
        payment.CreatedAt = DateTime.UtcNow;
        db.OrderPayments.Add(payment);

        // Same rollup this order's initial payments got at Create() — a payment added after the
        // fact (e.g. split/pay-later) must still count toward the shift's running totals.
        if (order.ShiftId.HasValue)
        {
            var shift = await db.CashierShifts.FindAsync(order.ShiftId.Value);
            if (shift is not null)
            {
                switch (payment.PaymentMethod)
                {
                    case "cash": shift.CashSales += payment.Amount; break;
                    case "card": shift.CardSales += payment.Amount; break;
                    default: shift.DigitalSales += payment.Amount; break;
                }
                shift.TotalSales += payment.Amount;
            }
        }

        await db.SaveChangesAsync();
        return Created($"/api/orders/{id}/payments/{payment.Id}", payment);
    }

    [HttpGet("{id:guid}/returns")]
    public async Task<IActionResult> GetReturns(Guid id)
    {
        return Ok(await db.CustomerReturns.Where(r => r.OrderId == id).ToListAsync());
    }
}

public record UpdateStatusRequest(string Status);
public record ReconcileShiftRequest(Guid ShiftId);
public record OrderEditItemRequest(Guid? Id, Guid ProductId, decimal Quantity, decimal UnitPrice);
public record OrderEditRequest(
    List<OrderEditItemRequest> Items,
    string? Notes,
    string? PaymentMethod = null,
    decimal? DiscountAmount = null,
    bool UpdateCustomer = false,
    Guid? CustomerId = null);
public record OrderVoidRequest(string? Reason);
