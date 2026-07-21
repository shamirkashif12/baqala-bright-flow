using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HolidaysController(BaqalaDbContext db, IAuditService audit) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst("sub")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null;

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] Guid? branchId,
        [FromQuery] int? year,
        [FromQuery] string? holidayType,
        [FromQuery] string? status,
        [FromQuery] string? search,
        [FromQuery] int? page,
        [FromQuery] int? pageSize)
    {
        var query = db.Holidays.Include(h => h.Branch).AsQueryable();
        if (branchId.HasValue) query = query.Where(h => h.BranchId == branchId);
        if (year.HasValue) query = query.Where(h => h.Date >= new DateOnly(year.Value, 1, 1) && h.Date <= new DateOnly(year.Value, 12, 31));
        if (!string.IsNullOrEmpty(holidayType)) query = query.Where(h => h.HolidayType == holidayType);
        if (!string.IsNullOrEmpty(status)) query = query.Where(h => h.Status == status);
        if (!string.IsNullOrEmpty(search)) query = query.Where(h => h.Name.Contains(search));

        query = query.OrderBy(h => h.Date);
        if (!page.HasValue && !pageSize.HasValue) return Ok(await query.ToListAsync());
        var totalCount = await query.CountAsync();
        var effectivePageSize = pageSize is > 0 and <= 200 ? pageSize.Value : 25;
        var effectivePage = page is > 0 ? page.Value : 1;
        var rows = await query.Skip((effectivePage - 1) * effectivePageSize).Take(effectivePageSize).ToListAsync();
        return Ok(new { items = rows, totalCount });
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var holiday = await db.Holidays.Include(h => h.Branch).FirstOrDefaultAsync(h => h.Id == id);
        return holiday is null ? NotFound() : Ok(holiday);
    }

    [RequirePermission("HR Master Data", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Holiday holiday)
    {
        holiday.Id = Guid.NewGuid();
        holiday.CreatedAt = holiday.UpdatedAt = DateTime.UtcNow;
        db.Holidays.Add(holiday);
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Holiday created", entityType: "Holiday", entityId: holiday.Id,
            userId: CallerId(), branchId: holiday.BranchId, details: $"Created holiday {holiday.Name} ({holiday.Date})", module: "HR Master Data");

        return CreatedAtAction(nameof(GetById), new { id = holiday.Id }, holiday);
    }

    [RequirePermission("HR Master Data", PermAction.Edit)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] Holiday updated)
    {
        var holiday = await db.Holidays.FindAsync(id);
        if (holiday is null) return NotFound();

        holiday.Name = updated.Name;
        holiday.HolidayType = updated.HolidayType;
        holiday.Date = updated.Date;
        holiday.BranchId = updated.BranchId;
        holiday.Description = updated.Description;
        holiday.Status = updated.Status;
        holiday.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Holiday updated", entityType: "Holiday", entityId: holiday.Id,
            userId: CallerId(), branchId: holiday.BranchId, details: $"Updated holiday {holiday.Name}", module: "HR Master Data");

        return Ok(holiday);
    }

    [RequirePermission("HR Master Data", PermAction.Delete)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var holiday = await db.Holidays.FindAsync(id);
        if (holiday is null) return NotFound();
        holiday.Status = "inactive";
        holiday.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Holiday deactivated", entityType: "Holiday", entityId: holiday.Id,
            userId: CallerId(), branchId: holiday.BranchId, severity: "warning", module: "HR Master Data");

        return NoContent();
    }
}
