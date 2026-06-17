using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SuppliersController(BaqalaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? status, [FromQuery] string? supplyType)
    {
        var query = db.Suppliers.AsQueryable();
        if (!string.IsNullOrEmpty(status)) query = query.Where(s => s.Status == status);
        if (!string.IsNullOrEmpty(supplyType)) query = query.Where(s => s.SupplyType == supplyType);
        return Ok(await query.OrderBy(s => s.Name).ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var supplier = await db.Suppliers.FindAsync(id);
        return supplier is null ? NotFound() : Ok(supplier);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Supplier supplier)
    {
        supplier.Id = Guid.NewGuid();
        supplier.CreatedAt = supplier.UpdatedAt = DateTime.UtcNow;

        // Auto-generate supplier code: SUP-NNN
        var lastCode = await db.Suppliers
            .Where(s => s.SupplierCode.StartsWith("SUP-"))
            .OrderByDescending(s => s.SupplierCode)
            .Select(s => s.SupplierCode)
            .FirstOrDefaultAsync();
        int next = 1;
        if (lastCode is not null && int.TryParse(lastCode[4..], out int n)) next = n + 1;
        supplier.SupplierCode = $"SUP-{next:D3}";

        db.Suppliers.Add(supplier);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = supplier.Id }, supplier);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] Supplier updated)
    {
        var supplier = await db.Suppliers.FindAsync(id);
        if (supplier is null) return NotFound();
        supplier.Name = updated.Name;
        supplier.WarehouseName = updated.WarehouseName;
        supplier.ContactPerson = updated.ContactPerson;
        supplier.ContactNumber = updated.ContactNumber;
        supplier.Email = updated.Email;
        supplier.Address = updated.Address;
        supplier.City = updated.City;
        supplier.SupplyType = updated.SupplyType;
        supplier.Status = updated.Status;
        supplier.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(supplier);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var supplier = await db.Suppliers.FindAsync(id);
        if (supplier is null) return NotFound();
        supplier.Status = "inactive";
        supplier.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return NoContent();
    }
}
