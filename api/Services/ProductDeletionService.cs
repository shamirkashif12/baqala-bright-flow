using BaqalaPOS.Api.Controllers;
using BaqalaPOS.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

public interface IProductDeletionService
{
    /// <summary>Soft-deletes (discontinues) a product. Returns false if the product no longer exists.</summary>
    Task<bool> DeleteProductAsync(Guid id, Guid? actorId, Guid? branchId = null);

    /// <summary>Hard-deletes a category. Returns false if the category no longer exists.</summary>
    Task<bool> DeleteCategoryAsync(Guid id, Guid? actorId);
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
            await audit.LogAsync(
                action: "delete_product",
                entityType: "Product",
                entityId: product.Id,
                userId: actorId,
                employeeId: employeeId,
                branchId: branchId,
                details: System.Text.Json.JsonSerializer.Serialize(ProductsController.Snapshot(product)),
                severity: "warning",
                beforeValue: System.Text.Json.JsonSerializer.Serialize(before));
        }
        catch (Exception ex) { logger.LogError(ex, "Audit log failed for product {ProductId} (delete_product)", product.Id); }

        return true;
    }

    public async Task<bool> DeleteCategoryAsync(Guid id, Guid? actorId)
    {
        var category = await db.Categories.FindAsync(id);
        if (category is null) return false;

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
                severity: "warning");
        }
        catch (Exception ex) { logger.LogError(ex, "Audit log failed for category {CategoryId} (delete_category)", id); }

        return true;
    }
}
