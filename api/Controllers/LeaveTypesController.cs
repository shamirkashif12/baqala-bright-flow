using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/leave-types")]
public class LeaveTypesController(BaqalaDbContext db, IAuditService audit) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : null;

    private async Task<Guid?> ResolveEmployeeIdAsync(Guid? userId) =>
        userId.HasValue ? await db.Employees.Where(e => e.UserId == userId).Select(e => (Guid?)e.Id).FirstOrDefaultAsync() : null;

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? status)
    {
        var query = db.LeaveTypes.AsQueryable();
        if (!string.IsNullOrEmpty(status)) query = query.Where(t => t.Status == status);
        return Ok(await query.OrderBy(t => t.Name).ToListAsync());
    }

    [RequirePermission("Leave Management", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] LeaveType type)
    {
        type.Id = Guid.NewGuid();
        type.CreatedAt = type.UpdatedAt = DateTime.UtcNow;
        db.LeaveTypes.Add(type);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetAll), type);
    }

    [RequirePermission("Leave Management", PermAction.Edit)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] LeaveType updated)
    {
        var type = await db.LeaveTypes.FindAsync(id);
        if (type is null) return NotFound();
        type.Name = updated.Name;
        type.Status = updated.Status;
        type.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(type);
    }

    [RequirePermission("Leave Management", PermAction.Delete)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var type = await db.LeaveTypes.FindAsync(id);
        if (type is null) return NotFound();
        type.Status = "inactive";
        type.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var callerId = CallerId();
        await audit.LogAsync(action: "Leave type deactivated", entityType: "LeaveType", entityId: type.Id,
            userId: callerId, employeeId: await ResolveEmployeeIdAsync(callerId), beforeValue: type.Name, module: "HR Master Data");

        return NoContent();
    }
}
