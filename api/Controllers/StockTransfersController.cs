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
