using System.Text;
using System.Text.Json;

namespace BaqalaPOS.Api.Services;

public record MyFatoorahInvoice(long InvoiceId, string InvoiceUrl);

/// InvoiceValue is in the MyFatoorah ACCOUNT's base currency, not the invoice's display currency
/// (a KWD-based account raising a "37.200 SR" invoice reports InvoiceValue 3.012) — so it is not
/// safe to compare against a SAR order total. CustomerReference is whatever SendPaymentAsync
/// stamped on the invoice, echoed back verbatim; that's what PlacePublicOrder verifies against.
/// PaymentId is MyFatoorah's id of the successful transaction (null until paid) — the number on
/// their settlement report and the key a refund can target.
public record MyFatoorahInvoiceStatus(
    string Status, decimal InvoiceValue, string? CustomerReference, string? InvoiceDisplayValue, string? PaymentId, string? AccountCurrency);

/// Result of MakeRefund. Amount is what MyFatoorah accepted, in the ACCOUNT's currency.
public record MyFatoorahRefund(long RefundId, string? RefundReference, decimal Amount);

/// What this app stamps into MyFatoorah's CustomerReference when raising an invoice for an online
/// order, and reads back from GetPaymentStatus to verify the payment before creating the order —
/// currency-independent proof that THIS branch raised THIS invoice for THIS SAR total, which
/// InvoiceValue can't give (see MyFatoorahInvoiceStatus). Format: "mart:{branchId:N}:{amount:F2}".
public sealed record MyFatoorahOrderReference(Guid BranchId, decimal AmountSar)
{
    private const string Prefix = "mart:";

    public override string ToString() =>
        $"{Prefix}{BranchId:N}:{AmountSar.ToString("F2", System.Globalization.CultureInfo.InvariantCulture)}";

    public static MyFatoorahOrderReference? Parse(string? reference)
    {
        if (reference is null || !reference.StartsWith(Prefix, StringComparison.Ordinal)) return null;
        var parts = reference[Prefix.Length..].Split(':');
        if (parts.Length != 2 ||
            !Guid.TryParseExact(parts[0], "N", out var branchId) ||
            !decimal.TryParse(parts[1], System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var amount))
            return null;
        return new MyFatoorahOrderReference(branchId, amount);
    }
}

/// A branch's own MyFatoorah account, as saved from Admin → Payments → MyFatoorah (the
/// PaymentIntegration row's ConfigJson: "apiKey" + "environment", see the MyFatoorah entry in
/// src/lib/payment-integrations.ts — the two key names must stay in sync). Forwarded to the
/// middleware's MyFatoorah service on every call so each store can use its own MyFatoorah
/// account rather than one shared token seeded in the middleware's DB.
public sealed record MyFatoorahMerchantAccount(string ApiToken, bool IsLive)
{
    /// Parses the saved ConfigJson. Returns null when no usable token is stored — the client then
    /// sends no override headers and the middleware falls back to its own shared credentials,
    /// which is what pre-existing rows saved before this field mattered get. `unprotect` decrypts
    /// the at-rest-encrypted token (IPaymentIntegrationSecrets.Unprotect) — legacy plaintext rows
    /// pass through it unchanged.
    public static MyFatoorahMerchantAccount? FromConfigJson(string? configJson, Func<string?, string?> unprotect)
    {
        if (string.IsNullOrWhiteSpace(configJson)) return null;
        Dictionary<string, string?>? config;
        try { config = JsonSerializer.Deserialize<Dictionary<string, string?>>(configJson); }
        catch (JsonException) { return null; }
        var token = unprotect(config?.GetValueOrDefault("apiKey"))?.Trim();
        if (string.IsNullOrEmpty(token)) return null;
        var environment = config!.GetValueOrDefault("environment")?.Trim();
        var isLive = string.Equals(environment, "live", StringComparison.OrdinalIgnoreCase) ||
                     string.Equals(environment, "production", StringComparison.OrdinalIgnoreCase);
        return new MyFatoorahMerchantAccount(token, isLive);
    }
}

