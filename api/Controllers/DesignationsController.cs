using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DesignationsController(BaqalaDbContext db, IAuditService audit) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst("sub")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null;

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? departmentId, [FromQuery] string? status, [FromQuery] string? search)
    {
        var query = db.Designations.Include(d => d.Department).AsQueryable();
        if (departmentId.HasValue) query = query.Where(d => d.DepartmentId == departmentId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(d => d.Status == status);
        if (!string.IsNullOrEmpty(search)) query = query.Where(d => d.Name.Contains(search));
        return Ok(await query.OrderBy(d => d.Name).ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var designation = await db.Designations.Include(d => d.Department).FirstOrDefaultAsync(d => d.Id == id);
        return designation is null ? NotFound() : Ok(designation);
    }

    [RequirePermission("HR Master Data", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Designation designation)
    {
        var duplicate = await db.Designations.AnyAsync(d => d.Name == designation.Name && d.DepartmentId == designation.DepartmentId);
        if (duplicate) return Conflict(new { message = "A designation with this name already exists in this department." });

        designation.Id = Guid.NewGuid();
        designation.CreatedAt = designation.UpdatedAt = DateTime.UtcNow;
        db.Designations.Add(designation);
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Designation created", entityType: "Designation", entityId: designation.Id,
            userId: CallerId(), details: $"Created designation {designation.Name}", module: "HR Master Data");

        return CreatedAtAction(nameof(GetById), new { id = designation.Id }, designation);
    }

    [RequirePermission("HR Master Data", PermAction.Edit)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] Designation updated)
    {
        var designation = await db.Designations.FindAsync(id);
        if (designation is null) return NotFound();

        designation.Name = updated.Name;
        designation.DepartmentId = updated.DepartmentId;
        designation.Grade = updated.Grade;
        designation.Status = updated.Status;
        designation.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Designation updated", entityType: "Designation", entityId: designation.Id,
            userId: CallerId(), details: $"Updated designation {designation.Name}", module: "HR Master Data");

        return Ok(designation);
    }

    [RequirePermission("HR Master Data", PermAction.Delete)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var designation = await db.Designations.FindAsync(id);
        if (designation is null) return NotFound();
        designation.Status = "inactive";
        designation.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Designation deactivated", entityType: "Designation", entityId: designation.Id,
            userId: CallerId(), severity: "warning", module: "HR Master Data");

        return NoContent();
    }
}
