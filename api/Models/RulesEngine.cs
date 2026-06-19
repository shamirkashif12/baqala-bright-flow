using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

// FR-ADM-06: Rules Engine - return rules, discount eligibility, coupon acceptance, approval rules
[Table("rules_engine")]
public class RulesEngine
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(255), Column("rule_name")]
    public string RuleName { get; set; } = default!;

    // return | discount | coupon | approval | custom_fee | tax
    [Required, MaxLength(30), Column("rule_type")]
    public string RuleType { get; set; } = default!;

    // all | category | product | branch | customer_tier | order_amount
    [Required, MaxLength(30), Column("applies_to")]
    public string AppliesTo { get; set; } = "all";

    [Column("applies_to_id")]
    public Guid? AppliesToId { get; set; }

    [Column("branch_id")]
    public Guid? BranchId { get; set; }

    // JSON config: { "maxReturnDays": 7, "requireApproval": true, ... }
    [Required, Column("rule_config")]
    public string RuleConfig { get; set; } = "{}";

    [Column("priority")]
    public int Priority { get; set; } = 0;

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Required, Column("created_by")]
    public Guid CreatedBy { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Branch? Branch { get; set; }
    [ForeignKey(nameof(CreatedBy))]
    public User? CreatedByUser { get; set; }
}
