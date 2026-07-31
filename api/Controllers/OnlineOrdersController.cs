using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

public record OnlineOrderItemRequest(Guid ProductId, decimal Quantity);

public record PlaceOnlineOrderRequest(
    List<OnlineOrderItemRequest> Items, string FullName, string Phone, string? Email,
    string AddressLine, decimal? Latitude, decimal? Longitude, string? Notes);

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
    IAuditService audit) : ControllerBase
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

        return Ok(new
        {
            branchName = branch.Name,
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
    [HttpPost("public/{branchId:guid}/quote")]
    public async Task<IActionResult> QuotePublicOrder(Guid branchId, [FromBody] List<OnlineOrderItemRequest> items)
    {
        var (branch, _) = await ResolveOnlineOrderingBranchAsync(branchId);
        if (branch is null) return NotFound(new { message = "Online ordering isn't available for this branch." });
        if (items is not { Count: > 0 }) return BadRequest(new { message = "Your cart is empty." });

        var totals = await pricing.ComputeAsync(branchId, items.Select(i => (i.ProductId, i.Quantity)));
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
        });
    }

    [AllowAnonymous]
    [HttpPost("public/{branchId:guid}")]
    public async Task<IActionResult> PlacePublicOrder(Guid branchId, [FromBody] PlaceOnlineOrderRequest req)
    {
        var (branch, settings) = await ResolveOnlineOrderingBranchAsync(branchId);
        if (branch is null || settings is null)
            return NotFound(new { message = "Online ordering isn't available for this branch." });

        // Mirrors the checkout form's own client-side checks — re-validated here because this is a
        // fully anonymous endpoint and nothing from the client can be trusted.
        if (string.IsNullOrWhiteSpace(req.FullName) || req.FullName.Trim().Length < 2)
            return BadRequest(new { message = "Enter your full name." });
        if (string.IsNullOrWhiteSpace(req.AddressLine) || req.AddressLine.Trim().Length < 8)
            return BadRequest(new { message = "Enter a more detailed delivery address." });
        var phoneDigits = new string((req.Phone ?? "").Where(char.IsDigit).ToArray());
        if (phoneDigits.Length < 8) return BadRequest(new { message = "Enter a valid phone number." });
        if (!string.IsNullOrWhiteSpace(req.Email) &&
            !System.Text.RegularExpressions.Regex.IsMatch(req.Email.Trim(), @"^[^\s@]+@[^\s@]+\.[^\s@]+$"))
            return BadRequest(new { message = "Enter a valid email address, or leave it blank." });
        if (req.Items is not { Count: > 0 }) return BadRequest(new { message = "Your cart is empty." });

        // One stock row per requested product, fetched up front — for the initial eligibility
        // check below. Tobacco is allowed (see GetPublicCatalog's comment); AllowSelfCheckout still
        // gates other exclusions.
        var productIds = req.Items.Select(i => i.ProductId).Distinct().ToList();
        var stocks = (await db.InventoryStocks
                .Include(s => s.Product)
                .Where(s => s.BranchId == branchId)
                .ToListAsync())
            .Where(s => productIds.Contains(s.ProductId))
            .ToDictionary(s => s.ProductId);

        foreach (var item in req.Items)
        {
            if (!stocks.TryGetValue(item.ProductId, out var stock) || stock.Product is null ||
                stock.Product.Status != "active" || !stock.Product.AllowSelfCheckout)
                return BadRequest(new { message = "One or more items are no longer available." });
        }

        var totals = await pricing.ComputeAsync(branchId, req.Items.Select(i => (i.ProductId, i.Quantity)));
        if (totals.TotalAmount < settings.OnlineOrderingMinOrderAmountSar)
            return BadRequest(new { message = $"Minimum order amount is SAR {settings.OnlineOrderingMinOrderAmountSar:F2}." });
        if (totals.TotalAmount > settings.OnlineOrderingMaxOrderValueSar)
            return BadRequest(new { message = $"This order exceeds the maximum of SAR {settings.OnlineOrderingMaxOrderValueSar:F2} — please contact the branch directly." });

        // Combine paid + bonus quantities per product — a bogo/buy_a_get_b offer can add a bonus
        // line for a product the customer never directly requested (or add more of the SAME
        // product, e.g. "buy 3 get 1 free"), and availability/reservation both need to happen
        // against this combined figure, not just what was in the cart.
        var neededByProduct = totals.Items.GroupBy(i => i.ProductId).ToDictionary(g => g.Key, g => g.Sum(i => i.Quantity));
        var missingStockIds = neededByProduct.Keys.Except(stocks.Keys).ToList();
        if (missingStockIds.Count > 0)
        {
            var extra = (await db.InventoryStocks.Include(s => s.Product)
                    .Where(s => s.BranchId == branchId).ToListAsync())
                .Where(s => missingStockIds.Contains(s.ProductId));
            foreach (var s in extra) stocks[s.ProductId] = s;
        }

        foreach (var (productId, neededQty) in neededByProduct)
        {
            if (!stocks.TryGetValue(productId, out var stock) || stock.Product is null ||
                stock.Product.Status != "active" || !stock.Product.AllowSelfCheckout)
                return BadRequest(new { message = "One or more items are no longer available." });
            var available = stock.Quantity - stock.ReservedQuantity;
            if (available < neededQty)
                return BadRequest(new { message = $"Only {Math.Max(0, available):0.##} of '{stock.Product.Name}' is available." });
        }

        var order = new Order
        {
            Id = Guid.NewGuid(),
            OrderNumber = $"ORD-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}",
            Source = "online",
            BranchId = branchId,
            CustomerId = null,
            Subtotal = totals.Subtotal,
            TaxAmount = totals.TaxAmount,
            TobaccoFeeAmount = totals.TobaccoFeeAmount,
            CustomFeeAmount = totals.CustomFeeAmount,
            TotalAmount = totals.TotalAmount,
            PaymentStatus = "pending",
            OrderStatus = "pending",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        foreach (var line in totals.Items)
        {
            order.Items.Add(new OrderItem
            {
                Id = Guid.NewGuid(),
                OrderId = order.Id,
                ProductId = line.ProductId,
                Quantity = line.Quantity,
                UnitPrice = line.UnitPrice,
                TotalPrice = line.TotalPrice,
                TobaccoFeeAmount = line.TobaccoFeeAmount,
                CreatedAt = DateTime.UtcNow,
            });
        }
        foreach (var fee in totals.CustomFees)
        {
            order.ServiceCharges.Add(new OrderServiceCharge
            {
                Id = Guid.NewGuid(), OrderId = order.Id, TaxFeeRuleId = fee.TaxFeeRuleId,
                Name = fee.Name, Amount = fee.Amount, CreatedAt = DateTime.UtcNow,
            });
        }
        db.Orders.Add(order);
        db.OrderDeliveryDetails.Add(new OrderDeliveryDetail
        {
            OrderId = order.Id,
            FullName = req.FullName.Trim(),
            Phone = req.Phone.Trim(),
            Email = string.IsNullOrWhiteSpace(req.Email) ? null : req.Email.Trim(),
            AddressLine = req.AddressLine.Trim(),
            Latitude = req.Latitude,
            Longitude = req.Longitude,
            Notes = string.IsNullOrWhiteSpace(req.Notes) ? null : req.Notes.Trim(),
            CreatedAt = DateTime.UtcNow,
        });

        // Reserve, don't deduct — on-hand stock and the StockMovement ledger are only touched at
        // delivery (see Deliver below). A rejected/cancelled order simply releases the reservation.
        foreach (var (productId, neededQty) in neededByProduct)
        {
            var stock = stocks[productId];
            stock.ReservedQuantity += neededQty;
            stock.UpdatedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync();
        return Ok(new { order.OrderNumber, order.TotalAmount });
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
                o.Id, o.OrderNumber, o.BranchId, o.Subtotal, o.TaxAmount, o.TobaccoFeeAmount, o.CustomFeeAmount, o.TotalAmount,
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
        order.TotalAmount = order.Subtotal + order.TaxAmount;
        order.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
        return Ok(new { order.Id, order.Subtotal, order.TaxAmount, order.TotalAmount });
    }

    [RequirePermission("Online Orders", PermAction.Approve)]
    [HttpPatch("{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ApproveOnlineOrderRequest req)
    {
        var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == id && o.Source == "online");
        if (order is null) return NotFound(new { message = "Online order not found." });
        if (order.OrderStatus != "pending") return BadRequest(new { message = "Only a pending order can be approved." });

        // Cash on Delivery is the only option today — validated explicitly (rather than trusting
        // whatever the client sends) so a new method can be added later purely by extending this
        // check and the frontend dropdown, with no other backend change.
        if (req.PaymentMethod != "cash")
            return BadRequest(new { message = "Only Cash on Delivery is supported today." });

        order.OrderStatus = "ready_to_deliver";
        order.ApprovedBy = CallerId();
        order.ApprovedAt = DateTime.UtcNow;
        order.UpdatedAt = DateTime.UtcNow;
        db.OrderPayments.Add(new OrderPayment
        {
            Id = Guid.NewGuid(), OrderId = order.Id, PaymentMethod = "cash",
            Amount = order.TotalAmount, Status = "pending", CreatedAt = DateTime.UtcNow,
        });
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
            details: $"{order.OrderNumber}: {req.Reason.Trim()}");

        return Ok(new { order.Id, order.OrderStatus, order.RejectionReason });
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
