using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Caching.Memory;

namespace BaqalaPOS.Api.Services;

// One purchasable tier as the Tenant Admin Dashboard publishes it, already translated into this
// project's own vocabulary: Features holds internal feature keys (the ones RequirePlanFeature and
// the sidebar's planFeature check), not the Dashboard's compound module slugs.
public record EcrPlanTier(
    string Name,
    decimal MonthlyPrice,
    decimal YearlyPrice,
    string Currency,
    EcrPlanTierLimits Limits,
    IReadOnlyList<string> Features,
    IReadOnlyList<EcrPlanModule> Modules,
    IReadOnlyList<EcrPlanAddOn> AddOns,
    bool IsPopular);

// A module as the Dashboard names it. The Plans page lists these rather than internal keys so
// the tenant reads the same wording the seller quoted them.
public record EcrPlanModule(string Key, string Name);

public record EcrPlanTierLimits(int? MaxBranches, int? MaxTerminalsPerBranch, int? MaxUsersPerBranch, int? MaxProducts);

// Extra capacity sold against a tier — an additional Branch, User or Terminal.
public record EcrPlanAddOn(string Type, decimal MonthlyPrice, decimal YearlyPrice);

/// <summary>
/// Reads the live Grocery tier list from the Tenant Admin Dashboard's public catalog.
///
/// The Plans page used to render a PLAN_CATALOG constant hardcoded in the frontend, which drifted
/// the moment anyone edited a plan in the Dashboard — it advertised 199/399/699 while the Dashboard
/// was selling 100/250/500. The catalog is the seller's record, so it is the one that belongs on
/// screen.
/// </summary>
public interface IEcrPlanCatalogClient
{
    // Null when the Dashboard is unreachable or answers with something unusable — the caller is
    // expected to degrade rather than fail, since this only feeds a comparison table.
    Task<IReadOnlyList<EcrPlanTier>?> GetTiersAsync(CancellationToken ct = default);
}

