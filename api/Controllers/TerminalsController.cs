using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TerminalsController(BaqalaDbContext db, INotificationService notifications) : ControllerBase
{
    // Branch-scoped roles (anything but tenant_admin) may only see their own branch's terminals —
    // same fix as DevicesController/OrdersController: branchId was only an optional query param.
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

        var query = db.Terminals.Include(t => t.Branch).Include(t => t.AssignedCashier).Include(t => t.Devices).AsQueryable();
        if (branchId.HasValue) query = query.Where(t => t.BranchId == branchId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(t => t.Status == status);
        return Ok(await query.ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var terminal = await db.Terminals.Include(t => t.Devices).FirstOrDefaultAsync(t => t.Id == id);
        return terminal is null ? NotFound() : Ok(terminal);
    }

    [RequirePermission("Terminals", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Terminal terminal)
    {
        terminal.Id = Guid.NewGuid();
        terminal.CreatedAt = terminal.UpdatedAt = DateTime.UtcNow;
        db.Terminals.Add(terminal);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = terminal.Id }, terminal);
    }

    [RequirePermission("Terminals", PermAction.Edit)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] Terminal updated)
    {
        var terminal = await db.Terminals.FindAsync(id);
        if (terminal is null) return NotFound();
        terminal.Name = updated.Name;
        terminal.BranchId = updated.BranchId;
        terminal.AssignedCashierId = updated.AssignedCashierId;
        terminal.Status = updated.Status;
        terminal.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(terminal);
    }

    [RequirePermission("Terminals", PermAction.Edit)]
    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateStatusRequest req)
    {
        var terminal = await db.Terminals.FindAsync(id);
        if (terminal is null) return NotFound();
        var prevStatus = terminal.Status;
        terminal.Status = req.Status;
        terminal.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        if (req.Status == "offline" && prevStatus != "offline")
        {
            await notifications.NotifyRoleAsync(["Manager", "Admin"], terminal.BranchId,
                "Terminal / Branch", "Terminal Offline", "Terminal Offline",
                $"Terminal {terminal.Name} is offline",
                severity: "error", entityType: "Terminal", entityId: terminal.Id);
        }

        return Ok(terminal);
    }

}
