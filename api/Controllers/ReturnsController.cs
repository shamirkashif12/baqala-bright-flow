using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReturnsController(BaqalaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? branchId, [FromQuery] string? status)
    {
        var query = db.CustomerReturns.Include(r => r.Customer).Include(r => r.Order).AsQueryable();
        if (branchId.HasValue) query = query.Where(r => r.BranchId == branchId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(r => r.Status == status);
        return Ok(await query.OrderByDescending(r => r.CreatedAt).ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var ret = await db.CustomerReturns
            .Include(r => r.Items).ThenInclude(i => i.Product)
            .Include(r => r.Customer)
            .FirstOrDefaultAsync(r => r.Id == id);
        return ret is null ? NotFound() : Ok(ret);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CustomerReturn ret)
    {
        ret.Id = Guid.NewGuid();
        ret.ReturnNumber = $"RET-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}";
        ret.Status = "pending";
        ret.CreatedAt = ret.UpdatedAt = DateTime.UtcNow;
        foreach (var item in ret.Items) { item.Id = Guid.NewGuid(); item.ReturnId = ret.Id; }
        db.CustomerReturns.Add(ret);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = ret.Id }, ret);
    }

    [HttpPatch("{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ApproveReturnRequest req)
    {
        var ret = await db.CustomerReturns.FindAsync(id);
        if (ret is null) return NotFound();
        ret.Status = req.Approved ? "approved" : "rejected";
        ret.ApprovedBy = req.ApprovedBy;
        ret.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(ret);
    }
}

public record ApproveReturnRequest(bool Approved, Guid ApprovedBy);
