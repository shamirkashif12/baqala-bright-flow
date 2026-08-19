using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

// OnlineOrderItemRequest / QuoteOnlineOrderRequest / PlaceOnlineOrderRequest live in
// api/Models/OnlineOrderRequests.cs — they're shared with OnlineCheckoutService (which also
// stores PlaceOnlineOrderRequest as the checkout snapshot on OnlinePayment).

public record UpdateOnlineOrderDeliveryFeeRequest(decimal Amount, string? Reason);

public record UpdateOnlineOrderItemsRequest(List<OnlineOrderItemEdit> Items);
public record OnlineOrderItemEdit(Guid? OrderItemId, Guid ProductId, decimal Quantity, decimal UnitPrice);

public record ApproveOnlineOrderRequest(string PaymentMethod);
public record RejectOnlineOrderRequest(string Reason);

// Separate from OrdersController (already 1000+ lines and built around the POS/kiosk semi-trusted
// checkout path) — this is the one fully anonymous, untrusted checkout path in the codebase, so it
// gets its own trust boundary and its own ledger-timing rules (reserve at placement, deduct +
// write StockMovement only at delivery — see IStockMovementService's own doc comment on why the
// mutation and its ledger row must land in the same unit of work).
[ApiController]
[Route("api/online-orders")]
public class OnlineOrdersController(
    BaqalaDbContext db,
    IOnlineOrderPricingService pricing,
    IOfferResolutionService offers,
    IStockMovementService stockMovements,
    IStockAlertService stockAlerts,
    IAuditService audit,
    IBatchConsumptionService batchConsumption,
    INotificationService notifications,
    IOnlineCheckoutService checkout,
    ILogger<OnlineOrdersController> logger) : ControllerBase
{
    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : null;

    private async Task<(Branch? Branch, PosSettings? Settings)> ResolveOnlineOrderingBranchAsync(Guid branchId)
    {
        var branch = await db.Branches.FindAsync(branchId);
        if (branch is null || branch.Status != "active") return (null, null);
        var settings = await db.PosSettings.FirstOrDefaultAsync(s => s.BranchId == branchId);
        if (settings?.OnlineOrderingEnabled != true) return (null, null);
        return (branch, settings);
    }

    // ── Public, unauthenticated ────────────────────────────────────────────

    [AllowAnonymous]
    [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("online-public")]
    [HttpGet("public/{branchId:guid}/catalog")]
    public async Task<IActionResult> GetPublicCatalog(Guid branchId)
    {
        var (branch, _) = await ResolveOnlineOrderingBranchAsync(branchId);
        if (branch is null) return NotFound(new { message = "Online ordering isn't available for this branch." });

        // Tobacco is deliberately allowed here (unlike the kiosk catalog, which still excludes
        // it) — online ordering has a mandatory staff-approval step before anything ships, unlike
        // kiosk's fully-automated self-checkout, so age verification is a delivery-time control
        // rather than one this endpoint needs to enforce itself. AllowSelfCheckout still gates
        // other exclusions (high-shrink/weight-based items) unrelated to that decision.
        var stocks = await db.InventoryStocks
            .Include(s => s.Product).ThenInclude(p => p!.Category)
            .Where(s => s.BranchId == branchId &&
                        s.Product!.Status == "active" && s.Product.AllowSelfCheckout)
            .ToListAsync();

        var productIds = stocks.Select(s => s.ProductId).ToList();
        var resolved = await pricing.ComputeAsync(branchId, productIds.Select(id => (id, Quantity: 1m)));
        // Bonus lines are meaningless against a synthetic qty=1 probe of the WHOLE catalog at
        // once (they'd only reflect a real cart) — the catalog communicates an active offer via
        // offerBadge instead. Exclude them here so a same-SKU bogo (bonus ProductId == a paid
        // line's ProductId) can't collide as a duplicate dictionary key.
        var priceByProduct = resolved.Items.Where(i => !i.IsBonus).ToDictionary(i => i.ProductId, i => i);
        var badges = await offers.GetCatalogBadgesAsync(branchId, productIds);

        // Materialize then filter in memory — a `productIds.Contains()` filter inside the live
        // query fails to type-map on this MySQL EF provider (the ef-mysql-inlist-gotcha worked
        // around throughout this codebase).
        var productIdSet = productIds.ToHashSet();
        var galleryByProduct = (await db.ProductImages.OrderBy(i => i.SortOrder).ToListAsync())
            .Where(i => productIdSet.Contains(i.ProductId))
            .GroupBy(i => i.ProductId)
            .ToDictionary(g => g.Key, g => g.Select(i => i.FileUrl).ToList());

        var companyProfile = await db.CompanyProfiles.FindAsync(CompanyProfile.SingletonId);
        var logoDataUrl = companyProfile?.ShowLogoOnCustomerSlip == true ? companyProfile.LogoDataUrl : null;

        // "Pay Online" exists only when the branch has MyFatoorah enabled WITH a token (Admin →
        // Payments) — the same condition that gates invoice creation and status polling, so the
        // page and the server can never disagree about whether online payment is available.
        var onlinePaymentEnabled = await checkout.ResolveMyFatoorahAccountAsync(branchId) is not null;

        return Ok(new
        {
            branchName = branch.Name,
            logoDataUrl,
            onlinePaymentEnabled,
            products = stocks.Select(s =>
            {
                var line = priceByProduct.GetValueOrDefault(s.ProductId);
                var images = new List<string>();
                if (!string.IsNullOrEmpty(s.Product!.ImageUrl)) images.Add(s.Product.ImageUrl);
                if (galleryByProduct.TryGetValue(s.ProductId, out var gallery)) images.AddRange(gallery);
                return new
                {
                    productId = s.ProductId,
                    name = s.Product.Name,
                    nameAr = s.Product.NameAr,
                    description = s.Product.Description,
                    images,
                    unitOfMeasure = s.Product.UnitOfMeasure,
                    categoryName = s.Product.Category?.Name,
                    originalPrice = line?.OriginalUnitPrice ?? s.Product.BasePrice,
                    unitPrice = line?.UnitPrice ?? s.Product.BasePrice,
                    isTobacco = s.Product.IsTobacco,
                    offerBadge = badges.GetValueOrDefault(s.ProductId),
                    available = Math.Max(0, s.Quantity - s.ReservedQuantity),
                };
            }),
        });
    }

    // Read-only preview of the real server-computed totals (product discount + offers + tobacco
    // excise + custom fees + VAT) for the checkout screen's order summary — creates nothing.
    // Necessary because none of that pricing logic is safe/sensible to duplicate client-side (see
    // IOnlineOrderPricingService's own doc comment); without this the cart summary could only ever
    // show a naive unitPrice*qty guess with no visibility into fees until after the order is placed.
    [AllowAnonymous]
    [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("online-public")]
    [HttpPost("public/{branchId:guid}/quote")]
    public async Task<IActionResult> QuotePublicOrder(Guid branchId, [FromBody] QuoteOnlineOrderRequest req)
    {
        var (branch, _) = await ResolveOnlineOrderingBranchAsync(branchId);
        if (branch is null) return NotFound(new { message = "Online ordering isn't available for this branch." });
        if (req?.Items is not { Count: > 0 }) return BadRequest(new { message = "Your cart is empty." });

        var totals = await pricing.ComputeAsync(
            branchId, req.Items.Select(i => (i.ProductId, i.Quantity)), req.Latitude, req.Longitude);
        return Ok(new
        {
            items = totals.Items.Select(i => new
            {
                i.ProductId, i.Quantity, i.OriginalUnitPrice, i.UnitPrice, i.TotalPrice, i.IsBonus, i.OfferName,
            }),
            subtotal = totals.Subtotal,
            tobaccoFeeAmount = totals.TobaccoFeeAmount,
            customFees = totals.CustomFees.Select(f => new { f.Name, f.Amount }),
            customFeeAmount = totals.CustomFeeAmount,
            taxAmount = totals.TaxAmount,
            totalAmount = totals.TotalAmount,
            // The quote reports serviceability as data rather than as an error: the shopper is
            // still mid-checkout and may well move the pin, so the page needs to show the problem
            // in place. Placement is where it becomes a hard 400.
            deliveryFee = totals.Delivery.Amount,
            deliveryFeeName = totals.Delivery.RuleName,
            deliveryFeeSource = totals.Delivery.Source,
            deliveryFeeWaived = totals.Delivery.WaivedByThreshold,
            deliveryDistanceKm = totals.Delivery.DistanceKm,
            isServiceable = totals.Delivery.IsServiceable,
            unserviceableMessage = totals.Delivery.UnserviceableMessage,
        });
    }

    // ── Card payment (MyFatoorah) ──────────────────────────────────────────
    // The whole card flow lives in OnlineCheckoutService; these endpoints only translate its
    // results to HTTP. Shape of the flow: (1) card-payment raises the invoice AND records the
    // full checkout; (2) the page opens the invoice URL and polls status; (3) the first status
    // poll that finds it Paid creates the order server-side from the record and returns the
    // order number — the browser never has to make a second, failable "place order" call for
    // card, and OnlinePaymentReconcilerService finishes any payment whose browser went away.

    [AllowAnonymous]
    [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("online-payment")]
    [HttpPost("public/{branchId:guid}/card-payment")]
    public async Task<IActionResult> InitiateOnlinePayment(Guid branchId, [FromBody] PlaceOnlineOrderRequest req)
    {
        var result = await checkout.InitiateCardPaymentAsync(branchId, req, HttpContext.RequestAborted);
        if (!result.Ok) return StatusCode(result.StatusCode, new { message = result.Message });
        var v = result.Value!;
        return Ok(new { invoiceId = v.InvoiceId, invoiceUrl = v.InvoiceUrl, totalAmount = v.TotalAmount });
    }

    // Branch-scoped because the lookup is made on the branch's own MyFatoorah account (the one
    // the invoice was raised on) and answered only for invoices this app recorded for that branch.
    [AllowAnonymous]
    [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("online-public")]
    [HttpGet("public/{branchId:guid}/card-payment/{invoiceId:long}/status")]
    public async Task<IActionResult> GetOnlinePaymentStatus(Guid branchId, long invoiceId)
    {
        var result = await checkout.GetCardPaymentStatusAsync(branchId, invoiceId, HttpContext.RequestAborted);
        if (!result.Ok) return StatusCode(result.StatusCode, new { message = result.Message });
        var v = result.Value!;
        return Ok(new { status = v.Status, rawStatus = v.RawStatus, orderNumber = v.OrderNumber, totalAmount = v.OrderTotal, problem = v.Problem });
    }

    [AllowAnonymous]
    [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("online-payment")]
    [HttpPost("public/{branchId:guid}")]
    public async Task<IActionResult> PlacePublicOrder(Guid branchId, [FromBody] PlaceOnlineOrderRequest req)
    {
        var result = await checkout.PlacePublicOrderAsync(branchId, req, HttpContext.RequestAborted);
        if (!result.Ok) return StatusCode(result.StatusCode, new { message = result.Message });
        return Ok(new { result.Value!.OrderNumber, result.Value.TotalAmount });
    }

    // ── Payments needing attention (staff) ─────────────────────────────────
    // Money that exists at MyFatoorah without a matching order here: paid invoices whose order
    // couldn't be created (stock gone, price moved, branch switched off...). Each can be placed
    // (retry from the recorded checkout) or refunded. Same permission as approving orders.

    [RequirePermission("Online Orders", PermAction.Approve)]
    [HttpGet("payments/attention")]
    public async Task<IActionResult> GetPaymentsNeedingAttention([FromQuery] Guid? branchId)
    {
        var (role, callerBranchId) = GetCallerContext();
        var scopedBranch = role == "tenant_admin" ? branchId : (callerBranchId ?? branchId);

        var query = db.OnlinePayments.AsNoTracking().Where(p => p.Status == "paid");
        if (scopedBranch is { } b) query = query.Where(p => p.BranchId == b);
        var rows = await query.OrderBy(p => p.PaidAt).Take(200).ToListAsync();

        var branchNames = await db.Branches.AsNoTracking().ToDictionaryAsync(x => x.Id, x => x.Name);
        return Ok(rows.Select(p =>
        {
            PlaceOnlineOrderRequest? snapshot = null;
            try { snapshot = System.Text.Json.JsonSerializer.Deserialize<PlaceOnlineOrderRequest>(p.CheckoutJson); } catch (System.Text.Json.JsonException) { }
            return new
            {
                p.Id, p.BranchId, branchName = branchNames.GetValueOrDefault(p.BranchId),
                invoiceId = p.GatewayInvoiceId, p.InvoiceUrl, p.AmountSar, p.PaidAt, p.LastError, p.PlacementAttempts,
                customerName = snapshot?.FullName, customerPhone = snapshot?.Phone, itemCount = snapshot?.Items?.Count ?? 0,
            };
        }));
    }

    [RequirePermission("Online Orders", PermAction.Approve)]
    [HttpPost("payments/{id:guid}/place-order")]
    public async Task<IActionResult> PlaceOrderFromPayment(Guid id)
    {
        var payment = await db.OnlinePayments.FirstOrDefaultAsync(p => p.Id == id);
        if (payment is null) return NotFound(new { message = "Payment not found." });
        var (role, callerBranchId) = GetCallerContext();
        if (role != "tenant_admin" && callerBranchId is { } cb && cb != payment.BranchId) return Forbid();

        var result = await checkout.PlaceFromPaymentAsync(payment, HttpContext.RequestAborted, notifyOnFailure: false);
        if (!result.Ok) return StatusCode(result.StatusCode, new { message = result.Message });
        await audit.LogAsync("Online order created from paid payment", entityType: "Order", entityId: result.Value!.OrderId,
            userId: CallerId(), branchId: payment.BranchId, module: "Online Orders",
            details: $"MyFatoorah invoice {payment.GatewayInvoiceId} · {result.Value.OrderNumber}");
        return Ok(new { result.Value.OrderId, result.Value.OrderNumber, result.Value.TotalAmount });
    }

    public record RefundOnlinePaymentRequest(string? Reason);

    [RequirePermission("Online Orders", PermAction.Approve)]
    [HttpPost("payments/{id:guid}/refund")]
    public async Task<IActionResult> RefundPayment(Guid id, [FromBody] RefundOnlinePaymentRequest? req)
    {
        var payment = await db.OnlinePayments.FirstOrDefaultAsync(p => p.Id == id);
        if (payment is null) return NotFound(new { message = "Payment not found." });
        var (role, callerBranchId) = GetCallerContext();
        if (role != "tenant_admin" && callerBranchId is { } cb && cb != payment.BranchId) return Forbid();
        if (payment.Status == "ordered")
            return BadRequest(new { message = "This payment already has an order — reject that order to refund it." });

        var result = await checkout.RefundAsync(payment, req?.Reason?.Trim() is { Length: > 0 } r ? r : "refunded by staff (no order)", CallerId(), HttpContext.RequestAborted);
        if (!result.Ok) return StatusCode(result.StatusCode, new { message = result.Message });
        return Ok(new { refundId = result.Value!.RefundId, refundReference = result.Value.RefundReference, payment.Status });
    }

    // ── Admin / branch manager ─────────────────────────────────────────────

    [RequirePermission("Online Orders", PermAction.View)]
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] Guid[]? branchId, [FromQuery] string[]? status,
        [FromQuery] int? page, [FromQuery] int? pageSize)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue) branchId = [callerBranchId.Value];

        var all = await db.Orders
            .Include(o => o.Branch)
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .Include(o => o.Payments)
            .Include(o => o.DeliveryDetail)
            .Include(o => o.ServiceCharges)
            .Where(o => o.Source == "online")
            .OrderByDescending(o => o.CreatedAt)
            .Select(o => new
            {
                o.Id, o.OrderNumber, o.BranchId, o.Subtotal, o.TaxAmount, o.TobaccoFeeAmount, o.CustomFeeAmount,
                o.DeliveryFeeAmount, o.TotalAmount,
                o.PaymentStatus, o.OrderStatus, o.RejectionReason, o.ApprovedAt, o.CreatedAt, o.UpdatedAt,
                Branch = o.Branch == null ? null : new { o.Branch.Id, o.Branch.Name },
                Items = o.Items.Select(i => new
                {
                    i.Id, i.ProductId, i.Quantity, i.UnitPrice, i.TotalPrice, i.TobaccoFeeAmount,
                    ProductName = i.Product == null ? null : i.Product.Name,
                }),
                Payments = o.Payments.Select(p => new { p.Id, p.PaymentMethod, p.Amount, p.Status }),
                ServiceCharges = o.ServiceCharges.Select(s => new { s.Id, s.Name, s.Amount }),
                Delivery = o.DeliveryDetail == null ? null : new
                {
                    o.DeliveryDetail.FullName, o.DeliveryDetail.Phone, o.DeliveryDetail.Email,
                    o.DeliveryDetail.AddressLine, o.DeliveryDetail.Latitude, o.DeliveryDetail.Longitude, o.DeliveryDetail.Notes,
                    o.DeliveryDetail.DeliveryFeeRuleId, o.DeliveryDetail.DeliveryFeeRuleName,
                    o.DeliveryDetail.DeliveryDistanceKm,
                    o.DeliveryDetail.DeliveryFeeOverriddenBy, o.DeliveryDetail.DeliveryFeeOverriddenAt,
                    o.DeliveryDetail.DeliveryFeeOverrideReason,
                },
            })
            .ToListAsync();

        var scoped = all.AsEnumerable();
        // Array `.Contains()` filters run in memory, not SQL — same MySQL EF provider gotcha
        // worked around throughout OrdersController.
        if (branchId is { Length: > 0 }) scoped = scoped.Where(o => branchId.Contains(o.BranchId));
        if (status is { Length: > 0 }) scoped = scoped.Where(o => status.Contains(o.OrderStatus));
        var filtered = scoped.ToList();

        var totalCount = filtered.Count;
        var effectivePageSize = pageSize is > 0 and <= 200 ? pageSize.Value : 50;
        var effectivePage = page is > 0 ? page.Value : 1;
        var paged = page.HasValue || pageSize.HasValue
            ? filtered.Skip((effectivePage - 1) * effectivePageSize).Take(effectivePageSize).ToList()
            : filtered.Take(200).ToList();

        if (!page.HasValue && !pageSize.HasValue) return Ok(paged);
        return Ok(new { total = totalCount, page = effectivePage, pageSize = effectivePageSize, items = paged });
    }

    // Recompute reservation for one product against its CURRENT stock row, given the previously
    // reserved quantity for this order and the newly desired quantity (0 to remove the line).
    private static void AdjustReservation(InventoryStock stock, decimal previousQty, decimal newQty) =>
        stock.ReservedQuantity = Math.Max(0, stock.ReservedQuantity - previousQty + newQty);

    [RequirePermission("Online Orders", PermAction.Edit)]
    [HttpPatch("{id:guid}/items")]
    public async Task<IActionResult> UpdateItems(Guid id, [FromBody] UpdateOnlineOrderItemsRequest req)
    {
        var order = await db.Orders.Include(o => o.Items).FirstOrDefaultAsync(o => o.Id == id && o.Source == "online");
        if (order is null) return NotFound(new { message = "Online order not found." });
        if (order.OrderStatus != "pending")
            return BadRequest(new { message = "Only a pending order's items can be edited." });
        // A card-paid order's total is money already taken; changing its lines would silently
        // over- or under-charge the customer with nothing to reconcile it. Frozen — reject (which
        // refunds) and let the customer reorder, or deliver as is.
        if (order.PaymentStatus == "paid")
            return BadRequest(new { message = $"This order was already paid online (SAR {order.TotalAmount:F2}), so its items can't be changed. Reject it to refund the customer and ask them to reorder, or deliver it as is." });
        if (req.Items is not { Count: > 0 }) return BadRequest(new { message = "An order must have at least one line item." });

        var productIds = order.Items.Select(i => i.ProductId).Concat(req.Items.Select(i => i.ProductId)).Distinct().ToList();
        var stocks = (await db.InventoryStocks.Where(s => s.BranchId == order.BranchId).ToListAsync())
            .Where(s => productIds.Contains(s.ProductId))
            .ToDictionary(s => s.ProductId);

        // Availability check first, against what each product's reservation would become —
        // i.e. release this order's existing hold on it before checking, so shrinking/removing a
        // line never falsely blocks itself, and growing one is checked against genuinely free stock.
        foreach (var group in req.Items.GroupBy(i => i.ProductId))
        {
            if (!stocks.TryGetValue(group.Key, out var stock))
                return BadRequest(new { message = "One or more items are no longer available." });
            var previouslyReservedForOrder = order.Items.Where(i => i.ProductId == group.Key).Sum(i => i.Quantity);
            var newlyReserved = group.Sum(i => i.Quantity);
            var freeStock = stock.Quantity - stock.ReservedQuantity + previouslyReservedForOrder;
            if (freeStock < newlyReserved)
                return BadRequest(new { message = $"Only {Math.Max(0, freeStock):0.##} available for one of the edited items." });
        }

        // Release every existing line's reservation, then re-reserve per the edited list.
        foreach (var oldItem in order.Items)
            if (stocks.TryGetValue(oldItem.ProductId, out var s)) AdjustReservation(s, oldItem.Quantity, 0);

        db.OrderItems.RemoveRange(order.Items);
        var totals = await pricing.ComputeAsync(order.BranchId, req.Items.Select(i => (i.ProductId, i.Quantity)));
        // Admin-overridden price wins over the freshly resolved one — that's the whole point of
        // this endpoint (price override / OOS removal), so apply the caller's UnitPrice on top of
        // the recomputed line rather than the resolver's own answer.
        var newItems = req.Items.Select(edit =>
        {
            var totalPrice = Math.Round(edit.UnitPrice * edit.Quantity, 2);
            return new OrderItem
            {
                Id = Guid.NewGuid(), OrderId = order.Id, ProductId = edit.ProductId,
                Quantity = edit.Quantity, UnitPrice = edit.UnitPrice, TotalPrice = totalPrice,
                CreatedAt = DateTime.UtcNow,
            };
        }).ToList();
        foreach (var item in newItems) db.OrderItems.Add(item);

        foreach (var item in newItems)
            if (stocks.TryGetValue(item.ProductId, out var s)) AdjustReservation(s, 0, item.Quantity);
        foreach (var s in stocks.Values) s.UpdatedAt = DateTime.UtcNow;

        var subtotal = newItems.Sum(i => i.TotalPrice);
        var vatRate = totals.Subtotal > 0 ? totals.TaxAmount / totals.Subtotal : 0m;
        order.Subtotal = subtotal;
        order.TaxAmount = Math.Round(subtotal * vatRate, 2);
        // The already-charged delivery and custom fees carry over rather than being recomputed:
        // editing which items ship doesn't re-run the delivery quote (the address hasn't moved),
        // and staff change the fee itself through the dedicated endpoint below. They must still be
        // ADDED BACK to the total — dropping them, as this line did for custom fees before, made
        // every edited order silently cheaper than what was agreed.
        order.TotalAmount = order.Subtotal + order.TaxAmount + order.CustomFeeAmount + order.DeliveryFeeAmount;
        order.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
        return Ok(new { order.Id, order.Subtotal, order.TaxAmount, order.DeliveryFeeAmount, order.TotalAmount });
    }

    /// <summary>
    /// Override the delivery fee on a pending order.
    ///
    /// Rules can only describe the situations an operator anticipated; a specific order is
    /// routinely different (a regular being waived a fee, a rider quoting more for a hard-to-reach
    /// address). Without this the only way to correct a fee would be to reject the order and ask
    /// the customer to place it again.
    ///
    /// Pending only, mirroring the item-edit endpoint: after approval a payment row exists for the
    /// agreed amount, and changing what's owed underneath it would leave the two disagreeing.
    /// </summary>
    [RequirePermission("Online Orders", PermAction.Edit)]
    [HttpPatch("{id:guid}/delivery-fee")]
    public async Task<IActionResult> UpdateDeliveryFee(Guid id, [FromBody] UpdateOnlineOrderDeliveryFeeRequest req)
    {
        if (req.Amount < 0) return BadRequest(new { message = "The delivery fee cannot be negative." });

        var order = await db.Orders
            .Include(o => o.DeliveryDetail)
            .FirstOrDefaultAsync(o => o.Id == id && o.Source == "online");
        if (order is null) return NotFound(new { message = "Online order not found." });
        if (order.OrderStatus != "pending")
            return BadRequest(new { message = "Only a pending order's delivery fee can be changed." });
        if (order.PaymentStatus == "paid")
            return BadRequest(new { message = $"This order was already paid online (SAR {order.TotalAmount:F2}), so its delivery fee can't be changed." });

        var previous = order.DeliveryFeeAmount;
        var amount = Math.Round(req.Amount, 2);
        if (previous == amount) return Ok(new { order.Id, order.DeliveryFeeAmount, order.TotalAmount });

        // Adjust the total by the delta rather than recomputing it from parts — the order may
        // carry an item-level price override from UpdateItems that a fresh recompute would undo.
        order.DeliveryFeeAmount = amount;
        order.TotalAmount += amount - previous;
        order.UpdatedAt = DateTime.UtcNow;

        if (order.DeliveryDetail is not null)
        {
            order.DeliveryDetail.DeliveryFeeOverriddenBy = CallerId();
            order.DeliveryDetail.DeliveryFeeOverriddenAt = DateTime.UtcNow;
            order.DeliveryDetail.DeliveryFeeOverrideReason =
                string.IsNullOrWhiteSpace(req.Reason) ? null : req.Reason.Trim();
        }

        await db.SaveChangesAsync();

        var (_, callerBranchId) = GetCallerContext();
        await audit.LogAsync("Changed online order delivery fee", entityType: "Order", entityId: order.Id,
            userId: CallerId(), branchId: callerBranchId ?? order.BranchId, module: "Online Orders",
            severity: "warning",
            beforeValue: System.Text.Json.JsonSerializer.Serialize(new { deliveryFeeAmount = previous }),
            details: System.Text.Json.JsonSerializer.Serialize(new { deliveryFeeAmount = amount }),
            notes: $"{order.OrderNumber}: delivery fee {previous:0.00} → {amount:0.00}"
                   + (string.IsNullOrWhiteSpace(req.Reason) ? "" : $" ({req.Reason.Trim()})"));

        return Ok(new { order.Id, order.DeliveryFeeAmount, order.TotalAmount });
    }

    [RequirePermission("Online Orders", PermAction.Approve)]
    [HttpPatch("{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ApproveOnlineOrderRequest req)
    {
        var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == id && o.Source == "online");
        if (order is null) return NotFound(new { message = "Online order not found." });
        if (order.OrderStatus != "pending") return BadRequest(new { message = "Only a pending order can be approved." });

        // A MyFatoorah order is already paid in full at placement time (see PlacePublicOrder) —
        // there's no payment method left for staff to decide here, just fulfillment. Cash on
        // Delivery is still the only method staff themselves choose at this step — validated
        // explicitly (rather than trusting whatever the client sends) so a new method can be added
        // later purely by extending this check and the frontend dropdown, with no other backend change.
        if (order.PaymentStatus != "paid")
        {
            if (req.PaymentMethod != "cash")
                return BadRequest(new { message = "Only Cash on Delivery is supported today." });

            db.OrderPayments.Add(new OrderPayment
            {
                Id = Guid.NewGuid(), OrderId = order.Id, PaymentMethod = "cash",
                Amount = order.TotalAmount, Status = "pending", CreatedAt = DateTime.UtcNow,
            });
        }

        order.OrderStatus = "ready_to_deliver";
        order.ApprovedBy = CallerId();
        order.ApprovedAt = DateTime.UtcNow;
        order.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var (_, callerBranchId) = GetCallerContext();
        await audit.LogAsync("Approved online order", entityType: "Order", entityId: order.Id,
            userId: CallerId(), branchId: callerBranchId ?? order.BranchId, module: "Online Orders",
            details: $"{order.OrderNumber} approved for Cash on Delivery");

        // A lean projection, not the tracked entity — returning it raw risks pulling in
        // unloaded/partially-loaded navigations (see MIMONY-ORDERS-CREATE-RAWENTITY-001 on
        // OrdersController.Create, the same trap this avoids).
        return Ok(new { order.Id, order.OrderStatus, order.ApprovedAt });
    }

    [RequirePermission("Online Orders", PermAction.Approve)]
    [HttpPatch("{id:guid}/reject")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] RejectOnlineOrderRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Reason)) return BadRequest(new { message = "A rejection reason is required." });

        var order = await db.Orders.Include(o => o.Items).FirstOrDefaultAsync(o => o.Id == id && o.Source == "online");
        if (order is null) return NotFound(new { message = "Online order not found." });
        if (order.OrderStatus != "pending") return BadRequest(new { message = "Only a pending order can be rejected." });

        // A card-paid order can only be rejected together with its refund — never "cancelled but
        // we keep the money". The refund is requested at MyFatoorah first; if that fails the order
        // stays pending and the caller sees why, so staff can retry or handle it by hand.
        object? refundInfo = null;
        if (order.PaymentStatus == "paid")
        {
            var payment = await db.OnlinePayments.FirstOrDefaultAsync(p => p.OrderId == order.Id);
            if (payment is null)
                return BadRequest(new { message = "This order was paid online but its payment record can't be found — refund it from the MyFatoorah portal before rejecting." });
            var refund = await checkout.RefundAsync(payment, $"order {order.OrderNumber} rejected: {req.Reason.Trim()}", CallerId(), HttpContext.RequestAborted);
            if (!refund.Ok)
                return StatusCode(refund.StatusCode, new { message = $"Refund failed, so the order was NOT rejected: {refund.Message}" });
            refundInfo = new { refundId = refund.Value!.RefundId, refundReference = refund.Value.RefundReference };
        }

        var productIds = order.Items.Select(i => i.ProductId).Distinct().ToList();
        var stocks = (await db.InventoryStocks.Where(s => s.BranchId == order.BranchId).ToListAsync())
            .Where(s => productIds.Contains(s.ProductId))
            .ToDictionary(s => s.ProductId);
        foreach (var item in order.Items)
            if (stocks.TryGetValue(item.ProductId, out var stock))
            {
                stock.ReservedQuantity = Math.Max(0, stock.ReservedQuantity - item.Quantity);
                stock.UpdatedAt = DateTime.UtcNow;
            }

        order.OrderStatus = "cancelled";
        order.RejectionReason = req.Reason.Trim();
        order.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var (_, callerBranchId) = GetCallerContext();
        await audit.LogAsync("Rejected online order", entityType: "Order", entityId: order.Id,
            userId: CallerId(), branchId: callerBranchId ?? order.BranchId, module: "Online Orders",
            details: $"{order.OrderNumber}: {req.Reason.Trim()}{(refundInfo is not null ? " · refunded online payment" : "")}");

        return Ok(new { order.Id, order.OrderStatus, order.RejectionReason, order.PaymentStatus, refund = refundInfo });
    }

    [RequirePermission("Online Orders", PermAction.Edit)]
    [HttpPatch("{id:guid}/deliver")]
    public async Task<IActionResult> Deliver(Guid id)
    {
        var order = await db.Orders
            .Include(o => o.Items)
            .Include(o => o.Payments)
            .FirstOrDefaultAsync(o => o.Id == id && o.Source == "online");
        if (order is null) return NotFound(new { message = "Online order not found." });
        if (order.OrderStatus != "ready_to_deliver")
            return BadRequest(new { message = "Only an approved, ready-to-deliver order can be marked delivered." });

        var productIds = order.Items.Select(i => i.ProductId).Distinct().ToList();

        // Same "block a sale that would take on-hand stock negative" guard OrdersController.Create
        // applies to POS checkout — this delivery step had no equivalent at all, so an online order
        // could still be marked delivered (and stock.Quantity driven negative) even after other
        // sales had already consumed the stock it reserved at placement time. Branches that have
        // never saved a PosSettings row must still default to blocking, same as
        // OrdersController.Create — a null posSettings used to skip this check entirely. This is
        // just a fast pre-flight; the authoritative, race-safe check is the locked recheck below.
        var posSettings = await db.PosSettings.FirstOrDefaultAsync(s => s.BranchId == order.BranchId);
        var blockNegativeStock = !(posSettings?.AllowNegativeStock ?? false);
        if (blockNegativeStock)
        {
            var preStocks = (await db.InventoryStocks.Where(s => s.BranchId == order.BranchId).ToListAsync())
                .Where(s => productIds.Contains(s.ProductId))
                .ToDictionary(s => s.ProductId);
            foreach (var group in order.Items.GroupBy(i => i.ProductId))
            {
                var onHand = preStocks.TryGetValue(group.Key, out var s) ? s.Quantity : 0;
                var needed = group.Sum(i => i.Quantity);
                if (onHand - needed < 0)
                {
                    var product = await db.Products.FindAsync(group.Key);
                    return BadRequest(new { message = $"Cannot deliver — '{product?.Name ?? "an item"}' only has {onHand:0.##} on hand and this branch does not allow negative stock." });
                }
            }
        }

        // The ledger-writing step: convert the reservation into a real deduction and append the
        // StockMovement row in the same unit of work, same shape OrdersController.Create uses for
        // POS sales — this is the one place an online order actually leaves the shelf. Each
        // product's stock row is locked (SELECT ... FOR UPDATE) and the guard re-checked against
        // the locked, current quantity — without this, a concurrent delivery or POS sale racing
        // this one could both read the same pre-decrement on-hand figure and both deduct, still
        // landing stock negative even with the guard on. Same technique as
        // ZatcaService.SubmitInvoiceAsync's identity-row lock.
        await using var stockTx = await db.Database.BeginTransactionAsync();
        foreach (var group in order.Items.GroupBy(i => i.ProductId))
        {
            var stock = await db.InventoryStocks
                .FromSqlRaw("SELECT * FROM inventory_stock WHERE product_id = {0} AND branch_id = {1} FOR UPDATE", group.Key, order.BranchId)
                .FirstOrDefaultAsync();
            if (stock is null) continue;

            var needed = group.Sum(i => i.Quantity);
            if (blockNegativeStock && stock.Quantity - needed < 0)
            {
                var product = await db.Products.FindAsync(group.Key);
                return BadRequest(new { message = $"Cannot deliver — '{product?.Name ?? "an item"}' only has {stock.Quantity:0.##} on hand and this branch does not allow negative stock." });
            }

            foreach (var item in group)
            {
                var quantityBefore = stock.Quantity;
                stock.Quantity -= item.Quantity;
                stock.ReservedQuantity = Math.Max(0, stock.ReservedQuantity - item.Quantity);
                stock.LastUpdated = DateTime.UtcNow;
                stock.UpdatedAt = DateTime.UtcNow;

                stockMovements.Record(
                    item.ProductId, order.BranchId, warehouseId: null, movementType: "sale", quantity: -item.Quantity,
                    referenceType: "order", referenceId: order.Id, referenceNumber: order.OrderNumber,
                    quantityBefore: quantityBefore, quantityAfter: quantityBefore - item.Quantity);

                // Only the aggregate InventoryStock row above was ever kept in sync for a delivery —
                // same gap OrdersController.Create's POS sale path already closed, so an online
                // order's batch drill-down stayed "still full" after the stock it drew down actually
                // shipped. Best-effort, matching every other call site: never allowed to fail the
                // delivery itself.
                try { await batchConsumption.ConsumeFefoAsync(item.ProductId, order.BranchId, warehouseId: null, item.Quantity); }
                catch (Exception ex) { logger.LogError(ex, "Batch consumption failed after delivering order {OrderId}", order.Id); }
            }
        }

        order.OrderStatus = "delivered";
        order.PaymentStatus = "paid";
        order.UpdatedAt = DateTime.UtcNow;
        foreach (var payment in order.Payments) payment.Status = "completed";

        await db.SaveChangesAsync();
        await stockTx.CommitAsync();

        foreach (var productId in productIds)
        {
            try { await stockAlerts.CheckStockLevelAsync(productId, order.BranchId); }
            catch { /* best-effort, must never fail an otherwise-completed delivery */ }
        }

        var (_, callerBranchId) = GetCallerContext();
        await audit.LogAsync("Marked online order delivered", entityType: "Order", entityId: order.Id,
            userId: CallerId(), branchId: callerBranchId ?? order.BranchId, module: "Online Orders",
            details: $"{order.OrderNumber} delivered — stock deducted and ledger updated");

        return Ok(new { order.Id, order.OrderStatus, order.PaymentStatus });
    }
}
