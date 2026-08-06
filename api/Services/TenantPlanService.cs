using System.Text.Json;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

// The plan config an external Tenant Admin Dashboard pushes into this instance when a client
// launches this ECR after picking a subscription (see TenantController). This app is deployed
// one instance per tenant, so there is exactly one TenantPlan row (TenantPlan.SingletonId,
// seeded by the AddTenantPlan migration) — no tenant-scoped isolation is needed, the whole
// instance IS the tenant. Count-limit checks fail open (return true / unlimited) when a limit is
// null, which covers both "no plan provisioned yet" and "provisioned plan has no cap on this
// dimension" (e.g. an Enterprise-tier plan). Feature-flag checks (IsFeatureEnabledAsync) fail
// open only when NEVER provisioned — once a real plan exists, it's an allow-list (see below).
public interface ITenantPlanService
{
    Task<TenantPlan> GetCurrentPlanAsync(CancellationToken ct = default);

    // Manual/local-testing override — the internal shared-secret-guarded endpoint predating the
    // real Dashboard contract. Kept for convenience; not part of the real integration.
    Task<TenantPlan> ProvisionAsync(TenantPlanProvisionRequest req, CancellationToken ct = default);

    // Real Dashboard contract — POST /pos/users/provision, /pos/entitlements/update, /pos/secrets/rotate.
    Task<bool> IsDuplicateEventAsync(string eventId, CancellationToken ct = default);
    Task<TenantPlan> ApplyProvisionAsync(GatewayProvisionRequest req, CancellationToken ct = default);
    Task<TenantPlan> ApplyEntitlementsAsync(GatewayEntitlementsRequest req, CancellationToken ct = default);
    Task<TenantPlan> RotateSecretsAsync(GatewaySecretsRotateRequest req, CancellationToken ct = default);

    Task<bool> CanCreateBranchAsync(CancellationToken ct = default);
    Task<bool> CanCreateTerminalAsync(Guid branchId, CancellationToken ct = default);
    Task<bool> CanCreateUserAsync(Guid? branchId, CancellationToken ct = default);
    Task<bool> CanCreateProductAsync(CancellationToken ct = default);
    Task<bool> IsFeatureEnabledAsync(string key, CancellationToken ct = default);
}

public class TenantPlanService(BaqalaDbContext db) : ITenantPlanService
{
    public Task<TenantPlan> GetCurrentPlanAsync(CancellationToken ct = default) =>
        db.TenantPlans.FirstAsync(p => p.Id == TenantPlan.SingletonId, ct);

    public async Task<TenantPlan> ProvisionAsync(TenantPlanProvisionRequest req, CancellationToken ct = default)
    {
        var plan = await GetCurrentPlanAsync(ct);
        plan.TenantId = req.TenantId;
        plan.PlanId = req.PlanId;
        plan.PlanName = req.PlanName;
        plan.EcrType = string.IsNullOrWhiteSpace(req.EcrType) ? "mart" : req.EcrType;
        plan.MaxBranches = req.Limits?.MaxBranches;
        plan.MaxTerminalsPerBranch = req.Limits?.MaxTerminalsPerBranch;
        plan.MaxUsersPerBranch = req.Limits?.MaxUsersPerBranch;
        plan.FeaturesJson = JsonSerializer.Serialize(req.Features ?? new Dictionary<string, bool>());
        plan.BillingStatus = string.IsNullOrWhiteSpace(req.Billing?.Status) ? "active" : req.Billing!.Status!;
        plan.RenewsAt = req.Billing?.RenewsAt;
        plan.ProvisionedAt = DateTime.UtcNow;
        plan.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return plan;
    }

