using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TerminalsController(BaqalaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? branchId)
    {
        var query = db.Terminals.Include(t => t.Branch).Include(t => t.AssignedCashier).Include(t => t.Devices).AsQueryable();
        if (branchId.HasValue) query = query.Where(t => t.BranchId == branchId);
        return Ok(await query.ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var terminal = await db.Terminals.Include(t => t.Devices).FirstOrDefaultAsync(t => t.Id == id);
        return terminal is null ? NotFound() : Ok(terminal);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Terminal terminal)
    {
        terminal.Id = Guid.NewGuid();
        terminal.CreatedAt = terminal.UpdatedAt = DateTime.UtcNow;
        db.Terminals.Add(terminal);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = terminal.Id }, terminal);
    }

    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateStatusRequest req)
    {
        var terminal = await db.Terminals.FindAsync(id);
        if (terminal is null) return NotFound();
        terminal.Status = req.Status;
        terminal.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(terminal);
    }

}
