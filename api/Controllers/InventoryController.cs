using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class InventoryController(BaqalaDbContext db) : ControllerBase
{
    [HttpGet("stock")]
    public async Task<IActionResult> GetStock([FromQuery] Guid? branchId, [FromQuery] bool? lowStock)
    {
        var query = db.InventoryStocks
            .Include(i => i.Product).ThenInclude(p => p!.Category)
            .Include(i => i.Branch)
            .AsQueryable();
        if (branchId.HasValue) query = query.Where(i => i.BranchId == branchId);
        if (lowStock == true) query = query.Where(i => i.Quantity <= i.ReorderLevel);
        return Ok(await query.ToListAsync());
    }

    [HttpGet("stock/{productId:guid}/{branchId:guid}")]
    public async Task<IActionResult> GetStockByProductBranch(Guid productId, Guid branchId)
    {
        var stock = await db.InventoryStocks
            .FirstOrDefaultAsync(i => i.ProductId == productId && i.BranchId == branchId);
        return stock is null ? NotFound() : Ok(stock);
    }

    [HttpGet("batches")]
    public async Task<IActionResult> GetBatches([FromQuery] Guid? branchId, [FromQuery] string? status)
    {
        var query = db.InventoryBatches.Include(b => b.Product).AsQueryable();
        if (branchId.HasValue) query = query.Where(b => b.BranchId == branchId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(b => b.Status == status);
        return Ok(await query.OrderBy(b => b.ExpiryDate).ToListAsync());
    }

    [HttpGet("batches/expiring")]
    public async Task<IActionResult> GetExpiringBatches([FromQuery] Guid? branchId, [FromQuery] int daysAhead = 30)
    {
        var cutoff = DateTime.UtcNow.AddDays(daysAhead);
        var query = db.InventoryBatches
            .Include(b => b.Product)
            .Where(b => b.ExpiryDate != null && b.ExpiryDate <= cutoff && b.RemainingQuantity > 0);
        if (branchId.HasValue) query = query.Where(b => b.BranchId == branchId);
        return Ok(await query.OrderBy(b => b.ExpiryDate).ToListAsync());
    }

    [HttpPost("batches")]
    public async Task<IActionResult> ReceiveBatch([FromBody] ReceiveBatchRequest req)
    {
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
            Notes = req.Notes,
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
        await db.SaveChangesAsync();
        return Created($"/api/inventory/batches/{batch.Id}", batch);
    }

    [HttpGet("adjustments")]
    public async Task<IActionResult> GetAdjustments([FromQuery] Guid? branchId, [FromQuery] string? adjustmentType)
    {
        var query = db.InventoryAdjustments
            .Include(a => a.Product)
            .Include(a => a.Branch)
            .AsQueryable();
        if (branchId.HasValue) query = query.Where(a => a.BranchId == branchId);
        if (!string.IsNullOrEmpty(adjustmentType)) query = query.Where(a => a.AdjustmentType == adjustmentType);
        return Ok(await query.OrderByDescending(a => a.CreatedAt).ToListAsync());
    }

    [HttpPost("adjustments")]
    public async Task<IActionResult> Adjust([FromBody] AdjustRequest req)
    {
        var stock = await db.InventoryStocks
            .FirstOrDefaultAsync(s => s.ProductId == req.ProductId && s.BranchId == req.BranchId);
        if (stock is null) return NotFound("Stock record not found.");

        var adjustment = new InventoryAdjustment
        {
            Id = Guid.NewGuid(),
            ProductId = req.ProductId,
            BranchId = req.BranchId,
            Quantity = req.Quantity,
            AdjustmentType = req.AdjustmentType,
            Reason = req.Reason ?? "",
            AdjustedBy = req.AdjustedBy ?? Guid.Empty,
            CreatedAt = DateTime.UtcNow,
        };

        if (req.AdjustmentType is "addition" or "return_to_supplier" or "transfer_in")
            stock.Quantity += req.Quantity;
        else
            stock.Quantity -= req.Quantity;
        stock.LastUpdated = DateTime.UtcNow;

        db.InventoryAdjustments.Add(adjustment);
        await db.SaveChangesAsync();
        return Created($"/api/inventory/adjustments/{adjustment.Id}", adjustment);
    }
}

public record AdjustRequest(
    Guid ProductId,
    Guid BranchId,
    decimal Quantity,
    string AdjustmentType,
    string? Reason,
    Guid? AdjustedBy
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
    int? ReorderLevel
);
