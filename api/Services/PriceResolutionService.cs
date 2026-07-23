using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

// The single authority on "what does this product cost here, for this customer, right now".
//
// Before this existed, the answer was always Product.BasePrice, read directly at ~15 sites across
// three independently-maintained pricing engines. This service does not replace those engines —
// discounts, offers, bundles, coupons, tobacco excise and tax all still work exactly as they did.
// It replaces only the *first* step they all shared: sourcing the unit price. Promotions continue
// to stack on top of whatever price resolves here.
//
// Backwards compatibility is the design constraint: a product with no price rules resolves to
// BasePrice, so activating this on an untouched database changes no price anywhere.

// One pack buying option, e.g. "Case of 12 for 100.00".
//
// UnitPrice is PackPrice/PackSize and is what the POS actually puts on the cart line — a pack is
// sold as PackSize ordinary units, never as a distinct line kind. That keeps stock deduction, FEFO
// batch consumption, receipts, tax and every report working unchanged.
public record PackOption(
    Guid PriceListId,
    string? Label,
    decimal PackSize,
    decimal PackPrice,
    decimal UnitPrice,
    string? PackBarcode);

// Source explains which rule won, for UI attribution and for debugging a surprising price.
//   base           — no rule matched; Product.BasePrice
//   branch_tier    — branch-specific rule gated on customer tier
//   branch         — branch-specific rule
//   tier           — tenant-wide rule gated on customer tier
//   scheduled      — tenant-wide rule with a time window
//   list           — tenant-wide open-ended rule
public record ResolvedPrice(
    Guid ProductId,
    decimal UnitPrice,
    decimal BasePrice,
    Guid? PriceListId,
    string Source,
    IReadOnlyList<PackOption> Packs);

public interface IPriceResolutionService
{
    Task<ResolvedPrice> ResolveAsync(
        Guid productId, Guid? branchId, string? customerTier,
        string priceType = "standard", DateTime? at = null, CancellationToken ct = default);

    Task<IReadOnlyDictionary<Guid, ResolvedPrice>> ResolveManyAsync(
        IEnumerable<Guid> productIds, Guid? branchId, string? customerTier,
        string priceType = "standard", DateTime? at = null, CancellationToken ct = default);

    // Resolve every active product for a branch — what the POS calls once on load.
    Task<IReadOnlyDictionary<Guid, ResolvedPrice>> ResolveCatalogAsync(
        Guid? branchId, string? customerTier,
        string priceType = "standard", DateTime? at = null, CancellationToken ct = default);
}

public class PriceResolutionService(BaqalaDbContext db) : IPriceResolutionService
{
    public async Task<ResolvedPrice> ResolveAsync(
        Guid productId, Guid? branchId, string? customerTier,
        string priceType = "standard", DateTime? at = null, CancellationToken ct = default)
    {
        var map = await ResolveManyAsync([productId], branchId, customerTier, priceType, at, ct);
        // Absent only when the product doesn't exist — see Build. Callers of the single-product
        // form check existence first (PricingController.ResolveOne 404s), so this is the
        // defensive tail, not a routine path.
        return map.TryGetValue(productId, out var r)
            ? r
            : new ResolvedPrice(productId, 0m, 0m, null, "unknown_product", []);
    }

    public async Task<IReadOnlyDictionary<Guid, ResolvedPrice>> ResolveManyAsync(
        IEnumerable<Guid> productIds, Guid? branchId, string? customerTier,
        string priceType = "standard", DateTime? at = null, CancellationToken ct = default)
    {
        var ids = productIds.Distinct().ToList();
        if (ids.Count == 0) return new Dictionary<Guid, ResolvedPrice>();

        // `.Contains()` against a DbSet-backed IQueryable throws on this repo's MySQL provider
        // ("Expression '@ids' ... does not have a type mapping assigned") — filter in-memory after
        // fetching instead, same fix as elsewhere in this codebase (ef-mysql-inlist-gotcha).
        var idSet = ids.ToHashSet();
        var basePrices = (await db.Products
                .Select(p => new { p.Id, p.BasePrice })
                .ToListAsync(ct))
            .Where(p => idSet.Contains(p.Id))
            .ToDictionary(p => p.Id, p => p.BasePrice);

        var rules = (await db.ProductPriceLists
                .Where(r => r.IsActive && r.PriceType == priceType)
                .ToListAsync(ct))
            .Where(r => idSet.Contains(r.ProductId))
            .ToList();

        return Build(ids, basePrices, rules, branchId, customerTier, at ?? DateTime.UtcNow);
    }

    public async Task<IReadOnlyDictionary<Guid, ResolvedPrice>> ResolveCatalogAsync(
        Guid? branchId, string? customerTier,
        string priceType = "standard", DateTime? at = null, CancellationToken ct = default)
    {
        var products = await db.Products
            .Where(p => p.Status == "active")
            .Select(p => new { p.Id, p.BasePrice })
            .ToListAsync(ct);

        var ids = products.Select(p => p.Id).ToList();
        var basePrices = products.ToDictionary(p => p.Id, p => p.BasePrice);

        // Only pull rules for products that have any — the table is sparse by design, so this is a
        // far smaller read than the catalog itself.
        var rules = await db.ProductPriceLists
            .Where(r => r.IsActive && r.PriceType == priceType)
            .ToListAsync(ct);

        return Build(ids, basePrices, rules, branchId, customerTier, at ?? DateTime.UtcNow);
    }

