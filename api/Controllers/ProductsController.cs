using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProductsController(BaqalaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? categoryId, [FromQuery] string? status, [FromQuery] string? search)
    {
        var query = db.Products.Include(p => p.Category).AsQueryable();
        if (categoryId.HasValue) query = query.Where(p => p.CategoryId == categoryId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(p => p.Status == status);
        if (!string.IsNullOrEmpty(search))
            query = query.Where(p => p.Name.Contains(search) || p.Sku.Contains(search) || (p.Barcode != null && p.Barcode.Contains(search)));
        return Ok(await query.OrderBy(p => p.Name).ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var product = await db.Products.Include(p => p.Category).FirstOrDefaultAsync(p => p.Id == id);
        return product is null ? NotFound() : Ok(product);
    }

    [HttpGet("barcode/{barcode}")]
    public async Task<IActionResult> GetByBarcode(string barcode)
    {
        var product = await db.Products.Include(p => p.Category).FirstOrDefaultAsync(p => p.Barcode == barcode);
        return product is null ? NotFound() : Ok(product);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Product product)
    {
        if (await db.Products.AnyAsync(p => p.Sku == product.Sku))
            return Conflict("SKU already exists.");
        product.Id = Guid.NewGuid();
        product.CreatedAt = product.UpdatedAt = DateTime.UtcNow;
        db.Products.Add(product);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = product.Id }, product);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] Product updated)
    {
        var product = await db.Products.FindAsync(id);
        if (product is null) return NotFound();
        product.Name = updated.Name;
        product.NameAr = updated.NameAr;
        product.CategoryId = updated.CategoryId;
        product.Brand = updated.Brand;
        product.BasePrice = updated.BasePrice;
        product.CostPrice = updated.CostPrice;
        product.TaxPercentage = updated.TaxPercentage;
        product.CustomFee = updated.CustomFee;
        product.ReorderLevel = updated.ReorderLevel;
        product.Status = updated.Status;
        product.WeightBased = updated.WeightBased;
        product.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(product);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var product = await db.Products.FindAsync(id);
        if (product is null) return NotFound();
        product.Status = "discontinued";
        product.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ─── Categories ──────────────────────────────────────────────────────────
    [HttpGet("/api/categories")]
    public async Task<IActionResult> GetCategories()
    {
        return Ok(await db.Categories.Where(c => c.IsActive).OrderBy(c => c.SortOrder).ToListAsync());
    }

    [HttpPost("/api/categories")]
    public async Task<IActionResult> CreateCategory([FromBody] Category category)
    {
        category.Id = Guid.NewGuid();
        category.CreatedAt = category.UpdatedAt = DateTime.UtcNow;
        db.Categories.Add(category);
        await db.SaveChangesAsync();
        return Created($"/api/categories/{category.Id}", category);
    }
}
