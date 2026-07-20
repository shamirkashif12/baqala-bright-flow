using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/leaves")]
public class LeaveController(BaqalaDbContext db, IAuditService audit) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst("sub")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null;

    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    // Inclusive day count minus any holiday (tenant-wide or the employee's own branch) falling
    // within the range — FRD 9.2 "excluding holidays/off days where configured". Weekly-off-day
    // exclusion is not attempted here (would need the employee's active shift's WorkingDays).
    private async Task<int> ComputeTotalDaysAsync(DateOnly from, DateOnly to, Guid branchId)
    {
        var totalDays = to.DayNumber - from.DayNumber + 1;
        if (totalDays <= 0) return 0;

        var holidays = await db.Holidays
            .Where(h => h.Status == "active" && h.Date >= from && h.Date <= to && (h.BranchId == null || h.BranchId == branchId))
            .Select(h => h.Date)
            .ToListAsync();

        return Math.Max(0, totalDays - holidays.Distinct().Count());
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] Guid? branchId,
        [FromQuery] Guid? departmentId,
        [FromQuery] Guid? employeeId,
        [FromQuery] Guid? leaveTypeId,
        [FromQuery] string? status,
        [FromQuery] DateOnly? dateFrom,
        [FromQuery] DateOnly? dateTo)
    {
        var (callerRole, callerBranchId) = GetCallerContext();

        var query = db.LeaveRequests
            .Include(l => l.Employee).ThenInclude(e => e!.Department)
            .Include(l => l.LeaveType)
            .Include(l => l.Approver)
            .AsQueryable();

        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            query = query.Where(l => l.Employee!.BranchId == callerBranchId);
        else if (branchId.HasValue)
            query = query.Where(l => l.Employee!.BranchId == branchId);

        if (departmentId.HasValue) query = query.Where(l => l.Employee!.DepartmentId == departmentId);
        if (employeeId.HasValue) query = query.Where(l => l.EmployeeId == employeeId);
        if (leaveTypeId.HasValue) query = query.Where(l => l.LeaveTypeId == leaveTypeId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(l => l.Status == status);
        if (dateFrom.HasValue) query = query.Where(l => l.ToDate >= dateFrom);
        if (dateTo.HasValue) query = query.Where(l => l.FromDate <= dateTo);

        return Ok(await query.OrderByDescending(l => l.FromDate).ToListAsync());
    }

    [RequirePermission("Leave Management", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Apply([FromBody] ApplyLeaveRequest req)
    {
        var employee = await db.Employees.FindAsync(req.EmployeeId);
        if (employee is null) return NotFound(new { message = "Employee not found." });
        if (req.ToDate < req.FromDate) return BadRequest(new { message = "To Date cannot be before From Date." });

        // Overlapping-leave guard: block a new request that overlaps an existing pending/approved one.
        var overlapping = await db.LeaveRequests.AnyAsync(l =>
            l.EmployeeId == req.EmployeeId &&
            (l.Status == "pending" || l.Status == "approved") &&
            l.FromDate <= req.ToDate && l.ToDate >= req.FromDate);
        if (overlapping) return Conflict(new { message = "This employee already has a pending or approved leave request overlapping these dates." });

        var totalDays = await ComputeTotalDaysAsync(req.FromDate, req.ToDate, employee.BranchId);

        var leave = new LeaveRequest
        {
            Id = Guid.NewGuid(),
            EmployeeId = req.EmployeeId,
            LeaveTypeId = req.LeaveTypeId,
            FromDate = req.FromDate,
            ToDate = req.ToDate,
            TotalDays = totalDays,
            Reason = req.Reason,
            AttachmentUrl = req.AttachmentUrl,
            Status = "pending",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        db.LeaveRequests.Add(leave);
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Leave applied", entityType: "LeaveRequest", entityId: leave.Id,
            userId: CallerId(), branchId: employee.BranchId, details: $"{employee.FullName}: {req.FromDate}–{req.ToDate} ({totalDays}d)", module: "Leave Management", employeeId: employee.Id);

        return CreatedAtAction(nameof(GetAll), leave);
    }

    [RequirePermission("Leave Management", PermAction.Approve)]
    [HttpPost("{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id)
    {
        var leave = await db.LeaveRequests.Include(l => l.Employee).FirstOrDefaultAsync(l => l.Id == id);
        if (leave is null) return NotFound();
        if (leave.Status != "pending") return Conflict(new { message = "Only pending leave requests can be approved." });

        leave.Status = "approved";
        leave.ApproverId = CallerId();
        leave.ApprovedAt = DateTime.UtcNow;
        leave.UpdatedAt = DateTime.UtcNow;

        // Reflect the approved leave in Attendance as On Leave for each covered day that doesn't
        // already have a record — FRD 9.4. Written once at approval time rather than computed at
        // read time, so HrAttendanceController stays a plain query over StaffAttendance.
        var existingDates = await db.StaffAttendances
            .Where(a => a.EmployeeId == leave.EmployeeId && a.Date >= leave.FromDate && a.Date <= leave.ToDate)
            .Select(a => a.Date)
            .ToListAsync();
        var existingSet = existingDates.ToHashSet();

        for (var date = leave.FromDate; date <= leave.ToDate; date = date.AddDays(1))
        {
            if (existingSet.Contains(date)) continue;
            db.StaffAttendances.Add(new StaffAttendance
            {
                Id = Guid.NewGuid(),
                UserId = leave.Employee!.UserId,
                BranchId = leave.Employee.BranchId,
                EmployeeId = leave.EmployeeId,
                Date = date,
                Status = "on_leave",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            });
        }

        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Leave approved", entityType: "LeaveRequest", entityId: leave.Id,
            userId: CallerId(), branchId: leave.Employee.BranchId, details: $"{leave.Employee.FullName}: {leave.FromDate}–{leave.ToDate}", module: "Leave Management", employeeId: leave.EmployeeId);

        return Ok(leave);
    }

    [RequirePermission("Leave Management", PermAction.Approve)]
    [HttpPost("{id:guid}/reject")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] RejectLeaveRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.RejectionReason)) return BadRequest(new { message = "Rejection reason is required." });

        var leave = await db.LeaveRequests.Include(l => l.Employee).FirstOrDefaultAsync(l => l.Id == id);
        if (leave is null) return NotFound();
        if (leave.Status != "pending") return Conflict(new { message = "Only pending leave requests can be rejected." });

        leave.Status = "rejected";
        leave.ApproverId = CallerId();
        leave.ApprovedAt = DateTime.UtcNow;
        leave.RejectionReason = req.RejectionReason;
        leave.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Leave rejected", entityType: "LeaveRequest", entityId: leave.Id,
            userId: CallerId(), branchId: leave.Employee!.BranchId, notes: $"Reason: {req.RejectionReason}", module: "Leave Management", employeeId: leave.EmployeeId);

        return Ok(leave);
    }

    [RequirePermission("Leave Management", PermAction.Edit)]
    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id)
    {
        var leave = await db.LeaveRequests.FindAsync(id);
        if (leave is null) return NotFound();
        if (leave.Status != "pending") return Conflict(new { message = "Only pending leave requests can be cancelled." });

        leave.Status = "cancelled";
        leave.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Leave cancelled", entityType: "LeaveRequest", entityId: leave.Id, userId: CallerId(), module: "Leave Management", employeeId: leave.EmployeeId);

        return Ok(leave);
    }
}

public record ApplyLeaveRequest(Guid EmployeeId, Guid LeaveTypeId, DateOnly FromDate, DateOnly ToDate, string Reason, string? AttachmentUrl);
public record RejectLeaveRequest(string RejectionReason);
