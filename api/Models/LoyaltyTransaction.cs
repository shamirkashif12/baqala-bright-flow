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

    // SAR value snapshot for redeem/adjust rows — captured at the time the transaction happened
    // so historical reporting isn't affected if the program's redemption rate changes later.
    [Column("monetary_value")]
    public decimal? MonetaryValue { get; set; }

    // Set by LoyaltyExpiryService once this earn row's ExpiryDate has been evaluated, so it isn't
    // re-checked (and re-"expired" for 0 points) every sweep cycle forever.
    [Column("expired_flag")]
    public bool ExpiredFlag { get; set; } = false;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Customer? Customer { get; set; }
    public Order? Order { get; set; }
    public Branch? Branch { get; set; }
}
