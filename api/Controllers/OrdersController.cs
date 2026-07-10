using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OrdersController(BaqalaDbContext db, IEmailService emailService, IZatcaService zatcaService, IAuditService audit, INotificationService notifications, ILogger<OrdersController> logger) : ControllerBase
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
        return Ok(await query.OrderByDescending(o => o.CreatedAt).Take(200).ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var order = await db.Orders
            .Include(o => o.Items).ThenInclude(i => i.Product)
            .Include(o => o.Payments)
            .Include(o => o.Customer)
            .Include(o => o.Branch)
            .Include(o => o.Cashier)
            .FirstOrDefaultAsync(o => o.Id == id);
        return order is null ? NotFound() : Ok(order);
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
        return order is null ? NotFound() : Ok(order);
    }

    [RequirePermission("POS", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Order order)
    {
        // An order with a total but no line items is unauditable and fails ZATCA
        // itemised-invoice requirements — reject at the source rather than persist it.
        if (order.Items.Count == 0)
            return BadRequest(new { message = "An order must have at least one line item." });

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
        }

        await db.SaveChangesAsync();

        if (checkoutWithoutShiftRole is not null)
        {
            await audit.LogAsync(
                action: "Checkout without active shift (elevated-role override)",
                entityType: "Order",
                entityId: order.Id,
                userId: order.CashierId,
                branchId: order.BranchId,
                details: $"{checkoutWithoutShiftRole} completed order {order.OrderNumber} with no open shift — sale has no ShiftId to reconcile against.",
                severity: "warning");
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
        order.OrderStatus = req.Status;
        order.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(order);
    }

    [RequirePermission("POS", PermAction.Create)]
    [HttpPost("{id:guid}/payments")]
    public async Task<IActionResult> AddPayment(Guid id, [FromBody] OrderPayment payment)
    {
        if (!await db.Orders.AnyAsync(o => o.Id == id)) return NotFound();
        payment.Id = Guid.NewGuid();
        payment.OrderId = id;
        payment.CreatedAt = DateTime.UtcNow;
        db.OrderPayments.Add(payment);
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