public interface IMyFatoorahServiceClient
{
    Task<(bool Success, MyFatoorahInvoice? Invoice, string? Error)> SendPaymentAsync(
        MyFatoorahMerchantAccount? account, decimal amount, string customerName, string? customerReference, CancellationToken cancellationToken);

    Task<(bool Success, MyFatoorahInvoiceStatus? Status, string? Error)> GetPaymentStatusAsync(
        MyFatoorahMerchantAccount? account, long invoiceId, CancellationToken cancellationToken);

    /// Refunds `amountInAccountCurrency` of the invoice back to the shopper's original payment
    /// method. MyFatoorah's MakeRefund takes the amount in the ACCOUNT's default currency (not the
    /// invoice's display currency) — callers pass GetPaymentStatus's InvoiceValue for a full refund.
    Task<(bool Success, MyFatoorahRefund? Refund, string? Error)> MakeRefundAsync(
        MyFatoorahMerchantAccount? account, long invoiceId, decimal amountInAccountCurrency, string comment, CancellationToken cancellationToken);
}

// Calls the sibling MyFatoorah.Service microservice (finova-middleware-sme/dotnet-services/
// MyFatoorah.Service), which itself forwards to MyFatoorah's real sandbox/live API — same
// config-driven-base-URL shape as TenantGatewayClient (api/Services/TenantGatewayClient.cs), since
// like the Tenant Admin Dashboard this points at a sibling service instance rather than a fixed
// host. Auth is that service's own "secret-key" header convention (one shared key for this whole
// tenant instance — see MyFatoorah.Service.Api.Middleware.ClientSecretKeyMiddleware). The
// per-branch part — which MyFatoorah account the invoice is raised on — travels as that service's
// X-MyFatoorah-Token / X-MyFatoorah-Env / X-MyFatoorah-Base-Url override headers (see
// MyFatoorahMerchantAccount above and MyFatoorahControllerBase.ReadCredentialOverride over there).
//
// Config (appsettings / env vars):
//   MyFatoorahService:BaseUrl     — reached through the middleware's YARP gateway, which strips the
//                                   service prefix: "http://<gateway-host>:5100/myfatoorah" (the
//                                   gateway then forwards /api/v2/myfatoorah/... to the service on
//                                   :5300). Pointing straight at ":5300" (no prefix) also works.
//   MyFatoorahService:SecretKey   — a Clients.SecretKey row in the middleware's myfatoorah_service
//                                   DB (must be a DEV or PROD client — a TEST client is always mocked).
//   MyFatoorahService:CurrencyIso — optional, defaults to SAR: the invoice's DISPLAY currency (what
//                                   the shopper sees). Amounts are always this app's SAR totals, so
//                                   leave it SAR even for a KWD-settled demo account — MyFatoorah
//                                   converts at payment; setting KWD here would charge SAR figures
//                                   as KWD (~13x).
//   MyFatoorahService:SandboxApiBaseUrl / LiveApiBaseUrl — optional; MyFatoorah's own hosts that a
//                                   branch's Test / Live token belongs to. Defaults below: the one
//                                   global sandbox host, and MyFatoorah's Saudi live host (their
//                                   live host is per country — api-sa is the KSA one).
public class MyFatoorahServiceClient(HttpClient httpClient, IConfiguration config, ILogger<MyFatoorahServiceClient> logger) : IMyFatoorahServiceClient
{
    public const string DefaultSandboxApiBaseUrl = "https://apitest.myfatoorah.com";
    public const string DefaultLiveApiBaseUrl = "https://api-sa.myfatoorah.com";

