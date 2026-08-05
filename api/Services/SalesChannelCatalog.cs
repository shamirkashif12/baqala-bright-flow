namespace BaqalaPOS.Api.Services;

/// <summary>
/// The distribution channels a product can be priced for — the allowed values of
/// <c>ProductPriceList.PriceType</c>.
///
/// A channel is a place the same physical stock is sold through, not a different product: the
/// SKU, the stock pool, the batches and every report are shared. Only the unit price differs,
/// which is why this is a column on the price-rule table rather than a second catalogue.
///
/// Deliberately limited to channels that actually resolve prices today. A channel nobody reads is
/// worse than no channel at all — an operator would set an "aggregator" price, see it ignored
/// everywhere, and conclude pricing is broken. Adding one later is a two-line change here plus a
/// call site passing the new name.
/// </summary>
public static class SalesChannelCatalog
{
    /// In-store POS — also the FALLBACK every other channel inherits from (see
    /// PriceResolutionService), and the value every pre-existing rule already carries.
    public const string Standard = "standard";

    /// The public online-ordering page (OnlineOrdersController's anonymous checkout).
    public const string Online = "online";

    /// The self-checkout kiosk app.
    public const string Kiosk = "kiosk";

    public static readonly string[] All = [Standard, Online, Kiosk];

    public static bool IsValid(string? channel) =>
        channel is not null && All.Contains(channel, StringComparer.OrdinalIgnoreCase);

    /// Null/blank/unknown all collapse to Standard rather than throwing — resolution is on the
    /// hot path of every POS load, and an unrecognised channel must degrade to the shelf price,
    /// never to no price at all.
    public static string Normalize(string? channel) =>
        All.FirstOrDefault(c => string.Equals(c, channel, StringComparison.OrdinalIgnoreCase)) ?? Standard;

    public static string Describe() => string.Join(", ", All);
}
