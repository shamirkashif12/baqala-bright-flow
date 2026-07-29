using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

// A bonus/cheap unit an offer adds to the order — same product the trigger named, or a distinct
// "get" product (buy_a_get_b with a different reward item). Priced separately from the paid line
// it rides alongside rather than folding into that line's quantity, so a single OnlineOrderItem
// always has one unambiguous unit price.
public record OfferBonusLine(Guid ProductId, decimal Quantity, decimal UnitPrice, string OfferName);

public record OfferResolution(
    IReadOnlyDictionary<Guid, decimal> DiscountedUnitPrice,
    IReadOnlyList<OfferBonusLine> BonusLines);

// Server-side port of the offer-application math that today only exists client-side in
// _app.pos.tsx (bonusContributions/triggeredOffers/offerDiscount) and is trusted verbatim by
// OrdersController.Create — there is no OfferId column on Order/OrderItem to even re-verify
// against for the in-store flow. The online channel is fully anonymous, so nothing client-sent
// can be trusted here; this recomputes from the Offer table every time.
//
// Only "bogo", "buy_a_get_b" and "product_offer" are handled — "combo" has no structured item
// list (ItemsDescription is free text, not JSON, except for a rare hand-authored JSON shape the
// POS client optionally understands) and "lucky_draw" is a prize-draw mechanic with no per-order
// price effect and no online winner-selection concept anywhere in this app.
public interface IOfferResolutionService
{
    // cartLines: productId -> (quantity, unit price so far — after price-list resolution and any
    // product-level Discount/DiscountType, so a product_offer's percentage/flat reduction applies
    // on top of the real price the customer would otherwise pay, not a stale base price).
    Task<OfferResolution> ResolveAsync(
        Guid branchId, IReadOnlyDictionary<Guid, (decimal Quantity, decimal UnitPrice)> cartLines, CancellationToken ct = default);

    // Independent of any actual cart — "which active offers exist for these catalog products right
    // now", so the public catalog can badge them (e.g. "Buy 1 Get 1 Free") before anything is added.
    Task<IReadOnlyDictionary<Guid, string>> GetCatalogBadgesAsync(Guid branchId, IEnumerable<Guid> productIds, CancellationToken ct = default);
}

public class OfferResolutionService(BaqalaDbContext db) : IOfferResolutionService
{
    private async Task<List<Offer>> ActiveOffersAsync(Guid branchId, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        return await db.Offers
            .Where(o => o.IsActive && o.StartDate <= now && o.EndDate >= now &&
                        (o.BranchId == null || o.BranchId == branchId) &&
                        (o.OfferType == "bogo" || o.OfferType == "buy_a_get_b" || o.OfferType == "product_offer") &&
                        o.TriggerProductId != null &&
                        (o.UsageLimit == null || o.UsedCount < o.UsageLimit))
            .ToListAsync(ct);
    }

    public async Task<OfferResolution> ResolveAsync(
        Guid branchId, IReadOnlyDictionary<Guid, (decimal Quantity, decimal UnitPrice)> cartLines, CancellationToken ct = default)
    {
        var offers = await ActiveOffersAsync(branchId, ct);
        var discounted = new Dictionary<Guid, decimal>();
        var bonusLines = new List<OfferBonusLine>();

        foreach (var o in offers)
        {
            var triggerId = o.TriggerProductId!.Value;
            if (!cartLines.TryGetValue(triggerId, out var line) || line.Quantity <= 0) continue;

            if (o.OfferType is "bogo" or "buy_a_get_b")
            {
                // Same "buy 3 get 1 free" math as _app.pos.tsx's bonusContributions: sets computed
                // against the actual purchased quantity, never a total that already includes a
                // previous bonus.
                var triggerQty = o.TriggerQuantity <= 0 ? 1 : o.TriggerQuantity;
                var getQty = o.GetQuantity <= 0 ? 1 : o.GetQuantity;
                var sets = Math.Floor(line.Quantity / triggerQty);
                if (sets <= 0) continue;
                var getProductId = o.GetProductId ?? triggerId;
                var payPerUnit = o.OfferType == "buy_a_get_b" ? (o.OfferPrice ?? 0) : 0;
                bonusLines.Add(new OfferBonusLine(getProductId, sets * getQty, payPerUnit, o.Name));
            }
            else if (o.OfferType == "product_offer")
            {
                var newPrice = o.DiscountPercentage is > 0
                    ? Math.Round(line.UnitPrice * (1 - o.DiscountPercentage.Value / 100m), 2)
                    : o.OfferPrice ?? line.UnitPrice;
                newPrice = Math.Max(0, newPrice);
                if (newPrice < line.UnitPrice) discounted[triggerId] = newPrice;
            }
        }

        return new OfferResolution(discounted, bonusLines);
    }

    public async Task<IReadOnlyDictionary<Guid, string>> GetCatalogBadgesAsync(
        Guid branchId, IEnumerable<Guid> productIds, CancellationToken ct = default)
    {
        var idSet = productIds.ToHashSet();
        var offers = (await ActiveOffersAsync(branchId, ct)).Where(o => idSet.Contains(o.TriggerProductId!.Value));
        var badges = new Dictionary<Guid, string>();
        foreach (var o in offers)
        {
            var label = o.OfferType switch
            {
                "bogo" => $"Buy {Trim(o.TriggerQuantity)} Get {Trim(o.GetQuantity)} Free",
                "buy_a_get_b" => o.OfferPrice.HasValue
                    ? $"Buy {Trim(o.TriggerQuantity)} Get {Trim(o.GetQuantity)} for SAR {o.OfferPrice:0.##}"
                    : $"Buy {Trim(o.TriggerQuantity)} Get {Trim(o.GetQuantity)} Free",
                "product_offer" => o.DiscountPercentage is > 0
                    ? $"{Trim(o.DiscountPercentage.Value)}% OFF"
                    : o.OfferPrice.HasValue ? $"Special price SAR {o.OfferPrice:0.##}" : null,
                _ => null,
            };
            if (label is not null) badges[o.TriggerProductId!.Value] = label;
        }
        return badges;
    }

    private static string Trim(decimal d) => d == Math.Floor(d) ? ((long)d).ToString() : d.ToString("0.##");
}
