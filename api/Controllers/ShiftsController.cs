using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ShiftsController(BaqalaDbContext db, IAuditService audit, INotificationService notifications) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst("sub")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null;

    private string? CallerRole() => User.FindFirst("role")?.Value;

    // Branch-scoped roles (anything but tenant_admin) may only see their own branch's shift
    // data — same fix as BranchesController/ReportsController/TerminalsController. branchId was
    // only an optional query param; a call with none (e.g. the KPI page's Cashier tab) returned
    // every branch's cash totals, cashier identity, and terminal assignment regardless of role.
    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    // Reads the real, tenant-editable "Cash variance threshold" field from the
    // Opening/Closing Cash Policy tab (Settings → Policies & Conditions), so this
    // gate stays in sync with whatever a manager configures there. Only applied
    // when `RequireManagerApprovalAboveCashThreshold` is on; falls back to the
    // same 20 SAR default `PosSettings.CashVarianceThresholdSar` uses.
    private async Task<decimal?> GetCashVarianceThresholdAsync(Guid branchId)
    {
        var settings = await db.PosSettings.FirstOrDefaultAsync(s => s.BranchId == branchId);
        if (settings is null) return 20m;
        return settings.RequireManagerApprovalAboveCashThreshold ? settings.CashVarianceThresholdSar : null;
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
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            branchId = callerBranchId;

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
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            branchId = callerBranchId;

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

        // Cashier and Branch Manager accounts can hold a shift (FR-CHK-06: the Manager App
        // requires the same mandatory check-in + opening-cash flow as the Cashier POS).
        var cashierUser = await db.Users.Include(u => u.Role).FirstOrDefaultAsync(u => u.Id == req.CashierId);
        if (cashierUser is null || cashierUser.Role?.Name is not ("Cashier" or "Branch Manager" or "Manager"))
            return BadRequest("Only users with the Cashier or Branch Manager role can be checked in for a shift.");

        var existing = await db.CashierShifts
            .AnyAsync(s => s.CashierId == req.CashierId && s.Status == "open");
        if (existing) return Conflict("Cashier already has an open shift.");

        if (req.TerminalId.HasValue)
        {
            var terminalTaken = await db.CashierShifts
                .AnyAsync(s => s.TerminalId == req.TerminalId && s.Status == "open");
            if (terminalTaken)
            {
                if (callerId.HasValue)
                {
                    await notifications.NotifyUserAsync(callerId.Value,
                        "Terminal / Branch", "Terminal Shift Conflict", "Terminal Shift Conflict",
                        "Terminal already assigned to another cashier",
                        severity: "warning", entityType: "Terminal", entityId: req.TerminalId, branchId: req.BranchId);
                }
                return Conflict("This terminal already has an open shift with another cashier.");
            }
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

        // Opening a shift is this app's real-world equivalent of checking in for work — without
        // this, the Attendance/Shift report's "Check-in" column has nothing to match against and
        // shows "—" for every shift, since it can only match a shift to an attendance record that
        // already exists for the same cashier on the same calendar day.
        var today = now.Date;
        var hasAttendanceToday = await db.StaffAttendances
            .AnyAsync(a => a.UserId == req.CashierId && a.CheckIn != null && a.CheckIn >= today);
        if (!hasAttendanceToday)
        {
            db.StaffAttendances.Add(new StaffAttendance
            {
                Id = Guid.NewGuid(), UserId = req.CashierId, BranchId = req.BranchId,
                CheckIn = now, Status = "present",
            });
        }

        await db.SaveChangesAsync();

        await audit.LogAsync(
            action: "Shift opened",
            entityType: "CashierShift",
            entityId: shift.Id,
            userId: req.CashierId,
            branchId: req.BranchId,
            // Before Value shows the opening float the cashier was handed (e.g. SAR 500 default) —
            // without this it rendered as "—" even though the amount was captured on the shift itself.
            // After Value stays "—" (no `details`) at open time — there is no "after" state to
            // report yet; that only exists once the shift is actually closed.
            beforeValue: $"Opening Amount: SAR {req.OpeningAmount:F2}");

        // The doc's own example message ("Shift opened with SAR 500 opening cash") reads as a
        // confirmation to the cashier who just checked in, not just an FYI to their manager —
        // NotifyRoleAsync(["Manager","Admin"]) alone never includes the Cashier-role account.
        await notifications.NotifyUserAsync(req.CashierId,
            "Cashier Shift", "Shift Opened", "Shift Opened",
            $"Shift opened with SAR {req.OpeningAmount:F2} opening cash",
            entityType: "CashierShift", entityId: shift.Id, branchId: req.BranchId);
        await notifications.NotifyRoleAsync(["Manager", "Admin"], req.BranchId,
            "Cashier Shift", "Shift Opened", "Shift Opened",
            $"Shift opened with SAR {req.OpeningAmount:F2} opening cash",
            entityType: "CashierShift", entityId: shift.Id);

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

        // Closing someone ELSE's shift is a managerial action — requires the same "Cashier
        // Shifts" Approve permission the variance sign-off below already requires, not just
        // "any authenticated role that isn't a cashier." Previously this endpoint had no
        // permission check at all, so e.g. a Storekeeper (who can view this page but has no
        // Cashier-Shifts authority in the seeded matrix) could check out any other cashier's
        // shift. Closing your OWN shift (the common case) is unaffected.
        if (isManagerOverride && !await PermissionCheck.HasPermissionAsync(User, db, "Cashier Shifts", PermAction.Approve))
            return Forbid();

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

        var threshold = await GetCashVarianceThresholdAsync(shift.BranchId);
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
            // Before Value reflects the real field the shift started with (Opening Amount, from
            // cashier_shifts) rather than a generic "Status: Open" placeholder.
            beforeValue: $"Opening Amount: SAR {shift.OpeningAmount:F2}",
            details: $"Closing: SAR {req.ClosingAmount:F2} · Variance: SAR {shift.Variance:F2}" +
                      (shift.RequiresApproval ? " · Exceeds review threshold — pending manager approval" : ""),
            severity: severity);

        if (isManagerOverride)
        {
            var cashierName = (await db.Users.FindAsync(shift.CashierId))?.FullName ?? "Unknown cashier";
            await audit.LogAsync(
                action: "Shift closed on behalf of another cashier",
                entityType: "CashierShift",
                entityId: shift.Id,
                userId: actorId,
                branchId: shift.BranchId,
                beforeValue: $"Opening Amount: SAR {shift.OpeningAmount:F2}",
                details: $"Closed {cashierName}'s shift. Reason: {req.Reason}",
                severity: "warning");
        }

        if (shift.RequiresApproval)
        {
            await notifications.NotifyUserAsync(shift.CashierId,
                "Cashier Shift", "Cash Variance Alert", "Cash Variance Alert",
                $"Cash variance detected: SAR {varianceAbs:F2}",
                severity: "warning", entityType: "CashierShift", entityId: shift.Id, branchId: shift.BranchId);
            await notifications.NotifyRoleAsync(["Manager", "Admin"], shift.BranchId,
                "Cashier Shift", "Cash Variance Alert", "Cash Variance Alert",
                $"Cash variance detected: SAR {varianceAbs:F2} — pending manager approval",
                severity: "warning", entityType: "CashierShift", entityId: shift.Id);
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
