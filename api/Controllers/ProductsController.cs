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
    IProductDeletionService productDeletion,
    IApprovalNotificationService approvalNotifications,
    ITenantPlanService tenantPlans,
    ILogger<ProductsController> logger) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : null;

    // Mirrors GetCallerContext elsewhere — the Employee Audit Center's "Branch" column for catalog
    // actions is the branch the acting employee was logged in from, not a property of the product
    // itself (the catalog is tenant-wide, so a product has no branch of its own).
    private Guid? CallerBranchId() =>
        Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;

    // FRD 16.1 "POS Actions" — mirrors OrdersController.ResolveEmployeeIdAsync. Without this,
    // create/update/delete product audit rows carried userId only, so the Employee Audit Center's
    // employee filter (which matches on EmployeeId) silently dropped every one of them.
    private async Task<Guid?> ResolveEmployeeIdAsync(Guid? userId) =>
        userId.HasValue ? (await db.Employees.Where(e => e.UserId == userId).Select(e => (Guid?)e.Id).FirstOrDefaultAsync()) : null;

    // The catalog fields a reviewer cares about, in the shape src/lib/audit-changes.ts diffs.
    internal static object Snapshot(Product p) => new
    {
        name = p.Name,
        sku = p.Sku,
        barcode = p.Barcode,
        basePrice = p.BasePrice,
        costPrice = p.CostPrice,
        taxPercentage = p.TaxPercentage,
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
            var callerId = CallerId();
            await audit.LogAsync(
                action: action,
                entityType: "Product",
                entityId: p.Id,
                userId: callerId,
                employeeId: await ResolveEmployeeIdAsync(callerId),
                branchId: CallerBranchId(),
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
        if (product.BasePrice <= 0)
            return BadRequest(new { message = "Selling price must be greater than zero." });
        if (product.CostPrice is <= 0)
            return BadRequest(new { message = "Purchase price must be greater than zero, or left blank." });
        if (await db.Products.AnyAsync(p => p.Sku == product.Sku))
            return Conflict(new { message = $"SKU \"{product.Sku}\" is already used by another product." });
        if (!await tenantPlans.CanCreateProductAsync())
            return StatusCode(403, new { message = "Product limit reached for your plan. Upgrade to add more products." });
        // Discontinued products are excluded — that barcode is free to reuse once its old product
        // was soft-deleted, otherwise a re-added item is permanently blocked by its own predecessor.
        if (!string.IsNullOrWhiteSpace(product.Barcode) &&
            await db.Products.AnyAsync(p => p.Barcode == product.Barcode && p.Status != "discontinued"))
        {
            var existing = await db.Products.FirstAsync(p => p.Barcode == product.Barcode && p.Status != "discontinued");
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
        if (updated.BasePrice <= 0)
            return BadRequest(new { message = "Selling price must be greater than zero." });
        if (updated.CostPrice is <= 0)
            return BadRequest(new { message = "Purchase price must be greater than zero, or left blank." });
        var product = await db.Products.FindAsync(id);
        if (product is null) return NotFound();
        // Sku/Barcode were never copied from `updated` below, so edits to either field silently
        // did nothing — the request returned 200 with the product unchanged, no error shown.
        // Same uniqueness checks as Create, scoped to exclude this product's own current row.
        if (!string.Equals(product.Sku, updated.Sku, StringComparison.Ordinal) &&
            await db.Products.AnyAsync(p => p.Id != id && p.Sku == updated.Sku))
            return Conflict(new { message = $"SKU \"{updated.Sku}\" is already used by another product." });
        if (!string.IsNullOrWhiteSpace(updated.Barcode) &&
            !string.Equals(product.Barcode, updated.Barcode, StringComparison.Ordinal) &&
            await db.Products.AnyAsync(p => p.Id != id && p.Barcode == updated.Barcode && p.Status != "discontinued"))
        {
            var existing = await db.Products.FirstAsync(p => p.Barcode == updated.Barcode && p.Status != "discontinued");
            return Conflict(new { message = $"Barcode {updated.Barcode} is already assigned to \"{existing.Name}\". Edit that product instead." });
        }
        var previousPrice = product.BasePrice;
        var previousCost = product.CostPrice;
        // Snapshot before any field is overwritten — this is the "before" half of the audit row.
        var before = Snapshot(product);
        product.Name = updated.Name;
        product.NameAr = updated.NameAr;
        product.Sku = updated.Sku;
        product.Barcode = updated.Barcode;
        product.CategoryId = updated.CategoryId;
        product.Brand = updated.Brand;
        product.BasePrice = updated.BasePrice;
        product.CostPrice = updated.CostPrice;
        product.TaxPercentage = updated.TaxPercentage;
        product.ReorderLevel = updated.ReorderLevel;
        product.Status = updated.Status;
        product.WeightBased = updated.WeightBased;
        product.IsTobacco = updated.IsTobacco;
        product.Discount = updated.Discount;
        product.DiscountType = updated.DiscountType;
        product.ImageUrl = updated.ImageUrl;
        product.Description = updated.Description;
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
                entityType: "Product", entityId: product.Id, triggeredBy: CallerId());
        }

        if (previousCost != product.CostPrice)
        {
            await notifications.NotifyRoleAsync(["Manager", "Admin"], null,
                "Inventory", "Cost Price Updated", "Cost Price Updated",
                $"Cost price updated for {product.Name}: SAR {previousCost:F2} → SAR {product.CostPrice:F2}",
                entityType: "Product", entityId: product.Id, triggeredBy: CallerId());
        }

        return Ok(product);
    }

    // No self-approve bypass, even for a caller who holds Inventory:Approve — every product
    // deletion queues in the Approval Center and always needs a second person's decision (the
    // Approval Center UI itself already blocks approving your own request). This is deliberately
    // stricter than Discounts/Refunds/Order Cancellation, which do let a manager act on their own
    // request immediately.
    [RequirePermission("Inventory", PermAction.Delete)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, [FromBody] ItemDeletionRequest? req)
    {
        var product = await db.Products.FindAsync(id);
        if (product is null) return NotFound();

        var pending = new ApprovalRequest
        {
            RequestType = "item_deletion",
            EntityType = "Product",
            EntityId = product.Id,
            RequestedBy = CallerId() ?? Guid.Empty,
            BranchId = CallerBranchId(),
            Reason = req?.Reason,
            // Snapshot the name so the Approval Center's Details column shows what's actually being
            // deleted instead of a generic "Product deletion" — and so it still means something
            // after approval, since a hard-deleted Category (unlike a soft-deleted Product) no
            // longer exists to look the name up from at that point.
            DetailsJson = System.Text.Json.JsonSerializer.Serialize(new { Name = product.Name, Sku = product.Sku }),
        };
        db.ApprovalRequests.Add(pending);
        await db.SaveChangesAsync();
        await approvalNotifications.NotifyPendingAsync(pending, "Inventory",
            "Product deletion awaiting approval",
            $"{product.Name} ({product.Sku}) is queued for deletion and needs your approval.");
        return Accepted(new { message = "Deletion request sent for manager approval.", approvalRequestId = pending.Id });
    }

    // ─── Categories ──────────────────────────────────────────────────────────
    [HttpGet("/api/categories")]
    public async Task<IActionResult> GetCategories(bool includeInactive = false)
    {
        var query = db.Categories.AsQueryable();
        if (!includeInactive) query = query.Where(c => c.IsActive);
        var categories = await query.OrderBy(c => c.SortOrder).ToListAsync();

        // A queued deletion request left no trace on the category itself — clicking Delete looked
        // like it did nothing, since the row stayed exactly as it was until someone dug into the
        // Approval Center. Same fix as OrdersController's PendingApproval annotation.
        var pendingByCategory = (await db.ApprovalRequests
                .Include(a => a.RequestedByUser)
                .Where(a => a.Status == "pending" && a.EntityType == "Category")
                .OrderByDescending(a => a.RequestedAt)
                .ToListAsync())
            .Where(a => a.EntityId.HasValue)
            .GroupBy(a => a.EntityId!.Value)
            .ToDictionary(g => g.Key, g => g.First());

        return Ok(categories.Select(c => new
        {
            c.Id, c.Name, c.NameAr, c.SortOrder, c.IsActive, c.ParentId, c.Description, c.ImageUrl, c.CreatedAt, c.UpdatedAt,
            PendingApproval = pendingByCategory.TryGetValue(c.Id, out var pa)
                ? new { pa.Id, pa.RequestType, pa.RequestedAt, RequestedByName = pa.RequestedByUser?.FullName, pa.Reason, Summary = ApprovalsController.EntityLabel(pa) }
                : null,
        }));
    }

    // Subcategories are just Category rows with ParentId set — only two levels are supported
    // (category -> subcategory), so a parent-to-be may not itself already have a parent.
    private async Task<string?> ValidateParentAsync(Guid? parentId, Guid selfId)
    {
        if (!parentId.HasValue) return null;
        if (parentId.Value == selfId) return "A category cannot be its own parent.";
        var parent = await db.Categories.FindAsync(parentId.Value);
        if (parent is null) return "Selected parent category does not exist.";
        if (parent.ParentId.HasValue) return "A subcategory cannot itself be a parent — only two levels are supported.";
        return null;
    }

    [RequirePermission("Inventory", PermAction.Create)]
    [HttpPost("/api/categories")]
    public async Task<IActionResult> CreateCategory([FromBody] Category category)
    {
        var parentError = await ValidateParentAsync(category.ParentId, Guid.Empty);
        if (parentError is not null) return BadRequest(new { message = parentError });
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
        if (updated.ParentId != category.ParentId)
        {
            var parentError = await ValidateParentAsync(updated.ParentId, id);
            if (parentError is not null) return BadRequest(new { message = parentError });
            if (updated.ParentId.HasValue && await db.Categories.AnyAsync(c => c.ParentId == id))
                return BadRequest(new { message = "This category has subcategories and cannot itself become a subcategory." });
        }
        category.Name = updated.Name;
        category.NameAr = updated.NameAr;
        category.IsActive = updated.IsActive;
        category.SortOrder = updated.SortOrder;
        category.ParentId = updated.ParentId;
        category.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(category);
    }

    // No self-approve bypass — same reasoning as Delete above, category deletion is the same
    // "item_deletion" request type and gets the same no-exceptions treatment.
    [RequirePermission("Inventory", PermAction.Delete)]
    [HttpDelete("/api/categories/{id:guid}")]
    public async Task<IActionResult> DeleteCategory(Guid id, [FromBody] ItemDeletionRequest? req)
    {
        var category = await db.Categories.FindAsync(id);
        if (category is null) return NotFound();

        // The DB's self-referencing FK (and the Products FK) are DeleteBehavior.Restrict, so an
        // unguarded delete would only fail once approved, deep in the Approval Center flow. Catch
        // it here instead with a message the person queuing the deletion can actually act on.
        if (await db.Categories.AnyAsync(c => c.ParentId == id))
            return Conflict(new { message = "Cannot delete a category that has subcategories. Delete or reassign them first." });
        if (await db.Products.AnyAsync(p => p.CategoryId == id))
            return Conflict(new { message = "Cannot delete this category while products are still assigned to it. Reassign those products first." });

        var pending = new ApprovalRequest
        {
            RequestType = "item_deletion",
            EntityType = "Category",
            EntityId = category.Id,
            RequestedBy = CallerId() ?? Guid.Empty,
            Reason = req?.Reason,
            // Snapshot — a Category is hard-deleted once approved, so there'd be nothing left to
            // look the name up from at that point.
            DetailsJson = System.Text.Json.JsonSerializer.Serialize(new { Name = category.Name }),
        };
        db.ApprovalRequests.Add(pending);
        await db.SaveChangesAsync();
        await approvalNotifications.NotifyPendingAsync(pending, "Inventory",
            "Category deletion awaiting approval",
            $"Category {category.Name} is queued for deletion and needs your approval.");
        return Accepted(new { message = "Deletion request sent for manager approval.", approvalRequestId = pending.Id });
    }

    // ─── Product Image Gallery ───────────────────────────────────────────────
    // Product.ImageUrl stays the single "primary" image exactly as before — these are additional,
    // optional gallery images. Mirrors SupplierDocument/EmployeeDocument's sub-resource shape (the
    // app's established multi-attachment pattern): base64 data-URL in a longtext column, no disk/
    // CDN storage anywhere in this codebase.
    [HttpGet("{id:guid}/images")]
    public async Task<IActionResult> GetImages(Guid id)
    {
        var images = await db.ProductImages.Where(i => i.ProductId == id).OrderBy(i => i.SortOrder).ToListAsync();
        return Ok(images);
    }

    [RequirePermission("Inventory", PermAction.Edit)]
    [HttpPost("{id:guid}/images")]
    public async Task<IActionResult> UploadImage(Guid id, [FromBody] ProductImage image)
    {
        var product = await db.Products.FindAsync(id);
        if (product is null) return NotFound(new { message = "Product not found." });

        var nextSort = await db.ProductImages.Where(i => i.ProductId == id).Select(i => (int?)i.SortOrder).MaxAsync() ?? -1;
        image.Id = Guid.NewGuid();
        image.ProductId = id;
        image.SortOrder = nextSort + 1;
        image.UploadedBy = CallerId();
        image.UploadedAt = DateTime.UtcNow;
        db.ProductImages.Add(image);
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Product gallery image uploaded", entityType: "ProductImage", entityId: image.Id,
            userId: CallerId(), details: product.Name, module: "Inventory");

        return CreatedAtAction(nameof(GetImages), new { id }, image);
    }

    [RequirePermission("Inventory", PermAction.Edit)]
    [HttpDelete("{id:guid}/images/{imageId:guid}")]
    public async Task<IActionResult> DeleteImage(Guid id, Guid imageId)
    {
        var image = await db.ProductImages.FirstOrDefaultAsync(i => i.Id == imageId && i.ProductId == id);
        if (image is null) return NotFound();
        db.ProductImages.Remove(image);
        await db.SaveChangesAsync();

        await audit.LogAsync(action: "Product gallery image deleted", entityType: "ProductImage", entityId: imageId,
            userId: CallerId(), severity: "warning", module: "Inventory");

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
        if (await db.ProductVariants.AnyAsync(v => v.ProductId == id &&
                v.VariantType == variant.VariantType && v.VariantValue == variant.VariantValue))
        {
            return Conflict(new { message = $"This product already has a \"{variant.VariantType}: {variant.VariantValue}\" variant." });
        }
        if (!string.IsNullOrWhiteSpace(variant.Barcode))
        {
            if (await db.Products.AnyAsync(p => p.Barcode == variant.Barcode && p.Status != "discontinued"))
                return Conflict(new { message = $"Barcode {variant.Barcode} is already assigned to another product." });
            if (await db.ProductVariants.AnyAsync(v => v.Barcode == variant.Barcode))
                return Conflict(new { message = $"Barcode {variant.Barcode} is already used by another variant." });
        }

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

        var callerId = CallerId();
        await audit.LogAsync(action: "Product variant deleted", entityType: "ProductVariant", entityId: v.Id,
            userId: callerId, employeeId: await ResolveEmployeeIdAsync(callerId),
            branchId: CallerBranchId(), beforeValue: $"productId={id}", module: "Inventory");

        return NoContent();
    }
}

public record ItemDeletionRequest(string? Reason);
