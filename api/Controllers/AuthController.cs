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
public class AuthController(BaqalaDbContext db, IConfiguration config, IHostEnvironment env, IAuditService audit) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrWhiteSpace(req.Password))
            return BadRequest(new { message = "Email and password are required." });

        var emailNorm = req.Email.Trim().ToLower();
        var passwordHash = HashPassword(req.Password);

        var user = await db.Users
            .Include(u => u.Role)
            .Include(u => u.Branch)
            .FirstOrDefaultAsync(u => u.Email.ToLower() == emailNorm
                                   && u.PasswordHash == passwordHash
                                   && u.Status == "active");

        if (user is null)
        {
            // Previously never logged at all, so the Audit Trail's "Failed Logins" KPI (and the
            // FRD's "Auditor reviews failed login attempts" scenario) had nothing to show.
            await audit.LogAsync("login_failed", "User", null, null, null, $"{{\"email\":\"{emailNorm}\"}}", "warning");
            return Unauthorized(new { message = "Invalid email or password." });
        }

        user.LastLogin = DateTime.UtcNow;
        user.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var appRole = ToAppRole(user.Role.Name);
        var token = GenerateJwt(user, appRole);

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

    private string GenerateJwt(BaqalaPOS.Api.Models.User user, string appRole)
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

    private static string ToAppRole(string roleName) => roleName switch
    {
        "Tenant Administrator" or "Admin"            => "tenant_admin",
        "Branch Manager"       or "Manager"          => "branch_manager",
        "Cashier"                                    => "cashier",
        "Storekeeper"          or "Inventory Staff"  => "storekeeper",
        "Supervisor"                                 => "supervisor",
        "Finance User"         or "Accountant"       => "finance_user",
        "Marketing User"                             => "marketing_user",
        "Picker"                                     => "picker",
        // Previously collapsed into marketing_user/picker respectively — two
        // real, distinct roles (with their own real permission rows) getting
        // mislabeled as unrelated ones, which silently broke every isManager/
        // role-gated check for them and showed the wrong label throughout the
        // app (an Auditor's own dashboard called them a "Marketing User").
        "Auditor"                                    => "auditor",
        "Warehouse Staff"                             => "warehouse_staff",
        "Warehouse Manager"                          => "warehouse_manager",
        _                                            => roleName.ToLower().Replace(' ', '_')
    };

    private static string HashPassword(string plain) =>
        Convert.ToBase64String(System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(plain + "baqala_salt")));
}

public record LoginRequest(string Email, string Password);