    public async Task<bool> IsDuplicateEventAsync(string eventId, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(eventId)) return false;
        var plan = await GetCurrentPlanAsync(ct);
        return plan.LastEventId == eventId;
    }

    public async Task<TenantPlan> ApplyProvisionAsync(GatewayProvisionRequest req, CancellationToken ct = default)
    {
        var plan = await GetCurrentPlanAsync(ct);
        plan.BusinessId = req.BusinessId;
        plan.EcrId = req.EcrId;
        plan.SubscriptionId = req.SubscriptionId;
        ApplyCommon(plan, req.PlanName, req.Category, req.EnabledModules, req.Limits, status: "active");
        // Only ever set from empty — a value already stored here (from a genuine first call)
        // must never be silently replaced by whatever a later/retried payload happens to carry.
        if (string.IsNullOrWhiteSpace(plan.WebhookSharedSecret) && !string.IsNullOrWhiteSpace(req.WebhookSharedSecret))
            plan.WebhookSharedSecret = req.WebhookSharedSecret;
        // TEMPORARY, testing only: set-once guard disabled while multiple test businesses share
        // this one staging instance — each provision call's gatewayJwtKey was getting locked in by
        // whichever business provisioned first, so every later business's real key was silently
        // dropped and its gateway-login always failed with a signature mismatch. Restore the guard
        // (`if (string.IsNullOrWhiteSpace(plan.GatewayJwtKey) && ...)`) once each client gets their
        // own dedicated instance again, matching the documented v2 contract.
        if (!string.IsNullOrWhiteSpace(req.GatewayJwtKey))
            plan.GatewayJwtKey = req.GatewayJwtKey;
        if (string.IsNullOrWhiteSpace(plan.GatewayJwtIssuer) && !string.IsNullOrWhiteSpace(req.GatewayJwtIssuer))
            plan.GatewayJwtIssuer = req.GatewayJwtIssuer;
        if (string.IsNullOrWhiteSpace(plan.GatewayJwtAudience) && !string.IsNullOrWhiteSpace(req.GatewayJwtAudience))
            plan.GatewayJwtAudience = req.GatewayJwtAudience;
        plan.LastEventId = req.EventId;
        plan.ProvisionedAt = DateTime.UtcNow;
        plan.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return plan;
    }

    public async Task<TenantPlan> ApplyEntitlementsAsync(GatewayEntitlementsRequest req, CancellationToken ct = default)
    {
        var plan = await GetCurrentPlanAsync(ct);
        plan.SubscriptionId = req.SubscriptionId;
        ApplyCommon(plan, req.PlanName, req.Category, req.EnabledModules, req.Limits, req.Status);
        plan.LastEventId = req.EventId;
        // A real entitlements-update event proves this business is an active, existing client —
        // e.g. this instance's tenant never went through /pos/users/provision (seeded with plan
        // data directly instead) and would otherwise stay "provisioned: false" forever, which
        // makes the frontend ignore every field this method just set (see resolvePlans in
        // src/routes/_app.plans.tsx) and silently fall back to a hardcoded default plan.
        plan.ProvisionedAt ??= DateTime.UtcNow;
        plan.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return plan;
    }

    // POST /pos/secrets/rotate — corrects a WebhookSharedSecret/GatewayJwtKey/Issuer/Audience that
    // got locked in wrong by ApplyProvisionAsync's set-once guard (e.g. an early test bootstrap
    // call). Unlike that guard, this overwrites unconditionally — RequireGatewaySignature already
    // required the caller to sign this request with the CURRENT secret, so knowing it is the proof
    // of authority to replace it. Only fields present in the request are touched.
    public async Task<TenantPlan> RotateSecretsAsync(GatewaySecretsRotateRequest req, CancellationToken ct = default)
    {
        var plan = await GetCurrentPlanAsync(ct);
        if (!string.IsNullOrWhiteSpace(req.WebhookSharedSecret)) plan.WebhookSharedSecret = req.WebhookSharedSecret;
        if (!string.IsNullOrWhiteSpace(req.GatewayJwtKey)) plan.GatewayJwtKey = req.GatewayJwtKey;
        if (!string.IsNullOrWhiteSpace(req.GatewayJwtIssuer)) plan.GatewayJwtIssuer = req.GatewayJwtIssuer;
        if (!string.IsNullOrWhiteSpace(req.GatewayJwtAudience)) plan.GatewayJwtAudience = req.GatewayJwtAudience;
        plan.LastEventId = req.EventId;
        plan.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        return plan;
    }

    // Shared by both real-contract endpoints. Limits are mapped straight across from the
    // Dashboard's tenant-wide totals onto this app's pre-existing per-branch enforcement columns
    // — a documented approximation (see the tenant-plan-provisioning memory / plan notes), not a
    // derived formula, per an explicit call to keep the existing enforcement model unchanged.
    private static void ApplyCommon(TenantPlan plan, string? planName, string? category,
        List<GatewayModule>? modules, GatewayLimits? limits, string? status)
    {
        if (!string.IsNullOrWhiteSpace(planName)) plan.PlanName = planName;
        if (!string.IsNullOrWhiteSpace(category)) plan.Category = category;
        plan.MaxBranches = limits?.MaxBranches;
        plan.MaxTerminalsPerBranch = limits?.MaxTerminals;
        plan.MaxUsersPerBranch = limits?.MaxUsers;
        plan.MaxProducts = limits?.MaxProducts;
        // enabledModules is an ALLOW-LIST (only what's listed is on) — every listed key maps to
        // true; nothing here ever writes a false entry, matching IsFeatureEnabledAsync's allow-
        // list read below.
        plan.FeaturesJson = JsonSerializer.Serialize(
            (modules ?? []).Where(m => !string.IsNullOrWhiteSpace(m.Key)).ToDictionary(m => m.Key, _ => true));
        if (!string.IsNullOrWhiteSpace(status)) plan.BillingStatus = status;
    }

    public async Task<bool> CanCreateBranchAsync(CancellationToken ct = default)
    {
        var plan = await GetCurrentPlanAsync(ct);
        if (plan.MaxBranches is not { } max) return true;
        return await db.Branches.CountAsync(ct) < max;
    }

    public async Task<bool> CanCreateTerminalAsync(Guid branchId, CancellationToken ct = default)
    {
        var plan = await GetCurrentPlanAsync(ct);
        if (plan.MaxTerminalsPerBranch is not { } max) return true;
        return await db.Terminals.CountAsync(t => t.BranchId == branchId, ct) < max;
    }

    public async Task<bool> CanCreateUserAsync(Guid? branchId, CancellationToken ct = default)
    {
        // Not branch-scoped (e.g. a tenant_admin account) — no per-branch cap applies.
        if (branchId is not { } bid) return true;
        var plan = await GetCurrentPlanAsync(ct);
        if (plan.MaxUsersPerBranch is not { } max) return true;
        return await db.Users.CountAsync(u => u.BranchId == bid, ct) < max;
    }

    public async Task<bool> CanCreateProductAsync(CancellationToken ct = default)
    {
        var plan = await GetCurrentPlanAsync(ct);
        if (plan.MaxProducts is not { } max) return true;
        return await db.Products.CountAsync(ct) < max;
    }

    public async Task<bool> IsFeatureEnabledAsync(string key, CancellationToken ct = default)
    {
        var plan = await GetCurrentPlanAsync(ct);
        // Never provisioned at all — fail open (dev/test convenience, unchanged).
        if (plan.ProvisionedAt is null) return true;
        // Once a real plan exists, FeaturesJson is an ALLOW-LIST (mirrors enabledModules) — a key
        // absent means disabled. This is the opposite of the pre-real-integration default, and
        // fixes a real footgun: a partial entitlements payload that omits a key now correctly
        // leaves it off, instead of silently turning it on.
        var features = ParseFeatures(plan.FeaturesJson);
        return features.TryGetValue(key, out var enabled) && enabled;
    }

    // A blank FeaturesJson (the seeded/unprovisioned state) means "no features set" — same as
    // "{}" — see the seed comment in BaqalaDbContext.OnModelCreating for why it's seeded blank.
    internal static Dictionary<string, bool> ParseFeatures(string featuresJson) =>
        string.IsNullOrWhiteSpace(featuresJson)
            ? new()
            : JsonSerializer.Deserialize<Dictionary<string, bool>>(featuresJson) ?? new();
}

