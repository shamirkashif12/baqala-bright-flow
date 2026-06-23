using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/stock-transfers")]
public class StockTransfersController(BaqalaDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] string? transferType, [FromQuery] string? status)
    {
        var query = db.StockTransfers
            .Include(t => t.SourceBranch).Include(t => t.SourceWarehouse).Include(t => t.SourceSupplier)
            .Include(t => t.DestBranch).Include(t => t.DestWarehouse).Include(t => t.DestSupplier)
            .Include(t => t.Items).ThenInclude(i => i.Product)
            .AsQueryable();
        if (!string.IsNullOrEmpty(transferType)) query = query.Where(t => t.TransferType == transferType);
        if (!string.IsNullOrEmpty(status)) query = query.Where(t => t.Status == status);
        return Ok(await query.OrderByDescending(t => t.CreatedAt).ToListAsync());
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

        var transfer = new StockTransfer
        {
            Id = transferId,
            TransferNumber = $"TRF-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}",
            TransferType = req.TransferType,
            SourceBranchId = req.SourceBranchId,
            SourceWarehouseId = req.SourceWarehouseId,
            SourceSupplierId = req.SourceSupplierId,
            DestBranchId = req.DestBranchId,
            DestWarehouseId = req.DestWarehouseId,
            DestSupplierId = req.DestSupplierId,
            PurchaseOrderId = req.PurchaseOrderId,
            CreatedBy = req.CreatedBy ?? Guid.Empty,
            Status = "draft",
            ReturnReason = req.ReturnReason,
            Notes = req.Notes,
            ExpectedDate = req.ExpectedDate,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
            Items = items,
        };
        db.StockTransfers.Add(transfer);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = transfer.Id }, transfer);
    }

    // Receive a transfer with per-line actual quantities, then mark completed and move stock
    [HttpPost("{id:guid}/receive")]
    public async Task<IActionResult> ReceiveTransfer(Guid id, [FromBody] ReceiveTransferRequest req)
    {
        var transfer = await db.StockTransfers.Include(t => t.Items).FirstOrDefaultAsync(t => t.Id == id);
        if (transfer is null) return NotFound();
        if (transfer.Status != "in_transit") return BadRequest("Transfer must be in_transit to receive.");

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
                    Notes = $"Received via transfer {transfer.TransferNumber}",
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
        if (transfer.TransferType == "warehouse_to_supplier" && transfer.DestSupplierId.HasValue)
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

        await db.SaveChangesAsync();
        return Ok(transfer);
    }

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
        }

        await db.SaveChangesAsync();
        return Ok(transfer);
    }
}

public record UpdateTransferStatusRequest(string Status, Guid? ApprovedBy);
public record ReceiveTransferItemRequest(Guid ItemId, decimal ReceivedQuantity, string? Notes);
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
    DateTime? ExpectedDate,
    List<CreateTransferItemRequest>? Items
);
