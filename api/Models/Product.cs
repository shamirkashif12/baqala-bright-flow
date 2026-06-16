using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace BaqalaPOS.Api.Models;

[Table("categories")]
public class Category
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(255), Column("name")]
    public string Name { get; set; } = default!;

    [MaxLength(255), Column("name_ar")]
    public string? NameAr { get; set; }

    [Column("parent_id")]
    public Guid? ParentId { get; set; }

    [Column("description")]
    public string? Description { get; set; }

    [MaxLength(500), Column("image_url")]
    public string? ImageUrl { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("sort_order")]
    public int SortOrder { get; set; } = 0;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Category? Parent { get; set; }
    public ICollection<Category> Children { get; set; } = [];
    [JsonIgnore] public ICollection<Product> Products { get; set; } = [];
}

[Table("products")]
public class Product
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(100), Column("sku")]
    public string Sku { get; set; } = default!;

    [MaxLength(100), Column("barcode")]
    public string? Barcode { get; set; }

    [Required, MaxLength(255), Column("name")]
    public string Name { get; set; } = default!;

    [MaxLength(255), Column("name_ar")]
    public string? NameAr { get; set; }

    [Column("category_id")]
    public Guid? CategoryId { get; set; }

    [MaxLength(255), Column("brand")]
    public string? Brand { get; set; }

    [Column("description")]
    public string? Description { get; set; }

    [Required, MaxLength(50), Column("unit_of_measure")]
    public string UnitOfMeasure { get; set; } = "piece";

    [Column("weight_based")]
    public bool WeightBased { get; set; } = false;

    [Column("base_price")]
    public decimal BasePrice { get; set; }

    [Column("cost_price")]
    public decimal? CostPrice { get; set; }

    [Column("tax_percentage")]
    public decimal TaxPercentage { get; set; } = 0;

    [Column("custom_fee")]
    public decimal CustomFee { get; set; } = 0;

    [MaxLength(500), Column("image_url")]
    public string? ImageUrl { get; set; }

    [Column("reorder_level")]
    public int ReorderLevel { get; set; } = 0;

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "active"; // active | inactive | discontinued

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Category? Category { get; set; }
    [JsonIgnore] public ICollection<InventoryStock> InventoryStocks { get; set; } = [];
    [JsonIgnore] public ICollection<InventoryBatch> Batches { get; set; } = [];
    [JsonIgnore] public ICollection<OrderItem> OrderItems { get; set; } = [];
    [JsonIgnore] public ICollection<ProductPriceList> PriceLists { get; set; } = [];
}

[Table("product_price_lists")]
public class ProductPriceList
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("product_id")]
    public Guid ProductId { get; set; }

    [Column("branch_id")]
    public Guid? BranchId { get; set; }

    [Required, MaxLength(50), Column("price_type")]
    public string PriceType { get; set; } = "standard"; // standard | online | aggregator | wholesale

    [Required, Column("price")]
    public decimal Price { get; set; }

    [Column("effective_from")]
    public DateOnly EffectiveFrom { get; set; }

    [Column("effective_to")]
    public DateOnly? EffectiveTo { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Product Product { get; set; } = default!;
    public Branch? Branch { get; set; }
}
