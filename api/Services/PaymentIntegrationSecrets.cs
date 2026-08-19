using Microsoft.AspNetCore.DataProtection;

namespace BaqalaPOS.Api.Services;

/// Encrypts the secret fields of a payment provider's per-branch config (Admin → Payments —
/// MyFatoorah API token, NearPay keys, ...) at rest, with the same DataProtection key ring ZATCA's
/// private key/CSIDs use (persisted to the database, so it survives redeploys). Before this the
/// tokens sat in plain text in payment_integrations.config_json — masked in API responses, but
/// readable by anyone with a database dump.
///
/// Values are stored as "enc:v1:<protected payload>"; anything without that prefix is treated as
/// legacy plaintext and still read correctly, and gets encrypted the next time the row is saved
/// (PaymentIntegrationsController.Upsert re-protects every secret field on write). Which fields
/// are secret is decided by name (key/secret/token/password), matching the masking rule the
/// controller already applied.
public interface IPaymentIntegrationSecrets
{
    bool IsSecretField(string key);
    string? Protect(string? plaintext);
    string? Unprotect(string? stored);
}

public class PaymentIntegrationSecrets(IDataProtectionProvider provider, ILogger<PaymentIntegrationSecrets> logger) : IPaymentIntegrationSecrets
{
    private const string Prefix = "enc:v1:";
    private readonly IDataProtector _protector = provider.CreateProtector("BaqalaPOS.PaymentIntegrations.Secrets.v1");

    public bool IsSecretField(string key) =>
        key.Contains("key", StringComparison.OrdinalIgnoreCase) ||
        key.Contains("secret", StringComparison.OrdinalIgnoreCase) ||
        key.Contains("token", StringComparison.OrdinalIgnoreCase) ||
        key.Contains("password", StringComparison.OrdinalIgnoreCase);

    public string? Protect(string? plaintext)
    {
        if (string.IsNullOrEmpty(plaintext)) return plaintext;
        if (plaintext.StartsWith(Prefix, StringComparison.Ordinal)) return plaintext; // already protected
        return Prefix + _protector.Protect(plaintext);
    }

    public string? Unprotect(string? stored)
    {
        if (string.IsNullOrEmpty(stored) || !stored.StartsWith(Prefix, StringComparison.Ordinal)) return stored;
        try
        {
            return _protector.Unprotect(stored[Prefix.Length..]);
        }
        catch (System.Security.Cryptography.CryptographicException ex)
        {
            // Key ring lost/rotated away — the value is unrecoverable; treat as unset so the
            // admin sees an empty token and re-enters it, rather than sending garbage upstream.
            logger.LogError(ex, "Payment integration secret could not be decrypted — the DataProtection key ring may have changed. Re-enter the credential in Admin → Payments.");
            return null;
        }
    }
}
