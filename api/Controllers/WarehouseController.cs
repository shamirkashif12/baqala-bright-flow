using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[RequirePlanFeature("warehouse_management")]
public class WarehouseController(BaqalaDbContext db, IApprovalNotificationService approvals) : ControllerBase
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
        [FromQuery] string[]? approvalStatus,
        [FromQuery] string[]? deliveryStatus)
    {
        var query = db.WarehouseRequests
            .Include(w => w.SourceBranch)
            .Include(w => w.DestinationBranch)
            .Include(w => w.Supplier)
            .AsQueryable();
        if (branchId.HasValue)
            query = query.Where(w => w.DestinationBranchId == branchId || w.SourceBranchId == branchId);

        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue)
            query = query.Where(w => w.DestinationBranchId == callerBranchId || w.SourceBranchId == callerBranchId);

        // approvalStatus/deliveryStatus are arrays — never `.Contains()` a string[] directly
        // against a DbSet-backed IQueryable on this repo's MySQL provider (ef-mysql-inlist-gotcha
        // memory: throws at execution time on 2+ values). Materialize first, filter in-memory.
        var all = await query.OrderByDescending(w => w.CreatedAt).ToListAsync();
        IEnumerable<WarehouseRequest> scoped = all;
        if (approvalStatus is { Length: > 0 }) scoped = scoped.Where(w => approvalStatus.Contains(w.ApprovalStatus));
        if (deliveryStatus is { Length: > 0 }) scoped = scoped.Where(w => deliveryStatus.Contains(w.DeliveryStatus));
        return Ok(scoped.ToList());
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

        // The New Stock Request form already blocks submitting with no line items client-side,
        // but nothing enforced it here — a handful of historical requests exist with 0 items,
        // submitted through some path that bypassed (or predates) that client check. Reject
        // server-side so that gap can't reopen.
        if (request.Items is not { Count: > 0 })
            return BadRequest(new { message = "A stock request must have at least one item." });

        // Supplier-sourced requests (no SourceBranchId) skip the on-hand check in the loop below
        // entirely, so a non-positive quantity there was never rejected at all — only caught here.
        if (!request.SourceBranchId.HasValue && request.Items.Any(i => i.RequestedQuantity <= 0))
            return BadRequest(new { message = "Requested quantity must be greater than zero." });

        // Reject a request for more than the source branch actually has on hand — previously
        // nothing compared RequestedQuantity to real stock (AvailableStock existed on the model
        // but was never populated or checked), so e.g. requesting 501 of 500 available was
        // silently accepted. Only applies when the request draws from a branch's own stock;
        // supplier-sourced requests (no SourceBranchId) have nothing local to check against.
        if (request.SourceBranchId.HasValue)
        {
            foreach (var item in request.Items)
            {
                if (item.RequestedQuantity <= 0)
                    return BadRequest(new { message = "Requested quantity must be greater than zero." });

                var available = (await db.InventoryStocks.FirstOrDefaultAsync(
                    s => s.BranchId == request.SourceBranchId && s.ProductId == item.ProductId))?.Quantity ?? 0;
                item.AvailableStock = available;
                if (item.RequestedQuantity > available)
                    return BadRequest(new { message = $"Cannot request {item.RequestedQuantity} unit(s) — only {available} available at the source branch." });
            }
        }

        request.Id = Guid.NewGuid();
        request.RequestNumber = $"WH-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}";
        request.RequestedBy = callerId ?? request.RequestedBy;
        request.ApprovalStatus = "request_generated";
        request.DeliveryStatus = "pending";
        request.CreatedAt = request.UpdatedAt = DateTime.UtcNow;
        foreach (var item in request.Items) { item.Id = Guid.NewGuid(); item.RequestId = request.Id; }
        db.WarehouseRequests.Add(request);
        await db.SaveChangesAsync();

        // Where the stock is being pulled FROM is the first thing an approver checks (another
        // branch's shelves vs. a supplier order are different decisions), so it goes in the message
        // rather than making them open the request to find out.
        var sourceName = request.SourceBranchId.HasValue
            ? await db.Branches.Where(b => b.Id == request.SourceBranchId).Select(b => b.Name).FirstOrDefaultAsync()
            : request.SupplierId.HasValue
                ? await db.Suppliers.Where(s => s.Id == request.SupplierId).Select(s => s.Name).FirstOrDefaultAsync()
                : null;

        // Scoped to the DESTINATION branch — that's the branch this stock is for, and the one whose
        // approvers own the decision.
        await approvals.NotifyApproversAsync(
            module: "Stock Transfers", branchId: request.DestinationBranchId, requestedBy: request.RequestedBy,
            category: "Inventory",
            type: "Stock Request Approval Required", title: "Stock Request Approval Required",
            message: $"Stock request {request.RequestNumber} — {request.Items.Count} line(s)"
                + (sourceName is null ? "" : $" from {sourceName}"),
            entityType: "WarehouseRequest", entityId: request.Id);

        return CreatedAtAction(nameof(GetRequestById), new { id = request.Id }, request);
    }

    [RequirePermission("Stock Transfers", PermAction.Approve)]
    [HttpPatch("requests/{id:guid}/approve")]
    public async Task<IActionResult> Approve(Guid id, [FromBody] ApproveRequest req)
    {
        var request = await db.WarehouseRequests.FindAsync(id);
        if (request is null) return NotFound();
        // Same convention as RequestedBy above: the JWT is the source of truth for who acted, with
        // the body kept only as a fallback for callers that carry no usable claim. A client-asserted
        // approver would otherwise be recorded verbatim on a permission-gated decision.
        var approverId = Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var aid)
            ? aid : req.ApprovedBy;
        request.ApprovalStatus = req.Approved ? "approved" : "unapproved";
        request.ApprovedBy = approverId;
        request.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await approvals.NotifyRequesterAsync(
            requestedBy: request.RequestedBy, decidedBy: approverId, approved: req.Approved,
            category: "Inventory",
            subject: $"Stock request {request.RequestNumber}", reason: null,
            entityType: "WarehouseRequest", entityId: request.Id, branchId: request.DestinationBranchId);

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
