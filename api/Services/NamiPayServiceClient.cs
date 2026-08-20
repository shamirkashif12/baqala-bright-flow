using System.Globalization;
using System.Text;
using System.Text.Json;

namespace BaqalaPOS.Api.Services;

/// What NamiPay returns the moment a terminal transaction is initiated — an acknowledgement, not
/// a result: the card interaction then happens on the physical terminal, and the outcome must be
/// fetched separately with GetTransactionResultAsync using this TransactionId.
public sealed record NamiPayAck(string TransactionId, string? Status, string? StatusMessage);

/// The terminal transaction's final outcome. ResponseCode is ISO-8583-style: "000" means
/// approved, anything else is a decline whose reason is in ResponseMessage. Rrn (Retrieval
/// Reference Number) is the reference on the customer's slip and the key a refund/reversal
/// targets; PanMasked is already masked by NamiPay ("455036******7601").
public sealed record NamiPayTransactionResult(
    string? TransactionId, string ResponseCode, string? ResponseMessage,
    string? Rrn, string? AuthCode, string? PanMasked, decimal? Amount, string? Tid)
{
    public bool IsApproved => ResponseCode == "000";
}

public interface INamiPayServiceClient
{
    /// Starts a purchase on the branch's NamiPay terminal. orderRef is this app's own
    /// correlation key (NamiPay echoes it back but enforces nothing on it).
    Task<(bool Success, NamiPayAck? Ack, string? Error)> InitiatePurchaseAsync(
        string orderRef, string terminalId, decimal amount, CancellationToken cancellationToken);

    /// Polls the outcome of an initiated transaction. Success with a NULL Result means the
    /// terminal hasn't produced a final outcome yet — keep polling. Success with a Result is
    /// final (approved or declined per Result.IsApproved).
    Task<(bool Success, NamiPayTransactionResult? Result, string? Error)> GetTransactionResultAsync(
        string transactionId, CancellationToken cancellationToken);

    /// Post-settlement refund of an earlier purchase, keyed by its RRN + original date. Like a
    /// purchase this returns an acknowledgement; the result must be polled.
    Task<(bool Success, NamiPayAck? Ack, string? Error)> InitiateRefundAsync(
        string orderRef, string terminalId, string rrn, DateTime originalTransactionDate, decimal amount, CancellationToken cancellationToken);

    /// Same-batch void (reversal) of an earlier purchase, keyed by its RRN.
    Task<(bool Success, NamiPayAck? Ack, string? Error)> InitiateReversalAsync(
        string orderRef, string terminalId, string rrn, decimal amount, CancellationToken cancellationToken);

    /// Admin → Payments "Test connection": proves this server's secret-key is accepted by the
    /// NamiPay middleware (no terminal involved — no money moves). Success carries a short
    /// human-readable summary.
    Task<(bool Success, string? Summary, string? Error)> TestConnectionAsync(CancellationToken cancellationToken);
}

// Calls the sibling Nami.Service microservice (finova-middleware-sme/dotnet-services/
// Nami.Service), which forwards to Nami's Cloud Middleware API (mw-uat/mw.namipay.com.sa) after
// exchanging its DB-seeded merchant credentials for a bearer token — same middleware-behind-a-
// gateway shape as MyFatoorahServiceClient. Auth here is that service's own "secret-key" header
// convention (one shared key for this whole tenant instance). Unlike MyFatoorah's service there
// is NO per-branch credential override header — Nami credentials are global per environment in
// the middleware's DB; the per-branch part is only WHICH terminal (TID) the transaction is sent
// to, and that travels in the request body (see PosCardPaymentService's integration lookup).
//
// Every payment operation is a POST to the same upstream endpoint (performTransaction) whose
// transactionreqbody.transactionType field decides the operation — the middleware exposes them
// as distinct routes. Initiation returns an acknowledgement (status "PROCESS" + transactionid);
// the outcome is polled via /payments/response/{transactionid} once the card has been handled on
// the physical terminal.
//
// Config (appsettings / env vars):
//   NamiPayService:BaseUrl   — the middleware's YARP gateway root ("http://<gateway-host>:5100");
//                              the "/nami" service prefix (which the gateway strips before
//                              forwarding to Nami.Service on :5302) is appended here, unless the
//                              configured URL already ends with it.
//   NamiPayService:SecretKey — a Clients.SecretKey row in that service's nami_service DB (a
//                              DEV or PROD client — a TEST client is always answered with mocks).
public class NamiPayServiceClient(HttpClient httpClient, IConfiguration config, ILogger<NamiPayServiceClient> logger) : INamiPayServiceClient
{
    // A status poll must stay snappy (the till polls every couple of seconds); only the initial
    // performTransaction call is allowed the HttpClient's full registered timeout, since the
    // middleware's own token-exchange + retry chain can legitimately take tens of seconds.
    private static readonly TimeSpan StatusPollTimeout = TimeSpan.FromSeconds(20);

