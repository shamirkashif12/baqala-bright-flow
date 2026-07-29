using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

// Gated on "Devices" — there's no separate "Maintenance" entry in the RolePermissions module list,
// and tickets are strictly about device upkeep, so they share that module's ACL.
[ApiController]
[Route("api/maintenance-tickets")]
public class MaintenanceTicketsController(BaqalaDbContext db) : ControllerBase
{
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

        var query = db.MaintenanceTickets.Include(t => t.Device).ThenInclude(d => d!.Branch).AsQueryable();
        if (branchId.HasValue) query = query.Where(t => t.Device!.BranchId == branchId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(t => t.Status == status);
        return Ok(await query.OrderByDescending(t => t.CreatedAt).ToListAsync());
    }

    [RequirePermission("Devices", PermAction.Edit)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] MaintenanceTicket req)
    {
        var device = await db.Devices.FindAsync(req.DeviceId);
        if (device is null) return BadRequest(new { message = "Device not found." });

        var ticket = new MaintenanceTicket
        {
            Id = Guid.NewGuid(),
            DeviceId = req.DeviceId,
            IssueType = req.IssueType,
            Priority = req.Priority,
            Description = req.Description,
            ReportedBy = req.ReportedBy,
            Status = "open",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        db.MaintenanceTickets.Add(ticket);

        // A newly reported issue puts the device itself into "maintenance" so the device list's
        // status column and the Online/Offline metric cards immediately reflect the open ticket,
        // instead of only the (previously never-persisted) tickets tab knowing about it.
        if (device.Status == "active") device.Status = "maintenance";
        device.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
        ticket.Device = device;
        return CreatedAtAction(nameof(GetAll), new { }, ticket);
    }

    [RequirePermission("Devices", PermAction.Edit)]
    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] MaintenanceTicketStatusRequest req)
    {
        var ticket = await db.MaintenanceTickets.Include(t => t.Device).FirstOrDefaultAsync(t => t.Id == id);
        if (ticket is null) return NotFound();

        ticket.Status = req.Status;
        ticket.UpdatedAt = DateTime.UtcNow;

        // Resolving the ticket brings the device back online only if it has no OTHER open ticket —
        // a device with two concurrent issues shouldn't flip back to "active" just because one
        // of them was closed out.
        if (req.Status == "resolved" && ticket.Device is not null)
        {
            var hasOtherOpenTickets = await db.MaintenanceTickets
                .AnyAsync(t => t.DeviceId == ticket.DeviceId && t.Id != id && t.Status != "resolved");
            if (!hasOtherOpenTickets && ticket.Device.Status == "maintenance")
            {
                ticket.Device.Status = "active";
                ticket.Device.UpdatedAt = DateTime.UtcNow;
            }
        }

        await db.SaveChangesAsync();
        return Ok(ticket);
    }
}

public record MaintenanceTicketStatusRequest(string Status);
