using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

/// <summary>
/// What delivery costs for one order, and whether the address can be delivered to at all.
///
/// Source names which answer this is, so the checkout page and the admin list can explain a
/// number the customer might query:
///   rule     — a DeliveryFeeRule matched the pin
///   settings — no rule matched; the branch's PosSettings default fee applies
///   none     — no rule and no configured default; delivery is free
///   blocked  — the matched rule marks this area unserviceable (Amount is meaningless)
/// </summary>
public record DeliveryFeeQuote(
    decimal Amount,
    Guid? RuleId,
    string? RuleName,
    string Source,
    bool IsServiceable,
    string? UnserviceableMessage,
    decimal? DistanceKm,
    // True when a fee was configured but zeroed because the order cleared a free-delivery
    // threshold. The checkout page shows "Free delivery" rather than a silent 0.00, which is the
    // difference between a perk the shopper notices and one they don't.
    bool WaivedByThreshold);

public interface IDeliveryFeeService
{
    /// <param name="orderSubtotal">Goods subtotal — what free-delivery thresholds compare against.</param>
    Task<DeliveryFeeQuote> ResolveAsync(
        Guid branchId, decimal? latitude, decimal? longitude, decimal orderSubtotal,
        CancellationToken ct = default);
}

public class DeliveryFeeService(BaqalaDbContext db) : IDeliveryFeeService
{
    private const double EarthRadiusKm = 6371.0088;

    public async Task<DeliveryFeeQuote> ResolveAsync(
        Guid branchId, decimal? latitude, decimal? longitude, decimal orderSubtotal,
        CancellationToken ct = default)
    {
        var rules = await db.DeliveryFeeRules
            .Where(r => r.IsActive && (r.BranchId == null || r.BranchId == branchId))
            .ToListAsync(ct);

        var hasCoordinates = latitude.HasValue && longitude.HasValue;
        decimal? distanceToWinner = null;

        // Match, keeping each rule's computed distance — the winner's distance is reported back so
        // the admin list can show "8.3 km" next to the fee, which is what makes a surprising
        // charge explicable without re-deriving it by hand.
        var matches = new List<(DeliveryFeeRule Rule, decimal? DistanceKm)>();
        foreach (var rule in rules)
        {
            var (matched, distanceKm) = Matches(rule, latitude, longitude, hasCoordinates);
            if (matched) matches.Add((rule, distanceKm));
        }

        // Precedence. Branch-specific beats tenant-wide (a branch that has stated its own delivery
        // policy has overridden the chain's). Then explicit operator priority. Then a geographic
        // rule beats a flat one — a flat rule is the catch-all, so anything that actually located
        // the address is more specific by construction. Then the tightest zone: given overlapping
        // rings, the smaller one is the more precise statement about this address.
        var winner = matches
            .OrderByDescending(m => m.Rule.BranchId.HasValue)
            .ThenByDescending(m => m.Rule.Priority)
            .ThenByDescending(m => m.Rule.RuleType != DeliveryFeeRule.RuleTypes.Flat)
            .ThenBy(m => m.Rule.MaxDistanceKm ?? decimal.MaxValue)
            .ThenByDescending(m => m.Rule.CreatedAt)
            .FirstOrDefault();

        if (winner.Rule is not null)
        {
            distanceToWinner = winner.DistanceKm;

            if (!winner.Rule.IsServiceable)
                return new DeliveryFeeQuote(
                    0m, winner.Rule.Id, winner.Rule.Name, "blocked", IsServiceable: false,
                    winner.Rule.UnserviceableMessage
                        ?? "Sorry — this branch doesn't deliver to that address. Please choose a different location.",
                    distanceToWinner, WaivedByThreshold: false);

            var waived = winner.Rule.FreeAboveOrderAmount is { } threshold
                         && threshold > 0 && orderSubtotal >= threshold
                         && winner.Rule.FeeAmount > 0;

            return new DeliveryFeeQuote(
                waived ? 0m : Math.Round(winner.Rule.FeeAmount, 2),
                winner.Rule.Id, winner.Rule.Name, "rule", IsServiceable: true, null,
                distanceToWinner, waived);
        }

        // No rule matched — fall back to the branch's own default. This is the whole configuration
        // for a shop with one flat citywide fee, which is most of them; the rules table only earns
        // its keep once fees vary by area.
        var settings = await db.PosSettings.FirstOrDefaultAsync(s => s.BranchId == branchId, ct);
        var defaultFee = settings?.OnlineOrderingDeliveryFeeSar ?? 0m;
        if (defaultFee <= 0)
            return new DeliveryFeeQuote(0m, null, null, "none", true, null, distanceToWinner, false);

        var freeAbove = settings?.OnlineOrderingFreeDeliveryAboveSar ?? 0m;
        var waivedByDefault = freeAbove > 0 && orderSubtotal >= freeAbove;
        return new DeliveryFeeQuote(
            waivedByDefault ? 0m : Math.Round(defaultFee, 2),
            null, null, "settings", true, null, distanceToWinner, waivedByDefault);
    }

