using BaqalaPOS.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

public record OnlineOrderLineTotal(
    Guid ProductId, decimal Quantity,
    // The price before any Product-level Discount/DiscountType or Offer reduction — the public
    // page shows this crossed out next to UnitPrice whenever they differ.
    decimal OriginalUnitPrice,
    decimal UnitPrice, decimal TotalPrice, decimal TobaccoFeeAmount,
    // True for a bonus/free unit an Offer added (e.g. the free item in "buy 1 get 1 free") — never
    // sent by the client, only ever added here.
    bool IsBonus, string? OfferName);

public record OnlineOrderFee(Guid? TaxFeeRuleId, string Name, decimal Amount);

public record OnlineOrderTotals(
    IReadOnlyList<OnlineOrderLineTotal> Items,
    decimal Subtotal,
    decimal TobaccoFeeAmount,
    IReadOnlyList<OnlineOrderFee> CustomFees,
    decimal CustomFeeAmount,
    decimal TaxAmount,
    decimal TotalAmount,
    // Resolved from the delivery pin against DeliveryFeeRule — see IDeliveryFeeService. Always
    // present (Source "none", Amount 0, when delivery is free), so callers never null-check it.
    DeliveryFeeQuote Delivery)
{
    /// The goods total — everything except delivery. What the branch's min/max order-value gates
    /// compare against: a delivery fee must never be the thing that pushes an order over the
    /// maximum, nor be counted towards clearing the minimum.
    public decimal GoodsTotal => TotalAmount - Delivery.Amount;
}

// The public online-order endpoints are the one checkout path in this codebase that is fully
// anonymous — nothing from the client can be trusted, unlike the POS/kiosk paths (semi-trusted
// staff/device credentials). This is the single place that resolves the REAL price for an online
// order: price-list resolution, per-product Discount/DiscountType, Offers (bogo/buy_a_get_b/
// product_offer via IOfferResolutionService), tobacco excise, custom fees, then VAT — mirroring
// what the in-store POS computes (scattered across _app.pos.tsx) but recomputed server-side from
// scratch every time, since an anonymous caller can send anything.
public interface IOnlineOrderPricingService
{
    /// <param name="deliveryLatitude">Delivery pin, when the shopper picked one on the map.
    /// Optional — an order with no pin simply can't match a geographic delivery-fee rule and
    /// falls through to the flat rules and the branch default.</param>
    Task<OnlineOrderTotals> ComputeAsync(
        Guid branchId, IEnumerable<(Guid ProductId, decimal Quantity)> items,
        decimal? deliveryLatitude = null, decimal? deliveryLongitude = null,
        CancellationToken ct = default);
}

