using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/offers")]
public class OffersController(BaqalaDbContext db, IOfferCreationService offerCreation) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : null;

    private IQueryable<Offer> WithIncludes() => db.Offers
        .Include(o => o.Branch)
        .Include(o => o.TriggerProduct)
        .Include(o => o.GetProduct);

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] bool? isActive, [FromQuery] string? offerType)
    {
        var query = WithIncludes().AsQueryable();
        if (isActive.HasValue) query = query.Where(o => o.IsActive == isActive.Value);
        if (!string.IsNullOrEmpty(offerType)) query = query.Where(o => o.OfferType == offerType);
        return Ok(await query.OrderByDescending(o => o.CreatedAt).ToListAsync());
    }

    [HttpGet("active")]
    public async Task<IActionResult> GetActive()
    {
        var now = DateTime.UtcNow;
        var offers = await WithIncludes()
            .Where(o => o.IsActive && o.StartDate <= now && o.EndDate >= now)
            .ToListAsync();
        return Ok(offers);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var o = await WithIncludes().FirstOrDefaultAsync(x => x.Id == id);
        return o is null ? NotFound() : Ok(o);
    }

    // Same maker-checker precedent DiscountsController.Create already established: a caller with
    // Coupons:Approve (i.e. already a manager) creates the offer immediately (self-approve);
    // anyone else's request is queued in the Approval Center instead — no Offer row exists until
    // approved.
    [RequirePermission("Coupons", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] OfferRequest req)
    {
        var canSelfApprove = await PermissionCheck.HasPermissionAsync(User, db, "Coupons", PermAction.Approve);
        if (!canSelfApprove)
        {
            var pending = new ApprovalRequest
            {
                RequestType = "offer",
                EntityType = "Offer",
                EntityId = null,
                BranchId = req.BranchId,
                RequestedBy = CallerId() ?? Guid.Empty,
                DetailsJson = System.Text.Json.JsonSerializer.Serialize(req),
            };
            db.ApprovalRequests.Add(pending);
            await db.SaveChangesAsync();
            return Accepted(new { message = "Offer request sent for manager approval.", approvalRequestId = pending.Id });
        }

        var offer = await offerCreation.CreateAsync(req);
        return CreatedAtAction(nameof(GetById), new { id = offer.Id }, offer);
    }

    [RequirePermission("Coupons", PermAction.Edit)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] OfferRequest req)
    {
        var o = await db.Offers.FindAsync(id);
        if (o is null) return NotFound();
        o.Name = req.Name;
        o.OfferType = req.OfferType;
        o.BranchId = req.BranchId;
        o.TriggerProductId = req.TriggerProductId;
        o.TriggerBarcode = string.IsNullOrWhiteSpace(req.TriggerBarcode) ? null : req.TriggerBarcode.Trim();
        o.GetProductId = req.GetProductId;
        o.TriggerQuantity = req.TriggerQuantity ?? o.TriggerQuantity;
        o.GetQuantity = req.GetQuantity ?? o.GetQuantity;
        o.OfferPrice = req.OfferPrice;
        o.DiscountPercentage = req.DiscountPercentage;
        o.ItemsDescription = req.ItemsDescription;
        o.MinBasketAmount = req.MinBasketAmount;
        o.Winners = req.Winners;
        o.UsageLimit = req.UsageLimit;
        o.StartDate = req.StartDate ?? o.StartDate;
        o.EndDate = req.EndDate ?? o.EndDate;
        o.IsActive = req.IsActive ?? o.IsActive;
        o.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(o);
    }

    [RequirePermission("Coupons", PermAction.Edit)]
    [HttpPatch("{id:guid}/toggle")]
    public async Task<IActionResult> Toggle(Guid id)
    {
        var o = await db.Offers.FindAsync(id);
        if (o is null) return NotFound();
        o.IsActive = !o.IsActive;
        o.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(o);
    }

    [RequirePermission("Coupons", PermAction.Delete)]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id)
    {
        var o = await db.Offers.FindAsync(id);
        if (o is null) return NotFound();
        db.Offers.Remove(o);
        await db.SaveChangesAsync();
        return NoContent();
    }
}

public record OfferRequest(
    string Name,
    string OfferType,
    Guid? BranchId,
    Guid? TriggerProductId,
    string? TriggerBarcode,
    Guid? GetProductId,
    decimal? TriggerQuantity,
    decimal? GetQuantity,
    decimal? OfferPrice,
    decimal? DiscountPercentage,
    string? ItemsDescription,
    decimal? MinBasketAmount,
    int? Winners,
    int? UsageLimit,
    DateTime? StartDate,
    DateTime? EndDate,
    bool? IsActive
);
