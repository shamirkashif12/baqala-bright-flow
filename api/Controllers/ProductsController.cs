using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProductsController(
    BaqalaDbContext db,
    INotificationService notifications,
    IAuditService audit,
    ILogger<ProductsController> logger) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : null;

    // The catalog fields a reviewer cares about, in the shape src/lib/audit-changes.ts diffs.
    // Catalog rows are tenant-wide, so these audit rows carry no branchId.
    private static object Snapshot(Product p) => new
    {
        name = p.Name,
        sku = p.Sku,
        barcode = p.Barcode,
        basePrice = p.BasePrice,
        costPrice = p.CostPrice,
        taxPercentage = p.TaxPercentage,
        customFee = p.CustomFee,
        reorderLevel = p.ReorderLevel,
        status = p.Status,
        isTobacco = p.IsTobacco,
        categoryId = p.CategoryId,
    };

    // Best-effort throughout: the catalog write is already committed by the time we log, so a
    // failed audit write must never turn a successful save into a 500 for the caller.
    private async Task TryAudit(string action, Product p, string severity = "info", object? before = null)
    {
        try
        {
            await audit.LogAsync(
                action: action,
                entityType: "Product",
                entityId: p.Id,
                userId: CallerId(),
                details: System.Text.Json.JsonSerializer.Serialize(Snapshot(p)),
                severity: severity,
                beforeValue: before is null ? null : System.Text.Json.JsonSerializer.Serialize(before));
        }
        catch (Exception ex) { logger.LogError(ex, "Audit log failed for product {ProductId} ({Action})", p.Id, action); }
    }

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

    [RequirePermission("Inventory", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Product product)
    {
        if (await db.Products.AnyAsync(p => p.Sku == product.Sku))
            return Conflict(new { message = $"SKU \"{product.Sku}\" is already used by another product." });
        if (!string.IsNullOrWhiteSpace(product.Barcode) &&
            await db.Products.AnyAsync(p => p.Barcode == product.Barcode))
        {
            var existing = await db.Products.FirstAsync(p => p.Barcode == product.Barcode);
            return Conflict(new { message = $"Barcode {product.Barcode} is already assigned to \"{existing.Name}\". Edit that product instead." });
        }
        product.Id = Guid.NewGuid();
        product.CreatedAt = product.UpdatedAt = DateTime.UtcNow;
        // Pack & unit pricing (FRD §12): a "single" never carries a pack size, a "pack" always has
        // one (default 1 if the client omitted it).
        product.SaleUnitType = product.SaleUnitType == "pack" ? "pack" : "single";
        product.ItemsPerPack = product.SaleUnitType == "pack"
            ? (product.ItemsPerPack is > 0 ? product.ItemsPerPack : 1)
            : null;
        db.Products.Add(product);
        await db.SaveChangesAsync();
        // "Added Items" in the Employee Audit Center — a new catalog item was previously written
        // with no audit row at all, so adding a product left no trace of who did it.
        await TryAudit("create_product", product);
        return CreatedAtAction(nameof(GetById), new { id = product.Id }, product);
    }

    [RequirePermission("Inventory", PermAction.Edit)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] Product updated)
    {
        var product = await db.Products.FindAsync(id);
        if (product is null) return NotFound();
        var previousPrice = product.BasePrice;
        // Snapshot before any field is overwritten — this is the "before" half of the audit row.
        var before = Snapshot(product);
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
        product.IsTobacco = updated.IsTobacco;
        product.Discount = updated.Discount;
        product.DiscountType = updated.DiscountType;
        product.ImageUrl = updated.ImageUrl;
        // Pack & unit pricing (FRD §12). Normalised so a "single" product never carries a stray
        // pack size and a "pack" always has one — the same guard the create path applies.
        product.SaleUnitType = updated.SaleUnitType == "pack" ? "pack" : "single";
        product.ItemsPerPack = product.SaleUnitType == "pack"
            ? (updated.ItemsPerPack is > 0 ? updated.ItemsPerPack : 1)
            : null;
        product.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        // "Price Changes" in the Employee Audit Center. A price edit previously fired a
        // notification (below) but wrote no audit row — the alert was transient and named no
        // actor, so there was no durable record of who repriced an item. A price move is the
        // edit worth flagging to a reviewer; other catalog edits stay informational.
        await TryAudit("update_product", product,
            severity: previousPrice != product.BasePrice ? "warning" : "info",
            before: before);

        if (previousPrice != product.BasePrice)
        {
            // Catalog is tenant-wide (not branch-specific), so this is a broadcast to every
            // Manager/Admin rather than a single branch — unlike the shift/return/transfer
            // triggers which scope to the branch the event happened in.
            await notifications.NotifyRoleAsync(["Manager", "Admin"], null,
                "Sales / Checkout", "Price Updated", "Price Updated",
                $"Price updated for {product.Name}: SAR {previousPrice:F2} → SAR {product.BasePrice:F2}",
                entityType: "Product", entityId: product.Id);
        }

        return Ok(product);
    }

    [RequirePermission("Inventory", PermAction.Delete)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var product = await db.Products.FindAsync(id);
        if (product is null) return NotFound();
        var before = Snapshot(product);
        product.Status = "discontinued";
        product.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        // "Deleted Items" in the Employee Audit Center. Note this is a soft delete (status flips to
        // discontinued), so the before/after reads as a status change rather than a vanished row.
        await TryAudit("delete_product", product, severity: "warning", before: before);
        return NoContent();
    }

    // ─── Categories ──────────────────────────────────────────────────────────
    [HttpGet("/api/categories")]
    public async Task<IActionResult> GetCategories()
    {
        return Ok(await db.Categories.Where(c => c.IsActive).OrderBy(c => c.SortOrder).ToListAsync());
    }

    [RequirePermission("Inventory", PermAction.Create)]
    [HttpPost("/api/categories")]
    public async Task<IActionResult> CreateCategory([FromBody] Category category)
    {
        category.Id = Guid.NewGuid();
        category.CreatedAt = category.UpdatedAt = DateTime.UtcNow;
        db.Categories.Add(category);
        await db.SaveChangesAsync();
        return Created($"/api/categories/{category.Id}", category);
    }

    [RequirePermission("Inventory", PermAction.Edit)]
    [HttpPut("/api/categories/{id:guid}")]
    public async Task<IActionResult> UpdateCategory(Guid id, [FromBody] Category updated)
    {
        var category = await db.Categories.FindAsync(id);
        if (category is null) return NotFound();
        category.Name = updated.Name;
        category.NameAr = updated.NameAr;
        category.IsActive = updated.IsActive;
        category.SortOrder = updated.SortOrder;
        category.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(category);
    }

    [RequirePermission("Inventory", PermAction.Delete)]
    [HttpDelete("/api/categories/{id:guid}")]
    public async Task<IActionResult> DeleteCategory(Guid id)
    {
        var category = await db.Categories.FindAsync(id);
        if (category is null) return NotFound();
        db.Categories.Remove(category);
        await db.SaveChangesAsync();
        return NoContent();
    }

    // ─── Product Variants ────────────────────────────────────────────────────

    [HttpGet("{id:guid}/variants")]
    public async Task<IActionResult> GetVariants(Guid id)
    {
        return Ok(await db.ProductVariants.Where(v => v.ProductId == id).ToListAsync());
    }

    [HttpPost("{id:guid}/variants")]
    public async Task<IActionResult> AddVariant(Guid id, [FromBody] ProductVariant variant)
    {
        variant.Id = Guid.NewGuid();
        variant.ProductId = id;
        variant.CreatedAt = variant.UpdatedAt = DateTime.UtcNow;
        db.ProductVariants.Add(variant);
        await db.SaveChangesAsync();
        return Ok(variant);
    }

    [HttpDelete("{id:guid}/variants/{variantId:guid}")]
    public async Task<IActionResult> DeleteVariant(Guid id, Guid variantId)
    {
        var v = await db.ProductVariants.FirstOrDefaultAsync(v => v.ProductId == id && v.Id == variantId);
        if (v is null) return NotFound();
        db.ProductVariants.Remove(v);
        await db.SaveChangesAsync();
        return NoContent();
    }
}
