using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

[Table("expense_types")]
public class ExpenseType
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(255), Column("name")]
    public string Name { get; set; } = default!;

    [MaxLength(255), Column("name_ar")]
    public string? NameAr { get; set; }

    [Column("description")]
    public string? Description { get; set; }

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public ICollection<Expense> Expenses { get; set; } = [];
}

[Table("expenses")]
public class Expense
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("expense_type_id")]
    public Guid ExpenseTypeId { get; set; }

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    [Column("amount")]
    public decimal Amount { get; set; }

    [Column("description")]
    public string? Description { get; set; }

    [MaxLength(100), Column("reference_number")]
    public string? ReferenceNumber { get; set; }

    [Required, Column("recorded_by")]
    public Guid RecordedBy { get; set; }

    [Required, Column("expense_date")]
    public DateTime ExpenseDate { get; set; }

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "pending"; // pending | approved | rejected

    [Column("approved_by")]
    public Guid? ApprovedBy { get; set; }

    [MaxLength(50), Column("payment_method")]
    public string? PaymentMethod { get; set; } // cash | card | bank_transfer | wallet

    [Column("paid_amount")]
    public decimal? PaidAmount { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public ExpenseType? ExpenseType { get; set; }
    public Branch? Branch { get; set; }
    public User? RecordedByUser { get; set; }
    public User? ApprovedByUser { get; set; }
}

[Table("coupons")]
public class Coupon
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(50), Column("code")]
    public string Code { get; set; } = default!;

    [Required, MaxLength(255), Column("name")]
    public string Name { get; set; } = default!;

    [MaxLength(255), Column("name_ar")]
    public string? NameAr { get; set; }

    // percentage | fixed | buy_one_get_one | combo | chance_to_win
    [Required, MaxLength(25), Column("type")]
    public string Type { get; set; } = default!;

    [Column("value")]
    public decimal Value { get; set; }

    [Column("min_order_amount")]
    public decimal? MinOrderAmount { get; set; }

    [Column("max_discount_amount")]
    public decimal? MaxDiscountAmount { get; set; }

    [Column("usage_limit")]
    public int? UsageLimit { get; set; }

    [Column("used_count")]
    public int UsedCount { get; set; } = 0;

    [Required, MaxLength(20), Column("applicable_to")]
    public string ApplicableTo { get; set; } = "all"; // all | category | product

    [Column("applicable_id")]
    public Guid? ApplicableId { get; set; }

    [Required, Column("start_date")]
    public DateTime StartDate { get; set; }

    [Required, Column("end_date")]
    public DateTime EndDate { get; set; }

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "active"; // active | inactive | expired

    [Required, Column("created_by")]
    public Guid CreatedBy { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public User? CreatedByUser { get; set; }
    public ICollection<Order> Orders { get; set; } = [];
}

[Table("tax_fee_rules")]
public class TaxFeeRule
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(255), Column("rule_name")]
    public string RuleName { get; set; } = default!;

    [Required, MaxLength(25), Column("rule_type")]
    public string RuleType { get; set; } = default!; // vat | custom_fee | tobacco_excise

    // all_products | category | specific_product | branch
    [Required, MaxLength(25), Column("applicable_to")]
    public string ApplicableTo { get; set; } = "all_products";

    [Column("applicable_id")]
    public Guid? ApplicableId { get; set; }

    [Column("branch_id")]
    public Guid? BranchId { get; set; }

    [Column("vat_percentage")]
    public decimal VatPercentage { get; set; } = 0;

    [Column("custom_fee_amount")]
    public decimal CustomFeeAmount { get; set; } = 0;

    [Column("excise_percentage")]
    public decimal ExcisePercentage { get; set; } = 0;

    [Column("zatca_enabled")]
    public bool ZatcaEnabled { get; set; } = false;

    [Column("is_tobacco")]
    public bool IsTobacco { get; set; } = false;

    [Required, Column("effective_date")]
    public DateTime EffectiveDate { get; set; }

    [Column("end_date")]
    public DateTime? EndDate { get; set; }

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "active";

    [Required, Column("created_by")]
    public Guid CreatedBy { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Branch? Branch { get; set; }
    public User? CreatedByUser { get; set; }
}
