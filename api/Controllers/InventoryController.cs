using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class InventoryController(BaqalaDbContext db, IStockAlertService stockAlerts, IStockMovementService stockMovements, ILogger<InventoryController> logger) : ControllerBase
{
    // Branch-scoped roles (anything but tenant_admin) may only see/write their own branch's
    // batches — mirrors the scoping the frontend already applies to the plain stock list.
    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    [HttpGet("stock")]
    public async Task<IActionResult> GetStock([FromQuery] Guid? branchId, [FromQuery] bool? lowStock, [FromQuery] Guid? categoryId)
    {
        // Branch-scoped roles may only see their own branch's stock — this was previously
        // enforced only in the React component (locking the branch dropdown), so a direct
        // API call could read any branch's stock. Mirrors GetBatches/GetExpiringBatches below.
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue) branchId = callerBranchId;

        var query = db.InventoryStocks
            .Include(i => i.Product).ThenInclude(p => p!.Category)
            .Include(i => i.Branch)
            // A discontinued product (including one left behind by a failed create — the "Add
            // Product" flow soft-deletes via this same status field if the initial stock/batch
            // call fails after the product row was already committed) has no business appearing
            // as a sellable, zero-stock catalog row on any of this endpoint's callers (Inventory,
            // Stocks, POS, Orders, etc.).
            .Where(i => i.Product!.Status != "discontinued")
            .AsQueryable();
        if (branchId.HasValue) query = query.Where(i => i.BranchId == branchId);
        if (lowStock == true) query = query.Where(i => i.Quantity <= i.ReorderLevel);
        if (categoryId.HasValue) query = query.Where(i => i.Product!.CategoryId == categoryId);
        return Ok(await query.ToListAsync());
    }

    [HttpGet("stock/{productId:guid}/{branchId:guid}")]
    public async Task<IActionResult> GetStockByProductBranch(Guid productId, Guid branchId)
    {
        var stock = await db.InventoryStocks
            .FirstOrDefaultAsync(i => i.ProductId == productId && i.BranchId == branchId);
        return stock is null ? NotFound() : Ok(stock);
    }

    // Removes a product's stock row from a single branch — used to clean up a branch's
    // inventory list, NOT to write off stock. Only ever allowed once the row is already
    // fully zeroed (on-hand and reserved), since the only legitimate way to actually GET a
    // product's stock at a branch to zero is to sell it or transfer it out — both of which
    // already happened by the time this succeeds. If the same product is later received here
    // again (PO receipt, transfer receive, manual receive), every one of those write paths
    // already does a find-or-create on InventoryStock, so a fresh row is created automatically
    // with no special-casing needed — deleting this row doesn't blacklist the product/branch
    // pair, it just removes a stale zero row from the list.
    [RequirePermission("Inventory", PermAction.Delete)]
    [HttpDelete("stock/{id:guid}")]
    public async Task<IActionResult> DeleteStock(Guid id)
    {
        var stock = await db.InventoryStocks.FindAsync(id);
        if (stock is null) return NotFound();

        var (role, callerBranchId) = GetCallerContext();
        if (role is not null && role != "tenant_admin" && callerBranchId.HasValue && callerBranchId != stock.BranchId)
            return Forbid();

        if (stock.Quantity != 0 || stock.ReservedQuantity != 0)
        {
            return Conflict(new
            {
                message = $"Cannot delete — {stock.Quantity} unit(s) on hand" +
                    (stock.ReservedQuantity != 0 ? $" ({stock.ReservedQuantity} reserved)" : "") +
                    " at this branch. Transfer the stock to another branch or warehouse first, then delete.",
                quantity = stock.Quantity,
                reservedQuantity = stock.ReservedQuantity,
                productId = stock.ProductId,
                branchId = stock.BranchId,
            });
        }

        // A batch still claiming remaining stock here would become an orphaned record once the
        // aggregate row is gone — same reconciliation guarantee the Inventory page's batch
        // expand-row already depends on (aggregate on-hand must always match tracked batches).
        var hasOpenBatches = await db.InventoryBatches.AnyAsync(b =>
            b.ProductId == stock.ProductId && b.BranchId == stock.BranchId && b.RemainingQuantity > 0);
        if (hasOpenBatches)
        {
            return Conflict(new
            {
                message = "Cannot delete — this product still has active batch(es) recorded at this branch. Transfer or write off those batches first.",
                productId = stock.ProductId,
                branchId = stock.BranchId,
            });
        }

        db.InventoryStocks.Remove(stock);
        await db.SaveChangesAsync();
        return NoContent();
    }

    [HttpGet("batches")]
    public async Task<IActionResult> GetBatches(
        [FromQuery] Guid? branchId, [FromQuery] Guid? warehouseId, [FromQuery] Guid? productId, [FromQuery] string? status,
        [FromQuery] string? locationType)
    {
        var (role, callerBranchId) = GetCallerContext();
        // Only clobber branchId onto a branch-scoped request — a caller explicitly asking for a
        // WAREHOUSE's batches isn't querying "their branch" at all, and warehouse batches always
        // have BranchId null (mutually exclusive with WarehouseId), so forcing branchId here would
        // AND together a non-null branch filter with the warehouse filter and always return empty.
        if (role is not null && role != "tenant_admin" && callerBranchId.HasValue && !warehouseId.HasValue) branchId = callerBranchId;

        var query = db.InventoryBatches
            .Include(b => b.Product)
            .Include(b => b.Supplier)
            .AsQueryable();
        if (branchId.HasValue) query = query.Where(b => b.BranchId == branchId);
        if (warehouseId.HasValue) query = query.Where(b => b.WarehouseId == warehouseId);
        // "Any branch"/"any warehouse" browsing (no specific id picked) still needs to stay
        // scoped to that location TYPE — otherwise it falls through to no location filter at
        // all and returns every batch system-wide, branches and warehouses mixed together.
        if (locationType == "branch" && !branchId.HasValue) query = query.Where(b => b.BranchId != null);
        else if (locationType == "warehouse" && !warehouseId.HasValue) query = query.Where(b => b.WarehouseId != null);
        if (productId.HasValue) query = query.Where(b => b.ProductId == productId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(b => b.Status == status);
        return Ok(await query.OrderBy(b => b.ExpiryDate).ToListAsync());
    }

    [HttpGet("batches/expiring")]
    public async Task<IActionResult> GetExpiringBatches([FromQuery] Guid? branchId, [FromQuery] Guid? warehouseId, [FromQuery] int daysAhead = 30)
    {
        var (role, callerBranchId) = GetCallerContext();
        // Same reasoning as GetBatches above — don't clobber branchId onto an explicit warehouse query.
        if (role is not null && role != "tenant_admin" && callerBranchId.HasValue && !warehouseId.HasValue) branchId = callerBranchId;

        var cutoff = DateTime.UtcNow.AddDays(daysAhead);
        var query = db.InventoryBatches
            .Include(b => b.Product)
            .Include(b => b.Supplier)
            .Where(b => b.ExpiryDate != null && b.ExpiryDate <= cutoff && b.RemainingQuantity > 0);
        if (branchId.HasValue) query = query.Where(b => b.BranchId == branchId);
        if (warehouseId.HasValue) query = query.Where(b => b.WarehouseId == warehouseId);
        return Ok(await query.OrderBy(b => b.ExpiryDate).ToListAsync());
    }

    [RequirePermission("Batches", PermAction.Create)]
    [HttpPost("batches")]
    public async Task<IActionResult> ReceiveBatch([FromBody] ReceiveBatchRequest req)
    {
        if (req.Quantity <= 0)
            return BadRequest(new { message = "Received quantity must be greater than zero." });
        // A past expiry is rejected outright unless the caller documents why (a damaged
        // shipment or a supplier return being logged for write-off, not for resale). The
        // resulting batch's past ExpiryDate still keeps it out of the sellable-stock check
        // in OrdersController.Create, so an override never makes an expired item sellable.
        if (req.ExpiryDate.HasValue && req.ExpiryDate.Value.Date < DateTime.UtcNow.Date
            && string.IsNullOrWhiteSpace(req.DamagedOrReturnReason))
            return BadRequest(new { message = "Expiry date cannot be in the past — provide a damagedOrReturnReason to log it as damaged/return stock instead of resalable inventory." });

        var (role, callerBranchId) = GetCallerContext();
        if (role is not null && role != "tenant_admin" && callerBranchId.HasValue && callerBranchId != req.BranchId)
            return Forbid();

        var batchId = Guid.NewGuid();
        var batch = new InventoryBatch
        {
            Id = batchId,
            BatchNumber = !string.IsNullOrEmpty(req.BatchNumber) ? req.BatchNumber : $"BATCH-{DateTime.UtcNow:yyyyMMddHHmm}-{batchId.ToString()[..4].ToUpper()}",
            ProductId = req.ProductId,
            BranchId = req.BranchId,
            SupplierId = req.SupplierId,
            Quantity = req.Quantity,
            RemainingQuantity = req.Quantity,
            PurchaseCost = req.PurchaseCost,
            ExpiryDate = req.ExpiryDate,
            ReceivedDate = DateTime.UtcNow,
            Notes = !string.IsNullOrWhiteSpace(req.DamagedOrReturnReason)
                ? $"[Damaged/Return: {req.DamagedOrReturnReason}] {req.Notes}".TrimEnd()
                : req.Notes,
            Status = "active",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        db.InventoryBatches.Add(batch);

        var stock = await db.InventoryStocks
            .FirstOrDefaultAsync(s => s.ProductId == req.ProductId && s.BranchId == req.BranchId);
        if (stock is null)
        {
            db.InventoryStocks.Add(new InventoryStock
            {
                Id = Guid.NewGuid(), ProductId = req.ProductId, BranchId = req.BranchId,
                Quantity = req.Quantity, ReorderLevel = req.ReorderLevel ?? 10,
                LastUpdated = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
            });
        }
        else
        {
            stock.Quantity += req.Quantity;
            stock.LastUpdated = stock.UpdatedAt = DateTime.UtcNow;
        }

        stockMovements.Record(
            req.ProductId, req.BranchId, warehouseId: null, movementType: "manual_receive", quantity: req.Quantity,
            batchId: batch.Id, referenceType: "manual_receive", referenceId: batch.Id, notes: req.DamagedOrReturnReason);

        await db.SaveChangesAsync();
        return Created($"/api/inventory/batches/{batch.Id}", batch);
    }

    // Single source of truth for "how did stock actually move" — every stock-mutating endpoint in
    // the app (PO receive, sale, transfer ship/receive/restore, manual receive/adjust, expiry
    // write-off) appends to this ledger in the same request that changes the stock, so this list
    // is never missing a step the way the old page-level reconstruction from five different
    // tables was.
    [HttpGet("movements")]
    public async Task<IActionResult> GetMovements(
        [FromQuery] Guid? productId, [FromQuery] Guid? branchId, [FromQuery] Guid? warehouseId,
        [FromQuery] Guid? batchId, [FromQuery] string? movementType, [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] int limit = 200)
    {
        var query = db.StockMovements
            .Include(m => m.Product)
            .Include(m => m.Branch)
            .Include(m => m.Warehouse)
            .Include(m => m.Batch)
            .Include(m => m.CreatedByUser)
            .AsQueryable();
        if (productId.HasValue) query = query.Where(m => m.ProductId == productId);
        if (branchId.HasValue) query = query.Where(m => m.BranchId == branchId);
        if (warehouseId.HasValue) query = query.Where(m => m.WarehouseId == warehouseId);
        if (batchId.HasValue) query = query.Where(m => m.BatchId == batchId);
        if (!string.IsNullOrEmpty(movementType)) query = query.Where(m => m.MovementType == movementType);
        if (from.HasValue) query = query.Where(m => m.CreatedAt >= from);
        if (to.HasValue) query = query.Where(m => m.CreatedAt <= to);
        return Ok(await query.OrderByDescending(m => m.CreatedAt).Take(Math.Clamp(limit, 1, 1000)).ToListAsync());
    }

    [HttpGet("adjustments")]
    public async Task<IActionResult> GetAdjustments([FromQuery] Guid? branchId, [FromQuery] Guid? warehouseId, [FromQuery] Guid? batchId, [FromQuery] string? adjustmentType)
    {
        var query = db.InventoryAdjustments
            .Include(a => a.Product)
            .Include(a => a.Branch)
            .Include(a => a.Warehouse)
            .Include(a => a.AdjustedByUser)
            .AsQueryable();
        if (branchId.HasValue) query = query.Where(a => a.BranchId == branchId);
        if (warehouseId.HasValue) query = query.Where(a => a.WarehouseId == warehouseId);
        if (batchId.HasValue) query = query.Where(a => a.BatchId == batchId);
        if (!string.IsNullOrEmpty(adjustmentType)) query = query.Where(a => a.AdjustmentType == adjustmentType);
        return Ok(await query.OrderByDescending(a => a.CreatedAt).ToListAsync());
    }

    [RequirePermission("Stocks", PermAction.Create)]
    [HttpPost("adjustments")]
    public async Task<IActionResult> Adjust([FromBody] AdjustRequest req)
    {
        // Same stock-write guard as ReceiveBatch: this endpoint had no quantity validation at
        // all, so a zero/negative value here was a second, unguarded route to the BUG-C1 class
        // of defect (corrupt on-hand quantity), separate from the Receive Batch form.
        if (req.Quantity <= 0)
            return BadRequest(new { message = "Adjustment quantity must be greater than zero." });

        var isIncrease = req.AdjustmentType is "addition" or "return_to_supplier" or "transfer_in";

        // Batch selection is optional — most cycle-count corrections aren't tied to a specific
        // lot. When one IS picked, it must actually belong here, and a decrease can't remove
        // more than that lot has left (mirrors ValidateSourceStockAsync's same check in
        // StockTransfersController, just against a batch instead of an aggregate row).
        InventoryBatch? batch = null;
        if (req.BatchId.HasValue)
        {
            batch = await db.InventoryBatches.FirstOrDefaultAsync(b => b.Id == req.BatchId);
            if (batch is null || batch.ProductId != req.ProductId || batch.BranchId != req.BranchId)
                return BadRequest(new { message = "Selected batch does not match this product and branch." });
            if (!isIncrease && req.Quantity > batch.RemainingQuantity)
                return BadRequest(new { message = $"Cannot adjust {req.Quantity} unit(s) — only {batch.RemainingQuantity} remaining in batch {batch.BatchNumber}." });
        }

        // Recording wastage/damage (or any adjustment) against a product that has no stock row in
        // the chosen branch used to 404 with "Stock record not found", surfacing to the user as the
        // reported "Failed to record wastage". A write-off is a legitimate event to log even when
        // the system shows nothing on hand, so create a zero row and let the removal clamp at zero
        // rather than rejecting the whole action. Mirrors the upsert the PO-receive path already does.
        var stock = await db.InventoryStocks
            .FirstOrDefaultAsync(s => s.ProductId == req.ProductId && s.BranchId == req.BranchId);
        if (stock is null)
        {
            stock = new InventoryStock
            {
                Id = Guid.NewGuid(),
                ProductId = req.ProductId,
                BranchId = req.BranchId,
                Quantity = 0,
                LastUpdated = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            };
            db.InventoryStocks.Add(stock);
        }

        var adjustment = new InventoryAdjustment
        {
            Id = Guid.NewGuid(),
            ProductId = req.ProductId,
            BranchId = req.BranchId,
            BatchId = req.BatchId,
            Quantity = req.Quantity,
            AdjustmentType = req.AdjustmentType,
            Reason = req.Reason ?? "",
            AdjustedBy = req.AdjustedBy,
            CreatedAt = DateTime.UtcNow,
        };

        if (isIncrease)
            stock.Quantity += req.Quantity;
        else
            // Clamp at zero rather than letting a removal push stock negative — same
            // convention OrdersController.Create already uses when a sale reduces stock.
            stock.Quantity = Math.Max(0, stock.Quantity - req.Quantity);
        stock.LastUpdated = DateTime.UtcNow;

        if (batch != null)
        {
            // Increases only ever credit RemainingQuantity, never the original received Quantity
            // — same convention StockTransfersController.RestoreSourceAsync already uses when
            // giving stock back to a batch; Quantity stays an immutable "originally received" fact.
            batch.RemainingQuantity = isIncrease
                ? batch.RemainingQuantity + req.Quantity
                : Math.Max(0, batch.RemainingQuantity - req.Quantity);
            batch.UpdatedAt = DateTime.UtcNow;
            if (!isIncrease && batch.RemainingQuantity == 0) batch.Status = "consumed";
            // A correction crediting stock back into a batch that was previously fully consumed
            // makes it live again — leaving Status stuck at "consumed" would misrepresent it
            // everywhere that reads Status (badges, BatchExpandRow's exclusion, etc.) despite it
            // now genuinely having stock on hand.
            else if (isIncrease && batch.Status == "consumed" && batch.RemainingQuantity > 0) batch.Status = "active";
        }

        db.InventoryAdjustments.Add(adjustment);

        stockMovements.Record(
            req.ProductId, req.BranchId, warehouseId: null, movementType: $"adjustment_{req.AdjustmentType}",
            quantity: isIncrease ? req.Quantity : -req.Quantity,
            batchId: req.BatchId, referenceType: "adjustment", referenceId: adjustment.Id, notes: req.Reason);

        await db.SaveChangesAsync();

        // Removal adjustments (wastage, damage, stock-out, transfer-out) can push on-hand below the
        // reorder threshold — check immediately so the Low Stock / Out of Stock alert fires now
        // instead of waiting for the 15-minute background sweep. Best-effort: never fail the write.
        if (req.AdjustmentType is not ("addition" or "return_to_supplier" or "transfer_in"))
        {
            try { await stockAlerts.CheckStockLevelAsync(req.ProductId, req.BranchId); }
            catch (Exception ex) { logger.LogError(ex, "Low-stock check failed after adjustment for product {ProductId}", req.ProductId); }
        }

        return Created($"/api/inventory/adjustments/{adjustment.Id}", adjustment);
    }
}

public record AdjustRequest(
    Guid ProductId,
    Guid BranchId,
    decimal Quantity,
    string AdjustmentType,
    string? Reason,
    Guid? AdjustedBy,
    Guid? BatchId = null
);

public record ReceiveBatchRequest(
    Guid ProductId,
    Guid BranchId,
    Guid? SupplierId,
    decimal Quantity,
    decimal? PurchaseCost,
    DateTime? ExpiryDate,
    string? BatchNumber,
    string? Notes,
    int? ReorderLevel,
    string? DamagedOrReturnReason = null
);
