using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class WarehouseController(BaqalaDbContext db) : ControllerBase
{
    [HttpGet("requests")]
    public async Task<IActionResult> GetRequests(
        [FromQuery] Guid? branchId,
        [FromQuery] string? approvalStatus,
        [FromQuery] string? deliveryStatus)
    {
        var query = db.WarehouseRequests
            .Include(w => w.SourceBranch)
            .Include(w => w.DestinationBranch)
            .Include(w => w.Supplier)
            .AsQueryable();
        if (branchId.HasValue)
            query = query.Where(w => w.DestinationBranchId == branchId || w.SourceBranchId == branchId);
        if (!string.IsNullOrEmpty(approvalStatus)) query = query.Where(w => w.ApprovalStatus == approvalStatus);
        if (!string.IsNullOrEmpty(deliveryStatus)) query = query.Where(w => w.DeliveryStatus == deliveryStatus);
        return Ok(await query.OrderByDescending(w => w.CreatedAt).ToListAsync());
    }

    [HttpGet("requests/{id:guid}")]
    public async Task<IActionResult> GetRequestById(Guid id)
    {
        var request = await db.WarehouseRequests
            .Include(w => w.Items).ThenInclude(i => i.Product)
            .Include(w => w.DestinationBranch)
            .Include(w => w.SourceBranch)
            .FirstOrDefaultAsync(w => w.Id == id);
        return request is null ? NotFound() : Ok(request);
    }

    [HttpPost("requests")]
    public async Task<IActionResult> CreateRequest([FromBody] WarehouseRequest request)
    {
        request.Id = Guid.NewGuid();
        request.RequestNumber = $"WH-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}";
        request.ApprovalStatus = "request_generated";
        request.DeliveryStatus = "pending";
        request.CreatedAt = request.UpdatedAt = DateTime.UtcNow;
        foreach (var item in request.Items) { item.Id = Guid.NewGuid(); item.RequestId = request.Id; }
        db.WarehouseRequests.Add(request);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetRequestById), new { id = request.Id }, request);
    }

    [HttpPatch("requests/{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ApproveRequest req)
    {
        var request = await db.WarehouseRequests.FindAsync(id);
        if (request is null) return NotFound();
        request.ApprovalStatus = req.Approved ? "approved" : "unapproved";
        request.ApprovedBy = req.ApprovedBy;
        request.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(request);
    }

    [HttpPatch("requests/{id:guid}/delivery")]
    public async Task<IActionResult> UpdateDelivery(Guid id, [FromBody] UpdateStatusRequest req)
    {
        var request = await db.WarehouseRequests.FindAsync(id);
        if (request is null) return NotFound();
        request.DeliveryStatus = req.Status;
        request.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(request);
    }
}

public record ApproveRequest(bool Approved, Guid ApprovedBy);
