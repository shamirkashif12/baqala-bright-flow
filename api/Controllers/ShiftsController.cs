using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ShiftsController(BaqalaDbContext db, IAuditService audit) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] Guid? branchId,
        [FromQuery] Guid? cashierId,
        [FromQuery] Guid? terminalId,
        [FromQuery] string? status,
        [FromQuery] DateTime? dateFrom,
        [FromQuery] DateTime? dateTo)
    {
        var query = db.CashierShifts.Include(s => s.Cashier).Include(s => s.Terminal).AsQueryable();
        if (branchId.HasValue)   query = query.Where(s => s.BranchId == branchId);
        if (cashierId.HasValue)  query = query.Where(s => s.CashierId == cashierId);
        if (terminalId.HasValue) query = query.Where(s => s.TerminalId == terminalId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(s => s.Status == status);
        if (dateFrom.HasValue) query = query.Where(s => s.OpenedAt >= dateFrom.Value);
        if (dateTo.HasValue)   query = query.Where(s => s.OpenedAt <= dateTo.Value.AddDays(1).AddTicks(-1));
        return Ok(await query.OrderByDescending(s => s.OpenedAt).ToListAsync());
    }

    [HttpGet("active")]
    public async Task<IActionResult> GetActiveShifts([FromQuery] Guid? branchId)
    {
        var query = db.CashierShifts.Where(s => s.Status == "open").Include(s => s.Cashier).AsQueryable();
        if (branchId.HasValue) query = query.Where(s => s.BranchId == branchId);
        return Ok(await query.ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var shift = await db.CashierShifts
            .Include(s => s.CashMovements)
            .FirstOrDefaultAsync(s => s.Id == id);
        return shift is null ? NotFound() : Ok(shift);
    }

    [HttpPost("open")]
    public async Task<IActionResult> OpenShift([FromBody] OpenShiftRequest req)
    {
        var existing = await db.CashierShifts
            .AnyAsync(s => s.CashierId == req.CashierId && s.Status == "open");
        if (existing) return Conflict("Cashier already has an open shift.");

        var now = DateTime.UtcNow;
        var shift = new CashierShift
        {
            Id = Guid.NewGuid(), CashierId = req.CashierId,
            BranchId = req.BranchId, TerminalId = req.TerminalId,
            OpeningAmount = req.OpeningAmount, Status = "open",
            OpenedAt = now
        };
        db.CashierShifts.Add(shift);

        if (req.TerminalId.HasValue)
        {
            var terminal = await db.Terminals.FindAsync(req.TerminalId.Value);
            if (terminal != null) { terminal.LastSync = now; terminal.UpdatedAt = now; }
        }

        await db.SaveChangesAsync();

        await audit.LogAsync(
            action: "Shift opened",
            entityType: "CashierShift",
            entityId: shift.Id,
            userId: req.CashierId,
            branchId: req.BranchId,
            details: $"Opening amount: SAR {req.OpeningAmount:F2}");

        return Created($"/api/shifts/{shift.Id}", shift);
    }

    [HttpPost("{id:guid}/close")]
    public async Task<IActionResult> CloseShift(Guid id, [FromBody] CloseShiftRequest req)
    {
        var shift = await db.CashierShifts.FindAsync(id);
        if (shift is null) return NotFound();
        if (shift.Status == "closed") return BadRequest("Shift already closed.");
        var now = DateTime.UtcNow;
        shift.ClosingAmount = req.ClosingAmount;
        shift.Notes = req.Notes;
        shift.Status = "closed";
        shift.ClosedAt = now;
        shift.Variance = req.ClosingAmount - (shift.OpeningAmount + shift.CashSales);

        if (shift.TerminalId.HasValue)
        {
            var terminal = await db.Terminals.FindAsync(shift.TerminalId.Value);
            if (terminal != null) { terminal.LastSync = now; terminal.UpdatedAt = now; }
        }

        await db.SaveChangesAsync();

        await audit.LogAsync(
            action: "Shift closed",
            entityType: "CashierShift",
            entityId: shift.Id,
            userId: shift.CashierId,
            branchId: shift.BranchId,
            details: $"Closing: SAR {req.ClosingAmount:F2} · Variance: SAR {shift.Variance:F2}");

        return Ok(shift);
    }

    [HttpPost("{id:guid}/cash-movements")]
    public async Task<IActionResult> AddCashMovement(Guid id, [FromBody] ShiftCashMovement movement)
    {
        if (!await db.CashierShifts.AnyAsync(s => s.Id == id && s.Status == "open"))
            return NotFound("Open shift not found.");
        movement.Id = Guid.NewGuid();
        movement.ShiftId = id;
        movement.CreatedAt = DateTime.UtcNow;
        db.ShiftCashMovements.Add(movement);
        await db.SaveChangesAsync();
        return Created($"/api/shifts/{id}/cash-movements/{movement.Id}", movement);
    }
}

public record OpenShiftRequest(Guid CashierId, Guid BranchId, Guid? TerminalId, decimal OpeningAmount);
public record CloseShiftRequest(decimal ClosingAmount, string? Notes);
