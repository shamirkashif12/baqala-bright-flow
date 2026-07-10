using System.Security.Claims;
using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ReturnsController(BaqalaDbContext db) : ControllerBase
{
    // Reads the real, tenant-editable "Manager approval above (SAR)" field from the Returns
    // Policy tab (Settings → Policies & Conditions), so this gate stays in sync with whatever
    // a manager configures there instead of a value baked into code. Falls back to the same
    // 100 SAR default `PosSettings.ReturnManagerApprovalAboveSar` uses when no row exists yet.
    private async Task<decimal> GetManagerApprovalRefundThresholdAsync(Guid branchId)
    {
        var settings = await db.PosSettings.FirstOrDefaultAsync(s => s.BranchId == branchId);
        return settings?.ReturnManagerApprovalAboveSar ?? 100m;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid? branchId, [FromQuery] string? status)
    {
        var query = db.CustomerReturns.Include(r => r.Customer).Include(r => r.Order).Include(r => r.Items).ThenInclude(i => i.Product).AsQueryable();
        if (branchId.HasValue) query = query.Where(r => r.BranchId == branchId);
        if (!string.IsNullOrEmpty(status)) query = query.Where(r => r.Status == status);
        return Ok(await query.OrderByDescending(r => r.CreatedAt).ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var ret = await db.CustomerReturns
            .Include(r => r.Items).ThenInclude(i => i.Product)
            .Include(r => r.Customer)
            .FirstOrDefaultAsync(r => r.Id == id);
        return ret is null ? NotFound() : Ok(ret);
    }

    [RequirePermission("Returns", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CustomerReturn ret)
    {
        ret.Id = Guid.NewGuid();
        ret.ReturnNumber = $"RET-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}";
        ret.Status = "pending";
        ret.CreatedAt = ret.UpdatedAt = DateTime.UtcNow;
        foreach (var item in ret.Items) { item.Id = Guid.NewGuid(); item.ReturnId = ret.Id; }
        db.CustomerReturns.Add(ret);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = ret.Id }, ret);
    }

    [RequirePermission("Returns", PermAction.Approve)]
    [HttpPatch("{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ApproveReturnRequest req)
    {
        var ret = await db.CustomerReturns.FindAsync(id);
        if (ret is null) return NotFound();

        var role = User.FindFirst("role")?.Value;
        var threshold = await GetManagerApprovalRefundThresholdAsync(ret.BranchId);
        if (role == "cashier" && ret.RefundAmount > threshold)
            return StatusCode(403, new { message = $"Manager approval is required for refunds over SAR {threshold:F2}." });

        ret.Status = req.Approved ? "approved" : "rejected";
        var sub = User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value;
        if (Guid.TryParse(sub, out var approver)) ret.ApprovedBy = approver;
        ret.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(ret);
    }

    [RequirePermission("Returns", PermAction.Approve)]
    [HttpPatch("{id:guid}/complete")]
    public async Task<IActionResult> Complete(Guid id)
    {
        var ret = await db.CustomerReturns.Include(r => r.Items).FirstOrDefaultAsync(r => r.Id == id);
        if (ret is null) return NotFound();
        if (ret.Status != "approved") return BadRequest("Only approved returns can be completed.");

        // Restock items that are in good condition and flagged for restock
        foreach (var item in ret.Items.Where(i => i.Restock && i.Condition == "good"))
        {
            var stock = await db.InventoryStocks
                .FirstOrDefaultAsync(s => s.ProductId == item.ProductId && s.BranchId == ret.BranchId);
            if (stock is not null)
            {
                stock.Quantity += item.Quantity;
                stock.LastUpdated = stock.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                db.InventoryStocks.Add(new InventoryStock
                {
                    Id = Guid.NewGuid(),
                    ProductId = item.ProductId,
                    BranchId = ret.BranchId,
                    Quantity = item.Quantity,
                    LastUpdated = DateTime.UtcNow,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                });
            }
        }

        ret.Status = "completed";
        ret.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(ret);
    }
}

public record ApproveReturnRequest(bool Approved, Guid? ApprovedBy = null);
