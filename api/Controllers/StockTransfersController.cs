using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/stock-transfers")]
public class StockTransfersController(BaqalaDbContext db, INotificationService notifications, IStockMovementService stockMovements) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : null;

    // Mirrors InventoryController.GetCallerContext — branch-scoped roles may only see transfers
    // touching their own branch (as source or destination). GetAll previously had no scoping at
    // all, so any authenticated user's browser downloaded every branch's transfers and relied on
    // the frontend to hide the rest — the same class of gap already fixed on InventoryController.
    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    // Rejects moving more than the source location currently has on hand. Shared by
    // ReceiveTransfer and UpdateStatus's "completed" branch, since both move stock the same way.
    // Previously neither checked this — source deduction was silently clamped to 0 while the
    // destination was still credited the FULL requested quantity, manufacturing stock out of
    // nothing whenever the source had been depleted (e.g. by a sale) between the transfer's
    // creation and its receipt.
    private async Task<string?> ValidateSourceStockAsync(StockTransfer transfer, IEnumerable<(Guid ProductId, decimal Quantity)> lines)
    {
        foreach (var (productId, qty) in lines)
        {
            if (qty <= 0) continue;
            if (transfer.SourceBranchId.HasValue)
            {
                var srcQty = (await db.InventoryStocks.FirstOrDefaultAsync(s => s.BranchId == transfer.SourceBranchId && s.ProductId == productId))?.Quantity ?? 0;
                if (qty > srcQty) return $"Cannot move {qty} unit(s) — only {srcQty} available at the source branch right now.";
            }
            else if (transfer.SourceWarehouseId.HasValue)
            {
                var srcQty = (await db.WarehouseStocks.FirstOrDefaultAsync(s => s.WarehouseId == transfer.SourceWarehouseId && s.ProductId == productId))?.Quantity ?? 0;
                if (qty > srcQty) return $"Cannot move {qty} unit(s) — only {srcQty} available at the source warehouse right now.";
            }
        }
        return null;
    }

    // Two-phase stock movement, matching physical reality: once a transfer ships (goes
    // in_transit), the stock has physically left the source — it must stop counting as available
    // there immediately, not linger until someone gets around to confirming receipt days later.
    // Phase 1 (DeductSourceAsync, called on the transition INTO in_transit) removes it from the
    // source. Phase 2 (CreditDestinationAsync, called on receive/complete) adds the ACTUALLY
    // received quantity to the destination — which can legitimately be less than what shipped
    // (loss/damage in transit), and that gap is exactly the existing StockDiscrepancy logic's
    // shortage detection, not a bug. If a shipped transfer is instead cancelled/rejected before
    // being received, RestoreSourceAsync reverses phase 1 so that stock isn't lost into the void.

    // Phase 1 — goods leave the source. Resolves the specific batch this transfer draws from (the
    // one the user picked via item.BatchId, or failing that the source's oldest-expiry active
    // batch — FEFO), decrements its RemainingQuantity and the source aggregate stock, and persists
    // the resolved batch back onto item.BatchId so phase 2/3 both know exactly which lot without
    // re-resolving FEFO (which could pick a different batch by the time receive happens).
    private async Task DeductSourceAsync(StockTransfer transfer, StockTransferItem item, decimal qty)
    {
        InventoryBatch? sourceBatch = item.BatchId.HasValue
            ? await db.InventoryBatches.FirstOrDefaultAsync(b => b.Id == item.BatchId)
            : null;
        if (sourceBatch != null)
        {
            // User picked this exact lot — draw only from it (the frontend already caps requested
            // quantity at this batch's remainingQuantity), no need to spill into other batches.
            sourceBatch.RemainingQuantity = Math.Max(0, sourceBatch.RemainingQuantity - qty);
            sourceBatch.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            // Auto (FEFO): the requested quantity can exceed any single batch's remaining stock
            // (e.g. transferring the full on-hand quantity spread across several lots), so walk
            // every eligible batch oldest-expiry-first and draw from each in turn — same pattern
            // BatchConsumptionService.ConsumeFefoAsync uses for sales. Previously this resolved
            // only the single earliest batch and clamped straight to 0 regardless of how much of
            // `qty` it actually covered, leaving every other batch's RemainingQuantity untouched
            // even after the aggregate stock had been fully deducted — batch totals silently
            // drifted away from the real on-hand number with every multi-lot transfer.
            var sourceBatchQuery = db.InventoryBatches.Where(b => b.ProductId == item.ProductId && b.Status != "expired" && b.Status != "consumed" && b.RemainingQuantity > 0);
            sourceBatchQuery = transfer.SourceBranchId.HasValue
                ? sourceBatchQuery.Where(b => b.BranchId == transfer.SourceBranchId)
                : transfer.SourceWarehouseId.HasValue
                    ? sourceBatchQuery.Where(b => b.WarehouseId == transfer.SourceWarehouseId)
                    : sourceBatchQuery.Where(b => false);
            var candidates = await sourceBatchQuery
                .OrderBy(b => b.ExpiryDate ?? DateTime.MaxValue).ThenBy(b => b.ReceivedDate)
                .ToListAsync();

            var remaining = qty;
            foreach (var candidate in candidates)
            {
                if (remaining <= 0) break;
                var take = Math.Min(candidate.RemainingQuantity, remaining);
                candidate.RemainingQuantity -= take;
                candidate.UpdatedAt = DateTime.UtcNow;
                remaining -= take;
                // item.BatchId (and the batch metadata CreditDestinationAsync carries forward)
                // only has room for one lot, so keep the first — earliest-expiry — batch actually
                // drawn from, matching the existing single-batch traceability contract.
                sourceBatch ??= candidate;
            }
        }

        if (transfer.SourceBranchId.HasValue)
        {
            var src = await db.InventoryStocks.FirstOrDefaultAsync(s => s.BranchId == transfer.SourceBranchId && s.ProductId == item.ProductId);
            if (src != null) { src.Quantity = Math.Max(0, src.Quantity - qty); src.LastUpdated = src.UpdatedAt = DateTime.UtcNow; }
        }
        else if (transfer.SourceWarehouseId.HasValue)
        {
            var src = await db.WarehouseStocks.FirstOrDefaultAsync(s => s.WarehouseId == transfer.SourceWarehouseId && s.ProductId == item.ProductId);
            if (src != null) { src.Quantity = Math.Max(0, src.Quantity - qty); src.LastUpdated = src.UpdatedAt = DateTime.UtcNow; }
        }

        item.BatchId = sourceBatch?.Id;

        stockMovements.Record(
            item.ProductId, transfer.SourceBranchId, transfer.SourceWarehouseId, "transfer_out", -qty,
            batchId: sourceBatch?.Id, referenceType: "stock_transfer", referenceId: transfer.Id, referenceNumber: transfer.TransferNumber);
    }

    // Phase 2 — goods arrive at the destination. Reads the batch DeductSourceAsync already
    // resolved (item.BatchId) to carry its batch number/expiry/supplier forward instead of
    // minting a disconnected "TRF-..." one or re-resolving FEFO against a possibly-changed set of
    // source batches. No-ops the destination side entirely for a supplier destination (RTS) —
    // stock leaving to a supplier has nowhere local to be credited.
    private async Task CreditDestinationAsync(StockTransfer transfer, StockTransferItem item, decimal qty, string? damagedOrReturnReason)
    {
        if (!transfer.DestBranchId.HasValue && !transfer.DestWarehouseId.HasValue) return;

        var sourceBatch = item.BatchId.HasValue
            ? await db.InventoryBatches.FirstOrDefaultAsync(b => b.Id == item.BatchId)
            : null;

        if (transfer.DestBranchId.HasValue)
        {
            var dst = await db.InventoryStocks.FirstOrDefaultAsync(s => s.BranchId == transfer.DestBranchId && s.ProductId == item.ProductId);
            if (dst is null) { dst = new InventoryStock { Id = Guid.NewGuid(), BranchId = transfer.DestBranchId.Value, ProductId = item.ProductId }; db.InventoryStocks.Add(dst); }
            dst.Quantity += qty; dst.LastUpdated = dst.UpdatedAt = DateTime.UtcNow;
        }
        else
        {
            var dst = await db.WarehouseStocks.FirstOrDefaultAsync(s => s.WarehouseId == transfer.DestWarehouseId && s.ProductId == item.ProductId);
            if (dst is null) { dst = new WarehouseStock { Id = Guid.NewGuid(), WarehouseId = transfer.DestWarehouseId!.Value, ProductId = item.ProductId }; db.WarehouseStocks.Add(dst); }
            dst.Quantity += qty; dst.LastUpdated = dst.UpdatedAt = DateTime.UtcNow;
        }

        // transfer.TransferNumber already carries a type-appropriate prefix ("TRF-..." or,
        // for a linked PO, "PO-..."), so prepending another "TRF-" here produced doubled
        // "TRF-TRF-20260716-..." batch numbers.
        var batchNumber = sourceBatch?.BatchNumber ?? $"{transfer.TransferNumber}-{item.ProductId.ToString()[..4].ToUpper()}";
        var expiryDate = sourceBatch?.ExpiryDate ?? item.ExpiryDate;
        var supplierId = sourceBatch?.SupplierId ?? transfer.SourceSupplierId;
        var purchaseCost = sourceBatch?.PurchaseCost ?? item.UnitCost ?? 0;
        var notes = !string.IsNullOrWhiteSpace(damagedOrReturnReason)
            ? $"Received via transfer {transfer.TransferNumber} [Damaged/Return: {damagedOrReturnReason}]"
            : $"Received via transfer {transfer.TransferNumber}";

        // If the destination already holds a batch with this exact batch number (e.g. a repeat
        // transfer of the same lot), add to it instead of creating a duplicate row for the
        // same physical batch at the same location.
        var destBatch = await db.InventoryBatches.FirstOrDefaultAsync(b =>
            b.ProductId == item.ProductId && b.BatchNumber == batchNumber &&
            (transfer.DestBranchId.HasValue ? b.BranchId == transfer.DestBranchId : b.WarehouseId == transfer.DestWarehouseId));
        Guid creditedBatchId;
        if (destBatch != null)
        {
            destBatch.Quantity += qty;
            destBatch.RemainingQuantity += qty;
            destBatch.UpdatedAt = DateTime.UtcNow;
            creditedBatchId = destBatch.Id;
        }
        else
        {
            var newBatch = new InventoryBatch
            {
                Id = Guid.NewGuid(),
                BatchNumber = batchNumber,
                ProductId = item.ProductId,
                BranchId = transfer.DestBranchId,
                WarehouseId = transfer.DestWarehouseId,
                SupplierId = supplierId,
                Quantity = qty,
                RemainingQuantity = qty,
                PurchaseCost = purchaseCost,
                ExpiryDate = expiryDate,
                ReceivedDate = DateTime.UtcNow,
                Status = "active",
                Notes = notes,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            };
            db.InventoryBatches.Add(newBatch);
            creditedBatchId = newBatch.Id;
        }

        stockMovements.Record(
            item.ProductId, transfer.DestBranchId, transfer.DestWarehouseId, "transfer_in", qty,
            batchId: creditedBatchId, referenceType: "stock_transfer", referenceId: transfer.Id, referenceNumber: transfer.TransferNumber, notes: damagedOrReturnReason);
    }

    // Phase 1 reversal — a transfer that shipped (deducted from source) but was then
    // cancelled/rejected before being received never actually left, so give the source location
    // its stock and its batch's remaining quantity back rather than leaving it debited forever.
    private async Task RestoreSourceAsync(StockTransfer transfer, StockTransferItem item, decimal qty)
    {
        if (transfer.SourceBranchId.HasValue)
        {
            var src = await db.InventoryStocks.FirstOrDefaultAsync(s => s.BranchId == transfer.SourceBranchId && s.ProductId == item.ProductId);
            if (src != null) { src.Quantity += qty; src.LastUpdated = src.UpdatedAt = DateTime.UtcNow; }
        }
        else if (transfer.SourceWarehouseId.HasValue)
        {
            var src = await db.WarehouseStocks.FirstOrDefaultAsync(s => s.WarehouseId == transfer.SourceWarehouseId && s.ProductId == item.ProductId);
            if (src != null) { src.Quantity += qty; src.LastUpdated = src.UpdatedAt = DateTime.UtcNow; }
        }

        if (item.BatchId.HasValue)
        {
            var batch = await db.InventoryBatches.FirstOrDefaultAsync(b => b.Id == item.BatchId);
            if (batch != null) { batch.RemainingQuantity += qty; batch.UpdatedAt = DateTime.UtcNow; }
        }

        stockMovements.Record(
            item.ProductId, transfer.SourceBranchId, transfer.SourceWarehouseId, "transfer_restore", qty,
            batchId: item.BatchId, referenceType: "stock_transfer", referenceId: transfer.Id, referenceNumber: transfer.TransferNumber);
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? transferType,
        [FromQuery] string? status,
        [FromQuery] Guid? sourceWarehouseId,
        [FromQuery] Guid? destWarehouseId,
        [FromQuery] Guid? sourceBranchId,
        [FromQuery] Guid? destBranchId,
        [FromQuery] string? batchId,
        [FromQuery] Guid? purchaseOrderId,
        [FromQuery] Guid? sourceSupplierId)
    {
        var query = db.StockTransfers
            .Include(t => t.SourceBranch).Include(t => t.SourceWarehouse).Include(t => t.SourceSupplier)
            .Include(t => t.DestBranch).Include(t => t.DestWarehouse).Include(t => t.DestSupplier)
            .Include(t => t.Items).ThenInclude(i => i.Product)
            .Include(t => t.Items).ThenInclude(i => i.Batch)
            .AsQueryable();
        if (!string.IsNullOrEmpty(transferType)) query = query.Where(t => t.TransferType == transferType);
        if (!string.IsNullOrEmpty(status)) query = query.Where(t => t.Status == status);
        if (sourceWarehouseId.HasValue) query = query.Where(t => t.SourceWarehouseId == sourceWarehouseId);
        if (destWarehouseId.HasValue) query = query.Where(t => t.DestWarehouseId == destWarehouseId);
        if (sourceBranchId.HasValue) query = query.Where(t => t.SourceBranchId == sourceBranchId);
        if (destBranchId.HasValue) query = query.Where(t => t.DestBranchId == destBranchId);
        if (!string.IsNullOrEmpty(batchId)) query = query.Where(t => t.BatchId == batchId);
        if (purchaseOrderId.HasValue) query = query.Where(t => t.PurchaseOrderId == purchaseOrderId);
        if (sourceSupplierId.HasValue) query = query.Where(t => t.SourceSupplierId == sourceSupplierId);

        // RTS (warehouse_to_supplier) rows are governed by the "Supplier Returns" module — a
        // separate matrix row from "Stock Transfers" (Storekeeper/Supervisor hold Stock Transfers
        // view but are fully denied Supplier Returns), so a static [RequirePermission] on this
        // action can't express it. Explicitly requesting RTS data without that permission is
        // refused; broader queries silently exclude RTS rows instead of failing the whole call.
        if (!await PermissionCheck.HasPermissionAsync(User, db, "Supplier Returns", PermAction.View))
        {
            if (transferType == "warehouse_to_supplier")
                return StatusCode(403, new { message = "You do not have permission to view Supplier Returns." });
            query = query.Where(t => t.TransferType != "warehouse_to_supplier");
        }

        var (role, callerBranchId) = GetCallerContext();
        if (role is not null && role != "tenant_admin" && callerBranchId.HasValue)
            query = query.Where(t => t.SourceBranchId == callerBranchId || t.DestBranchId == callerBranchId);

        return Ok(await query.OrderByDescending(t => t.CreatedAt).ToListAsync());
    }

    [HttpGet("batch/{batchId}")]
    public async Task<IActionResult> GetByBatchId(string batchId)
    {
        var transfers = await db.StockTransfers
            .Include(t => t.SourceBranch).Include(t => t.SourceWarehouse).Include(t => t.SourceSupplier)
            .Include(t => t.DestBranch).Include(t => t.DestWarehouse).Include(t => t.DestSupplier)
            .Include(t => t.Items).ThenInclude(i => i.Product)
            .Include(t => t.Items).ThenInclude(i => i.Batch)
            .Where(t => t.BatchId == batchId)
            .OrderBy(t => t.CreatedAt)
            .ToListAsync();
        return Ok(transfers);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var t = await db.StockTransfers
            .Include(t => t.SourceBranch).Include(t => t.SourceWarehouse).Include(t => t.SourceSupplier)
            .Include(t => t.DestBranch).Include(t => t.DestWarehouse).Include(t => t.DestSupplier)
            .Include(t => t.Items).ThenInclude(i => i.Product)
            .Include(t => t.Items).ThenInclude(i => i.Batch)
            .FirstOrDefaultAsync(t => t.Id == id);
        return t is null ? NotFound() : Ok(t);
    }

    [HttpGet("by-number/{number}")]
    public async Task<IActionResult> GetByNumber(string number)
    {
        var t = await db.StockTransfers
            .Include(t => t.SourceBranch).Include(t => t.SourceWarehouse).Include(t => t.SourceSupplier)
            .Include(t => t.DestBranch).Include(t => t.DestWarehouse).Include(t => t.DestSupplier)
            .Include(t => t.Items).ThenInclude(i => i.Product)
            .Include(t => t.Items).ThenInclude(i => i.Batch)
            .FirstOrDefaultAsync(t => t.TransferNumber == number);
        return t is null ? NotFound() : Ok(t);
    }

    [RequirePermission("Stock Transfers", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTransferRequest req)
    {
        var reqItems = req.Items ?? [];
        var transferProducts = await db.Products
            .Where(p => reqItems.Select(i => i.ProductId).Contains(p.Id))
            .ToDictionaryAsync(p => p.Id);
        foreach (var i in reqItems)
        {
            var err = QuantityValidation.ValidateWholeUnit(transferProducts.GetValueOrDefault(i.ProductId), i.RequestedQuantity, "Requested quantity");
            if (err is not null) return BadRequest(new { message = err });
        }

        var transferId = Guid.NewGuid();
        var items = (req.Items ?? []).Select(i => new StockTransferItem
        {
            Id = Guid.NewGuid(),
            TransferId = transferId,
            ProductId = i.ProductId,
            BatchId = i.BatchId,
            RequestedQuantity = i.RequestedQuantity,
            UnitCost = i.UnitCost,
            ExpiryDate = i.ExpiryDate,
            ReturnReason = i.ReturnReason,
            Notes = i.Notes,
            CreatedAt = DateTime.UtcNow,
        }).ToList();

        var transferNumber = req.TransferType == "supplier_to_warehouse"
            ? $"PO-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}"
            : $"TRF-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}";

        // Auto-create a linked PurchaseOrder for every supplier_to_warehouse transfer so both
        // the Stock Transfers tab and the Purchase Orders tab share one source of truth.
        Guid? linkedPoId = req.PurchaseOrderId;
        if (req.TransferType == "supplier_to_warehouse" && linkedPoId == null && req.SourceSupplierId.HasValue)
        {
            var poItems = items.Select(i => new PurchaseOrderItem
            {
                Id = Guid.NewGuid(),
                ProductId = i.ProductId,
                OrderedQuantity = i.RequestedQuantity,
                UnitCost = i.UnitCost ?? 0,
                Subtotal = i.RequestedQuantity * (i.UnitCost ?? 0),
                Status = "pending",
                CreatedAt = DateTime.UtcNow,
            }).ToList();

            var po = new PurchaseOrder
            {
                Id = Guid.NewGuid(),
                PoNumber = transferNumber,
                SupplierId = req.SourceSupplierId.Value,
                WarehouseId = req.DestWarehouseId,
                OrderedBy = req.CreatedBy ?? Guid.Empty,
                Status = "ordered",
                TotalAmount = poItems.Sum(i => i.Subtotal),
                BatchId = req.BatchId,
                Notes = req.Notes,
                ExpectedDeliveryDate = req.ExpectedDate,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                Items = poItems,
            };
            db.PurchaseOrders.Add(po);
            linkedPoId = po.Id;
        }

        var transfer = new StockTransfer
        {
            Id = transferId,
            TransferNumber = transferNumber,
            TransferType = req.TransferType,
            SourceBranchId = req.SourceBranchId,
            SourceWarehouseId = req.SourceWarehouseId,
            SourceSupplierId = req.SourceSupplierId,
            DestBranchId = req.DestBranchId,
            DestWarehouseId = req.DestWarehouseId,
            DestSupplierId = req.DestSupplierId,
            PurchaseOrderId = linkedPoId,
            CreatedBy = req.CreatedBy ?? Guid.Empty,
            Status = "draft",
            ReturnReason = req.ReturnReason,
            Notes = req.Notes,
            BatchId = req.BatchId,
            ExpectedDate = req.ExpectedDate,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            Items = items,
        };
        db.StockTransfers.Add(transfer);
        await db.SaveChangesAsync();

        if (transfer.DestBranchId.HasValue)
        {
            await notifications.NotifyRoleAsync(["Manager", "Admin"], transfer.DestBranchId,
                "Inventory", "Stock Transfer Pending Acceptance", "Stock Transfer Pending Acceptance",
                $"Transfer {transfer.TransferNumber} pending acceptance",
                entityType: "StockTransfer", entityId: transfer.Id);
        }

        // Return-to-supplier transfer — confirm to whoever created it, since there's no branch
        // recipient to notify (the "destination" is the supplier, not a Users-linked entity).
        if (transfer.TransferType == "warehouse_to_supplier" && transfer.CreatedBy != Guid.Empty)
        {
            await notifications.NotifyUserAsync(transfer.CreatedBy,
                "Suppliers / Purchase Orders", "Supplier Return Created", "Supplier Return Created",
                $"Supplier return created: {transfer.TransferNumber}",
                entityType: "StockTransfer", entityId: transfer.Id);
        }

        return CreatedAtAction(nameof(GetById), new { id = transfer.Id }, transfer);
    }

    // Receive a transfer with per-line actual quantities, then mark completed and move stock
    [RequirePermission("Stock Transfers", PermAction.Approve)]
    [HttpPost("{id:guid}/receive")]
    public async Task<IActionResult> ReceiveTransfer(Guid id, [FromBody] ReceiveTransferRequest req)
    {
        var transfer = await db.StockTransfers.Include(t => t.Items).FirstOrDefaultAsync(t => t.Id == id);
        if (transfer is null) return NotFound();
        if (transfer.Status != "in_transit") return BadRequest("Transfer must be in_transit to receive.");

        // Same stock-write guard as InventoryController.ReceiveBatch/PurchaseOrdersController.Receive
        // — this endpoint creates InventoryBatch rows for branch destinations, so the received
        // quantity and any tracked expiry need the same validation as the other entry points.
        // Unlike those two, 0 is a legitimate value here (the frontend lets a receiver record a
        // fully lost/undelivered line item with a discrepancy note) — only negative is invalid.
        var receiveProducts = await db.Products
            .Where(p => transfer.Items.Select(i => i.ProductId).Contains(p.Id))
            .ToDictionaryAsync(p => p.Id);
        foreach (var recv in req.Items ?? [])
        {
            if (recv.ReceivedQuantity < 0)
                return BadRequest(new { message = $"Received quantity for transfer item {recv.ItemId} cannot be negative." });

            var itemForCheck = transfer.Items.FirstOrDefault(i => i.Id == recv.ItemId);
            if (itemForCheck?.ExpiryDate is { } expiry && expiry.Date < DateTime.UtcNow.Date
                && string.IsNullOrWhiteSpace(recv.DamagedOrReturnReason))
                return BadRequest(new { message = $"Expiry date for transfer item {recv.ItemId} cannot be in the past — provide a damagedOrReturnReason to log it as damaged/return stock instead of resalable inventory." });

            if (itemForCheck is not null)
            {
                var err = QuantityValidation.ValidateWholeUnit(receiveProducts.GetValueOrDefault(itemForCheck.ProductId), recv.ReceivedQuantity, "Received quantity");
                if (err is not null) return BadRequest(new { message = err });
            }
        }

        // Update per-item received quantities
        foreach (var recv in req.Items ?? [])
        {
            var item = transfer.Items.FirstOrDefault(i => i.Id == recv.ItemId);
            if (item is null) continue;
            item.ReceivedQuantity = recv.ReceivedQuantity;
            if (!string.IsNullOrEmpty(recv.Notes)) item.Notes = recv.Notes;
        }

        transfer.Status = "completed";
        transfer.CompletedDate = DateTime.UtcNow;
        transfer.UpdatedAt = DateTime.UtcNow;
        if (req.ApprovedBy.HasValue) transfer.ApprovedBy = req.ApprovedBy;

        var reasonsByItemId = (req.Items ?? []).ToDictionary(r => r.ItemId, r => r.DamagedOrReturnReason);

        // Source stock/batch was already deducted when this transfer went in_transit — only the
        // destination side moves here. Crediting the ACTUAL received quantity (which can be less
        // than what shipped) is deliberate: any shortfall is real shrinkage/damage in transit, not
        // an error, and is exactly what the discrepancy pass below is for.
        foreach (var item in transfer.Items)
        {
            var qty = item.ReceivedQuantity ?? item.ApprovedQuantity ?? item.RequestedQuantity;
            reasonsByItemId.TryGetValue(item.Id, out var reason);
            await CreditDestinationAsync(transfer, item, qty, reason);
        }

        // Discrepancy records for qty mismatches
        var supplierId = transfer.SourceSupplierId;
        if (!supplierId.HasValue && transfer.PurchaseOrderId.HasValue)
        {
            var linkedPo = await db.PurchaseOrders.FindAsync(transfer.PurchaseOrderId.Value);
            supplierId = linkedPo?.SupplierId;
        }

        foreach (var item in transfer.Items)
        {
            var expected = item.ApprovedQuantity ?? item.RequestedQuantity;
            var received = item.ReceivedQuantity ?? expected;
            var diff = received - expected;
            if (diff != 0 && supplierId.HasValue)
            {
                db.StockDiscrepancies.Add(new StockDiscrepancy
                {
                    Id = Guid.NewGuid(),
                    TransferId = transfer.Id,
                    SupplierId = supplierId.Value,
                    ProductId = item.ProductId,
                    ExpectedQuantity = expected,
                    ReceivedQuantity = received,
                    DiscrepancyQuantity = diff,
                    UnitCost = item.UnitCost ?? 0,
                    DiscrepancyValue = Math.Abs(diff) * (item.UnitCost ?? 0),
                    DiscrepancyType = diff < 0 ? "shortage" : "excess",
                    Status = "open",
                    Notes = $"Auto-detected on transfer {transfer.TransferNumber}",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                });
            }
        }

        // Auto-create credit note when return-to-supplier transfer is completed
        if (transfer.TransferType == "warehouse_to_supplier" && transfer.DestSupplierId.HasValue
            && !await db.SupplierCreditNotes.AnyAsync(cn => cn.TransferId == transfer.Id))
        {
            // Prefer item-level unit cost; fall back to product cost price so RTS notes are never 0
            decimal creditAmount = 0;
            foreach (var item in transfer.Items)
            {
                var unitCost = (item.UnitCost ?? 0) > 0
                    ? item.UnitCost!.Value
                    : (await db.Products.FindAsync(item.ProductId))?.CostPrice ?? 0;
                creditAmount += (item.ReceivedQuantity ?? item.RequestedQuantity) * unitCost;
            }
            var cnNumber = $"CN-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}";
            db.SupplierCreditNotes.Add(new SupplierCreditNote
            {
                Id = Guid.NewGuid(),
                CreditNoteNumber = cnNumber,
                SupplierId = transfer.DestSupplierId.Value,
                TransferId = transfer.Id,
                PoId = transfer.PurchaseOrderId,
                Amount = creditAmount,
                CreditType = "rts_return",
                Status = "confirmed",
                Notes = $"Auto-created from RTS transfer {transfer.TransferNumber}" + (string.IsNullOrEmpty(transfer.ReturnReason) ? "" : $". Return reason: {transfer.ReturnReason}"),
                IssuedDate = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            });
        }

        // Sync linked PO to fully_received
        await SyncLinkedPoStatus(transfer);

        await db.SaveChangesAsync();

        if (transfer.CreatedBy != Guid.Empty)
        {
            await notifications.NotifyUserAsync(transfer.CreatedBy,
                "Inventory", "Stock Transfer Received", "Stock Transfer Received",
                $"Stock transfer {transfer.TransferNumber} received",
                entityType: "StockTransfer", entityId: transfer.Id,
                branchId: transfer.DestBranchId ?? transfer.SourceBranchId);
        }

        return Ok(transfer);
    }

    [RequirePermission("Stock Transfers", PermAction.Approve)]
    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateTransferStatusRequest req)
    {
        var transfer = await db.StockTransfers.Include(t => t.Items).FirstOrDefaultAsync(t => t.Id == id);
        if (transfer is null) return NotFound();
        var prev = transfer.Status;
        transfer.Status = req.Status;
        if (req.ApprovedBy.HasValue) transfer.ApprovedBy = req.ApprovedBy;
        transfer.UpdatedAt = DateTime.UtcNow;

        // Shipped: the goods physically leave the source right now — deduct immediately rather
        // than leaving them sitting in the source's "available" count until someone eventually
        // confirms receipt (which could be hours/days later for an in-transit shipment).
        if (req.Status == "in_transit" && prev != "in_transit")
        {
            var lines = transfer.Items.Select(item => (item.ProductId, Quantity: item.ApprovedQuantity ?? item.RequestedQuantity));
            var stockError = await ValidateSourceStockAsync(transfer, lines);
            if (stockError != null) return BadRequest(new { message = stockError });

            foreach (var item in transfer.Items)
                await DeductSourceAsync(transfer, item, item.ApprovedQuantity ?? item.RequestedQuantity);
        }

        // Completed: credit the destination. A transfer that skipped in_transit entirely (some
        // flows jump straight from draft/approved to completed) never had its source deducted, so
        // fall back to doing that here too — otherwise this branch would manufacture stock at the
        // destination without ever having removed it from the source.
        if (req.Status == "completed" && prev != "completed")
        {
            transfer.CompletedDate = DateTime.UtcNow;

            if (prev != "in_transit")
            {
                var lines = transfer.Items.Select(item => (item.ProductId, Quantity: item.ReceivedQuantity ?? item.ApprovedQuantity ?? item.RequestedQuantity));
                var stockError = await ValidateSourceStockAsync(transfer, lines);
                if (stockError != null) return BadRequest(new { message = stockError });
                foreach (var item in transfer.Items)
                    await DeductSourceAsync(transfer, item, item.ReceivedQuantity ?? item.ApprovedQuantity ?? item.RequestedQuantity);
            }

            foreach (var item in transfer.Items)
            {
                var qty = item.ReceivedQuantity ?? item.ApprovedQuantity ?? item.RequestedQuantity;
                await CreditDestinationAsync(transfer, item, qty, damagedOrReturnReason: null);
            }

            // Auto-create credit note for RTS when completed via status patch
            if (transfer.TransferType == "warehouse_to_supplier" && transfer.DestSupplierId.HasValue
                && !await db.SupplierCreditNotes.AnyAsync(cn => cn.TransferId == transfer.Id))
            {
                decimal creditAmount = 0;
                foreach (var item in transfer.Items)
                {
                    var unitCost = (item.UnitCost ?? 0) > 0
                        ? item.UnitCost!.Value
                        : (await db.Products.FindAsync(item.ProductId))?.CostPrice ?? 0;
                    creditAmount += (item.ReceivedQuantity ?? item.RequestedQuantity) * unitCost;
                }
                db.SupplierCreditNotes.Add(new SupplierCreditNote
                {
                    Id = Guid.NewGuid(),
                    CreditNoteNumber = $"CN-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}",
                    SupplierId = transfer.DestSupplierId.Value,
                    TransferId = transfer.Id,
                    PoId = transfer.PurchaseOrderId,
                    Amount = creditAmount,
                    CreditType = "rts_return",
                    Status = "confirmed",
                    Notes = $"Auto-created from RTS transfer {transfer.TransferNumber}" + (string.IsNullOrEmpty(transfer.ReturnReason) ? "" : $". Return reason: {transfer.ReturnReason}"),
                    IssuedDate = DateTime.UtcNow,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                });
            }

            // Sync linked PO to fully_received
            await SyncLinkedPoStatus(transfer);
        }

        // Shipped but never arrived — cancelling/rejecting an in-transit transfer means the goods
        // never actually left, so give the source its stock and batch quantity back rather than
        // leaving it permanently debited for a transfer that's now going nowhere.
        if ((req.Status == "cancelled" || req.Status == "rejected") && prev == "in_transit")
        {
            foreach (var item in transfer.Items)
                await RestoreSourceAsync(transfer, item, item.ApprovedQuantity ?? item.RequestedQuantity);
        }

        await db.SaveChangesAsync();

        if (req.Status == "completed" && prev != "completed" && transfer.CreatedBy != Guid.Empty)
        {
            await notifications.NotifyUserAsync(transfer.CreatedBy,
                "Inventory", "Stock Transfer Received", "Stock Transfer Received",
                $"Stock transfer {transfer.TransferNumber} received",
                entityType: "StockTransfer", entityId: transfer.Id,
                branchId: transfer.DestBranchId ?? transfer.SourceBranchId);
        }

        if ((req.Status == "approved" || req.Status == "rejected") && prev != req.Status)
        {
            var approved = req.Status == "approved";
            // Notify both the transfer's creator and the manager who acted. Previously only
            // CreatedBy was notified and only when set, so an approval could surface to no one.
            var recipients = new List<Guid>();
            if (transfer.CreatedBy != Guid.Empty) recipients.Add(transfer.CreatedBy);
            if (CallerId() is { } caller) recipients.Add(caller);
            if (recipients.Count > 0)
            {
                await notifications.NotifyUsersAsync(recipients,
                    "Admin / Security", approved ? "Manager Approval Granted" : "Manager Approval Rejected",
                    approved ? "Manager Approval Granted" : "Manager Approval Rejected",
                    approved
                        ? $"Transfer {transfer.TransferNumber} was approved"
                        : $"Transfer {transfer.TransferNumber} was rejected",
                    severity: approved ? "info" : "warning",
                    entityType: "StockTransfer", entityId: transfer.Id, branchId: transfer.DestBranchId ?? transfer.SourceBranchId);
            }
        }

        return Ok(transfer);
    }

    private async Task SyncLinkedPoStatus(StockTransfer transfer)
    {
        if (!transfer.PurchaseOrderId.HasValue) return;
        var po = await db.PurchaseOrders.Include(p => p.Items)
            .FirstOrDefaultAsync(p => p.Id == transfer.PurchaseOrderId.Value);
        if (po is null) return;

        po.Status = "fully_received";
        po.ReceivedDate = DateTime.UtcNow;
        po.UpdatedAt = DateTime.UtcNow;

        foreach (var tItem in transfer.Items)
        {
            var poItem = po.Items.FirstOrDefault(i => i.ProductId == tItem.ProductId);
            if (poItem is null) continue;
            poItem.ReceivedQuantity = tItem.ReceivedQuantity ?? tItem.RequestedQuantity;
            poItem.Status = "received";
        }
    }
}

public record UpdateTransferStatusRequest(string Status, Guid? ApprovedBy);
public record ReceiveTransferItemRequest(Guid ItemId, decimal ReceivedQuantity, string? Notes, string? DamagedOrReturnReason = null);
public record ReceiveTransferRequest(List<ReceiveTransferItemRequest>? Items, Guid? ApprovedBy);

public record CreateTransferItemRequest(
    Guid ProductId,
    decimal RequestedQuantity,
    decimal? UnitCost,
    string? ReturnReason,
    string? Notes,
    Guid? BatchId = null,
    DateTime? ExpiryDate = null
);

public record CreateTransferRequest(
    string TransferType,
    Guid? SourceBranchId,
    Guid? SourceWarehouseId,
    Guid? SourceSupplierId,
    Guid? DestBranchId,
    Guid? DestWarehouseId,
    Guid? DestSupplierId,
    Guid? PurchaseOrderId,
    Guid? CreatedBy,
    string? ReturnReason,
    string? Notes,
    string? BatchId,
    DateTime? ExpectedDate,
    List<CreateTransferItemRequest>? Items
);
