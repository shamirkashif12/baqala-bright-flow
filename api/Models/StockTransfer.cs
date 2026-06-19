using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace BaqalaPOS.Api.Models;

// Handles ALL 6 transfer directions:
//   supplier_to_warehouse | warehouse_to_branch | branch_to_warehouse
//   branch_to_branch (mart_to_mart) | warehouse_to_warehouse | warehouse_to_supplier (RTS)
[Table("stock_transfers")]
public class StockTransfer
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [MaxLength(50), Column("transfer_number")]
    public string? TransferNumber { get; set; }

    // supplier_to_warehouse | warehouse_to_branch | branch_to_warehouse
    // branch_to_branch | warehouse_to_warehouse | warehouse_to_supplier
    [Required, MaxLength(30), Column("transfer_type")]
    public string TransferType { get; set; } = default!;

    // Source
    [Column("source_branch_id")]
    public Guid? SourceBranchId { get; set; }

    [Column("source_warehouse_id")]
    public Guid? SourceWarehouseId { get; set; }

    [Column("source_supplier_id")]
    public Guid? SourceSupplierId { get; set; }

    // Destination
    [Column("dest_branch_id")]
    public Guid? DestBranchId { get; set; }

    [Column("dest_warehouse_id")]
    public Guid? DestWarehouseId { get; set; }

    [Column("dest_supplier_id")]
    public Guid? DestSupplierId { get; set; }

    // Linked PO (for supplier_to_warehouse receives)
    [Column("purchase_order_id")]
    public Guid? PurchaseOrderId { get; set; }

    [Required, Column("created_by")]
    public Guid CreatedBy { get; set; }

    [Column("approved_by")]
    public Guid? ApprovedBy { get; set; }

    // draft | pending_approval | approved | in_transit | completed | rejected | cancelled
    [Required, MaxLength(25), Column("status")]
    public string Status { get; set; } = "draft";

    // For returns: expired | damaged | quality_issue | overstock | other
    [MaxLength(30), Column("return_reason")]
    public string? ReturnReason { get; set; }

    [Column("notes")]
    public string? Notes { get; set; }

    [Column("expected_date")]
    public DateTime? ExpectedDate { get; set; }

    [Column("completed_date")]
    public DateTime? CompletedDate { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Branch? SourceBranch { get; set; }
    public Warehouse? SourceWarehouse { get; set; }
    public Supplier? SourceSupplier { get; set; }
    public Branch? DestBranch { get; set; }
    public Warehouse? DestWarehouse { get; set; }
    public Supplier? DestSupplier { get; set; }
    public PurchaseOrder? PurchaseOrder { get; set; }
    public User? CreatedByUser { get; set; }
    public User? ApprovedByUser { get; set; }
    public ICollection<StockTransferItem> Items { get; set; } = [];
}

[Table("stock_transfer_items")]
public class StockTransferItem
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("transfer_id")]
    public Guid TransferId { get; set; }

    [Required, Column("product_id")]
    public Guid ProductId { get; set; }

    [Column("batch_id")]
    public Guid? BatchId { get; set; }

    [Column("requested_quantity")]
    public decimal RequestedQuantity { get; set; }

    [Column("approved_quantity")]
    public decimal? ApprovedQuantity { get; set; }

    [Column("received_quantity")]
    public decimal? ReceivedQuantity { get; set; }

    [Column("unit_cost")]
    public decimal? UnitCost { get; set; }

    [Column("expiry_date")]
    public DateTime? ExpiryDate { get; set; }

    // For returns: reason per item (expired | damaged | quality_issue)
    [MaxLength(30), Column("return_reason")]
    public string? ReturnReason { get; set; }

    [Column("notes")]
    public string? Notes { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    [JsonIgnore] public StockTransfer? Transfer { get; set; }
    public Product? Product { get; set; }
    public InventoryBatch? Batch { get; set; }
}
