using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/discounts")]
public class DiscountsController(BaqalaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] bool? isActive)
    {
        var query = db.Discounts
            .Include(d => d.Product)
            .Include(d => d.Branch)
            .AsQueryable();
        if (isActive.HasValue) query = query.Where(d => d.IsActive == isActive.Value);
        return Ok(await query.OrderByDescending(d => d.CreatedAt).ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var d = await db.Discounts.Include(x => x.Product).Include(x => x.Branch).FirstOrDefaultAsync(x => x.Id == id);
        return d is null ? NotFound() : Ok(d);
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] DiscountRequest req)
    {
        var discount = new Discount
        {
            Id = Guid.NewGuid(),
            Name = req.Name,
            NameAr = req.NameAr,
            AppliesTo = req.AppliesTo ?? "all",
            ProductId = req.ProductId,
            CategoryId = req.CategoryId,
            BranchId = req.BranchId,
            DiscountType = req.DiscountType ?? "percentage",
            Value = req.Value,
            IsActive = req.IsActive ?? true,
            StartDate = req.StartDate,
            EndDate = req.EndDate,
            RequiresCustomer = req.RequiresCustomer ?? false,
            MinCustomerTier = req.MinCustomerTier,
            ExcludedProductIdsJson = SerializeExclusions(req.ExcludedProductIds),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        db.Discounts.Add(discount);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = discount.Id }, discount);
    }

    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] DiscountRequest req)
    {
        var d = await db.Discounts.FindAsync(id);
        if (d is null) return NotFound();
        d.Name = req.Name;
        d.NameAr = req.NameAr;
        d.AppliesTo = req.AppliesTo ?? d.AppliesTo;
        d.ProductId = req.ProductId;
        d.CategoryId = req.CategoryId;
        d.BranchId = req.BranchId;
        d.DiscountType = req.DiscountType ?? d.DiscountType;
        d.Value = req.Value;
        d.IsActive = req.IsActive ?? d.IsActive;
        d.StartDate = req.StartDate;
        d.EndDate = req.EndDate;
        d.RequiresCustomer = req.RequiresCustomer ?? d.RequiresCustomer;
        d.MinCustomerTier = req.MinCustomerTier;
        d.ExcludedProductIdsJson = SerializeExclusions(req.ExcludedProductIds);
        d.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(d);
    }

    private static string? SerializeExclusions(List<Guid>? ids) =>
        ids is { Count: > 0 } ? System.Text.Json.JsonSerializer.Serialize(ids) : null;

    [HttpPatch("{id:guid}/toggle")]
    public async Task<IActionResult> Toggle(Guid id)
    {
        var d = await db.Discounts.FindAsync(id);
        if (d is null) return NotFound();
        d.IsActive = !d.IsActive;
        d.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(d);
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var d = await db.Discounts.FindAsync(id);
        if (d is null) return NotFound();
        db.Discounts.Remove(d);
        await db.SaveChangesAsync();
        return NoContent();
    }
}

public record DiscountRequest(
    string Name,
    string? NameAr,
    string? AppliesTo,
    Guid? ProductId,
    Guid? CategoryId,
    Guid? BranchId,
    string? DiscountType,
    decimal Value,
    bool? IsActive,
    DateTime? StartDate,
    DateTime? EndDate,
    bool? RequiresCustomer,
    string? MinCustomerTier,
    List<Guid>? ExcludedProductIds
);
