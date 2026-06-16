using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DevicesController(BaqalaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? branchId, [FromQuery] string? status)
    {
        var query = db.Devices
            .Include(d => d.Branch)
            .Include(d => d.Terminal)
            .AsQueryable();
        if (branchId.HasValue) query = query.Where(d => d.BranchId == branchId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(d => d.Status == status);
        return Ok(await query.OrderBy(d => d.DeviceName).ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var device = await db.Devices.Include(d => d.Branch).Include(d => d.Terminal).FirstOrDefaultAsync(d => d.Id == id);
        return device is null ? NotFound() : Ok(device);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Device device)
    {
        device.Id = Guid.NewGuid();
        device.CreatedAt = device.UpdatedAt = DateTime.UtcNow;
        db.Devices.Add(device);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = device.Id }, device);
    }

    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] DeviceStatusRequest req)
    {
        var device = await db.Devices.FindAsync(id);
        if (device is null) return NotFound();
        device.Status = req.Status;
        device.SyncStatus = req.SyncStatus ?? device.SyncStatus;
        device.LastActivity = DateTime.UtcNow;
        device.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(device);
    }
}

public record DeviceStatusRequest(string Status, string? SyncStatus);
