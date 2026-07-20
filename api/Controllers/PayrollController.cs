using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/payroll-runs")]
public class PayrollController(BaqalaDbContext db, IAuditService audit) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst("sub")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null;

    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    private async Task<bool> CanViewAmountsAsync() =>
        await PermissionCheck.HasPermissionAsync(User, db, "Payroll", PermAction.View);

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? branchId, [FromQuery] int? year, [FromQuery] int? month, [FromQuery] string? status)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            branchId = callerBranchId;

        var query = db.PayrollRuns.Include(p => p.Branch).AsQueryable();
        if (branchId.HasValue) query = query.Where(p => p.BranchId == branchId);
        if (year.HasValue) query = query.Where(p => p.Year == year);
        if (month.HasValue) query = query.Where(p => p.Month == month);
        if (!string.IsNullOrEmpty(status)) query = query.Where(p => p.Status == status);

        var runs = await query.OrderByDescending(p => p.Year).ThenByDescending(p => p.Month).ToListAsync();
        var canViewAmounts = await CanViewAmountsAsync();

        return Ok(runs.Select(r => new
        {
            r.Id, r.BranchId, r.Year, r.Month, r.PayDate, r.Status, r.EmployeeCount,
            TotalAmount = canViewAmounts ? r.TotalAmount : (decimal?)null,
            r.ProcessedBy, r.ProcessedAt, r.CreatedAt, r.UpdatedAt,
            Branch = r.Branch == null ? null : new { r.Branch.Id, r.Branch.Name },
        }));
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var run = await db.PayrollRuns.Include(p => p.Branch).FirstOrDefaultAsync(p => p.Id == id);
        if (run is null) return NotFound();

        var rows = await db.PayrollRunEmployees.Include(r => r.Employee).Where(r => r.PayrollRunId == id).ToListAsync();
        var canViewAmounts = await CanViewAmountsAsync();

        return Ok(new
        {
            run.Id, run.BranchId, run.Year, run.Month, run.PayDate, run.Status, run.EmployeeCount,
            TotalAmount = canViewAmounts ? run.TotalAmount : (decimal?)null,
            run.ProcessedBy, run.ProcessedAt,
            Branch = run.Branch == null ? null : new { run.Branch.Id, run.Branch.Name },
            Employees = rows.Select(r => new
            {
                r.Id, r.EmployeeId,
                Employee = r.Employee == null ? null : new { r.Employee.Id, r.Employee.FullName, r.Employee.EmployeeCode },
                BasicSalary = canViewAmounts ? r.BasicSalary : (decimal?)null,
                GrossEarnings = canViewAmounts ? r.GrossEarnings : (decimal?)null,
                TotalDeductions = canViewAmounts ? r.TotalDeductions : (decimal?)null,
                NetPayable = canViewAmounts ? r.NetPayable : (decimal?)null,
            }),
        });
    }

    [RequirePermission("Payroll", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePayrollRunRequest req)
    {
        var duplicate = await db.PayrollRuns.AnyAsync(p => p.BranchId == req.BranchId && p.Year == req.Year && p.Month == req.Month);
        if (duplicate) return Conflict(new { message = "A payroll run already exists for this branch and month." });

        var run = new PayrollRun
        {
            Id = Guid.NewGuid(), BranchId = req.BranchId, Year = req.Year, Month = req.Month,
            PayDate = req.PayDate, Status = "Draft", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
        };
        db.PayrollRuns.Add(run);
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Payroll run created", entityType: "PayrollRun", entityId: run.Id,
            userId: CallerId(), branchId: run.BranchId, details: $"{req.Year}-{req.Month:D2}", module: "Payroll");

        return CreatedAtAction(nameof(GetById), new { id = run.Id }, run);
    }

    // Snapshots each active employee's current SalaryComponents into PayrollRunEmployee rows.
    // A run's numbers stay fixed after this even if components change later.
    [RequirePermission("Payroll", PermAction.Approve)]
    [HttpPost("{id:guid}/process")]
    public async Task<IActionResult> Process(Guid id)
    {
        var run = await db.PayrollRuns.FindAsync(id);
        if (run is null) return NotFound();
        if (run.Status != "Draft") return Conflict(new { message = "Only a Draft payroll run can be processed." });

        var employees = await db.Employees.Where(e => e.BranchId == run.BranchId && e.EmploymentStatus == "active").ToListAsync();
        var components = await db.SalaryComponents.Where(c => c.Status == "active").ToListAsync();
        var componentsByEmployee = components.GroupBy(c => c.EmployeeId).ToDictionary(g => g.Key, g => g.ToList());

        var rows = new List<PayrollRunEmployee>();
        decimal total = 0;

        foreach (var employee in employees)
        {
            var employeeComponents = componentsByEmployee.GetValueOrDefault(employee.Id, []);
            var basic = employeeComponents.FirstOrDefault(c => c.ComponentName == "Basic Salary")?.Amount ?? 0;
            var earnings = employeeComponents.Where(c => c.ComponentType == "Earning").Sum(c => c.Amount);
            var deductions = employeeComponents.Where(c => c.ComponentType == "Deduction").Sum(c => c.Amount);
            var net = earnings - deductions;

            rows.Add(new PayrollRunEmployee
            {
                Id = Guid.NewGuid(), PayrollRunId = run.Id, EmployeeId = employee.Id,
                BasicSalary = basic, GrossEarnings = earnings, TotalDeductions = deductions, NetPayable = net,
            });
            total += net;
        }

        db.PayrollRunEmployees.AddRange(rows);
        run.Status = "Processed";
        run.EmployeeCount = rows.Count;
        run.TotalAmount = total;
        run.ProcessedBy = CallerId();
        run.ProcessedAt = DateTime.UtcNow;
        run.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Payroll run processed", entityType: "PayrollRun", entityId: run.Id,
            userId: CallerId(), branchId: run.BranchId, details: $"{rows.Count} employees, total SAR {total:F2}", severity: "warning", module: "Payroll");

        return Ok(run);
    }
}

public record CreatePayrollRunRequest(Guid BranchId, int Year, int Month, DateOnly PayDate);