public class OnlineOrderPricingService(
    BaqalaDbContext db, IPriceResolutionService priceResolution, IOfferResolutionService offerResolution,
    IDeliveryFeeService deliveryFees)
    : IOnlineOrderPricingService
{
    public async Task<OnlineOrderTotals> ComputeAsync(
        Guid branchId, IEnumerable<(Guid ProductId, decimal Quantity)> items,
        decimal? deliveryLatitude = null, decimal? deliveryLongitude = null,
        CancellationToken ct = default)
    {
        var lines = items.ToList();
        var productIds = lines.Select(l => l.ProductId).ToList();

        // Price this basket for the ONLINE channel. A product with no online-specific rule falls
        // back to its in-store rule, and only then to BasePrice (see IPriceResolutionService), so
        // this is safe to use unconditionally — switching a product to a different online price is
        // purely additive, and never blanks out a price that was already set.
        var resolved = await priceResolution.ResolveManyAsync(
            productIds, branchId, customerTier: null, priceType: SalesChannelCatalog.Online, ct: ct);

        // Materialize then filter in memory — a `productIds.Contains()` filter inside the live
        // query fails to type-map on this MySQL EF provider (the ef-mysql-inlist-gotcha worked
        // around throughout this codebase).
        var products = (await db.Products
                .Select(p => new { p.Id, p.Discount, p.DiscountType, p.IsTobacco, p.Name })
                .ToListAsync(ct))
            .Where(p => productIds.Contains(p.Id))
            .ToDictionary(p => p.Id);

        // ── Product-level Discount/DiscountType (per-product markdown, auto-applied — mirrors
        // _app.pos.tsx's productDiscountTotal, the one existing place this field is read today) ──
        var afterProductDiscount = new Dictionary<Guid, (decimal Quantity, decimal Original, decimal Discounted)>();
        foreach (var (productId, quantity) in lines)
        {
            var original = resolved.TryGetValue(productId, out var r) ? r.UnitPrice : 0m;
            var discounted = original;
            if (products.TryGetValue(productId, out var prod) && prod.Discount is > 0)
            {
                discounted = prod.DiscountType == "fixed"
                    ? Math.Max(0, original - prod.Discount.Value)
                    : Math.Max(0, Math.Round(original * (1 - prod.Discount.Value / 100m), 2));
            }
            afterProductDiscount[productId] = (quantity, original, discounted);
        }

        // ── Offers (bogo / buy_a_get_b / product_offer) — server-recomputed, never client-trusted ──
        var cartLines = afterProductDiscount.ToDictionary(kv => kv.Key, kv => (kv.Value.Quantity, kv.Value.Discounted));
        var offers = await offerResolution.ResolveAsync(branchId, cartLines, ct);

        var resultItems = new List<OnlineOrderLineTotal>();
        var (minExcise, exciseRate) = await OrderEditService.ResolveTobaccoExciseConfigAsync(db);

        foreach (var (productId, (quantity, original, discounted)) in afterProductDiscount)
        {
            var finalUnitPrice = offers.DiscountedUnitPrice.TryGetValue(productId, out var offerPrice) ? offerPrice : discounted;
            var isTobacco = products.TryGetValue(productId, out var prod) && prod.IsTobacco;
            var tobaccoFee = isTobacco ? quantity * OrderEditService.CalcTobaccoFee(finalUnitPrice, minExcise, exciseRate) : 0m;
            resultItems.Add(new OnlineOrderLineTotal(
                productId, quantity, original, finalUnitPrice,
                Math.Round(finalUnitPrice * quantity, 2), Math.Round(tobaccoFee, 2), IsBonus: false, OfferName: null));
        }

        // Bonus/free units an Offer added (e.g. the free item in "buy 1 get 1 free") — priced
        // independently (0 for bogo, Offer.OfferPrice for buy_a_get_b), never resolved through the
        // normal price list since they're not a normal sale of that unit.
        foreach (var bonus in offers.BonusLines)
        {
            var isTobacco = products.TryGetValue(bonus.ProductId, out var prod) && prod.IsTobacco;
            var tobaccoFee = isTobacco ? bonus.Quantity * OrderEditService.CalcTobaccoFee(bonus.UnitPrice, minExcise, exciseRate) : 0m;
            resultItems.Add(new OnlineOrderLineTotal(
                bonus.ProductId, bonus.Quantity, bonus.UnitPrice, bonus.UnitPrice,
                Math.Round(bonus.UnitPrice * bonus.Quantity, 2), Math.Round(tobaccoFee, 2), IsBonus: true, OfferName: bonus.OfferName));
        }

        var subtotal = resultItems.Sum(i => i.TotalPrice);
        var tobaccoFeeTotal = resultItems.Sum(i => i.TobaccoFeeAmount);

        var customFees = await ResolveCustomFeesAsync(branchId, subtotal, ct);
        var customFeeTotal = customFees.Sum(f => f.Amount);

        // Delivery is resolved against the goods subtotal, so a free-delivery threshold means
        // "spend this much on groceries", not "spend this much once we've added fees and VAT".
        var delivery = await deliveryFees.ResolveAsync(branchId, deliveryLatitude, deliveryLongitude, subtotal, ct);

        var taxableBase = subtotal + tobaccoFeeTotal;
        var taxAmount = Math.Round(taxableBase * await ResolveVatRateAsync(branchId, ct), 2);
        // Delivery sits outside the VAT base, exactly like the configured custom fees above
        // (which is where a "Delivery Service Fee" was modelled before this existed). Consistency
        // with the existing treatment matters more here than the alternative reading, because the
        // two would otherwise disagree on the same order.
        var totalAmount = subtotal + tobaccoFeeTotal + taxAmount + customFeeTotal + delivery.Amount;

        return new OnlineOrderTotals(
            resultItems, subtotal, tobaccoFeeTotal, customFees, customFeeTotal, taxAmount, totalAmount, delivery);
    }

    // Branch-specific active "vat" rule wins over the tenant-wide one, mirroring
    // OrderEditService.ResolveLoyaltyProgramAsync's branch-override-with-tenant-fallback shape.
    private async Task<decimal> ResolveVatRateAsync(Guid branchId, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var rule = await db.TaxFeeRules
            .Where(r => r.RuleType == "vat" && r.Status == "active" && r.BranchId == branchId &&
                        r.EffectiveDate <= now && (r.EndDate == null || r.EndDate >= now))
            .OrderByDescending(r => r.EffectiveDate)
            .FirstOrDefaultAsync(ct)
            ?? await db.TaxFeeRules
            .Where(r => r.RuleType == "vat" && r.Status == "active" && r.BranchId == null &&
                        r.EffectiveDate <= now && (r.EndDate == null || r.EndDate >= now))
            .OrderByDescending(r => r.EffectiveDate)
            .FirstOrDefaultAsync(ct);

        return rule is null ? 0m : rule.VatPercentage / 100m;
    }

    // No server resolver existed anywhere before this — custom fees were purely client-computed in
    // _app.pos.tsx (allOrderFees/serviceChargeRows) and trusted verbatim by OrdersController.Create.
    // Same fallback chain (flat amount, else excise %, else VAT % reused as a rate) ported here.
    private async Task<List<OnlineOrderFee>> ResolveCustomFeesAsync(Guid branchId, decimal subtotal, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var rules = await db.TaxFeeRules
            .Where(r => r.RuleType == "custom_fee" && r.Status == "active" &&
                        (r.ApplicableTo == "all_products" || r.ApplicableTo == "all_orders") &&
                        (r.BranchId == null || r.BranchId == branchId) &&
                        r.EffectiveDate <= now && (r.EndDate == null || r.EndDate >= now))
            .ToListAsync(ct);

        return rules
            .Select(r => new OnlineOrderFee(r.Id, r.RuleName,
                r.CustomFeeAmount > 0 ? r.CustomFeeAmount
                : r.ExcisePercentage > 0 ? Math.Round(subtotal * r.ExcisePercentage / 100m, 2)
                : r.VatPercentage > 0 ? Math.Round(subtotal * r.VatPercentage / 100m, 2)
                : 0m))
            .Where(f => f.Amount > 0)
            .ToList();
    }
}
