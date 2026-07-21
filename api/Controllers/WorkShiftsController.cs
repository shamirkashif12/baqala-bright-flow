using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/work-shifts")]
public class WorkShiftsController(BaqalaDbContext db, IAuditService audit) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst("sub")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null;

    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    // A "View" grant on HR Shifts only unlocks the caller's OWN shift assignment(s) — seeing the
    // full shift catalog/roster requires Approve or Edit (the module's manager-tier actions).
    // Without this, e.g. a Cashier (View-only by default) could see every branch's shift catalog.
    private async Task<bool> HasElevatedAccessAsync() =>
        await PermissionCheck.HasPermissionAsync(User, db, "HR Shifts", PermAction.Approve)
        || await PermissionCheck.HasPermissionAsync(User, db, "HR Shifts", PermAction.Edit);

    private async Task<Guid?> GetOwnEmployeeIdAsync(Guid? callerId) =>
        callerId.HasValue ? await db.Employees.Where(e => e.UserId == callerId).Select(e => (Guid?)e.Id).FirstOrDefaultAsync() : null;

    // FRD 18 suggested API `/api/hrm/shifts/assignments` — backs the Shifts module's "Effective
    // Date" filter (FRD 13.2): which shifts have a live assignment covering a given date.
    [RequirePermission("HR Shifts", PermAction.View)]
    [HttpGet("assignments")]
    public async Task<IActionResult> GetAssignments([FromQuery] string? status)
    {
        var query = db.EmployeeShiftAssignments.AsQueryable();
        if (!string.IsNullOrEmpty(status)) query = query.Where(a => a.Status == status);

        if (!await HasElevatedAccessAsync())
        {
            var ownEmployeeId = await GetOwnEmployeeIdAsync(CallerId());
            query = ownEmployeeId.HasValue ? query.Where(a => a.EmployeeId == ownEmployeeId) : query.Where(a => false);
        }

        var rows = await query.ToListAsync();
        return Ok(rows.Select(a => new { a.Id, a.EmployeeId, a.ShiftId, a.EffectiveFrom, a.EffectiveTo, a.Status }));
    }

    [RequirePermission("HR Shifts", PermAction.View)]
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] Guid? branchId, [FromQuery] Guid? departmentId, [FromQuery] string? status,
        [FromQuery] int? page, [FromQuery] int? pageSize)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            branchId = callerBranchId;

        var query = db.WorkShifts.Include(s => s.Branch).Include(s => s.Department).AsQueryable();
        // BranchId == null means the shift template applies to every branch ("All Branches" in
        // the UI) — a branch-scoped caller must still see those alongside their own branch's.
        if (branchId.HasValue) query = query.Where(s => s.BranchId == null || s.BranchId == branchId);
        if (departmentId.HasValue) query = query.Where(s => s.DepartmentId == departmentId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(s => s.Status == status);

        var shifts = await query.OrderBy(s => s.Name).ToListAsync();

        if (!await HasElevatedAccessAsync())
        {
            var ownEmployeeId = await GetOwnEmployeeIdAsync(CallerId());
            // Filtered in-memory rather than via ownShiftIds.Contains(s.Id) in the query — this
            // MySQL EF provider fails to type-map a List<Guid> used inside Contains() (see
            // DataSeeder.PatchRemoveTestBranchesAsync's comment for the same gotcha elsewhere).
            var ownShiftIds = ownEmployeeId.HasValue
                ? (await db.EmployeeShiftAssignments.Where(a => a.EmployeeId == ownEmployeeId && a.Status == "active")
                    .Select(a => a.ShiftId).ToListAsync()).ToHashSet()
                : new HashSet<Guid>();
            shifts = shifts.Where(s => ownShiftIds.Contains(s.Id)).ToList();
        }
        var assignedCounts = await db.EmployeeShiftAssignments
            .Where(a => a.Status == "active")
            .GroupBy(a => a.ShiftId)
            .Select(g => new { ShiftId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.ShiftId, x => x.Count);

        var projected = shifts.Select(s => new
        {
            s.Id, s.Name, s.BranchId, s.DepartmentId, s.WorkingDays, s.StartTime, s.EndTime,
            s.BreakStart, s.BreakEnd, s.GraceInMinutes, s.GraceOutMinutes, s.Status, s.CreatedAt, s.UpdatedAt,
            Branch = s.Branch == null ? null : new { s.Branch.Id, s.Branch.Name },
            Department = s.Department == null ? null : new { s.Department.Id, s.Department.Name },
            AssignedEmployees = assignedCounts.GetValueOrDefault(s.Id, 0),
        }).ToList();

        if (!page.HasValue && !pageSize.HasValue) return Ok(projected);
        var effectivePageSize = pageSize is > 0 and <= 200 ? pageSize.Value : 25;
        var effectivePage = page is > 0 ? page.Value : 1;
        return Ok(new { items = projected.Skip((effectivePage - 1) * effectivePageSize).Take(effectivePageSize), totalCount = projected.Count });
    }

    [RequirePermission("HR Shifts", PermAction.View)]
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var shift = await db.WorkShifts.Include(s => s.Branch).Include(s => s.Department).FirstOrDefaultAsync(s => s.Id == id);
        if (shift is null) return NotFound();

        if (!await HasElevatedAccessAsync())
        {
            var ownEmployeeId = await GetOwnEmployeeIdAsync(CallerId());
            var isOwnShift = ownEmployeeId.HasValue && await db.EmployeeShiftAssignments
                .AnyAsync(a => a.EmployeeId == ownEmployeeId && a.ShiftId == id && a.Status == "active");
            if (!isOwnShift) return NotFound();
        }

        return Ok(shift);
    }

    [RequirePermission("HR Shifts", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] WorkShift shift)
    {
        shift.Id = Guid.NewGuid();
        shift.CreatedAt = shift.UpdatedAt = DateTime.UtcNow;
        db.WorkShifts.Add(shift);
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Shift created", entityType: "WorkShift", entityId: shift.Id,
            userId: CallerId(), branchId: shift.BranchId, details: $"Created shift {shift.Name} ({shift.StartTime}-{shift.EndTime})", module: "HR Shifts");

        return CreatedAtAction(nameof(GetById), new { id = shift.Id }, shift);
    }

    [RequirePermission("HR Shifts", PermAction.Edit)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] WorkShift updated)
    {
        var shift = await db.WorkShifts.FindAsync(id);
        if (shift is null) return NotFound();

        shift.Name = updated.Name;
        shift.BranchId = updated.BranchId;
        shift.DepartmentId = updated.DepartmentId;
        shift.WorkingDays = updated.WorkingDays;
        shift.StartTime = updated.StartTime;
        shift.EndTime = updated.EndTime;
        shift.BreakStart = updated.BreakStart;
        shift.BreakEnd = updated.BreakEnd;
        shift.GraceInMinutes = updated.GraceInMinutes;
        shift.GraceOutMinutes = updated.GraceOutMinutes;
        shift.Status = updated.Status;
        shift.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Shift updated", entityType: "WorkShift", entityId: shift.Id,
            userId: CallerId(), branchId: shift.BranchId, details: $"Updated shift {shift.Name}", module: "HR Shifts");

        return Ok(shift);
    }

    [RequirePermission("HR Shifts", PermAction.Delete)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var shift = await db.WorkShifts.FindAsync(id);
        if (shift is null) return NotFound();
        shift.Status = "inactive";
        shift.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Shift deactivated", entityType: "WorkShift", entityId: shift.Id,
            userId: CallerId(), branchId: shift.BranchId, severity: "warning", module: "HR Shifts");

        return NoContent();
    }

    // Assigns one or more employees to this shift. Any existing active assignment for an
    // employee is closed (EffectiveTo = day before the new EffectiveFrom) rather than deleted,
    // so shift history is preserved — FRD 13.3.
    // FRD SHF-05 — an employee already holding an active assignment whose date range overlaps
    // the requested one is a conflict: block with 409 (listing what conflicts) unless the caller
    // passes Override=true, in which case the existing assignment is closed as before.
    [RequirePermission("HR Shifts", PermAction.Edit)]
    [HttpPost("{id:guid}/assign")]
    public async Task<IActionResult> Assign(Guid id, [FromBody] AssignShiftRequest req)
    {
        var shift = await db.WorkShifts.FindAsync(id);
        if (shift is null) return NotFound();
        if (req.EmployeeIds.Count == 0) return BadRequest(new { message = "Select at least one employee." });
        if (req.EffectiveTo.HasValue && req.EffectiveTo < req.EffectiveFrom)
            return BadRequest(new { message = "Effective To cannot be before Effective From." });

        var employeeIds = req.EmployeeIds.Distinct().ToList();
        // Per-id FindAsync rather than a Where(employeeIds.Contains(e.Id)) query — this MySQL EF
        // provider fails to type-map a List<Guid> used inside Contains() (see
        // DataSeeder.PatchRemoveTestBranchesAsync's comment for the same gotcha elsewhere).
        var employees = new Dictionary<Guid, string>();
        foreach (var employeeId in employeeIds)
        {
            var employee = await db.Employees.FindAsync(employeeId);
            if (employee is not null) employees[employeeId] = employee.FullName;
        }

        if (!req.Override)
        {
            var conflicts = new List<object>();
            foreach (var employeeId in employeeIds)
            {
                if (!employees.ContainsKey(employeeId)) continue;
                var overlapping = await db.EmployeeShiftAssignments
                    .Include(a => a.Shift)
                    .Where(a => a.EmployeeId == employeeId && a.Status == "active"
                        && a.EffectiveFrom <= (req.EffectiveTo ?? DateOnly.MaxValue)
                        && (a.EffectiveTo == null || a.EffectiveTo >= req.EffectiveFrom))
                    .ToListAsync();
                foreach (var o in overlapping)
                    conflicts.Add(new
                    {
                        employeeId, employeeName = employees[employeeId],
                        conflictingShift = o.Shift?.Name, effectiveFrom = o.EffectiveFrom, effectiveTo = o.EffectiveTo,
                    });
            }
            if (conflicts.Count > 0)
                return Conflict(new { message = "One or more employees already have an overlapping shift assignment.", conflicts });
        }

        var callerId = CallerId();
        var created = new List<EmployeeShiftAssignment>();

        foreach (var employeeId in employeeIds)
        {
            if (!employees.ContainsKey(employeeId)) continue;

            var activeAssignments = await db.EmployeeShiftAssignments
                .Where(a => a.EmployeeId == employeeId && a.Status == "active")
                .ToListAsync();
            foreach (var existing in activeAssignments)
            {
                existing.Status = "ended";
                existing.EffectiveTo = req.EffectiveFrom.AddDays(-1);
            }

            var assignment = new EmployeeShiftAssignment
            {
                Id = Guid.NewGuid(),
                EmployeeId = employeeId,
                ShiftId = id,
                EffectiveFrom = req.EffectiveFrom,
                EffectiveTo = req.EffectiveTo,
                Status = "active",
                AssignedBy = callerId,
                AssignedAt = DateTime.UtcNow,
            };
            db.EmployeeShiftAssignments.Add(assignment);
            created.Add(assignment);
        }

        await db.SaveChangesAsync();

        foreach (var a in created)
            await audit.LogAsync(action: "Shift assigned", entityType: "EmployeeShiftAssignment", entityId: a.Id,
                userId: callerId, details: $"Assigned employee to shift {shift.Name} effective {a.EffectiveFrom}", module: "HR Shifts", employeeId: a.EmployeeId);

        return Ok(new { assigned = created.Count });
    }
}

public record AssignShiftRequest(List<Guid> EmployeeIds, DateOnly EffectiveFrom, DateOnly? EffectiveTo, bool Override = false);
