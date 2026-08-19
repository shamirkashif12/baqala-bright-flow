using System.Text.Json;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

/// Outcome of a checkout operation, shaped so the controller can return it verbatim: HTTP status
/// + user-facing message on failure, Value on success.
public sealed record CheckoutResult<T>(bool Ok, int StatusCode, string? Message, T? Value)
{
    public static CheckoutResult<T> Success(T value) => new(true, 200, null, value);
    public static CheckoutResult<T> Fail(int statusCode, string message) => new(false, statusCode, message, default);
}

public sealed record InitiatedCardPayment(long InvoiceId, string InvoiceUrl, decimal TotalAmount);
/// Problem is set when the invoice is paid but the order could not be created (the shopper is
/// told why; staff were notified) — see PlaceFromPaymentAsync.
public sealed record CardPaymentStatus(string Status, string RawStatus, string? OrderNumber, decimal? OrderTotal, string? Problem = null);
public sealed record PlacedOrder(Guid OrderId, string OrderNumber, decimal TotalAmount);

public interface IOnlineCheckoutService
{
    /// The branch's MyFatoorah account (Admin → Payments) — null when online payment isn't
    /// available for the branch (integration off, or enabled with no token).
    Task<MyFatoorahMerchantAccount?> ResolveMyFatoorahAccountAsync(Guid branchId, CancellationToken ct = default);

    /// Prices the cart, raises a MyFatoorah invoice for it and records an OnlinePayment row
    /// (status "created") holding the whole checkout so the order can be placed later even
    /// without the browser.
    Task<CheckoutResult<InitiatedCardPayment>> InitiateCardPaymentAsync(Guid branchId, PlaceOnlineOrderRequest req, CancellationToken ct);

    /// Asks MyFatoorah for the invoice's status. The first time it comes back Paid, the order is
    /// created right here from the recorded checkout — the browser only learns "paid + your
    /// order number", it no longer has to make (and could no longer fail to make) the second
    /// call that used to create the order.
    Task<CheckoutResult<CardPaymentStatus>> GetCardPaymentStatusAsync(Guid branchId, long invoiceId, CancellationToken ct);

    /// Places a Cash-on-Delivery order (the plain public POST). Card orders go through
    /// PlaceFromPaymentAsync via the status poll / reconciler instead; a legacy card POST that
    /// still arrives with a PaymentReference is answered idempotently from the payment record.
    Task<CheckoutResult<PlacedOrder>> PlacePublicOrderAsync(Guid branchId, PlaceOnlineOrderRequest req, CancellationToken ct);

    /// Verifies the recorded payment against MyFatoorah (Paid + branch/amount stamp) and creates
    /// its order from the recorded checkout. Idempotent: an already-ordered payment returns the
    /// existing order. Failures are written to the row (LastError / PlacementAttempts) and, on
    /// the first failure, staff are notified — the money exists, the order doesn't.
    Task<CheckoutResult<PlacedOrder>> PlaceFromPaymentAsync(OnlinePayment payment, CancellationToken ct, bool notifyOnFailure = true);

    /// Full refund of a paid payment through MyFatoorah; marks the payment (and its order, if
    /// any) refunded. Used by Reject on a paid order and by the admin "Refund" action.
    Task<CheckoutResult<MyFatoorahRefund>> RefundAsync(OnlinePayment payment, string reason, Guid? userId, CancellationToken ct);
}

