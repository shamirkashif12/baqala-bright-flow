using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/hrm/attendance")]
public class HrAttendanceController(BaqalaDbContext db, IAuditService audit) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst("sub")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null;

    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    // Late/early-leave minutes from shift timing. Same-day comparison only — does not attempt
    // to handle a night shift's End time crossing midnight, kept simple for this pass.
    private static (int lateMinutes, int earlyLeaveMinutes) ComputeMinutes(WorkShift? shift, DateTime? checkIn, DateTime? checkOut)
    {
        if (shift is null) return (0, 0);
        int late = 0, early = 0;
        if (checkIn.HasValue && TimeSpan.TryParse(shift.StartTime, out var start))
        {
            var allowed = start + TimeSpan.FromMinutes(shift.GraceInMinutes);
            var diff = checkIn.Value.TimeOfDay - allowed;
            if (diff.TotalMinutes > 0) late = (int)Math.Ceiling(diff.TotalMinutes);
        }
        if (checkOut.HasValue && TimeSpan.TryParse(shift.EndTime, out var end))
        {
            var allowed = end - TimeSpan.FromMinutes(shift.GraceOutMinutes);
            var diff = allowed - checkOut.Value.TimeOfDay;
            if (diff.TotalMinutes > 0) early = (int)Math.Ceiling(diff.TotalMinutes);
        }
        return (late, early);
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] Guid? branchId,
        [FromQuery] Guid? departmentId,
        [FromQuery] Guid? employeeId,
        [FromQuery] Guid? shiftId,
        [FromQuery] string? status,
        [FromQuery] DateOnly? dateFrom,
        [FromQuery] DateOnly? dateTo)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            branchId = callerBranchId;

        var query = db.StaffAttendances
            .Include(a => a.Employee).ThenInclude(e => e!.Department)
            .Include(a => a.Employee).ThenInclude(e => e!.Designation)
            .Include(a => a.Shift)
            .Where(a => a.EmployeeId != null)
            .AsQueryable();

        if (branchId.HasValue) query = query.Where(a => a.BranchId == branchId);
        if (departmentId.HasValue) query = query.Where(a => a.Employee!.DepartmentId == departmentId);
        if (employeeId.HasValue) query = query.Where(a => a.EmployeeId == employeeId);
        if (shiftId.HasValue) query = query.Where(a => a.ShiftId == shiftId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(a => a.Status == status);
        if (dateFrom.HasValue) query = query.Where(a => a.Date >= dateFrom);
        if (dateTo.HasValue) query = query.Where(a => a.Date <= dateTo);

        var rows = await query.OrderByDescending(a => a.Date).ToListAsync();
        return Ok(rows);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var row = await db.StaffAttendances.Include(a => a.Employee).Include(a => a.Shift).FirstOrDefaultAsync(a => a.Id == id);
        return row is null ? NotFound() : Ok(row);
    }

    [RequirePermission("HR Attendance", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Mark([FromBody] MarkAttendanceRequest req)
    {
        var employee = await db.Employees.FindAsync(req.EmployeeId);
        if (employee is null) return NotFound(new { message = "Employee not found." });

        var exists = await db.StaffAttendances.AnyAsync(a => a.EmployeeId == req.EmployeeId && a.Date == req.Date);
        if (exists) return Conflict(new { message = "Attendance already recorded for this employee on this date. Use Manual Correction to update it." });

        WorkShift? shift = req.ShiftId.HasValue ? await db.WorkShifts.FindAsync(req.ShiftId.Value) : null;
        var (late, early) = ComputeMinutes(shift, req.CheckInTime, req.CheckOutTime);
        var status = req.Status;
        if (shift is not null && req.CheckInTime.HasValue && late > 0 && status == "present") status = "late";

        var attendance = new StaffAttendance
        {
            Id = Guid.NewGuid(),
            UserId = employee.UserId,
            BranchId = employee.BranchId,
            EmployeeId = employee.Id,
            Date = req.Date,
            ShiftId = req.ShiftId,
            CheckIn = req.CheckInTime,
            CheckOut = req.CheckOutTime,
            Status = status,
            LateMinutes = late,
            EarlyLeaveMinutes = early,
            Remarks = req.Remarks,
            RecordedBy = CallerId(),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        db.StaffAttendances.Add(attendance);
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Attendance marked", entityType: "StaffAttendance", entityId: attendance.Id,
            userId: CallerId(), branchId: employee.BranchId, details: $"Marked {status} for {employee.FullName} on {req.Date}", module: "HR Attendance", employeeId: employee.Id);

        return CreatedAtAction(nameof(GetById), new { id = attendance.Id }, attendance);
    }

    [RequirePermission("HR Attendance", PermAction.Edit)]
    [HttpPost("{id:guid}/correction")]
    public async Task<IActionResult> Correct(Guid id, [FromBody] AttendanceCorrectionRequest req)
    {
        var attendance = await db.StaffAttendances.Include(a => a.Employee).FirstOrDefaultAsync(a => a.Id == id);
        if (attendance is null) return NotFound();
        if (string.IsNullOrWhiteSpace(req.CorrectionReason)) return BadRequest(new { message = "Correction reason is required." });

        var before = $"CheckIn: {attendance.CheckIn:HH:mm}, CheckOut: {attendance.CheckOut:HH:mm}, Status: {attendance.Status}, Late: {attendance.LateMinutes}m, Early: {attendance.EarlyLeaveMinutes}m";

        WorkShift? shift = attendance.ShiftId.HasValue ? await db.WorkShifts.FindAsync(attendance.ShiftId.Value) : null;
        var (late, early) = ComputeMinutes(shift, req.CheckInTime ?? attendance.CheckIn, req.CheckOutTime ?? attendance.CheckOut);

        attendance.CheckIn = req.CheckInTime ?? attendance.CheckIn;
        attendance.CheckOut = req.CheckOutTime ?? attendance.CheckOut;
        attendance.Status = req.Status;
        attendance.LateMinutes = late;
        attendance.EarlyLeaveMinutes = early;
        attendance.Remarks = req.CorrectionNote ?? attendance.Remarks;
        attendance.RecordedBy = CallerId();
        attendance.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var after = $"CheckIn: {attendance.CheckIn:HH:mm}, CheckOut: {attendance.CheckOut:HH:mm}, Status: {attendance.Status}, Late: {attendance.LateMinutes}m, Early: {attendance.EarlyLeaveMinutes}m";

        await audit.LogAsync(action: "Attendance corrected", entityType: "StaffAttendance", entityId: attendance.Id,
            userId: CallerId(), branchId: attendance.BranchId, beforeValue: before, details: after,
            notes: $"Reason: {req.CorrectionReason}" + (req.CorrectionNote is null ? "" : $" — {req.CorrectionNote}"), module: "HR Attendance", employeeId: attendance.EmployeeId);

        return Ok(attendance);
    }
}

public record MarkAttendanceRequest(Guid EmployeeId, DateOnly Date, Guid? ShiftId, DateTime? CheckInTime, DateTime? CheckOutTime, string Status, string? Remarks);
public record AttendanceCorrectionRequest(DateTime? CheckInTime, DateTime? CheckOutTime, string Status, string CorrectionReason, string? CorrectionNote);
