using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

public interface IOrderVoidService
{
    /// <summary>Reverses stock, batch consumption and shift totals for a paid order and marks it
    /// cancelled. Extracted out of OrdersController so both an immediate (self-approve) void and a
    /// later Approval Center decision can execute the exact same side effect.</summary>
    Task VoidAsync(Order order, string? reason);
}

public class OrderVoidService(BaqalaDbContext db, IBatchConsumptionService batchConsumption, ILogger<OrderVoidService> logger) : IOrderVoidService
{
    public async Task VoidAsync(Order order, string? reason)
    {
        // Reverse inventory for every line — the items already left the shelf when the sale rang up.
        foreach (var item in order.Items)
        {
            var stock = await db.InventoryStocks.FirstOrDefaultAsync(s => s.ProductId == item.ProductId && s.BranchId == order.BranchId);
            if (stock != null)
            {
                stock.Quantity += item.Quantity;
                stock.LastUpdated = DateTime.UtcNow;
                stock.UpdatedAt = DateTime.UtcNow;
            }
        }

        // Best-effort, mirrors the same restore Create's ConsumeFefoAsync call needs undoing — without
        // this the specific batch a voided sale drew down never gets its RemainingQuantity (and
        // therefore its expiry visibility in the Inventory batch drill-down) back.
        foreach (var item in order.Items)
        {
            try { await batchConsumption.RestoreFefoAsync(item.ProductId, order.BranchId, warehouseId: null, item.Quantity); }
            catch (Exception ex) { logger.LogError(ex, "Batch restore failed for voided order {OrderId} product {ProductId}", order.Id, item.ProductId); }
        }

        // Reverse this order's contribution to its shift's running totals — otherwise a void
        // leaves CashSales/CardSales/DigitalSales/TotalSales overstated relative to the real
        // (now-cancelled) sale, the same class of reconciliation-variance bug as an order that
        // was never counted in the first place.
        if (order.ShiftId.HasValue)
        {
            var shift = await db.CashierShifts.FindAsync(order.ShiftId.Value);
            if (shift is not null)
            {
                foreach (var pay in order.Payments)
                {
                    switch (pay.PaymentMethod)
                    {
                        case "cash": shift.CashSales -= pay.Amount; break;
                        case "card": shift.CardSales -= pay.Amount; break;
                        default: shift.DigitalSales -= pay.Amount; break;
                    }
                    shift.TotalSales -= pay.Amount;
                }
            }
        }

        order.OrderStatus = "cancelled";
        order.VoidReason = reason;
        order.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }
}