    /// <summary>
    /// Whether one rule covers this address, plus the distance it computed (radius rules only —
    /// null for everything else, since no other rule type has a meaningful distance).
    /// </summary>
    private static (bool Matched, decimal? DistanceKm) Matches(
        DeliveryFeeRule rule, decimal? latitude, decimal? longitude, bool hasCoordinates)
    {
        switch (rule.RuleType)
        {
            case DeliveryFeeRule.RuleTypes.Radius:
            {
                // A geographic rule cannot decide anything about an order with no pin. Treating it
                // as a match would charge (or block) an address it never actually located.
                if (!hasCoordinates || rule.CenterLatitude is not { } centerLat || rule.CenterLongitude is not { } centerLng)
                    return (false, null);

                var distance = DistanceKm(
                    (double)latitude!.Value, (double)longitude!.Value, (double)centerLat, (double)centerLng);
                var min = rule.MinDistanceKm ?? 0m;
                var withinInner = distance >= min;
                var withinOuter = rule.MaxDistanceKm is not { } max || distance <= max;
                return (withinInner && withinOuter, distance);
            }

            case DeliveryFeeRule.RuleTypes.Bbox:
            {
                if (!hasCoordinates) return (false, null);
                if (rule.MinLatitude is not { } minLat || rule.MaxLatitude is not { } maxLat ||
                    rule.MinLongitude is not { } minLng || rule.MaxLongitude is not { } maxLng)
                    return (false, null);

                var inside = latitude!.Value >= minLat && latitude.Value <= maxLat &&
                             longitude!.Value >= minLng && longitude.Value <= maxLng;
                return (inside, null);
            }

            default:
                // Flat, and anything unrecognised: applies to every delivery in scope. An unknown
                // rule type degrading to "charge the configured fee" is the safe direction — the
                // alternative silently stops charging for delivery.
                return (true, null);
        }
    }

    /// Great-circle (haversine) distance in kilometres. Good to a few metres at city scale, which
    /// is far tighter than delivery zones are ever drawn, and needs no spatial database support —
    /// this repo's MySQL provider maps no geometry types.
    private static decimal DistanceKm(double lat1, double lng1, double lat2, double lng2)
    {
        var dLat = (lat2 - lat1) * Math.PI / 180;
        var dLng = (lng2 - lng1) * Math.PI / 180;
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                Math.Cos(lat1 * Math.PI / 180) * Math.Cos(lat2 * Math.PI / 180) *
                Math.Sin(dLng / 2) * Math.Sin(dLng / 2);
        var c = 2 * Math.Atan2(Math.Sqrt(a), Math.Sqrt(1 - a));
        return Math.Round((decimal)(EarthRadiusKm * c), 3);
    }
}
