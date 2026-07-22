using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/discounts")]
public class DiscountsController(BaqalaDbContext db, IDiscountCreationService discountCreation) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : null;

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] bool? isActive)
    {
        var query = db.Discounts
            .Include(d => d.Product)
            .Include(d => d.Branch)
            .AsQueryable();
        if (isActive.HasValue) query = query.Where(d => d.IsActive == isActive.Value);
        return Ok(await query.OrderByDescending(d => d.CreatedAt).ToListAsync());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var d = await db.Discounts.Include(x => x.Product).Include(x => x.Branch).FirstOrDefaultAsync(x => x.Id == id);
        return d is null ? NotFound() : Ok(d);
    }

    // A caller with Coupons:Approve (i.e. already a manager) creates the discount immediately
    // (self-approve, same precedent as the Wastage/InventoryAdjustment flow). Anyone else's
    // request is queued in the Approval Center instead — no Discount row exists until approved.
    [RequirePermission("Coupons", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] DiscountRequest req)
    {
        var canSelfApprove = await PermissionCheck.HasPermissionAsync(User, db, "Coupons", PermAction.Approve);
        if (!canSelfApprove)
        {
            var pending = new ApprovalRequest
            {
                RequestType = "discount",
                EntityType = "Discount",
                EntityId = null,
                BranchId = req.BranchId,
                RequestedBy = CallerId() ?? Guid.Empty,
                DetailsJson = System.Text.Json.JsonSerializer.Serialize(req),
            };
            db.ApprovalRequests.Add(pending);
            await db.SaveChangesAsync();
            return Accepted(new { message = "Discount request sent for manager approval.", approvalRequestId = pending.Id });
        }

        var discount = await discountCreation.CreateAsync(req);
        return CreatedAtAction(nameof(GetById), new { id = discount.Id }, discount);
    }

    [RequirePermission("Coupons", PermAction.Edit)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] DiscountRequest req)
    {
        var d = await db.Discounts.FindAsync(id);
        if (d is null) return NotFound();
        d.Name = req.Name;
        d.NameAr = req.NameAr;
        d.AppliesTo = req.AppliesTo ?? d.AppliesTo;
        d.ProductId = req.ProductId;
        d.CategoryId = req.CategoryId;
        d.BranchId = req.BranchId;
        d.DiscountType = req.DiscountType ?? d.DiscountType;
        d.Value = req.Value;
        d.IsActive = req.IsActive ?? d.IsActive;
        d.StartDate = req.StartDate;
        d.EndDate = req.EndDate;
        d.RequiresCustomer = req.RequiresCustomer ?? d.RequiresCustomer;
        d.ExcludedProductIdsJson = SerializeExclusions(req.ExcludedProductIds);
        d.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(d);
    }

    private static string? SerializeExclusions(List<Guid>? ids) =>
        ids is { Count: > 0 } ? System.Text.Json.JsonSerializer.Serialize(ids) : null;

    [RequirePermission("Coupons", PermAction.Edit)]
    [HttpPatch("{id:guid}/toggle")]
    public async Task<IActionResult> Toggle(Guid id)
    {
        var d = await db.Discounts.FindAsync(id);
        if (d is null) return NotFound();
        d.IsActive = !d.IsActive;
        d.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(d);
    }

    [RequirePermission("Coupons", PermAction.Delete)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var d = await db.Discounts.FindAsync(id);
        if (d is null) return NotFound();
        db.Discounts.Remove(d);
        await db.SaveChangesAsync();
        return NoContent();
    }
}

public record DiscountRequest(
    string Name,
    string? NameAr,
    string? AppliesTo,
    Guid? ProductId,
    Guid? CategoryId,
    Guid? BranchId,
    string? DiscountType,
    decimal Value,
    bool? IsActive,
    DateTime? StartDate,
    DateTime? EndDate,
    bool? RequiresCustomer,
    List<Guid>? ExcludedProductIds
);
