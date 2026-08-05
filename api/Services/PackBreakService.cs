using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

/// <summary>
/// Converting on-hand packs into on-hand loose units — breaking a carton of 12 eggs into 12 eggs.
///
/// Extracted out of InventoryController.BreakPack because the same conversion is now needed from
/// two places: the manual Inventory action (staff pre-breaking cartons onto the shelf) and
/// checkout, where a cashier selling 3 loose eggs from a shelf that only has cartons left would
/// otherwise be blocked by an insufficient-stock error while the goods sit physically available.
/// Sharing one implementation is what keeps FEFO draw-down, expiry inheritance and the paired
/// ledger entries identical no matter which path opened the pack.
///
/// Pack and loose are two stock-tracked products linked by Product.LooseUnitProductId rather than
/// one product with a fractional quantity, deliberately: a physical carton either is or isn't
/// opened, and modelling "0.4 cartons" would strand batch/expiry tracking on a container that no
/// longer exists as a unit.
/// </summary>
public interface IPackBreakService
{
    /// <summary>
    /// The pack product that breaks down into <paramref name="looseProductId"/>, if one is
    /// configured. Null when this product isn't the loose half of any pack pairing.
    /// </summary>
    Task<Product?> FindPackParentAsync(Guid looseProductId);

    /// <summary>
    /// How many loose units are reachable at this branch: what's already loose, plus what every
    /// unopened pack would yield. This is "available to sell", as opposed to the raw on-hand row —
    /// the number a low-stock badge or an out-of-stock check should be reading.
    /// </summary>
    Task<PackAwareAvailability> GetAvailabilityAsync(Guid looseProductId, Guid branchId);

    /// <summary>
    /// Breaks <paramref name="packs"/> whole packs into loose units. Does NOT call SaveChanges —
    /// the caller owns the transaction, which is what lets checkout break a pack and record the
    /// sale atomically (a sale that fails after breaking must not leave a carton opened for nothing).
    /// </summary>
    Task<PackBreakResult> BreakAsync(Product packProduct, Guid branchId, decimal packs, Guid? actingUserId, string? noteSuffix = null);
}

/// <param name="LooseOnHand">Units already loose on the shelf.</param>
/// <param name="PackOnHand">Unopened packs on hand.</param>
/// <param name="ItemsPerPack">Units one pack yields. 1 when there is no pack pairing.</param>
/// <param name="TotalAvailable">LooseOnHand + PackOnHand × ItemsPerPack.</param>
public record PackAwareAvailability(
    Guid LooseProductId,
    decimal LooseOnHand,
    Product? PackProduct,
    decimal PackOnHand,
    int ItemsPerPack,
    decimal TotalAvailable);

public record PackBreakResult(
    Product PackProduct,
    Product LooseProduct,
    decimal Packs,
    decimal UnitsProduced,
    decimal PackQuantityAfter,
    decimal LooseQuantityAfter,
    string ReferenceNumber);