public class TenantPlanProvisionRequest
{
    public string? TenantId { get; set; }
    public string? PlanId { get; set; }
    public string? PlanName { get; set; }
    public string? EcrType { get; set; }
    public TenantPlanLimits? Limits { get; set; }
    public Dictionary<string, bool>? Features { get; set; }
    public TenantPlanBilling? Billing { get; set; }
}

public class TenantPlanLimits
{
    public int? MaxBranches { get; set; }
    public int? MaxTerminalsPerBranch { get; set; }
    public int? MaxUsersPerBranch { get; set; }
}

public class TenantPlanBilling
{
    public string? Status { get; set; }
    public DateTime? RenewsAt { get; set; }
}

public class TenantPlanResponse
{
    public string? TenantId { get; set; }
    public int? BusinessId { get; set; }
    public int? EcrId { get; set; }
    public int? SubscriptionId { get; set; }
    public string? PlanId { get; set; }
    public string? PlanName { get; set; }
    public string? EcrType { get; set; }
    public string? Category { get; set; }
    public TenantPlanLimits Limits { get; set; } = new();
    public int? MaxProducts { get; set; }
    public Dictionary<string, bool> Features { get; set; } = new();
    public TenantPlanBilling Billing { get; set; } = new();
    public bool Provisioned { get; set; }
}

