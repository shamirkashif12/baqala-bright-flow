using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SettingsController(BaqalaDbContext db) : ControllerBase
{
    [HttpGet("pos/{branchId:guid}")]
    public async Task<IActionResult> GetPosSettings(Guid branchId)
    {
        var settings = await db.PosSettings.FirstOrDefaultAsync(s => s.BranchId == branchId);
        return settings is null ? NotFound() : Ok(settings);
    }

    [HttpPut("pos/{branchId:guid}")]
    public async Task<IActionResult> UpsertPosSettings(Guid branchId, [FromBody] PosSettings updated)
    {
        var settings = await db.PosSettings.FirstOrDefaultAsync(s => s.BranchId == branchId);
        if (settings is null)
        {
            updated.Id = Guid.NewGuid();
            updated.BranchId = branchId;
            updated.CreatedAt = updated.UpdatedAt = DateTime.UtcNow;
            db.PosSettings.Add(updated);
        }
        else
        {
            settings.RequireShiftOpen = updated.RequireShiftOpen;
            settings.RequireOpeningCashCount = updated.RequireOpeningCashCount;
            settings.AllowNegativeStock = updated.AllowNegativeStock;
            settings.RequireReasonForVoid = updated.RequireReasonForVoid;
            settings.RequireManagerApprovalForRefund = updated.RequireManagerApprovalForRefund;
            settings.AutoPrintReceipt = updated.AutoPrintReceipt;
            settings.OfflineModeEnabled = updated.OfflineModeEnabled;
            settings.UpdatedAt = DateTime.UtcNow;
        }
        await db.SaveChangesAsync();
        return Ok(settings ?? updated);
    }

    [HttpGet("attendance")]
    public async Task<IActionResult> GetAttendance([FromQuery] Guid? branchId, [FromQuery] DateOnly? date)
    {
        var query = db.StaffAttendances.Include(a => a.User).AsQueryable();
        if (branchId.HasValue) query = query.Where(a => a.BranchId == branchId);
        if (date.HasValue)
            query = query.Where(a => a.CheckIn != null &&
                DateOnly.FromDateTime(a.CheckIn.Value) == date);
        return Ok(await query.ToListAsync());
    }

    [HttpPost("attendance")]
    public async Task<IActionResult> RecordAttendance([FromBody] StaffAttendance attendance)
    {
        attendance.Id = Guid.NewGuid();
        attendance.CreatedAt = attendance.UpdatedAt = DateTime.UtcNow;
        db.StaffAttendances.Add(attendance);
        await db.SaveChangesAsync();
        return Created($"/api/settings/attendance/{attendance.Id}", attendance);
    }

    [HttpPatch("attendance/{id:guid}/checkout")]
    public async Task<IActionResult> CheckOut(Guid id)
    {
        var attendance = await db.StaffAttendances.FindAsync(id);
        if (attendance is null) return NotFound();
        attendance.CheckOut = DateTime.UtcNow;
        attendance.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(attendance);
    }
}
