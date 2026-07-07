using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace BaqalaPOS.Api.Services;

public record ZatcaApiResult(bool Success, int StatusCode, JsonDocument Body, string RawBody);

public interface IZatcaApiClient
{
    Task<ZatcaApiResult> GetComplianceCsidAsync(string environment, string csrBase64, string otp);
    Task<ZatcaApiResult> ComplianceChecksAsync(string environment, string binarySecurityToken, string secret, ZatcaSignedInvoice payload);
    Task<ZatcaApiResult> GetProductionCsidAsync(string environment, string binarySecurityToken, string secret, string complianceRequestId);
    Task<ZatcaApiResult> InvoiceReportingAsync(string environment, string binarySecurityToken, string secret, ZatcaSignedInvoice payload);
    Task<ZatcaApiResult> InvoiceClearanceAsync(string environment, string binarySecurityToken, string secret, ZatcaSignedInvoice payload);
}

// Ports ApiHelper.php's ZATCA gateway calls, including its retry/backoff shape (3 attempts,
// exponential backoff, treats HTTP 200/201/202 as success).
public class ZatcaApiClient(HttpClient httpClient, ILogger<ZatcaApiClient> logger) : IZatcaApiClient
{
    private const string BaseHost = "https://gw-fatoora.zatca.gov.sa/e-invoicing";

    public Task<ZatcaApiResult> GetComplianceCsidAsync(string environment, string csrBase64, string otp)
    {
        var url = $"{BaseHost}/{EnvironmentSegment(environment)}/compliance";
        var payload = JsonSerializer.Serialize(new { csr = csrBase64 });
        return SendWithRetryAsync(HttpMethod.Post, url, payload, otp: otp);
    }

    public Task<ZatcaApiResult> ComplianceChecksAsync(string environment, string binarySecurityToken, string secret, ZatcaSignedInvoice payload)
    {
        var url = $"{BaseHost}/{EnvironmentSegment(environment)}/compliance/invoices";
        return SendWithRetryAsync(HttpMethod.Post, url, ToJson(payload), basicAuthUser: binarySecurityToken, basicAuthPassword: secret);
    }

    public Task<ZatcaApiResult> GetProductionCsidAsync(string environment, string binarySecurityToken, string secret, string complianceRequestId)
    {
        var url = $"{BaseHost}/{EnvironmentSegment(environment)}/production/csids";
        var payload = JsonSerializer.Serialize(new { compliance_request_id = complianceRequestId });
        return SendWithRetryAsync(HttpMethod.Post, url, payload, basicAuthUser: binarySecurityToken, basicAuthPassword: secret);
    }

    public Task<ZatcaApiResult> InvoiceReportingAsync(string environment, string binarySecurityToken, string secret, ZatcaSignedInvoice payload)
    {
        var url = $"{BaseHost}/{EnvironmentSegment(environment)}/invoices/reporting/single";
        return SendWithRetryAsync(HttpMethod.Post, url, ToJson(payload), basicAuthUser: binarySecurityToken, basicAuthPassword: secret, clearanceStatusHeader: true);
    }

    public Task<ZatcaApiResult> InvoiceClearanceAsync(string environment, string binarySecurityToken, string secret, ZatcaSignedInvoice payload)
    {
        var url = $"{BaseHost}/{EnvironmentSegment(environment)}/invoices/clearance/single";
        return SendWithRetryAsync(HttpMethod.Post, url, ToJson(payload), basicAuthUser: binarySecurityToken, basicAuthPassword: secret, clearanceStatusHeader: true);
    }

    private static string ToJson(ZatcaSignedInvoice payload) => JsonSerializer.Serialize(new
    {
        invoiceHash = payload.InvoiceHash,
        uuid = payload.Uuid,
        invoice = payload.Invoice,
        qrCode = payload.QrCode,
    });

    private static string EnvironmentSegment(string environment) => environment switch
    {
        "production" => "production",
        "simulation" => "simulation",
        _ => "developer-portal", // sandbox / NonProduction
    };

    private async Task<ZatcaApiResult> SendWithRetryAsync(
        HttpMethod method, string url, string jsonPayload,
        string? otp = null, string? basicAuthUser = null, string? basicAuthPassword = null,
        bool clearanceStatusHeader = false, int retries = 3, int backoffSeconds = 1)
    {
        for (var attempt = 0; attempt < retries; attempt++)
        {
            using var request = new HttpRequestMessage(method, url)
            {
                Content = new StringContent(jsonPayload, Encoding.UTF8, "application/json"),
            };
            // ZATCA's gateway is strict about this — PHP's reference sends a bare
            // "Content-Type: application/json" with no charset param; StringContent adds one by
            // default, which some strict gateways treat as a malformed/unrecognized request.
            request.Content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            request.Headers.Add("Accept-Language", "en");
            request.Headers.Add("Accept-Version", "V2");
            if (otp is not null) request.Headers.Add("Otp", otp);
            if (clearanceStatusHeader) request.Headers.Add("Clearance-Status", "1");
            if (basicAuthUser is not null)
            {
                var basicAuth = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{basicAuthUser}:{basicAuthPassword}"));
                request.Headers.Authorization = new AuthenticationHeaderValue("Basic", basicAuth);
            }

            HttpResponseMessage response;
            try
            {
                response = await httpClient.SendAsync(request);
            }
            catch (HttpRequestException ex)
            {
                logger.LogWarning(ex, "ZATCA request to {Url} failed (attempt {Attempt}/{Retries})", url, attempt + 1, retries);
                if (attempt == retries - 1) throw;
                await Task.Delay(TimeSpan.FromSeconds(backoffSeconds * Math.Pow(2, attempt)));
                continue;
            }

            var body = await response.Content.ReadAsStringAsync();
            var statusCode = (int)response.StatusCode;

            if (statusCode is 200 or 201 or 202)
            {
                return new ZatcaApiResult(true, statusCode, ParseJsonSafely(body), body);
            }

            logger.LogWarning("ZATCA request to {Url} returned {StatusCode} (attempt {Attempt}/{Retries}): {Body}", url, statusCode, attempt + 1, retries, body);
            if (attempt == retries - 1)
            {
                return new ZatcaApiResult(false, statusCode, ParseJsonSafely(body), body);
            }
            await Task.Delay(TimeSpan.FromSeconds(backoffSeconds * Math.Pow(2, attempt)));
        }

        throw new InvalidOperationException("Unreachable: retry loop exited without returning.");
    }

    private static JsonDocument ParseJsonSafely(string body)
    {
        try { return JsonDocument.Parse(body); }
        catch (JsonException) { return JsonDocument.Parse("{}"); }
    }
}
