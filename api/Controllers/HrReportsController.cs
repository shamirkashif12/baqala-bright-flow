using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/hrm/reports")]
public class HrReportsController(BaqalaDbContext db, IAuditService audit) : ControllerBase
{
    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    /// <summary>Builds a CSV or PDF export file — same helper shape as ReportsController.BuildExportFile.</summary>
    private FileContentResult BuildExportFile(
        string? format, string title, string filterSummary,
        string[] headers, IReadOnlyList<object?[]> rows, string baseFileName)
    {
        if (string.Equals(format, "pdf", StringComparison.OrdinalIgnoreCase))
        {
            var pdfBytes = ReportPdfWriter.Write(title, filterSummary, [], headers, rows);
            return File(pdfBytes, "application/pdf", $"{baseFileName}.pdf");
        }
        var csvBytes = CsvWriter.Write(headers, rows);
        return File(csvBytes, "text/csv", $"{baseFileName}.csv");
    }

    // ─── Attendance Report ────────────────────────────────────────────────────
    private async Task<List<StaffAttendance>> BuildAttendanceReportAsync(
        Guid? branchId, Guid? departmentId, Guid? employeeId, Guid? shiftId, string? status, DateOnly? dateFrom, DateOnly? dateTo)
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

        return await query.OrderByDescending(a => a.Date).ToListAsync();
    }

    [RequirePermission("Reports", PermAction.View)]
    [HttpGet("attendance")]
    public async Task<IActionResult> GetAttendanceReport(
        [FromQuery] Guid? branchId, [FromQuery] Guid? departmentId, [FromQuery] Guid? employeeId, [FromQuery] Guid? shiftId,
        [FromQuery] string? status, [FromQuery] DateOnly? dateFrom, [FromQuery] DateOnly? dateTo)
    {
        var rows = await BuildAttendanceReportAsync(branchId, departmentId, employeeId, shiftId, status, dateFrom, dateTo);
        return Ok(rows);
    }

    [RequirePermission("Reports", PermAction.Export)]
    [HttpGet("attendance/export")]
    public async Task<IActionResult> ExportAttendanceReport(
        [FromQuery] Guid? branchId, [FromQuery] Guid? departmentId, [FromQuery] Guid? employeeId, [FromQuery] Guid? shiftId,
        [FromQuery] string? status, [FromQuery] DateOnly? dateFrom, [FromQuery] DateOnly? dateTo, [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var rows = await BuildAttendanceReportAsync(branchId, departmentId, employeeId, shiftId, status, dateFrom, dateTo);
        var headers = new[] { "Date", "Employee", "Employee ID", "Branch", "Department", "Shift", "Check-In", "Check-Out", "Status", "Late (min)", "Early Leave (min)", "Remarks" };
        var exportRows = rows.Select(a => new object?[]
        {
            a.Date?.ToString("yyyy-MM-dd"), a.Employee?.FullName, a.Employee?.EmployeeCode, a.BranchId, a.Employee?.Department?.Name,
            a.Shift?.Name, a.CheckIn?.ToString("HH:mm"), a.CheckOut?.ToString("HH:mm"), a.Status, a.LateMinutes, a.EarlyLeaveMinutes, a.Remarks,
        }).ToList();

        await audit.LogAsync(action: "Report exported", entityType: "Report", userId: exportedBy, branchId: branchId,
            details: $"{{\"report\":\"attendance\",\"format\":\"{format}\",\"rows\":{rows.Count}}}", module: "HR Attendance");

        return BuildExportFile(format, "Attendance Report", $"Records: {rows.Count}", headers, exportRows, $"attendance-report-{DateTime.UtcNow:yyyy-MM-dd}");
    }

    // ─── Shift Closing Report ──────────────────────────────────────────────────
    // Derives a per-day closing status from the same StaffAttendance rows the Attendance module
    // writes — "Manually Closed" when the row was touched by Manual Correction (RecordedBy set).
    private static string ClosingStatus(StaffAttendance a, DateOnly today)
    {
        if (a.Status is "absent" or "on_leave" or "holiday") return "Not Applicable";
        if (a.CheckOut is not null) return a.RecordedBy is not null ? "Manually Closed" : "Closed";
        if (a.Date == today) return "Open";
        return "Checkout Missing";
    }

    private async Task<List<StaffAttendance>> BuildShiftClosingReportAsync(
        Guid? branchId, Guid? departmentId, Guid? employeeId, Guid? shiftId, string? closingStatus, DateOnly? dateFrom, DateOnly? dateTo)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            branchId = callerBranchId;

        var query = db.StaffAttendances
            .Include(a => a.Employee).ThenInclude(e => e!.Department)
            .Include(a => a.Shift)
            .Include(a => a.RecordedByUser)
            .Where(a => a.EmployeeId != null)
            .AsQueryable();

        if (branchId.HasValue) query = query.Where(a => a.BranchId == branchId);
        if (departmentId.HasValue) query = query.Where(a => a.Employee!.DepartmentId == departmentId);
        if (employeeId.HasValue) query = query.Where(a => a.EmployeeId == employeeId);
        if (shiftId.HasValue) query = query.Where(a => a.ShiftId == shiftId);
        if (dateFrom.HasValue) query = query.Where(a => a.Date >= dateFrom);
        if (dateTo.HasValue) query = query.Where(a => a.Date <= dateTo);

        var rows = await query.OrderByDescending(a => a.Date).ToListAsync();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        if (!string.IsNullOrEmpty(closingStatus))
            rows = rows.Where(a => ClosingStatus(a, today) == closingStatus).ToList();
        return rows;
    }

    [RequirePermission("Reports", PermAction.View)]
    [HttpGet("shift-closing")]
    public async Task<IActionResult> GetShiftClosingReport(
        [FromQuery] Guid? branchId, [FromQuery] Guid? departmentId, [FromQuery] Guid? employeeId, [FromQuery] Guid? shiftId,
        [FromQuery] string? closingStatus, [FromQuery] DateOnly? dateFrom, [FromQuery] DateOnly? dateTo)
    {
        var rows = await BuildShiftClosingReportAsync(branchId, departmentId, employeeId, shiftId, closingStatus, dateFrom, dateTo);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        return Ok(rows.Select(a => new
        {
            a.Id, a.Date, a.EmployeeId,
            Employee = a.Employee == null ? null : new { a.Employee.Id, a.Employee.FullName, a.Employee.EmployeeCode },
            Department = a.Employee?.Department?.Name,
            a.BranchId,
            Shift = a.Shift == null ? null : new { a.Shift.Id, a.Shift.Name, a.Shift.StartTime, a.Shift.EndTime },
            ScheduledStart = a.Shift?.StartTime, ScheduledEnd = a.Shift?.EndTime,
            ActualCheckIn = a.CheckIn, ActualCheckOut = a.CheckOut,
            ClosingStatus = ClosingStatus(a, today),
            ClosedBy = a.RecordedByUser?.FullName,
            ClosingTime = a.CheckOut,
            a.Remarks,
        }));
    }

    [RequirePermission("Reports", PermAction.Export)]
    [HttpGet("shift-closing/export")]
    public async Task<IActionResult> ExportShiftClosingReport(
        [FromQuery] Guid? branchId, [FromQuery] Guid? departmentId, [FromQuery] Guid? employeeId, [FromQuery] Guid? shiftId,
        [FromQuery] string? closingStatus, [FromQuery] DateOnly? dateFrom, [FromQuery] DateOnly? dateTo, [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var rows = await BuildShiftClosingReportAsync(branchId, departmentId, employeeId, shiftId, closingStatus, dateFrom, dateTo);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var headers = new[] { "Date", "Employee", "Employee ID", "Department", "Shift", "Scheduled Start", "Scheduled End", "Actual Check-In", "Actual Check-Out", "Closing Status", "Closed By", "Remarks" };
        var exportRows = rows.Select(a => new object?[]
        {
            a.Date?.ToString("yyyy-MM-dd"), a.Employee?.FullName, a.Employee?.EmployeeCode, a.Employee?.Department?.Name, a.Shift?.Name,
            a.Shift?.StartTime, a.Shift?.EndTime, a.CheckIn?.ToString("HH:mm"), a.CheckOut?.ToString("HH:mm"), ClosingStatus(a, today), a.RecordedByUser?.FullName, a.Remarks,
        }).ToList();

        await audit.LogAsync(action: "Report exported", entityType: "Report", userId: exportedBy, branchId: branchId,
            details: $"{{\"report\":\"shift-closing\",\"format\":\"{format}\",\"rows\":{rows.Count}}}", module: "HR Shifts");

        return BuildExportFile(format, "Shift Closing Report", $"Records: {rows.Count}", headers, exportRows, $"shift-closing-report-{DateTime.UtcNow:yyyy-MM-dd}");
    }

    // ─── Employee Activity Report ──────────────────────────────────────────────
    private async Task<List<AuditLog>> BuildActivityReportAsync(
        Guid? branchId, Guid? employeeId, string? module, string? activityType, Guid? performedBy, string? referenceId, DateTime? dateFrom, DateTime? dateTo)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            branchId = callerBranchId;

        var query = db.AuditLogs.Include(a => a.User).Include(a => a.Employee).AsQueryable();
        if (branchId.HasValue) query = query.Where(a => a.BranchId == branchId);
        if (employeeId.HasValue) query = query.Where(a => a.EmployeeId == employeeId);
        if (!string.IsNullOrEmpty(module)) query = query.Where(a => a.Module == module);
        if (!string.IsNullOrEmpty(activityType)) query = query.Where(a => a.Action.Contains(activityType));
        if (performedBy.HasValue) query = query.Where(a => a.UserId == performedBy);
        if (!string.IsNullOrEmpty(referenceId) && Guid.TryParse(referenceId, out var refGuid)) query = query.Where(a => a.EntityId == refGuid);
        if (dateFrom.HasValue) query = query.Where(a => a.CreatedAt >= dateFrom);
        if (dateTo.HasValue) query = query.Where(a => a.CreatedAt <= dateTo);

        return await query.OrderByDescending(a => a.CreatedAt).Take(1000).ToListAsync();
    }

    [RequirePermission("Audit Logs", PermAction.View)]
    [HttpGet("employee-activity")]
    public async Task<IActionResult> GetActivityReport(
        [FromQuery] Guid? branchId, [FromQuery] Guid? employeeId, [FromQuery] string? module, [FromQuery] string? activityType,
        [FromQuery] Guid? performedBy, [FromQuery] string? referenceId, [FromQuery] DateTime? dateFrom, [FromQuery] DateTime? dateTo)
    {
        var rows = await BuildActivityReportAsync(branchId, employeeId, module, activityType, performedBy, referenceId, dateFrom, dateTo);
        return Ok(rows.Select(a => new
        {
            a.Id, a.CreatedAt, a.Action, a.EntityType, a.EntityId, a.Module,
            Employee = a.Employee == null ? null : new { a.Employee.Id, a.Employee.FullName, a.Employee.EmployeeCode },
            PerformedBy = a.User == null ? null : new { a.User.Id, a.User.FullName },
            a.OldValues, a.NewValues, a.Notes, a.IpAddress, a.Severity,
        }));
    }

    [RequirePermission("Audit Logs", PermAction.Export)]
    [HttpGet("employee-activity/export")]
    public async Task<IActionResult> ExportActivityReport(
        [FromQuery] Guid? branchId, [FromQuery] Guid? employeeId, [FromQuery] string? module, [FromQuery] string? activityType,
        [FromQuery] Guid? performedBy, [FromQuery] string? referenceId, [FromQuery] DateTime? dateFrom, [FromQuery] DateTime? dateTo,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "csv")
    {
        var rows = await BuildActivityReportAsync(branchId, employeeId, module, activityType, performedBy, referenceId, dateFrom, dateTo);
        var headers = new[] { "Date & Time", "Employee", "Module", "Activity", "Description", "Old Value", "New Value", "Performed By", "IP Address", "Reference ID" };
        var exportRows = rows.Select(a => new object?[]
        {
            a.CreatedAt, a.Employee?.FullName, a.Module, a.Action, a.NewValues ?? a.Notes, a.OldValues, a.NewValues, a.User?.FullName, a.IpAddress, a.EntityId,
        }).ToList();

        await audit.LogAsync(action: "Report exported", entityType: "Report", userId: exportedBy, branchId: branchId,
            details: $"{{\"report\":\"employee-activity\",\"format\":\"{format}\",\"rows\":{rows.Count}}}", module: "Audit Logs");

        return BuildExportFile(format, "Employee Activity Report", $"Records: {rows.Count}", headers, exportRows, $"employee-activity-report-{DateTime.UtcNow:yyyy-MM-dd}");
    }
}
