using System.Security.Claims;
using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

// Product recall tracking (FRD §13).
//
// Gated on the existing "Batches" permission module rather than a new "Recalls" module: a new
// module would be absent from RolePermissions on every already-deployed database, and
// RequirePermission denies on absence — every role would be locked out until someone hand-seeded
// the rows. Recalls are batch lifecycle, so "Batches" is also where the grant belongs.
//
// An open recall blocks sales (enforced in OrdersController.Create) but does NOT itself move stock:
// the goods are still physically on the shelf and the count must stay honest. Withdrawing them is
// a separate, explicit act — POST /{id}/quarantine — which writes ordinary "damage" adjustments
// through the same pipeline as every other write-off rather than inventing a second way to move
// stock.
[ApiController]
[Route("api/recalls")]
public class RecallsController(
    BaqalaDbContext db,
    IStockMovementService stockMovements,
    INotificationService notifications,
    IAuditService audit,
    ILogger<RecallsController> logger) : ControllerBase
{
    private static readonly string[] ValidTypes =
        ["supplier_notice", "quality_issue", "contamination", "mislabeling", "regulatory", "other"];
    private static readonly string[] ValidSeverities = ["low", "medium", "high", "critical"];

    private (string? Role, Guid? BranchId) GetCallerContext() =>
        (User.FindFirst("role")?.Value,
         Guid.TryParse(User.FindFirst("branchId")?.Value, out var b) ? b : null);

    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id)
            ? id : null;

    [HttpGet]
    [RequirePermission("Batches", PermAction.View)]
    public async Task<IActionResult> GetAll(
        [FromQuery] Guid? productId,
        [FromQuery] Guid? branchId,
        [FromQuery] Guid? batchId,
        [FromQuery] string? status,
        [FromQuery] string? severity)
    {
        var query = db.ProductRecalls
            .Include(r => r.Product)
            .Include(r => r.Batch)
            .Include(r => r.Branch)
            .Include(r => r.Supplier)
            .Include(r => r.InitiatedByUser)
            .Include(r => r.ClosedByUser)
            .AsQueryable();

        if (productId.HasValue) query = query.Where(r => r.ProductId == productId);
        if (batchId.HasValue) query = query.Where(r => r.BatchId == batchId);
        if (status is not null) query = query.Where(r => r.Status == status);
        if (severity is not null) query = query.Where(r => r.Severity == severity);

        // A branch user sees recalls that affect them: their own branch's, plus tenant-wide ones.
        var (role, callerBranch) = GetCallerContext();
        if (role != "tenant_admin" && callerBranch.HasValue)
            query = query.Where(r => r.BranchId == null || r.BranchId == callerBranch);
        else if (branchId.HasValue)
            query = query.Where(r => r.BranchId == branchId);

        return Ok(await query.OrderByDescending(r => r.CreatedAt).ToListAsync());
    }

    // The product ids a till must refuse to sell at this branch, and why.
    //
    // Deliberately NOT gated on Batches:View, unlike every other read here. This is sale-gating
    // data, not batch administration: the Cashier role is seeded with Batches = false on every
    // action (DataSeeder), so gating it would 403 the very screen that needs it — the client-side
    // block would silently never engage, and RequirePermissionAttribute would post an
    // "Unauthorized Action Attempt" warning to the cashier on every POS load. Authenticated-only
    // matches GET /api/inventory/batches, which the POS's expired-item guard already reads for
    // exactly the same purpose.
    //
    // Returns ids only — no reasons, costs, or supplier data — so it leaks nothing a cashier
    // can't already infer by scanning the item. OrdersController.Create remains the enforcement;
    // this only moves the failure from payment time to scan time.
    [HttpGet("blocked-products")]
    public async Task<IActionResult> GetBlockedProducts([FromQuery] Guid? branchId)
    {
        var (role, callerBranch) = GetCallerContext();
        var branch = role != "tenant_admin" ? callerBranch ?? branchId : branchId;

        var open = await db.ProductRecalls
            .Where(r => r.Status == "open" && (r.BranchId == null || r.BranchId == branch))
            .Select(r => new { r.ProductId, r.BatchId, r.RecallNumber })
            .ToListAsync();
        if (open.Count == 0) return Ok(Array.Empty<object>());

        // A recall with no batch blocks the product outright. A lot-scoped one blocks only while
        // that lot is still on hand — otherwise a sold-out recalled lot would keep blocking a
        // product now stocked entirely from clean batches. Resolved here rather than in the client
        // so the POS doesn't have to pull the whole batch list to work it out.
        var lotScoped = open.Where(r => r.BatchId.HasValue).Select(r => r.BatchId!.Value).Distinct().ToList();
        var onHand = lotScoped.Count == 0
            ? []
            : await db.InventoryBatches
                .Where(b => lotScoped.Contains(b.Id) && b.RemainingQuantity > 0 &&
                            (branch == null || b.BranchId == branch))
                .Select(b => b.Id)
                .ToListAsync();

        var blocked = open
            .Where(r => !r.BatchId.HasValue || onHand.Contains(r.BatchId.Value))
            .GroupBy(r => r.ProductId)
            .Select(g => new { productId = g.Key, recallNumber = g.First().RecallNumber })
            .ToList();

        return Ok(blocked);
    }

    [HttpGet("{id:guid}")]
    [RequirePermission("Batches", PermAction.View)]
    public async Task<IActionResult> GetById(Guid id)
    {
        var recall = await db.ProductRecalls
            .Include(r => r.Product).Include(r => r.Batch).Include(r => r.Branch)
            .Include(r => r.Supplier).Include(r => r.InitiatedByUser).Include(r => r.ClosedByUser)
            .FirstOrDefaultAsync(r => r.Id == id);
        return recall is null ? NotFound() : Ok(recall);
    }

    // How much of the recalled stock is still on hand, and where. This is what tells staff whether
    // the recall is actionable — a recall on a lot that sold out entirely needs customer outreach,
    // not shelf-clearing.
    [HttpGet("{id:guid}/impact")]
    [RequirePermission("Batches", PermAction.View)]
    public async Task<IActionResult> GetImpact(Guid id)
    {
        var recall = await db.ProductRecalls.FindAsync(id);
        if (recall is null) return NotFound();

        var batches = db.InventoryBatches.Where(b => b.ProductId == recall.ProductId && b.RemainingQuantity > 0);
        if (recall.BatchId.HasValue) batches = batches.Where(b => b.Id == recall.BatchId);
        if (recall.BranchId.HasValue) batches = batches.Where(b => b.BranchId == recall.BranchId);

        var onHand = await batches
            .Include(b => b.Branch).Include(b => b.Warehouse)
            .Select(b => new
            {
                batchId = b.Id,
                batchNumber = b.BatchNumber,
                branchId = b.BranchId,
                branchName = b.Branch != null ? b.Branch.Name : null,
                warehouseId = b.WarehouseId,
                warehouseName = b.Warehouse != null ? b.Warehouse.Name : null,
                remainingQuantity = b.RemainingQuantity,
                expiryDate = b.ExpiryDate,
            })
            .ToListAsync();

        // Which customers received the recalled lot. Answerable only for sales made after
        // order_items.batch_id started being populated (see OrdersController.Create) — historic
        // lines have no lot recorded, so this deliberately under-reports rather than guessing.
        var soldQuery = db.OrderItems
            .Include(i => i.Order).ThenInclude(o => o!.Customer)
            .Where(i => i.ProductId == recall.ProductId && i.BatchId != null);
        if (recall.BatchId.HasValue) soldQuery = soldQuery.Where(i => i.BatchId == recall.BatchId);
        if (recall.BranchId.HasValue) soldQuery = soldQuery.Where(i => i.Order!.BranchId == recall.BranchId);

        var sold = await soldQuery
            .OrderByDescending(i => i.Order!.CreatedAt)
            .Take(500)
            .Select(i => new
            {
                orderId = i.OrderId,
                orderNumber = i.Order!.OrderNumber,
                soldAt = i.Order.CreatedAt,
                quantity = i.Quantity,
                batchId = i.BatchId,
                customerId = i.Order.CustomerId,
                customerName = i.Order.Customer != null ? i.Order.Customer.FullName : null,
                customerPhone = i.Order.Customer != null ? i.Order.Customer.Phone : null,
            })
            .ToListAsync();

        return Ok(new
        {
            recallId = recall.Id,
            recallNumber = recall.RecallNumber,
            status = recall.Status,
            quantityQuarantined = recall.QuantityQuarantined,
            totalOnHand = onHand.Sum(b => b.remainingQuantity),
            locations = onHand,
            soldUnits = sold.Sum(s => s.quantity),
            // Capped at 500 rows. Surfaced rather than silently truncated — an under-reported
            // recall outreach list is a safety problem, not a UX one.
            affectedSalesTruncated = sold.Count == 500,
            affectedSales = sold,
        });
    }

    [HttpPost]
    [RequirePermission("Batches", PermAction.Create)]
    public async Task<IActionResult> Create([FromBody] RecallRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Reason))
            return BadRequest(new { message = "A recall reason is required." });

        var product = await db.Products.FindAsync(req.ProductId);
        if (product is null) return BadRequest(new { message = "Product not found." });

        var recallType = req.RecallType ?? "other";
        if (!ValidTypes.Contains(recallType))
            return BadRequest(new { message = $"recallType must be one of: {string.Join(", ", ValidTypes)}" });

        var severity = req.Severity ?? "high";
        if (!ValidSeverities.Contains(severity))
            return BadRequest(new { message = $"severity must be one of: {string.Join(", ", ValidSeverities)}" });

        InventoryBatch? batch = null;
        if (req.BatchId.HasValue)
        {
            batch = await db.InventoryBatches.FindAsync(req.BatchId.Value);
            if (batch is null) return BadRequest(new { message = "Batch not found." });
            if (batch.ProductId != req.ProductId)
                return BadRequest(new { message = "That batch does not belong to the selected product." });
        }

        if (req.BranchId.HasValue && !await db.Branches.AnyAsync(b => b.Id == req.BranchId))
            return BadRequest(new { message = "Branch not found." });

        // Actor comes from the JWT, never the request body — an audit trail whose actor is
        // client-supplied attests to nothing. Same rule InventoryController already follows.
        var (role, callerBranch) = GetCallerContext();
        var scopedBranch = role != "tenant_admin" ? callerBranch ?? req.BranchId : req.BranchId;

        var recall = new ProductRecall
        {
            Id = Guid.NewGuid(),
            RecallNumber = $"RCL-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..4]}",
            ProductId = req.ProductId,
            BatchId = req.BatchId,
            BranchId = scopedBranch,
            SupplierId = req.SupplierId ?? batch?.SupplierId,
            Reason = req.Reason,
            RecallType = recallType,
            Severity = severity,
            Status = "open",
            Notes = req.Notes,
            InitiatedBy = CallerId(),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        db.ProductRecalls.Add(recall);
        await db.SaveChangesAsync();

        // Tell the people who have to act on it. A recall that nobody is told about is a database
        // row, not a control.
        try
        {
            var scope = batch is not null ? $"batch {batch.BatchNumber ?? batch.Id.ToString()[..8]}" : "all batches";
            await notifications.NotifyRoleAsync(
                ["Manager", "Admin"], recall.BranchId,
                "Expiry / Perishable", "Product Recall",
                $"Recall {recall.RecallNumber}: {product.Name}",
                $"{product.Name} ({scope}) is under recall — {recall.Reason}. Remove from sale.",
                severity: severity is "critical" or "high" ? "error" : "warning",
                entityType: "ProductRecall", entityId: recall.Id);
        }
        catch (Exception ex) { logger.LogError(ex, "Recall notification failed for {RecallNumber}", recall.RecallNumber); }

        await AuditAsync("create_recall", recall, before: null, severity: "warning");
        return CreatedAtAction(nameof(GetById), new { id = recall.Id }, recall);
    }

    // Withdraw the recalled stock from inventory. Writes a "damage" adjustment + a ledger movement
    // per affected batch — the same pipeline InventoryController.Adjust uses — so the write-off
    // shows up in the Wastage report and the Stock Movement timeline exactly like any other, rather
    // than stock quietly vanishing.
    [HttpPost("{id:guid}/quarantine")]
    [RequirePermission("Batches", PermAction.Edit)]
    public async Task<IActionResult> Quarantine(Guid id)
    {
        var recall = await db.ProductRecalls.Include(r => r.Product).FirstOrDefaultAsync(r => r.Id == id);
        if (recall is null) return NotFound();
        if (recall.Status != "open")
            return BadRequest(new { message = "Only an open recall can be quarantined." });

        var batchQuery = db.InventoryBatches.Where(b => b.ProductId == recall.ProductId && b.RemainingQuantity > 0);
        if (recall.BatchId.HasValue) batchQuery = batchQuery.Where(b => b.Id == recall.BatchId);
        if (recall.BranchId.HasValue) batchQuery = batchQuery.Where(b => b.BranchId == recall.BranchId);

        var batches = await batchQuery.ToListAsync();
        if (batches.Count == 0)
            return BadRequest(new { message = "No stock on hand for this recall — nothing to quarantine." });

        decimal total = 0;
        var callerId = CallerId();

        foreach (var batch in batches)
        {
            var qty = batch.RemainingQuantity;
            if (qty <= 0) continue;

            decimal? before = null;
            decimal? after = null;

            if (batch.BranchId.HasValue)
            {
                var stock = await db.InventoryStocks
                    .FirstOrDefaultAsync(s => s.ProductId == batch.ProductId && s.BranchId == batch.BranchId);
                if (stock is not null)
                {
                    before = stock.Quantity;
                    // Clamped at zero, matching InventoryController.Adjust's treatment of a
                    // write-off. Batch remaining can exceed the aggregate when they've drifted, and
                    // a recall must not be the thing that drives on-hand negative.
                    stock.Quantity = Math.Max(0, stock.Quantity - qty);
                    after = stock.Quantity;
                    stock.LastUpdated = DateTime.UtcNow;
                    stock.UpdatedAt = DateTime.UtcNow;
                }
            }
            else if (batch.WarehouseId.HasValue)
            {
                var stock = await db.WarehouseStocks
                    .FirstOrDefaultAsync(s => s.ProductId == batch.ProductId && s.WarehouseId == batch.WarehouseId);
                if (stock is not null)
                {
                    before = stock.Quantity;
                    stock.Quantity = Math.Max(0, stock.Quantity - qty);
                    after = stock.Quantity;
                    stock.UpdatedAt = DateTime.UtcNow;
                }
            }

            db.InventoryAdjustments.Add(new InventoryAdjustment
            {
                Id = Guid.NewGuid(),
                ProductId = batch.ProductId,
                BranchId = batch.BranchId,
                WarehouseId = batch.WarehouseId,
                BatchId = batch.Id,
                AdjustmentType = "damage",
                Quantity = -qty,
                Reason = $"Recall {recall.RecallNumber}",
                Notes = recall.Reason,
                AdjustedBy = callerId,
                CreatedAt = DateTime.UtcNow,
            });

            stockMovements.Record(
                batch.ProductId, batch.BranchId, batch.WarehouseId,
                movementType: "damage", quantity: -qty, batchId: batch.Id,
                referenceType: "ProductRecall", referenceId: recall.Id, referenceNumber: recall.RecallNumber,
                notes: $"Quarantined under recall {recall.RecallNumber}", createdBy: callerId,
                quantityBefore: before, quantityAfter: after);

            batch.RemainingQuantity = 0;
            // Don't overwrite "expired": a lot can be past its date and not yet written off (the
            // expiry scan runs every 15 minutes), and relabelling it "consumed" would drop it off
            // the Batches & Expiry watch-list — which filters to near_expiry/expired — and lose the
            // reason it left inventory. Quarantining an already-expired lot is still correct; it
            // just stays recorded as expired.
            if (batch.Status != "expired") batch.Status = "consumed";
            batch.UpdatedAt = DateTime.UtcNow;
            total += qty;
        }

        var beforeSnapshot = Snapshot(recall);
        recall.QuantityQuarantined += total;
        recall.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();

        await AuditAsync("quarantine_recall", recall, beforeSnapshot, severity: "warning");
        return Ok(new { recall.Id, recall.RecallNumber, quarantined = total, recall.QuantityQuarantined });
    }

    [HttpPost("{id:guid}/close")]
    [RequirePermission("Batches", PermAction.Approve)]
    public async Task<IActionResult> Close(Guid id, [FromBody] CloseRecallRequest req)
    {
        var recall = await db.ProductRecalls.FindAsync(id);
        if (recall is null) return NotFound();
        if (recall.Status == "closed") return BadRequest(new { message = "This recall is already closed." });

        var before = Snapshot(recall);
        recall.Status = "closed";
        recall.Resolution = req.Resolution;
        recall.ClosedBy = CallerId();
        recall.ClosedAt = DateTime.UtcNow;
        recall.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await AuditAsync("close_recall", recall, before, severity: "warning");
        return Ok(recall);
    }

    [HttpPut("{id:guid}")]
    [RequirePermission("Batches", PermAction.Edit)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateRecallRequest req)
    {
        var recall = await db.ProductRecalls.FindAsync(id);
        if (recall is null) return NotFound();

        if (req.Severity is not null && !ValidSeverities.Contains(req.Severity))
            return BadRequest(new { message = $"severity must be one of: {string.Join(", ", ValidSeverities)}" });
        if (req.RecallType is not null && !ValidTypes.Contains(req.RecallType))
            return BadRequest(new { message = $"recallType must be one of: {string.Join(", ", ValidTypes)}" });

        var before = Snapshot(recall);
        recall.Reason = req.Reason ?? recall.Reason;
        recall.RecallType = req.RecallType ?? recall.RecallType;
        recall.Severity = req.Severity ?? recall.Severity;
        recall.Notes = req.Notes ?? recall.Notes;
        recall.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await AuditAsync("update_recall", recall, before, severity: "warning");
        return Ok(recall);
    }

    // Audit must never fail the write it describes — same contract as ProductsController.AuditAsync.
    private async Task AuditAsync(string action, ProductRecall recall, object? before, string severity = "info")
    {
        try
        {
            await audit.LogAsync(
                action: action,
                entityType: "ProductRecall",
                entityId: recall.Id,
                userId: CallerId(),
                branchId: recall.BranchId,
                details: System.Text.Json.JsonSerializer.Serialize(Snapshot(recall)),
                severity: severity,
                beforeValue: before is null ? null : System.Text.Json.JsonSerializer.Serialize(before),
                notes: recall.Reason);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Audit log failed for recall {RecallId} ({Action})", recall.Id, action);
        }
    }

    // camelCase and flat — src/lib/audit-changes.ts silently renders nothing for a shape it doesn't
    // recognise, which is the exact failure its lowerKeys helper exists to repair.
    private static object Snapshot(ProductRecall r) => new
    {
        recallNumber = r.RecallNumber,
        productId = r.ProductId,
        batchId = r.BatchId,
        branchId = r.BranchId,
        supplierId = r.SupplierId,
        reason = r.Reason,
        recallType = r.RecallType,
        severity = r.Severity,
        status = r.Status,
        quantityQuarantined = r.QuantityQuarantined,
        resolution = r.Resolution,
    };
}

public record RecallRequest(
    Guid ProductId,
    Guid? BatchId,
    Guid? BranchId,
    Guid? SupplierId,
    string Reason,
    string? RecallType,
    string? Severity,
    string? Notes
);

public record UpdateRecallRequest(
    string? Reason,
    string? RecallType,
    string? Severity,
    string? Notes
);

public record CloseRecallRequest(string? Resolution);
