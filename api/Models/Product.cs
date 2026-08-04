using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;
using BaqalaPOS.Api.Services;

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

    // The unit this product is stocked, counted and priced in — BasePrice is always the price of
    // ONE of these (per kilogram, per litre, per piece), exactly how a shelf-edge tag reads.
    // Constrained to UnitOfMeasureCatalog codes and normalised on every write; it decides whether
    // fractional quantities are legal and which UN/ECE code the ZATCA invoice line carries.
    [Required, MaxLength(50), Column("unit_of_measure")]
    public string UnitOfMeasure { get; set; } = UnitOfMeasureCatalog.DefaultCode;

    // Derived from UnitOfMeasure on every write (ProductsController.NormalizeUnitFields) — kept as
    // a stored column because sale, transfer, PO, report and POS paths all read it, and because
    // pre-catalog rows set it independently. Never set it directly: it is an output of the unit,
    // not a second input. See QuantityValidation.AllowsFractional.
    [Column("weight_based")]
    public bool WeightBased { get; set; } = false;

    // Average weight/volume of one physical item, expressed in this product's own UnitOfMeasure
    // (e.g. 0.12 for a tomato on a per-kg product). Optional, and only meaningful for a
    // weight/volume/length product.
    //
    // This is what lets a weighed product ALSO be rung up by the piece — a customer asking for
    // "3 tomatoes" instead of a weighed bag. The POS converts 3 → 0.36 kg and the sale deducts
    // stock and prices in kg as normal, so there is still exactly one SKU and one stock pool. It
    // is deliberately an estimate: pre-packed goods that must be counted exactly are a separate
    // product linked via LooseUnitProductId, not this.
    [Column("estimated_unit_weight")]
    public decimal? EstimatedUnitWeight { get; set; }

    // How this product is sold (FRD §12 Pack & Unit pricing).
    //   single — one item is one sellable unit (the default, and every pre-existing product).
    //   pack   — the sellable unit IS a pack of ItemsPerPack items, priced as a whole (BasePrice is
    //            the pack price). It stocks and sells exactly like a single product: selling one
    //            pack decrements on-hand by 1, so stock, batches, FEFO, tax and every report are
    //            untouched. ItemsPerPack is informational (shown on shelf-edge / receipts), not a
    //            stock multiplier — that is the whole reason it can't break any existing flow.
    [Required, MaxLength(10), Column("sale_unit_type")]
    public string SaleUnitType { get; set; } = "single"; // single | pack

    // Items contained in one pack. Required when SaleUnitType == "pack", null otherwise.
    [Column("items_per_pack")]
    public int? ItemsPerPack { get; set; }

    // The "single" product this pack breaks down into (e.g. a carton-of-12-eggs pack product
    // links to the individual-egg single product). Only meaningful when SaleUnitType == "pack" —
    // it is what lets InventoryController's Break Pack action convert on-hand cartons into
    // on-hand loose units (ItemsPerPack of them per pack), which nothing else in the pack model
    // does: selling a pack normally still just decrements the pack's own on-hand by 1.
    [Column("loose_unit_product_id")]
    public Guid? LooseUnitProductId { get; set; }

    [Column("base_price")]
    public decimal BasePrice { get; set; }

    [Column("cost_price")]
    public decimal? CostPrice { get; set; }

    [Column("tax_percentage")]
    public decimal TaxPercentage { get; set; } = 0;

    [Column("is_tobacco")]
    public bool IsTobacco { get; set; } = false;

    // Staff can exclude specific items (weight-priced produce, high-shrink SKUs,
    // age-restricted items) from the self-checkout kiosk catalog.
    [Column("allow_self_checkout")]
    public bool AllowSelfCheckout { get; set; } = true;

    [Column("discount")]
    public decimal? Discount { get; set; }

    [MaxLength(20), Column("discount_type")]
    public string? DiscountType { get; set; } // "percentage" | "fixed"

    [Column("image_url")]
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
    public ICollection<ProductVariant> Variants { get; set; } = [];
    public Product? LooseUnitProduct { get; set; }
}

