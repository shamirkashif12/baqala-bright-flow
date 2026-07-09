using System.Security.Claims;
using System.Text.RegularExpressions;
using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReturnsController(BaqalaDbContext db, INotificationService notifications) : ControllerBase
{
    // Reads the live "Manager approval — refund > SAR 100" Rules Engine threshold, mirroring
    // ShiftsController.GetCashVarianceThresholdAsync, so this gate stays in sync with whatever
    // a tenant admin configures there instead of a value baked into code. Falls back to 100 if
    // the rule is missing/inactive or its condition text has no parseable number.
    private async Task<decimal> GetManagerApprovalRefundThresholdAsync()
    {
        var rule = await db.RulesEngine.FirstOrDefaultAsync(r =>
            r.IsActive && r.RuleType == "approval" && r.RuleName.Contains("refund"));
        if (rule is null) return 100m;
        var match = Regex.Match(rule.RuleConfig ?? "", @"\d+(\.\d+)?");
        return match.Success && decimal.TryParse(match.Value, out var v) ? v : 100m;
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

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? branchId, [FromQuery] string? status)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            branchId = callerBranchId;

        var query = db.CustomerReturns.Include(r => r.Customer).Include(r => r.Order).AsQueryable();
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

        return CreatedAtAction(nameof(GetById), new { id = ret.Id }, ret);
    }

    [RequirePermission("Returns", PermAction.Approve)]
    [HttpPatch("{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ApproveReturnRequest req)
    {
        var ret = await db.CustomerReturns.FindAsync(id);
        if (ret is null) return NotFound();

        var role = User.FindFirst("role")?.Value;
        var threshold = await GetManagerApprovalRefundThresholdAsync();
        if (role == "cashier" && ret.RefundAmount > threshold)
            return StatusCode(403, new { message = $"Manager approval is required for refunds over SAR {threshold:F2}." });

        ret.Status = req.Approved ? "approved" : "rejected";
        var sub = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value;
        if (Guid.TryParse(sub, out var approver)) ret.ApprovedBy = approver;
        ret.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        if (ret.ProcessedBy.HasValue)
        {
            await notifications.NotifyUserAsync(ret.ProcessedBy.Value,
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

        ret.Status = "completed";
        ret.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        if (ret.ProcessedBy.HasValue)
        {
            await notifications.NotifyUserAsync(ret.ProcessedBy.Value,
                "Returns", "Return Completed", "Return Completed",
                $"Return {ret.ReturnNumber} completed successfully",
                entityType: "CustomerReturn", entityId: ret.Id, branchId: ret.BranchId);
            await notifications.NotifyUserAsync(ret.ProcessedBy.Value,
                "Payment", "Refund Processed", "Refund Processed",
                $"Refund completed for Invoice {ret.ReturnNumber}",
                entityType: "CustomerReturn", entityId: ret.Id, branchId: ret.BranchId);
        }

        return Ok(ret);
    }
}

public record ApproveReturnRequest(bool Approved, Guid? ApprovedBy = null);
