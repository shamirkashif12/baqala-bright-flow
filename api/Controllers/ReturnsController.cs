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
        // Cap each line to what's actually still returnable on the original order item — the
        // ordered quantity minus whatever's already been claimed by a prior non-rejected return
        // for that same order item. Without this, the same invoice line could be fully returned
        // (refund + restock) more than once through this same endpoint.
        foreach (var item in ret.Items)
        {
            if (!item.OrderItemId.HasValue) continue;
            var orderItem = await db.OrderItems.FindAsync(item.OrderItemId.Value);
            if (orderItem is null) continue;

            var alreadyReturned = await db.CustomerReturnItems
                .Where(i => i.OrderItemId == item.OrderItemId && i.Return!.Status != "rejected")
                .SumAsync(i => i.Quantity);

            var remaining = orderItem.Quantity - alreadyReturned;
            if (item.Quantity > remaining)
                return BadRequest(new { message = $"Only {remaining} unit(s) of this item can still be returned ({alreadyReturned} already claimed by a prior return)." });
        }

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
            severity: "warning");

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
            beforeValue: beforeSnapshot);

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
