using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

// BRD FR-CRM-01: Track loyalty points earn/redeem history
[Table("loyalty_transactions")]
public class LoyaltyTransaction
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("customer_id")]
    public Guid CustomerId { get; set; }

    [Column("order_id")]
    public Guid? OrderId { get; set; }

    [Column("branch_id")]
    public Guid? BranchId { get; set; }

    // earn | redeem | expire | adjust | welcome | birthday
    [Required, MaxLength(20), Column("transaction_type")]
    public string TransactionType { get; set; } = default!;

    [Column("points")]
    public decimal Points { get; set; }

    [Column("balance_after")]
    public decimal BalanceAfter { get; set; }

    [MaxLength(500), Column("description")]
    public string? Description { get; set; }

    [Column("expiry_date")]
    public DateTime? ExpiryDate { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Customer Customer { get; set; } = default!;
    public Order? Order { get; set; }
    public Branch? Branch { get; set; }
}
