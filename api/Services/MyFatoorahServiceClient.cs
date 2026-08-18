using System.Text;
using System.Text.Json;

namespace BaqalaPOS.Api.Services;

public record MyFatoorahInvoice(long InvoiceId, string InvoiceUrl);
public record MyFatoorahInvoiceStatus(string Status, decimal InvoiceValue);

/// A branch's own MyFatoorah account, as saved from Admin → Payments → MyFatoorah (the
/// PaymentIntegration row's ConfigJson: "apiKey" + "environment", see the MyFatoorah entry in
/// src/lib/payment-integrations.ts — the two key names must stay in sync). Forwarded to the
/// middleware's MyFatoorah service on every call so each store can use its own MyFatoorah
/// account rather than one shared token seeded in the middleware's DB.
public sealed record MyFatoorahMerchantAccount(string ApiToken, bool IsLive)
{
    /// Parses the saved ConfigJson. Returns null when no usable token is stored — the client then
    /// sends no override headers and the middleware falls back to its own shared credentials,
    /// which is what pre-existing rows saved before this field mattered get.
    public static MyFatoorahMerchantAccount? FromConfigJson(string? configJson)
    {
        if (string.IsNullOrWhiteSpace(configJson)) return null;
        Dictionary<string, string?>? config;
        try { config = JsonSerializer.Deserialize<Dictionary<string, string?>>(configJson); }
        catch (JsonException) { return null; }
        var token = config?.GetValueOrDefault("apiKey")?.Trim();
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
//   MyFatoorahService:CurrencyIso — optional, defaults to SAR (this is a KSA app; every price and
//                                   the amount-match check in PlacePublicOrder are in SAR).
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
        // SAR, not MyFatoorah's KWD default: the invoice is raised for a SAR total and
        // PlacePublicOrder compares GetPaymentStatus's InvoiceValue (reported in the invoice's
        // display currency) against that same SAR total — any other currency fails that check.
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
        var status = new MyFatoorahInvoiceStatus(
            data.GetProperty("InvoiceStatus").GetString()!,
            data.GetProperty("InvoiceValue").GetDecimal());
        return (true, status, null);
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
