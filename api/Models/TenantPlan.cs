using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

// This app is deployed one instance per tenant (one MySQL database per client install) — the
// whole instance IS the tenant, so there is no TenantId column/isolation to model here, just a
// single local row describing whichever subscription plan the external Tenant Admin Dashboard
// last pushed in. Singleton row, fixed PK, seeded by migration — same shape as CompanyProfile/
// ZatcaIdentity in Compliance.cs. Written by TenantController.Provision, read by
// TenantPlanService for every branch/terminal/user creation limit check.
[Table("tenant_plan")]
public class TenantPlan
{
    public static readonly Guid SingletonId = Guid.Parse("00000000-0000-0000-0000-000000000003");

    [Key, Column("id")]
    public Guid Id { get; set; } = SingletonId;

    [MaxLength(100), Column("tenant_id")]
    public string? TenantId { get; set; }

    // Real Tenant Admin Dashboard identifiers (integers on their side — see
    // TenantController's /pos/users/provision and /pos/entitlements/update) — TenantId above
    // stays as a display label, these are the actual correlation keys.
    [Column("business_id")]
    public int? BusinessId { get; set; }

    [Column("ecr_id")]
    public int? EcrId { get; set; }

    [Column("subscription_id")]
    public int? SubscriptionId { get; set; }

    [MaxLength(100), Column("plan_id")]
    public string? PlanId { get; set; }

    [MaxLength(100), Column("plan_name")]
    public string? PlanName { get; set; }

    [MaxLength(50), Column("ecr_type")]
    public string EcrType { get; set; } = "mart";

    // Business category from the Dashboard's plan catalog (e.g. "Grocery") — distinct from
    // EcrType above, which is this app's own product-line label.
    [MaxLength(100), Column("category")]
    public string? Category { get; set; }

    // Null means "no cap on this dimension" — true both before a plan is ever provisioned and
    // for an unlimited tier (e.g. Enterprise), so every enforcement check fails open on null.
    [Column("max_branches")]
    public int? MaxBranches { get; set; }

    [Column("max_terminals_per_branch")]
    public int? MaxTerminalsPerBranch { get; set; }

    [Column("max_users_per_branch")]
    public int? MaxUsersPerBranch { get; set; }

    // New in the real contract, not previously enforced anywhere in this app.
    [Column("max_products")]
    public int? MaxProducts { get; set; }

    // Serialized Dictionary<string,bool> — the feature-toggle set is whatever the Tenant
    // Dashboard sends, not a fixed schema here (see TenantPlanService.IsFeatureEnabledAsync).
    [Column("features_json")]
    public string FeaturesJson { get; set; } = "{}";

    [MaxLength(50), Column("billing_status")]
    public string BillingStatus { get; set; } = "active";

    [Column("renews_at")]
    public DateTime? RenewsAt { get; set; }

    // Null until the first successful Provision call — distinguishes "never provisioned" (every
    // limit check fails open regardless of Max* values) from "provisioned with no caps set".
    [Column("provisioned_at")]
    public DateTime? ProvisionedAt { get; set; }

    // Most recently processed inbound eventId (from /pos/users/provision or
    // /pos/entitlements/update) — the Dashboard retries on anything but a definitive 2xx/4xx, so
    // a repeat delivery of the same event must be a no-op, not a duplicate bootstrap user.
    [MaxLength(100), Column("last_event_id")]
    public string? LastEventId { get; set; }

    // Per-instance secrets, established by the Dashboard's very first /pos/users/provision call
    // rather than a pre-shared appsettings.json value — see RequireGatewaySignatureAttribute's
    // bootstrap path. Null until that first call; once set, every subsequent gateway-signed
    // request or gateway-login token exchange is checked against these, never appsettings.json,
    // for this specific instance. Config values remain a fallback for local/dev testing only.
    [MaxLength(200), Column("webhook_shared_secret")]
    public string? WebhookSharedSecret { get; set; }

    [MaxLength(200), Column("gateway_jwt_key")]
    public string? GatewayJwtKey { get; set; }

    [MaxLength(200), Column("gateway_jwt_issuer")]
    public string? GatewayJwtIssuer { get; set; }

    [MaxLength(200), Column("gateway_jwt_audience")]
    public string? GatewayJwtAudience { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
