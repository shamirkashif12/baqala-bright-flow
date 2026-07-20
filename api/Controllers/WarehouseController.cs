using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class WarehouseController(BaqalaDbContext db) : ControllerBase
{
    // Mirrors GetCallerContext elsewhere. Every role that holds "Warehouses" view also holds
    // "Stock Transfers" view per the RolePermissions matrix (Cashier/Marketing hold neither), so
    // gating on Stock Transfers below doesn't affect the Dashboard's Warehouses-gated widget or
    // the /warehouses page's own Stock Transfers-gated tab.
    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    [RequirePermission("Stock Transfers", PermAction.View)]
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

        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            query = query.Where(w => w.DestinationBranchId == callerBranchId || w.SourceBranchId == callerBranchId);

        return Ok(await query.OrderByDescending(w => w.CreatedAt).ToListAsync());
    }

    [RequirePermission("Stock Transfers", PermAction.View)]
    [HttpGet("requests/{id:guid}")]
    public async Task<IActionResult> GetRequestById(Guid id)
    {
        var request = await db.WarehouseRequests
            .Include(w => w.Items).ThenInclude(i => i.Product)
            .Include(w => w.DestinationBranch)
            .Include(w => w.SourceBranch)
            .FirstOrDefaultAsync(w => w.Id == id);
        if (request is null) return NotFound();

        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue
            && request.DestinationBranchId != callerBranchId && request.SourceBranchId != callerBranchId)
            return NotFound();

        return Ok(request);
    }

    [RequirePermission("Stock Transfers", PermAction.Create)]
    [HttpPost("requests")]
    public async Task<IActionResult> CreateRequest([FromBody] WarehouseRequest request)
    {
        // RequestedBy is a required, non-nullable FK to Users — [Required] on a Guid is a no-op
        // in model binding (it can't be "missing"), so a client that never sends this field
        // (the New Stock Request form never has) silently bound Guid.Empty, which then violated
        // FK_warehouse_requests_users_requested_by at SaveChangesAsync and 500'd on every submit,
        // any role, no partial record left (the FK failure rolls back the whole insert). Derive
        // it server-side from the caller's own JWT instead of trusting/requiring the client to
        // send it, same convention as PurchaseOrdersController.Create's CreatedBy.
        var callerId = Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var uid) ? uid : (Guid?)null;

        // Same FK-violation-as-500 failure mode as RequestedBy above: a warehouse with no
        // BranchWarehouse link can make the frontend fall back to sending the warehouse's own id
        // as destinationBranchId, which has no matching row in branches and would otherwise 500
        // at SaveChangesAsync instead of failing cleanly here.
        if (!await db.Branches.AnyAsync(b => b.Id == request.DestinationBranchId))
            return BadRequest(new { message = "Destination branch not found." });

        request.Id = Guid.NewGuid();
        request.RequestNumber = $"WH-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}";
        request.RequestedBy = callerId ?? request.RequestedBy;
        request.ApprovalStatus = "request_generated";
        request.DeliveryStatus = "pending";
        request.CreatedAt = request.UpdatedAt = DateTime.UtcNow;
        foreach (var item in request.Items) { item.Id = Guid.NewGuid(); item.RequestId = request.Id; }
        db.WarehouseRequests.Add(request);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetRequestById), new { id = request.Id }, request);
    }

    [RequirePermission("Stock Transfers", PermAction.Approve)]
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

    [RequirePermission("Stock Transfers", PermAction.Edit)]
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
