using System.Text.Json;
using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/payment-integrations")]
public class PaymentIntegrationsController(BaqalaDbContext db, IAuditService audit, IPaymentIntegrationSecrets secrets) : ControllerBase
{
    // Server-side mirror of the frontend's provider catalog (src/lib/payment-integrations.ts) —
    // keeps GET returning one row per known provider even before it's ever been configured, and
    // stops PUT from writing an arbitrary provider key.
    private static readonly string[] KnownProviders =
    [
        "NearPay", "Nami", "MyFatoorah", "ZATCA", "Odoo", "Wafeq", "Wathiq", "Nafath",
        "SmsGateway", "EmailGateway", "CrmBevatel",
    ];

    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : null;

    [HttpGet("{branchId:guid}")]
    public async Task<IActionResult> GetForBranch(Guid branchId)
    {
        var rows = await db.PaymentIntegrations
            .Where(p => p.BranchId == branchId)
            .ToDictionaryAsync(p => p.Provider);

        var result = KnownProviders.Select(provider => ToDto(provider, rows.GetValueOrDefault(provider)));
        return Ok(result);
    }

    [RequirePermission("Settings", PermAction.Edit)]
    [HttpPut("{branchId:guid}/{provider}")]
    public async Task<IActionResult> Upsert(Guid branchId, string provider, [FromBody] PaymentIntegrationSaveRequest request)
    {
        var canonicalProvider = KnownProviders.FirstOrDefault(p => p.Equals(provider, StringComparison.OrdinalIgnoreCase));
        if (canonicalProvider is null)
            return BadRequest(new { message = $"Unknown payment provider '{provider}'." });

        var row = await db.PaymentIntegrations.FirstOrDefaultAsync(p => p.BranchId == branchId && p.Provider == canonicalProvider);
        var existingConfig = ParseConfig(row?.ConfigJson);

        // A masked placeholder ("••••1234") means the caller never touched that field in the
        // setup form — keep whatever raw value is already stored instead of overwriting it with
        // the mask text itself.
        var mergedConfig = new Dictionary<string, string?>(existingConfig);
        foreach (var (key, value) in request.Config)
            mergedConfig[key] = IsMaskedPlaceholder(value) ? existingConfig.GetValueOrDefault(key) : value;
        // Secret fields are encrypted at rest (see PaymentIntegrationSecrets); Protect is a no-op
        // on an already-protected value, so untouched (masked) fields and legacy plaintext rows
        // both end up protected after this save.
        foreach (var key in mergedConfig.Keys.ToList())
            if (secrets.IsSecretField(key)) mergedConfig[key] = secrets.Protect(mergedConfig[key]);

        if (row is null)
        {
            row = new PaymentIntegration { Id = Guid.NewGuid(), BranchId = branchId, Provider = canonicalProvider, CreatedAt = DateTime.UtcNow };
            db.PaymentIntegrations.Add(row);
        }
        row.IsEnabled = request.IsEnabled;
        row.ConfigJson = JsonSerializer.Serialize(mergedConfig);
        row.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync(
            action: request.IsEnabled ? "Payment integration enabled" : "Payment integration updated",
            entityType: "PaymentIntegration",
            entityId: row.Id,
            userId: CallerId(),
            branchId: branchId,
            details: $"Provider:{canonicalProvider} Enabled:{request.IsEnabled}",
            severity: "warning");

        return Ok(ToDto(canonicalProvider, row));
    }

    private static Dictionary<string, string?> ParseConfig(string? json) =>
        json is { Length: > 0 } ? JsonSerializer.Deserialize<Dictionary<string, string?>>(json) ?? [] : [];

    private static bool IsMaskedPlaceholder(string? value) => value != null && value.StartsWith("••••");

    private string? Mask(string key, string? value)
    {
        if (string.IsNullOrEmpty(value) || !secrets.IsSecretField(key)) return value;
        // Decrypt first so the mask shows the real last four characters, never ciphertext.
        var plain = secrets.Unprotect(value);
        if (string.IsNullOrEmpty(plain)) return null;
        return plain.Length <= 4 ? "••••" : $"••••{plain[^4..]}";
    }

    private PaymentIntegrationDto ToDto(string provider, PaymentIntegration? row)
    {
        var config = ParseConfig(row?.ConfigJson);
        var masked = config.ToDictionary(kv => kv.Key, kv => Mask(kv.Key, kv.Value));
        return new PaymentIntegrationDto(provider, row?.IsEnabled ?? false, masked, row?.UpdatedAt);
    }
}

public record PaymentIntegrationSaveRequest(bool IsEnabled, Dictionary<string, string?> Config);
public record PaymentIntegrationDto(string Provider, bool IsEnabled, Dictionary<string, string?> Config, DateTime? UpdatedAt);
