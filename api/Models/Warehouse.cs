using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

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
    public DateTime? ExpiryDate { get; set; }

    [Column("notes")]
    public string? Notes { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public WarehouseRequest Request { get; set; } = default!;
    public Product Product { get; set; } = default!;
    public InventoryBatch? Batch { get; set; }
}

// ─── Supply-chain Warehouse entity ────────────────────────────────────────────

[Table("warehouses")]
public class Warehouse
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(50), Column("code")]
    public string Code { get; set; } = default!;

    [Required, MaxLength(255), Column("name")]
    public string Name { get; set; } = default!;

    [MaxLength(255), Column("name_ar")]
    public string? NameAr { get; set; }

    [MaxLength(500), Column("address")]
    public string? Address { get; set; }

    [MaxLength(100), Column("city")]
    public string? City { get; set; }

    [Column("capacity")]
    public decimal? Capacity { get; set; }

    [MaxLength(50), Column("contact_person")]
    public string? ContactPerson { get; set; }

    [MaxLength(50), Column("contact_number")]
    public string? ContactNumber { get; set; }

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "active";

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation — NOT [JsonIgnore] so the API returns linked data
    public ICollection<WarehouseSupplier> WarehouseSuppliers { get; set; } = [];
    public ICollection<BranchWarehouse> BranchWarehouses { get; set; } = [];
    public ICollection<WarehouseStock> Stock { get; set; } = [];
}

[Table("warehouse_suppliers")]
public class WarehouseSupplier
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("warehouse_id")]
    public Guid WarehouseId { get; set; }

    [Required, Column("supplier_id")]
    public Guid SupplierId { get; set; }

    [Column("is_primary")]
    public bool IsPrimary { get; set; } = false;

    [MaxLength(255), Column("notes")]
    public string? Notes { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // [JsonIgnore] on back-reference to break circular serialization cycle
    [JsonIgnore] public Warehouse Warehouse { get; set; } = default!;
    public Supplier Supplier { get; set; } = default!;
}

[Table("branch_warehouses")]
public class BranchWarehouse
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    [Required, Column("warehouse_id")]
    public Guid WarehouseId { get; set; }

    [Column("is_primary")]
    public bool IsPrimary { get; set; } = false;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Branch Branch { get; set; } = default!;
    [JsonIgnore] public Warehouse Warehouse { get; set; } = default!;
}

[Table("warehouse_stock")]
public class WarehouseStock
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("warehouse_id")]
    public Guid WarehouseId { get; set; }

    [Required, Column("product_id")]
    public Guid ProductId { get; set; }

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
    [JsonIgnore] public Warehouse Warehouse { get; set; } = default!;
    public Product Product { get; set; } = default!;
}
