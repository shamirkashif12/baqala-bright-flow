using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class EmployeesController(BaqalaDbContext db, IAuditService audit) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst("sub")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null;

    // Branch-scoped roles (anything but tenant_admin) may only see their own branch's employees —
    // same pattern as ShiftsController/ReportsController.
    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    private static IQueryable<Employee> WithIncludes(IQueryable<Employee> query) =>
        query.Include(e => e.Branch).Include(e => e.Department).Include(e => e.Designation).Include(e => e.Role).Include(e => e.LeavePolicy);

    // Attaches each employee's current active shift assignment (if any) as a query-time
    // convenience field — avoids a separate round-trip per employee from the frontend.
    private async Task AttachCurrentShiftsAsync(List<Employee> employees)
    {
        if (employees.Count == 0) return;
        // Filter by the id set in-memory rather than ids.Contains(a.EmployeeId) in the query —
        // this MySQL EF provider fails to type-map a List<Guid> used inside Contains() (see
        // DataSeeder's PatchRemoveTestBranchesAsync comment for the same gotcha elsewhere).
        var ids = employees.Select(e => e.Id).ToHashSet();
        var active = await db.EmployeeShiftAssignments
            .Include(a => a.Shift)
            .Where(a => a.Status == "active")
            .ToListAsync();
        var byEmployee = active
            .Where(a => a.Shift is not null && ids.Contains(a.EmployeeId))
            .GroupBy(a => a.EmployeeId)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(a => a.EffectiveFrom).First());

        foreach (var employee in employees)
        {
            if (byEmployee.TryGetValue(employee.Id, out var assignment))
            {
                employee.CurrentShift = new CurrentShiftInfo
                {
                    ShiftId = assignment.ShiftId,
                    ShiftName = assignment.Shift!.Name,
                    StartTime = assignment.Shift.StartTime,
                    EndTime = assignment.Shift.EndTime,
                    EffectiveFrom = assignment.EffectiveFrom,
                };
            }
        }
    }

    // Document Snapshot (FRD 6.2) — full Complete/Pending/Expiring Soon/Expired status (the worst
    // case among an employee's documents), needed for both the card badge and the Employees list's
    // Document Status filter (FRD 6.3), not just the binary "has documents" HasDocuments flag.
    private async Task AttachHasDocumentsAsync(List<Employee> employees)
    {
        if (employees.Count == 0) return;
        var ids = employees.Select(e => e.Id).ToHashSet();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var docsByEmployee = (await db.EmployeeDocuments.Select(d => new { d.EmployeeId, d.ExpiryDate }).ToListAsync())
            .Where(d => ids.Contains(d.EmployeeId))
            .GroupBy(d => d.EmployeeId)
            .ToDictionary(g => g.Key, g => g.ToList());

        foreach (var employee in employees)
        {
            if (!docsByEmployee.TryGetValue(employee.Id, out var docs))
            {
                employee.HasDocuments = false;
                employee.DocumentStatus = "Pending";
                continue;
            }
            employee.HasDocuments = true;
            if (docs.Any(d => d.ExpiryDate.HasValue && d.ExpiryDate.Value < today)) employee.DocumentStatus = "Expired";
            else if (docs.Any(d => d.ExpiryDate.HasValue && d.ExpiryDate.Value <= today.AddDays(30))) employee.DocumentStatus = "Expiring Soon";
            else employee.DocumentStatus = "Complete";
        }
    }

    // Leave Snapshot (FRD 6.2) — "On Leave" badge for an approved leave covering today.
    private async Task AttachOnLeaveTodayAsync(List<Employee> employees)
    {
        if (employees.Count == 0) return;
        var ids = employees.Select(e => e.Id).ToHashSet();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var onLeave = (await db.LeaveRequests
                .Where(l => l.Status == "approved" && l.FromDate <= today && l.ToDate >= today)
                .Select(l => l.EmployeeId)
                .ToListAsync())
            .Where(ids.Contains)
            .ToHashSet();
        foreach (var employee in employees)
            employee.OnLeaveToday = onLeave.Contains(employee.Id);
    }

    // FRD 3.1 — National ID, DOB, contact/address fields must be masked from anyone who lacks
    // ACL permission to actually manage employees. We don't hard-gate GetAll/GetById behind
    // "Employees" View because other HR modules (Shifts/Leave/Attendance/Departments pickers)
    // legitimately call this same endpoint for name lookups under their own module permission —
    // masking (rather than blocking the whole list) is what satisfies the FRD without breaking
    // those cross-module pickers.
    private async Task<bool> CanViewSensitiveFieldsAsync() =>
        await PermissionCheck.HasPermissionAsync(User, db, "Employees", PermAction.Edit);

    private const string Masked = "••••••••";

    private static void MaskSensitiveFields(Employee e)
    {
        e.NationalId = Masked;
        e.Phone = Masked;
        if (e.EmergencyContact is not null) e.EmergencyContact = Masked;
        if (e.Email is not null) e.Email = Masked;
        e.DateOfBirth = null;
        e.IqamaExpiry = null;
        if (e.CurrentAddress is not null) e.CurrentAddress = Masked;
        if (e.PermanentAddress is not null) e.PermanentAddress = Masked;
    }

    private async Task AttachLatestContractAsync(List<Employee> employees)
    {
        if (employees.Count == 0) return;
        // Filter by the id set in-memory rather than ids.Contains(c.EmployeeId) in the query —
        // this MySQL EF provider fails to type-map a List<Guid>/HashSet<Guid> used inside
        // Contains() (see DataSeeder.PatchRemoveTestBranchesAsync's comment for the same gotcha).
        var ids = employees.Select(e => e.Id).ToHashSet();
        var contracts = (await db.EmployeeContracts.OrderByDescending(c => c.StartDate).ToListAsync())
            .Where(c => ids.Contains(c.EmployeeId))
            .GroupBy(c => c.EmployeeId)
            .ToDictionary(g => g.Key, g => g.First());
        foreach (var employee in employees)
            if (contracts.TryGetValue(employee.Id, out var c))
                employee.LatestContract = new LatestContractInfo
                {
                    ContractType = c.ContractType, EndDate = c.EndDate, OpenEnded = c.OpenEnded, Status = c.Status,
                };
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] Guid[]? branchId,
        [FromQuery] Guid[]? departmentId,
        [FromQuery] Guid[]? designationId,
        [FromQuery] Guid[]? roleId,
        [FromQuery] string[]? status,
        [FromQuery] string? search,
        [FromQuery] int? page,
        [FromQuery] int? pageSize)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            branchId = [callerBranchId.Value];

        var query = WithIncludes(db.Employees.AsQueryable());
        if (!string.IsNullOrEmpty(search))
            query = query.Where(e =>
                e.FullName.Contains(search) ||
                e.EmployeeCode.Contains(search) ||
                e.Phone.Contains(search) ||
                (e.Email != null && e.Email.Contains(search)));

        query = query.OrderBy(e => e.FullName);
        // branchId/departmentId/designationId/roleId/status are arrays (multi-select filters) —
        // never `.Contains()` an array directly against a DbSet-backed IQueryable on this repo's
        // MySQL provider (see the ef-mysql-inlist-gotcha memory: throws at execution time on 2+
        // values despite compiling and passing a single-value smoke test). Only `search` above
        // runs in SQL; the array filters below are applied in-memory after materializing.
        var all = await query.ToListAsync();
        IEnumerable<Employee> scoped = all;
        if (branchId is { Length: > 0 }) scoped = scoped.Where(e => branchId.Contains(e.BranchId));
        if (departmentId is { Length: > 0 }) scoped = scoped.Where(e => e.DepartmentId.HasValue && departmentId.Contains(e.DepartmentId.Value));
        if (designationId is { Length: > 0 }) scoped = scoped.Where(e => e.DesignationId.HasValue && designationId.Contains(e.DesignationId.Value));
        if (roleId is { Length: > 0 }) scoped = scoped.Where(e => e.RoleId.HasValue && roleId.Contains(e.RoleId.Value));
        if (status is { Length: > 0 }) scoped = scoped.Where(e => status.Contains(e.EmploymentStatus));
        var filtered = scoped.ToList();

        var totalCount = filtered.Count;
        var effectivePageSize = pageSize is > 0 and <= 200 ? pageSize.Value : 25;
        var effectivePage = page is > 0 ? page.Value : 1;
        // page/pageSize are optional — omitting them keeps the old "return everything" behavior
        // for internal cross-module pickers (Shifts/Leave/Departments) that don't paginate.
        var employees = page.HasValue || pageSize.HasValue
            ? filtered.Skip((effectivePage - 1) * effectivePageSize).Take(effectivePageSize).ToList()
            : filtered;
        await AttachCurrentShiftsAsync(employees);
        await AttachHasDocumentsAsync(employees);
        await AttachOnLeaveTodayAsync(employees);
        await AttachLatestContractAsync(employees);

        if (!await CanViewSensitiveFieldsAsync())
            foreach (var e in employees) MaskSensitiveFields(e);

        if (!page.HasValue && !pageSize.HasValue) return Ok(employees);
        return Ok(new { items = employees, totalCount });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        var employee = await WithIncludes(db.Employees.AsQueryable()).FirstOrDefaultAsync(e => e.Id == id);
        if (employee is null) return NotFound();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue && employee.BranchId != callerBranchId)
            return NotFound();
        await AttachCurrentShiftsAsync([employee]);
        await AttachHasDocumentsAsync([employee]);
        await AttachOnLeaveTodayAsync([employee]);
        await AttachLatestContractAsync([employee]);

        if (!await CanViewSensitiveFieldsAsync())
            MaskSensitiveFields(employee);

        return Ok(employee);
    }

    // FRD 4.4 — export must include a filter summary, generated-by/at, branch and record count,
    // respect ACL masking (reuses the same GetAll query + masking logic) and be audit-logged.
    // Previously the frontend built a plain CSV client-side from already-loaded rows with none
    // of that, and no Export-permission gate.
    [RequirePermission("Employees", PermAction.Export)]
    [HttpGet("export")]
    public async Task<IActionResult> Export(
        [FromQuery] Guid? branchId, [FromQuery] Guid? departmentId, [FromQuery] Guid? designationId,
        [FromQuery] Guid? roleId, [FromQuery] string? status, [FromQuery] string? search,
        [FromQuery] Guid? exportedBy, [FromQuery] string? format = "excel")
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            branchId = callerBranchId;

        var query = WithIncludes(db.Employees.AsQueryable());
        if (branchId.HasValue) query = query.Where(e => e.BranchId == branchId);
        if (departmentId.HasValue) query = query.Where(e => e.DepartmentId == departmentId);
        if (designationId.HasValue) query = query.Where(e => e.DesignationId == designationId);
        if (roleId.HasValue) query = query.Where(e => e.RoleId == roleId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(e => e.EmploymentStatus == status);
        if (!string.IsNullOrEmpty(search))
            query = query.Where(e => e.FullName.Contains(search) || e.EmployeeCode.Contains(search) || e.Phone.Contains(search) || (e.Email != null && e.Email.Contains(search)));

        var employees = await query.OrderBy(e => e.FullName).ToListAsync();
        await AttachLatestContractAsync(employees);
        if (!await CanViewSensitiveFieldsAsync())
            foreach (var e in employees) MaskSensitiveFields(e);

        var headers = new[] { "Employee ID", "Full Name", "Branch", "Department", "Designation", "Assigned Role", "Hire Date", "Status", "Phone", "Email", "Contract Type", "Contract Status" };
        var rows = employees.Select(e => new object?[]
        {
            e.EmployeeCode, e.FullName, e.Branch?.Name, e.Department?.Name, e.Designation?.Name, e.Role?.Name,
            e.HireDate, e.EmploymentStatus, e.Phone, e.Email, e.LatestContract?.ContractType, e.LatestContract?.Status,
        }).ToList();

        await audit.LogAsync(action: "Report exported", entityType: "Report", userId: exportedBy, branchId: branchId,
            details: $"{{\"report\":\"employees\",\"format\":\"{format}\",\"rows\":{employees.Count}}}", module: "Employees");

        return await ExportFileBuilder.BuildAsync(this, db, format, "Employees", $"Records: {employees.Count}", headers, rows, $"employees-{DateTime.UtcNow:yyyy-MM-dd}", exportedBy);
    }

    // FRD 4.1 — duplicate check must cover identifier/mobile/email, not just National ID.
    private async Task<string?> FindDuplicateFieldAsync(Employee e, Guid? excludeId)
    {
        if (await db.Employees.AnyAsync(x => x.NationalId == e.NationalId && x.Id != excludeId))
            return "An employee with this National ID / Iqama already exists.";
        if (await db.Employees.AnyAsync(x => x.Phone == e.Phone && x.Id != excludeId))
            return "An employee with this phone number already exists.";
        if (!string.IsNullOrWhiteSpace(e.Email) && await db.Employees.AnyAsync(x => x.Email == e.Email && x.Id != excludeId))
            return "An employee with this email already exists.";
        return null;
    }

    // FRD DEP-02/DES-02 — an inactive department/designation must not be assignable to a new or
    // edited employee; the frontend already filters these out of its pickers, but that's
    // bypassable via a direct API call, so enforce it here too.
    private async Task<string?> ValidateActiveMasterDataAsync(Employee e)
    {
        if (e.DepartmentId.HasValue)
        {
            var dept = await db.Departments.FindAsync(e.DepartmentId.Value);
            if (dept is null || dept.Status != "active") return "The selected department is not active.";
        }
        if (e.DesignationId.HasValue)
        {
            var desig = await db.Designations.FindAsync(e.DesignationId.Value);
            if (desig is null || desig.Status != "active") return "The selected designation is not active.";
        }
        return null;
    }

    [RequirePermission("Employees", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Employee employee)
    {
        var duplicateMessage = await FindDuplicateFieldAsync(employee, null);
        if (duplicateMessage is not null) return Conflict(new { message = duplicateMessage });
        var masterDataError = await ValidateActiveMasterDataAsync(employee);
        if (masterDataError is not null) return BadRequest(new { message = masterDataError });

        employee.Id = Guid.NewGuid();
        employee.CreatedAt = employee.UpdatedAt = DateTime.UtcNow;

        // Auto-generate employee code: EMP-NNNNN
        var lastCode = await db.Employees
            .Where(e => e.EmployeeCode.StartsWith("EMP-"))
            .OrderByDescending(e => e.EmployeeCode)
            .Select(e => e.EmployeeCode)
            .FirstOrDefaultAsync();
        int next = 1;
        if (lastCode is not null && int.TryParse(lastCode[4..], out int n)) next = n + 1;
        employee.EmployeeCode = $"EMP-{next:D5}";

        db.Employees.Add(employee);
        await db.SaveChangesAsync();

        await audit.LogAsync(
            action: "Employee created",
            entityType: "Employee",
            entityId: employee.Id,
            userId: CallerId(),
            branchId: employee.BranchId,
            details: $"Created employee {employee.EmployeeCode} ({employee.FullName})",
            module: "Employees",
            employeeId: employee.Id);

        return CreatedAtAction(nameof(GetById), new { id = employee.Id }, employee);
    }

    [RequirePermission("Employees", PermAction.Edit)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] Employee updated)
    {
        var employee = await db.Employees.FindAsync(id);
        if (employee is null) return NotFound();

        var duplicateMessage = await FindDuplicateFieldAsync(updated, id);
        if (duplicateMessage is not null) return Conflict(new { message = duplicateMessage });
        var masterDataError = await ValidateActiveMasterDataAsync(updated);
        if (masterDataError is not null) return BadRequest(new { message = masterDataError });

        var leavePolicyChanged = updated.LeavePolicyId != employee.LeavePolicyId;
        var before = $"Status: {employee.EmploymentStatus}, Branch: {employee.BranchId}, Department: {employee.DepartmentId}, Designation: {employee.DesignationId}, LeavePolicy: {employee.LeavePolicyId}";

        employee.FullName = updated.FullName;
        employee.Email = updated.Email;
        employee.Phone = updated.Phone;
        employee.EmergencyContact = updated.EmergencyContact;
        employee.NationalId = updated.NationalId;
        employee.IqamaExpiry = updated.IqamaExpiry;
        employee.DateOfBirth = updated.DateOfBirth;
        employee.Gender = updated.Gender;
        employee.Nationality = updated.Nationality;
        employee.MaritalStatus = updated.MaritalStatus;
        employee.ProfileImageUrl = updated.ProfileImageUrl;
        employee.BranchId = updated.BranchId;
        employee.DepartmentId = updated.DepartmentId;
        employee.DesignationId = updated.DesignationId;
        employee.RoleId = updated.RoleId;
        employee.UserId = updated.UserId;
        employee.LeavePolicyId = updated.LeavePolicyId;
        if (leavePolicyChanged) employee.LeavePolicyEffectiveFrom = updated.LeavePolicyEffectiveFrom ?? DateOnly.FromDateTime(DateTime.UtcNow);
        employee.HireDate = updated.HireDate;
        employee.EmploymentStatus = updated.EmploymentStatus;
        employee.CurrentAddress = updated.CurrentAddress;
        employee.PermanentAddress = updated.PermanentAddress;
        employee.ContractType = updated.ContractType;
        employee.ContractStartDate = updated.ContractStartDate;
        employee.ContractEndDate = updated.ContractEndDate;
        employee.ContractOpenEnded = updated.ContractOpenEnded;
        employee.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();

        await audit.LogAsync(
            action: "Employee updated",
            entityType: "Employee",
            entityId: employee.Id,
            userId: CallerId(),
            branchId: employee.BranchId,
            beforeValue: before,
            details: $"Status: {employee.EmploymentStatus}, Branch: {employee.BranchId}, Department: {employee.DepartmentId}, Designation: {employee.DesignationId}, LeavePolicy: {employee.LeavePolicyId}",
            module: "Employees",
            employeeId: employee.Id);

        if (leavePolicyChanged)
            await audit.LogAsync(
                action: "Leave policy assigned", entityType: "Employee", entityId: employee.Id, userId: CallerId(),
                branchId: employee.BranchId, details: $"Leave policy set to {employee.LeavePolicyId} effective {employee.LeavePolicyEffectiveFrom}",
                module: "Leave Management", employeeId: employee.Id);

        return Ok(employee);
    }

    [RequirePermission("Employees", PermAction.Delete)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var employee = await db.Employees.FindAsync(id);
        if (employee is null) return NotFound();
        employee.EmploymentStatus = "inactive";
        employee.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync(
            action: "Employee deactivated",
            entityType: "Employee",
            entityId: employee.Id,
            userId: CallerId(),
            branchId: employee.BranchId,
            severity: "warning",
            module: "Employees",
            employeeId: employee.Id);

        return NoContent();
    }

    // A "View" grant on the target module only unlocks the CALLER'S OWN sub-resource
    // (shifts/leaves) under this employee-profile endpoint — seeing another employee's requires
    // Approve or Edit on that module. Mirrors the same rule enforced directly on
    // WorkShiftsController/LeaveController's list endpoints, so this profile-tab shortcut can't
    // be used to route around it.
    private async Task<bool> HasElevatedAccessAsync(string module) =>
        await PermissionCheck.HasPermissionAsync(User, db, module, PermAction.Approve)
        || await PermissionCheck.HasPermissionAsync(User, db, module, PermAction.Edit);

    private async Task<bool> IsOwnEmployeeAsync(Guid employeeId)
    {
        var callerId = CallerId();
        if (callerId is null) return false;
        return await db.Employees.AnyAsync(e => e.Id == employeeId && e.UserId == callerId);
    }

    // Shift assignment history for this employee's profile Shifts tab, newest first.
    [RequirePermission("HR Shifts", PermAction.View)]
    [HttpGet("{id:guid}/shifts")]
    public async Task<IActionResult> GetShifts(Guid id)
    {
        if (!await HasElevatedAccessAsync("HR Shifts") && !await IsOwnEmployeeAsync(id)) return NotFound();

        var assignments = await db.EmployeeShiftAssignments
            .Include(a => a.Shift)
            .Where(a => a.EmployeeId == id)
            .OrderByDescending(a => a.EffectiveFrom)
            .ToListAsync();
        return Ok(assignments);
    }

    // Leave history for this employee's profile Leaves tab, newest first.
    [RequirePermission("Leave Management", PermAction.View)]
    [HttpGet("{id:guid}/leaves")]
    public async Task<IActionResult> GetLeaves(Guid id)
    {
        if (!await HasElevatedAccessAsync("Leave Management") && !await IsOwnEmployeeAsync(id)) return NotFound();

        var leaves = await db.LeaveRequests
            .Include(l => l.LeaveType)
            .Include(l => l.Approver)
            .Where(l => l.EmployeeId == id)
            .OrderByDescending(l => l.FromDate)
            .ToListAsync();
        return Ok(leaves);
    }

    // FRD 3.1/6.4 — document attachments must be ACL-controlled like every other sensitive field;
    // gated on the same "Employees" Edit permission GetAll/GetById already use to decide whether
    // to mask PII, with a self-service carve-out so an employee can always see their own uploads.
    [HttpGet("{id:guid}/documents")]
    public async Task<IActionResult> GetDocuments(Guid id)
    {
        if (!await CanViewSensitiveFieldsAsync() && !await IsOwnEmployeeAsync(id)) return NotFound();

        var documents = await db.EmployeeDocuments.Where(d => d.EmployeeId == id).OrderByDescending(d => d.UploadedAt).ToListAsync();
        return Ok(documents);
    }

    [RequirePermission("Employees", PermAction.Edit)]
    [HttpPost("{id:guid}/documents")]
    public async Task<IActionResult> UploadDocument(Guid id, [FromBody] EmployeeDocument document)
    {
        var employee = await db.Employees.FindAsync(id);
        if (employee is null) return NotFound(new { message = "Employee not found." });

        document.Id = Guid.NewGuid();
        document.EmployeeId = id;
        document.UploadedBy = CallerId();
        document.UploadedAt = DateTime.UtcNow;
        db.EmployeeDocuments.Add(document);
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Employee document uploaded", entityType: "EmployeeDocument", entityId: document.Id,
            userId: CallerId(), branchId: employee.BranchId, details: $"{document.DocumentType} for {employee.FullName}",
            module: "Employees", employeeId: id);

        return CreatedAtAction(nameof(GetDocuments), new { id }, document);
    }

    [RequirePermission("Employees", PermAction.Delete)]
    [HttpDelete("{id:guid}/documents/{documentId:guid}")]
    public async Task<IActionResult> DeleteDocument(Guid id, Guid documentId)
    {
        var document = await db.EmployeeDocuments.FirstOrDefaultAsync(d => d.Id == documentId && d.EmployeeId == id);
        if (document is null) return NotFound();
        db.EmployeeDocuments.Remove(document);
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Employee document deleted", entityType: "EmployeeDocument", entityId: documentId,
            userId: CallerId(), severity: "warning", module: "Employees", employeeId: id);

        return NoContent();
    }

    [HttpGet("{id:guid}/contracts")]
    public async Task<IActionResult> GetContracts(Guid id)
    {
        var contracts = await db.EmployeeContracts.Where(c => c.EmployeeId == id).OrderByDescending(c => c.StartDate).ToListAsync();
        return Ok(contracts);
    }

    [RequirePermission("Employees", PermAction.Edit)]
    [HttpPost("{id:guid}/contracts")]
    public async Task<IActionResult> UploadContract(Guid id, [FromBody] EmployeeContract contract)
    {
        var employee = await db.Employees.FindAsync(id);
        if (employee is null) return NotFound(new { message = "Employee not found." });

        contract.Id = Guid.NewGuid();
        contract.EmployeeId = id;
        contract.Status = "active";
        contract.UploadedBy = CallerId();
        contract.UploadedAt = DateTime.UtcNow;
        db.EmployeeContracts.Add(contract);
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Employee contract uploaded", entityType: "EmployeeContract", entityId: contract.Id,
            userId: CallerId(), branchId: employee.BranchId, details: $"{contract.ContractType} for {employee.FullName}",
            module: "Employees", employeeId: id);

        return CreatedAtAction(nameof(GetContracts), new { id }, contract);
    }

    [RequirePermission("Employees", PermAction.Edit)]
    [HttpPost("{id:guid}/contracts/{contractId:guid}/terminate")]
    public async Task<IActionResult> TerminateContract(Guid id, Guid contractId)
    {
        var contract = await db.EmployeeContracts.FirstOrDefaultAsync(c => c.Id == contractId && c.EmployeeId == id);
        if (contract is null) return NotFound();
        contract.Status = "terminated";
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Employee contract terminated", entityType: "EmployeeContract", entityId: contract.Id,
            userId: CallerId(), severity: "warning", module: "Employees", employeeId: id);

        return Ok(contract);
    }

    // Users who could be linked as this Employee's login account (FRD's Employee<->User is
    // intentionally optional — many staff never get a login — but until now there was no UI at
    // all to set the link, only a one-time startup backfill). Excludes Users already linked to a
    // DIFFERENT employee; a currentEmployeeId lets the Edit form keep showing its own current link.
    [HttpGet("linkable-users")]
    public async Task<IActionResult> GetLinkableUsers([FromQuery] Guid? currentEmployeeId)
    {
        // Materialize first, then filter in-memory — this MySQL EF provider fails to type-map a
        // List<Guid> used inside Contains() in a translated query (see
        // DataSeeder.PatchRemoveTestBranchesAsync's comment for the same gotcha elsewhere).
        var linkedElsewhere = (await db.Employees
                .Where(e => e.UserId != null)
                .Select(e => new { e.Id, e.UserId })
                .ToListAsync())
            .Where(e => currentEmployeeId == null || e.Id != currentEmployeeId)
            .Select(e => e.UserId!.Value)
            .ToHashSet();

        var users = await db.Users.Where(u => u.Status == "active").OrderBy(u => u.FullName).ToListAsync();
        var linkable = users.Where(u => !linkedElsewhere.Contains(u.Id))
            .Select(u => new { u.Id, u.FullName, u.Email });
        return Ok(linkable);
    }

    // Self-service payroll (Mod #3) — any authenticated user with a linked Employee record can
    // see their OWN salary components + payslip history, regardless of "Payroll" module
    // permission (that permission gates seeing OTHER people's amounts, not your own).
    [HttpGet("me/payroll")]
    public async Task<IActionResult> GetMyPayroll()
    {
        var callerId = CallerId();
        if (callerId is null) return Unauthorized();
        var employee = await db.Employees.FirstOrDefaultAsync(e => e.UserId == callerId);
        if (employee is null) return NotFound(new { message = "No employee record is linked to this account." });

        var components = await db.SalaryComponents
            .Where(c => c.EmployeeId == employee.Id && c.Status == "active")
            .OrderBy(c => c.ComponentName)
            .ToListAsync();

        var payslips = await db.PayrollRunEmployees
            .Include(r => r.PayrollRun)
            .Where(r => r.EmployeeId == employee.Id)
            .ToListAsync();

        return Ok(new
        {
            employee = new { employee.Id, employee.FullName, employee.EmployeeCode },
            components,
            payslips = payslips
                .OrderByDescending(r => r.PayrollRun?.Year).ThenByDescending(r => r.PayrollRun?.Month)
                .Select(r => new
                {
                    r.Id,
                    r.PayrollRun?.Year, r.PayrollRun?.Month, r.PayrollRun?.PayDate, r.PayrollRun?.Status,
                    r.BasicSalary, r.GrossEarnings, r.TotalDeductions, r.NetPayable,
                }),
        });
    }

    // Additive safeguard on top of the FRD's own module+branch ACL model (which has no rank
    // concept): a manager-tier caller can only add/edit/delete salary components for an employee
    // whose assigned ACL role ranks strictly below their own. tenant_admin is exempt (full access
    // per FRD section 3). An employee with no assigned ACL role is treated as unranked (0) —
    // still editable by anyone who already holds the Payroll permission gate.
    private async Task<bool> CanEditSalaryForAsync(Guid employeeId)
    {
        var callerAppRole = User.FindFirst("role")?.Value;
        if (callerAppRole == "tenant_admin") return true;
        var callerRank = RoleRank.Of(callerAppRole ?? "");

        var targetRoleName = await db.Employees.Where(e => e.Id == employeeId).Select(e => e.Role!.Name).FirstOrDefaultAsync();
        if (targetRoleName is null) return true;
        var targetRank = RoleRank.Of(RoleNormalizer.ToAppRole(targetRoleName));
        return callerRank > targetRank;
    }

    [HttpGet("{id:guid}/salary-components")]
    public async Task<IActionResult> GetSalaryComponents(Guid id)
    {
        var canView = await PermissionCheck.HasPermissionAsync(User, db, "Payroll", PermAction.View);
        var components = await db.SalaryComponents.Where(c => c.EmployeeId == id).OrderBy(c => c.ComponentName).ToListAsync();
        if (!canView) return Ok(Array.Empty<object>());
        return Ok(components);
    }

    [RequirePermission("Payroll", PermAction.Create)]
    [HttpPost("{id:guid}/salary-components")]
    public async Task<IActionResult> AddSalaryComponent(Guid id, [FromBody] SalaryComponent component)
    {
        var employee = await db.Employees.FindAsync(id);
        if (employee is null) return NotFound(new { message = "Employee not found." });
        if (!await CanEditSalaryForAsync(id))
            return StatusCode(403, new { message = "You cannot edit salary for an employee at or above your own role level." });

        component.Id = Guid.NewGuid();
        component.EmployeeId = id;
        component.Status = "active";
        component.CreatedAt = component.UpdatedAt = DateTime.UtcNow;
        db.SalaryComponents.Add(component);
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Salary component added", entityType: "SalaryComponent", entityId: component.Id,
            userId: CallerId(), branchId: employee.BranchId, details: $"{component.ComponentName} ({component.ComponentType}) SAR {component.Amount:F2} for {employee.FullName}",
            module: "Payroll", employeeId: id);

        return CreatedAtAction(nameof(GetSalaryComponents), new { id }, component);
    }

    [RequirePermission("Payroll", PermAction.Edit)]
    [HttpPut("{id:guid}/salary-components/{componentId:guid}")]
    public async Task<IActionResult> UpdateSalaryComponent(Guid id, Guid componentId, [FromBody] SalaryComponent updated)
    {
        var component = await db.SalaryComponents.FirstOrDefaultAsync(c => c.Id == componentId && c.EmployeeId == id);
        if (component is null) return NotFound();
        if (!await CanEditSalaryForAsync(id))
            return StatusCode(403, new { message = "You cannot edit salary for an employee at or above your own role level." });

        component.ComponentName = updated.ComponentName;
        component.ComponentType = updated.ComponentType;
        component.Amount = updated.Amount;
        component.Frequency = updated.Frequency;
        component.EffectiveFrom = updated.EffectiveFrom;
        component.EffectiveTo = updated.EffectiveTo;
        component.Status = updated.Status;
        component.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Salary component updated", entityType: "SalaryComponent", entityId: component.Id, userId: CallerId(), module: "Payroll", employeeId: id);

        return Ok(component);
    }

    [RequirePermission("Payroll", PermAction.Delete)]
    [HttpDelete("{id:guid}/salary-components/{componentId:guid}")]
    public async Task<IActionResult> DeleteSalaryComponent(Guid id, Guid componentId)
    {
        var component = await db.SalaryComponents.FirstOrDefaultAsync(c => c.Id == componentId && c.EmployeeId == id);
        if (component is null) return NotFound();
        if (!await CanEditSalaryForAsync(id))
            return StatusCode(403, new { message = "You cannot edit salary for an employee at or above your own role level." });
        component.Status = "inactive";
        component.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Salary component removed", entityType: "SalaryComponent", entityId: component.Id, userId: CallerId(), severity: "warning", module: "Payroll", employeeId: id);

        return NoContent();
    }
}
