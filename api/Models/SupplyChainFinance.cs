using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace BaqalaPOS.Api.Models;

// ─── Stock Discrepancy ────────────────────────────────────────────────────────
// Created automatically whenever PO/transfer receive qty differs from ordered qty.

[Table("stock_discrepancies")]
public class StockDiscrepancy
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    // Source: either a PO receive or a stock transfer receive (one will be null)
    [Column("po_id")]
    public Guid? PoId { get; set; }

    [Column("transfer_id")]
    public Guid? TransferId { get; set; }

    [Required, Column("supplier_id")]
    public Guid SupplierId { get; set; }

    [Required, Column("product_id")]
    public Guid ProductId { get; set; }

    [Column("expected_quantity")]
    public decimal ExpectedQuantity { get; set; }

    [Column("received_quantity")]
    public decimal ReceivedQuantity { get; set; }

    [Column("discrepancy_quantity")]
    public decimal DiscrepancyQuantity { get; set; }  // negative = shortage, positive = excess

    [Column("unit_cost")]
    public decimal UnitCost { get; set; }

    [Column("discrepancy_value")]
    public decimal DiscrepancyValue { get; set; }  // abs(discrepancyQty) * unitCost

    // shortage | excess | damage | substitution
    [Required, MaxLength(20), Column("discrepancy_type")]
    public string DiscrepancyType { get; set; } = "shortage";

    // open | acknowledged | debit_note_raised | resolved
    [Required, MaxLength(30), Column("status")]
    public string Status { get; set; } = "open";

    [Column("notes")]
    public string? Notes { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation — ForeignKey attributes map to the column-mapped properties above
    [JsonIgnore, ForeignKey(nameof(PoId))] public PurchaseOrder? PurchaseOrder { get; set; }
    [JsonIgnore, ForeignKey(nameof(TransferId))] public StockTransfer? StockTransfer { get; set; }
    [ForeignKey(nameof(SupplierId))] public Supplier? Supplier { get; set; }
    [ForeignKey(nameof(ProductId))] public Product? Product { get; set; }
}

// ─── Supplier Credit Note ─────────────────────────────────────────────────────
// Auto-created when a warehouse_to_supplier transfer is completed.
// Also manually raised against a discrepancy.

[Table("supplier_credit_notes")]
public class SupplierCreditNote
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [MaxLength(50), Column("credit_note_number")]
    public string? CreditNoteNumber { get; set; }

    [Required, Column("supplier_id")]
    public Guid SupplierId { get; set; }

    // Optional links — one of these will be set
    [Column("po_id")]
    public Guid? PoId { get; set; }

    [Column("transfer_id")]
    public Guid? TransferId { get; set; }

    [Column("discrepancy_id")]
    public Guid? DiscrepancyId { get; set; }

    [Column("amount")]
    public decimal Amount { get; set; }

    // rts_return | damage_claim | shortage_claim | price_adjustment
    [Required, MaxLength(30), Column("credit_type")]
    public string CreditType { get; set; } = "rts_return";

    // draft | confirmed | applied | cancelled
    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "confirmed";

    [Column("notes")]
    public string? Notes { get; set; }

    [Column("issued_date")]
    public DateTime IssuedDate { get; set; } = DateTime.UtcNow;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    [ForeignKey(nameof(SupplierId))] public Supplier? Supplier { get; set; }
    [JsonIgnore, ForeignKey(nameof(PoId))] public PurchaseOrder? PurchaseOrder { get; set; }
    [JsonIgnore, ForeignKey(nameof(TransferId))] public StockTransfer? StockTransfer { get; set; }
    [JsonIgnore, ForeignKey(nameof(DiscrepancyId))] public StockDiscrepancy? Discrepancy { get; set; }
}
