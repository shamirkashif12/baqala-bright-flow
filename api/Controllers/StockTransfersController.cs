using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/stock-transfers")]
public class StockTransfersController(BaqalaDbContext db, INotificationService notifications) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : null;

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

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? transferType,
        [FromQuery] string? status,
        [FromQuery] Guid? sourceWarehouseId,
        [FromQuery] Guid? destWarehouseId,
        [FromQuery] string? batchId,
        [FromQuery] Guid? purchaseOrderId,
        [FromQuery] Guid? sourceSupplierId)
    {
        var query = db.StockTransfers
            .Include(t => t.SourceBranch).Include(t => t.SourceWarehouse).Include(t => t.SourceSupplier)
            .Include(t => t.DestBranch).Include(t => t.DestWarehouse).Include(t => t.DestSupplier)
            .Include(t => t.Items).ThenInclude(i => i.Product)
            .AsQueryable();
        if (!string.IsNullOrEmpty(transferType)) query = query.Where(t => t.TransferType == transferType);
        if (!string.IsNullOrEmpty(status)) query = query.Where(t => t.Status == status);
        if (sourceWarehouseId.HasValue) query = query.Where(t => t.SourceWarehouseId == sourceWarehouseId);
        if (destWarehouseId.HasValue) query = query.Where(t => t.DestWarehouseId == destWarehouseId);
        if (!string.IsNullOrEmpty(batchId)) query = query.Where(t => t.BatchId == batchId);
        if (purchaseOrderId.HasValue) query = query.Where(t => t.PurchaseOrderId == purchaseOrderId);
        if (sourceSupplierId.HasValue) query = query.Where(t => t.SourceSupplierId == sourceSupplierId);
        return Ok(await query.OrderByDescending(t => t.CreatedAt).ToListAsync());
    }

    [HttpGet("batch/{batchId}")]
    public async Task<IActionResult> GetByBatchId(string batchId)
    {
        var transfers = await db.StockTransfers
            .Include(t => t.SourceBranch).Include(t => t.SourceWarehouse).Include(t => t.SourceSupplier)
            .Include(t => t.DestBranch).Include(t => t.DestWarehouse).Include(t => t.DestSupplier)
            .Include(t => t.Items).ThenInclude(i => i.Product)
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
            .FirstOrDefaultAsync(t => t.TransferNumber == number);
        return t is null ? NotFound() : Ok(t);
    }

    [RequirePermission("Stock Transfers", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateTransferRequest req)
    {
        var transferId = Guid.NewGuid();
        var items = (req.Items ?? []).Select(i => new StockTransferItem
        {
            Id = Guid.NewGuid(),
            TransferId = transferId,
            ProductId = i.ProductId,
            RequestedQuantity = i.RequestedQuantity,
            UnitCost = i.UnitCost,
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
        foreach (var recv in req.Items ?? [])
        {
            if (recv.ReceivedQuantity < 0)
                return BadRequest(new { message = $"Received quantity for transfer item {recv.ItemId} cannot be negative." });

            var itemForCheck = transfer.Items.FirstOrDefault(i => i.Id == recv.ItemId);
            if (itemForCheck?.ExpiryDate is { } expiry && expiry.Date < DateTime.UtcNow.Date
                && string.IsNullOrWhiteSpace(recv.DamagedOrReturnReason))
                return BadRequest(new { message = $"Expiry date for transfer item {recv.ItemId} cannot be in the past — provide a damagedOrReturnReason to log it as damaged/return stock instead of resalable inventory." });
        }

        var receiveLines = (req.Items ?? [])
            .Select(recv => (ProductId: transfer.Items.FirstOrDefault(i => i.Id == recv.ItemId)?.ProductId, recv.ReceivedQuantity))
            .Where(l => l.ProductId.HasValue)
            .Select(l => (l.ProductId!.Value, l.ReceivedQuantity));
        var stockError = await ValidateSourceStockAsync(transfer, receiveLines);
        if (stockError != null) return BadRequest(new { message = stockError });

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

        foreach (var item in transfer.Items)
        {
            var qty = item.ReceivedQuantity ?? item.ApprovedQuantity ?? item.RequestedQuantity;

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

            if (transfer.DestBranchId.HasValue)
            {
                var dst = await db.InventoryStocks.FirstOrDefaultAsync(s => s.BranchId == transfer.DestBranchId && s.ProductId == item.ProductId)
                          ?? new InventoryStock { Id = Guid.NewGuid(), BranchId = transfer.DestBranchId.Value, ProductId = item.ProductId };
                if (!await db.InventoryStocks.AnyAsync(s => s.Id == dst.Id))
                    db.InventoryStocks.Add(dst);
                dst.Quantity += qty; dst.LastUpdated = dst.UpdatedAt = DateTime.UtcNow;

                // Create InventoryBatch so expiry date and cost are tracked
                db.InventoryBatches.Add(new InventoryBatch
                {
                    Id = Guid.NewGuid(),
                    BatchNumber = $"TRF-{transfer.TransferNumber}-{item.ProductId.ToString()[..4].ToUpper()}",
                    ProductId = item.ProductId,
                    BranchId = transfer.DestBranchId.Value,
                    SupplierId = transfer.SourceSupplierId,
                    Quantity = qty,
                    RemainingQuantity = qty,
                    PurchaseCost = item.UnitCost ?? 0,
                    ExpiryDate = item.ExpiryDate,
                    ReceivedDate = DateTime.UtcNow,
                    Status = "active",
                    Notes = reasonsByItemId.TryGetValue(item.Id, out var reason) && !string.IsNullOrWhiteSpace(reason)
                        ? $"Received via transfer {transfer.TransferNumber} [Damaged/Return: {reason}]"
                        : $"Received via transfer {transfer.TransferNumber}",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                });
            }
            else if (transfer.DestWarehouseId.HasValue)
            {
                var dst = await db.WarehouseStocks.FirstOrDefaultAsync(s => s.WarehouseId == transfer.DestWarehouseId && s.ProductId == item.ProductId);
                if (dst is null) { dst = new WarehouseStock { Id = Guid.NewGuid(), WarehouseId = transfer.DestWarehouseId.Value, ProductId = item.ProductId }; db.WarehouseStocks.Add(dst); }
                dst.Quantity += qty; dst.LastUpdated = dst.UpdatedAt = DateTime.UtcNow;
            }
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

        // When completed: move stock
        if (req.Status == "completed" && prev != "completed")
        {
            var lines = transfer.Items.Select(item => (item.ProductId, Quantity: item.ReceivedQuantity ?? item.ApprovedQuantity ?? item.RequestedQuantity));
            var stockError = await ValidateSourceStockAsync(transfer, lines);
            if (stockError != null) return BadRequest(new { message = stockError });

            transfer.CompletedDate = DateTime.UtcNow;
            foreach (var item in transfer.Items)
            {
                var qty = item.ReceivedQuantity ?? item.ApprovedQuantity ?? item.RequestedQuantity;

                // Deduct from source
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

                // Add to destination
                if (transfer.DestBranchId.HasValue)
                {
                    var dst = await db.InventoryStocks.FirstOrDefaultAsync(s => s.BranchId == transfer.DestBranchId && s.ProductId == item.ProductId)
                              ?? new InventoryStock { Id = Guid.NewGuid(), BranchId = transfer.DestBranchId.Value, ProductId = item.ProductId };
                    if (dst.Id == Guid.Empty || !await db.InventoryStocks.AnyAsync(s => s.Id == dst.Id))
                        db.InventoryStocks.Add(dst);
                    dst.Quantity += qty; dst.LastUpdated = dst.UpdatedAt = DateTime.UtcNow;
                }
                else if (transfer.DestWarehouseId.HasValue)
                {
                    var dst = await db.WarehouseStocks.FirstOrDefaultAsync(s => s.WarehouseId == transfer.DestWarehouseId && s.ProductId == item.ProductId);
                    if (dst is null) { dst = new WarehouseStock { Id = Guid.NewGuid(), WarehouseId = transfer.DestWarehouseId.Value, ProductId = item.ProductId }; db.WarehouseStocks.Add(dst); }
                    dst.Quantity += qty; dst.LastUpdated = dst.UpdatedAt = DateTime.UtcNow;
                }
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
    string? Notes
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