// ─── Real Tenant Admin Dashboard contract DTOs (§5.4-5.6 of their API reference) ──────────────

public class GatewayModule
{
    public string Key { get; set; } = "";
    public string? Name { get; set; }
    public string? Category { get; set; }
}

// The operator/login block as actually sent in production — nested, not flat. Role/RoleFallback
// arrive as "SuperAdmin"/"Admin" but aren't read yet: this app has one bootstrap-admin role
// (Program.cs's RenameRoles renames the seeded "Tenant Administrator" to "Admin"), so every
// bootstrap operator gets that role regardless of what's sent here.
public class GatewayOperator
{
    public string? FullName { get; set; }
    public string? Email { get; set; }
    public string? Username { get; set; }
    public string? TemporaryPassword { get; set; }
    public string? Role { get; set; }
    public string? RoleFallback { get; set; }
}

public class GatewayLimits
{
    public int? MaxBranches { get; set; }
    public int? MaxUsers { get; set; }
    public int? MaxTerminals { get; set; }
    public int? MaxProducts { get; set; }
}

// POST /pos/users/provision — first-time business setup, also carries the first operator's login.
public class GatewayProvisionRequest
{
    public string EventId { get; set; } = "";
    public int BusinessId { get; set; }
    public int EcrId { get; set; }
    public int SubscriptionId { get; set; }
    public string? PlanName { get; set; }
    public string? Category { get; set; }
    // Legacy flat shape (per the v2 integration guide). The Dashboard's actual traffic nests these
    // under `operator` instead (same shape it sends RPOS) — Operator below is populated for that
    // case; TenantController resolves Operator first, falling back to these so neither shape 404s.
    public string? FullName { get; set; }
    public string? Email { get; set; }
    public string? TemporaryPassword { get; set; }
    public GatewayOperator? Operator { get; set; }
    public List<GatewayModule>? EnabledModules { get; set; }
    public GatewayLimits? Limits { get; set; }
    public DateTime? Timestamp { get; set; }

    // Present only on a fresh, never-provisioned instance's very first call — see
    // RequireGatewaySignatureAttribute's bootstrap path. This instance has no pre-shared secret
    // yet, so the Dashboard hands over the ones it generated for this specific client right here,
    // instead of a human ever typing them into appsettings.json. Ignored (never overwrites an
    // already-set value) on any call after the first.
    public string? WebhookSharedSecret { get; set; }
    public string? GatewayJwtKey { get; set; }
    public string? GatewayJwtIssuer { get; set; }
    public string? GatewayJwtAudience { get; set; }
}

// POST /pos/entitlements/update — plan/module/limit changes for an already-provisioned business.
public class GatewayEntitlementsRequest
{
    public string EventId { get; set; } = "";
    public int SubscriptionId { get; set; }
    public string? PlanName { get; set; }
    public string? Category { get; set; }
    public string? Status { get; set; }
    public List<GatewayModule>? EnabledModules { get; set; }
    public GatewayLimits? Limits { get; set; }
    public DateTime? Timestamp { get; set; }
}

// POST /pos/secrets/rotate — corrects a per-client secret after the first bootstrap call locked in
// a wrong value. Only non-null fields are applied; omit whichever secrets don't need rotating.
public class GatewaySecretsRotateRequest
{
    public string EventId { get; set; } = "";
    public string? WebhookSharedSecret { get; set; }
    public string? GatewayJwtKey { get; set; }
    public string? GatewayJwtIssuer { get; set; }
    public string? GatewayJwtAudience { get; set; }
}
