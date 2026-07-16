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
    void Record(
        Guid productId, Guid? branchId, Guid? warehouseId, string movementType, decimal quantity,
        Guid? batchId = null, string? referenceType = null, Guid? referenceId = null,
        string? referenceNumber = null, string? notes = null, Guid? createdBy = null);
}

public class StockMovementService(BaqalaDbContext db) : IStockMovementService
{
    public void Record(
        Guid productId, Guid? branchId, Guid? warehouseId, string movementType, decimal quantity,
        Guid? batchId = null, string? referenceType = null, Guid? referenceId = null,
        string? referenceNumber = null, string? notes = null, Guid? createdBy = null)
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
            ReferenceType = referenceType,
            ReferenceId = referenceId,
            ReferenceNumber = referenceNumber,
            Notes = notes,
            CreatedBy = createdBy,
            CreatedAt = DateTime.UtcNow,
        });
    }
}
