using System.Text;
using System.Text.Json;

namespace BaqalaPOS.Api.Services;

public record TenantGatewayAckResult(bool Success, int StatusCode, string RawBody);

public interface ITenantGatewayClient
{
    Task<TenantGatewayAckResult> PostProvisioningStatusAsync(string eventId, int ecrId, string status, string? failureReason);
}

// Outbound acknowledgment call back to the Tenant Admin Dashboard after handling
// POST /pos/users/provision (§5.7 of their API reference) — mirrors ZatcaApiClient's typed-
// HttpClient shape (api/Services/ZatcaApiClient.cs), but the base URL is read from config rather
// than hardcoded, since (unlike ZATCA's fixed government endpoint) this points at whichever
// Dashboard environment this instance is paired with.
public class TenantGatewayClient(HttpClient httpClient, IConfiguration config, ILogger<TenantGatewayClient> logger) : ITenantGatewayClient
{
    public async Task<TenantGatewayAckResult> PostProvisioningStatusAsync(string eventId, int ecrId, string status, string? failureReason)
    {
        var baseUrl = config["TenantGateway:BaseUrl"];
        if (string.IsNullOrWhiteSpace(baseUrl))
        {
            logger.LogWarning("TenantGateway:BaseUrl not configured — skipping provisioning-status ack for event {EventId}.", eventId);
            return new TenantGatewayAckResult(false, 0, "");
        }

        var url = $"{baseUrl.TrimEnd('/')}/api/onboarding/pos/provisioning-status";
        var payload = JsonSerializer.Serialize(new { eventId, ecrId, status, failureReason });

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent(payload, Encoding.UTF8, "application/json"),
            };
            using var response = await httpClient.SendAsync(request);
            var body = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
                logger.LogWarning("Provisioning-status ack for event {EventId} got {StatusCode}: {Body}", eventId, (int)response.StatusCode, body);
            return new TenantGatewayAckResult(response.IsSuccessStatusCode, (int)response.StatusCode, body);
        }
        catch (HttpRequestException ex)
        {
            logger.LogError(ex, "Failed to reach Tenant Admin Dashboard for provisioning-status ack, event {EventId}.", eventId);
            return new TenantGatewayAckResult(false, 0, "");
        }
    }
}
