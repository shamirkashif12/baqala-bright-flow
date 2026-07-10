using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class InventoryController(BaqalaDbContext db) : ControllerBase
{
    // Branch-scoped roles (anything but tenant_admin) may only see/write their own branch's
    // batches — mirrors the scoping the frontend already applies to the plain stock list.
    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

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
            .AsQueryable();
        if (branchId.HasValue) query = query.Where(i => i.BranchId == branchId);
        if (lowStock == true) query = query.Where(i => i.Quantity <= i.ReorderLevel);
        if (categoryId.HasValue) query = query.Where(i => i.Product!.CategoryId == categoryId);
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
        var (role, callerBranchId) = GetCallerContext();
        if (role is not null && role != "tenant_admin" && callerBranchId.HasValue) branchId = callerBranchId;

        var query = db.InventoryBatches
            .Include(b => b.Product)
            .Include(b => b.Supplier)
            .AsQueryable();
        if (branchId.HasValue) query = query.Where(b => b.BranchId == branchId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(b => b.Status == status);
        return Ok(await query.OrderBy(b => b.ExpiryDate).ToListAsync());
    }

    [HttpGet("batches/expiring")]
    public async Task<IActionResult> GetExpiringBatches([FromQuery] Guid? branchId, [FromQuery] int daysAhead = 30)
    {
        var (role, callerBranchId) = GetCallerContext();
        if (role is not null && role != "tenant_admin" && callerBranchId.HasValue) branchId = callerBranchId;

        var cutoff = DateTime.UtcNow.AddDays(daysAhead);
        var query = db.InventoryBatches
            .Include(b => b.Product)
            .Include(b => b.Supplier)
            .Where(b => b.ExpiryDate != null && b.ExpiryDate <= cutoff && b.RemainingQuantity > 0);
        if (branchId.HasValue) query = query.Where(b => b.BranchId == branchId);
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
            .Include(a => a.AdjustedByUser)
            .AsQueryable();
        if (branchId.HasValue) query = query.Where(a => a.BranchId == branchId);
        if (!string.IsNullOrEmpty(adjustmentType)) query = query.Where(a => a.AdjustmentType == adjustmentType);
        return Ok(await query.OrderByDescending(a => a.CreatedAt).ToListAsync());
    }

    [RequirePermission("Stocks", PermAction.Create)]
    [HttpPost("adjustments")]
    public async Task<IActionResult> Adjust([FromBody] AdjustRequest req)
    {
        // Same stock-write guard as ReceiveBatch: this endpoint had no quantity validation at
        // all, so a zero/negative value here was a second, unguarded route to the BUG-C1 class
        // of defect (corrupt on-hand quantity), separate from the Receive Batch form.
        if (req.Quantity <= 0)
            return BadRequest(new { message = "Adjustment quantity must be greater than zero." });

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
            AdjustedBy = req.AdjustedBy,
            CreatedAt = DateTime.UtcNow,
        };

        if (req.AdjustmentType is "addition" or "return_to_supplier" or "transfer_in")
            stock.Quantity += req.Quantity;
        else
            // Clamp at zero rather than letting a removal push stock negative — same
            // convention OrdersController.Create already uses when a sale reduces stock.
            stock.Quantity = Math.Max(0, stock.Quantity - req.Quantity);
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
    int? ReorderLevel,
    string? DamagedOrReturnReason = null
);
