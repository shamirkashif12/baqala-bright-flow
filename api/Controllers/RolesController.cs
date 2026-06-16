using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class RolesController(BaqalaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        return Ok(await db.Roles.Include(r => r.Permissions).OrderBy(r => r.Name).ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var role = await db.Roles.Include(r => r.Permissions).FirstOrDefaultAsync(r => r.Id == id);
        return role is null ? NotFound() : Ok(role);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Role role)
    {
        role.Id = Guid.NewGuid();
        role.CreatedAt = role.UpdatedAt = DateTime.UtcNow;
        foreach (var p in role.Permissions) { p.Id = Guid.NewGuid(); p.RoleId = role.Id; }
        db.Roles.Add(role);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = role.Id }, role);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] Role updated)
    {
        var role = await db.Roles.Include(r => r.Permissions).FirstOrDefaultAsync(r => r.Id == id);
        if (role is null) return NotFound();
        if (role.IsSystem) return BadRequest("Cannot modify system roles.");
        role.Name = updated.Name;
        role.NameAr = updated.NameAr;
        role.Description = updated.Description;
        role.UpdatedAt = DateTime.UtcNow;

        db.RolePermissions.RemoveRange(role.Permissions);
        foreach (var p in updated.Permissions) { p.Id = Guid.NewGuid(); p.RoleId = id; }
        db.RolePermissions.AddRange(updated.Permissions);
        await db.SaveChangesAsync();
        return Ok(role);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var role = await db.Roles.FindAsync(id);
        if (role is null) return NotFound();
        if (role.IsSystem) return BadRequest("Cannot delete system roles.");
        db.Roles.Remove(role);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
