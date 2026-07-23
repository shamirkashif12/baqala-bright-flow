using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
// Both ledgers are recorded here, and they answer different questions: IStockMovementService is the
// inventory ledger (what moved, signed quantity, against which batch/reference), IAuditService is the
// employee trail (who did it, before/after on-hand, why). Neither subsumes the other — a movement row
// has no actor context and an audit row has no signed quantity — so an adjustment writes both.
public class InventoryController(
    BaqalaDbContext db,
    IStockAlertService stockAlerts,
    IStockMovementService stockMovements,
    IAuditService audit,
    ILogger<InventoryController> logger) : ControllerBase
{
    // Branch-scoped roles (anything but tenant_admin) may only see/write their own branch's
    // batches — mirrors the scoping the frontend already applies to the plain stock list.
    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    // The acting user comes from the JWT, never from the request body. AdjustRequest.AdjustedBy was
    // client-supplied and most callers (the Inventory "Adjust stock" dialog, POS quick stock-in)
    // simply omitted it — so the adjustment persisted a null actor and the Employee Audit Center
    // rendered it as "System". Reading claims also closes the spoofing hole the body field opened:
    // any cashier could previously attribute their own adjustment to another user.
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : null;

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
        // Mirrors GetStock's branch scoping above, which this direct lookup previously skipped.
        var (role, callerBranchId) = GetCallerContext();
        if (role is not null && role != "tenant_admin" && callerBranchId.HasValue && branchId != callerBranchId)
            return NotFound();

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
        [FromQuery] Guid[]? branchId, [FromQuery] Guid[]? warehouseId, [FromQuery] Guid? productId, [FromQuery] string[]? status,
        [FromQuery] string? locationType)
    {
        var (role, callerBranchId) = GetCallerContext();
        // Only clobber branchId onto a branch-scoped request — a caller explicitly asking for a
        // WAREHOUSE's batches isn't querying "their branch" at all, and warehouse batches always
        // have BranchId null (mutually exclusive with WarehouseId), so forcing branchId here would
        // AND together a non-null branch filter with the warehouse filter and always return empty.
        var hasWarehouseFilter = warehouseId is { Length: > 0 };
        if (role is not null && role != "tenant_admin" && callerBranchId.HasValue && !hasWarehouseFilter) branchId = [callerBranchId.Value];

        var query = db.InventoryBatches
            .Include(b => b.Product)
            .Include(b => b.Supplier)
            .AsQueryable();
        // "Any branch"/"any warehouse" browsing (no specific id picked) still needs to stay
        // scoped to that location TYPE — otherwise it falls through to no location filter at
        // all and returns every batch system-wide, branches and warehouses mixed together.
        var hasBranchFilter = branchId is { Length: > 0 };
        if (locationType == "branch" && !hasBranchFilter) query = query.Where(b => b.BranchId != null);
        else if (locationType == "warehouse" && !hasWarehouseFilter) query = query.Where(b => b.WarehouseId != null);
        if (productId.HasValue) query = query.Where(b => b.ProductId == productId);

        // branchId/warehouseId/status are arrays — never `.Contains()` a Guid[]/string[] directly
        // against a DbSet-backed IQueryable on this repo's MySQL provider (see the
        // ef-mysql-inlist-gotcha memory: throws at execution time on 2+ values despite compiling
        // and passing a single-value smoke test). Applied in-memory below.
        var all = await query.OrderBy(b => b.ExpiryDate).ToListAsync();
        IEnumerable<InventoryBatch> scoped = all;
        if (hasBranchFilter) scoped = scoped.Where(b => b.BranchId.HasValue && branchId!.Contains(b.BranchId.Value));
        if (hasWarehouseFilter) scoped = scoped.Where(b => b.WarehouseId.HasValue && warehouseId!.Contains(b.WarehouseId.Value));
        if (status is { Length: > 0 }) scoped = scoped.Where(b => status.Contains(b.Status));
        return Ok(scoped.ToList());
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

        var product = await db.Products.FindAsync(req.ProductId);
        var qtyError = QuantityValidation.ValidateWholeUnit(product, req.Quantity, "Received quantity");
        if (qtyError is not null) return BadRequest(new { message = qtyError });

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
        // Captured before the mutation for the same reason Adjust does it: receiving stock is an
        // inventory movement, and a reviewer needs the on-hand quantity either side of it.
        var quantityBefore = stock?.Quantity ?? 0m;
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
            batchId: batch.Id, referenceType: "manual_receive", referenceId: batch.Id, notes: req.DamagedOrReturnReason,
            createdBy: CallerId(),
            quantityBefore: quantityBefore, quantityAfter: quantityBefore + req.Quantity);

        await db.SaveChangesAsync();

        // Receiving stock was previously invisible to the Employee Audit Center — the batch and the
        // on-hand increase were both written with no audit row, so "who added this stock?" had no
        // answer. Best-effort: the write is committed, so a failed audit must not 500 the caller.
        try
        {
            await audit.LogAsync(
                action: "receive_batch",
                entityType: "InventoryBatch",
                entityId: batch.Id,
                userId: CallerId(),
                branchId: req.BranchId,
                details: System.Text.Json.JsonSerializer.Serialize(new
                {
                    productId = req.ProductId,
                    batchNumber = batch.BatchNumber,
                    quantity = req.Quantity,
                    purchaseCost = req.PurchaseCost,
                    expiryDate = req.ExpiryDate,
                    supplierId = req.SupplierId,
                    quantityAfter = quantityBefore + req.Quantity,
                }),
                // A back-dated expiry is an override the reviewer should see, not routine receiving.
                severity: string.IsNullOrWhiteSpace(req.DamagedOrReturnReason) ? "info" : "warning",
                beforeValue: System.Text.Json.JsonSerializer.Serialize(new { quantityBefore }),
                notes: req.DamagedOrReturnReason);
        }
        catch (Exception ex) { logger.LogError(ex, "Audit log failed for batch {BatchId}", batch.Id); }

        return Created($"/api/inventory/batches/{batch.Id}", batch);
    }

    // Single source of truth for "how did stock actually move" — every stock-mutating endpoint in
    // the app (PO receive, sale, transfer ship/receive/restore, manual receive/adjust, expiry
    // write-off) appends to this ledger in the same request that changes the stock, so this list
    // is never missing a step the way the old page-level reconstruction from five different
    // tables was.
    [HttpGet("movements")]
    public async Task<IActionResult> GetMovements(
        [FromQuery] Guid? productId, [FromQuery] Guid[]? branchId, [FromQuery] Guid? warehouseId,
        [FromQuery] Guid? batchId, [FromQuery] string? movementType, [FromQuery] DateTime? from, [FromQuery] DateTime? to,
        [FromQuery] int limit = 200)
    {
        // Mirrors GetBatches/GetStock above — don't clobber branchId onto an explicit warehouse query.
        var (role, callerBranchId) = GetCallerContext();
        if (role is not null && role != "tenant_admin" && callerBranchId.HasValue && !warehouseId.HasValue) branchId = [callerBranchId.Value];

        var query = db.StockMovements
            .Include(m => m.Product)
            .Include(m => m.Branch)
            .Include(m => m.Warehouse)
            .Include(m => m.Batch)
            .Include(m => m.CreatedByUser)
            .AsQueryable();
        if (productId.HasValue) query = query.Where(m => m.ProductId == productId);
        if (warehouseId.HasValue) query = query.Where(m => m.WarehouseId == warehouseId);
        if (batchId.HasValue) query = query.Where(m => m.BatchId == batchId);
        if (!string.IsNullOrEmpty(movementType)) query = query.Where(m => m.MovementType == movementType);
        if (from.HasValue) query = query.Where(m => m.CreatedAt >= from);
        if (to.HasValue) query = query.Where(m => m.CreatedAt <= to);

        // CreatedByUser was serialized whole (email, username, phone, status, last login) with no
        // permission gate at all; the frontend type (src/lib/api.ts) only ever reads id+fullName.
        // branchId is an array (multi-select filter) — never `.Contains()` a Guid[] directly
        // against a DbSet-backed IQueryable on this repo's MySQL provider (ef-mysql-inlist-gotcha
        // memory), so it's applied in-memory after materializing, with Take() moved after it.
        var all = await query.OrderByDescending(m => m.CreatedAt)
            .Select(m => new
            {
                m.Id, m.ProductId, m.BranchId, m.WarehouseId, m.BatchId, m.MovementType, m.Quantity,
                m.ReferenceType, m.ReferenceId, m.ReferenceNumber, m.Notes, m.CreatedBy, m.CreatedAt,
                m.Product, m.Branch, m.Warehouse, m.Batch,
                CreatedByUser = m.CreatedByUser == null ? null : new { m.CreatedByUser.Id, m.CreatedByUser.FullName },
            }).ToListAsync();
        var scoped = all.AsEnumerable();
        if (branchId is { Length: > 0 }) scoped = scoped.Where(m => m.BranchId.HasValue && branchId.Contains(m.BranchId.Value));
        var movements = scoped.Take(Math.Clamp(limit, 1, 1000)).ToList();
        return Ok(movements);
    }

    [HttpGet("adjustments")]
    public async Task<IActionResult> GetAdjustments(
        [FromQuery] Guid? branchId, [FromQuery] Guid? warehouseId, [FromQuery] Guid? batchId,
        [FromQuery] string? adjustmentType, [FromQuery] Guid? productId, [FromQuery] Guid? adjustedBy,
        [FromQuery] string? approvalStatus)
    {
        var (role, callerBranchId) = GetCallerContext();
        if (role is not null && role != "tenant_admin" && callerBranchId.HasValue && !warehouseId.HasValue) branchId = callerBranchId;

        var query = db.InventoryAdjustments
            .Include(a => a.Product)
            .Include(a => a.Branch)
            .Include(a => a.Warehouse)
            .Include(a => a.Batch)
            .Include(a => a.AdjustedByUser)
            .Include(a => a.ApprovedByUser)
            .AsQueryable();
        if (branchId.HasValue) query = query.Where(a => a.BranchId == branchId);
        if (warehouseId.HasValue) query = query.Where(a => a.WarehouseId == warehouseId);
        if (batchId.HasValue) query = query.Where(a => a.BatchId == batchId);
        if (productId.HasValue) query = query.Where(a => a.ProductId == productId);
        if (adjustedBy.HasValue) query = query.Where(a => a.AdjustedBy == adjustedBy);
        if (!string.IsNullOrEmpty(adjustmentType)) query = query.Where(a => a.AdjustmentType == adjustmentType);
        if (!string.IsNullOrEmpty(approvalStatus)) query = query.Where(a => a.ApprovalStatus == approvalStatus);

        // Branch scoping is applied at the top of the method (branchId is forced to the caller's
        // branch for non-admins), so the query is already restricted here.
        // Same redaction as GetMovements above — AdjustedByUser/ApprovedByUser were serialized whole.
        var adjustments = await query.OrderByDescending(a => a.CreatedAt)
            .Select(a => new
            {
                a.Id, a.ProductId, a.BranchId, a.WarehouseId, a.BatchId, a.AdjustmentType, a.Quantity,
                a.Reason, a.Notes, a.AdjustedBy, a.CreatedAt,
                a.ApprovalStatus, a.ApprovedBy, a.ApprovedAt, a.RejectionReason,
                a.Product, a.Branch, a.Warehouse, a.Batch,
                AdjustedByUser = a.AdjustedByUser == null ? null : new { a.AdjustedByUser.Id, a.AdjustedByUser.FullName },
                ApprovedByUser = a.ApprovedByUser == null ? null : new { a.ApprovedByUser.Id, a.ApprovedByUser.FullName },
            }).ToListAsync();
        return Ok(adjustments);
    }

    // This single endpoint is reached from three different pages, each gated on its own module
    // client-side: the Inventory page's Adjust dialog checks Inventory:Edit, the Stocks page's
    // own adjustment form checks Stocks:Create, and POS's Quick Stock In checks neither. A single
    // [RequirePermission("Stocks", ...)] attribute only satisfied the Stocks page — a role like
    // Branch Manager/Supervisor (Inventory:Edit=true, Stocks:Create=false in the seeded matrix)
    // saw the Inventory page's button, submitted the dialog, and got a 403 with stock never
    // actually adjusted. Accept either permission instead of picking one module over the other.
    [HttpPost("adjustments")]
    public async Task<IActionResult> Adjust([FromBody] AdjustRequest req)
    {
        if (!await PermissionCheck.HasPermissionAsync(User, db, "Inventory", PermAction.Edit)
            && !await PermissionCheck.HasPermissionAsync(User, db, "Stocks", PermAction.Create))
            return StatusCode(403, new { message = "You do not have permission to adjust stock." });

        // Same stock-write guard as ReceiveBatch: this endpoint had no quantity validation at
        // all, so a zero/negative value here was a second, unguarded route to the BUG-C1 class
        // of defect (corrupt on-hand quantity), separate from the Receive Batch form.
        if (req.Quantity <= 0)
            return BadRequest(new { message = "Adjustment quantity must be greater than zero." });

        var adjustProduct = await db.Products.FindAsync(req.ProductId);
        var adjustQtyError = QuantityValidation.ValidateWholeUnit(adjustProduct, req.Quantity, "Adjustment quantity");
        if (adjustQtyError is not null) return BadRequest(new { message = adjustQtyError });

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

        var stock = await db.InventoryStocks
            .FirstOrDefaultAsync(s => s.ProductId == req.ProductId && s.BranchId == req.BranchId);

        // A write-off (waste/damage/expired/theft/other) can't remove more than is actually on
        // hand — previously nothing checked this unless a specific batch was picked (the
        // batch-specific check above only fires with BatchId set), so e.g. writing off any
        // quantity against a product sitting at 0 on-hand was silently accepted and the removal
        // just clamped to zero. Mirrors ECR-09's warehouse-request fix: reject instead of
        // silently clamping. Scoped to the held-for-approval write-off types only — a plain
        // stock-count "correction" isn't bounded by the same on-hand check.
        if (!isIncrease && !req.BatchId.HasValue && RequiresApproval(req.AdjustmentType))
        {
            var onHand = stock?.Quantity ?? 0;
            if (req.Quantity > onHand)
                return BadRequest(new { message = $"Cannot record {req.Quantity} unit(s) — only {onHand} available on hand." });
        }

        // Recording wastage/damage (or any adjustment) against a product that has no stock row in
        // the chosen branch used to 404 with "Stock record not found", surfacing to the user as the
        // reported "Failed to record wastage". Once the on-hand check above passes, still create a
        // zero row here so the rest of the flow (ApplyAdjustmentToStock etc.) has a row to write to.
        // Mirrors the upsert the PO-receive path already does.
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

        // Falls back to the body only for callers with no usable claim (kiosk/service tokens);
        // an authenticated user's claim always wins over whatever the body asserts.
        var actingUserId = CallerId() ?? req.AdjustedBy;

        var requiresApproval = RequiresApproval(req.AdjustmentType);

        var adjustment = new InventoryAdjustment
        {
            Id = Guid.NewGuid(),
            ProductId = req.ProductId,
            BranchId = req.BranchId,
            BatchId = req.BatchId,
            Quantity = req.Quantity,
            AdjustmentType = req.AdjustmentType,
            Reason = req.Reason ?? "",
            AdjustedBy = actingUserId,
            // FRD §2.3: wastage write-offs (waste/damage/expired/theft/other) are held for sign-off
            // and DON'T touch on-hand until approved — same maker-checker gate as a stock transfer.
            // Everything else (cycle-count corrections, transfer legs) applies immediately.
            // Auto-expiry write-offs are raised directly by OperationalAlertsService, not through
            // this endpoint, so they never enter this queue.
            ApprovalStatus = requiresApproval ? "pending" : null,
            StockApplied = !requiresApproval,
            CreatedAt = DateTime.UtcNow,
        };
        db.InventoryAdjustments.Add(adjustment);

        // Captured before any mutation — InventoryAdjustment stores only the delta, so the on-hand
        // before/after exists nowhere else and is exactly what the audit trail (and the eventual
        // approval) needs. For a pending write-off nothing moves yet, so after == before.
        var quantityBefore = stock.Quantity;
        var quantityAfter = quantityBefore;

        if (!requiresApproval)
        {
            ApplyAdjustmentToStock(adjustment, stock, batch);
            quantityAfter = stock.Quantity;

            stockMovements.Record(
                req.ProductId, req.BranchId, warehouseId: null, movementType: $"adjustment_{req.AdjustmentType}",
                quantity: isIncrease ? req.Quantity : -req.Quantity,
                batchId: req.BatchId, referenceType: "adjustment", referenceId: adjustment.Id, notes: req.Reason,
                createdBy: actingUserId,
                // stock.Quantity is already mutated above, so it IS the after value. Not recomputed
                // from the delta — a clamped removal (Math.Max(0, …)) moves stock by less than the
                // requested quantity, and the audit trail must show what actually happened on hand.
                quantityBefore: quantityBefore, quantityAfter: quantityAfter);
        }

        await db.SaveChangesAsync();

        // Employee Audit Center — inventory adjustments are a listed employee action. Best-effort:
        // the stock write is already committed, so a failed audit write must not 500 the caller.
        try
        {
            // Denormalise the product name into the audit payload so the trail says WHAT was adjusted
            // ("Coca-Cola 330ml"), not just a GUID — reviewers and the CSV export shouldn't need a
            // second lookup, and a product later renamed/deleted still reads correctly at audit time.
            var productName = await db.Products.Where(p => p.Id == req.ProductId)
                .Select(p => p.Name).FirstOrDefaultAsync();
            await audit.LogAsync(
                action: "inventory_adjustment",
                entityType: "InventoryAdjustment",
                entityId: adjustment.Id,
                userId: actingUserId,
                branchId: req.BranchId,
                notes: productName is null ? null : $"{productName}",
                details: System.Text.Json.JsonSerializer.Serialize(new
                {
                    req.ProductId, ProductName = productName, req.AdjustmentType, req.Quantity,
                    Reason = req.Reason ?? "", QuantityAfter = quantityAfter, adjustment.ApprovalStatus,
                }),
                // Write-offs are the adjustments worth surfacing to a reviewer.
                severity: requiresApproval ? "warning" : "info",
                beforeValue: System.Text.Json.JsonSerializer.Serialize(new { QuantityBefore = quantityBefore }));
        }
        catch (Exception ex) { logger.LogError(ex, "Audit log failed for adjustment {AdjustmentId}", adjustment.Id); }

        // Low-stock re-check only when on-hand actually dropped just now. A pending write-off hasn't
        // moved stock yet — that check runs when it's approved. Best-effort: never fail the write.
        if (!requiresApproval && req.AdjustmentType is not ("addition" or "return_to_supplier" or "transfer_in"))
        {
            try { await stockAlerts.CheckStockLevelAsync(req.ProductId, req.BranchId); }
            catch (Exception ex) { logger.LogError(ex, "Low-stock check failed after adjustment for product {ProductId}", req.ProductId); }
        }

        return Created($"/api/inventory/adjustments/{adjustment.Id}", adjustment);
    }

    // Which adjustment types are held for human review before stock moves (FRD §2.3). The wastage
    // write-off set — value is being destroyed, so a second person signs off. Manually-recorded
    // "expired" IS reviewed (a person chose it); auto-expiry bypasses this endpoint entirely.
    private static bool RequiresApproval(string adjustmentType) =>
        adjustmentType is "waste" or "damage" or "expired" or "theft" or "other";

    // Applies an adjustment's delta to on-hand: aggregate stock first (clamped at zero on a
    // removal, matching OrdersController.Create), then the selected batch's RemainingQuantity
    // (never its immutable received Quantity). Reused by Adjust (immediate) and ReviewAdjustment
    // (on approval of a held write-off) so the two paths can never drift apart.
    private static void ApplyAdjustmentToStock(InventoryAdjustment adj, InventoryStock stock, InventoryBatch? batch)
    {
        var isIncrease = adj.AdjustmentType is "addition" or "return_to_supplier" or "transfer_in";
        stock.Quantity = isIncrease ? stock.Quantity + adj.Quantity : Math.Max(0, stock.Quantity - adj.Quantity);
        stock.LastUpdated = DateTime.UtcNow;
        stock.UpdatedAt = DateTime.UtcNow;

        if (batch != null)
        {
            batch.RemainingQuantity = isIncrease
                ? batch.RemainingQuantity + adj.Quantity
                : Math.Max(0, batch.RemainingQuantity - adj.Quantity);
            batch.UpdatedAt = DateTime.UtcNow;
            if (!isIncrease && batch.RemainingQuantity == 0) batch.Status = "consumed";
            // A correction crediting stock back into a fully-consumed batch makes it live again —
            // leaving Status stuck at "consumed" would misrepresent it everywhere Status is read.
            else if (isIncrease && batch.Status == "consumed" && batch.RemainingQuantity > 0) batch.Status = "active";
        }
    }

    /// <summary>
    /// FRD §2.3 — sign-off on a held write-off. A pending wastage adjustment has NOT touched on-hand
    /// yet (StockApplied=false), same maker-checker gate as a stock transfer: APPROVING applies the
    /// deduction now; REJECTING just records the decision and leaves stock untouched. Legacy rows
    /// raised before gating were deducted immediately (StockApplied=true) — for those, rejection
    /// still gives the stock back via a compensating movement, preserving history rather than
    /// editing it. The creator may approve their own write-off (per configured policy).
    /// </summary>
    [HttpPatch("adjustments/{id:guid}/approval")]
    [RequirePermission("Stocks", PermAction.Approve)]
    public async Task<IActionResult> ReviewAdjustment(Guid id, [FromBody] ReviewAdjustmentRequest req)
    {
        var adjustment = await db.InventoryAdjustments
            .Include(a => a.Batch)
            .FirstOrDefaultAsync(a => a.Id == id);
        if (adjustment is null) return NotFound(new { message = "Adjustment not found." });

        if (adjustment.ApprovalStatus is null)
            return BadRequest(new { message = "This adjustment is not subject to approval." });
        if (adjustment.ApprovalStatus != "pending")
            return BadRequest(new { message = $"This adjustment was already {adjustment.ApprovalStatus}." });

        var (role, callerBranchId) = GetCallerContext();
        if (role != "tenant_admin" && callerBranchId.HasValue && adjustment.BranchId != callerBranchId)
            return StatusCode(403, new { message = "You may only review adjustments at your own branch." });

        var reviewerId = CallerId();

        if (!req.Approved && string.IsNullOrWhiteSpace(req.Reason))
            return BadRequest(new { message = "A rejection reason is required." });

        adjustment.ApprovalStatus = req.Approved ? "approved" : "rejected";
        adjustment.ApprovedBy = reviewerId;
        adjustment.ApprovedAt = DateTime.UtcNow;
        adjustment.RejectionReason = req.Approved ? null : req.Reason;

        decimal? quantityBefore = null, quantityAfter = null;

        if (req.Approved && !adjustment.StockApplied && adjustment.BranchId.HasValue)
        {
            // The write-off was held pending review — apply the deduction now, on approval.
            var stock = await db.InventoryStocks.FirstOrDefaultAsync(
                s => s.ProductId == adjustment.ProductId && s.BranchId == adjustment.BranchId);
            if (stock is null)
            {
                // A write-off is legitimate even with nothing on hand — create a zero row and let
                // the removal clamp at zero, mirroring Adjust's upsert.
                stock = new InventoryStock
                {
                    Id = Guid.NewGuid(), ProductId = adjustment.ProductId, BranchId = adjustment.BranchId.Value,
                    Quantity = 0, LastUpdated = DateTime.UtcNow, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow,
                };
                db.InventoryStocks.Add(stock);
            }
            quantityBefore = stock.Quantity;
            ApplyAdjustmentToStock(adjustment, stock, adjustment.Batch);
            quantityAfter = stock.Quantity;
            adjustment.StockApplied = true;

            stockMovements.Record(
                adjustment.ProductId, adjustment.BranchId, adjustment.WarehouseId,
                movementType: $"adjustment_{adjustment.AdjustmentType}", quantity: -adjustment.Quantity,
                batchId: adjustment.BatchId, referenceType: "adjustment", referenceId: adjustment.Id,
                notes: $"Write-off approved: {adjustment.Reason}", createdBy: reviewerId,
                quantityBefore: quantityBefore, quantityAfter: quantityAfter);
        }
        else if (!req.Approved && adjustment.StockApplied && adjustment.BranchId.HasValue)
        {
            // Legacy row: stock was deducted immediately before gating shipped. Give it back via a
            // compensating movement rather than editing history — the original row/ledger stay intact.
            var stock = await db.InventoryStocks.FirstOrDefaultAsync(
                s => s.ProductId == adjustment.ProductId && s.BranchId == adjustment.BranchId);
            if (stock != null)
            {
                quantityBefore = stock.Quantity;
                stock.Quantity += adjustment.Quantity;
                quantityAfter = stock.Quantity;
                stock.LastUpdated = DateTime.UtcNow;
                stock.UpdatedAt = DateTime.UtcNow;
            }

            if (adjustment.Batch is { } batch)
            {
                batch.RemainingQuantity += adjustment.Quantity;
                batch.UpdatedAt = DateTime.UtcNow;
                if (batch.Status == "consumed" && batch.RemainingQuantity > 0) batch.Status = "active";
            }
            adjustment.StockApplied = false;

            stockMovements.Record(
                adjustment.ProductId, adjustment.BranchId, adjustment.WarehouseId,
                movementType: "adjustment_reversal", quantity: adjustment.Quantity,
                batchId: adjustment.BatchId, referenceType: "adjustment", referenceId: adjustment.Id,
                notes: $"Write-off rejected: {req.Reason}", createdBy: reviewerId,
                quantityBefore: quantityBefore, quantityAfter: quantityAfter);
        }

        await db.SaveChangesAsync();

        // An approval that just deducted stock can cross the reorder threshold — fire the alert now.
        if (req.Approved && quantityAfter.HasValue && adjustment.BranchId.HasValue)
        {
            try { await stockAlerts.CheckStockLevelAsync(adjustment.ProductId, adjustment.BranchId.Value); }
            catch (Exception ex) { logger.LogError(ex, "Low-stock check failed after adjustment approval {AdjustmentId}", adjustment.Id); }
        }

        try
        {
            await audit.LogAsync(
                action: req.Approved ? "approve_inventory_adjustment" : "reject_inventory_adjustment",
                entityType: "InventoryAdjustment",
                entityId: adjustment.Id,
                userId: reviewerId,
                branchId: adjustment.BranchId,
                details: System.Text.Json.JsonSerializer.Serialize(new
                {
                    adjustment.ProductId, adjustment.AdjustmentType, adjustment.Quantity,
                    ApprovalStatus = adjustment.ApprovalStatus, QuantityAfter = quantityAfter,
                }),
                severity: req.Approved ? "info" : "warning",
                beforeValue: System.Text.Json.JsonSerializer.Serialize(new
                {
                    ApprovalStatus = "pending", QuantityBefore = quantityBefore,
                }),
                notes: req.Reason);
        }
        catch (Exception ex) { logger.LogError(ex, "Audit log failed for adjustment review {AdjustmentId}", adjustment.Id); }

        return Ok(adjustment);
    }
}

public record ReviewAdjustmentRequest(bool Approved, string? Reason);

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
