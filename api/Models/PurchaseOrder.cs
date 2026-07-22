using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace BaqalaPOS.Api.Models;

[Table("purchase_orders")]
public class PurchaseOrder
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [MaxLength(50), Column("po_number")]
    public string? PoNumber { get; set; }

    [Required, Column("supplier_id")]
    public Guid SupplierId { get; set; }

    // Destination: warehouse or branch
    [Column("warehouse_id")]
    public Guid? WarehouseId { get; set; }

    [Column("branch_id")]
    public Guid? BranchId { get; set; }

    [Required, Column("ordered_by")]
    public Guid OrderedBy { get; set; }

    [Column("approved_by")]
    public Guid? ApprovedBy { get; set; }

    // Who actually received the delivery against this PO (set by Receive). Mirrors
    // StockTransfer.ReceivedBy — was previously only recorded in the stock-movement audit log,
    // never persisted on the PO itself.
    [Column("received_by")]
    public Guid? ReceivedBy { get; set; }

    // Who actually created this PO record — distinct from OrderedBy (the requester it was placed
    // on behalf of). Backfilled to OrderedBy for rows that predate this column.
    [Required, Column("created_by")]
    public Guid CreatedBy { get; set; }

    // draft | sent | partial_received | fully_received | cancelled
    [Required, MaxLength(25), Column("status")]
    public string Status { get; set; } = "draft";

    // unpaid | partial | paid
    [Required, MaxLength(20), Column("payment_status")]
    public string PaymentStatus { get; set; } = "unpaid";

    // immediate | on_delivery | net_30 | net_60
    [MaxLength(20), Column("payment_terms")]
    public string? PaymentTerms { get; set; } = "on_delivery";

    [Column("total_amount")]
    public decimal TotalAmount { get; set; } = 0;

    [Column("paid_amount")]
    public decimal PaidAmount { get; set; } = 0;

    [Column("tax_amount")]
    public decimal TaxAmount { get; set; } = 0;

    [Column("discount_amount")]
    public decimal DiscountAmount { get; set; } = 0;

    [Column("expected_delivery_date")]
    public DateTime? ExpectedDeliveryDate { get; set; }

    [Column("received_date")]
    public DateTime? ReceivedDate { get; set; }

    [Column("notes")]
    public string? Notes { get; set; }

    // Links all POs created together (multi-warehouse batch)
    [MaxLength(50), Column("batch_id")]
    public string? BatchId { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Supplier? Supplier { get; set; }
    public Warehouse? Warehouse { get; set; }
    public Branch? Branch { get; set; }
    public User? OrderedByUser { get; set; }
    public User? ApprovedByUser { get; set; }
    public User? CreatedByUser { get; set; }
    public User? ReceivedByUser { get; set; }
    public ICollection<PurchaseOrderItem> Items { get; set; } = [];
    public ICollection<SupplierPayment> Payments { get; set; } = [];
}

[Table("purchase_order_items")]
public class PurchaseOrderItem
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("po_id")]
    public Guid PoId { get; set; }

    [Required, Column("product_id")]
    public Guid ProductId { get; set; }

    [Column("ordered_quantity")]
    public decimal OrderedQuantity { get; set; }

    [Column("received_quantity")]
    public decimal ReceivedQuantity { get; set; } = 0;

    [Column("unit_cost")]
    public decimal UnitCost { get; set; }

    [Column("subtotal")]
    public decimal Subtotal { get; set; }

    [Column("expiry_date")]
    public DateTime? ExpiryDate { get; set; }

    [Column("notes")]
    public string? Notes { get; set; }

    // pending | partial | received
    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "pending";

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    // Without this, EF's convention can't match the "PurchaseOrder" navigation to the "PoId"
    // column (it looks for "PurchaseOrderId" by convention) and silently adds a second, unused
    // shadow FK column instead of reusing PoId.
    [ForeignKey(nameof(PoId))]
    [JsonIgnore] public PurchaseOrder? PurchaseOrder { get; set; }
    public Product? Product { get; set; }
}

[Table("supplier_payments")]
public class SupplierPayment
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("po_id")]
    public Guid PoId { get; set; }

    [Required, Column("supplier_id")]
    public Guid SupplierId { get; set; }

    [Column("amount")]
    public decimal Amount { get; set; }

    [Required, Column("payment_date")]
    public DateTime PaymentDate { get; set; }

    // cash | bank_transfer | cheque | card
    [Required, MaxLength(20), Column("payment_method")]
    public string PaymentMethod { get; set; } = "cash";

    [MaxLength(100), Column("reference_number")]
    public string? ReferenceNumber { get; set; }

    [Column("notes")]
    public string? Notes { get; set; }

    [Required, Column("recorded_by")]
    public Guid RecordedBy { get; set; }

    // completed | pending | cancelled
    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "completed";

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    // Same fix as PurchaseOrderItem below: pin the FK to the real PoId column instead of
    // letting EF create a second "PurchaseOrderId" shadow column for the same relationship —
    // that shadow column is NOT NULL in the actual database and never gets a value, so every
    // payment insert failed with "Column 'PurchaseOrderId' cannot be null".
    [ForeignKey(nameof(PoId))]
    [JsonIgnore] public PurchaseOrder? PurchaseOrder { get; set; }
    public Supplier? Supplier { get; set; }
    public User? RecordedByUser { get; set; }
}
