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
        [FromQuery] Guid[]? terminalId,
        [FromQuery] string[]? status,
        [FromQuery] DateTime? dateFrom,
        [FromQuery] DateTime? dateTo)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            branchId = callerBranchId;

        var query = db.CashierShifts.Include(s => s.Cashier).Include(s => s.Terminal).AsQueryable();
        if (branchId.HasValue)   query = query.Where(s => s.BranchId == branchId);
        if (cashierId.HasValue)  query = query.Where(s => s.CashierId == cashierId);
        if (dateFrom.HasValue) query = query.Where(s => s.OpenedAt >= dateFrom.Value);
        if (dateTo.HasValue)   query = query.Where(s => s.OpenedAt <= dateTo.Value.AddDays(1).AddTicks(-1));

        // terminalId/status are arrays (multi-select filters) — never `.Contains()` a Guid[]/
        // string[] directly against a DbSet-backed IQueryable on this repo's MySQL provider (see
        // the ef-mysql-inlist-gotcha memory: throws at execution time on 2+ values despite
        // compiling and passing a single-value smoke test). Materialize the entities first (the
        // single-value/date-range filters above run fine in SQL), filter the arrays in-memory,
        // then apply the shared projection via LINQ-to-Objects.
        var all = await query.OrderByDescending(s => s.OpenedAt).ToListAsync();
        IEnumerable<CashierShift> scoped = all;
        if (terminalId is { Length: > 0 })
            scoped = scoped.Where(s => s.TerminalId.HasValue && terminalId.Contains(s.TerminalId.Value));
        if (status is { Length: > 0 })
            scoped = scoped.Where(s => status.Contains(s.Status));
        return Ok(scoped.Select(ShiftProjection.Compile()).ToList());
    }

    [HttpGet("active")]
    public async Task<IActionResult> GetActiveShifts([FromQuery] Guid? branchId)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            branchId = callerBranchId;

        var query = db.CashierShifts.Where(s => s.Status == "open").Include(s => s.Cashier).Include(s => s.Terminal).AsQueryable();
        if (branchId.HasValue) query = query.Where(s => s.BranchId == branchId);
        return Ok(await query.Select(ShiftProjection).ToListAsync());
    }

    // Redacted the same way as GetAll/GetActiveShifts above — full Cashier User (email, username,
    // phone, status, last login) was embedded on every shift with no permission gate at all,
    // reachable even from a self-checkout kiosk token. Frontend only ever reads .cashier.fullName.
    private static readonly System.Linq.Expressions.Expression<Func<CashierShift, object>> ShiftProjection = s => new
    {
        s.Id, s.CashierId, s.TerminalId, s.BranchId,
        s.OpeningAmount, s.ClosingAmount, s.CashSales, s.CardSales, s.DigitalSales, s.TotalSales,
        s.Variance, s.Status, s.OpenedAt, s.ClosedAt, s.Notes, s.RequiresApproval, s.ApprovedBy, s.ApprovedAt,
        s.ClosedBy, s.CloseReason,
        Cashier = s.Cashier == null ? null : new { s.Cashier.Id, s.Cashier.FullName },
        Terminal = s.Terminal == null ? null : new { s.Terminal.Id, s.Terminal.TerminalCode, s.Terminal.Name },
    };

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var shift = await db.CashierShifts
            .Include(s => s.Cashier).Include(s => s.Terminal)
            .FirstOrDefaultAsync(s => s.Id == id);
        if (shift is null) return NotFound();

        // Branch-scoped roles may only look up their own branch's shift — mirrors GetAll/
        // GetActiveShifts, which this direct-by-id lookup previously bypassed entirely.
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue && shift.BranchId != callerBranchId)
            return NotFound();

        return Ok(new
        {
            shift.Id, shift.CashierId, shift.TerminalId, shift.BranchId,
            shift.OpeningAmount, shift.ClosingAmount, shift.CashSales, shift.CardSales, shift.DigitalSales, shift.TotalSales,
            shift.Variance, shift.Status, shift.OpenedAt, shift.ClosedAt, shift.Notes, shift.RequiresApproval, shift.ApprovedBy, shift.ApprovedAt,
            shift.ClosedBy, shift.CloseReason,
            Cashier = shift.Cashier == null ? null : new { shift.Cashier.Id, shift.Cashier.FullName },
            Terminal = shift.Terminal == null ? null : new { shift.Terminal.Id, shift.Terminal.TerminalCode, shift.Terminal.Name },
        });
    }

    [HttpPost("open")]
    public async Task<IActionResult> OpenShift([FromBody] OpenShiftRequest req)
    {
        // A cashier can only open their own shift — never someone else's.
        var callerId = CallerId();
        if (CallerRole() == "cashier" && callerId != req.CashierId)
            return Forbid();

        // Cashier and Branch Manager accounts can hold a shift (FR-CHK-06: the Manager App
        // requires the same mandatory check-in + opening-cash flow as the Cashier POS). Tenant
        // Administrator is included too — Superadmin accounts need to be able to check in/out
        // for testing and branch coverage, not just delegate to a Cashier/Manager account.
        // Normalized via RoleNormalizer instead of matching on raw Role.Name so this doesn't
        // silently drift from the "Admin"/"Tenant Administrator" aliasing used everywhere else.
        var cashierUser = await db.Users.Include(u => u.Role).FirstOrDefaultAsync(u => u.Id == req.CashierId);
        var cashierAppRole = cashierUser?.Role?.Name is { } roleName ? RoleNormalizer.ToAppRole(roleName) : null;
        if (cashierUser is null || cashierAppRole is not ("cashier" or "branch_manager" or "tenant_admin"))
            return BadRequest("Only Cashier, Branch Manager, or Tenant Administrator accounts can be checked in for a shift.");

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
        var shift = await db.CashierShifts.FirstOrDefaultAsync(s => s.Id == id && s.Status == "open");
        if (shift is null) return NotFound("Open shift not found.");

        // Previously had no permission check and no ownership/branch check at all — any
        // authenticated user could inject a cash movement into any cashier's open shift, any
        // branch. Mirrors CloseShift's isManagerOverride pattern above: the shift's own cashier
        // may record their own cash drop/pickup; anyone else needs Cashier Shifts Edit, and only
        // within their own branch (tenant_admin exempt).
        var actorId = CallerId();
        var isOwnShift = actorId.HasValue && actorId.Value == shift.CashierId;
        if (!isOwnShift)
        {
            var (callerRole, callerBranchId) = GetCallerContext();
            if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue && shift.BranchId != callerBranchId)
                return NotFound("Open shift not found.");
            if (!await PermissionCheck.HasPermissionAsync(User, db, "Cashier Shifts", PermAction.Edit))
                return Forbid();
        }

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
