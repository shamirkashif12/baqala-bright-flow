using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

[Table("suppliers")]
public class Supplier
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(50), Column("supplier_code")]
    public string SupplierCode { get; set; } = default!;

    [Required, MaxLength(255), Column("name")]
    public string Name { get; set; } = default!;

    [MaxLength(255), Column("warehouse_name")]
    public string? WarehouseName { get; set; }

    [MaxLength(255), Column("contact_person")]
    public string? ContactPerson { get; set; }

    [MaxLength(50), Column("contact_number")]
    public string? ContactNumber { get; set; }

    [MaxLength(255), Column("email")]
    public string? Email { get; set; }

    [Column("address")]
    public string? Address { get; set; }

    [MaxLength(100), Column("city")]
    public string? City { get; set; }

    [Required, MaxLength(20), Column("supply_type")]
    public string SupplyType { get; set; } = "warehouse"; // warehouse | mart_to_mart | both

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "active";

    [Column("last_supply_date")]
    public DateOnly? LastSupplyDate { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public ICollection<InventoryBatch> Batches { get; set; } = [];
    public ICollection<WarehouseRequest> WarehouseRequests { get; set; } = [];
}
