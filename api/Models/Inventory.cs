using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace BaqalaPOS.Api.Models;

[Table("inventory_stock")]
public class InventoryStock
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("product_id")]
    public Guid ProductId { get; set; }

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    [Column("quantity")]
    public decimal Quantity { get; set; } = 0;

    [Column("reserved_quantity")]
    public decimal ReservedQuantity { get; set; } = 0;

    [Column("reorder_level")]
    public int ReorderLevel { get; set; } = 0;

    [Column("last_updated")]
    public DateTime LastUpdated { get; set; } = DateTime.UtcNow;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Product? Product { get; set; }
    public Branch? Branch { get; set; }
}

[Table("inventory_batches")]
public class InventoryBatch
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [MaxLength(100), Column("batch_number")]
    public string? BatchNumber { get; set; }

    [Required, Column("product_id")]
    public Guid ProductId { get; set; }

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    [Column("supplier_id")]
    public Guid? SupplierId { get; set; }

    [Column("quantity")]
    public decimal Quantity { get; set; }

    [Column("remaining_quantity")]
    public decimal RemainingQuantity { get; set; }

    [Column("purchase_cost")]
    public decimal? PurchaseCost { get; set; }

    [Column("expiry_date")]
    public DateTime? ExpiryDate { get; set; }

    [Required, Column("received_date")]
    public DateTime ReceivedDate { get; set; }

    [MaxLength(255), Column("receiving_location")]
    public string? ReceivingLocation { get; set; }

    [Column("notes")]
    public string? Notes { get; set; }

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "active"; // active | near_expiry | expired | consumed

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Product? Product { get; set; }
    public Branch? Branch { get; set; }
    public Supplier? Supplier { get; set; }
}

[Table("inventory_adjustments")]
public class InventoryAdjustment
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("product_id")]
    public Guid ProductId { get; set; }

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    [Column("batch_id")]
    public Guid? BatchId { get; set; }

    // addition | subtraction | waste | damage | return_to_supplier | transfer_in | transfer_out
    [Required, MaxLength(30), Column("adjustment_type")]
    public string AdjustmentType { get; set; } = default!;

    [Column("quantity")]
    public decimal Quantity { get; set; }

    [Required, MaxLength(500), Column("reason")]
    public string Reason { get; set; } = default!;

    [Column("notes")]
    public string? Notes { get; set; }

    [Column("adjusted_by")]
    public Guid? AdjustedBy { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Product? Product { get; set; }
    public Branch? Branch { get; set; }
    public InventoryBatch? Batch { get; set; }
    public User? AdjustedByUser { get; set; }
}

// Stock Filters — "Stocking review": a physical count session that snapshots system quantity per
// product at start, records what was actually counted (e.g. via barcode scan), and on completion
// posts InventoryAdjustment rows for any variance — reusing the existing adjustment pipeline
// rather than writing a second one.
[Table("stock_counts")]
public class StockCount
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    // Optional scope — count just one category instead of the whole branch.
    [Column("category_id")]
    public Guid? CategoryId { get; set; }

    // draft (open, still counting) | completed | cancelled
    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "draft";

    [Column("started_by")]
    public Guid? StartedBy { get; set; }

    [Column("completed_by")]
    public Guid? CompletedBy { get; set; }

    [Column("notes")]
    public string? Notes { get; set; }

    [Column("started_at")]
    public DateTime StartedAt { get; set; } = DateTime.UtcNow;

    [Column("completed_at")]
    public DateTime? CompletedAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Branch? Branch { get; set; }
    public Category? Category { get; set; }
    public ICollection<StockCountItem> Items { get; set; } = [];
}

[Table("stock_count_items")]
public class StockCountItem
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("stock_count_id")]
    public Guid StockCountId { get; set; }

    [Required, Column("product_id")]
    public Guid ProductId { get; set; }

    // Snapshotted when the count session started (or when this line was first added, for a
    // product scanned that wasn't pre-loaded into the session).
    [Column("system_quantity")]
    public decimal SystemQuantity { get; set; }

    [Column("counted_quantity")]
    public decimal? CountedQuantity { get; set; }

    // CountedQuantity - SystemQuantity, set once counted. Null while still pending.
    [Column("variance")]
    public decimal? Variance { get; set; }

    [Column("counted_at")]
    public DateTime? CountedAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    [JsonIgnore] public StockCount? StockCount { get; set; }
    public Product? Product { get; set; }
}
