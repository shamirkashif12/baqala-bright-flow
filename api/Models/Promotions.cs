using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

[Table("discounts")]
public class Discount
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(255), Column("name")]
    public string Name { get; set; } = default!;

    [MaxLength(255), Column("name_ar")]
    public string? NameAr { get; set; }

    // all | product | category | branch
    [Required, MaxLength(20), Column("applies_to")]
    public string AppliesTo { get; set; } = "all";

    [Column("product_id")]
    public Guid? ProductId { get; set; }

    [Column("category_id")]
    public Guid? CategoryId { get; set; }

    [Column("branch_id")]
    public Guid? BranchId { get; set; }

    // percentage | fixed
    [Required, MaxLength(20), Column("discount_type")]
    public string DiscountType { get; set; } = "percentage";

    [Column("value")]
    public decimal Value { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("start_date")]
    public DateTime? StartDate { get; set; }

    [Column("end_date")]
    public DateTime? EndDate { get; set; }

    // Eligibility gate — customer-tier/loyalty discounts must not auto-apply to
    // anonymous walk-ins. When true, a customer must be selected at checkout.
    [Column("requires_customer")]
    public bool RequiresCustomer { get; set; } = false;

    // Minimum customer.Tier required (standard | silver | gold | platinum), or null for none.
    [MaxLength(20), Column("min_customer_tier")]
    public string? MinCustomerTier { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation (no [Required] — won't cause model binding errors)
    public Product? Product { get; set; }
    public Branch? Branch { get; set; }
}

[Table("offers")]
public class Offer
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(255), Column("name")]
    public string Name { get; set; } = default!;

    // bogo | combo | buy_a_get_b | product_offer | lucky_draw
    [Required, MaxLength(30), Column("offer_type")]
    public string OfferType { get; set; } = default!;

    [Column("branch_id")]
    public Guid? BranchId { get; set; }

    // Primary product the customer must buy
    [Column("trigger_product_id")]
    public Guid? TriggerProductId { get; set; }

    // Product the customer receives (bogo / buy_a_get_b)
    [Column("get_product_id")]
    public Guid? GetProductId { get; set; }

    [Column("trigger_quantity")]
    public decimal TriggerQuantity { get; set; } = 1;

    [Column("get_quantity")]
    public decimal GetQuantity { get; set; } = 1;

    // Bundle / special price (combo, buy_a_get_b)
    [Column("offer_price")]
    public decimal? OfferPrice { get; set; }

    // For product_offer type
    [Column("discount_percentage")]
    public decimal? DiscountPercentage { get; set; }

    // Human-readable description of items/conditions
    [Column("items_description")]
    public string? ItemsDescription { get; set; }

    // For lucky_draw: minimum basket value to qualify
    [Column("min_basket_amount")]
    public decimal? MinBasketAmount { get; set; }

    [Column("winners")]
    public int? Winners { get; set; }

    [Column("usage_limit")]
    public int? UsageLimit { get; set; }

    [Column("used_count")]
    public int UsedCount { get; set; } = 0;

    [Required, Column("start_date")]
    public DateTime StartDate { get; set; } = DateTime.UtcNow;

    [Required, Column("end_date")]
    public DateTime EndDate { get; set; } = DateTime.UtcNow.AddMonths(1);

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation (no [Required])
    public Branch? Branch { get; set; }
    public Product? TriggerProduct { get; set; }
    public Product? GetProduct { get; set; }
}
