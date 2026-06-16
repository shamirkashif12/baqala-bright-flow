using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

[Table("warehouse_requests")]
public class WarehouseRequest
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(50), Column("request_number")]
    public string RequestNumber { get; set; } = default!;

    [Column("source_branch_id")]
    public Guid? SourceBranchId { get; set; }

    [Required, Column("destination_branch_id")]
    public Guid DestinationBranchId { get; set; }

    [Column("supplier_id")]
    public Guid? SupplierId { get; set; }

    [Required, Column("requested_by")]
    public Guid RequestedBy { get; set; }

    [Column("approved_by")]
    public Guid? ApprovedBy { get; set; }

    // request_generated | approved | unapproved
    [Required, MaxLength(25), Column("approval_status")]
    public string ApprovalStatus { get; set; } = "request_generated";

    // pending | on_way | delivered
    [Required, MaxLength(15), Column("delivery_status")]
    public string DeliveryStatus { get; set; } = "pending";

    [Column("notes")]
    public string? Notes { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Branch? SourceBranch { get; set; }
    public Branch DestinationBranch { get; set; } = default!;
    public Supplier? Supplier { get; set; }
    public User RequestedByUser { get; set; } = default!;
    public User? ApprovedByUser { get; set; }
    public ICollection<WarehouseRequestItem> Items { get; set; } = [];
}

[Table("warehouse_request_items")]
public class WarehouseRequestItem
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("request_id")]
    public Guid RequestId { get; set; }

    [Required, Column("product_id")]
    public Guid ProductId { get; set; }

    [Column("batch_id")]
    public Guid? BatchId { get; set; }

    [Column("requested_quantity")]
    public decimal RequestedQuantity { get; set; }

    [Column("approved_quantity")]
    public decimal? ApprovedQuantity { get; set; }

    [Column("available_stock")]
    public decimal? AvailableStock { get; set; }

    [Column("expiry_date")]
    public DateOnly? ExpiryDate { get; set; }

    [Column("notes")]
    public string? Notes { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public WarehouseRequest Request { get; set; } = default!;
    public Product Product { get; set; } = default!;
    public InventoryBatch? Batch { get; set; }
}
