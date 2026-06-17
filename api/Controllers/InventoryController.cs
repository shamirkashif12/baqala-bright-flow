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
            .Include(i => i.Product)
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
    public async Task<IActionResult> ReceiveBatch([FromBody] InventoryBatch batch)
    {
        batch.Id = Guid.NewGuid();
        batch.RemainingQuantity = batch.Quantity;
        batch.Status = "active";
        batch.CreatedAt = batch.UpdatedAt = DateTime.UtcNow;
        db.InventoryBatches.Add(batch);

        var stock = await db.InventoryStocks
            .FirstOrDefaultAsync(s => s.ProductId == batch.ProductId && s.BranchId == batch.BranchId);
        if (stock is null)
        {
            db.InventoryStocks.Add(new InventoryStock
            {
                Id = Guid.NewGuid(), ProductId = batch.ProductId, BranchId = batch.BranchId,
                Quantity = batch.Quantity, LastUpdated = DateTime.UtcNow
            });
        }
        else
        {
            stock.Quantity += batch.Quantity;
            stock.LastUpdated = DateTime.UtcNow;
        }
        await db.SaveChangesAsync();
        return Created($"/api/inventory/batches/{batch.Id}", batch);
    }

    [HttpPost("adjustments")]
    public async Task<IActionResult> Adjust([FromBody] InventoryAdjustment adjustment)
    {
        adjustment.Id = Guid.NewGuid();
        adjustment.CreatedAt = DateTime.UtcNow;

        var stock = await db.InventoryStocks
            .FirstOrDefaultAsync(s => s.ProductId == adjustment.ProductId && s.BranchId == adjustment.BranchId);
        if (stock is null) return NotFound("Stock record not found.");

        if (adjustment.AdjustmentType is "addition" or "return_to_supplier" or "transfer_in")
            stock.Quantity += adjustment.Quantity;
        else
            stock.Quantity -= adjustment.Quantity;
        stock.LastUpdated = DateTime.UtcNow;

        db.InventoryAdjustments.Add(adjustment);
        await db.SaveChangesAsync();
        return Created($"/api/inventory/adjustments/{adjustment.Id}", adjustment);
    }
}
