using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/warehouses")]
public class WarehousesController(BaqalaDbContext db, IAuditService audit) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : null;

    private async Task<Guid?> ResolveEmployeeIdAsync(Guid? userId) =>
        userId.HasValue ? await db.Employees.Where(e => e.UserId == userId).Select(e => (Guid?)e.Id).FirstOrDefaultAsync() : null;

    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var warehouses = await db.Warehouses
            .Include(w => w.BranchWarehouses).ThenInclude(bw => bw.Branch)
            .Include(w => w.Stock).ThenInclude(s => s.Product)
            .OrderBy(w => w.Name)
            .ToListAsync();
        return Ok(warehouses);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var w = await db.Warehouses
            .Include(w => w.BranchWarehouses).ThenInclude(bw => bw.Branch)
            .Include(w => w.Stock).ThenInclude(s => s.Product)
            .FirstOrDefaultAsync(w => w.Id == id);
        return w is null ? NotFound() : Ok(w);
    }

    [RequirePermission("Warehouses", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Warehouse warehouse)
    {
        warehouse.Id = Guid.NewGuid();
        warehouse.CreatedAt = warehouse.UpdatedAt = DateTime.UtcNow;
        db.Warehouses.Add(warehouse);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = warehouse.Id }, warehouse);
    }

    [RequirePermission("Warehouses", PermAction.Edit)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] Warehouse updated)
    {
        var w = await db.Warehouses.FindAsync(id);
        if (w is null) return NotFound();
        w.Name = updated.Name; w.NameAr = updated.NameAr; w.Address = updated.Address;
        w.City = updated.City; w.Capacity = updated.Capacity;
        w.ContactPerson = updated.ContactPerson; w.ContactNumber = updated.ContactNumber;
        w.Status = updated.Status; w.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(w);
    }

    // Link branch to warehouse
    [RequirePermission("Warehouses", PermAction.Edit)]
    [HttpPost("{id:guid}/branches")]
    public async Task<IActionResult> AddBranch(Guid id, [FromBody] AddBranchWarehouseRequest req)
    {
        var exists = await db.BranchWarehouses.AnyAsync(bw => bw.WarehouseId == id && bw.BranchId == req.BranchId);
        if (exists) return Conflict("Branch already linked to this warehouse.");
        db.BranchWarehouses.Add(new BranchWarehouse { Id = Guid.NewGuid(), WarehouseId = id, BranchId = req.BranchId, CreatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();
        return Ok();
    }

    [RequirePermission("Warehouses", PermAction.Edit)]
    [HttpDelete("{id:guid}/branches/{branchId:guid}")]
    public async Task<IActionResult> RemoveBranch(Guid id, Guid branchId)
    {
        var bw = await db.BranchWarehouses.FirstOrDefaultAsync(bw => bw.WarehouseId == id && bw.BranchId == branchId);
        if (bw is null) return NotFound();
        db.BranchWarehouses.Remove(bw);
        await db.SaveChangesAsync();

        var callerId = CallerId();
        await audit.LogAsync(action: "Branch unlinked from warehouse", entityType: "BranchWarehouse", entityId: bw.Id,
            userId: callerId, employeeId: await ResolveEmployeeIdAsync(callerId), branchId: branchId, beforeValue: $"warehouseId={id}", module: "Warehouses");

        return NoContent();
    }

    [HttpGet("{id:guid}/stock")]
    public async Task<IActionResult> GetStock(Guid id)
    {
        var stock = await db.WarehouseStocks
            .Include(s => s.Product)
            .Where(s => s.WarehouseId == id)
            .OrderBy(s => s.Product.Name)
            .ToListAsync();
        return Ok(stock);
    }
}

public record AddBranchWarehouseRequest(Guid BranchId);
