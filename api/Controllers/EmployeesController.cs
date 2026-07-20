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

    // Document Snapshot (FRD 6.2) — "has at least one document on file" is enough for the card;
    // the full Complete/Expiring/Expired nuance is computed client-side per-document where it's
    // actually displayed (the profile drawer's Documents section).
    private async Task AttachHasDocumentsAsync(List<Employee> employees)
    {
        if (employees.Count == 0) return;
        var ids = employees.Select(e => e.Id).ToHashSet();
        var withDocs = (await db.EmployeeDocuments.Select(d => d.EmployeeId).ToListAsync())
            .Where(ids.Contains)
            .ToHashSet();
        foreach (var employee in employees)
            employee.HasDocuments = withDocs.Contains(employee.Id);
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

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] Guid? branchId,
        [FromQuery] Guid? departmentId,
        [FromQuery] Guid? designationId,
        [FromQuery] Guid? roleId,
        [FromQuery] string? status,
        [FromQuery] string? search)
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
            query = query.Where(e =>
                e.FullName.Contains(search) ||
                e.EmployeeCode.Contains(search) ||
                e.Phone.Contains(search) ||
                (e.Email != null && e.Email.Contains(search)));

        var employees = await query.OrderBy(e => e.FullName).ToListAsync();
        await AttachCurrentShiftsAsync(employees);
        await AttachHasDocumentsAsync(employees);
        await AttachOnLeaveTodayAsync(employees);
        return Ok(employees);
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
        return Ok(employee);
    }

    [RequirePermission("Employees", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Employee employee)
    {
        var dupNationalId = await db.Employees.AnyAsync(e => e.NationalId == employee.NationalId);
        if (dupNationalId)
            return Conflict(new { message = "An employee with this National ID / Iqama already exists." });

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

        if (updated.NationalId != employee.NationalId)
        {
            var dupNationalId = await db.Employees.AnyAsync(e => e.NationalId == updated.NationalId && e.Id != id);
            if (dupNationalId)
                return Conflict(new { message = "An employee with this National ID / Iqama already exists." });
        }

        var before = $"Status: {employee.EmploymentStatus}, Branch: {employee.BranchId}, Department: {employee.DepartmentId}, Designation: {employee.DesignationId}";

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
            details: $"Status: {employee.EmploymentStatus}, Branch: {employee.BranchId}, Department: {employee.DepartmentId}, Designation: {employee.DesignationId}",
            module: "Employees",
            employeeId: employee.Id);

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

    // Shift assignment history for this employee's profile Shifts tab, newest first.
    [HttpGet("{id:guid}/shifts")]
    public async Task<IActionResult> GetShifts(Guid id)
    {
        var assignments = await db.EmployeeShiftAssignments
            .Include(a => a.Shift)
            .Where(a => a.EmployeeId == id)
            .OrderByDescending(a => a.EffectiveFrom)
            .ToListAsync();
        return Ok(assignments);
    }

    // Leave history for this employee's profile Leaves tab, newest first.
    [HttpGet("{id:guid}/leaves")]
    public async Task<IActionResult> GetLeaves(Guid id)
    {
        var leaves = await db.LeaveRequests
            .Include(l => l.LeaveType)
            .Include(l => l.Approver)
            .Where(l => l.EmployeeId == id)
            .OrderByDescending(l => l.FromDate)
            .ToListAsync();
        return Ok(leaves);
    }

    [HttpGet("{id:guid}/documents")]
    public async Task<IActionResult> GetDocuments(Guid id)
    {
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
        component.Status = "inactive";
        component.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Salary component removed", entityType: "SalaryComponent", entityId: component.Id, userId: CallerId(), severity: "warning", module: "Payroll", employeeId: id);

        return NoContent();
    }
}
