using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OrdersController(BaqalaDbContext db, IEmailService emailService, IZatcaService zatcaService, IAuditService audit, INotificationService notifications, IStockAlertService stockAlerts, IBatchConsumptionService batchConsumption, IStockMovementService stockMovements, ILogger<OrdersController> logger) : ControllerBase
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

    // FRD 16.1 "POS Actions" — the Employee Activity Report can only surface these rows if they
    // carry module/employeeId like every HRM audit call already does; POS-side actions predate
    // that addition and only ever passed userId.
    private async Task<Guid?> ResolveEmployeeIdAsync(Guid? userId) =>
        userId.HasValue ? (await db.Employees.Where(e => e.UserId == userId).Select(e => (Guid?)e.Id).FirstOrDefaultAsync()) : null;

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] Guid? branchId,
        [FromQuery] string? status,
        [FromQuery] string? paymentStatus,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue) branchId = callerBranchId;

        var query = db.Orders
            .Include(o => o.Branch)
            .Include(o => o.Cashier)
            .Include(o => o.Payments)
            .Include(o => o.Items)
            .AsQueryable();
        if (branchId.HasValue) query = query.Where(o => o.BranchId == branchId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(o => o.OrderStatus == status);
        if (!string.IsNullOrEmpty(paymentStatus)) query = query.Where(o => o.PaymentStatus == paymentStatus);
        if (from.HasValue) query = query.Where(o => o.CreatedAt >= from);
        if (to.HasValue) query = query.Where(o => o.CreatedAt <= to);

        // MIMONY-PII-ORDERS-CROSSBRANCH-001: id+fullName alone (the fix below) still named a
        // cashier who has since transferred to another branch — a branch-scoped viewer could see
        // WHO a no-longer-local cashier is by name. Hide the cashier entirely (not just its PII
        // fields) once their CURRENT branch differs from the caller's own; tenant_admin still
        // sees everyone, matching every other cross-branch exemption in this controller.
        var isAdmin = callerRole == "tenant_admin";
        var orders = await query.OrderByDescending(o => o.CreatedAt).Take(200)
            .Select(o => new
            {
                o.Id, o.OrderNumber, o.Source, o.BranchId, o.CustomerId, o.CashierId, o.TerminalId, o.ShiftId, o.CouponId,
                o.Subtotal, o.DiscountAmount, o.TaxAmount, o.CustomFeeAmount, o.TobaccoFeeAmount, o.TotalAmount,
                o.PaymentStatus, o.OrderStatus, o.Notes, o.ClientRequestId, o.VoidReason, o.CreatedAt, o.UpdatedAt,
                Branch = o.Branch == null ? null : new { o.Branch.Id, o.Branch.Name },
                Cashier = o.Cashier == null || (!isAdmin && callerBranchId.HasValue && o.Cashier.BranchId != callerBranchId)
                    ? null
                    : new { o.Cashier.Id, o.Cashier.FullName },
                Items = o.Items.Select(i => new { i.Id, i.ProductId, i.Quantity, i.UnitPrice, i.TotalPrice, i.DiscountAmount, i.TaxAmount, i.CustomFeeAmount, i.TobaccoFeeAmount }),
                Payments = o.Payments.Select(p => new { p.Id, p.PaymentMethod, p.Amount, p.ReferenceNumber, p.Status }),
            })
            .ToListAsync();
        return Ok(orders);
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
                o.Subtotal, o.DiscountAmount, o.TaxAmount, o.CustomFeeAmount, o.TobaccoFeeAmount, o.TotalAmount,
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
                    i.Id, i.ProductId, i.Quantity, i.UnitPrice, i.TotalPrice, i.DiscountAmount, i.TaxAmount, i.CustomFeeAmount, i.TobaccoFeeAmount,
                    Product = i.Product == null ? null : new { i.Product.Id, i.Product.Name, i.Product.Sku }
                }),
                Payments = o.Payments.Select(p => new { p.Id, p.PaymentMethod, p.Amount, p.ReferenceNumber, p.Status }),
            })
            .FirstOrDefaultAsync();
        if (order is null) return NotFound();

        // Branch-scoped roles may only look up an order from their own branch — mirrors GetAll's
        // filter, which this direct-by-id lookup previously bypassed entirely (any authenticated
        // caller could fetch any order, and its embedded cashier PII, given just its GUID).
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue && order.BranchId != callerBranchId)
            return NotFound();

        return Ok(order);
    }

    [HttpGet("by-number/{orderNumber}")]
    public async Task<IActionResult> GetByOrderNumber(string orderNumber)
    {
        var order = await db.Orders
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .Include(o => o.Payments)
            .Include(o => o.Customer)
            .Include(o => o.Branch)
            .FirstOrDefaultAsync(o => o.OrderNumber == orderNumber);
        if (order is null) return NotFound();

        // Same branch-scoping gap as GetById above — a direct order-number lookup previously
        // bypassed the caller's branch entirely.
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue && order.BranchId != callerBranchId)
            return NotFound();

        return Ok(order);
    }

    [RequirePermission("POS", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Order order)
    {
        // Idempotency: if the client already successfully created an order for this exact
        // checkout attempt (its response was lost to a network drop/timeout and it's retrying
        // the same Confirm click), return the existing order instead of creating a duplicate —
        // double stock decrement and double shift total for one real sale otherwise.
        if (order.ClientRequestId.HasValue)
        {
            var existing = await db.Orders
                .Include(o => o.Items).Include(o => o.Payments)
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

        // Block sale of expired items: if a product's only tracked batches at this
        // branch are expired, it cannot be sold — mirrors the "Block sale of expired
        // items" Rules Engine rule, enforced here since checkout must not rely solely
        // on client-side checks.
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
                var recalledBatchIds = recalls.Select(r => r.BatchId!.Value).ToList();
                var stillOnHand = await db.InventoryBatches
                    .Where(b => recalledBatchIds.Contains(b.Id) && b.BranchId == order.BranchId && b.RemainingQuantity > 0)
                    .Select(b => b.Id)
                    .ToListAsync();
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
        // FR-SLS-05: only the Cashier role's cash drawer needs shift reconciliation — shifts
        // are a Cashier-only concept in this system (see ShiftsController/CheckInDialog), so
        // Branch Manager/Supervisor covering a register deliberately check out without one.
        CashierShift? activeShift = null;
        string? checkoutWithoutShiftRole = null;
        if (order.CashierId.HasValue)
        {
            // A cashier should only ever have one open shift (ShiftsController.OpenShift rejects
            // opening a second one) — ordered defensively in case stale data still has more than
            // one, so a sale always binds to whichever shift the cashier most recently checked
            // into rather than an arbitrary row the database happens to return first.
            activeShift = await db.CashierShifts
                .Where(s => s.CashierId == order.CashierId && s.Status == "open")
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
                if (cashierUser?.Role?.Name == "Cashier")
                    return BadRequest(new { message = "No active shift found for this cashier — check in before processing sales." });

                // Elevated-role override taken — the sale proceeds with no ShiftId to
                // reconcile against, so log who did it (see audit entry after save below).
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
        // A sale is never blocked here (the sellable-stock/expiry check above already gated
        // that); instead the on-hand count is allowed to go negative when a sale outpaces what
        // was actually received. Clamping to 0 (the old behaviour) or silently doing nothing
        // when no stock row exists at all hid the shortfall — the next stock-in (Receive Batch/
        // PO receive) needs to see the true negative balance to reconcile against it.
        foreach (var item in order.Items)
        {
            // Branch-exact match only — the previous fallback to "any stock record for this
            // product" silently adjusted a DIFFERENT branch's stock row whenever the selling
            // branch had none, corrupting that other branch's inventory on every such sale.
            var stock = await db.InventoryStocks
                .FirstOrDefaultAsync(s => s.ProductId == item.ProductId && s.BranchId == order.BranchId);
            // Captured before the mutation — the ledger's before/after is the audit trail's only
            // record of on-hand either side of a sale. A product with no stock row yet was at 0.
            var quantityBefore = stock?.Quantity ?? 0;
            if (stock != null)
            {
                stock.Quantity -= item.Quantity;
                stock.LastUpdated = DateTime.UtcNow;
                stock.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                db.InventoryStocks.Add(new InventoryStock
                {
                    Id = Guid.NewGuid(),
                    ProductId = item.ProductId,
                    BranchId = order.BranchId,
                    Quantity = -item.Quantity,
                    LastUpdated = DateTime.UtcNow,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                });
            }

            stockMovements.Record(
                item.ProductId, order.BranchId, warehouseId: null, movementType: "sale", quantity: -item.Quantity,
                referenceType: "order", referenceId: order.Id, referenceNumber: order.OrderNumber,
                quantityBefore: quantityBefore, quantityAfter: quantityBefore - item.Quantity);
        }

        await db.SaveChangesAsync();

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
                module: "POS", employeeId: await ResolveEmployeeIdAsync(order.CashierId));
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
                module: "POS", employeeId: await ResolveEmployeeIdAsync(order.CashierId));
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
            db.ZatcaInvoices.Add(zatcaInvoice);
            await db.SaveChangesAsync();

            // Submitted synchronously (not fire-and-forget) so the checkout response — and thus
            // the printed receipt — carries the real ZATCA-signed QR code, not a client-side
            // approximation. A ZATCA failure must not fail the sale itself; the invoice is left
            // in whatever status SubmitInvoiceAsync set (e.g. "rejected") for later retry via
            // POST zatca/invoices/{id}/submit.
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
                        severity: "error", entityType: "ZatcaInvoice", entityId: zatcaInvoice.Id);
                }
                else
                {
                    await notifications.NotifyRoleAsync(["Admin"], order.BranchId,
                        "ZATCA", "ZATCA Invoice Generated", "ZATCA Invoice Generated",
                        "ZATCA invoice generated",
                        entityType: "ZatcaInvoice", entityId: zatcaInvoice.Id);
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "ZATCA submission failed for invoice {InvoiceId}", zatcaInvoice.Id);
                order.ZatcaInvoiceStatus = "pending";

                await notifications.NotifyRoleAsync(["Admin"], order.BranchId,
                    "ZATCA", "ZATCA Submission Failed", "ZATCA Submission Failed",
                    $"ZATCA submission failed for Invoice {order.OrderNumber}",
                    severity: "error", entityType: "ZatcaInvoice", entityId: zatcaInvoice.Id);
                await notifications.NotifyRoleAsync(["Admin"], order.BranchId,
                    "ZATCA", "ZATCA Pending Queue", "ZATCA Pending Queue",
                    $"Invoice {order.OrderNumber} pending ZATCA sync",
                    severity: "warning", entityType: "ZatcaInvoice", entityId: zatcaInvoice.Id);
            }
        }

        // ── Loyalty points: earn 1 point per SAR spent ────────────────────────
        if (order.CustomerId.HasValue)
        {
            const decimal PointsPerSar = 1m;
            var customer = await db.Customers.FindAsync(order.CustomerId.Value);
            if (customer != null)
            {
                var earned = Math.Floor(order.TotalAmount * PointsPerSar);
                if (earned > 0)
                {
                    customer.LoyaltyBalance += earned;
                    customer.TotalSpend += order.TotalAmount;
                    customer.Tier = customer.TotalSpend switch
                    {
                        >= 10000 => "platinum",
                        >= 5000  => "gold",
                        >= 1000  => "silver",
                        _        => "standard",
                    };
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
                        CreatedAt = DateTime.UtcNow,
                    });
                    await db.SaveChangesAsync();

                    if (order.CashierId.HasValue)
                    {
                        await notifications.NotifyUserAsync(order.CashierId.Value,
                            "Customer / Loyalty", "Loyalty Points Earned", "Loyalty Points Earned",
                            $"Customer earned {earned:F0} loyalty points",
                            entityType: "Order", entityId: order.Id, branchId: order.BranchId);
                    }
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

        return CreatedAtAction(nameof(GetById), new { id = order.Id }, order);
    }

    [RequirePermission("Orders", PermAction.Edit)]
    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateStatusRequest req)
    {
        var order = await db.Orders.FindAsync(id);
        if (order is null) return NotFound();

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
        if (order is null) return NotFound();
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

    // KSA tobacco excise: min 25 SAR OR 100% of base price per unit — mirrors calcTobaccoFee in
    // src/routes/_app.pos.tsx. Recomputed here (rather than carried over) whenever items are
    // edited, since quantities/lines/prices can all change including brand-new lines.
    private static decimal CalcTobaccoFee(decimal unitPrice) => unitPrice <= 25 ? 25 : unitPrice;

    // Order Editing (FR: "Edit orders from dashboard" — manager corrects mistakes, editable order
    // with audit log). Permission-gated only — a cashier without Orders:Edit simply cannot edit.
    // Scope: line items (qty/price/add/remove), notes, discount override, payment method (single-
    // payment orders only — split payments must be corrected via void + re-sale), and which
    // customer the order is attributed to.
    [RequirePermission("Orders", PermAction.Edit)]
    [HttpPatch("{id:guid}")]
    public async Task<IActionResult> EditOrder(Guid id, [FromBody] OrderEditRequest req)
    {
        if (req.Items.Count == 0) return BadRequest(new { message = "An order must have at least one line item." });

        var order = await db.Orders.Include(o => o.Items).Include(o => o.Payments).FirstOrDefaultAsync(o => o.Id == id);
        if (order is null) return NotFound();

        if (req.PaymentMethod is not null && order.Payments.Count > 1)
            return BadRequest(new { message = "This order has split payments — payment method can't be edited here." });

        var beforeSnapshot = System.Text.Json.JsonSerializer.Serialize(new
        {
            order.Subtotal,
            order.DiscountAmount,
            order.TaxAmount,
            order.TotalAmount,
            order.Notes,
            order.CustomerId,
            PaymentMethod = order.Payments.FirstOrDefault()?.PaymentMethod,
            Items = order.Items.Select(i => new { i.ProductId, i.Quantity, i.UnitPrice, i.TotalPrice }),
        });

        // Reconcile inventory by the delta between old and new quantity per product — mirrors the
        // decrement block in Create. Grouped by product first so a product simply changing
        // quantity (the common case) nets to one adjustment instead of a remove-then-re-add.
        var oldQtyByProduct = order.Items.GroupBy(i => i.ProductId).ToDictionary(g => g.Key, g => g.Sum(i => i.Quantity));
        var newQtyByProduct = req.Items.GroupBy(i => i.ProductId).ToDictionary(g => g.Key, g => g.Sum(i => i.Quantity));
        foreach (var productId in oldQtyByProduct.Keys.Union(newQtyByProduct.Keys))
        {
            var delta = newQtyByProduct.GetValueOrDefault(productId, 0m) - oldQtyByProduct.GetValueOrDefault(productId, 0m);
            if (delta == 0) continue;

            var stock = await db.InventoryStocks.FirstOrDefaultAsync(s => s.ProductId == productId && s.BranchId == order.BranchId);
            if (stock != null)
            {
                stock.Quantity -= delta;
                stock.LastUpdated = DateTime.UtcNow;
                stock.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                db.InventoryStocks.Add(new InventoryStock
                {
                    Id = Guid.NewGuid(),
                    ProductId = productId,
                    BranchId = order.BranchId,
                    Quantity = -delta,
                    LastUpdated = DateTime.UtcNow,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                });
            }
        }

        // Replace line items wholesale rather than diffing individual rows — OrderItem has no
        // dependents of its own besides Order, so this is safe and much simpler. This also covers
        // "adding items"/"modifying prices": a line with a new ProductId or a UnitPrice different
        // from the original is just another entry in req.Items, nothing special-cased.
        //
        // Looked up one product at a time rather than `productIds.Contains(p.Id)` — the MySQL EF
        // Core provider used here cannot assign a type mapping to a parameterized List<Guid>
        // IN-list (same constraint noted throughout ReportsController), which throws at query time.
        var productIds = req.Items.Select(i => i.ProductId).Distinct().ToList();
        var tobaccoFlags = new Dictionary<Guid, bool>();
        foreach (var pid in productIds)
            tobaccoFlags[pid] = await db.Products.Where(p => p.Id == pid).Select(p => p.IsTobacco).FirstOrDefaultAsync();

        db.OrderItems.RemoveRange(order.Items);
        var newItems = req.Items.Select(it =>
        {
            var totalPrice = it.Quantity * it.UnitPrice;
            var isTobacco = tobaccoFlags.GetValueOrDefault(it.ProductId);
            return new OrderItem
            {
                Id = Guid.NewGuid(),
                OrderId = order.Id,
                ProductId = it.ProductId,
                Quantity = it.Quantity,
                UnitPrice = it.UnitPrice,
                TotalPrice = totalPrice,
                TobaccoFeeAmount = isTobacco ? it.Quantity * CalcTobaccoFee(it.UnitPrice) : 0,
                CreatedAt = DateTime.UtcNow,
            };
        }).ToList();
        db.OrderItems.AddRange(newItems);

        // Recompute totals server-side from the new items — never trust a client-sent total.
        // Discount either carries over proportionally (capped to the new subtotal) or is replaced
        // outright when the caller explicitly sends an override (req.DiscountAmount).
        var newSubtotal = newItems.Sum(i => i.TotalPrice);
        var newTobaccoFee = newItems.Sum(i => i.TobaccoFeeAmount);
        var newDiscount = req.DiscountAmount.HasValue
            ? Math.Clamp(req.DiscountAmount.Value, 0, newSubtotal)
            : Math.Min(order.DiscountAmount, newSubtotal);

        // VAT is charged on (subtotal - discount + tobacco fee), not on subtotal alone (see
        // Create()) — so the rate must be derived from that same taxable base, not just Subtotal,
        // or a discounted/tobacco order's effective rate would be under/over-stated when re-applied
        // to the new totals below.
        var oldTaxableBase = order.Subtotal - order.DiscountAmount + order.TobaccoFeeAmount;
        var taxRate = oldTaxableBase > 0 ? order.TaxAmount / oldTaxableBase : 0m;
        var newTaxableBase = Math.Max(0, newSubtotal - newDiscount + newTobaccoFee);

        order.Subtotal = newSubtotal;
        order.DiscountAmount = newDiscount;
        order.TobaccoFeeAmount = newTobaccoFee;
        order.TaxAmount = Math.Round(newTaxableBase * taxRate, 2);
        order.TotalAmount = newSubtotal - newDiscount + order.TobaccoFeeAmount + order.TaxAmount + order.CustomFeeAmount;
        order.Notes = req.Notes;
        if (req.UpdateCustomer) order.CustomerId = req.CustomerId;
        order.UpdatedAt = DateTime.UtcNow;

        if (req.PaymentMethod is not null)
        {
            var payment = order.Payments.FirstOrDefault();
            if (payment is not null) payment.PaymentMethod = req.PaymentMethod;
        }

        await db.SaveChangesAsync();

        var afterSnapshot = System.Text.Json.JsonSerializer.Serialize(new
        {
            order.Subtotal,
            order.DiscountAmount,
            order.TaxAmount,
            order.TotalAmount,
            order.Notes,
            order.CustomerId,
            PaymentMethod = order.Payments.FirstOrDefault()?.PaymentMethod,
            Items = newItems.Select(i => new { i.ProductId, i.Quantity, i.UnitPrice, i.TotalPrice }),
        });
        await audit.LogAsync(
            action: "edit_order",
            entityType: "Order",
            entityId: order.Id,
            userId: CallerId(),
            branchId: order.BranchId,
            details: afterSnapshot,
            severity: "info",
            beforeValue: beforeSnapshot,
            module: "POS", employeeId: await ResolveEmployeeIdAsync(CallerId()));

        var updated = await db.Orders
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .Include(o => o.Payments)
            .Include(o => o.Customer)
            .FirstOrDefaultAsync(o => o.Id == id);
        return Ok(updated);
    }

    // Order void — permission-gated only, same as Edit above. A caller without Orders:Delete is
    // blocked outright; there is no flag-then-approve fallback.
    [RequirePermission("Orders", PermAction.Delete)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> VoidOrder(Guid id, [FromBody] OrderVoidRequest req)
    {
        var order = await db.Orders.Include(o => o.Items).Include(o => o.Payments).FirstOrDefaultAsync(o => o.Id == id);
        if (order is null) return NotFound();
        if (order.OrderStatus == "cancelled") return BadRequest(new { message = "This order is already cancelled." });

        var settings = await db.PosSettings.AsNoTracking().FirstOrDefaultAsync(s => s.BranchId == order.BranchId);
        if (settings?.RequireReasonForVoid == true && string.IsNullOrWhiteSpace(req.Reason))
            return BadRequest(new { message = "A reason is required to void this order." });

        var beforeSnapshot = System.Text.Json.JsonSerializer.Serialize(new { order.OrderStatus, order.PaymentStatus });
        await ApplyVoidAsync(order, req.Reason);

        await audit.LogAsync(
            action: "void_order",
            entityType: "Order",
            entityId: order.Id,
            userId: CallerId(),
            branchId: order.BranchId,
            details: $"{{\"orderNumber\":\"{order.OrderNumber}\",\"reason\":{System.Text.Json.JsonSerializer.Serialize(req.Reason)}}}",
            severity: "info",
            beforeValue: beforeSnapshot,
            notes: req.Reason,
            module: "POS", employeeId: await ResolveEmployeeIdAsync(CallerId()));

        return Ok(order);
    }

    private async Task ApplyVoidAsync(Order order, string? reason)
    {
        // Reverse inventory for every line — the items already left the shelf when the sale rang up.
        foreach (var item in order.Items)
        {
            var stock = await db.InventoryStocks.FirstOrDefaultAsync(s => s.ProductId == item.ProductId && s.BranchId == order.BranchId);
            if (stock != null)
            {
                stock.Quantity += item.Quantity;
                stock.LastUpdated = DateTime.UtcNow;
                stock.UpdatedAt = DateTime.UtcNow;
            }
        }

        // Best-effort, mirrors the same restore Create's ConsumeFefoAsync call needs undoing — without
        // this the specific batch a voided sale drew down never gets its RemainingQuantity (and
        // therefore its expiry visibility in the Inventory batch drill-down) back.
        foreach (var item in order.Items)
        {
            try { await batchConsumption.RestoreFefoAsync(item.ProductId, order.BranchId, warehouseId: null, item.Quantity); }
            catch (Exception ex) { logger.LogError(ex, "Batch restore failed for voided order {OrderId} product {ProductId}", order.Id, item.ProductId); }
        }

        // Reverse this order's contribution to its shift's running totals — otherwise a void
        // leaves CashSales/CardSales/DigitalSales/TotalSales overstated relative to the real
        // (now-cancelled) sale, the same class of reconciliation-variance bug as an order that
        // was never counted in the first place.
        if (order.ShiftId.HasValue)
        {
            var shift = await db.CashierShifts.FindAsync(order.ShiftId.Value);
            if (shift is not null)
            {
                foreach (var pay in order.Payments)
                {
                    switch (pay.PaymentMethod)
                    {
                        case "cash": shift.CashSales -= pay.Amount; break;
                        case "card": shift.CardSales -= pay.Amount; break;
                        default: shift.DigitalSales -= pay.Amount; break;
                    }
                    shift.TotalSales -= pay.Amount;
                }
            }
        }

        order.OrderStatus = "cancelled";
        order.VoidReason = reason;
        order.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }

    [RequirePermission("POS", PermAction.Create)]
    [HttpPost("{id:guid}/payments")]
    public async Task<IActionResult> AddPayment(Guid id, [FromBody] OrderPayment payment)
    {
        var order = await db.Orders.FindAsync(id);
        if (order is null) return NotFound();
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
