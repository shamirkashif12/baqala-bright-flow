using BaqalaPOS.Api.Controllers;
using BaqalaPOS.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

public enum CategoryDeletionOutcome { Deleted, NotFound, HasSubcategories, HasProducts }

public interface IProductDeletionService
{
    /// <summary>Soft-deletes (discontinues) a product. Returns false if the product no longer exists.</summary>
    Task<bool> DeleteProductAsync(Guid id, Guid? actorId, Guid? branchId = null);

    /// <summary>Hard-deletes a category, re-checking it's still deletable at this later point in time.</summary>
    Task<CategoryDeletionOutcome> DeleteCategoryAsync(Guid id, Guid? actorId);
}

// Extracted out of ProductsController so both an immediate (self-approve) deletion and a later
// Approval Center decision execute the exact same side effect.
public class ProductDeletionService(BaqalaDbContext db, IAuditService audit, ILogger<ProductDeletionService> logger) : IProductDeletionService
{
    public async Task<bool> DeleteProductAsync(Guid id, Guid? actorId, Guid? branchId = null)
    {
        var product = await db.Products.FindAsync(id);
        if (product is null) return false;

        var before = ProductsController.Snapshot(product);
        product.Status = "discontinued";
        product.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        try
        {
            // Employee Audit Center: without employeeId this row was dropped whenever the
            // employee filter was applied (it only matches on EmployeeId, not UserId).
            var employeeId = actorId.HasValue
                ? await db.Employees.Where(e => e.UserId == actorId).Select(e => (Guid?)e.Id).FirstOrDefaultAsync()
                : null;

            // What was still on the shelf when the product went. A deletion snapshot of catalog
            // fields alone can't answer the auditor's actual question — how much stock did this
            // remove from view, and where was it — so the quantities are captured here, at the
            // one moment they're still true.
            var branchQty = await db.InventoryStocks.Where(s => s.ProductId == product.Id).SumAsync(s => (decimal?)s.Quantity) ?? 0m;
            var warehouseQty = await db.WarehouseStocks.Where(s => s.ProductId == product.Id).SumAsync(s => (decimal?)s.Quantity) ?? 0m;

            var snapshot = System.Text.Json.JsonSerializer.Serialize(new
            {
                product.Name,
                product.Sku,
                product.Barcode,
                product.BasePrice,
                Status = product.Status,
                BranchStockOnHand = branchQty,
                WarehouseStockOnHand = warehouseQty,
                // Shaped like every other snapshot's Items array so the shared audit-detail
                // resolver renders it as a product line without special-casing deletions.
                Items = new[] { new { ProductId = product.Id, Quantity = branchQty + warehouseQty, UnitPrice = product.BasePrice, TotalPrice = (branchQty + warehouseQty) * product.BasePrice } },
            });

            await audit.LogAsync(
                action: "delete_product",
                entityType: "Product",
                entityId: product.Id,
                userId: actorId,
                employeeId: employeeId,
                branchId: branchId,
                details: snapshot,
                severity: "warning",
                // Module was never set, so this row was invisible to the Employee Activity
                // Report's module filter — a product deletion is Inventory activity.
                module: "Inventory",
                beforeValue: System.Text.Json.JsonSerializer.Serialize(before));
        }
        catch (Exception ex) { logger.LogError(ex, "Audit log failed for product {ProductId} (delete_product)", product.Id); }

        return true;
    }

    public async Task<CategoryDeletionOutcome> DeleteCategoryAsync(Guid id, Guid? actorId)
    {
        var category = await db.Categories.FindAsync(id);
        if (category is null) return CategoryDeletionOutcome.NotFound;

        // Re-checked here, not just when the deletion was first requested — a category's FK is
        // DeleteBehavior.Restrict, and time passes between queuing a deletion and a manager
        // approving it. A product or subcategory landing on this category in that window used to
        // surface as an unhandled DbUpdateException (a raw 500) instead of the same friendly
        // conflict the initial request-time check already gives.
        if (await db.Categories.AnyAsync(c => c.ParentId == id))
            return CategoryDeletionOutcome.HasSubcategories;
        if (await db.Products.AnyAsync(p => p.CategoryId == id))
            return CategoryDeletionOutcome.HasProducts;

        var before = new { category.Name, category.NameAr, category.IsActive };
        db.Categories.Remove(category);
        await db.SaveChangesAsync();

        try
        {
            await audit.LogAsync(
                action: "delete_category",
                entityType: "Category",
                entityId: id,
                userId: actorId,
                details: System.Text.Json.JsonSerializer.Serialize(before),
                severity: "warning",
                module: "Inventory");
        }
        catch (Exception ex) { logger.LogError(ex, "Audit log failed for category {CategoryId} (delete_category)", id); }

        return CategoryDeletionOutcome.Deleted;
    }
}
