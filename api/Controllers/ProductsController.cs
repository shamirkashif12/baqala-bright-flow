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

    /// <summary>
    /// Trims a brand and folds it onto the spelling already in the catalogue when one matches
    /// case-insensitively. Brand is free text (deliberately — a normalised Brands table buys
    /// nothing until brands carry their own metadata), so without this "Nestle", "nestle" and
    /// "NESTLE " become three brands: the POS brand filter splits into near-duplicate entries and
    /// substitution suggestions miss products that are obviously the same brand.
    /// </summary>
    private async Task<string?> NormalizeBrandAsync(string? brand)
    {
        if (string.IsNullOrWhiteSpace(brand)) return null;
        var trimmed = System.Text.RegularExpressions.Regex.Replace(brand.Trim(), @"\s+", " ");

        // MySQL's default collation is case-insensitive, so this matches regardless of casing and
        // returns the spelling already stored — the first spelling entered wins, consistently.
        var existing = await db.Products
            .Where(p => p.Brand != null && p.Brand == trimmed)
            .Select(p => p.Brand)
            .FirstOrDefaultAsync();
        return existing ?? trimmed;
    }

    /// <summary>
    /// Canonicalises the unit/pack/weight fields and rejects combinations that cannot be honoured
    /// downstream. Both Create and Update run this, because every one of these rules is a silent
    /// data corruption if only one path enforces it — a product edited into an illegal shape breaks
    /// exactly as badly as one created that way.
    ///
    /// Returns an error message, or null when the product is valid (mutated in place to canonical form).
    /// </summary>
    private async Task<string?> NormalizeUnitFieldsAsync(Product product, Guid? existingId)
    {
        // ── Unit of measure is the source of truth; WeightBased is derived from it ──────
        // The client may send either (older builds of the POS only knew WeightBased). If the unit
        // is still the default but WeightBased was explicitly set, honour that intent and promote
        // it to a real kilogram product rather than silently dropping fractional support.
        if (product.WeightBased && !UnitOfMeasureCatalog.IsFractional(product.UnitOfMeasure))
            product.UnitOfMeasure = "kilogram";
        product.UnitOfMeasure = UnitOfMeasureCatalog.Normalize(product.UnitOfMeasure);
        product.WeightBased = UnitOfMeasureCatalog.IsFractional(product.UnitOfMeasure);

        // ── Estimated unit weight: only meaningful on a fractional product ──────────────
        // On a piece-counted product it would mean "the weight of one piece in pieces", which is
        // nonsense, so it's cleared rather than stored to confuse the POS later.
        if (!product.WeightBased) product.EstimatedUnitWeight = null;
        else if (product.EstimatedUnitWeight is <= 0)
            return "Estimated weight per item must be greater than zero, or left blank.";

        // ── Pack fields (FRD §12) ──────────────────────────────────────────────────────
        product.SaleUnitType = product.SaleUnitType == "pack" ? "pack" : "single";
        product.ItemsPerPack = product.SaleUnitType == "pack"
            ? (product.ItemsPerPack is > 0 ? product.ItemsPerPack : 1)
            : null;
        product.LooseUnitProductId = product.SaleUnitType == "pack" ? product.LooseUnitProductId : null;

        // A pack is a discrete physical container — you sell 2 cartons, never 0.4 of one. Allowing
        // a fractional unit here would let Break Pack be asked to open half a box, and its whole
        // -unit guard (which reads WeightBased) would no longer fire.
        if (product.SaleUnitType == "pack" && product.WeightBased)
            return $"A product sold as a pack must be counted, not measured — \"{UnitOfMeasureCatalog.Get(product.UnitOfMeasure).Code}\" is a weight/volume unit.";

        if (product.LooseUnitProductId is { } looseId)
        {
            // Self-reference would make Break Pack consume and produce the same stock row, looping
            // a carton into itself and inflating on-hand without bound.
            if (existingId.HasValue && looseId == existingId.Value)
                return "A pack cannot break down into itself — pick a different loose-unit product.";

            var loose = await db.Products.FindAsync(looseId);
            if (loose is null)
                return "The selected loose-unit product no longer exists.";
            // Chains ("carton breaks into 6-pack breaks into bottle") are refused rather than
            // supported: Break Pack converts one level, so a chain would strand stock in the middle
            // tier with no way to reach the sellable unit. Keeping the target a non-pack makes the
            // relationship exactly one level deep by construction, so no cycle is even expressible.
            if (loose.SaleUnitType == "pack")
                return $"\"{loose.Name}\" is itself sold as a pack. A pack must break down into a single-unit product.";
            if (loose.Status == "discontinued")
                return $"\"{loose.Name}\" is discontinued and cannot be used as a loose unit.";
            // Breaking a carton produces ItemsPerPack *whole* loose items; a fractional loose
            // product would mean a carton yields "12 kg of egg", which no sale path can reconcile.
            if (loose.WeightBased)
                return $"\"{loose.Name}\" is sold by weight/volume. A pack must break down into a counted product.";
        }

        return null;
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
        // Unit of measure, derived WeightBased, estimated unit weight, and pack/loose-unit fields
        // (FRD §12) — canonicalised and cross-validated in one place shared with Update.
        product.Brand = await NormalizeBrandAsync(product.Brand);
        if (await NormalizeUnitFieldsAsync(product, existingId: null) is { } unitError)
            return BadRequest(new { message = unitError });
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
        product.Brand = await NormalizeBrandAsync(updated.Brand);
        product.BasePrice = updated.BasePrice;
        product.CostPrice = updated.CostPrice;
        product.TaxPercentage = updated.TaxPercentage;
        product.ReorderLevel = updated.ReorderLevel;
        product.Status = updated.Status;
        product.IsTobacco = updated.IsTobacco;
        product.Discount = updated.Discount;
        product.DiscountType = updated.DiscountType;
        product.ImageUrl = updated.ImageUrl;
        product.Description = updated.Description;
        product.UnitOfMeasure = updated.UnitOfMeasure;
        product.WeightBased = updated.WeightBased;
        product.EstimatedUnitWeight = updated.EstimatedUnitWeight;
        product.SaleUnitType = updated.SaleUnitType;
        product.ItemsPerPack = updated.ItemsPerPack;
        product.LooseUnitProductId = updated.LooseUnitProductId;
        // Same canonicalisation and cross-validation as Create — an edit can put a product into
        // every illegal shape a create can.
        if (await NormalizeUnitFieldsAsync(product, existingId: id) is { } unitError)
            return BadRequest(new { message = unitError });

        // Switching a product OFF a fractional unit while fractional stock is on hand would leave
        // an unsellable remainder that no whole-unit sale can ever clear and no stock count can
        // reconcile. Caught here rather than left to fail confusingly at the next sale.
        if (!product.WeightBased)
        {
            var fractionalStock = await db.InventoryStocks
                .Where(s => s.ProductId == id && s.Quantity != Math.Floor(s.Quantity))
                .Select(s => (decimal?)s.Quantity)
                .FirstOrDefaultAsync();
            if (fractionalStock.HasValue)
                return BadRequest(new { message = $"\"{product.Name}\" cannot switch to a counted unit while {fractionalStock:0.###} is on hand — adjust the stock to a whole number first." });
        }

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

    // ─── Units of measure ────────────────────────────────────────────────────

    /// <summary>
    /// The unit picker's options. Served from the server rather than duplicated as a frontend
    /// constant so the list the operator picks from is definitionally the list the API accepts —
    /// a client-side copy would drift and start producing values that normalise to "piece".
    /// </summary>
    [HttpGet("units")]
    public IActionResult GetUnits() => Ok(UnitOfMeasureCatalog.All.Select(u => new
    {
        code = u.Code,
        category = u.Category,
        decimalPlaces = u.DecimalPlaces,
        fractional = UnitOfMeasureCatalog.IsFractional(u.Code),
        subUnitLabel = u.SubUnitLabel,
        subUnitsPerUnit = u.SubUnitsPerUnit,
    }));

    // ─── Brands ──────────────────────────────────────────────────────────────

    /// <summary>
    /// Distinct brands in the catalogue, for the Add/Edit form's typeahead. Feeding the input from
    /// what already exists is the whole anti-fragmentation mechanism — an operator picks "Nestle"
    /// instead of retyping it slightly differently.
    /// </summary>
    [HttpGet("brands")]
    public async Task<IActionResult> GetBrands()
    {
        var brands = await db.Products
            .Where(p => p.Brand != null && p.Brand != "" && p.Status != "discontinued")
            .Select(p => p.Brand!)
            .Distinct()
            .OrderBy(b => b)
            .ToListAsync();
        return Ok(brands);
    }

    // ─── Substitutes (brand substitution) ────────────────────────────────────

    /// <summary>
    /// Interchangeable products for <paramref name="id"/> — what a cashier can offer when this item
    /// is out of stock. When a branch is supplied, each substitute carries its on-hand quantity
    /// there, since a substitute with no stock is not a usable suggestion.
    /// </summary>
    [HttpGet("{id:guid}/substitutes")]
    public async Task<IActionResult> GetSubstitutes(Guid id, [FromQuery] Guid? branchId)
    {
        var links = await db.ProductSubstitutes
            .Where(s => s.ProductId == id)
            .Include(s => s.SubstituteProduct)
            .ToListAsync();

        var products = links
            .Select(l => l.SubstituteProduct)
            .Where(p => p is not null && p.Status != "discontinued")
            .Select(p => p!)
            .ToList();

        // Filtered in memory after materialising: the MySQL provider mistranslates
        // `list.Contains(x.Id)` against a DbSet, so the IN-list is built client-side.
        var ids = products.Select(p => p.Id).ToList();
        var stockByProduct = branchId.HasValue
            ? (await db.InventoryStocks
                .Where(s => s.BranchId == branchId)
                .Select(s => new { s.ProductId, s.Quantity })
                .ToListAsync())
                .Where(s => ids.Contains(s.ProductId))
                .GroupBy(s => s.ProductId)
                .ToDictionary(g => g.Key, g => g.Sum(x => x.Quantity))
            : [];

        return Ok(products
            .OrderByDescending(p => stockByProduct.GetValueOrDefault(p.Id))
            .ThenBy(p => p.Name)
            .Select(p => new
            {
                p.Id, p.Name, p.NameAr, p.Sku, p.Barcode, p.Brand, p.BasePrice,
                p.UnitOfMeasure, p.WeightBased, p.ImageUrl, p.Status,
                quantity = stockByProduct.GetValueOrDefault(p.Id),
            }));
    }

    /// <summary>
    /// Links two products as substitutes. Written in BOTH directions so the suggestion appears
    /// whichever of the pair runs out — a one-way row would help a cashier only half the time, and
    /// which half would depend on the arbitrary order they were linked in.
    /// </summary>
    [RequirePermission("Inventory", PermAction.Edit)]
    [HttpPost("{id:guid}/substitutes")]
    public async Task<IActionResult> AddSubstitute(Guid id, [FromBody] AddSubstituteRequest req)
    {
        if (id == req.SubstituteProductId)
            return BadRequest(new { message = "A product cannot be its own substitute." });

        var product = await db.Products.FindAsync(id);
        if (product is null) return NotFound(new { message = "Product not found." });
        var substitute = await db.Products.FindAsync(req.SubstituteProductId);
        if (substitute is null) return NotFound(new { message = "Substitute product not found." });
        if (substitute.Status == "discontinued")
            return BadRequest(new { message = $"\"{substitute.Name}\" is discontinued and cannot be offered as a substitute." });

        // Substituting across units would mean swapping "1 piece" for "1 kilogram" at the till —
        // the quantity on the cart line carries over, so the customer is charged for the wrong
        // amount of a physically different thing.
        if (!string.Equals(product.UnitOfMeasure, substitute.UnitOfMeasure, StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = $"\"{substitute.Name}\" is sold by {substitute.UnitOfMeasure} but \"{product.Name}\" is sold by {product.UnitOfMeasure} — only products sharing a unit can substitute for each other." });

        var callerId = CallerId();
        var now = DateTime.UtcNow;

        // Idempotent: re-linking an existing pair is a no-op rather than a unique-index violation,
        // and a pair half-written by an earlier partial failure is completed rather than rejected.
        foreach (var (from, to) in new[] { (id, req.SubstituteProductId), (req.SubstituteProductId, id) })
        {
            if (await db.ProductSubstitutes.AnyAsync(s => s.ProductId == from && s.SubstituteProductId == to)) continue;
            db.ProductSubstitutes.Add(new ProductSubstitute
            {
                Id = Guid.NewGuid(), ProductId = from, SubstituteProductId = to,
                CreatedBy = callerId, CreatedAt = now,
            });
        }
        await db.SaveChangesAsync();

        try
        {
            await audit.LogAsync(action: "link_product_substitute", entityType: "Product", entityId: id,
                userId: callerId, employeeId: await ResolveEmployeeIdAsync(callerId), branchId: CallerBranchId(),
                notes: $"{product.Name} ↔ {substitute.Name}", module: "Inventory");
        }
        catch (Exception ex) { logger.LogError(ex, "Audit log failed for substitute link on product {ProductId}", id); }

        return Ok(new { message = $"\"{substitute.Name}\" linked as a substitute." });
    }

    [RequirePermission("Inventory", PermAction.Edit)]
    [HttpDelete("{id:guid}/substitutes/{substituteId:guid}")]
    public async Task<IActionResult> RemoveSubstitute(Guid id, Guid substituteId)
    {
        // Both directions go together — leaving the mirror row behind would keep suggesting the
        // pair from one side after the operator believed they had unlinked it.
        var links = await db.ProductSubstitutes
            .Where(s => (s.ProductId == id && s.SubstituteProductId == substituteId)
                     || (s.ProductId == substituteId && s.SubstituteProductId == id))
            .ToListAsync();
        if (links.Count == 0) return NotFound();

        db.ProductSubstitutes.RemoveRange(links);
        await db.SaveChangesAsync();

        var callerId = CallerId();
        try
        {
            await audit.LogAsync(action: "unlink_product_substitute", entityType: "Product", entityId: id,
                userId: callerId, employeeId: await ResolveEmployeeIdAsync(callerId), branchId: CallerBranchId(),
                beforeValue: $"substituteProductId={substituteId}", module: "Inventory");
        }
        catch (Exception ex) { logger.LogError(ex, "Audit log failed for substitute unlink on product {ProductId}", id); }

        return NoContent();
    }
}

public record ItemDeletionRequest(string? Reason);

public record AddSubstituteRequest(Guid SubstituteProductId);
