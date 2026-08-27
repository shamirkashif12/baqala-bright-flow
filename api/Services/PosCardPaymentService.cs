using System.Text.Json;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

/// What the POS checkout dialog polls: the payment's current state plus, once approved, the
/// reference the sale will carry. Message is shopper/cashier-facing (decline reason, cancel note).
public sealed record PosCardPaymentDto(
    Guid Id, string Status, decimal Amount, string? ReferenceNumber, string? AuthCode, string? PanMasked, string? Message);

public interface IPosCardPaymentService
{
    /// Starts a purchase on the branch's NamiPay terminal and records it (status "processing").
    /// Fails 409 when the branch has no enabled Nami integration — the POS falls back to plain
    /// card recording (standalone terminal) in that case.
    Task<CheckoutResult<PosCardPaymentDto>> InitiateAsync(Guid branchId, decimal amount, Guid? cashierId, CancellationToken ct);

    /// The payment's current state; a "processing" row is refreshed from NamiPay first.
    Task<CheckoutResult<PosCardPaymentDto>> GetStatusAsync(Guid id, CancellationToken ct);

    /// The cashier gave up waiting. Checks NamiPay one last time first — if the terminal already
    /// approved, the payment is returned as approved instead of cancelled so the sale can still
    /// complete. A cancelled row keeps being double-checked by the reconciler for a while.
    Task<CheckoutResult<PosCardPaymentDto>> CancelAsync(Guid id, Guid? userId, CancellationToken ct);

    /// Polls NamiPay for one processing/cancelled row and applies the outcome to it (does not
    /// save) — shared by GetStatusAsync and PosCardPaymentReconcilerService.
    Task RefreshFromGatewayAsync(PosCardPayment payment, CancellationToken ct);

    /// Whether the branch has an enabled Nami integration with a Terminal ID — what decides
    /// between the real terminal flow and the legacy record-it-manually card path. Lets the POS
    /// dialog tell the cashier the truth up front instead of discovering it on Confirm.
    Task<bool> IsConfiguredAsync(Guid branchId, CancellationToken ct);
}

