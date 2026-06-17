using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/warehouses")]
public class WarehousesController(BaqalaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll()
    {
        var warehouses = await db.Warehouses
            .Include(w => w.WarehouseSuppliers).ThenInclude(ws => ws.Supplier)
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
            .Include(w => w.WarehouseSuppliers).ThenInclude(ws => ws.Supplier)
            .Include(w => w.BranchWarehouses).ThenInclude(bw => bw.Branch)
            .Include(w => w.Stock).ThenInclude(s => s.Product)
            .FirstOrDefaultAsync(w => w.Id == id);
        return w is null ? NotFound() : Ok(w);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Warehouse warehouse)
    {
        warehouse.Id = Guid.NewGuid();
        warehouse.CreatedAt = warehouse.UpdatedAt = DateTime.UtcNow;
        db.Warehouses.Add(warehouse);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = warehouse.Id }, warehouse);
    }

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

    // Link supplier to warehouse
    [HttpPost("{id:guid}/suppliers")]
    public async Task<IActionResult> AddSupplier(Guid id, [FromBody] AddWarehouseSupplierRequest req)
    {
        var exists = await db.WarehouseSuppliers.AnyAsync(ws => ws.WarehouseId == id && ws.SupplierId == req.SupplierId);
        if (exists) return Conflict("Supplier already linked to this warehouse.");
        db.WarehouseSuppliers.Add(new WarehouseSupplier { Id = Guid.NewGuid(), WarehouseId = id, SupplierId = req.SupplierId, IsPrimary = req.IsPrimary, Notes = req.Notes, CreatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();
        return Ok();
    }

    [HttpDelete("{id:guid}/suppliers/{supplierId:guid}")]
    public async Task<IActionResult> RemoveSupplier(Guid id, Guid supplierId)
    {
        var ws = await db.WarehouseSuppliers.FirstOrDefaultAsync(ws => ws.WarehouseId == id && ws.SupplierId == supplierId);
        if (ws is null) return NotFound();
        db.WarehouseSuppliers.Remove(ws);
        await db.SaveChangesAsync();
        return NoContent();
    }

    // Link branch to warehouse
    [HttpPost("{id:guid}/branches")]
    public async Task<IActionResult> AddBranch(Guid id, [FromBody] AddBranchWarehouseRequest req)
    {
        var exists = await db.BranchWarehouses.AnyAsync(bw => bw.WarehouseId == id && bw.BranchId == req.BranchId);
        if (exists) return Conflict("Branch already linked to this warehouse.");
        db.BranchWarehouses.Add(new BranchWarehouse { Id = Guid.NewGuid(), WarehouseId = id, BranchId = req.BranchId, IsPrimary = req.IsPrimary, CreatedAt = DateTime.UtcNow });
        await db.SaveChangesAsync();
        return Ok();
    }

    [HttpDelete("{id:guid}/branches/{branchId:guid}")]
    public async Task<IActionResult> RemoveBranch(Guid id, Guid branchId)
    {
        var bw = await db.BranchWarehouses.FirstOrDefaultAsync(bw => bw.WarehouseId == id && bw.BranchId == branchId);
        if (bw is null) return NotFound();
        db.BranchWarehouses.Remove(bw);
        await db.SaveChangesAsync();
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

public record AddWarehouseSupplierRequest(Guid SupplierId, bool IsPrimary, string? Notes);
public record AddBranchWarehouseRequest(Guid BranchId, bool IsPrimary);
