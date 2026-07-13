using BaqalaPOS.Api.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace BaqalaPOS.Api.Controllers;

// Issues short-lived JWTs for self-checkout kiosk devices. A kiosk never authenticates as a
// human user — it re-pairs with its stored terminal code + pairing secret whenever its token
// expires, so staff only ever type the secret once, during physical setup of the terminal.
[ApiController]
[Route("api/kiosk")]
public class KioskAuthController(BaqalaDbContext db, IConfiguration config, IHostEnvironment env) : ControllerBase
{
    [AllowAnonymous]
    [HttpPost("pair")]
    public async Task<IActionResult> Pair([FromBody] KioskPairRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.TerminalCode) || string.IsNullOrWhiteSpace(req.PairingSecret))
            return BadRequest(new { message = "Terminal code and pairing secret are required." });

        var terminal = await db.Terminals.Include(t => t.Branch)
            .FirstOrDefaultAsync(t => t.TerminalCode == req.TerminalCode.Trim());

        if (terminal is null || terminal.PairingSecretHash is null ||
            terminal.PairingSecretHash != HashSecret(req.PairingSecret) ||
            terminal.Status != "active")
        {
            return Unauthorized(new { message = "Invalid terminal code or pairing secret." });
        }

        var kioskRole = await db.Roles.FirstOrDefaultAsync(r => r.Name == "Self-Checkout Kiosk");
        if (kioskRole is null)
            return StatusCode(500, new { message = "Self-Checkout Kiosk role is not seeded." });

        var token = GenerateJwt(terminal, kioskRole.Id);

        return Ok(new
        {
            token,
            expiresAt = DateTime.UtcNow.AddHours(24),
            branchId = terminal.BranchId.ToString(),
            branchName = terminal.Branch?.Name,
            terminalName = terminal.Name,
        });
    }

    private string GenerateJwt(BaqalaPOS.Api.Models.Terminal terminal, Guid kioskRoleId)
    {
        var jwtConfig = config.GetSection("Jwt");
        var jwtKey = jwtConfig["Key"]
            ?? (env.IsDevelopment()
                ? "dev-only-insecure-fallback-key-do-not-use-in-production-32b"
                : throw new InvalidOperationException("Jwt:Key must be configured outside Development."));
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        // sub is the Terminal's own id, not a User row — PermissionCheck's UserPermission
        // override lookup simply finds no match for it and falls through to the role
        // permission by roleId, which is all a kiosk credential needs.
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, terminal.Id.ToString()),
            new Claim("name", terminal.Name),
            new Claim("role", "kiosk"),
            new Claim("roleId", kioskRoleId.ToString()),
            new Claim("branchId", terminal.BranchId.ToString()),
            new Claim("terminalId", terminal.Id.ToString()),
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

    private static string HashSecret(string plain) =>
        Convert.ToBase64String(System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(plain + "baqala_salt")));
}

public record KioskPairRequest(string TerminalCode, string PairingSecret);
