using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

[Table("customers")]
public class Customer
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [MaxLength(50), Column("customer_code")]
    public string? CustomerCode { get; set; }

    [Required, MaxLength(255), Column("full_name")]
    public string FullName { get; set; } = default!;

    [Required, MaxLength(50), Column("phone")]
    public string Phone { get; set; } = default!;

    [MaxLength(255), Column("email")]
    public string? Email { get; set; }

    [Column("loyalty_balance")]
    public decimal LoyaltyBalance { get; set; } = 0;

    [Column("total_spend")]
    public decimal TotalSpend { get; set; } = 0;

    [Column("visit_count")]
    public int VisitCount { get; set; } = 0;

    [Required, MaxLength(20), Column("tier")]
    public string Tier { get; set; } = "standard"; // standard | silver | gold | platinum

    [Column("preferred_branch_id")]
    public Guid? PreferredBranchId { get; set; }

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "active";

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Branch? PreferredBranch { get; set; }
    public ICollection<Order> Orders { get; set; } = [];
    public ICollection<LoyaltyTransaction> LoyaltyTransactions { get; set; } = [];
    public ICollection<CustomerReturn> Returns { get; set; } = [];
}
