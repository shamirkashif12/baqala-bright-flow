using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DepartmentsController(BaqalaDbContext db, IAuditService audit) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst("sub")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null;

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? branchId, [FromQuery] string? status, [FromQuery] string? search)
    {
        var query = db.Departments.Include(d => d.Branch).Include(d => d.ManagerEmployee).AsQueryable();
        if (branchId.HasValue) query = query.Where(d => d.BranchId == branchId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(d => d.Status == status);
        if (!string.IsNullOrEmpty(search)) query = query.Where(d => d.Name.Contains(search));
        return Ok(await query.OrderBy(d => d.Name).ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var department = await db.Departments.Include(d => d.Branch).Include(d => d.ManagerEmployee).FirstOrDefaultAsync(d => d.Id == id);
        return department is null ? NotFound() : Ok(department);
    }

    [RequirePermission("HR Master Data", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Department department)
    {
        var duplicate = await db.Departments.AnyAsync(d => d.Name == department.Name && d.BranchId == department.BranchId);
        if (duplicate) return Conflict(new { message = "A department with this name already exists for this branch." });

        department.Id = Guid.NewGuid();
        department.CreatedAt = department.UpdatedAt = DateTime.UtcNow;
        db.Departments.Add(department);
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Department created", entityType: "Department", entityId: department.Id,
            userId: CallerId(), branchId: department.BranchId, details: $"Created department {department.Name}", module: "HR Master Data");

        return CreatedAtAction(nameof(GetById), new { id = department.Id }, department);
    }

    [RequirePermission("HR Master Data", PermAction.Edit)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] Department updated)
    {
        var department = await db.Departments.FindAsync(id);
        if (department is null) return NotFound();

        department.Name = updated.Name;
        department.BranchId = updated.BranchId;
        department.ManagerEmployeeId = updated.ManagerEmployeeId;
        department.Status = updated.Status;
        department.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Department updated", entityType: "Department", entityId: department.Id,
            userId: CallerId(), branchId: department.BranchId, details: $"Updated department {department.Name}", module: "HR Master Data");

        return Ok(department);
    }

    [RequirePermission("HR Master Data", PermAction.Delete)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var department = await db.Departments.FindAsync(id);
        if (department is null) return NotFound();
        department.Status = "inactive";
        department.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Department deactivated", entityType: "Department", entityId: department.Id,
            userId: CallerId(), branchId: department.BranchId, severity: "warning", module: "HR Master Data");

        return NoContent();
    }
}
