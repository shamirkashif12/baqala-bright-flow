using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

// Per-branch loyalty program configuration. BranchId == null is the single business-wide default
// program every branch falls back to until it gets its own override — resolved via the identical
// "branch-specific active row, else the active default" query duplicated in three places (no
// shared service layer in this codebase): LoyaltyController.ResolveEffectiveAsync,
// OrdersController.ResolveLoyaltyProgramAsync, ReturnsController.ResolveLoyaltyProgramAsync. Keep
// all three in sync if this resolution rule ever changes (e.g. a branch-hierarchy fallback).
[Table("loyalty_programs")]
public class LoyaltyProgram
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("branch_id")]
    public Guid? BranchId { get; set; }

    [Required, MaxLength(255), Column("program_name")]
    public string ProgramName { get; set; } = "Loyalty Rewards";

    [Column("description")]
    public string? Description { get; set; }

    // Base64 data-URL, same convention as EmployeeDocument.FileUrl / Product.ImageUrl.
    [Column("logo_url", TypeName = "longtext")]
    public string? LogoUrl { get; set; }

    [MaxLength(20), Column("brand_color")]
    public string? BrandColor { get; set; } = "#7c3aed";

    [Column("points_per_currency_unit")]
    public decimal PointsPerCurrencyUnit { get; set; } = 1m;

    [Column("redemption_value_per_point")]
    public decimal RedemptionValuePerPoint { get; set; } = 0.01m;

    [Column("min_points_to_redeem")]
    public int MinPointsToRedeem { get; set; } = 100;

    [Column("max_redeem_pct_of_order")]
    public decimal? MaxRedeemPctOfOrder { get; set; } = 50m;

    [Column("points_expiry_days")]
    public int? PointsExpiryDays { get; set; } = 365;

    [Column("silver_threshold")]
    public decimal SilverThreshold { get; set; } = 1000m;

    [Column("gold_threshold")]
    public decimal GoldThreshold { get; set; } = 5000m;

    [Column("platinum_threshold")]
    public decimal PlatinumThreshold { get; set; } = 10000m;

    [Column("silver_earn_multiplier")]
    public decimal SilverEarnMultiplier { get; set; } = 1m;

    [Column("gold_earn_multiplier")]
    public decimal GoldEarnMultiplier { get; set; } = 1m;

    [Column("platinum_earn_multiplier")]
    public decimal PlatinumEarnMultiplier { get; set; } = 1m;

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Branch? Branch { get; set; }
}
