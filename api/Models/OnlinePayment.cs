using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

// One row per online-order card payment, written the moment the MyFatoorah invoice is created —
// BEFORE any money moves and long before an Order exists. This is the mart's own record of
// "we asked a shopper for SAR X on invoice N for branch B, and here is exactly what they were
// buying and where it goes" (CheckoutJson holds the whole PlaceOnlineOrderRequest).
//
// It exists because a payment and an order are two events with a gap between them: the shopper
// pays on MyFatoorah's page, then the browser asks the mart to place the order. Anything in that
// gap (item sold out, tab closed, phone died, API restart) used to leave MyFatoorah holding money
// with nothing in the mart to show for it — no way to see it, refund it, or turn it into the
// order the shopper thought they had placed. With this row: the reconciler
// (OnlinePaymentReconcilerService) can still create the order from CheckoutJson when MyFatoorah
// says Paid, staff can see unresolved payments and refund or place them by hand, and Reject on a
// paid order can refund through the same record.
//
// Status lifecycle:
//   created  → invoice raised, not yet paid (MyFatoorah invoices expire after ~3 days)
//   paid     → MyFatoorah reports Paid but no Order exists yet — the "needs attention" state if
//              it persists (placement failed / never attempted)
//   ordered  → OrderId set; the payment is settled against that order
//   refunded → refund requested at MyFatoorah (RefundId/RefundReference kept); terminal
//   expired  → MyFatoorah reports Expired/Canceled without ever being paid; terminal
[Table("online_payments")]
public class OnlinePayment
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    [Required, MaxLength(30), Column("provider")]
    public string Provider { get; set; } = "MyFatoorah";

    /// MyFatoorah InvoiceId. Unique: one row per invoice, mirroring order_payments.gateway_invoice_id.
    [Column("gateway_invoice_id")]
    public long GatewayInvoiceId { get; set; }

    [MaxLength(500), Column("invoice_url")]
    public string? InvoiceUrl { get; set; }

    /// What the shopper was asked to pay, in SAR — the same figure stamped into MyFatoorah's
    /// CustomerReference (see MyFatoorahOrderReference).
    [Column("amount_sar")]
    public decimal AmountSar { get; set; }

    /// The full PlaceOnlineOrderRequest (items + delivery details) serialized at invoice time, so
    /// the order can be created later without the browser.
    [Column("checkout_json")]
    public string CheckoutJson { get; set; } = "{}";

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "created";

    [Column("order_id")]
    public Guid? OrderId { get; set; }

    /// MyFatoorah's PaymentId / TransactionId of the successful transaction — what appears on
    /// their settlement report; captured the first time we see the invoice as Paid.
    [MaxLength(64), Column("gateway_payment_id")]
    public string? GatewayPaymentId { get; set; }

    /// Refund bookkeeping — MyFatoorah's RefundId + RefundReference from MakeRefund, and the
    /// amount refunded in the ACCOUNT's currency (MakeRefund takes account currency, which for a
    /// KWD demo account is not SAR — see OnlineCheckoutService.RefundAsync).
    [Column("refund_id")]
    public long? RefundId { get; set; }

    [MaxLength(64), Column("refund_reference")]
    public string? RefundReference { get; set; }

    [Column("refund_amount")]
    public decimal? RefundAmount { get; set; }

    [MaxLength(10), Column("refund_currency")]
    public string? RefundCurrency { get; set; }

    /// Why the last automatic placement attempt failed (stock, amount mismatch, ...) — shown to
    /// staff on the "payments needing attention" list.
    [MaxLength(500), Column("last_error")]
    public string? LastError { get; set; }

    /// How many times the reconciler tried to place the order for a paid row — it stops retrying
    /// after a few and leaves it to staff.
    [Column("placement_attempts")]
    public int PlacementAttempts { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("paid_at")]
    public DateTime? PaidAt { get; set; }

    [Column("resolved_at")]
    public DateTime? ResolvedAt { get; set; }

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
