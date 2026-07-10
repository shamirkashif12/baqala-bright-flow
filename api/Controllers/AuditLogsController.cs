using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuditLogsController(BaqalaDbContext db) : ControllerBase
{
    // Branch-scoped roles (anything but tenant_admin) may only see their own branch's events.
    // Rows with no BranchId (tenant-level actions — role/settings changes, etc.) are excluded
    // for scoped roles rather than shown, since they aren't "this branch's" activity either.
    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    // Previously ungated — any authenticated user of any role could call this directly and page
    // through the entire tenant audit trail, independent of whether their role's "Audit Logs"
    // permission (checked client-side by ModuleGate) even granted View.
    [RequirePermission("Audit Logs", PermAction.View)]
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] Guid? userId,
        [FromQuery] string? entityType,
        [FromQuery] Guid? entityId,
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        var query = db.AuditLogs.AsQueryable();
        if (userId.HasValue) query = query.Where(a => a.UserId == userId);
        if (!string.IsNullOrEmpty(entityType)) query = query.Where(a => a.EntityType == entityType);
        if (entityId.HasValue) query = query.Where(a => a.EntityId == entityId);
        if (from.HasValue) query = query.Where(a => a.CreatedAt >= from);
        if (to.HasValue) query = query.Where(a => a.CreatedAt <= to);

        var (role, branchId) = GetCallerContext();
        if (role is not null && role != "tenant_admin" && branchId.HasValue)
            query = query.Where(a => a.BranchId == branchId);

        var total = await query.CountAsync();
        var items = await query
            .OrderByDescending(a => a.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new { total, page, pageSize, items });
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] AuditLog log)
    {
        log.Id = Guid.NewGuid();
        log.CreatedAt = DateTime.UtcNow;
        db.AuditLogs.Add(log);
        await db.SaveChangesAsync();
        return Created($"/api/auditlogs/{log.Id}", log);
    }
}
