using System.Text;
using System.Text.Json;

namespace BaqalaPOS.Api.Services;

public record MyFatoorahInvoice(long InvoiceId, string InvoiceUrl);
public record MyFatoorahInvoiceStatus(string Status, decimal InvoiceValue);

public interface IMyFatoorahServiceClient
{
    Task<(bool Success, MyFatoorahInvoice? Invoice, string? Error)> SendPaymentAsync(
        decimal amount, string customerName, string? customerReference, CancellationToken cancellationToken);

    Task<(bool Success, MyFatoorahInvoiceStatus? Status, string? Error)> GetPaymentStatusAsync(long invoiceId, CancellationToken cancellationToken);
}

// Calls the sibling MyFatoorah.Service microservice (finova-middleware-sme/dotnet-services/
// MyFatoorah.Service), which itself forwards to MyFatoorah's real sandbox/live API — same
// config-driven-base-URL shape as TenantGatewayClient (api/Services/TenantGatewayClient.cs), since
// like the Tenant Admin Dashboard this points at a sibling service instance rather than a fixed
// host. Auth is that service's own "secret-key" header convention (one shared key for this whole
// tenant instance — see MyFatoorah.Service.Api.Middleware.ClientSecretKeyMiddleware), not a
// per-branch credential, because that service's Client→Env mapping only supports one sandbox/live
// MyFatoorah account per instance, matching this app's one-instance-per-tenant model.
public class MyFatoorahServiceClient(HttpClient httpClient, IConfiguration config, ILogger<MyFatoorahServiceClient> logger) : IMyFatoorahServiceClient
{
    public async Task<(bool, MyFatoorahInvoice?, string?)> SendPaymentAsync(
        decimal amount, string customerName, string? customerReference, CancellationToken cancellationToken)
    {
        var currency = config["MyFatoorahService:CurrencyIso"] ?? "KWD";
        var body = JsonSerializer.Serialize(new
        {
            CustomerName = customerName,
            NotificationOption = "LNK", // link only — no SMS/email dispatch, the QR/link is shown directly at the terminal
            InvoiceValue = amount,
            DisplayCurrencyIso = currency,
            CustomerReference = customerReference,
        });

        var (success, statusCode, raw) = await SendAsync(HttpMethod.Post, "/api/v2/myfatoorah/payment/send-payment", body, cancellationToken);
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

    public async Task<(bool, MyFatoorahInvoiceStatus?, string?)> GetPaymentStatusAsync(long invoiceId, CancellationToken cancellationToken)
    {
        var body = JsonSerializer.Serialize(new { Key = invoiceId.ToString(), KeyType = "InvoiceId" });
        var (success, statusCode, raw) = await SendAsync(HttpMethod.Post, "/api/v2/myfatoorah/payment/payment-status", body, cancellationToken);
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
        HttpMethod method, string path, string body, CancellationToken cancellationToken)
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
        }
        catch (JsonException)
        {
            // Upstream didn't return JSON (e.g. a raw 502 from a proxy) — fall back to the generic
            // "request failed (<status>)" message the caller already builds.
        }
        return null;
    }
}