    public async Task<(bool, MyFatoorahInvoice?, string?)> SendPaymentAsync(
        MyFatoorahMerchantAccount? account, decimal amount, string customerName, string? customerReference, CancellationToken cancellationToken)
    {
        // Display currency of the invoice the shopper sees ("37.200 SR"), SAR by default since
        // every amount here is SAR. The MyFatoorah account may settle in another currency (a KWD
        // demo account converts at payment time) — that's fine, nothing downstream depends on it:
        // PlacePublicOrder verifies the payment via the CustomerReference stamp, not the currency.
        var currency = config["MyFatoorahService:CurrencyIso"] ?? "SAR";
        var body = JsonSerializer.Serialize(new
        {
            CustomerName = customerName,
            NotificationOption = "LNK", // link only — no SMS/email dispatch, the QR/link is shown directly at the terminal
            InvoiceValue = amount,
            DisplayCurrencyIso = currency,
            CustomerReference = customerReference,
        });

        var (success, statusCode, raw) = await SendAsync(HttpMethod.Post, "/api/v2/myfatoorah/payment/send-payment", body, account, cancellationToken);
        if (!success)
        {
            logger.LogWarning("MyFatoorah SendPayment failed ({StatusCode}): {Body}", statusCode, raw);
            return (false, null, ExtractMessage(raw) ?? $"MyFatoorah request failed ({statusCode}).");
        }

        using var doc = JsonDocument.Parse(raw);
        var root = doc.RootElement;
        if (!root.GetProperty("IsSuccess").GetBoolean())
            return (false, null, ExtractMessage(raw) ?? "MyFatoorah declined the request.");

        var data = root.GetProperty("Data");
        var invoice = new MyFatoorahInvoice(data.GetProperty("InvoiceId").GetInt64(), data.GetProperty("InvoiceURL").GetString()!);
        return (true, invoice, null);
    }

    public async Task<(bool, MyFatoorahInvoiceStatus?, string?)> GetPaymentStatusAsync(
        MyFatoorahMerchantAccount? account, long invoiceId, CancellationToken cancellationToken)
    {
        var body = JsonSerializer.Serialize(new { Key = invoiceId.ToString(), KeyType = "InvoiceId" });
        var (success, statusCode, raw) = await SendAsync(HttpMethod.Post, "/api/v2/myfatoorah/payment/payment-status", body, account, cancellationToken);
        if (!success)
        {
            logger.LogWarning("MyFatoorah GetPaymentStatus failed ({StatusCode}): {Body}", statusCode, raw);
            return (false, null, ExtractMessage(raw) ?? $"MyFatoorah status check failed ({statusCode}).");
        }

        using var doc = JsonDocument.Parse(raw);
        var root = doc.RootElement;
        if (!root.GetProperty("IsSuccess").GetBoolean())
            return (false, null, ExtractMessage(raw) ?? "MyFatoorah declined the status request.");

        var data = root.GetProperty("Data");

        // The successful transaction's PaymentId. MyFatoorah spells the success status "Succss"
        // (their v2 typo is documented and stable) — accept the correct spelling too.
        string? paymentId = null, accountCurrency = null;
        if (data.TryGetProperty("InvoiceTransactions", out var txs) && txs.ValueKind == JsonValueKind.Array)
        {
            foreach (var tx in txs.EnumerateArray())
            {
                // Every transaction row carries the account currency ("KD", "SR", ...) — the
                // currency MakeRefund amounts are expressed in.
                if (accountCurrency is null && tx.TryGetProperty("Currency", out var cur) && cur.ValueKind == JsonValueKind.String)
                    accountCurrency = cur.GetString();
                var txStatus = tx.TryGetProperty("TransactionStatus", out var ts) ? ts.GetString() : null;
                if (txStatus is "Succss" or "Success" && tx.TryGetProperty("PaymentId", out var pid) && pid.ValueKind == JsonValueKind.String)
                {
                    paymentId = pid.GetString();
                    break;
                }
            }
        }

        var status = new MyFatoorahInvoiceStatus(
            data.GetProperty("InvoiceStatus").GetString()!,
            data.GetProperty("InvoiceValue").GetDecimal(),
            data.TryGetProperty("CustomerReference", out var cr) && cr.ValueKind == JsonValueKind.String ? cr.GetString() : null,
            data.TryGetProperty("InvoiceDisplayValue", out var dv) && dv.ValueKind == JsonValueKind.String ? dv.GetString() : null,
            paymentId,
            accountCurrency);
        return (true, status, null);
    }

