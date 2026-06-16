using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BranchesController(BaqalaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? status)
    {
        var query = db.Branches.AsQueryable();
        if (!string.IsNullOrEmpty(status)) query = query.Where(b => b.Status == status);
        return Ok(await query.OrderBy(b => b.Name).ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var branch = await db.Branches.FindAsync(id);
        return branch is null ? NotFound() : Ok(branch);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Branch branch)
    {
        branch.Id = Guid.NewGuid();
        branch.CreatedAt = branch.UpdatedAt = DateTime.UtcNow;
        db.Branches.Add(branch);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = branch.Id }, branch);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] Branch updated)
    {
        var branch = await db.Branches.FindAsync(id);
        if (branch is null) return NotFound();
        branch.Name = updated.Name;
        branch.NameAr = updated.NameAr;
        branch.Address = updated.Address;
        branch.City = updated.City;
        branch.ContactNumber = updated.ContactNumber;
        branch.Status = updated.Status;
        branch.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(branch);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var branch = await db.Branches.FindAsync(id);
        if (branch is null) return NotFound();
        branch.Status = "disabled";
        branch.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return NoContent();
    }
}
