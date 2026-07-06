using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ShiftsController(BaqalaDbContext db, IAuditService audit) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst("sub")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null;

    private string? CallerRole() => User.FindFirst("role")?.Value;

    // Reads the live "Cash variance > SAR 200" Rules Engine threshold so the
    // approval gate stays in sync with whatever a tenant admin configures there
    // instead of a value baked into code. Falls back to 200 if the rule is
    // missing/inactive or its condition text has no parseable number.
    private async Task<decimal?> GetCashVarianceThresholdAsync()
    {
        var rule = await db.RulesEngine.FirstOrDefaultAsync(r =>
            r.IsActive && r.RuleType == "approval" && r.RuleName.Contains("Cash variance"));
        if (rule is null) return null;
        var match = Regex.Match(rule.RuleConfig ?? "", @"\d+(\.\d+)?");
        return match.Success && decimal.TryParse(match.Value, out var v) ? v : 200m;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] Guid? branchId,
        [FromQuery] Guid? cashierId,
        [FromQuery] Guid? terminalId,
        [FromQuery] string? status,
        [FromQuery] DateTime? dateFrom,
        [FromQuery] DateTime? dateTo)
    {
        var query = db.CashierShifts.Include(s => s.Cashier).Include(s => s.Terminal).AsQueryable();
        if (branchId.HasValue)   query = query.Where(s => s.BranchId == branchId);
        if (cashierId.HasValue)  query = query.Where(s => s.CashierId == cashierId);
        if (terminalId.HasValue) query = query.Where(s => s.TerminalId == terminalId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(s => s.Status == status);
        if (dateFrom.HasValue) query = query.Where(s => s.OpenedAt >= dateFrom.Value);
        if (dateTo.HasValue)   query = query.Where(s => s.OpenedAt <= dateTo.Value.AddDays(1).AddTicks(-1));
        return Ok(await query.OrderByDescending(s => s.OpenedAt).ToListAsync());
    }

    [HttpGet("active")]
    public async Task<IActionResult> GetActiveShifts([FromQuery] Guid? branchId)
    {
        var query = db.CashierShifts.Where(s => s.Status == "open").Include(s => s.Cashier).AsQueryable();
        if (branchId.HasValue) query = query.Where(s => s.BranchId == branchId);
        return Ok(await query.ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var shift = await db.CashierShifts
            .Include(s => s.CashMovements)
            .FirstOrDefaultAsync(s => s.Id == id);
        return shift is null ? NotFound() : Ok(shift);
    }

    [HttpPost("open")]
    public async Task<IActionResult> OpenShift([FromBody] OpenShiftRequest req)
    {
        // A cashier can only open their own shift — never someone else's.
        var callerId = CallerId();
        if (CallerRole() == "cashier" && callerId != req.CashierId)
            return Forbid();

        // Only Cashier-role accounts can hold a shift at all, regardless of who's opening it.
        var cashierUser = await db.Users.Include(u => u.Role).FirstOrDefaultAsync(u => u.Id == req.CashierId);
        if (cashierUser is null || cashierUser.Role?.Name != "Cashier")
            return BadRequest("Only users with the Cashier role can be checked in for a shift.");

        var existing = await db.CashierShifts
            .AnyAsync(s => s.CashierId == req.CashierId && s.Status == "open");
        if (existing) return Conflict("Cashier already has an open shift.");

        if (req.TerminalId.HasValue)
        {
            var terminalTaken = await db.CashierShifts
                .AnyAsync(s => s.TerminalId == req.TerminalId && s.Status == "open");
            if (terminalTaken) return Conflict("This terminal already has an open shift with another cashier.");
        }

        var now = DateTime.UtcNow;
        var shift = new CashierShift
        {
            Id = Guid.NewGuid(), CashierId = req.CashierId,
            BranchId = req.BranchId, TerminalId = req.TerminalId,
            OpeningAmount = req.OpeningAmount, Status = "open",
            OpenedAt = now
        };
        db.CashierShifts.Add(shift);

        if (req.TerminalId.HasValue)
        {
            var terminal = await db.Terminals.FindAsync(req.TerminalId.Value);
            if (terminal != null) { terminal.LastSync = now; terminal.UpdatedAt = now; }
        }

        await db.SaveChangesAsync();

        await audit.LogAsync(
            action: "Shift opened",
            entityType: "CashierShift",
            entityId: shift.Id,
            userId: req.CashierId,
            branchId: req.BranchId,
            details: $"Opening amount: SAR {req.OpeningAmount:F2}");

        return Created($"/api/shifts/{shift.Id}", shift);
    }

    [HttpPost("{id:guid}/close")]
    public async Task<IActionResult> CloseShift(Guid id, [FromBody] CloseShiftRequest req)
    {
        var shift = await db.CashierShifts.FindAsync(id);
        if (shift is null) return NotFound();
        if (shift.Status == "closed") return BadRequest("Shift already closed.");

        var actorId = CallerId();

        // A cashier can close their own shift (end-of-day checkout is normal,
        // everyday cashier work) but never someone else's — closing another
        // cashier's shift is only allowed for non-cashier roles (admin, manager).
        if (CallerRole() == "cashier" && actorId != shift.CashierId) return Forbid();

        var isManagerOverride = actorId.HasValue && actorId.Value != shift.CashierId;
        if (isManagerOverride && string.IsNullOrWhiteSpace(req.Reason))
            return BadRequest(new { message = "A reason is required to close another cashier's shift." });

        var now = DateTime.UtcNow;
        shift.ClosingAmount = req.ClosingAmount;
        shift.Notes = req.Notes;
        shift.Status = "closed";
        shift.ClosedAt = now;
        shift.ClosedBy = actorId ?? shift.CashierId;
        shift.CloseReason = req.Reason;
        shift.Variance = req.ClosingAmount - (shift.OpeningAmount + shift.CashSales);

        var threshold = await GetCashVarianceThresholdAsync();
        var varianceAbs = Math.Abs(shift.Variance ?? 0);
        shift.RequiresApproval = threshold.HasValue && varianceAbs > threshold.Value;

        if (shift.TerminalId.HasValue)
        {
            var terminal = await db.Terminals.FindAsync(shift.TerminalId.Value);
            if (terminal != null) { terminal.LastSync = now; terminal.UpdatedAt = now; }
        }

        await db.SaveChangesAsync();

        var severity = shift.RequiresApproval ? "critical" : varianceAbs > 0 ? "warning" : "info";
        await audit.LogAsync(
            action: "Shift closed",
            entityType: "CashierShift",
            entityId: shift.Id,
            userId: shift.CashierId,
            branchId: shift.BranchId,
            details: $"Closing: SAR {req.ClosingAmount:F2} · Variance: SAR {shift.Variance:F2}" +
                      (shift.RequiresApproval ? " · Exceeds review threshold — pending manager approval" : ""),
            severity: severity);

        if (isManagerOverride)
        {
            await audit.LogAsync(
                action: "Shift closed on behalf of another cashier",
                entityType: "CashierShift",
                entityId: shift.Id,
                userId: actorId,
                branchId: shift.BranchId,
                details: $"Closed cashier {shift.CashierId}'s shift. Reason: {req.Reason}",
                severity: "warning");
        }

        return Ok(shift);
    }

    // Manager sign-off on a shift flagged for a cash-variance review.
    [RequirePermission("Cashier Shifts", PermAction.Approve)]
    [HttpPost("{id:guid}/approve-variance")]
    public async Task<IActionResult> ApproveVariance(Guid id)
    {
        var shift = await db.CashierShifts.FindAsync(id);
        if (shift is null) return NotFound();
        if (!shift.RequiresApproval) return BadRequest("This shift is not pending variance approval.");

        shift.RequiresApproval = false;
        shift.ApprovedBy = CallerId();
        shift.ApprovedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync(
            action: "Cash variance reviewed",
            entityType: "CashierShift",
            entityId: shift.Id,
            userId: shift.ApprovedBy,
            branchId: shift.BranchId,
            details: $"Variance SAR {shift.Variance:F2} reviewed and cleared.",
            severity: "warning");

        return Ok(shift);
    }

    [HttpPost("{id:guid}/cash-movements")]
    public async Task<IActionResult> AddCashMovement(Guid id, [FromBody] ShiftCashMovement movement)
    {
        if (!await db.CashierShifts.AnyAsync(s => s.Id == id && s.Status == "open"))
            return NotFound("Open shift not found.");
        movement.Id = Guid.NewGuid();
        movement.ShiftId = id;
        movement.CreatedAt = DateTime.UtcNow;
        db.ShiftCashMovements.Add(movement);
        await db.SaveChangesAsync();
        return Created($"/api/shifts/{id}/cash-movements/{movement.Id}", movement);
    }
}

public record OpenShiftRequest(Guid CashierId, Guid BranchId, Guid? TerminalId, decimal OpeningAmount);
public record CloseShiftRequest(decimal ClosingAmount, string? Notes, string? Reason);