public class EcrPlanCatalogClient(
    HttpClient http,
    IMemoryCache cache,
    IConfiguration config,
    ILogger<EcrPlanCatalogClient> logger) : IEcrPlanCatalogClient
{
    // Same host "Manage Subscription" already sends admins to, one port down: the Dashboard's API
    // rather than its UI. Pinned for the same reason TenantController pins DashboardBaseUrlFallback
    // — appsettings.json is gitignored and hand-maintained per server, so a missing value would
    // leave a stale price list on screen with nothing to show it had gone stale. Config still wins.
    private const string DefaultBaseUrl = "http://65.108.31.172:5000";

    // One instance per tenant, and every one of them is a grocery/mart merchant.
    private const string Category = "Grocery";

    private const string CacheKey = "ecr:plan-catalog:grocery";

    // A price list changes when someone edits it in the Dashboard, which is rare.
    private static readonly TimeSpan CacheFor = TimeSpan.FromMinutes(10);

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<IReadOnlyList<EcrPlanTier>?> GetTiersAsync(CancellationToken ct = default)
    {
        if (cache.TryGetValue<IReadOnlyList<EcrPlanTier>>(CacheKey, out var cached)) return cached;

        var baseUrl = (config["TenantGateway:DashboardApiBaseUrl"] ?? DefaultBaseUrl).TrimEnd('/');
        try
        {
            using var response = await http.GetAsync($"{baseUrl}/api/purchase/plans?category={Category}", ct);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Plan catalog fetch returned {Status}; the Plans page will fall back.", (int)response.StatusCode);
                return null;
            }

            var body = await response.Content.ReadAsStringAsync(ct);
            if (string.IsNullOrWhiteSpace(body)) return null;

            var payload = JsonSerializer.Deserialize<CatalogEnvelope>(body, Json);
            if (payload?.Data is not { Count: > 0 }) return null;

            var tiers = payload.Data
                .Where(p => p.IsActive)
                .OrderBy(p => p.MonthlyPrice)
                .Select(ToTier)
                .ToList();

            // Cached only on success: a failed fetch must be retried on the next page load, not
            // remembered as "there are no plans" for the next ten minutes.
            cache.Set(CacheKey, (IReadOnlyList<EcrPlanTier>)tiers, CacheFor);
            return tiers;
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException)
        {
            logger.LogWarning(ex, "Plan catalog unreachable; the Plans page will fall back.");
            return null;
        }
    }

    private static EcrPlanTier ToTier(CatalogPlan plan)
    {
        // The catalog speaks in compound module slugs ("grocery-purchase-orders-supplier-returns-
        // rts"); every gate here speaks in internal keys ("purchase_orders", "supplier_returns").
        // ParseFeatures already performs exactly that expansion for a provisioned plan, so the tier
        // table and the live plan can never disagree about what a module unlocks.
        var expanded = TenantPlanService.ParseFeatures(
            JsonSerializer.Serialize((plan.Modules ?? [])
                .Where(m => !string.IsNullOrWhiteSpace(m.Key))
                .ToDictionary(m => m.Key!, _ => true)));

        var features = expanded
            .Where(kv => kv.Value && TenantPlanService.InternalFeatureKeys.Contains(kv.Key))
            .Select(kv => kv.Key)
            .Distinct(StringComparer.Ordinal)
            .OrderBy(k => k, StringComparer.Ordinal)
            .ToList();

        // MaxTerminals/MaxUsers arrive as plan-wide numbers and are stored per-branch, matching how
        // the provisioning webhook already reads them (ApplyCommon) — one convention for both paths,
        // so the tier table and the live plan agree.
        var limits = new EcrPlanTierLimits(plan.MaxLocations, plan.MaxTerminals, plan.MaxUsers, plan.MaxProducts);

        // Only modules that actually gate something here are advertised: a module the Dashboard
        // sells but nothing in this app checks would otherwise appear as a promise the tenant
        // could never see the effect of.
        var modules = (plan.Modules ?? [])
            .Where(m => !string.IsNullOrWhiteSpace(m.Key) && !string.IsNullOrWhiteSpace(m.Name))
            .Where(m => TenantPlanService.ParseFeatures(JsonSerializer.Serialize(new Dictionary<string, bool> { [m.Key!] = true }))
                .Any(kv => kv.Value && TenantPlanService.InternalFeatureKeys.Contains(kv.Key)))
            .Select(m => new EcrPlanModule(m.Key!, m.Name!))
            .ToList();

        var addOns = (plan.AddOns ?? [])
            .Select(a => new EcrPlanAddOn(a.Type ?? string.Empty, a.MonthlyPrice, a.YearlyPrice))
            .ToList();

        return new EcrPlanTier(
            plan.Name ?? string.Empty,
            plan.MonthlyPrice,
            plan.YearlyPrice,
            string.IsNullOrWhiteSpace(plan.Currency) ? "SAR" : plan.Currency,
            limits,
            features,
            modules,
            addOns,
            plan.IsPopular);
    }

    private sealed class CatalogEnvelope
    {
        [JsonPropertyName("data")] public List<CatalogPlan>? Data { get; set; }
    }

    private sealed class CatalogPlan
    {
        public string? Name { get; set; }
        public decimal MonthlyPrice { get; set; }
        public decimal YearlyPrice { get; set; }
        public string? Currency { get; set; }
        public int? MaxTerminals { get; set; }
        public int? MaxLocations { get; set; }
        public int? MaxProducts { get; set; }
        public int? MaxUsers { get; set; }
        public bool IsPopular { get; set; }
        public bool IsActive { get; set; }
        public List<CatalogModule>? Modules { get; set; }
        public List<CatalogAddOn>? AddOns { get; set; }
    }

    private sealed class CatalogModule
    {
        public string? Key { get; set; }
        public string? Name { get; set; }
    }

    private sealed class CatalogAddOn
    {
        public string? Type { get; set; }
        public decimal MonthlyPrice { get; set; }
        public decimal YearlyPrice { get; set; }
    }
}
