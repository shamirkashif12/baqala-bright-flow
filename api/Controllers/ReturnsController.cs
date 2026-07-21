using System.Security.Claims;
using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReturnsController(
    BaqalaDbContext db,
    INotificationService notifications,
    IBatchConsumptionService batchConsumption,
    IStockMovementService stockMovements,
    IAuditService audit,
    ILogger<ReturnsController> logger) : ControllerBase
{
    // Reads the real, tenant-editable "Manager approval above (SAR)" field from the Returns
    // Policy tab (Settings → Policies & Conditions), so this gate stays in sync with whatever
    // a manager configures there instead of a value baked into code. Falls back to the same
    // 100 SAR default `PosSettings.ReturnManagerApprovalAboveSar` uses when no row exists yet.
    private async Task<decimal> GetManagerApprovalRefundThresholdAsync(Guid branchId)
    {
        var settings = await db.PosSettings.FirstOrDefaultAsync(s => s.BranchId == branchId);
        return settings?.ReturnManagerApprovalAboveSar ?? 100m;
    }

    // Branch-scoped roles (anything but tenant_admin) may only see their own branch's returns —
    // same fix as AuditLogsController/TerminalsController/DashboardController. branchId was only
    // an optional query param; a call with none (e.g. NotificationsPopover's pending-returns
    // count) returned every branch's returns regardless of caller role.
    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : null;

    // Branch-specific active program if one exists, else the one guaranteed business-wide default
    // (BranchId == null) — same resolver as LoyaltyController.ResolveEffectiveAsync and
    // OrdersController.ResolveLoyaltyProgramAsync, duplicated per-controller like GetCallerContext
    // above since this codebase has no shared service layer for per-entity logic.
    private async Task<LoyaltyProgram?> ResolveLoyaltyProgramAsync(Guid branchId) =>
        await db.LoyaltyPrograms.FirstOrDefaultAsync(p => p.BranchId == branchId && p.IsActive)
        ?? await db.LoyaltyPrograms.FirstOrDefaultAsync(p => p.BranchId == null && p.IsActive);

    // Tier (Standard/Silver/Gold/Platinum) is one field on Customer, shared across every branch —
    // thresholds/multipliers come ONLY from the business-wide default program, never from a
    // branch override, so the same customer can't be told they're a different tier depending on
    // which branch's numbers last touched them. See identical resolver in OrdersController.
    private async Task<LoyaltyProgram?> ResolveGlobalTierConfigAsync() =>
        await db.LoyaltyPrograms.FirstOrDefaultAsync(p => p.BranchId == null && p.IsActive);

    // FRD 16.1 "POS Actions" — see OrdersController's identical helper for why this is needed.
    private async Task<Guid?> ResolveEmployeeIdAsync(Guid? userId) =>
        userId.HasValue ? (await db.Employees.Where(e => e.UserId == userId).Select(e => (Guid?)e.Id).FirstOrDefaultAsync()) : null;

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? branchId, [FromQuery] string? status)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            branchId = callerBranchId;

        var query = db.CustomerReturns.Include(r => r.Customer).Include(r => r.Order).Include(r => r.Items).ThenInclude(i => i.Product).AsQueryable();
        if (branchId.HasValue) query = query.Where(r => r.BranchId == branchId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(r => r.Status == status);
        return Ok(await query.OrderByDescending(r => r.CreatedAt).ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var ret = await db.CustomerReturns
            .Include(r => r.Items).ThenInclude(i => i.Product)
            .Include(r => r.Customer)
            .FirstOrDefaultAsync(r => r.Id == id);
        return ret is null ? NotFound() : Ok(ret);
    }

    [RequirePermission("Returns", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CustomerReturn ret)
    {
        // All refund math below derives from the original order's own money figures.
        var order = await db.Orders.Include(o => o.Items).FirstOrDefaultAsync(o => o.Id == ret.OrderId);
        if (order is null) return BadRequest(new { message = "Original order for this return was not found." });

        // MIMONY-RETURNS-CUSTMISATTR-001: CustomerId was trusted verbatim from the client. The
        // frontend bug (switching orders within one open Returns sheet without resetting form
        // state) let a return against an anonymous/walk-in order get persisted with a real,
        // unrelated customer's id attached — fixed there too, but derive it here as well so no
        // other caller (or a future frontend regression) can misattribute a return again.
        ret.CustomerId = order.CustomerId;

        // MIMONY-RETURNS-VAT-001: RefundAmount was persisted exactly as the client sent it, and
        // the frontend sends flat qty × unitPrice — so the VAT the customer paid was never
        // refunded and any discount they received was never netted out. Recompute every line
        // server-side instead and ignore client-sent money figures: the returned units' base
        // price carries its prorated share of the order's discount, VAT and custom fees, plus
        // the line's own persisted tobacco excise. VAT is prorated by share of the order's
        // taxable base (subtotal − discount + tobacco fee, matching how checkout computed it),
        // so a full return of every line reconciles exactly to order.TotalAmount.
        var taxableBase = order.Subtotal - order.DiscountAmount + order.TobaccoFeeAmount;

        foreach (var item in ret.Items)
        {
            // Resolve the original order line — by id when the client linked one (an id that
            // belongs to a different order is rejected outright), else by product.
            var line = item.OrderItemId.HasValue
                ? order.Items.FirstOrDefault(oi => oi.Id == item.OrderItemId.Value)
                : order.Items.FirstOrDefault(oi => oi.ProductId == item.ProductId);
            if (item.OrderItemId.HasValue && line is null)
                return BadRequest(new { message = "Return line references an item that is not on this order." });
            if (line is null || line.Quantity <= 0) continue;
            item.OrderItemId ??= line.Id;

            // Cap each line to what's actually still returnable on the original order item — the
            // ordered quantity minus whatever's already been claimed by a prior non-rejected
            // return for that same order item. Without this, the same invoice line could be fully
            // returned (refund + restock) more than once through this same endpoint.
            var alreadyReturned = await db.CustomerReturnItems
                .Where(i => i.OrderItemId == line.Id && i.Return!.Status != "rejected")
                .SumAsync(i => i.Quantity);

            var remaining = line.Quantity - alreadyReturned;
            if (item.Quantity > remaining)
                return BadRequest(new { message = $"Only {remaining} unit(s) of this item can still be returned ({alreadyReturned} already claimed by a prior return)." });

            var lineBase = line.UnitPrice * item.Quantity;
            var baseShare = order.Subtotal > 0 ? lineBase / order.Subtotal : 0m;
            var discountShare = order.DiscountAmount * baseShare;
            var customFeeShare = order.CustomFeeAmount * baseShare;
            var tobaccoShare = line.TobaccoFeeAmount * (item.Quantity / line.Quantity);
            var lineTaxable = lineBase - discountShare + tobaccoShare;
            var taxShare = taxableBase > 0 ? order.TaxAmount * (lineTaxable / taxableBase) : 0m;

            item.UnitPrice = line.UnitPrice;
            item.RefundAmount = Math.Round(lineBase - discountShare + tobaccoShare + taxShare + customFeeShare, 4);
        }
        ret.RefundAmount = Math.Round(ret.Items.Sum(i => i.RefundAmount), 4);

        ret.Id = Guid.NewGuid();
        ret.ReturnNumber = $"RET-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}";
        ret.Status = "pending";
        ret.CreatedAt = ret.UpdatedAt = DateTime.UtcNow;
        foreach (var item in ret.Items) { item.Id = Guid.NewGuid(); item.ReturnId = ret.Id; }
        db.CustomerReturns.Add(ret);
        await db.SaveChangesAsync();

        if (ret.ProcessedBy.HasValue)
        {
            await notifications.NotifyUserAsync(ret.ProcessedBy.Value,
                "Returns", "Return Started", "Return Started",
                $"Return started for Invoice {ret.ReturnNumber}",
                entityType: "CustomerReturn", entityId: ret.Id, branchId: ret.BranchId);
        }

        await notifications.NotifyRoleAsync(["Manager", "Admin"], ret.BranchId,
            "Returns", "Return Approval Required", "Return Approval Required",
            $"Return {ret.ReturnNumber} requires approval (SAR {ret.RefundAmount:F2})",
            severity: "warning", entityType: "CustomerReturn", entityId: ret.Id);

        // Employee Audit Center — a refund is one of the listed employee actions and is attributed
        // to the cashier who raised it (ProcessedBy), which is who a manager reviews the trail for.
        await audit.LogAsync(
            action: "create_refund",
            entityType: "CustomerReturn",
            entityId: ret.Id,
            userId: ret.ProcessedBy ?? CallerId(),
            branchId: ret.BranchId,
            details: System.Text.Json.JsonSerializer.Serialize(new
            {
                ret.ReturnNumber, ret.OrderId, ret.ReturnType, ret.RefundMethod, ret.RefundAmount, ret.Reason, ret.Status,
                Items = ret.Items.Select(i => new { i.ProductId, i.Quantity, i.UnitPrice, i.RefundAmount, i.Condition }),
            }),
            severity: "warning",
            module: "Returns", employeeId: await ResolveEmployeeIdAsync(ret.ProcessedBy ?? CallerId()));

        return CreatedAtAction(nameof(GetById), new { id = ret.Id }, ret);
    }

    [RequirePermission("Returns", PermAction.Approve)]
    [HttpPatch("{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ApproveReturnRequest req)
    {
        var ret = await db.CustomerReturns.FindAsync(id);
        if (ret is null) return NotFound();

        var role = User.FindFirst("role")?.Value;
        var threshold = await GetManagerApprovalRefundThresholdAsync(ret.BranchId);
        if (role == "cashier" && ret.RefundAmount > threshold)
            return StatusCode(403, new { message = $"Manager approval is required for refunds over SAR {threshold:F2}." });

        var beforeSnapshot = System.Text.Json.JsonSerializer.Serialize(new { ret.Status, ret.ApprovedBy });

        ret.Status = req.Approved ? "approved" : "rejected";
        var sub = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value;
        if (Guid.TryParse(sub, out var approver)) ret.ApprovedBy = approver;
        ret.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        // Attributed to the approver (not ProcessedBy) — this row answers "who authorised this
        // refund", which is the accountability question the approval gate above exists to enforce.
        await audit.LogAsync(
            action: req.Approved ? "approve_refund" : "reject_refund",
            entityType: "CustomerReturn",
            entityId: ret.Id,
            userId: CallerId(),
            branchId: ret.BranchId,
            details: System.Text.Json.JsonSerializer.Serialize(new { ret.Status, ret.ApprovedBy, ret.RefundAmount, ret.ReturnNumber }),
            severity: "warning",
            beforeValue: beforeSnapshot,
            module: "Returns", employeeId: await ResolveEmployeeIdAsync(CallerId()));

        // Notify both the cashier who raised the return and the manager who acted on it.
        // Previously only ProcessedBy was notified (and only when set), so approving a return that
        // had no ProcessedBy surfaced no "Manager Approval Granted/Rejected" notification at all.
        var approvalRecipients = new List<Guid>();
        if (ret.ProcessedBy.HasValue) approvalRecipients.Add(ret.ProcessedBy.Value);
        if (CallerId() is { } approvalCaller) approvalRecipients.Add(approvalCaller);
        if (approvalRecipients.Count > 0)
        {
            await notifications.NotifyUsersAsync(approvalRecipients,
                "Admin / Security",
                req.Approved ? "Manager Approval Granted" : "Manager Approval Rejected",
                req.Approved ? "Manager Approval Granted" : "Manager Approval Rejected",
                req.Approved
                    ? $"Return {ret.ReturnNumber} was approved"
                    : $"Return {ret.ReturnNumber} was rejected",
                severity: req.Approved ? "info" : "warning",
                entityType: "CustomerReturn", entityId: ret.Id, branchId: ret.BranchId);
        }

        return Ok(ret);
    }

    [RequirePermission("Returns", PermAction.Approve)]
    [HttpPatch("{id:guid}/complete")]
    public async Task<IActionResult> Complete(Guid id)
    {
        var ret = await db.CustomerReturns.Include(r => r.Items).FirstOrDefaultAsync(r => r.Id == id);
        if (ret is null) return NotFound();
        if (ret.Status != "approved") return BadRequest("Only approved returns can be completed.");

        // Restock items that are in good condition and flagged for restock
        foreach (var item in ret.Items.Where(i => i.Restock && i.Condition == "good"))
        {
            var stock = await db.InventoryStocks
                .FirstOrDefaultAsync(s => s.ProductId == item.ProductId && s.BranchId == ret.BranchId);
            // A product with no stock row at this branch was at 0 before the restock.
            decimal quantityBefore = stock?.Quantity ?? 0;
            if (stock is not null)
            {
                stock.Quantity += item.Quantity;
                stock.LastUpdated = stock.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                db.InventoryStocks.Add(new InventoryStock
                {
                    Id = Guid.NewGuid(),
                    ProductId = item.ProductId,
                    BranchId = ret.BranchId,
                    Quantity = item.Quantity,
                    LastUpdated = DateTime.UtcNow,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                });
            }

            // This branch mutated stock but recorded no ledger row at all, so a restocked return
            // was invisible to the movement timeline and to the audit trail — units reappeared on
            // hand with nothing saying where from. The non-restocked branch below always logged.
            stockMovements.Record(
                item.ProductId, ret.BranchId, warehouseId: null, movementType: "return_restock", quantity: item.Quantity,
                referenceType: "customer_return", referenceId: ret.Id, referenceNumber: ret.ReturnNumber,
                notes: $"Customer return {ret.ReturnNumber} restocked: {ret.Reason}",
                createdBy: ret.ApprovedBy ?? CallerId(),
                quantityBefore: quantityBefore, quantityAfter: quantityBefore + item.Quantity);
        }

        // Items NOT restocked (damaged/expired/otherwise non-sellable) previously vanished with no
        // trace once the return completed: the sale had already removed them from on-hand stock,
        // and nothing here ever recorded WHY they never came back — no InventoryAdjustment (so the
        // Waste/Spoilage report, which reads AdjustmentType in waste/damage/expired, never saw
        // them) and no StockMovement (so the timeline showed nothing either). Quantity is 0 here
        // deliberately — on-hand stock was already debited by the original sale's movement, so
        // logging a second nonzero delta here would double-count the same units leaving stock.
        foreach (var item in ret.Items.Where(i => !(i.Restock && i.Condition == "good")))
        {
            var adjustmentType = item.Condition switch { "expired" => "expired", "damaged" => "damage", _ => "waste" };
            db.InventoryAdjustments.Add(new InventoryAdjustment
            {
                Id = Guid.NewGuid(),
                ProductId = item.ProductId,
                BranchId = ret.BranchId,
                AdjustmentType = adjustmentType,
                Quantity = item.Quantity,
                Reason = $"Customer return {ret.ReturnNumber}: {ret.Reason}",
                Notes = $"Condition: {item.Condition ?? "unspecified"} — not restocked",
                AdjustedBy = ret.ApprovedBy ?? CallerId(),
                CreatedAt = DateTime.UtcNow,
            });

            stockMovements.Record(
                item.ProductId, ret.BranchId, warehouseId: null, movementType: adjustmentType, quantity: 0,
                referenceType: "customer_return", referenceId: ret.Id, referenceNumber: ret.ReturnNumber,
                notes: $"Condition: {item.Condition ?? "unspecified"} — not restocked", createdBy: ret.ApprovedBy ?? CallerId());
        }

        ret.Status = "completed";
        ret.UpdatedAt = DateTime.UtcNow;

        // MIMONY-RETURNS-ORDERSTATUS-001: the Orders page's "quick refund" dialog used to mark
        // the order OrderStatus="refunded" immediately on submitting the return — before it had
        // even been approved. Since Create above always forces a new return to "pending", a
        // return that was later REJECTED left the order permanently mislabeled "refunded" with
        // no return to back it up. This is the only place a return actually finishes — flip the
        // order here instead, once it's genuinely approved and completed, never earlier.
        var order = await db.Orders.FindAsync(ret.OrderId);
        if (order is not null) order.OrderStatus = "refunded";

        // Reverse a proportional share of this order's loyalty activity — mirrors the full
        // reversal in OrdersController.ApplyVoidAsync, scaled by how much of the order this
        // return refunds, so several independent partial returns against the same order each
        // reverse only their own slice rather than double-counting.
        if (order is not null && order.CustomerId.HasValue && order.TotalAmount > 0)
        {
            var customer = await db.Customers.FindAsync(order.CustomerId.Value);
            if (customer != null)
            {
                var refundShare = Math.Min(1m, ret.RefundAmount / order.TotalAmount);
                var loyaltyTxns = await db.LoyaltyTransactions
                    .Where(t => t.OrderId == order.Id && (t.TransactionType == "earn" || t.TransactionType == "redeem"))
                    .ToListAsync();

                foreach (var txn in loyaltyTxns)
                {
                    var share = Math.Round(Math.Abs(txn.Points) * refundShare, 0, MidpointRounding.AwayFromZero);
                    if (share <= 0) continue;

                    decimal reversal;
                    decimal? monetaryValue = null;
                    if (txn.TransactionType == "earn")
                    {
                        // Clawback, clamped so the balance never goes negative if the customer
                        // already spent those points elsewhere since.
                        reversal = -Math.Min(share, customer.LoyaltyBalance);
                    }
                    else
                    {
                        reversal = share; // restore a share of the redeemed points
                        if (txn.MonetaryValue.HasValue && txn.Points != 0)
                            monetaryValue = Math.Round(txn.MonetaryValue.Value * (share / Math.Abs(txn.Points)), 4);
                    }
                    if (reversal == 0) continue;

                    customer.LoyaltyBalance += reversal;
                    db.LoyaltyTransactions.Add(new LoyaltyTransaction
                    {
                        Id = Guid.NewGuid(),
                        CustomerId = customer.Id,
                        OrderId = order.Id,
                        BranchId = order.BranchId,
                        TransactionType = "adjust",
                        Points = reversal,
                        BalanceAfter = customer.LoyaltyBalance,
                        MonetaryValue = monetaryValue,
                        Description = $"Reversal for return {ret.ReturnNumber}",
                        CreatedAt = DateTime.UtcNow,
                    });
                }

                customer.TotalSpend = Math.Max(0, customer.TotalSpend - ret.RefundAmount);
                var tierConfig = await ResolveGlobalTierConfigAsync();
                if (tierConfig != null)
                {
                    customer.Tier = customer.TotalSpend >= tierConfig.PlatinumThreshold ? "platinum"
                        : customer.TotalSpend >= tierConfig.GoldThreshold ? "gold"
                        : customer.TotalSpend >= tierConfig.SilverThreshold ? "silver"
                        : "standard";
                }
            }
        }

        await db.SaveChangesAsync();

        // Best-effort, after the transactional stock write above already succeeded — same
        // convention as IStockAlertService.CheckStockLevelAsync. Without this, a restocked return
        // only ever bumped the aggregate InventoryStock count; the specific batch the sale had
        // drawn down at checkout stayed at its post-sale RemainingQuantity forever, so it never
        // reappeared in the Inventory batch drill-down (which filters to remainingQuantity > 0) —
        // the "expiry shows — after a refund" symptom.
        foreach (var item in ret.Items.Where(i => i.Restock && i.Condition == "good"))
        {
            try { await batchConsumption.RestoreFefoAsync(item.ProductId, ret.BranchId, warehouseId: null, item.Quantity); }
            catch (Exception ex) { logger.LogError(ex, "Batch restore failed for return {ReturnId} product {ProductId}", ret.Id, item.ProductId); }
        }

        // Notify whoever completed the return (the caller who clicked Complete) as well as the
        // cashier who originally processed it. Previously only ProcessedBy was notified, so a
        // return created without a ProcessedBy (or completed by a different manager) surfaced no
        // "Return Completed"/"Refund Processed" notification to anyone — the reported gap.
        var recipients = new List<Guid>();
        if (CallerId() is { } caller) recipients.Add(caller);
        if (ret.ProcessedBy.HasValue) recipients.Add(ret.ProcessedBy.Value);
        if (recipients.Count > 0)
        {
            await notifications.NotifyUsersAsync(recipients,
                "Returns", "Return Completed", "Return Completed",
                $"Return {ret.ReturnNumber} completed successfully",
                entityType: "CustomerReturn", entityId: ret.Id, branchId: ret.BranchId);
            await notifications.NotifyUsersAsync(recipients,
                "Payment", "Refund Processed", "Refund Processed",
                $"Refund completed for Invoice {ret.ReturnNumber}",
                entityType: "CustomerReturn", entityId: ret.Id, branchId: ret.BranchId);
        }

        return Ok(ret);
    }
}

public record ApproveReturnRequest(bool Approved, Guid? ApprovedBy = null);