public class PackBreakService(
    BaqalaDbContext db,
    IBatchConsumptionService batchConsumption,
    IStockMovementService stockMovements) : IPackBreakService
{
    public async Task<Product?> FindPackParentAsync(Guid looseProductId) =>
        await db.Products.FirstOrDefaultAsync(p =>
            p.LooseUnitProductId == looseProductId &&
            p.SaleUnitType == "pack" &&
            p.Status != "discontinued");

    public async Task<PackAwareAvailability> GetAvailabilityAsync(Guid looseProductId, Guid branchId)
    {
        var looseOnHand = await db.InventoryStocks
            .Where(s => s.ProductId == looseProductId && s.BranchId == branchId)
            .Select(s => (decimal?)s.Quantity)
            .FirstOrDefaultAsync() ?? 0;

        var pack = await FindPackParentAsync(looseProductId);
        if (pack is null)
            return new PackAwareAvailability(looseProductId, looseOnHand, null, 0, 1, looseOnHand);

        var packOnHand = await db.InventoryStocks
            .Where(s => s.ProductId == pack.Id && s.BranchId == branchId)
            .Select(s => (decimal?)s.Quantity)
            .FirstOrDefaultAsync() ?? 0;

        var itemsPerPack = pack.ItemsPerPack is > 0 ? pack.ItemsPerPack.Value : 1;
        // Negative pack stock (possible where a branch allows overselling) must not subtract from
        // what's reachable — a debt on the pack row doesn't make loose units disappear.
        var fromPacks = Math.Max(0, packOnHand) * itemsPerPack;

        return new PackAwareAvailability(
            looseProductId, looseOnHand, pack, packOnHand, itemsPerPack, looseOnHand + fromPacks);
    }

    public async Task<PackBreakResult> BreakAsync(
        Product packProduct, Guid branchId, decimal packs, Guid? actingUserId, string? noteSuffix = null)
    {
        if (packProduct.SaleUnitType != "pack")
            throw new InvalidOperationException($"\"{packProduct.Name}\" is not sold as a pack.");
        if (packProduct.LooseUnitProductId is null)
            throw new InvalidOperationException($"\"{packProduct.Name}\" has no loose-unit product configured to break into.");
        if (packs <= 0)
            throw new InvalidOperationException("Packs to break must be greater than zero.");
        if (packs != Math.Floor(packs))
            throw new InvalidOperationException("Packs to break must be a whole number — a pack is opened or it isn't.");

        var looseProduct = await db.Products.FindAsync(packProduct.LooseUnitProductId)
            ?? throw new InvalidOperationException("Linked loose-unit product not found.");

        var packStock = await db.InventoryStocks
            .FirstOrDefaultAsync(s => s.ProductId == packProduct.Id && s.BranchId == branchId);
        if (packStock is null || packs > packStock.Quantity)
            throw new InvalidOperationException(
                $"Cannot break {packs} pack(s) of \"{packProduct.Name}\" — only {packStock?.Quantity ?? 0:0.##} on hand at this branch.");

        var itemsPerPack = packProduct.ItemsPerPack is > 0 ? packProduct.ItemsPerPack.Value : 1;
        var unitsProduced = packs * itemsPerPack;

        // FEFO draw-down of the pack's own batches — empty when the pack isn't batch-tracked at
        // this branch, which is fine (falls back to the aggregate-only move below).
        var consumed = await batchConsumption.ConsumeFefoAsync(packProduct.Id, branchId, warehouseId: null, packs);

        var packQuantityBefore = packStock.Quantity;
        packStock.Quantity -= packs;
        packStock.LastUpdated = DateTime.UtcNow;
        packStock.UpdatedAt = DateTime.UtcNow;

        var looseStock = await db.InventoryStocks
            .FirstOrDefaultAsync(s => s.ProductId == looseProduct.Id && s.BranchId == branchId);
        if (looseStock is null)
        {
            looseStock = new InventoryStock
            {
                Id = Guid.NewGuid(),
                ProductId = looseProduct.Id,
                BranchId = branchId,
                Quantity = 0,
                LastUpdated = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            };
            db.InventoryStocks.Add(looseStock);
        }
        var looseQuantityBefore = looseStock.Quantity;
        looseStock.Quantity += unitsProduced;
        looseStock.LastUpdated = DateTime.UtcNow;
        looseStock.UpdatedAt = DateTime.UtcNow;

        // Each consumed pack batch hands its expiry down to a proportional new batch on the loose
        // product — a carton expiring Friday means the eggs pulled out of it still expire Friday.
        foreach (var c in consumed)
        {
            var sourceBatch = await db.InventoryBatches.FindAsync(c.BatchId);
            db.InventoryBatches.Add(new InventoryBatch
            {
                Id = Guid.NewGuid(),
                ProductId = looseProduct.Id,
                BranchId = branchId,
                BatchNumber = c.BatchNumber is null ? null : $"{c.BatchNumber}-BRK",
                Quantity = c.Quantity * itemsPerPack,
                RemainingQuantity = c.Quantity * itemsPerPack,
                // Per-unit cost has to be divided down with the quantity multiplied up, or the
                // lot's total value is inflated by ItemsPerPack. BatchConsumption.UnitCost is the
                // cost of one *pack*; one egg out of a 12-carton costs a twelfth of the carton.
                PurchaseCost = c.UnitCost.HasValue ? c.UnitCost.Value / itemsPerPack : null,
                ExpiryDate = sourceBatch?.ExpiryDate,
                ReceivedDate = DateTime.UtcNow,
                Status = "active",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            });
        }

        var referenceNumber = $"BRK-{Guid.NewGuid().ToString("N")[..8]}";
        var suffix = noteSuffix is null ? "" : $" ({noteSuffix})";
        stockMovements.Record(
            packProduct.Id, branchId, warehouseId: null, movementType: "pack_break_out", quantity: -packs,
            referenceType: "PackBreak", referenceNumber: referenceNumber,
            notes: $"Broken into {looseProduct.Name}{suffix}",
            createdBy: actingUserId, quantityBefore: packQuantityBefore, quantityAfter: packStock.Quantity);
        stockMovements.Record(
            looseProduct.Id, branchId, warehouseId: null, movementType: "pack_break_in", quantity: unitsProduced,
            referenceType: "PackBreak", referenceNumber: referenceNumber,
            notes: $"From breaking {packProduct.Name}{suffix}",
            createdBy: actingUserId, quantityBefore: looseQuantityBefore, quantityAfter: looseStock.Quantity);

        return new PackBreakResult(
            packProduct, looseProduct, packs, unitsProduced,
            packStock.Quantity, looseStock.Quantity, referenceNumber);
    }
}
