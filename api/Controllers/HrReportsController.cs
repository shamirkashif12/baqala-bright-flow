using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

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

    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst("sub")?.Value ?? User.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null;

    // "Reports"/"Audit Logs" have no Approve/Edit concept of their own (a report has no workflow
    // to approve or edit) — so we can't gate "view all vs. own" on those modules' flags directly.
    // Instead, whoever holds Approve/Edit on any underlying HR module (i.e. actually manages other
    // employees' attendance/shifts/leave — Branch Manager, Supervisor, Tenant Admin by default)
    // sees the full branch report; everyone else only sees rows tied to their OWN linked employee
    // record. Without this, a bare "Reports: View" grant (e.g. Cashier, for Sales/BI purposes)
    // would incidentally hand out full-company HRM report visibility too.
    private async Task<bool> IsHrManagerTierAsync() =>
        await PermissionCheck.HasPermissionAsync(User, db, "HR Attendance", PermAction.Approve)
        || await PermissionCheck.HasPermissionAsync(User, db, "HR Attendance", PermAction.Edit)
        || await PermissionCheck.HasPermissionAsync(User, db, "HR Shifts", PermAction.Approve)
        || await PermissionCheck.HasPermissionAsync(User, db, "HR Shifts", PermAction.Edit)
        || await PermissionCheck.HasPermissionAsync(User, db, "Leave Management", PermAction.Approve)
        || await PermissionCheck.HasPermissionAsync(User, db, "Leave Management", PermAction.Edit);

    private async Task<Guid?> GetOwnEmployeeIdAsync() =>
        CallerId() is { } callerId ? await db.Employees.Where(e => e.UserId == callerId).Select(e => (Guid?)e.Id).FirstOrDefaultAsync() : null;

    private Task<FileContentResult> BuildExportFileAsync(
        string? format, string title, string filterSummary,
        string[] headers, IReadOnlyList<object?[]> rows, string baseFileName, Guid? exportedBy = null) =>
        ExportFileBuilder.BuildAsync(this, db, format, title, filterSummary, headers, rows, baseFileName, exportedBy);

    // ─── Attendance Report ────────────────────────────────────────────────────
    private async Task<HashSet<(Guid? BranchId, DateOnly Date)>> LoadActiveHolidaysAsync() =>
        (await db.Holidays.Where(h => h.Status == "active").Select(h => new { h.BranchId, h.Date }).ToListAsync())
            .Select(h => (h.BranchId, h.Date)).ToHashSet();

    private async Task<List<StaffAttendance>> BuildAttendanceReportAsync(
        Guid? branchId, Guid? departmentId, Guid? employeeId, Guid? shiftId, string? status, DateOnly? dateFrom, DateOnly? dateTo, string? correctionStatus = null)
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
        if (!await IsHrManagerTierAsync())
        {
            var ownEmployeeId = await GetOwnEmployeeIdAsync();
            query = ownEmployeeId.HasValue ? query.Where(a => a.EmployeeId == ownEmployeeId) : query.Where(a => false);
        }
        else if (employeeId.HasValue) query = query.Where(a => a.EmployeeId == employeeId);
        if (shiftId.HasValue) query = query.Where(a => a.ShiftId == shiftId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(a => a.Status == status);
        if (dateFrom.HasValue) query = query.Where(a => a.Date >= dateFrom);
        if (dateTo.HasValue) query = query.Where(a => a.Date <= dateTo);
        if (correctionStatus == "corrected") query = query.Where(a => a.IsCorrected);
        else if (correctionStatus == "original") query = query.Where(a => !a.IsCorrected);

        var rows = await query.OrderByDescending(a => a.Date).ToListAsync();
        AttendanceStatusHelper.ApplyDerivedStatus(rows, await LoadActiveHolidaysAsync());
        return rows;
    }

    [RequirePermission("Reports", PermAction.View)]
    [HttpGet("attendance")]
    public async Task<IActionResult> GetAttendanceReport(
        [FromQuery] Guid? branchId, [FromQuery] Guid? departmentId, [FromQuery] Guid? employeeId, [FromQuery] Guid? shiftId,
        [FromQuery] string? status, [FromQuery] DateOnly? dateFrom, [FromQuery] DateOnly? dateTo, [FromQuery] string? correctionStatus,
        [FromQuery] int? page, [FromQuery] int? pageSize)
    {
        var rows = await BuildAttendanceReportAsync(branchId, departmentId, employeeId, shiftId, status, dateFrom, dateTo, correctionStatus);
        if (!page.HasValue && !pageSize.HasValue) return Ok(rows);
        var effectivePageSize = pageSize is > 0 and <= 200 ? pageSize.Value : 25;
        var effectivePage = page is > 0 ? page.Value : 1;
        return Ok(new { items = rows.Skip((effectivePage - 1) * effectivePageSize).Take(effectivePageSize), totalCount = rows.Count });
    }

    [RequirePermission("Reports", PermAction.Export)]
    [HttpGet("attendance/export")]
    public async Task<IActionResult> ExportAttendanceReport(
        [FromQuery] Guid? branchId, [FromQuery] Guid? departmentId, [FromQuery] Guid? employeeId, [FromQuery] Guid? shiftId,
        [FromQuery] string? status, [FromQuery] string? correctionStatus, [FromQuery] DateOnly? dateFrom, [FromQuery] DateOnly? dateTo,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "excel")
    {
        var rows = await BuildAttendanceReportAsync(branchId, departmentId, employeeId, shiftId, status, dateFrom, dateTo, correctionStatus);
        var headers = new[] { "Date", "Employee", "Employee ID", "Branch", "Department", "Shift", "Check-In", "Check-Out", "Status", "Late (min)", "Early Leave (min)", "Correction Status", "Remarks" };
        var exportRows = rows.Select(a => new object?[]
        {
            a.Date?.ToString("yyyy-MM-dd"), a.Employee?.FullName, a.Employee?.EmployeeCode, a.BranchId, a.Employee?.Department?.Name,
            a.Shift?.Name, a.CheckIn?.ToString("HH:mm"), a.CheckOut?.ToString("HH:mm"), a.Status, a.LateMinutes, a.EarlyLeaveMinutes,
            a.IsCorrected ? "Corrected" : "Original", a.Remarks,
        }).ToList();

        await audit.LogAsync(action: "Report exported", entityType: "Report", userId: exportedBy, branchId: branchId,
            details: $"{{\"report\":\"attendance\",\"format\":\"{format}\",\"rows\":{rows.Count}}}", module: "HR Attendance");

        return await BuildExportFileAsync(format, "Attendance Report", $"Records: {rows.Count}", headers, exportRows, $"attendance-report-{DateTime.UtcNow:yyyy-MM-dd}", exportedBy);
    }

    // FRD AR-02 — read-only correction-history drilldown: original vs corrected values + reason,
    // sourced straight from the audit trail HrAttendanceController.Correct already writes.
    [RequirePermission("Reports", PermAction.View)]
    [HttpGet("attendance/{id:guid}/history")]
    public async Task<IActionResult> GetAttendanceCorrectionHistory(Guid id)
    {
        if (!await IsHrManagerTierAsync())
        {
            var ownEmployeeId = await GetOwnEmployeeIdAsync();
            var belongsToCaller = ownEmployeeId.HasValue && await db.StaffAttendances.AnyAsync(a => a.Id == id && a.EmployeeId == ownEmployeeId);
            if (!belongsToCaller) return NotFound();
        }

        var logs = await db.AuditLogs
            .Where(a => a.EntityType == "StaffAttendance" && a.EntityId == id && a.Action == "Attendance corrected")
            .OrderBy(a => a.CreatedAt)
            .Select(a => new { a.CreatedAt, a.OldValues, a.NewValues, a.Notes, a.UserId })
            .ToListAsync();
        return Ok(logs);
    }

    // ─── Shift Closing Report ──────────────────────────────────────────────────
    // Status derivation (Open/Closed/Late Closed/Checkout Missing/Manually Closed/Cancelled/Not
    // Applicable) lives in the shared AttendanceStatusHelper so the Attendance module and this
    // report never disagree.
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
        if (!await IsHrManagerTierAsync())
        {
            var ownEmployeeId = await GetOwnEmployeeIdAsync();
            query = ownEmployeeId.HasValue ? query.Where(a => a.EmployeeId == ownEmployeeId) : query.Where(a => false);
        }
        else if (employeeId.HasValue) query = query.Where(a => a.EmployeeId == employeeId);
        if (shiftId.HasValue) query = query.Where(a => a.ShiftId == shiftId);
        if (dateFrom.HasValue) query = query.Where(a => a.Date >= dateFrom);
        if (dateTo.HasValue) query = query.Where(a => a.Date <= dateTo);

        var rows = await query.OrderByDescending(a => a.Date).ToListAsync();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        if (!string.IsNullOrEmpty(closingStatus))
            rows = rows.Where(a => AttendanceStatusHelper.ClosingStatus(a, today) == closingStatus).ToList();
        return rows;
    }

    [RequirePermission("Reports", PermAction.View)]
    [HttpGet("shift-closing")]
    public async Task<IActionResult> GetShiftClosingReport(
        [FromQuery] Guid? branchId, [FromQuery] Guid? departmentId, [FromQuery] Guid? employeeId, [FromQuery] Guid? shiftId,
        [FromQuery] string? closingStatus, [FromQuery] DateOnly? dateFrom, [FromQuery] DateOnly? dateTo,
        [FromQuery] int? page, [FromQuery] int? pageSize)
    {
        var rows = await BuildShiftClosingReportAsync(branchId, departmentId, employeeId, shiftId, closingStatus, dateFrom, dateTo);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var projected = rows.Select(a => new
        {
            a.Id, a.Date, a.EmployeeId,
            Employee = a.Employee == null ? null : new { a.Employee.Id, a.Employee.FullName, a.Employee.EmployeeCode },
            Department = a.Employee?.Department?.Name,
            a.BranchId,
            Shift = a.Shift == null ? null : new { a.Shift.Id, a.Shift.Name, a.Shift.StartTime, a.Shift.EndTime },
            ScheduledStart = a.Shift?.StartTime, ScheduledEnd = a.Shift?.EndTime,
            ActualCheckIn = a.CheckIn, ActualCheckOut = a.CheckOut,
            ClosingStatus = AttendanceStatusHelper.ClosingStatus(a, today),
            ClosedBy = a.RecordedByUser?.FullName,
            ClosingTime = AttendanceStatusHelper.ClosingTime(a),
            a.Remarks,
        }).ToList();

        if (!page.HasValue && !pageSize.HasValue) return Ok(projected);
        var effectivePageSize = pageSize is > 0 and <= 200 ? pageSize.Value : 25;
        var effectivePage = page is > 0 ? page.Value : 1;
        return Ok(new { items = projected.Skip((effectivePage - 1) * effectivePageSize).Take(effectivePageSize), totalCount = projected.Count });
    }

    [RequirePermission("Reports", PermAction.Export)]
    [HttpGet("shift-closing/export")]
    public async Task<IActionResult> ExportShiftClosingReport(
        [FromQuery] Guid? branchId, [FromQuery] Guid? departmentId, [FromQuery] Guid? employeeId, [FromQuery] Guid? shiftId,
        [FromQuery] string? closingStatus, [FromQuery] DateOnly? dateFrom, [FromQuery] DateOnly? dateTo, [FromQuery] Guid? exportedBy, [FromQuery] string? format = "excel")
    {
        var rows = await BuildShiftClosingReportAsync(branchId, departmentId, employeeId, shiftId, closingStatus, dateFrom, dateTo);
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var headers = new[] { "Date", "Employee", "Employee ID", "Department", "Shift", "Scheduled Start", "Scheduled End", "Actual Check-In", "Actual Check-Out", "Closing Status", "Closed By", "Closing Time", "Remarks" };
        var exportRows = rows.Select(a => new object?[]
        {
            a.Date?.ToString("yyyy-MM-dd"), a.Employee?.FullName, a.Employee?.EmployeeCode, a.Employee?.Department?.Name, a.Shift?.Name,
            a.Shift?.StartTime, a.Shift?.EndTime, a.CheckIn?.ToString("HH:mm"), a.CheckOut?.ToString("HH:mm"), AttendanceStatusHelper.ClosingStatus(a, today),
            a.RecordedByUser?.FullName, AttendanceStatusHelper.ClosingTime(a)?.ToString("yyyy-MM-dd HH:mm"), a.Remarks,
        }).ToList();

        await audit.LogAsync(action: "Report exported", entityType: "Report", userId: exportedBy, branchId: branchId,
            details: $"{{\"report\":\"shift-closing\",\"format\":\"{format}\",\"rows\":{rows.Count}}}", module: "HR Shifts");

        return await BuildExportFileAsync(format, "Shift Closing Report", $"Records: {rows.Count}", headers, exportRows, $"shift-closing-report-{DateTime.UtcNow:yyyy-MM-dd}", exportedBy);
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
        if (!await IsHrManagerTierAsync())
        {
            // Self-scoped: activity the caller personally performed (UserId — covers POS/auth
            // actions not tied to any EmployeeId) OR activity recorded against their own linked
            // employee record (EmployeeId — e.g. an attendance correction someone else applied to
            // them). Defense-in-depth: this report is already gated on "Audit Logs" (admin/auditor
            // tier per FRD 3/16), but a non-manager granted that permission via a per-user override
            // still shouldn't see every other employee's activity.
            var callerId = CallerId();
            var ownEmployeeId = await GetOwnEmployeeIdAsync();
            query = query.Where(a => a.UserId == callerId || (ownEmployeeId.HasValue && a.EmployeeId == ownEmployeeId));
        }
        else if (employeeId.HasValue) query = query.Where(a => a.EmployeeId == employeeId);
        if (!string.IsNullOrEmpty(module)) query = query.Where(a => a.Module == module);
        if (!string.IsNullOrEmpty(activityType)) query = query.Where(a => a.Action.Contains(activityType));
        if (performedBy.HasValue) query = query.Where(a => a.UserId == performedBy);
        if (!string.IsNullOrEmpty(referenceId) && Guid.TryParse(referenceId, out var refGuid)) query = query.Where(a => a.EntityId == refGuid);
        if (dateFrom.HasValue) query = query.Where(a => a.CreatedAt >= dateFrom);
        if (dateTo.HasValue) query = query.Where(a => a.CreatedAt <= dateTo);

        return await query.OrderByDescending(a => a.CreatedAt).Take(1000).ToListAsync();
    }

    // Gated on "Audit Logs" rather than "Reports" like its sibling reports above — FRD 3/16 scope
    // this report to admin/auditor user stories (EAR-01..05), not the broader set of roles
    // entitled to Attendance/Shift Closing Report (e.g. Branch Manager, Supervisor by default
    // hold Audit Logs too, but a Cashier's "Reports" grant alone must not unlock this).
    [RequirePermission("Audit Logs", PermAction.View)]
    [HttpGet("employee-activity")]
    public async Task<IActionResult> GetActivityReport(
        [FromQuery] Guid? branchId, [FromQuery] Guid? employeeId, [FromQuery] string? module, [FromQuery] string? activityType,
        [FromQuery] Guid? performedBy, [FromQuery] string? referenceId, [FromQuery] DateTime? dateFrom, [FromQuery] DateTime? dateTo,
        [FromQuery] string? ipOrDevice, [FromQuery] int? page, [FromQuery] int? pageSize)
    {
        var rows = await BuildActivityReportAsync(branchId, employeeId, module, activityType, performedBy, referenceId, dateFrom, dateTo);
        if (!string.IsNullOrEmpty(ipOrDevice)) rows = rows.Where(a => a.IpAddress != null && a.IpAddress.Contains(ipOrDevice)).ToList();

        var projected = rows.Select(a => new
        {
            a.Id, a.CreatedAt, a.Action, a.EntityType, a.EntityId, a.Module,
            Employee = a.Employee == null ? null : new { a.Employee.Id, a.Employee.FullName, a.Employee.EmployeeCode },
            PerformedBy = a.User == null ? null : new { a.User.Id, a.User.FullName },
            a.OldValues, a.NewValues, a.Notes, a.IpAddress, a.Severity,
        }).ToList();

        if (!page.HasValue && !pageSize.HasValue) return Ok(projected);
        var effectivePageSize = pageSize is > 0 and <= 200 ? pageSize.Value : 25;
        var effectivePage = page is > 0 ? page.Value : 1;
        return Ok(new { items = projected.Skip((effectivePage - 1) * effectivePageSize).Take(effectivePageSize), totalCount = projected.Count });
    }

    [RequirePermission("Audit Logs", PermAction.Export)]
    [HttpGet("employee-activity/export")]
    public async Task<IActionResult> ExportActivityReport(
        [FromQuery] Guid? branchId, [FromQuery] Guid? employeeId, [FromQuery] string? module, [FromQuery] string? activityType,
        [FromQuery] Guid? performedBy, [FromQuery] string? referenceId, [FromQuery] string? ipOrDevice, [FromQuery] DateTime? dateFrom, [FromQuery] DateTime? dateTo,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "excel")
    {
        var rows = await BuildActivityReportAsync(branchId, employeeId, module, activityType, performedBy, referenceId, dateFrom, dateTo);
        if (!string.IsNullOrEmpty(ipOrDevice)) rows = rows.Where(a => a.IpAddress != null && a.IpAddress.Contains(ipOrDevice)).ToList();
        var headers = new[] { "Date & Time", "Employee", "Module", "Activity", "Description", "Old Value", "New Value", "Performed By", "IP Address", "Reference ID" };
        var exportRows = rows.Select(a => new object?[]
        {
            a.CreatedAt, a.Employee?.FullName, a.Module, a.Action, a.NewValues ?? a.Notes, a.OldValues, a.NewValues, a.User?.FullName, a.IpAddress, a.EntityId,
        }).ToList();

        await audit.LogAsync(action: "Report exported", entityType: "Report", userId: exportedBy, branchId: branchId,
            details: $"{{\"report\":\"employee-activity\",\"format\":\"{format}\",\"rows\":{rows.Count}}}", module: "Audit Logs");

        return await BuildExportFileAsync(format, "Employee Activity Report", $"Records: {rows.Count}", headers, exportRows, $"employee-activity-report-{DateTime.UtcNow:yyyy-MM-dd}", exportedBy);
    }
}