public class PosCardPaymentService(
    BaqalaDbContext db,
    INamiPayServiceClient namiPay,
    IAuditService audit,
    ILogger<PosCardPaymentService> logger) : IPosCardPaymentService
{
    public async Task<CheckoutResult<PosCardPaymentDto>> InitiateAsync(Guid branchId, decimal amount, Guid? cashierId, CancellationToken ct)
    {
        if (amount <= 0)
            return CheckoutResult<PosCardPaymentDto>.Fail(400, "The card amount must be greater than zero.");

        var terminalId = await ResolveNamiTerminalIdAsync(branchId, ct);
        if (terminalId is null)
            return CheckoutResult<PosCardPaymentDto>.Fail(409, "NamiPay isn't configured for this branch — enable it with a Terminal ID in Admin → Payments → Nami.");

        var payment = new PosCardPayment
        {
            BranchId = branchId,
            TerminalId = terminalId,
            OrderRef = $"POS{Guid.NewGuid():N}",
            Amount = amount,
            CashierId = cashierId,
        };

        var (ok, ack, error) = await namiPay.InitiatePurchaseAsync(payment.OrderRef, terminalId, amount, ct);
        if (!ok || ack is null)
        {
            logger.LogWarning("NamiPay purchase initiation failed for branch {BranchId}: {Error}", branchId, error);
            return CheckoutResult<PosCardPaymentDto>.Fail(502, error ?? "The card terminal could not be reached — try again or take another payment method.");
        }

        payment.GatewayTransactionId = ack.TransactionId;
        db.PosCardPayments.Add(payment);
        await db.SaveChangesAsync(ct);
        return CheckoutResult<PosCardPaymentDto>.Success(ToDto(payment));
    }

    public async Task<CheckoutResult<PosCardPaymentDto>> GetStatusAsync(Guid id, CancellationToken ct)
    {
        var payment = await db.PosCardPayments.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (payment is null)
            return CheckoutResult<PosCardPaymentDto>.Fail(404, "Card payment not found.");

        if (payment.Status == "processing")
        {
            await RefreshFromGatewayAsync(payment, ct);
            await db.SaveChangesAsync(ct);
        }
        return CheckoutResult<PosCardPaymentDto>.Success(ToDto(payment));
    }

    public async Task<CheckoutResult<PosCardPaymentDto>> CancelAsync(Guid id, Guid? userId, CancellationToken ct)
    {
        var payment = await db.PosCardPayments.FirstOrDefaultAsync(p => p.Id == id, ct);
        if (payment is null)
            return CheckoutResult<PosCardPaymentDto>.Fail(404, "Card payment not found.");

        if (payment.Status != "processing")
            return CheckoutResult<PosCardPaymentDto>.Success(ToDto(payment));

        // The terminal may have approved in the very moment the cashier hit Cancel — money must
        // never be silently walked away from, so ask once more before marking it cancelled.
        await RefreshFromGatewayAsync(payment, ct);
        if (payment.Status == "processing")
        {
            payment.Status = "cancelled";
            // No gateway transaction to keep double-checking — resolved immediately; otherwise
            // the reconciler keeps polling it for a while in case a late approval surfaces.
            if (payment.GatewayTransactionId is null) payment.ResolvedAt = DateTime.UtcNow;
            payment.UpdatedAt = DateTime.UtcNow;
            await audit.LogAsync("POS card payment cancelled", entityType: "PosCardPayment", entityId: payment.Id,
                userId: userId, branchId: payment.BranchId,
                details: $"NamiPay purchase of SAR {payment.Amount:F2} cancelled at the till before a result came back (ref {payment.OrderRef}).");
        }
        await db.SaveChangesAsync(ct);
        return CheckoutResult<PosCardPaymentDto>.Success(ToDto(payment));
    }

    public async Task RefreshFromGatewayAsync(PosCardPayment payment, CancellationToken ct)
    {
        if (payment.GatewayTransactionId is null) return;

        var (ok, result, error) = await namiPay.GetTransactionResultAsync(payment.GatewayTransactionId, ct);
        var now = DateTime.UtcNow;
        if (!ok)
        {
            payment.LastError = error is { Length: > 500 } ? error[..500] : error;
            payment.UpdatedAt = now;
            return; // transient — stays as-is, polled again next time
        }
        if (result is null) return; // no final outcome yet

        payment.ResponseCode = result.ResponseCode;
        payment.ResponseMessage = result.ResponseMessage is { Length: > 255 } ? result.ResponseMessage[..255] : result.ResponseMessage;
        payment.UpdatedAt = now;

        if (result.IsApproved)
        {
            var wasCancelled = payment.Status == "cancelled";
            payment.Status = "approved";
            payment.ApprovedAt ??= now;
            payment.Rrn = result.Rrn;
            payment.AuthCode = result.AuthCode;
            payment.PanMasked = result.PanMasked;
            if (result.Amount is { } charged && Math.Abs(charged - payment.Amount) > 0.01m)
                payment.LastError = $"Terminal reports SAR {charged:F2} charged but SAR {payment.Amount:F2} was requested.";
            if (wasCancelled)
                payment.LastError = "Approved by the terminal after being cancelled at the till — complete the sale or reverse it on the terminal.";
        }
        else if (payment.Status == "cancelled")
        {
            // Cancelled at the till and the terminal indeed declined — nothing left to watch.
            payment.ResolvedAt = now;
        }
        else
        {
            payment.Status = "declined";
            payment.ResolvedAt = now;
        }
    }

    public async Task<bool> IsConfiguredAsync(Guid branchId, CancellationToken ct) =>
        await ResolveNamiTerminalIdAsync(branchId, ct) is not null;

    /// The branch's NamiPay TID from Admin → Payments → Nami (PaymentIntegration.ConfigJson's
    /// "terminalId" — the key name must stay in sync with the Nami entry in
    /// src/lib/payment-integrations.ts). Null when the integration is off or has no TID saved.
    private async Task<string?> ResolveNamiTerminalIdAsync(Guid branchId, CancellationToken ct)
    {
        var row = await db.PaymentIntegrations.AsNoTracking()
            .FirstOrDefaultAsync(p => p.BranchId == branchId && p.Provider == "Nami" && p.IsEnabled, ct);
        if (row?.ConfigJson is null) return null;
        try
        {
            var parsed = JsonSerializer.Deserialize<Dictionary<string, string?>>(row.ConfigJson);
            var terminalId = parsed?.GetValueOrDefault("terminalId")?.Trim();
            return string.IsNullOrEmpty(terminalId) ? null : terminalId;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static PosCardPaymentDto ToDto(PosCardPayment p) => new(
        p.Id, p.Status, p.Amount,
        p.Rrn ?? p.GatewayTransactionId, p.AuthCode, p.PanMasked,
        p.Status switch
        {
            "declined" => p.ResponseMessage ?? "The card was declined.",
            "expired" => "No response came back from the card terminal.",
            "approved" when p.LastError is not null => p.LastError,
            _ => null,
        });
}
