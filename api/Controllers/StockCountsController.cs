using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

// Stock Filters — "Stocking review": a physical count session that lets a manager compare system
// quantity against what's actually on the shelf (via barcode scan) and reconcile the variance
// through the existing InventoryAdjustment pipeline, rather than a parallel one.
[ApiController]
[Route("api/stock-counts")]
public class StockCountsController(
    BaqalaDbContext db, IAuditService audit, IStockAlertService stockAlerts,
    IStockMovementService stockMovements, ILogger<StockCountsController> logger) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id)
            ? id : null;

    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    private IQueryable<StockCount> WithIncludes() => db.StockCounts
        .Include(c => c.Branch)
        .Include(c => c.Category);

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? branchId, [FromQuery] string? status)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue) branchId = callerBranchId;

        var query = WithIncludes().AsQueryable();
        if (branchId.HasValue) query = query.Where(c => c.BranchId == branchId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(c => c.Status == status);
        return Ok(await query.OrderByDescending(c => c.StartedAt).ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var count = await WithIncludes()
            .Include(c => c.Items).ThenInclude(i => i.Product)
            .FirstOrDefaultAsync(c => c.Id == id);
        if (count is null) return NotFound();

        // Branch-scoped roles may only look up their own branch's count session — mirrors
        // GetAll, which this direct-by-id lookup previously bypassed entirely.
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue && count.BranchId != callerBranchId)
            return NotFound();

        return Ok(count);
    }

    // Snapshots every in-stock product at the branch (optionally scoped to one category) as a
    // pending count line — SystemQuantity frozen at this moment so a sale mid-count doesn't move
    // the goalposts on what "system quantity" meant when the count started.
    [RequirePermission("Stocks", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Start([FromBody] StartStockCountRequest req)
    {
        if (req.CountType is not null and not ("review" or "audit" or "reconciliation"))
            return BadRequest(new { message = "countType must be one of: review, audit, reconciliation." });

        var stockQ = db.InventoryStocks.Include(s => s.Product).Where(s => s.BranchId == req.BranchId);
        if (req.CategoryId.HasValue) stockQ = stockQ.Where(s => s.Product!.CategoryId == req.CategoryId);
        var stocks = await stockQ.ToListAsync();

        var count = new StockCount
        {
            Id = Guid.NewGuid(),
            BranchId = req.BranchId,
            CategoryId = req.CategoryId,
            CountType = req.CountType,
            Status = "draft",
            StartedBy = CallerId() ?? req.StartedBy,
            Notes = req.Notes,
            StartedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            Items = stocks.Select(s => new StockCountItem
            {
                Id = Guid.NewGuid(),
                ProductId = s.ProductId,
                SystemQuantity = s.Quantity,
                CreatedAt = DateTime.UtcNow,
            }).ToList(),
        };
        db.StockCounts.Add(count);
        await db.SaveChangesAsync();

        await audit.LogAsync("start_stock_count", "StockCount", count.Id, req.StartedBy, req.BranchId,
            $"{{\"itemCount\":{count.Items.Count}}}");

        return CreatedAtAction(nameof(GetById), new { id = count.Id }, count);
    }

    // Records what was actually counted for one product — the barcode-scan step. Upserts: a
    // product scanned that wasn't in the original snapshot (e.g. received after the count started)
    // gets added on the fly using its current system quantity.
    [RequirePermission("Stocks", PermAction.Edit)]
    [HttpPost("{id:guid}/count")]
    public async Task<IActionResult> RecordCount(Guid id, [FromBody] RecordCountRequest req)
    {
        var count = await db.StockCounts.Include(c => c.Items).FirstOrDefaultAsync(c => c.Id == id);
        if (count is null) return NotFound();
        if (count.Status != "draft") return BadRequest(new { message = "This count session is no longer open." });

        var item = count.Items.FirstOrDefault(i => i.ProductId == req.ProductId);
        if (item is null)
        {
            var stock = await db.InventoryStocks.FirstOrDefaultAsync(s => s.ProductId == req.ProductId && s.BranchId == count.BranchId);
            item = new StockCountItem
            {
                Id = Guid.NewGuid(),
                StockCountId = count.Id,
                ProductId = req.ProductId,
                SystemQuantity = stock?.Quantity ?? 0,
                CreatedAt = DateTime.UtcNow,
            };
            db.StockCountItems.Add(item);
        }

        item.CountedQuantity = req.CountedQuantity;
        item.Variance = req.CountedQuantity - item.SystemQuantity;
        item.CountedAt = DateTime.UtcNow;
        count.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
        var product = await db.Products.FindAsync(req.ProductId);
        return Ok(new { item.Id, item.ProductId, item.SystemQuantity, item.CountedQuantity, item.Variance, item.CountedAt, product?.Name, product?.Sku });
    }

    // Completing the session posts an InventoryAdjustment for every counted line whose variance
    // isn't zero, and sets on-hand quantity to what was actually counted — reusing the exact
    // adjustment pipeline InventoryController.Adjust already writes to, so this shows up in the
    // same audit/report surfaces as any other stock adjustment.
    [RequirePermission("Stocks", PermAction.Edit)]
    [HttpPost("{id:guid}/complete")]
    public async Task<IActionResult> Complete(Guid id, [FromBody] CompleteStockCountRequest req)
    {
        var count = await db.StockCounts.Include(c => c.Items).FirstOrDefaultAsync(c => c.Id == id);
        if (count is null) return NotFound();
        if (count.Status != "draft") return BadRequest(new { message = "This count session is already closed." });

        // The JWT wins over the body, matching InventoryController.Adjust — the body value is kept
        // only as a fallback for kiosk/service tokens that carry no usable claim. Reconciliation
        // rewrites on-hand stock, so a client naming an arbitrary user as the counter would make
        // the resulting audit trail attest to nothing.
        var completedBy = CallerId() ?? req.CompletedBy;

        var adjustments = new List<InventoryAdjustment>();
        var reducedProductIds = new List<Guid>();
        foreach (var item in count.Items.Where(i => i.CountedQuantity.HasValue && i.Variance != 0))
        {
            var variance = item.Variance!.Value;
            var stock = await db.InventoryStocks.FirstOrDefaultAsync(s => s.ProductId == item.ProductId && s.BranchId == count.BranchId);
            if (stock is null) continue;
            if (variance < 0) reducedProductIds.Add(item.ProductId);

            var adjustment = new InventoryAdjustment
            {
                Id = Guid.NewGuid(),
                ProductId = item.ProductId,
                BranchId = count.BranchId,
                Quantity = Math.Abs(variance),
                AdjustmentType = variance > 0 ? "addition" : "subtraction",
                Reason = $"Stocking review reconciliation (session {count.Id})",
                AdjustedBy = completedBy,
                CreatedAt = DateTime.UtcNow,
            };
            adjustments.Add(adjustment);

            var quantityBefore = stock.Quantity;
            stock.Quantity = Math.Max(0, item.CountedQuantity!.Value);
            stock.LastUpdated = DateTime.UtcNow;

            // Reconciliation rewrote on-hand stock but recorded no ledger row, so the one event
            // that reconciles the system to physical reality was the one event the movement
            // timeline and audit trail couldn't see. Signed by the variance's direction.
            stockMovements.Record(
                item.ProductId, count.BranchId, warehouseId: null,
                movementType: variance > 0 ? "reconciliation_addition" : "reconciliation_subtraction",
                quantity: variance,
                referenceType: "stock_count", referenceId: count.Id,
                notes: $"Stocking review reconciliation (session {count.Id})",
                createdBy: completedBy,
                quantityBefore: quantityBefore, quantityAfter: stock.Quantity);
        }
        db.InventoryAdjustments.AddRange(adjustments);

        count.Status = "completed";
        count.CompletedBy = completedBy;
        count.CompletedAt = DateTime.UtcNow;
        count.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync("complete_stock_count", "StockCount", count.Id, completedBy, count.BranchId,
            $"{{\"itemsCounted\":{count.Items.Count(i => i.CountedQuantity.HasValue)},\"adjustments\":{adjustments.Count}}}",
            adjustments.Count > 0 ? "warning" : "info");

        // A physical count that revised on-hand downward can drop a product below its reorder
        // point — fire the low-stock alert now rather than waiting for the background sweep.
        foreach (var productId in reducedProductIds)
        {
            try { await stockAlerts.CheckStockLevelAsync(productId, count.BranchId); }
            catch (Exception ex) { logger.LogError(ex, "Low-stock check failed after stock count for product {ProductId}", productId); }
        }

        // Re-fetch with the same Includes GetById uses — the tracked `count` above has no
        // Branch/Product loaded, which rendered as "Unknown" products in the completed view.
        var result = await WithIncludes().Include(c => c.Items).ThenInclude(i => i.Product).FirstAsync(c => c.Id == count.Id);
        return Ok(result);
    }

    [RequirePermission("Stocks", PermAction.Edit)]
    [HttpPatch("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id)
    {
        var count = await db.StockCounts.FindAsync(id);
        if (count is null) return NotFound();
        if (count.Status != "draft") return BadRequest(new { message = "This count session is already closed." });
        count.Status = "cancelled";
        count.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(count);
    }
}

// CountType: review | audit | reconciliation. Optional — an omitted value records no intent rather
// than defaulting to one, so the report can't claim a session was an "audit" nobody said it was.
public record StartStockCountRequest(Guid BranchId, Guid? CategoryId, Guid? StartedBy, string? Notes, string? CountType = null);
public record RecordCountRequest(Guid ProductId, decimal CountedQuantity);
public record CompleteStockCountRequest(Guid? CompletedBy);
