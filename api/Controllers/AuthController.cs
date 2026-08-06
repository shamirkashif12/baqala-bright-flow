using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController(BaqalaDbContext db, IConfiguration config, IHostEnvironment env, IAuditService audit, ITenantPlanService tenantPlans) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(new { message = "Email and password are required." });

        // The login form's own label promises "Email or phone" — but this only ever matched
        // Email, so anyone signing in with the phone number it advertises (or their username,
        // which the Add User form prominently sets right next to the password) got "Invalid
        // email or password" despite typing the right credentials. Match whichever identifier
        // was actually typed against Email, Username, or Phone.
        var identifierNorm = req.Email.Trim().ToLower();
        var identifierRaw = req.Email.Trim();
        var passwordHash = HashPassword(req.Password);

        var user = await db.Users
            .Include(u => u.Role)
            .Include(u => u.Branch)
            .FirstOrDefaultAsync(u => (u.Email.ToLower() == identifierNorm
                                       || u.Username.ToLower() == identifierNorm
                                       || (u.Phone != null && u.Phone == identifierRaw))
                                   && u.PasswordHash == passwordHash
                                   && u.Status == "active");

        if (user is null)
        {
            // Previously never logged at all, so the Audit Trail's "Failed Logins" KPI (and the
            // FRD's "Auditor reviews failed login attempts" scenario) had nothing to show.
            await audit.LogAsync("login_failed", "User", null, null, null, $"{{\"email\":\"{identifierNorm}\"}}", "warning", module: "Authentication");
            return Unauthorized(new { message = "Invalid email or password." });
        }

        user.LastLogin = DateTime.UtcNow;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var appRole = RoleNormalizer.ToAppRole(user.Role.Name);
        var plan = await tenantPlans.GetCurrentPlanAsync();
        var token = GenerateJwt(user, appRole, plan.PlanId, plan.PlanName);

        // FRD 16.1 "Authentication" category — successful logins were previously invisible to the
        // Employee Activity Report; only the failed-login case above was ever logged.
        await audit.LogAsync("login", "User", user.Id, user.Id, user.BranchId, severity: "info",
            module: "Authentication", employeeId: await ResolveEmployeeIdAsync(user.Id));

        return Ok(new
        {
            token,
            user = new
            {
                id = user.Id.ToString(),
                email = user.Email,
                fullName = user.FullName,
                phone = user.Phone,
                role = appRole,
                branchId = user.BranchId?.ToString(),
                branchName = user.Branch?.Name
            }
        });
    }

    // Token-EXCHANGE, not dual-trust: rather than teaching every endpoint in this app to accept
    // two different JWT issuers, a gateway-issued token (from the Tenant Admin Dashboard's own
    // operator login, carrying subscriptionId/ecrId claims for a "PosOperator") is validated here
    // ONCE against its own separate signing config (TenantGateway:Jwt — distinct from this app's
    // own Jwt:Key so neither issuer's tokens are ever accepted by the other's validation), then
    // exchanged for this app's own local JWT via the same GenerateJwt every normal login uses.
    // From that point on the session behaves exactly like a local login.
    //
    // NOTE: the real signing key/issuer/audience come from TenantPlan (set by this instance's
    // very first /pos/users/provision call — see RequireGatewaySignatureAttribute's bootstrap
    // path and TenantPlanService.ApplyProvisionAsync), not appsettings.json. Config values remain
    // a fallback for local/dev testing only, matching the same convention as the webhook secret.
    [AllowAnonymous]
    [HttpPost("gateway-login")]
    public async Task<IActionResult> GatewayLogin([FromBody] GatewayLoginRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.GatewayAccessToken))
            return BadRequest(new { message = "gatewayAccessToken is required." });

        var plan = await tenantPlans.GetCurrentPlanAsync();
        var gwConfig = config.GetSection("TenantGateway:Jwt");
        var gwKey = !string.IsNullOrWhiteSpace(plan.GatewayJwtKey) ? plan.GatewayJwtKey : gwConfig["Key"];
        var gwIssuer = !string.IsNullOrWhiteSpace(plan.GatewayJwtIssuer) ? plan.GatewayJwtIssuer : gwConfig["Issuer"];
        var gwAudience = !string.IsNullOrWhiteSpace(plan.GatewayJwtAudience) ? plan.GatewayJwtAudience : gwConfig["Audience"];
        if (string.IsNullOrEmpty(gwKey))
            return StatusCode(501, new { message = "Gateway SSO is not configured on this instance yet." });

        // Microsoft.IdentityModel.Tokens rejects HS256 keys under 256 bits by default, even for
        // validation (not just signing) — silently folded into the same generic "signature
        // validation failed" exception as an actual mismatch, so a too-short key and a wrong key
        // are indistinguishable from the error alone. The Dashboard's vendor-confirmed key for
        // this ECR is genuinely short (136 bits) — same reason their minting side had to hand-roll
        // raw HMACSHA256 instead of JwtSecurityTokenHandler.CreateToken. ShortKeyCryptoProviderFactory
        // is the validation-side equivalent of that same workaround, not a security loosening: HS256
        // security depends on the key being unguessable, not on it padding out to 32 bytes.
        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(gwKey))
        {
            CryptoProviderFactory = new ShortKeyCryptoProviderFactory(),
        };

        ClaimsPrincipal principal;
        try
        {
            principal = new JwtSecurityTokenHandler().ValidateToken(req.GatewayAccessToken, new TokenValidationParameters
            {
                ValidateIssuer = !string.IsNullOrEmpty(gwIssuer),
                ValidIssuer = gwIssuer,
                ValidateAudience = !string.IsNullOrEmpty(gwAudience),
                ValidAudience = gwAudience,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = signingKey,
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromMinutes(2),
            }, out _);
        }
        catch (Exception ex)
        {
            return Unauthorized(new { message = "Invalid or expired gateway token.", error = ex.Message });
        }

        var email = principal.FindFirst(JwtRegisteredClaimNames.Email)?.Value ?? principal.FindFirst(ClaimTypes.Email)?.Value;
        if (string.IsNullOrEmpty(email))
            return Unauthorized(new { message = "Gateway token has no email claim." });

        var user = await db.Users.Include(u => u.Role).Include(u => u.Branch)
            .FirstOrDefaultAsync(u => u.Email.ToLower() == email.ToLower() && u.Status == "active");
        if (user is null)
            return NotFound(new { message = "No local account for this operator yet — provisioning may not have completed." });

        user.LastLogin = DateTime.UtcNow;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var appRole = RoleNormalizer.ToAppRole(user.Role.Name);
        var token = GenerateJwt(user, appRole, plan.PlanId, plan.PlanName);

        await audit.LogAsync("login", "User", user.Id, user.Id, user.BranchId, severity: "info",
            module: "Authentication", employeeId: await ResolveEmployeeIdAsync(user.Id));

        return Ok(new
        {
            token,
            user = new
            {
                id = user.Id.ToString(),
                email = user.Email,
                fullName = user.FullName,
                phone = user.Phone,
                role = appRole,
                branchId = user.BranchId?.ToString(),
                branchName = user.Branch?.Name,
            },
        });
    }

    // FRD 16.1 "Authentication" category — logout, since JWT auth is stateless server-side,
    // has no natural server touchpoint unless the frontend explicitly calls one before clearing
    // its local session.
    [Authorize]
    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        var userId = Guid.TryParse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var uid) ? uid : (Guid?)null;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        await audit.LogAsync("logout", "User", userId, userId, branchId, severity: "info",
            module: "Authentication", employeeId: await ResolveEmployeeIdAsync(userId));
        return NoContent();
    }

    private async Task<Guid?> ResolveEmployeeIdAsync(Guid? userId) =>
        userId.HasValue ? (await db.Employees.Where(e => e.UserId == userId).Select(e => (Guid?)e.Id).FirstOrDefaultAsync()) : null;

    private string GenerateJwt(BaqalaPOS.Api.Models.User user, string appRole, string? planId, string? planTier)
    {
        var jwtConfig = config.GetSection("Jwt");
        var jwtKey = jwtConfig["Key"]
            ?? (env.IsDevelopment()
                ? "dev-only-insecure-fallback-key-do-not-use-in-production-32b"
                : throw new InvalidOperationException("Jwt:Key must be configured outside Development."));
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim("name", user.FullName),
            new Claim("role", appRole),
            new Claim("roleId", user.RoleId.ToString()),
            new Claim("branchId", user.BranchId?.ToString() ?? ""),
            new Claim("branchName", user.Branch?.Name ?? ""),
            new Claim("planId", planId ?? ""),
            new Claim("planTier", planTier ?? ""),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };

        var token = new JwtSecurityToken(
            issuer: jwtConfig["Issuer"],
            audience: jwtConfig["Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddHours(24),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private static string HashPassword(string plain) =>
        Convert.ToBase64String(System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(plain + "baqala_salt")));
}