// One price rule for a product. Historically this table existed but nothing read or wrote it —
// every price in the system was Product.BasePrice. It is now the single substrate behind
// branch-based, customer-tier, scheduled, and pack pricing, resolved by IPriceResolutionService.
//
// A product with no rows here (the overwhelming majority) still prices at BasePrice, which is why
// activating this table is backwards-compatible: absence of a rule is not absence of a price.
[Table("product_price_lists")]
public class ProductPriceList
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("product_id")]
    public Guid ProductId { get; set; }

    // null = applies to every branch (tenant-wide default). A branch-specific rule always beats a
    // tenant-wide one at the same specificity — see PriceResolutionService's ordering.
    [Column("branch_id")]
    public Guid? BranchId { get; set; }

    [Required, MaxLength(50), Column("price_type")]
    public string PriceType { get; set; } = "standard"; // standard | online

    [Required, Column("price")]
    public decimal Price { get; set; }

    // Scheduled pricing. EffectiveFrom is inclusive, EffectiveTo exclusive-of-the-day (compared as
    // a full timestamp). A null EffectiveTo means open-ended. Rows whose window doesn't contain
    // "now" are invisible to resolution, which is what makes "this price until Friday, then that
    // one" expressible as two rows rather than a scheduled job that rewrites BasePrice.
    [Column("effective_from")]
    public DateTime EffectiveFrom { get; set; }

    [Column("effective_to")]
    public DateTime? EffectiveTo { get; set; }

    // Customer-group pricing. null = applies to everyone including anonymous walk-ins. Otherwise
    // the customer's Customer.Tier must match this exact value — a "silver" row never serves gold
    // or platinum. Selecting several tiers for one special price in the UI produces one row per
    // tier (same price/schedule), which is what lets an operator pick any combination (e.g. silver
    // + platinum but not gold) rather than a single cascading "and above" threshold.
    [MaxLength(20), Column("min_customer_tier")]
    public string? MinCustomerTier { get; set; }

    // Pack & unit pricing. "unit" rules set the per-unit price of the product. "pack" rules are
    // NOT a unit price — they are an additional buying option (e.g. "Case of 12 for 100"), offered
    // alongside the unit price rather than replacing it.
    //
    // A pack sells as PackSize units at a derived unit price of Price/PackSize. That derivation is
    // the whole reason packs don't break anything downstream: stock, batches, FEFO consumption,
    // receipts, tax and every report still see N ordinary units of the product, never a new kind of
    // line item. Only the unit price differs.
    [Required, MaxLength(10), Column("unit_type")]
    public string UnitType { get; set; } = "unit"; // unit | pack

    // Units contained in one pack. Required when UnitType == "pack", ignored otherwise.
    [Column("pack_size")]
    public decimal? PackSize { get; set; }

    // Optional distinct barcode for the pack (the case/outer barcode). Scanning it at the POS adds
    // the pack instead of a single unit.
    [MaxLength(100), Column("pack_barcode")]
    public string? PackBarcode { get; set; }

    // Human label for pack options in the POS picker, e.g. "Case of 12".
    [MaxLength(100), Column("label")]
    public string? Label { get; set; }

    // Final deterministic tiebreak when two rules are equally specific. Higher wins. Without this,
    // two same-scope overlapping rules would resolve by insertion order, i.e. arbitrarily.
    [Column("priority")]
    public int Priority { get; set; } = 0;

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("created_by")]
    public Guid? CreatedBy { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Product? Product { get; set; }
    public Branch? Branch { get; set; }
}

/// <summary>
/// An explicit "these two products are interchangeable" link, so a cashier facing an out-of-stock
/// item can offer the same goods in another brand (the FRD's brand-substitution ask).
///
/// Explicit rather than inferred: brand alone does not identify substitutes (every product of a
/// brand is not interchangeable with every other), and name/category matching is unreliable in
/// both directions — "Milk 1L" vs "Full Cream Milk 1 Liter" will not fuzzy-match, while
/// "Milk 1L" vs "Milk 2L" wrongly will. A wrong suggestion at the till is worse than no
/// suggestion, so the catalogue owner states the link, matching how LooseUnitProductId is also an
/// explicit pointer rather than a guess.
///
/// Stored symmetrically — the controller writes both directions of a pair — so a substitute is
/// found from whichever side happens to run out.
/// </summary>
[Table("product_substitutes")]
public class ProductSubstitute
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("product_id")]
    public Guid ProductId { get; set; }

    [Required, Column("substitute_product_id")]
    public Guid SubstituteProductId { get; set; }

    [Column("created_by")]
    public Guid? CreatedBy { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [JsonIgnore] public Product? Product { get; set; }
    public Product? SubstituteProduct { get; set; }
}

[Table("product_variants")]
public class ProductVariant
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("product_id")]
    public Guid ProductId { get; set; }

    // size | color | weight | volume | other
    [Required, MaxLength(30), Column("variant_type")]
    public string VariantType { get; set; } = default!;

    // e.g. "Large", "Red", "2kg", "500ml"
    [Required, MaxLength(100), Column("variant_value")]
    public string VariantValue { get; set; } = default!;

    [MaxLength(50), Column("sku_suffix")]
    public string? SkuSuffix { get; set; }

    [MaxLength(100), Column("barcode")]
    public string? Barcode { get; set; }

    [Column("price_modifier")]
    public decimal PriceModifier { get; set; } = 0;

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "active";

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [JsonIgnore] public Product? Product { get; set; }
}