public class OnlineCheckoutService(
    BaqalaDbContext db,
    IOnlineOrderPricingService pricing,
    IMyFatoorahServiceClient myFatoorah,
    INotificationService notifications,
    IAuditService audit,
    ILogger<OnlineCheckoutService> logger) : IOnlineCheckoutService
{
    private static readonly string[] StaffRoles = ["Manager", "Admin"];

    // ── Shared validation ────────────────────────────────────────────────

    /// Mirrors the checkout form's own client-side checks — re-validated server-side because the
    /// endpoints are fully anonymous and nothing from the client can be trusted. Returns the
    /// first problem as a shopper-facing message, or null when the request is fine.
    public static string? ValidateCheckout(PlaceOnlineOrderRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.FullName) || req.FullName.Trim().Length < 2)
            return "Enter your full name.";
        if (string.IsNullOrWhiteSpace(req.AddressLine) || req.AddressLine.Trim().Length < 8)
            return "Enter a more detailed delivery address.";
        var phoneDigits = new string((req.Phone ?? "").Where(char.IsDigit).ToArray());
        if (phoneDigits.Length < 8) return "Enter a valid phone number.";
        if (!string.IsNullOrWhiteSpace(req.Email) &&
            !System.Text.RegularExpressions.Regex.IsMatch(req.Email.Trim(), @"^[^\s@]+@[^\s@]+\.[^\s@]+$"))
            return "Enter a valid email address, or leave it blank.";
        if (req.Items is not { Count: > 0 }) return "Your cart is empty.";
        return null;
    }

    private async Task<(Branch? Branch, PosSettings? Settings)> ResolveOnlineOrderingBranchAsync(Guid branchId, CancellationToken ct)
    {
        var branch = await db.Branches.FindAsync([branchId], ct);
        if (branch is null || branch.Status != "active") return (null, null);
        var settings = await db.PosSettings.FirstOrDefaultAsync(s => s.BranchId == branchId, ct);
        if (settings?.OnlineOrderingEnabled != true) return (null, null);
        return (branch, settings);
    }

    public async Task<MyFatoorahMerchantAccount?> ResolveMyFatoorahAccountAsync(Guid branchId, CancellationToken ct = default)
    {
        var row = await db.PaymentIntegrations.AsNoTracking()
            .FirstOrDefaultAsync(p => p.BranchId == branchId && p.Provider == "MyFatoorah" && p.IsEnabled, ct);
        return row is null ? null : MyFatoorahMerchantAccount.FromConfigJson(row.ConfigJson);
    }

    /// Prices the cart and applies the branch's serviceability + min/max gates. Shared by invoice
    /// creation and order placement so the two can never disagree about what the order costs.
    private async Task<CheckoutResult<OnlineOrderTotals>> PriceAndGateAsync(
        Guid branchId, PosSettings settings, PlaceOnlineOrderRequest req, CancellationToken ct)
    {
        var totals = await pricing.ComputeAsync(
            branchId, req.Items.Select(i => (i.ProductId, i.Quantity)), req.Latitude, req.Longitude);
        if (!totals.Delivery.IsServiceable)
            return CheckoutResult<OnlineOrderTotals>.Fail(400, totals.Delivery.UnserviceableMessage ?? "This branch doesn't deliver to that address.");
        // Gates compare against the GOODS total, not the grand total: a delivery fee must never be
        // what pushes an order over the branch maximum, nor count towards clearing its minimum.
        if (totals.GoodsTotal < settings.OnlineOrderingMinOrderAmountSar)
            return CheckoutResult<OnlineOrderTotals>.Fail(400, $"Minimum order amount is SAR {settings.OnlineOrderingMinOrderAmountSar:F2}.");
        if (totals.GoodsTotal > settings.OnlineOrderingMaxOrderValueSar)
            return CheckoutResult<OnlineOrderTotals>.Fail(400, $"This order exceeds the maximum of SAR {settings.OnlineOrderingMaxOrderValueSar:F2} — please contact the branch directly.");
        return CheckoutResult<OnlineOrderTotals>.Success(totals);
    }

    /// Loads the branch's stock rows for everything the priced order needs (paid + bonus lines
    /// combined per product — a bogo offer can add a bonus line for a product the customer never
    /// directly requested, or more of the SAME product) and checks eligibility + availability.
    /// Materialize-then-filter because a `Contains()` over the id list fails to type-map on this
    /// MySQL EF provider (the ef-mysql-inlist gotcha worked around throughout this codebase).
    private async Task<CheckoutResult<(Dictionary<Guid, InventoryStock> Stocks, Dictionary<Guid, decimal> Needed)>> CheckAvailabilityAsync(
        Guid branchId, OnlineOrderTotals totals, CancellationToken ct)
    {
        var needed = totals.Items.GroupBy(i => i.ProductId).ToDictionary(g => g.Key, g => g.Sum(i => i.Quantity));
        var stocks = (await db.InventoryStocks.Include(s => s.Product)
                .Where(s => s.BranchId == branchId).ToListAsync(ct))
            .Where(s => needed.ContainsKey(s.ProductId))
            .ToDictionary(s => s.ProductId);

        foreach (var (productId, neededQty) in needed)
        {
            // Tobacco is allowed (online ordering has a mandatory staff-approval step, unlike the
            // kiosk); AllowSelfCheckout still gates other exclusions.
            if (!stocks.TryGetValue(productId, out var stock) || stock.Product is null ||
                stock.Product.Status != "active" || !stock.Product.AllowSelfCheckout)
                return CheckoutResult<(Dictionary<Guid, InventoryStock>, Dictionary<Guid, decimal>)>.Fail(400, "One or more items are no longer available.");
            var available = stock.Quantity - stock.ReservedQuantity;
            if (available < neededQty)
                return CheckoutResult<(Dictionary<Guid, InventoryStock>, Dictionary<Guid, decimal>)>.Fail(400, $"Only {Math.Max(0, available):0.##} of '{stock.Product.Name}' is available.");
        }
        return CheckoutResult<(Dictionary<Guid, InventoryStock>, Dictionary<Guid, decimal>)>.Success((stocks, needed));
    }

    // ── Card payment: invoice ────────────────────────────────────────────

    public async Task<CheckoutResult<InitiatedCardPayment>> InitiateCardPaymentAsync(Guid branchId, PlaceOnlineOrderRequest req, CancellationToken ct)
    {
        var (branch, settings) = await ResolveOnlineOrderingBranchAsync(branchId, ct);
        if (branch is null || settings is null)
            return CheckoutResult<InitiatedCardPayment>.Fail(404, "Online ordering isn't available for this branch.");
        if (ValidateCheckout(req) is { } problem) return CheckoutResult<InitiatedCardPayment>.Fail(400, problem);

        var account = await ResolveMyFatoorahAccountAsync(branchId, ct);
        if (account is null) return CheckoutResult<InitiatedCardPayment>.Fail(400, "Online payment isn't available for this branch.");

        var priced = await PriceAndGateAsync(branchId, settings, req, ct);
        if (!priced.Ok) return CheckoutResult<InitiatedCardPayment>.Fail(priced.StatusCode, priced.Message!);
        var totals = priced.Value!;

        // Check stock BEFORE asking for money. Not a reservation (that still happens at order
        // time), but it removes the common "sold out between paying and ordering" case: an item
        // that's already unavailable never gets paid for in the first place.
        var availability = await CheckAvailabilityAsync(branchId, totals, ct);
        if (!availability.Ok) return CheckoutResult<InitiatedCardPayment>.Fail(availability.StatusCode, availability.Message!);

        // The reference is the currency-proof binding verified before the order is created — see
        // MyFatoorahOrderReference. Not a client input: computed here from the server's own total.
        var reference = new MyFatoorahOrderReference(branchId, totals.TotalAmount).ToString();
        var (success, invoice, error) = await myFatoorah.SendPaymentAsync(
            account, totals.TotalAmount, req.FullName.Trim(), reference, ct);
        if (!success || invoice is null)
        {
            logger.LogWarning("MyFatoorah SendPayment failed for branch {BranchId}: {Error}", branchId, error);
            return CheckoutResult<InitiatedCardPayment>.Fail(502, "Online payment is temporarily unavailable — please try again or choose Cash on Delivery.");
        }

        // Record it now, before any money moves. The snapshot is the request the browser would
        // have sent to place the order, with the payment fields filled in — PlaceFromPaymentAsync
        // deserializes exactly this.
        var snapshot = req with { PaymentMethod = "myfatoorah", PaymentReference = invoice.InvoiceId };
        db.OnlinePayments.Add(new OnlinePayment
        {
            Id = Guid.NewGuid(),
            BranchId = branchId,
            Provider = "MyFatoorah",
            GatewayInvoiceId = invoice.InvoiceId,
            InvoiceUrl = invoice.InvoiceUrl,
            AmountSar = totals.TotalAmount,
            CheckoutJson = JsonSerializer.Serialize(snapshot),
            Status = "created",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync(ct);

        return CheckoutResult<InitiatedCardPayment>.Success(new InitiatedCardPayment(invoice.InvoiceId, invoice.InvoiceUrl, totals.TotalAmount));
    }

    // ── Card payment: status → order ────────────────────────────────────

    public async Task<CheckoutResult<CardPaymentStatus>> GetCardPaymentStatusAsync(Guid branchId, long invoiceId, CancellationToken ct)
    {
        var (branch, _) = await ResolveOnlineOrderingBranchAsync(branchId, ct);
        if (branch is null) return CheckoutResult<CardPaymentStatus>.Fail(404, "Online ordering isn't available for this branch.");

        // Only invoices this app raised for this branch are answered — the row is the proof.
        var payment = await db.OnlinePayments.FirstOrDefaultAsync(p => p.GatewayInvoiceId == invoiceId && p.BranchId == branchId, ct);
        if (payment is null) return CheckoutResult<CardPaymentStatus>.Fail(404, "Unknown payment.");

        // Already settled one way or the other — answer from our own record, no MyFatoorah call.
        if (payment.Status == "ordered" && payment.OrderId is { } orderedId)
        {
            var existing = await db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.Id == orderedId, ct);
            return CheckoutResult<CardPaymentStatus>.Success(new CardPaymentStatus("paid", "Paid", existing?.OrderNumber, existing?.TotalAmount));
        }
        if (payment.Status is "expired" or "refunded")
            return CheckoutResult<CardPaymentStatus>.Success(new CardPaymentStatus("failed", payment.Status, null, null));

        var account = await ResolveMyFatoorahAccountAsync(branchId, ct);
        if (account is null) return CheckoutResult<CardPaymentStatus>.Fail(400, "Online payment isn't available for this branch.");

        var (success, status, error) = await myFatoorah.GetPaymentStatusAsync(account, invoiceId, ct);
        if (!success || status is null)
        {
            logger.LogWarning("MyFatoorah GetPaymentStatus failed for invoice {InvoiceId}: {Error}", invoiceId, error);
            return CheckoutResult<CardPaymentStatus>.Fail(502, "Couldn't reach the payment gateway — still checking.");
        }

        switch (status.Status)
        {
            case "Paid":
            {
                MarkPaid(payment, status);
                await db.SaveChangesAsync(ct);
                // Create the order NOW — the shopper's browser is not needed for this anymore.
                var placed = await PlaceFromPaymentAsync(payment, ct);
                return CheckoutResult<CardPaymentStatus>.Success(new CardPaymentStatus(
                    "paid", "Paid", placed.Ok ? placed.Value!.OrderNumber : null, placed.Ok ? placed.Value!.TotalAmount : null,
                    placed.Ok ? null : (payment.LastError ?? placed.Message)));
            }
            case "Expired" or "Canceled":
                if (payment.Status == "created")
                {
                    payment.Status = "expired";
                    payment.ResolvedAt = DateTime.UtcNow;
                    payment.UpdatedAt = DateTime.UtcNow;
                    await db.SaveChangesAsync(ct);
                }
                return CheckoutResult<CardPaymentStatus>.Success(new CardPaymentStatus("failed", status.Status, null, null));
            default:
                return CheckoutResult<CardPaymentStatus>.Success(new CardPaymentStatus("pending", status.Status, null, null));
        }
    }

    private static void MarkPaid(OnlinePayment payment, MyFatoorahInvoiceStatus status)
    {
        if (payment.Status == "created")
        {
            payment.Status = "paid";
            payment.PaidAt = DateTime.UtcNow;
        }
        payment.GatewayPaymentId ??= status.PaymentId;
        payment.UpdatedAt = DateTime.UtcNow;
    }

    // ── Placing the order ────────────────────────────────────────────────

    public async Task<CheckoutResult<PlacedOrder>> PlacePublicOrderAsync(Guid branchId, PlaceOnlineOrderRequest req, CancellationToken ct)
    {
        var (branch, settings) = await ResolveOnlineOrderingBranchAsync(branchId, ct);
        if (branch is null || settings is null)
            return CheckoutResult<PlacedOrder>.Fail(404, "Online ordering isn't available for this branch.");
        if (ValidateCheckout(req) is { } problem) return CheckoutResult<PlacedOrder>.Fail(400, problem);

        if (req.PaymentMethod == "myfatoorah")
        {
            // Card orders are created from the payment record (status poll / reconciler), so
            // this POST is only reached by an older page build. Answer from the record.
            if (req.PaymentReference is not { } invoiceId)
                return CheckoutResult<PlacedOrder>.Fail(400, "Missing payment reference.");
            var payment = await db.OnlinePayments.FirstOrDefaultAsync(p => p.GatewayInvoiceId == invoiceId && p.BranchId == branchId, ct);
            if (payment is null)
                return CheckoutResult<PlacedOrder>.Fail(400, "This payment wasn't created for an online order here — please pay again.");
            return await PlaceFromPaymentAsync(payment, ct);
        }
        if (req.PaymentMethod != "cash")
            return CheckoutResult<PlacedOrder>.Fail(400, $"Unsupported payment method '{req.PaymentMethod}'.");

        var priced = await PriceAndGateAsync(branchId, settings, req, ct);
        if (!priced.Ok) return CheckoutResult<PlacedOrder>.Fail(priced.StatusCode, priced.Message!);
        return await CreateOrderAsync(branchId, req, priced.Value!, payment: null, ct);
    }

    public async Task<CheckoutResult<PlacedOrder>> PlaceFromPaymentAsync(OnlinePayment payment, CancellationToken ct, bool notifyOnFailure = true)
    {
        // Idempotent: the row is the source of truth for "has this payment got its order".
        if (payment.Status == "ordered" && payment.OrderId is { } orderedId)
        {
            var existing = await db.Orders.AsNoTracking().FirstOrDefaultAsync(o => o.Id == orderedId, ct);
            return existing is null
                ? CheckoutResult<PlacedOrder>.Fail(409, "This payment is already linked to an order.")
                : CheckoutResult<PlacedOrder>.Success(new PlacedOrder(existing.Id, existing.OrderNumber, existing.TotalAmount));
        }
        if (payment.Status == "refunded")
            return CheckoutResult<PlacedOrder>.Fail(400, "This payment has been refunded.");

        var branchId = payment.BranchId;
        var (branch, settings) = await ResolveOnlineOrderingBranchAsync(branchId, ct);
        if (branch is null || settings is null)
            return await RecordPlacementFailureAsync(payment, "Online ordering is switched off for this branch.", notifyOnFailure, ct);

        PlaceOnlineOrderRequest? req;
        try { req = JsonSerializer.Deserialize<PlaceOnlineOrderRequest>(payment.CheckoutJson); }
        catch (JsonException) { req = null; }
        if (req is null || ValidateCheckout(req) is not null)
            return await RecordPlacementFailureAsync(payment, "The recorded checkout details are unreadable.", notifyOnFailure, ct);

        var account = await ResolveMyFatoorahAccountAsync(branchId, ct);
        if (account is null)
            return await RecordPlacementFailureAsync(payment, "MyFatoorah is no longer enabled for this branch.", notifyOnFailure, ct);

        // Verify with MyFatoorah itself — never with what the browser (or our own row) says.
        var (success, status, error) = await myFatoorah.GetPaymentStatusAsync(account, payment.GatewayInvoiceId, ct);
        if (!success || status is null)
            return CheckoutResult<PlacedOrder>.Fail(502, "Could not verify payment with the payment gateway.");
        if (status.Status != "Paid")
            return CheckoutResult<PlacedOrder>.Fail(400, "Payment hasn't been completed yet.");

        // Amount + branch check via the CustomerReference stamp — NOT via InvoiceValue, which
        // MyFatoorah reports in the account's base currency (a KWD account shows a "37.200 SR"
        // invoice as InvoiceValue 3.012). The stamp also pins the invoice to this branch.
        var reference = MyFatoorahOrderReference.Parse(status.CustomerReference);
        if (reference is null || reference.BranchId != branchId)
            return await RecordPlacementFailureAsync(payment, "The paid invoice doesn't carry this branch's stamp.", notifyOnFailure, ct);

        MarkPaid(payment, status);

        // Re-price now: prices/offers can have shifted since the invoice was raised. The order is
        // created for the CURRENT price only if it still equals what was paid.
        var priced = await PriceAndGateAsync(branchId, settings, req, ct);
        if (!priced.Ok) return await RecordPlacementFailureAsync(payment, priced.Message!, notifyOnFailure, ct);
        var totals = priced.Value!;
        if (Math.Abs(reference.AmountSar - totals.TotalAmount) > 0.01m || Math.Abs(payment.AmountSar - totals.TotalAmount) > 0.01m)
            return await RecordPlacementFailureAsync(payment,
                $"Paid SAR {payment.AmountSar:F2} but the order now prices at SAR {totals.TotalAmount:F2}.", notifyOnFailure, ct);

        var result = await CreateOrderAsync(branchId, req, totals, payment, ct);
        if (!result.Ok && result.StatusCode != 409)
            return await RecordPlacementFailureAsync(payment, result.Message!, notifyOnFailure, ct);
        return result;
    }

    private async Task<CheckoutResult<PlacedOrder>> RecordPlacementFailureAsync(OnlinePayment payment, string reason, bool notify, CancellationToken ct)
    {
        var firstFailure = payment.PlacementAttempts == 0;
        payment.PlacementAttempts += 1;
        payment.LastError = reason.Length > 500 ? reason[..500] : reason;
        payment.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        logger.LogWarning("Online payment {InvoiceId} (branch {BranchId}) is paid but its order could not be created: {Reason}",
            payment.GatewayInvoiceId, payment.BranchId, reason);

        // Tell staff once, the first time — a paid payment with no order is a customer waiting
        // for food that nobody knows about. Best-effort, like every notification call site.
        if (notify && firstFailure && payment.Status == "paid")
        {
            try
            {
                await notifications.NotifyRoleAsync(
                    StaffRoles, payment.BranchId, "Online Orders", "Online Payment Needs Attention",
                    $"Paid SAR {payment.AmountSar:F2} · no order created",
                    $"MyFatoorah invoice {payment.GatewayInvoiceId} is paid but the order couldn't be created: {reason} " +
                    "Open Orders → Online Orders → Payments needing attention to create it or refund it.",
                    severity: "warning", entityType: "OnlinePayment", entityId: payment.Id);
            }
            catch (Exception ex) { logger.LogError(ex, "Notification failed for online payment {Id}", payment.Id); }
        }
        return CheckoutResult<PlacedOrder>.Fail(400, reason);
    }

    /// The single place an online Order row is created — for both cash and card. For card,
    /// `payment` is the verified OnlinePayment and the order is born paid; the unique index on
    /// order_payments.gateway_invoice_id guarantees one order per invoice even if two callers
    /// (status poll + reconciler) race here.
    private async Task<CheckoutResult<PlacedOrder>> CreateOrderAsync(
        Guid branchId, PlaceOnlineOrderRequest req, OnlineOrderTotals totals, OnlinePayment? payment, CancellationToken ct)
    {
        var availability = await CheckAvailabilityAsync(branchId, totals, ct);
        if (!availability.Ok) return CheckoutResult<PlacedOrder>.Fail(availability.StatusCode, availability.Message!);
        var (stocks, needed) = availability.Value;

        var now = DateTime.UtcNow;
        var order = new Order
        {
            Id = Guid.NewGuid(),
            OrderNumber = $"ORD-{now:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}",
            Source = "online",
            BranchId = branchId,
            CustomerId = null,
            Subtotal = totals.Subtotal,
            TaxAmount = totals.TaxAmount,
            TobaccoFeeAmount = totals.TobaccoFeeAmount,
            CustomFeeAmount = totals.CustomFeeAmount,
            DeliveryFeeAmount = totals.Delivery.Amount,
            TotalAmount = totals.TotalAmount,
            // Cash on Delivery settles at Deliver(); a card order is already paid in full —
            // verified by the caller — so it's paid from the start.
            PaymentStatus = payment is not null ? "paid" : "pending",
            OrderStatus = "pending",
            CreatedAt = now,
            UpdatedAt = now,
        };
        foreach (var line in totals.Items)
        {
            order.Items.Add(new OrderItem
            {
                Id = Guid.NewGuid(), OrderId = order.Id, ProductId = line.ProductId,
                Quantity = line.Quantity, UnitPrice = line.UnitPrice, TotalPrice = line.TotalPrice,
                TobaccoFeeAmount = line.TobaccoFeeAmount, CreatedAt = now,
            });
        }
        foreach (var fee in totals.CustomFees)
        {
            order.ServiceCharges.Add(new OrderServiceCharge
            {
                Id = Guid.NewGuid(), OrderId = order.Id, TaxFeeRuleId = fee.TaxFeeRuleId,
                Name = fee.Name, Amount = fee.Amount, CreatedAt = now,
            });
        }
        db.Orders.Add(order);
        if (payment is not null)
        {
            db.OrderPayments.Add(new OrderPayment
            {
                Id = Guid.NewGuid(), OrderId = order.Id, PaymentMethod = "card",
                Amount = order.TotalAmount, Status = "completed",
                ReferenceNumber = payment.GatewayPaymentId ?? payment.GatewayInvoiceId.ToString(),
                GatewayInvoiceId = payment.GatewayInvoiceId,
                CreatedAt = now,
            });
            payment.Status = "ordered";
            payment.OrderId = order.Id;
            payment.ResolvedAt = now;
            payment.LastError = null;
            payment.UpdatedAt = now;
        }
        db.OrderDeliveryDetails.Add(new OrderDeliveryDetail
        {
            OrderId = order.Id,
            FullName = req.FullName.Trim(),
            Phone = req.Phone.Trim(),
            Email = string.IsNullOrWhiteSpace(req.Email) ? null : req.Email.Trim(),
            AddressLine = req.AddressLine.Trim(),
            Latitude = req.Latitude,
            Longitude = req.Longitude,
            Notes = string.IsNullOrWhiteSpace(req.Notes) ? null : req.Notes.Trim(),
            // Snapshot of how the fee was arrived at — the rule can be edited or deleted later,
            // and "why was I charged this?" is a question asked days afterwards.
            DeliveryFeeRuleId = totals.Delivery.RuleId,
            DeliveryFeeRuleName = totals.Delivery.RuleName,
            DeliveryDistanceKm = totals.Delivery.DistanceKm,
            CreatedAt = now,
        });

        // Reserve, don't deduct — on-hand stock and the StockMovement ledger are only touched at
        // delivery. A rejected/cancelled order simply releases the reservation.
        foreach (var (productId, neededQty) in needed)
        {
            var stock = stocks[productId];
            stock.ReservedQuantity += neededQty;
            stock.UpdatedAt = now;
        }

        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException ex) when (
            ex.InnerException?.Message.Contains("Duplicate entry") == true &&
            ex.InnerException.Message.Contains("gateway_invoice_id", StringComparison.OrdinalIgnoreCase))
        {
            // Two placements raced for the same paid invoice; the unique index let exactly one
            // through and nothing of this one was committed. Hand back the winner's order.
            db.ChangeTracker.Clear();
            var winner = await db.OrderPayments.AsNoTracking()
                .Where(p => p.GatewayInvoiceId == payment!.GatewayInvoiceId)
                .Join(db.Orders.AsNoTracking(), p => p.OrderId, o => o.Id, (p, o) => o)
                .FirstOrDefaultAsync(ct);
            if (winner is null) return CheckoutResult<PlacedOrder>.Fail(409, "This payment has already been used for another order.");
            var row = await db.OnlinePayments.FirstOrDefaultAsync(p => p.Id == payment!.Id, ct);
            if (row is not null && row.Status != "ordered")
            {
                row.Status = "ordered"; row.OrderId = winner.Id; row.ResolvedAt = DateTime.UtcNow; row.UpdatedAt = DateTime.UtcNow;
                await db.SaveChangesAsync(ct);
            }
            return CheckoutResult<PlacedOrder>.Success(new PlacedOrder(winner.Id, winner.OrderNumber, winner.TotalAmount));
        }

        // Tell the branch an order is waiting. This is the only event in the system with nobody
        // present when it happens — an online order arrives while the shop is doing something
        // else, and it sits at "pending" until a human approves it. Best-effort: a failure here
        // must never fail the customer's order, which is already committed above.
        try
        {
            var itemCount = totals.Items.Sum(i => i.Quantity);
            await notifications.NotifyRoleAsync(
                StaffRoles, branchId, "Online Orders", "New Online Order",
                $"New order · SAR {order.TotalAmount:F2}{(payment is not null ? " · paid online" : "")}",
                $"{req.FullName.Trim()} · {itemCount:0.##} item{(itemCount == 1 ? "" : "s")} · " +
                $"waiting for approval · {order.OrderNumber}",
                severity: "info", entityType: "Order", entityId: order.Id);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Notification failed for online order {OrderId}", order.Id);
        }

        return CheckoutResult<PlacedOrder>.Success(new PlacedOrder(order.Id, order.OrderNumber, order.TotalAmount));
    }

    // ── Refund ───────────────────────────────────────────────────────────

    public async Task<CheckoutResult<MyFatoorahRefund>> RefundAsync(OnlinePayment payment, string reason, Guid? userId, CancellationToken ct)
    {
        if (payment.Status == "refunded")
            return CheckoutResult<MyFatoorahRefund>.Fail(400, "This payment has already been refunded.");

        // The refund goes through the same MyFatoorah account the invoice was raised on. Note we
        // don't require the integration to still be *enabled* — a merchant that switched Pay
        // Online off must still be able to refund what was paid while it was on.
        var row = await db.PaymentIntegrations.AsNoTracking()
            .FirstOrDefaultAsync(p => p.BranchId == payment.BranchId && p.Provider == "MyFatoorah", ct);
        var account = row is null ? null : MyFatoorahMerchantAccount.FromConfigJson(row.ConfigJson);
        if (account is null)
            return CheckoutResult<MyFatoorahRefund>.Fail(400, "This branch has no MyFatoorah account configured to refund from.");

        var (ok, status, error) = await myFatoorah.GetPaymentStatusAsync(account, payment.GatewayInvoiceId, ct);
        if (!ok || status is null)
            return CheckoutResult<MyFatoorahRefund>.Fail(502, $"Could not reach the payment gateway to refund: {error}");
        if (status.Status != "Paid")
            return CheckoutResult<MyFatoorahRefund>.Fail(400, $"MyFatoorah reports this invoice as '{status.Status}', not Paid — nothing to refund.");

        // Full refund. MakeRefund's Amount is in the ACCOUNT's currency, which is exactly what
        // GetPaymentStatus's InvoiceValue is (3.012 KD for a "37.200 SR" invoice on a KWD demo
        // account) — so refund that figure, never our SAR total.
        var (refunded, refund, refundError) = await myFatoorah.MakeRefundAsync(
            account, payment.GatewayInvoiceId, status.InvoiceValue,
            $"Mimony Mart refund — {reason}"[..Math.Min(200, $"Mimony Mart refund — {reason}".Length)], ct);
        if (!refunded || refund is null)
            return CheckoutResult<MyFatoorahRefund>.Fail(502, $"MyFatoorah refused the refund: {refundError}");

        var now = DateTime.UtcNow;
        payment.Status = "refunded";
        payment.RefundId = refund.RefundId;
        payment.RefundReference = refund.RefundReference;
        payment.RefundAmount = refund.Amount;
        payment.RefundCurrency = status.AccountCurrency;
        payment.GatewayPaymentId ??= status.PaymentId;
        payment.ResolvedAt = now;
        payment.UpdatedAt = now;

        if (payment.OrderId is { } orderId)
        {
            var order = await db.Orders.FirstOrDefaultAsync(o => o.Id == orderId, ct);
            if (order is not null)
            {
                order.PaymentStatus = "refunded";
                order.UpdatedAt = now;
            }
            var orderPayments = await db.OrderPayments.Where(p => p.OrderId == orderId && p.GatewayInvoiceId == payment.GatewayInvoiceId).ToListAsync(ct);
            foreach (var op in orderPayments) op.Status = "refunded";
        }
        await db.SaveChangesAsync(ct);

        await audit.LogAsync(
            action: "Online payment refunded",
            entityType: "OnlinePayment", entityId: payment.Id, userId: userId, branchId: payment.BranchId,
            details: $"MyFatoorah invoice {payment.GatewayInvoiceId} · SAR {payment.AmountSar:F2} · refund {refund.RefundId} " +
                     $"({refund.Amount} {status.AccountCurrency}) · {reason}",
            severity: "warning");

        return CheckoutResult<MyFatoorahRefund>.Success(refund);
    }
}
