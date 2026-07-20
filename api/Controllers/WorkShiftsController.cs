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

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? branchId, [FromQuery] Guid? departmentId, [FromQuery] string? status)
    {
        var query = db.WorkShifts.Include(s => s.Branch).Include(s => s.Department).AsQueryable();
        if (branchId.HasValue) query = query.Where(s => s.BranchId == branchId);
        if (departmentId.HasValue) query = query.Where(s => s.DepartmentId == departmentId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(s => s.Status == status);

        var shifts = await query.OrderBy(s => s.Name).ToListAsync();
        var assignedCounts = await db.EmployeeShiftAssignments
            .Where(a => a.Status == "active")
            .GroupBy(a => a.ShiftId)
            .Select(g => new { ShiftId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.ShiftId, x => x.Count);

        return Ok(shifts.Select(s => new
        {
            s.Id, s.Name, s.BranchId, s.DepartmentId, s.WorkingDays, s.StartTime, s.EndTime,
            s.BreakStart, s.BreakEnd, s.GraceInMinutes, s.GraceOutMinutes, s.Status, s.CreatedAt, s.UpdatedAt,
            Branch = s.Branch == null ? null : new { s.Branch.Id, s.Branch.Name },
            Department = s.Department == null ? null : new { s.Department.Id, s.Department.Name },
            AssignedEmployees = assignedCounts.GetValueOrDefault(s.Id, 0),
        }));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var shift = await db.WorkShifts.Include(s => s.Branch).Include(s => s.Department).FirstOrDefaultAsync(s => s.Id == id);
        return shift is null ? NotFound() : Ok(shift);
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
    [RequirePermission("HR Shifts", PermAction.Edit)]
    [HttpPost("{id:guid}/assign")]
    public async Task<IActionResult> Assign(Guid id, [FromBody] AssignShiftRequest req)
    {
        var shift = await db.WorkShifts.FindAsync(id);
        if (shift is null) return NotFound();
        if (req.EmployeeIds.Count == 0) return BadRequest(new { message = "Select at least one employee." });
        if (req.EffectiveTo.HasValue && req.EffectiveTo < req.EffectiveFrom)
            return BadRequest(new { message = "Effective To cannot be before Effective From." });

        var callerId = CallerId();
        var created = new List<EmployeeShiftAssignment>();

        foreach (var employeeId in req.EmployeeIds.Distinct())
        {
            var employeeExists = await db.Employees.AnyAsync(e => e.Id == employeeId);
            if (!employeeExists) continue;

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

public record AssignShiftRequest(List<Guid> EmployeeIds, DateOnly EffectiveFrom, DateOnly? EffectiveTo);