    public async Task<(bool, NamiPayAck?, string?)> InitiatePurchaseAsync(
        string orderRef, string terminalId, decimal amount, CancellationToken cancellationToken)
    {
        var body = JsonSerializer.Serialize(new
        {
            orderId = orderRef,
            terminalId,
            transactionreqbody = new
            {
                amount = amount.ToString("F2", CultureInfo.InvariantCulture),
                print = 1, // the terminal prints its own merchant/customer slip
                transactionType = "PURCHASE",
            },
        });
        return await InitiateAsync("purchase", "/api/nami/payments/purchase", body, cancellationToken);
    }

    public async Task<(bool, NamiPayAck?, string?)> InitiateRefundAsync(
        string orderRef, string terminalId, string rrn, DateTime originalTransactionDate, decimal amount, CancellationToken cancellationToken)
    {
        var body = JsonSerializer.Serialize(new
        {
            orderId = orderRef,
            terminalId,
            transactionreqbody = new
            {
                rrn,
                originalTransactionDate = originalTransactionDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                refundAmount = amount.ToString("F2", CultureInfo.InvariantCulture),
                print = 1,
                transactionType = "Refund", // NamiPay's casing is inconsistent per operation — each must be sent verbatim
            },
        });
        return await InitiateAsync("refund", "/api/nami/payments/refund", body, cancellationToken);
    }

    public async Task<(bool, NamiPayAck?, string?)> InitiateReversalAsync(
        string orderRef, string terminalId, string rrn, decimal amount, CancellationToken cancellationToken)
    {
        var body = JsonSerializer.Serialize(new
        {
            orderId = orderRef,
            terminalId,
            transactionreqbody = new
            {
                rrn,
                refundAmount = amount.ToString("F2", CultureInfo.InvariantCulture),
                print = 1,
                transactionType = "Reversal",
            },
        });
        return await InitiateAsync("reversal", "/api/nami/payments/reversal", body, cancellationToken);
    }

    private async Task<(bool, NamiPayAck?, string?)> InitiateAsync(
        string operation, string path, string body, CancellationToken cancellationToken)
    {
        var (success, statusCode, raw) = await SendCoreAsync(HttpMethod.Post, path, body, cancellationToken);
        if (!success)
        {
            logger.LogWarning("NamiPay {Operation} failed ({StatusCode}): {Body}", operation, statusCode, raw);
            return (false, null, ExtractMessage(raw) ?? $"NamiPay request failed ({statusCode}).");
        }

        try
        {
            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;
            // The initiation ack spells it "transactionid"; the result query spells it
            // "transactionId" — a real upstream inconsistency, so accept either.
            var transactionId = GetString(root, "transactionid") ?? GetString(root, "transactionId");
            if (string.IsNullOrWhiteSpace(transactionId))
                return (false, null, ExtractMessage(raw) ?? "NamiPay accepted the request but returned no transaction id.");
            return (true, new NamiPayAck(transactionId, GetString(root, "status"), GetString(root, "statusMessage")), null);
        }
        catch (JsonException)
        {
            logger.LogWarning("NamiPay {Operation} returned non-JSON body: {Body}", operation, raw);
            return (false, null, "NamiPay returned an unreadable response.");
        }
    }

    public async Task<(bool, string?, string?)> TestConnectionAsync(CancellationToken cancellationToken)
    {
        // Pre-check the server config so a missing setup reads as a clear message, not a 500
        // (SendCoreAsync throws for missing config, which is right mid-checkout but not here).
        if (string.IsNullOrWhiteSpace(config["NamiPayService:BaseUrl"]) || string.IsNullOrWhiteSpace(config["NamiPayService:SecretKey"]))
            return (false, null, "The NamiPay middleware (NamiPayService:BaseUrl / SecretKey) is not configured on this server — ask your administrator to set it.");

        // /payments/last is read-only: it just returns the most recent transaction record this
        // client has, but it requires a valid secret-key — the cheapest real proof the middleware
        // link works. 404 simply means no transaction has ever been run, which is still a pass.
        var (ok, statusCode, raw) = await SendCoreAsync(HttpMethod.Get, "/api/nami/payments/last", null, cancellationToken);
        if (!ok && statusCode == 404)
            return (true, "Connected — the NamiPay middleware accepted this server's key (no transactions yet).", null);
        if (!ok)
        {
            logger.LogWarning("NamiPay test connection failed ({StatusCode}): {Body}", statusCode, raw);
            return (false, null, ExtractMessage(raw) ?? $"The NamiPay middleware rejected the request ({statusCode}).");
        }

        try
        {
            using var doc = JsonDocument.Parse(raw);
            var tid = GetString(doc.RootElement, "tid");
            return (true, tid is null
                ? "Connected — the NamiPay middleware accepted this server's key."
                : $"Connected — last transaction on terminal {tid} was {GetString(doc.RootElement, "responseMessage") ?? "recorded"}.", null);
        }
        catch (JsonException)
        {
            return (true, "Connected — the NamiPay middleware accepted this server's key.", null);
        }
    }

