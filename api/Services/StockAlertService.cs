using BaqalaPOS.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

// On-demand counterpart to OperationalAlertsService's 15-minute background sweep: lets a
// stock-reducing request (POS sale, wastage / stock-out adjustment, physical-count reconciliation)
// raise a Low Stock / Out of Stock notification the moment on-hand crosses the reorder threshold,
// instead of waiting up to 15 minutes for the next scan. Deliberately mirrors the thresholds,
// dedup rule, message, category and recipients of OperationalAlertsService.ScanStockLevelsAsync
// so the immediate check and the background scan agree on what counts as "low"/"out".
public interface IStockAlertService
{
    Task CheckStockLevelAsync(Guid productId, Guid branchId, CancellationToken ct = default);
}

public class StockAlertService(BaqalaDbContext db, INotificationService notifications) : IStockAlertService
{
    public async Task CheckStockLevelAsync(Guid productId, Guid branchId, CancellationToken ct = default)
    {
        var stock = await db.InventoryStocks
            .Include(s => s.Product)
            .FirstOrDefaultAsync(s => s.ProductId == productId && s.BranchId == branchId, ct);
        if (stock?.Product is null || stock.Product.Status != "active") return;
        if (stock.Quantity > stock.ReorderLevel) return;

        var isOutOfStock = stock.Quantity <= 0;
        var type = isOutOfStock ? "Out of Stock" : "Low Stock Alert";

        // Skip if an unread alert of this kind already exists for the product/branch — same coarse
        // dedup the background scan uses, so a run of sales doesn't produce a wall of duplicates.
        var alreadyNotified = await db.Notifications.AnyAsync(n =>
            n.Type == type && n.EntityId == stock.ProductId && n.BranchId == stock.BranchId && !n.IsRead, ct);
        if (alreadyNotified) return;

        var message = isOutOfStock
            ? $"Out of stock: {stock.Product.Name}"
            : $"Low stock: {stock.Product.Name} only {stock.Quantity:F0} units left";

        await notifications.NotifyRoleAsync(["Manager", "Admin"], stock.BranchId,
            "Inventory", type, type, message,
            severity: isOutOfStock ? "error" : "warning",
            entityType: "Product", entityId: stock.ProductId);
    }
}
