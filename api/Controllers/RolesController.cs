using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class RolesController(BaqalaDbContext db, IAuditService audit) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : null;

    private async Task<Guid?> ResolveEmployeeIdAsync(Guid? userId) =>
        userId.HasValue ? await db.Employees.Where(e => e.UserId == userId).Select(e => (Guid?)e.Id).FirstOrDefaultAsync() : null;

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var roles = await db.Roles.Include(r => r.Permissions).OrderBy(r => r.Name).ToListAsync();

        var counts = await db.Users
            .GroupBy(u => u.RoleId)
            .Select(g => new { RoleId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.RoleId, x => x.Count);

        foreach (var r in roles)
            r.UserCount = counts.GetValueOrDefault(r.Id, 0);

        return Ok(roles);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var role = await db.Roles.Include(r => r.Permissions).FirstOrDefaultAsync(r => r.Id == id);
        if (role is null) return NotFound();

        role.UserCount = await db.Users.CountAsync(u => u.RoleId == id);
        return Ok(role);
    }

    [RequirePermission("Roles", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Role role)
    {
        role.Id = Guid.NewGuid();
        role.CreatedAt = role.UpdatedAt = DateTime.UtcNow;
        role.IsSystem = false;
        foreach (var p in role.Permissions) { p.Id = Guid.NewGuid(); p.RoleId = role.Id; }
        db.Roles.Add(role);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = role.Id }, role);
    }

    [RequirePermission("Roles", PermAction.Edit)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] Role updated)
    {
        var role = await db.Roles.Include(r => r.Permissions).FirstOrDefaultAsync(r => r.Id == id);
        if (role is null) return NotFound();

        // For system roles: protect name/description but allow permission updates
        if (!role.IsSystem)
        {
            role.Name = updated.Name;
            role.NameAr = updated.NameAr;
            role.Description = updated.Description;
        }
        role.UpdatedAt = DateTime.UtcNow;

        db.RolePermissions.RemoveRange(role.Permissions);
        foreach (var p in updated.Permissions) { p.Id = Guid.NewGuid(); p.RoleId = id; }
        db.RolePermissions.AddRange(updated.Permissions);
        await db.SaveChangesAsync();

        // Reload with fresh permissions
        var refreshed = await db.Roles.Include(r => r.Permissions).FirstAsync(r => r.Id == id);
        refreshed.UserCount = await db.Users.CountAsync(u => u.RoleId == id);
        return Ok(refreshed);
    }

    [RequirePermission("Roles", PermAction.Delete)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var role = await db.Roles.FindAsync(id);
        if (role is null) return NotFound();
        if (role.IsSystem) return BadRequest(new { message = "System roles cannot be deleted." });
        db.Roles.Remove(role);
        await db.SaveChangesAsync();

        var callerId = CallerId();
        await audit.LogAsync(action: "Role deleted", entityType: "Role", entityId: role.Id,
            userId: callerId, employeeId: await ResolveEmployeeIdAsync(callerId), severity: "warning", beforeValue: role.Name, module: "Roles");

        return Ok(new { deleted = true });
    }
}