    public async Task<(bool, NamiPayTransactionResult?, string?)> GetTransactionResultAsync(
        string transactionId, CancellationToken cancellationToken)
    {
        using var pollCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        pollCts.CancelAfter(StatusPollTimeout);
        (bool Success, int StatusCode, string Body) response;
        try
        {
            response = await SendCoreAsync(HttpMethod.Get, $"/api/nami/payments/response/{Uri.EscapeDataString(transactionId)}", null, pollCts.Token);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return (true, null, "NamiPay status check timed out."); // transient — keep polling
        }

        var (success, statusCode, raw) = response;
        // 404 = the terminal hasn't produced a result for this transaction yet.
        if (!success && statusCode == 404) return (true, null, null);
        if (!success)
        {
            logger.LogWarning("NamiPay result check for {TransactionId} failed ({StatusCode}): {Body}", transactionId, statusCode, raw);
            return (false, null, ExtractMessage(raw) ?? $"NamiPay status check failed ({statusCode}).");
        }

        try
        {
            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;
            var responseCode = GetString(root, "responseCode");
            if (string.IsNullOrWhiteSpace(responseCode))
                return (true, null, null); // ack-shaped body (status "PROCESS") — still in progress

            decimal? amount = null;
            if (root.TryGetProperty("transactionAmount", out var amt))
            {
                if (amt.ValueKind == JsonValueKind.Number) amount = amt.GetDecimal();
                else if (amt.ValueKind == JsonValueKind.String &&
                         decimal.TryParse(amt.GetString(), NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed))
                    amount = parsed;
            }

            var result = new NamiPayTransactionResult(
                GetString(root, "transactionId") ?? GetString(root, "transactionid") ?? transactionId,
                responseCode,
                GetString(root, "responseMessage"),
                GetString(root, "rrn"),
                GetString(root, "authCode"),
                GetString(root, "panNumber"),
                amount,
                GetString(root, "tid"));
            return (true, result, null);
        }
        catch (JsonException)
        {
            logger.LogWarning("NamiPay result for {TransactionId} was non-JSON: {Body}", transactionId, raw);
            return (false, null, "NamiPay returned an unreadable response.");
        }
    }

    private async Task<(bool Success, int StatusCode, string Body)> SendCoreAsync(
        HttpMethod method, string path, string? body, CancellationToken cancellationToken)
    {
        var baseUrl = config["NamiPayService:BaseUrl"];
        var secretKey = config["NamiPayService:SecretKey"];
        if (string.IsNullOrWhiteSpace(baseUrl) || string.IsNullOrWhiteSpace(secretKey))
            throw new InvalidOperationException("NamiPayService:BaseUrl / SecretKey not configured.");

        // BaseUrl points at the middleware gateway root; the gateway routes /nami/* to
        // Nami.Service (stripping the prefix), whose own routes are /api/nami/*. Accept a
        // BaseUrl that already includes the /nami prefix too.
        var normalized = baseUrl.TrimEnd('/');
        if (!normalized.EndsWith("/nami", StringComparison.OrdinalIgnoreCase)) normalized += "/nami";

        using var request = new HttpRequestMessage(method, $"{normalized}{path}");
        if (body is not null)
            request.Content = new StringContent(body, Encoding.UTF8, "application/json");
        request.Headers.Add("secret-key", secretKey);

        // Transport failures come back as an ordinary failed result rather than an exception —
        // to a cashier mid-checkout an unreachable middleware is just "terminal couldn't be
        // reached, try again", never a 500. A cancellation of the CALLER's token still throws
        // (the request was abandoned); only the HttpClient's own timeout is translated.
        try
        {
            using var response = await httpClient.SendAsync(request, cancellationToken);
            var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
            return (response.IsSuccessStatusCode, (int)response.StatusCode, responseBody);
        }
        catch (HttpRequestException ex)
        {
            logger.LogWarning(ex, "NamiPay request to {Path} failed", path);
            return (false, 0, "{\"message\":\"The NamiPay service could not be reached.\"}");
        }
        catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning("NamiPay request to {Path} timed out", path);
            return (false, 0, "{\"message\":\"The NamiPay service timed out.\"}");
        }
    }

    private static string? GetString(JsonElement root, string property) =>
        root.TryGetProperty(property, out var el) && el.ValueKind == JsonValueKind.String ? el.GetString() : null;

    /// Two error shapes come back through the middleware: its own lower-case envelope
    /// ({"message": ...} on auth/config failures) and Nami's body passed through verbatim
    /// ({"statusMessage": ...} or {"responseMessage": ...}).
    private static string? ExtractMessage(string raw)
    {
        try
        {
            using var doc = JsonDocument.Parse(raw);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return null;
            return GetString(root, "message") ?? GetString(root, "statusMessage") ?? GetString(root, "responseMessage");
        }
        catch (JsonException)
        {
            return null;
        }
    }
}