    // Pure matching over already-fetched rows, done in memory rather than SQL: the candidate set
    // per product is a handful of rows, and NotificationService already sets the precedent of
    // in-memory matching where the MySQL provider can't express the predicate.
    private static Dictionary<Guid, ResolvedPrice> Build(
        List<Guid> ids,
        Dictionary<Guid, decimal> basePrices,
        List<ProductPriceList> rules,
        Guid? branchId,
        string? customerTier,
        DateTime now)
    {
        var byProduct = rules.GroupBy(r => r.ProductId).ToDictionary(g => g.Key, g => g.ToList());
        var result = new Dictionary<Guid, ResolvedPrice>(ids.Count);

        foreach (var id in ids)
        {
            // A product that doesn't exist has no price — and must not be reported as costing 0,
            // which a caller trusting this map (the POS does) would happily ring up as free.
            // Omitting it makes the caller's `?? basePrice` fallback the only path, which is the
            // correct answer for a stale id.
            if (!basePrices.TryGetValue(id, out var basePrice)) continue;

            if (!byProduct.TryGetValue(id, out var candidates))
            {
                result[id] = new ResolvedPrice(id, basePrice, basePrice, null, "base", []);
                continue;
            }

            var applicable = candidates.Where(r => Applies(r, branchId, customerTier, now)).ToList();

            // Precedence — a customer's tier price is a loyalty benefit that must win over an
            // ordinary branch price: a platinum shopper standing in a branch that has its own
            // shelf price should still get the platinum price, not the branch's. So a rule gated on
            // a customer tier outranks one that isn't. (A walk-in never matches a tier rule at all
            // — see Applies — so they still get the branch price.) Only when tier-specificity ties
            // does branch-specificity, then priority, and schedule decide.
            var unitRule = applicable
                .Where(r => !IsPack(r))
                .OrderByDescending(r => r.MinCustomerTier != null)  // a tier (loyalty) price wins first
                .ThenByDescending(r => r.BranchId.HasValue)         // then a branch-specific price
                .ThenByDescending(r => r.Priority)                  // then explicit operator intent
                .ThenByDescending(r => r.EffectiveFrom)             // then the latest-starting schedule
                .ThenByDescending(r => r.CreatedAt)                 // deterministic final tiebreak
                .FirstOrDefault();

            var packs = applicable
                .Where(IsPack)
                .Where(r => r.PackSize is > 0)
                .OrderBy(r => r.PackSize)
                .Select(r => new PackOption(
                    r.Id,
                    r.Label ?? $"Pack of {Trim(r.PackSize!.Value)}",
                    r.PackSize!.Value,
                    r.Price,
                    // Round to 4dp, not 2: a 3-for-10 pack is 3.3333/unit, and rounding that to
                    // 3.33 at this stage loses a halala per pack against the price the operator
                    // actually set. The line total is rounded once, downstream, as it always was.
                    Math.Round(r.Price / r.PackSize!.Value, 4, MidpointRounding.AwayFromZero),
                    r.PackBarcode))
                .ToList();

            result[id] = unitRule is null
                ? new ResolvedPrice(id, basePrice, basePrice, null, "base", packs)
                : new ResolvedPrice(id, unitRule.Price, basePrice, unitRule.Id, SourceOf(unitRule), packs);
        }

        return result;
    }

    private static bool IsPack(ProductPriceList r) =>
        string.Equals(r.UnitType, "pack", StringComparison.OrdinalIgnoreCase);

    private static bool Applies(ProductPriceList r, Guid? branchId, string? customerTier, DateTime now)
    {
        // A rule scoped to a branch never applies elsewhere. A tenant-wide rule (null) applies
        // everywhere, including when the caller has no branch context at all.
        if (r.BranchId.HasValue && r.BranchId != branchId) return false;

        // Scheduled window: EffectiveFrom inclusive, EffectiveTo exclusive. A null EffectiveTo is
        // open-ended. This is what lets "X until Friday, then Y" be two rows with abutting windows.
        if (r.EffectiveFrom > now) return false;
        if (r.EffectiveTo.HasValue && r.EffectiveTo.Value <= now) return false;

        // Customer-group gate. A null tier applies to everyone; otherwise the customer's tier must
        // match this rule's tier exactly — a "silver" rule serves silver customers only, never gold
        // or platinum. An anonymous walk-in (customerTier == null) never matches a gated rule, so
        // "select any tiers" (e.g. silver + platinum, skipping gold) is one row per selected tier.
        if (r.MinCustomerTier is not null &&
            !string.Equals(r.MinCustomerTier, customerTier, StringComparison.OrdinalIgnoreCase))
            return false;

        return true;
    }

    private static string SourceOf(ProductPriceList r)
    {
        if (r.BranchId.HasValue) return r.MinCustomerTier is not null ? "branch_tier" : "branch";
        if (r.MinCustomerTier is not null) return "tier";
        return r.EffectiveTo.HasValue ? "scheduled" : "list";
    }

    private static string Trim(decimal d) => d == Math.Floor(d) ? ((long)d).ToString() : d.ToString("0.##");
}
