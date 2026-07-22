using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

// Stock Filters — "Stocking review": a physical count session that lets a manager compare system
// quantity against what's actually on the shelf (via barcode scan), then clears a reviewer and an
// approver (maker-checker, same shape as the Wastage gate on InventoryAdjustment) before the
// variance is reconciled through the existing InventoryAdjustment pipeline, rather than a parallel
// one. Nothing touches on-hand stock until the final Approve step.
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
        .Include(c => c.Warehouse)
        .Include(c => c.Category);

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? branchId, [FromQuery] Guid? warehouseId, [FromQuery] string? status)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue) branchId = callerBranchId;

        var query = WithIncludes().AsQueryable();
        if (branchId.HasValue) query = query.Where(c => c.BranchId == branchId);
        if (warehouseId.HasValue) query = query.Where(c => c.WarehouseId == warehouseId);
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
        // GetAll, which this direct-by-id lookup previously bypassed entirely. A warehouse-scoped
        // session (BranchId null) never matches a branch-scoped caller's branch, so it 404s for
        // them too — reviewing/approving a warehouse count is tenant_admin-only for now, since the
        // codebase has no warehouse-scoped role/claim to check instead.
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue && count.BranchId != callerBranchId)
            return NotFound();

        return Ok(count);
    }

    // Snapshots every in-stock product at the branch or warehouse (optionally scoped to one
    // category) as a pending count line — SystemQuantity frozen at this moment so a sale or
    // transfer mid-count doesn't move the goalposts on what "system quantity" meant when the count
    // started.
    [RequirePermission("Stocks", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Start([FromBody] StartStockCountRequest req)
    {
        if (req.CountType is not null and not ("review" or "audit" or "reconciliation"))
            return BadRequest(new { message = "countType must be one of: review, audit, reconciliation." });

        // Exactly one of BranchId/WarehouseId — same nullable-pair convention as
        // InventoryAdjustment/InventoryBatch: a stock count reconciles one physical location,
        // never both pools at once.
        if (req.BranchId.HasValue == req.WarehouseId.HasValue)
            return BadRequest(new { message = "Provide exactly one of branchId or warehouseId." });

        List<StockCountItem> items;
        if (req.BranchId.HasValue)
        {
            var stockQ = db.InventoryStocks.Include(s => s.Product).Where(s => s.BranchId == req.BranchId);
            if (req.CategoryId.HasValue) stockQ = stockQ.Where(s => s.Product!.CategoryId == req.CategoryId);
            var stocks = await stockQ.ToListAsync();
            items = stocks.Select(s => new StockCountItem
            {
                Id = Guid.NewGuid(), ProductId = s.ProductId, SystemQuantity = s.Quantity, CreatedAt = DateTime.UtcNow,
            }).ToList();
        }
        else
        {
            var stockQ = db.WarehouseStocks.Include(s => s.Product).Where(s => s.WarehouseId == req.WarehouseId);
            if (req.CategoryId.HasValue) stockQ = stockQ.Where(s => s.Product!.CategoryId == req.CategoryId);
            var stocks = await stockQ.ToListAsync();
            items = stocks.Select(s => new StockCountItem
            {
                Id = Guid.NewGuid(), ProductId = s.ProductId, SystemQuantity = s.Quantity, CreatedAt = DateTime.UtcNow,
            }).ToList();
        }

        var count = new StockCount
        {
            Id = Guid.NewGuid(),
            BranchId = req.BranchId,
            WarehouseId = req.WarehouseId,
            CategoryId = req.CategoryId,
            CountType = req.CountType,
            Status = "draft",
            StartedBy = CallerId() ?? req.StartedBy,
            Notes = req.Notes,
            StartedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            Items = items,
        };
        db.StockCounts.Add(count);
        await db.SaveChangesAsync();

        await audit.LogAsync("start_stock_count", "StockCount", count.Id, req.StartedBy, req.BranchId,
            $"{{\"itemCount\":{count.Items.Count},\"warehouseId\":{(req.WarehouseId.HasValue ? $"\"{req.WarehouseId}\"" : "null")}}}");

        return CreatedAtAction(nameof(GetById), new { id = count.Id }, count);
    }

    // Records what was actually counted for one product — the barcode-scan step. Upserts: a
    // product scanned that wasn't in the original snapshot (e.g. received after the count started)
    // gets added on the fly using its current system quantity from the same pool the session scopes.
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
            decimal systemQuantity = count.BranchId.HasValue
                ? (await db.InventoryStocks.FirstOrDefaultAsync(s => s.ProductId == req.ProductId && s.BranchId == count.BranchId))?.Quantity ?? 0
                : (await db.WarehouseStocks.FirstOrDefaultAsync(s => s.ProductId == req.ProductId && s.WarehouseId == count.WarehouseId))?.Quantity ?? 0;
            item = new StockCountItem
            {
                Id = Guid.NewGuid(),
                StockCountId = count.Id,
                ProductId = req.ProductId,
                SystemQuantity = systemQuantity,
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

    // Closes counting and submits the session for sign-off. No stock/adjustment writes happen
    // here anymore — the variance is only staged (recorded on each item) until a reviewer and then
    // an approver both sign off, via /review and /approve below.
    [RequirePermission("Stocks", PermAction.Edit)]
    [HttpPost("{id:guid}/complete")]
    public async Task<IActionResult> Complete(Guid id, [FromBody] CompleteStockCountRequest req)
    {
        var count = await db.StockCounts.Include(c => c.Items).FirstOrDefaultAsync(c => c.Id == id);
        if (count is null) return NotFound();
        if (count.Status != "draft") return BadRequest(new { message = "This count session is already closed." });

        // The JWT wins over the body, matching InventoryController.Adjust — the body value is kept
        // only as a fallback for kiosk/service tokens that carry no usable claim.
        var completedBy = CallerId() ?? req.CompletedBy;

        count.Status = "pending_review";
        count.CompletedBy = completedBy;
        count.CompletedAt = DateTime.UtcNow;
        count.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var varianceCount = count.Items.Count(i => i.CountedQuantity.HasValue && i.Variance != 0);
        await audit.LogAsync("submit_stock_count", "StockCount", count.Id, completedBy, count.BranchId,
            $"{{\"itemsCounted\":{count.Items.Count(i => i.CountedQuantity.HasValue)},\"variances\":{varianceCount}}}",
            varianceCount > 0 ? "warning" : "info");

        var result = await WithIncludes().Include(c => c.Items).ThenInclude(i => i.Product).FirstAsync(c => c.Id == count.Id);
        return Ok(result);
    }

    // First sign-off stage. A pending_review session has touched nothing yet — approving here just
    // hands it to an approver; rejecting ends it immediately with stock still untouched. No
    // separate "Review" permission exists in the Module/Action matrix, so this is gated on Edit
    // (the same action RecordCount/Complete already require) while the final money-moving step
    // below requires Approve.
    [RequirePermission("Stocks", PermAction.Edit)]
    [HttpPatch("{id:guid}/review")]
    public async Task<IActionResult> Review(Guid id, [FromBody] ReviewStockCountRequest req)
    {
        var count = await db.StockCounts.FirstOrDefaultAsync(c => c.Id == id);
        if (count is null) return NotFound();
        if (count.Status != "pending_review")
            return BadRequest(new { message = "This count session is not awaiting review." });

        var (role, callerBranchId) = GetCallerContext();
        if (role != "tenant_admin" && callerBranchId.HasValue && count.BranchId != callerBranchId)
            return StatusCode(403, new { message = "You may only review stock counts at your own branch." });

        if (!req.Approved && string.IsNullOrWhiteSpace(req.Reason))
            return BadRequest(new { message = "A rejection reason is required." });

        var reviewerId = CallerId();
        count.ReviewedBy = reviewerId;
        count.ReviewedAt = DateTime.UtcNow;
        count.Status = req.Approved ? "pending_approval" : "rejected";
        count.RejectionReason = req.Approved ? null : req.Reason;
        count.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync(req.Approved ? "review_stock_count" : "reject_stock_count", "StockCount", count.Id,
            reviewerId, count.BranchId, req.Approved ? null : $"{{\"reason\":{System.Text.Json.JsonSerializer.Serialize(req.Reason)}}}",
            req.Approved ? "info" : "warning");

        var result = await WithIncludes().Include(c => c.Items).ThenInclude(i => i.Product).FirstAsync(c => c.Id == count.Id);
        return Ok(result);
    }

    // Final sign-off. Only now does the counted variance actually move stock: posts an
    // InventoryAdjustment for every counted line whose variance isn't zero and sets on-hand
    // quantity to what was actually counted — reusing the exact adjustment pipeline
    // InventoryController.Adjust already writes to, so this shows up in the same audit/report
    // surfaces as any other stock adjustment. Rejecting here is a no-op on stock — nothing was
    // ever applied, so there is nothing to reverse.
    [RequirePermission("Stocks", PermAction.Approve)]
    [HttpPatch("{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ReviewStockCountRequest req)
    {
        var count = await db.StockCounts.Include(c => c.Items).FirstOrDefaultAsync(c => c.Id == id);
        if (count is null) return NotFound();
        if (count.Status != "pending_approval")
            return BadRequest(new { message = "This count session is not awaiting approval." });

        var (role, callerBranchId) = GetCallerContext();
        if (role != "tenant_admin" && callerBranchId.HasValue && count.BranchId != callerBranchId)
            return StatusCode(403, new { message = "You may only approve stock counts at your own branch." });

        if (!req.Approved && string.IsNullOrWhiteSpace(req.Reason))
            return BadRequest(new { message = "A rejection reason is required." });

        var approverId = CallerId();

        if (!req.Approved)
        {
            count.ApprovedBy = approverId;
            count.ApprovedAt = DateTime.UtcNow;
            count.Status = "rejected";
            count.RejectionReason = req.Reason;
            count.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
            await audit.LogAsync("reject_stock_count", "StockCount", count.Id, approverId, count.BranchId,
                $"{{\"reason\":{System.Text.Json.JsonSerializer.Serialize(req.Reason)}}}", "warning");
            var rejected = await WithIncludes().Include(c => c.Items).ThenInclude(i => i.Product).FirstAsync(c => c.Id == count.Id);
            return Ok(rejected);
        }

        var adjustments = new List<InventoryAdjustment>();
        var reducedProductIds = new List<Guid>();
        foreach (var item in count.Items.Where(i => i.CountedQuantity.HasValue && i.Variance != 0))
        {
            var variance = item.Variance!.Value;

            if (count.BranchId.HasValue)
            {
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
                    AdjustedBy = count.CompletedBy,
                    ApprovedBy = approverId,
                    ApprovalStatus = "approved",
                    ApprovedAt = DateTime.UtcNow,
                    StockApplied = true,
                    CreatedAt = DateTime.UtcNow,
                };
                adjustments.Add(adjustment);

                var quantityBefore = stock.Quantity;
                stock.Quantity = Math.Max(0, item.CountedQuantity!.Value);
                stock.LastUpdated = DateTime.UtcNow;

                stockMovements.Record(
                    item.ProductId, count.BranchId, warehouseId: null,
                    movementType: variance > 0 ? "reconciliation_addition" : "reconciliation_subtraction",
                    quantity: variance,
                    referenceType: "stock_count", referenceId: count.Id,
                    notes: $"Stocking review reconciliation (session {count.Id})",
                    createdBy: approverId,
                    quantityBefore: quantityBefore, quantityAfter: stock.Quantity);
            }
            else
            {
                var stock = await db.WarehouseStocks.FirstOrDefaultAsync(s => s.ProductId == item.ProductId && s.WarehouseId == count.WarehouseId);
                if (stock is null) continue;

                var quantityBefore = stock.Quantity;
                stock.Quantity = Math.Max(0, item.CountedQuantity!.Value);
                stock.LastUpdated = DateTime.UtcNow;

                stockMovements.Record(
                    item.ProductId, branchId: null, warehouseId: count.WarehouseId,
                    movementType: variance > 0 ? "reconciliation_addition" : "reconciliation_subtraction",
                    quantity: variance,
                    referenceType: "stock_count", referenceId: count.Id,
                    notes: $"Stocking review reconciliation (session {count.Id})",
                    createdBy: approverId,
                    quantityBefore: quantityBefore, quantityAfter: stock.Quantity);
            }
        }
        db.InventoryAdjustments.AddRange(adjustments);

        count.Status = "approved";
        count.ApprovedBy = approverId;
        count.ApprovedAt = DateTime.UtcNow;
        count.StockApplied = true;
        count.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync("approve_stock_count", "StockCount", count.Id, approverId, count.BranchId,
            $"{{\"itemsCounted\":{count.Items.Count(i => i.CountedQuantity.HasValue)},\"adjustments\":{adjustments.Count}}}",
            adjustments.Count > 0 ? "warning" : "info");

        // A physical count that revised on-hand downward can drop a product below its reorder
        // point — fire the low-stock alert now rather than waiting for the background sweep.
        // Branch-only: the alert service has no warehouse-scoped variant.
        if (count.BranchId.HasValue)
        {
            foreach (var productId in reducedProductIds)
            {
                try { await stockAlerts.CheckStockLevelAsync(productId, count.BranchId.Value); }
                catch (Exception ex) { logger.LogError(ex, "Low-stock check failed after stock count for product {ProductId}", productId); }
            }
        }

        // Re-fetch with the same Includes GetById uses — the tracked `count` above has no
        // Branch/Warehouse/Product loaded, which rendered as "Unknown" products in the completed view.
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
public record StartStockCountRequest(Guid? BranchId, Guid? WarehouseId, Guid? CategoryId, Guid? StartedBy, string? Notes, string? CountType = null);
public record RecordCountRequest(Guid ProductId, decimal CountedQuantity);
public record CompleteStockCountRequest(Guid? CompletedBy);
public record ReviewStockCountRequest(bool Approved, string? Reason);