    public async Task<(bool, MyFatoorahRefund?, string?)> MakeRefundAsync(
        MyFatoorahMerchantAccount? account, long invoiceId, decimal amountInAccountCurrency, string comment, CancellationToken cancellationToken)
    {
        var body = JsonSerializer.Serialize(new
        {
            KeyType = "InvoiceId",
            Key = invoiceId.ToString(),
            Amount = amountInAccountCurrency,
            ServiceChargeOnCustomer = false, // the merchant, not the shopper, absorbs MyFatoorah's fee on a refund
            Comment = comment,
        });
        var (success, statusCode, raw) = await SendAsync(HttpMethod.Post, "/api/v2/myfatoorah/refund/make-refund", body, account, cancellationToken);
        if (!success)
        {
            logger.LogWarning("MyFatoorah MakeRefund failed ({StatusCode}) for invoice {InvoiceId}: {Body}", statusCode, invoiceId, raw);
            return (false, null, ExtractMessage(raw) ?? $"MyFatoorah refund failed ({statusCode}).");
        }

        using var doc = JsonDocument.Parse(raw);
        var root = doc.RootElement;
        if (!root.GetProperty("IsSuccess").GetBoolean())
            return (false, null, ExtractMessage(raw) ?? "MyFatoorah declined the refund.");

        var data = root.GetProperty("Data");
        var refund = new MyFatoorahRefund(
            data.GetProperty("RefundId").GetInt64(),
            data.TryGetProperty("RefundReference", out var rr) && rr.ValueKind == JsonValueKind.String ? rr.GetString() : null,
            data.TryGetProperty("Amount", out var amt) && amt.ValueKind == JsonValueKind.Number ? amt.GetDecimal() : amountInAccountCurrency);
        return (true, refund, null);
    }

    private async Task<(bool Success, int StatusCode, string Body)> SendAsync(
        HttpMethod method, string path, string body, MyFatoorahMerchantAccount? account, CancellationToken cancellationToken)
    {
        var baseUrl = config["MyFatoorahService:BaseUrl"];
        var secretKey = config["MyFatoorahService:SecretKey"];
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(secretKey))
            throw new InvalidOperationException("MyFatoorahService:BaseUrl / SecretKey not configured.");

        using var request = new HttpRequestMessage(method, $"{baseUrl.TrimEnd('/')}{path}")
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json"),
        };
        request.Headers.Add("secret-key", secretKey);
        if (account is not null)
        {
            request.Headers.Add("X-MyFatoorah-Token", account.ApiToken);
            request.Headers.Add("X-MyFatoorah-Env", account.IsLive ? "Live" : "Sandbox");
            request.Headers.Add("X-MyFatoorah-Base-Url", account.IsLive
                ? config["MyFatoorahService:LiveApiBaseUrl"] ?? DefaultLiveApiBaseUrl
                : config["MyFatoorahService:SandboxApiBaseUrl"] ?? DefaultSandboxApiBaseUrl);
        }

        using var response = await httpClient.SendAsync(request, cancellationToken);
        var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
        return (response.IsSuccessStatusCode, (int)response.StatusCode, responseBody);
    }

    private static string? ExtractMessage(string raw)
    {
        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (doc.RootElement.TryGetProperty("ValidationErrors", out var errors) &&
                errors.ValueKind == JsonValueKind.Array && errors.GetArrayLength() > 0 &&
                errors[0].TryGetProperty("Error", out var firstError))
                return firstError.GetString();
            if (doc.RootElement.TryGetProperty("Message", out var msg))
                return msg.GetString();
            // The middleware's own envelope (auth failures, config errors) is lower-case.
            if (doc.RootElement.TryGetProperty("message", out var mwMsg))
                return mwMsg.GetString();
        }
        catch (JsonException)
        {
            // Upstream didn't return JSON (e.g. a raw 502 from a proxy) — fall back to the generic
            // "request failed (<status>)" message the caller already builds.
        }
        return null;
    }
}
