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
        if (string.IsNullOrWhiteSpace(req.Email)) return;
        if (await db.Users.AnyAsync(u => u.Email == req.Email)) return;

        // Seeded as "Tenant Administrator" but Program.cs's one-time RenameRoles step renames it
        // to "Admin" on every startup (a product-naming decision, not a schema change) — match
        // either name so this doesn't break if that rename step is ever removed/reordered.
        var adminRole = await db.Roles.FirstOrDefaultAsync(r => r.Name == "Admin" || r.Name == "Tenant Administrator")
            ?? throw new InvalidOperationException("Admin/\"Tenant Administrator\" role is not seeded.");

        // Employee.BranchId is required, but no branch exists yet at first-provision time — this
        // app has no other concept of "a business with zero branches," so the bootstrap admin
        // gets one, same as any tenant would create through the UI (counts toward maxBranches,
        // renameable later).
        var lastBranchCode = await db.Branches
            .Where(b => b.BranchCode != null && b.BranchCode.StartsWith("BR-"))
            .OrderByDescending(b => b.BranchCode)
            .Select(b => b.BranchCode)
            .FirstOrDefaultAsync();
        var nextBranch = lastBranchCode is not null && int.TryParse(lastBranchCode[3..], out var nb) ? nb + 1 : 1;
        var branch = new Branch
        {
            Id = Guid.NewGuid(),
            BranchCode = $"BR-{nextBranch:D3}",
            Name = "Main Branch",
            Status = "active",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };
        db.Branches.Add(branch);

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
            FullName = req.FullName ?? "Tenant Administrator",
            Email = req.Email,
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

        var baseUsername = req.Email.Split('@')[0];
        var username = baseUsername;
        var suffix = 1;
        while (await db.Users.AnyAsync(u => u.Username == username))
            username = $"{baseUsername}{suffix++}";

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = req.Email,
            Username = username,
            // Same hashing scheme as AuthController.HashPassword/UsersController.BCryptHash —
            // whatever temporary password the Dashboard issued logs in normally afterward.
            PasswordHash = HashPassword(req.TemporaryPassword ?? Guid.NewGuid().ToString("N")),
            FullName = req.FullName ?? "Tenant Administrator",
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
