using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

// One row per POS-checkout card payment sent to the NamiPay terminal, written the moment the
// terminal transaction is initiated — BEFORE the customer taps their card and before the Order
// exists. It is the mart's own record of "we asked the terminal for SAR X at branch B", the same
// job OnlinePayment does for MyFatoorah invoices, because a terminal payment and its sale are two
// events with a gap between them: the card is charged on the terminal, then the POS creates the
// order referencing this row. Anything in that gap (browser crash, pack-break declined, cashier
// walked away) would otherwise leave the terminal holding money with nothing here to show for it.
//
// Status lifecycle:
//   processing → initiated at NamiPay; the terminal is waiting for (or handling) the card
//   approved   → NamiPay reports responseCode "000" but no Order exists yet — the "needs
//                attention" state if it persists (see PosCardPaymentReconcilerService)
//   ordered    → OrderId set; the payment is settled against that sale (terminal)
//   declined   → NamiPay reported a non-"000" result (terminal)
//   cancelled  → the cashier gave up waiting; the reconciler keeps checking it for a while in
//                case the terminal approved anyway (which flips it back to approved + staff alert)
//   expired    → no result ever came back within the wait window (terminal)
[Table("pos_card_payments")]
public class PosCardPayment
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    [Required, MaxLength(30), Column("provider")]
    public string Provider { get; set; } = "Nami";

    /// The NamiPay TID the transaction was sent to (Admin → Payments → Nami → Terminal ID).
    [Required, MaxLength(32), Column("terminal_id")]
    public string TerminalId { get; set; } = default!;

    /// The orderId stamped on the NamiPay request — this app's own correlation/idempotency key
    /// for the transaction (NamiPay itself enforces nothing on it). Unique: one row per attempt.
    [Required, MaxLength(64), Column("order_ref")]
    public string OrderRef { get; set; } = default!;

    /// NamiPay's transactionid from the initiation acknowledgement — the key the result is
    /// polled by (GET /api/nami/payments/response/{id}).
    [MaxLength(64), Column("gateway_transaction_id")]
    public string? GatewayTransactionId { get; set; }

    [Column("amount")]
    public decimal Amount { get; set; }

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "processing";

    /// ISO-8583-style result code from NamiPay — "000" is approved, anything else declined.
    [MaxLength(10), Column("response_code")]
    public string? ResponseCode { get; set; }

    [MaxLength(255), Column("response_message")]
    public string? ResponseMessage { get; set; }

    /// Retrieval Reference Number — the reference on the customer's slip and the key a NamiPay
    /// refund/reversal targets. Becomes the OrderPayment.ReferenceNumber when the sale is linked.
    [MaxLength(32), Column("rrn")]
    public string? Rrn { get; set; }

    [MaxLength(32), Column("auth_code")]
    public string? AuthCode { get; set; }

    /// Masked PAN as NamiPay returns it (e.g. "455036******7601") — never a full card number.
    [MaxLength(32), Column("pan_masked")]
    public string? PanMasked { get; set; }

    [Column("order_id")]
    public Guid? OrderId { get; set; }

    /// Who initiated the payment at the till.
    [Column("cashier_id")]
    public Guid? CashierId { get; set; }

    [MaxLength(500), Column("last_error")]
    public string? LastError { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [Column("approved_at")]
    public DateTime? ApprovedAt { get; set; }

    /// When the row reached a state nothing polls anymore (ordered/declined/expired, or a
    /// cancelled row the reconciler has finished double-checking).
    [Column("resolved_at")]
    public DateTime? ResolvedAt { get; set; }

    /// Set once staff have been alerted about an approved-but-never-ordered payment, so the
    /// reconciler alerts exactly once per row.
    [Column("attention_notified_at")]
    public DateTime? AttentionNotifiedAt { get; set; }
}
