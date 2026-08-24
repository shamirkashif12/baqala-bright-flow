using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/tenant")]
public class TenantController(
    BaqalaDbContext db,
    ITenantPlanService tenantPlans,
    ITenantGatewayClient tenantGateway,
    IEcrPlanCatalogClient planCatalog,
    IConfiguration config,
    ILogger<TenantController> logger) : ControllerBase
{
    // Manual/local-testing override predating the real Tenant Admin Dashboard contract below —
    // not part of the real integration, kept as a convenience for local curl testing (see the
    // tenant-plan-provisioning memory). The real Dashboard uses Provision/UpdateEntitlements.
    [AllowAnonymous]
    [HttpPost("provision")]
    public async Task<IActionResult> Provision(
        [FromBody] TenantPlanProvisionRequest req,
        [FromHeader(Name = "X-Provision-Secret")] string? secret)
    {
        var expected = config["TenantProvisioning:SharedSecret"];
        if (string.IsNullOrEmpty(expected) || secret != expected)
            return Unauthorized(new { message = "Invalid or missing provisioning secret." });

        var plan = await tenantPlans.ProvisionAsync(req);
        return Ok(ToResponse(plan));
    }

    // ─── Real Tenant Admin Dashboard contract (§5.4-5.7 of their API reference) ────────────────

    // POST /pos/users/provision — first-time business setup. Absolute route (leading "/") so it
    // ignores this controller's "api/tenant" prefix, matching the exact path the Dashboard calls.
    // Verified by X-Signature (RequireGatewaySignatureAttribute), not a bearer token — no
    // authenticated caller exists yet at this point. AllowBootstrap: a never-provisioned instance
    // has no secret to check a signature against yet — this one call is let through unsigned so
    // its body can deliver the per-client secrets this instance uses from then on.
    [AllowAnonymous]
    [RequireGatewaySignature(AllowBootstrap = true)]
    [HttpPost("/pos/users/provision")]
    public async Task<IActionResult> ProvisionFromGateway([FromBody] GatewayProvisionRequest req)
    {
        // Fast path only — genuine idempotency is enforced by each step below being safe to
        // retry on its own (see CreateBootstrapUserIfNeededAsync's email-existence check), so a
        // crash between steps on a first attempt still self-heals on the Dashboard's retry
        // instead of getting stuck skipped forever by this check alone.
        if (await tenantPlans.IsDuplicateEventAsync(req.EventId))
            return Ok(new { message = "Already processed." });

        try
        {
            await CreateBootstrapUserIfNeededAsync(req);
            var plan = await tenantPlans.ApplyProvisionAsync(req);
            await tenantGateway.PostProvisioningStatusAsync(req.EventId, req.EcrId, "Succeeded", null);
            return Ok(ToResponse(plan));
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Provisioning failed for event {EventId} (ecrId {EcrId}).", req.EventId, req.EcrId);
            await tenantGateway.PostProvisioningStatusAsync(req.EventId, req.EcrId, "Failed", ex.Message);
            return StatusCode(500, new { message = "Provisioning failed.", error = ex.Message });
        }
    }

    // POST /pos/entitlements/update — plan/module/limit changes for an already-provisioned
    // business. No user-creation step, so no partial-failure risk — a single atomic apply.
    [AllowAnonymous]
    [RequireGatewaySignature]
    [HttpPost("/pos/entitlements/update")]
    public async Task<IActionResult> UpdateEntitlements([FromBody] GatewayEntitlementsRequest req)
    {
        if (await tenantPlans.IsDuplicateEventAsync(req.EventId))
            return Ok(new { message = "Already processed." });

        var plan = await tenantPlans.ApplyEntitlementsAsync(req);
        return Ok(ToResponse(plan));
    }

    // POST /pos/secrets/rotate — corrects a WebhookSharedSecret/GatewayJwtKey/Issuer/Audience that
    // got locked in wrong by ApplyProvisionAsync's set-once guard (e.g. an early test bootstrap
    // call whose gatewayJwtKey never matched what the Dashboard actually signs launch tokens with).
    // Deliberately NOT AllowBootstrap: RequireGatewaySignature re-checks X-Signature against
    // whatever secret is stored right now, so knowing the CURRENT one is exactly the proof of
    // authority needed to replace it.
    [AllowAnonymous]
    [RequireGatewaySignature]
    [HttpPost("/pos/secrets/rotate")]
    public async Task<IActionResult> RotateSecrets([FromBody] GatewaySecretsRotateRequest req)
    {
        if (await tenantPlans.IsDuplicateEventAsync(req.EventId))
            return Ok(new { message = "Already processed." });

        var plan = await tenantPlans.RotateSecretsAsync(req);
        var rotatedFields = new[]
        {
            req.WebhookSharedSecret is not null ? "WebhookSharedSecret" : null,
            req.GatewayJwtKey is not null ? "GatewayJwtKey" : null,
            req.GatewayJwtIssuer is not null ? "GatewayJwtIssuer" : null,
            req.GatewayJwtAudience is not null ? "GatewayJwtAudience" : null,
        }.Where(f => f is not null);
        logger.LogWarning("Gateway secrets rotated for business {BusinessId} (event {EventId}): {Fields}",
            plan.BusinessId, req.EventId, string.Join(", ", rotatedFields));
        return Ok(ToResponse(plan));
    }

    // Creates the first Branch + Employee + User for a brand-new business. Idempotent on its own
    // (skips entirely if a User with this email already exists) rather than relying solely on
    // eventId bookkeeping — a business that already has its bootstrap user must never get a
    // second one, no matter how the Dashboard's retry/redelivery lines up.
    private async Task CreateBootstrapUserIfNeededAsync(GatewayProvisionRequest req)
    {
        // Production traffic nests these under `operator` (same shape sent to RPOS); the v2 guide's
        // flat top-level fields are kept as a fallback for older callers/local test scripts.
        var email = req.Operator?.Email ?? req.Email;
        var fullName = req.Operator?.FullName ?? req.FullName;
        var temporaryPassword = req.Operator?.TemporaryPassword ?? req.TemporaryPassword;
        var requestedUsername = req.Operator?.Username;

        if (string.IsNullOrWhiteSpace(email)) return;
        if (await db.Users.AnyAsync(u => u.Email == email)) return;

        // Seeded as "Tenant Administrator" but Program.cs's one-time RenameRoles step renames it
        // to "Admin" on every startup (a product-naming decision, not a schema change) — match
        // either name so this doesn't break if that rename step is ever removed/reordered.
        var adminRole = await db.Roles.FirstOrDefaultAsync(r => r.Name == "Admin" || r.Name == "Tenant Administrator")
            ?? throw new InvalidOperationException("Admin/\"Tenant Administrator\" role is not seeded.");

        // Employee.BranchId is required, but no branch exists yet at first-provision time — this
        // app has no other concept of "a business with zero branches," so the bootstrap admin
        // gets one, same as any tenant would create through the UI (counts toward maxBranches,
        // renameable later). Reuse an already-existing branch instead of always minting one: a
        // retry that lands here with a different operator email (payload edits, redelivery
        // quirks) still passes the email check above, and previously went on to mint a second
        // "Main Branch" for a business that was already provisioned — this instance is
        // single-tenant-per-database, so any branch already existing proves bootstrap already
        // happened, regardless of which email did it.
        var branch = await db.Branches.OrderBy(b => b.CreatedAt).FirstOrDefaultAsync();
        if (branch is null)
        {
            var lastBranchCode = await db.Branches
                .Where(b => b.BranchCode != null && b.BranchCode.StartsWith("BR-"))
                .OrderByDescending(b => b.BranchCode)
                .Select(b => b.BranchCode)
                .FirstOrDefaultAsync();
            var nextBranch = lastBranchCode is not null && int.TryParse(lastBranchCode[3..], out var nb) ? nb + 1 : 1;
            branch = new Branch
            {
                Id = Guid.NewGuid(),
                BranchCode = $"BR-{nextBranch:D3}",
                Name = "Main Branch",
                Status = "active",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            };
            db.Branches.Add(branch);
        }

        var lastEmpCode = await db.Employees
            .Where(e => e.EmployeeCode.StartsWith("EMP-"))
            .OrderByDescending(e => e.EmployeeCode)
            .Select(e => e.EmployeeCode)
            .FirstOrDefaultAsync();
        var nextEmp = lastEmpCode is not null && int.TryParse(lastEmpCode[4..], out var ne) ? ne + 1 : 1;
        var employeeCode = $"EMP-{nextEmp:D5}";
        var employee = new Employee
        {
            Id = Guid.NewGuid(),
            EmployeeCode = employeeCode,
            FullName = fullName ?? "Tenant Administrator",
            Email = email,
            // Not carried in the provisioning payload — placeholder, satisfies the required
            // (non-nullable) columns; the admin fills in the real values from their own profile.
            // NationalId has a UNIQUE index (IX_employees_national_id) — a bare "" collided on
            // the second bootstrap employee ever created, so it's tied to the (also-unique)
            // EmployeeCode instead, guaranteeing distinctness across every business.
            Phone = "",
            NationalId = $"PENDING-{employeeCode}",
            BranchId = branch.Id,
            RoleId = adminRole.Id,
            HireDate = DateOnly.FromDateTime(DateTime.UtcNow),
            EmploymentStatus = "active",
        };
        db.Employees.Add(employee);

        var baseUsername = string.IsNullOrWhiteSpace(requestedUsername) ? email.Split('@')[0] : requestedUsername;
        var username = baseUsername;
        var suffix = 1;
        while (await db.Users.AnyAsync(u => u.Username == username))
            username = $"{baseUsername}{suffix++}";

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = email,
            Username = username,
            // Same hashing scheme as AuthController.HashPassword/UsersController.BCryptHash —
            // whatever temporary password the Dashboard issued logs in normally afterward.
            PasswordHash = HashPassword(temporaryPassword ?? Guid.NewGuid().ToString("N")),
            FullName = fullName ?? "Tenant Administrator",
            RoleId = adminRole.Id,
            BranchId = null, // tenant_admin is never branch-scoped, matching every other admin account
            Status = "active",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        db.Users.Add(user);
        employee.UserId = user.Id;

        await db.SaveChangesAsync();
    }

    private static string HashPassword(string plain) =>
        Convert.ToBase64String(System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(plain + "baqala_salt")));

    // Read by the frontend Plans page and by any plan-aware UI — any authenticated user of this
    // instance shares the same enforced plan, so this isn't gated behind a specific permission.
    // The tier table on the Plans page. Served from the Dashboard's own catalog rather than the
    // copy that used to live in the frontend, which quietly went out of date every time someone
    // edited a plan there.
    //
    // `tiers` is null when this server could not reach the Dashboard — which is the normal case
    // here, since it runs as a host process and this host blocks container → host-port routes.
    // `source` then tells the browser where to fetch it and how to translate it, so the page still
    // shows live pricing over a route that is known to work.
    [HttpGet("plan/catalog")]
    public async Task<IActionResult> GetPlanCatalog(CancellationToken ct) =>
        Ok(await planCatalog.GetCatalogAsync(ct));

    [HttpGet("plan")]
    public async Task<IActionResult> GetPlan()
    {
        var plan = await tenantPlans.GetCurrentPlanAsync();
        var branches = await db.Branches.CountAsync();
        var terminals = await db.Terminals.CountAsync();
        var users = await db.Users.CountAsync();
        var products = await db.Products.CountAsync();
        return Ok(new
        {
            plan = ToResponse(plan),
            usage = new { branches, terminals, users, products },
        });
    }

    // Where "Manage Subscription" sends the browser. Hardcoded rather than required config, same
    // reasoning as AuthController.FallbackGatewayJwtKey and the Dashboard's own
    // PosIntegrationFallback: this instance's appsettings.json is gitignored and maintained by
    // hand on each server, so a deploy that forgot the key would silently break the button.
    // Externally reachable address of the Tenant Admin Dashboard — a browser opens this directly,
    // so never a Docker container name. Config still wins when set, for staging/domain moves.
    private const string DashboardBaseUrlFallback = "http://65.108.31.172:6080";

    // The Dashboard's SSO landing route (src/pages/PosSsoCallback.tsx, registered in App.tsx).
    private const string DashboardSsoPath = "/sso/pos";

    // ─── Manage Subscription: outbound SSO handoff (POS → Tenant Admin Dashboard) ─────────────
    //
    // Mirror image of the Dashboard's "Launch ECR" flow (which lands on this app's
    // /gateway-callback + AuthController.GatewayLogin): mints a short-lived token signed with the
    // same bilateral gateway key, for the Dashboard's /sso/pos callback to exchange against
    // POST /api/auth/pos/dashboard-login on the ECR gateway. The token carries the caller's email
    // plus this instance's ecrId/businessId correlation keys; the ECR side re-verifies that the
    // email matches that ECR's provisioned operator, so a token from this instance can only ever
    // open THIS tenant's dashboard session. tenant_admin only — this is the admin identity the
    // Dashboard created during onboarding (same email/password on both systems).
    [HttpPost("dashboard-launch")]
    public async Task<IActionResult> DashboardLaunch()
    {
        if (User.FindFirst("role")?.Value != "tenant_admin")
            return Forbid();

        var plan = await tenantPlans.GetCurrentPlanAsync();
        if (plan.ProvisionedAt is null || plan.EcrId is null || plan.BusinessId is null)
            return Conflict(new { message = "This instance has not been provisioned by the Tenant Admin Dashboard yet." });

        var email = User.FindFirst("email")?.Value;
        if (string.IsNullOrEmpty(email))
            return Unauthorized(new { message = "Session has no email claim." });

        // Same key-resolution order the Dashboard uses when SIGNING launch tokens toward us:
        // per-instance provisioned secret first, pinned vendor key as the interim fallback (see
        // AuthController.FallbackGatewayJwtKey). Signed with raw HMACSHA256 rather than
        // JwtSecurityTokenHandler for the same short-key reason as ShortKeyCryptoProviderFactory.
        var signingKey = plan.GatewayJwtKey ?? AuthController.FallbackGatewayJwtKey;
        var token = MintDashboardSsoToken(signingKey, email, plan.EcrId.Value, plan.BusinessId.Value);

        var dashboardBase = (config["TenantGateway:DashboardBaseUrl"] ?? DashboardBaseUrlFallback).TrimEnd('/');
        var redirectUrl = $"{dashboardBase}{DashboardSsoPath}?token={Uri.EscapeDataString(token)}";

        logger.LogInformation("Dashboard SSO launch minted for {Email} (ecrId {EcrId}, businessId {BusinessId}).",
            email, plan.EcrId, plan.BusinessId);
        return Ok(new { redirectUrl });
    }

    // Hand-rolled HS256 JWT: {header}.{payload}.{hmac}, all base64url. 120s lifetime — the token
    // exists only to survive one cross-tab redirect and one exchange call. "purpose" pins this
    // token to the POS→Dashboard direction so it can never be replayed against this app's own
    // /api/auth/gateway-login (which is the Dashboard→POS direction on the same key).
    private static string MintDashboardSsoToken(string key, string email, int ecrId, int businessId)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var header = Base64Url(System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(new { alg = "HS256", typ = "JWT" }));
        var payload = Base64Url(System.Text.Json.JsonSerializer.SerializeToUtf8Bytes(new
        {
            email,
            ecrId,
            businessId,
            purpose = "dashboard-sso",
            jti = Guid.NewGuid().ToString("N"),
            iat = now,
            exp = now + 120,
        }));
        using var hmac = new System.Security.Cryptography.HMACSHA256(System.Text.Encoding.UTF8.GetBytes(key));
        var signature = Base64Url(hmac.ComputeHash(System.Text.Encoding.UTF8.GetBytes($"{header}.{payload}")));
        return $"{header}.{payload}.{signature}";
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static TenantPlanResponse ToResponse(TenantPlan plan) => new()
    {
        TenantId = plan.TenantId,
        BusinessId = plan.BusinessId,
        EcrId = plan.EcrId,
        SubscriptionId = plan.SubscriptionId,
        PlanId = plan.PlanId,
        PlanName = plan.PlanName,
        EcrType = plan.EcrType,
        Category = plan.Category,
        Limits = new TenantPlanLimits
        {
            MaxBranches = plan.MaxBranches,
            MaxTerminalsPerBranch = plan.MaxTerminalsPerBranch,
            MaxUsersPerBranch = plan.MaxUsersPerBranch,
        },
        MaxProducts = plan.MaxProducts,
        Features = TenantPlanService.ParseFeatures(plan.FeaturesJson),
        Billing = new TenantPlanBilling { Status = plan.BillingStatus, RenewsAt = plan.RenewsAt },
        Provisioned = plan.ProvisionedAt is not null,
    };
}
