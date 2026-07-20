using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DevicesController(BaqalaDbContext db) : ControllerBase
{
    // Branch-scoped roles (anything but tenant_admin) may only see their own branch's devices —
    // branchId was previously just an optional query param, so a branch_manager fetching devices
    // with no filter (as the frontend does) saw every branch's device fleet.
    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? branchId, [FromQuery] string? status)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue) branchId = callerBranchId;

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
        if (device is null) return NotFound();

        // Branch-scoped roles may only look up their own branch's device — mirrors GetAll, which
        // this direct-by-id lookup previously bypassed entirely.
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue && device.BranchId != callerBranchId)
            return NotFound();

        return Ok(device);
    }

    [RequirePermission("Devices", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Device device)
    {
        device.Id = Guid.NewGuid();
        device.CreatedAt = device.UpdatedAt = DateTime.UtcNow;
        db.Devices.Add(device);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = device.Id }, device);
    }

    [RequirePermission("Devices", PermAction.Edit)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] Device updated)
    {
        var device = await db.Devices.FindAsync(id);
        if (device is null) return NotFound();
        device.DeviceName = updated.DeviceName;
        device.BranchId = updated.BranchId;
        device.TerminalId = updated.TerminalId;
        device.Status = updated.Status;
        device.BehaviourProfile = updated.BehaviourProfile;
        device.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(device);
    }

    [RequirePermission("Devices", PermAction.Edit)]
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
