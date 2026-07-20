using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;

namespace BaqalaPOS.Api.Services;

// Single write path into the StockMovement ledger — every controller that mutates stock calls
// this instead of constructing rows itself, so the shape (signed quantity, reference fields)
// never drifts between call sites the way the old ad-hoc per-page "movement" reconstruction did.
// Deliberately does NOT call SaveChangesAsync — the caller adds this row to the same unit of work
// as the actual stock mutation it's recording, so a failed save loses both together rather than
// leaving an orphaned ledger entry with no corresponding stock change (or vice versa).
public interface IStockMovementService
{
    // quantityBefore/quantityAfter are the on-hand either side of this mutation. They're optional
    // because a few call sites genuinely can't know them (no stock row exists yet), but pass them
    // wherever the value is in hand — the FRD's Inventory Transaction Audit Trail requires both,
    // and they cannot be reconstructed later by summing the ledger (that only works if every
    // movement since the stock row was created is present, which is false for pre-ledger rows).
    void Record(
        Guid productId, Guid? branchId, Guid? warehouseId, string movementType, decimal quantity,
        Guid? batchId = null, string? referenceType = null, Guid? referenceId = null,
        string? referenceNumber = null, string? notes = null, Guid? createdBy = null,
        decimal? quantityBefore = null, decimal? quantityAfter = null);
}

public class StockMovementService(BaqalaDbContext db) : IStockMovementService
{
    public void Record(
        Guid productId, Guid? branchId, Guid? warehouseId, string movementType, decimal quantity,
        Guid? batchId = null, string? referenceType = null, Guid? referenceId = null,
        string? referenceNumber = null, string? notes = null, Guid? createdBy = null,
        decimal? quantityBefore = null, decimal? quantityAfter = null)
    {
        db.StockMovements.Add(new StockMovement
        {
            Id = Guid.NewGuid(),
            ProductId = productId,
            BranchId = branchId,
            WarehouseId = warehouseId,
            BatchId = batchId,
            MovementType = movementType,
            Quantity = quantity,
            QuantityBefore = quantityBefore,
            QuantityAfter = quantityAfter,
            ReferenceType = referenceType,
            ReferenceId = referenceId,
            ReferenceNumber = referenceNumber,
            Notes = notes,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow,
        });
    }
}
