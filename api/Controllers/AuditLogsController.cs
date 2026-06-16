using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuditLogsController(BaqalaDbContext db) : ControllerBase
{
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
