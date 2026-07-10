using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace BaqalaPOS.Api.Models;

[Table("orders")]
public class Order
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [MaxLength(50), Column("order_number")]
    public string OrderNumber { get; set; } = string.Empty;

    [Required, MaxLength(20), Column("source")]
    public string Source { get; set; } = "pos"; // pos | online | kiosk

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    [Column("customer_id")]
    public Guid? CustomerId { get; set; }

    [Column("cashier_id")]
    public Guid? CashierId { get; set; }

    [Column("terminal_id")]
    public Guid? TerminalId { get; set; }

    [Column("shift_id")]
    public Guid? ShiftId { get; set; }

    [Column("coupon_id")]
    public Guid? CouponId { get; set; }

    [Column("subtotal")]
    public decimal Subtotal { get; set; }

    [Column("discount_amount")]
    public decimal DiscountAmount { get; set; } = 0;

    [Column("tax_amount")]
    public decimal TaxAmount { get; set; } = 0;

    [Column("custom_fee_amount")]
    public decimal CustomFeeAmount { get; set; } = 0;

    [Column("total_amount")]
    public decimal TotalAmount { get; set; }

    // pending | paid | partially_paid | refunded | cancelled
    [Required, MaxLength(20), Column("payment_status")]
    public string PaymentStatus { get; set; } = "pending";

    // pending | processing | ready_to_deliver | delivered | cancelled | refunded
    [Required, MaxLength(25), Column("order_status")]
    public string OrderStatus { get; set; } = "pending";

    [Column("notes")]
    public string? Notes { get; set; }

    // Set when this order was voided/cancelled — PosSettings.RequireReasonForVoid gates whether
    // a reason is mandatory.
    [Column("void_reason")]
    public string? VoidReason { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Branch? Branch { get; set; }
    public Customer? Customer { get; set; }
    public User? Cashier { get; set; }
    public Terminal? Terminal { get; set; }
    public CashierShift? Shift { get; set; }
    public Coupon? Coupon { get; set; }
    public ICollection<OrderItem> Items { get; set; } = [];
    public ICollection<OrderPayment> Payments { get; set; } = [];
    [JsonIgnore] public ICollection<CustomerReturn> Returns { get; set; } = [];

    // Populated only on the Create response (not persisted) so the receipt can render the real
    // ZATCA-signed QR instead of a client-reconstructed approximation. Null when Phase 2 isn't
    // onboarded for the branch, or when submission failed — callers should fall back to a
    // Phase-1-style QR in that case.
    [NotMapped] public string? ZatcaQrCode { get; set; }
    [NotMapped] public string? ZatcaInvoiceStatus { get; set; }
}

[Table("order_items")]
public class OrderItem
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("order_id")]
    public Guid OrderId { get; set; }

    [Required, Column("product_id")]
    public Guid ProductId { get; set; }

    [Column("batch_id")]
    public Guid? BatchId { get; set; }

    [Column("quantity")]
    public decimal Quantity { get; set; }

    [Column("unit_price")]
    public decimal UnitPrice { get; set; }

    [Column("discount_amount")]
    public decimal DiscountAmount { get; set; } = 0;

    [Column("tax_amount")]
    public decimal TaxAmount { get; set; } = 0;

    [Column("custom_fee_amount")]
    public decimal CustomFeeAmount { get; set; } = 0;

    [Column("total_price")]
    public decimal TotalPrice { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    [JsonIgnore] public Order? Order { get; set; }
    public Product? Product { get; set; }
    public InventoryBatch? Batch { get; set; }
}

[Table("order_payments")]
public class OrderPayment
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("order_id")]
    public Guid OrderId { get; set; }

    [Required, MaxLength(20), Column("payment_method")]
    public string PaymentMethod { get; set; } = default!; // cash | card | wallet | qr

    [Column("amount")]
    public decimal Amount { get; set; }

    [MaxLength(255), Column("reference_number")]
    public string? ReferenceNumber { get; set; }

    [MaxLength(20), Column("status")]
    public string Status { get; set; } = "completed";

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    [JsonIgnore] public Order? Order { get; set; }
}