public record LoginRequest(string Email, string Password);
public record GatewayLoginRequest(string GatewayAccessToken);

// Microsoft.IdentityModel.Tokens hard-enforces a >= 256-bit HMAC key size even for verifying (not
// just signing) — see AuthController.GatewayLogin's comment. Setting SymmetricSignatureProvider's
// MinimumSymmetricKeySizeInBits property does NOT bypass this: the actual check lives in
// CryptoProviderFactory.CreateKeyedHashAlgorithm (called lazily from Verify, not from
// CreateForVerifying), which is not virtual and ignores that property entirely — confirmed by
// direct test against this exact package version. The only way around it is to skip the library's
// pooled HMAC allocator altogether and do the HMAC ourselves, mirroring the raw-HMACSHA256
// workaround the Dashboard's minting side already uses for the same short-key reason.
public class ShortKeyCryptoProviderFactory : CryptoProviderFactory
{
    public override SignatureProvider CreateForVerifying(SecurityKey key, string algorithm) =>
        new RawHmacSha256SignatureProvider(key, algorithm);

    public override SignatureProvider CreateForSigning(SecurityKey key, string algorithm) =>
        new RawHmacSha256SignatureProvider(key, algorithm);
}

public sealed class RawHmacSha256SignatureProvider(SecurityKey key, string algorithm) : SignatureProvider(key, algorithm)
{
    private readonly byte[] _keyBytes = ((SymmetricSecurityKey)key).Key;

    public override byte[] Sign(byte[] input)
    {
        using var hmac = new System.Security.Cryptography.HMACSHA256(_keyBytes);
        return hmac.ComputeHash(input);
    }

    public override bool Verify(byte[] input, byte[] signature) =>
        System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(Sign(input), signature);

    protected override void Dispose(bool disposing) { }
}
