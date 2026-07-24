using BaqalaPOS.Api.Controllers;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;

namespace BaqalaPOS.Api.Services;

public interface IOfferCreationService
{
    /// <summary>Creates a live Offer. Extracted out of OffersController so both an immediate
    /// (self-approve) creation and a later Approval Center decision produce the same row —
    /// mirrors IDiscountCreationService.</summary>
    Task<Offer> CreateAsync(OfferRequest req);
}

public class OfferCreationService(BaqalaDbContext db) : IOfferCreationService
{
    public async Task<Offer> CreateAsync(OfferRequest req)
    {
        var offer = new Offer
        {
            Id = Guid.NewGuid(),
            Name = req.Name,
            OfferType = req.OfferType,
            BranchId = req.BranchId,
            TriggerProductId = req.TriggerProductId,
            TriggerBarcode = string.IsNullOrWhiteSpace(req.TriggerBarcode) ? null : req.TriggerBarcode.Trim(),
            GetProductId = req.GetProductId,
            TriggerQuantity = req.TriggerQuantity ?? 1,
            GetQuantity = req.GetQuantity ?? 1,
            OfferPrice = req.OfferPrice,
            DiscountPercentage = req.DiscountPercentage,
            ItemsDescription = req.ItemsDescription,
            MinBasketAmount = req.MinBasketAmount,
            Winners = req.Winners,
            UsageLimit = req.UsageLimit,
            UsedCount = 0,
            StartDate = req.StartDate ?? DateTime.UtcNow,
            EndDate = req.EndDate ?? DateTime.UtcNow.AddMonths(1),
            IsActive = req.IsActive ?? true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        db.Offers.Add(offer);
        await db.SaveChangesAsync();
        return offer;
    }
}
