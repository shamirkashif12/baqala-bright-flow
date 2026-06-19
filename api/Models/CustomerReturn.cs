using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

// FR-FIN-04: Customer refunds and returns merged into Customer Returns
[Table("customer_returns")]
public class CustomerReturn
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [MaxLength(50), Column("return_number")]
    public string? ReturnNumber { get; set; }

    [Required, Column("order_id")]
    public Guid OrderId { get; set; }

    [Required, Column("customer_id")]
    public Guid CustomerId { get; set; }

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    [Column("processed_by")]
    public Guid? ProcessedBy { get; set; }

    // full_return | partial_return | exchange
    [Required, MaxLength(20), Column("return_type")]
    public string ReturnType { get; set; } = "full_return";

    // cash | store_credit | original_payment
    [Required, MaxLength(25), Column("refund_method")]
    public string RefundMethod { get; set; } = "original_payment";

    [Column("refund_amount")]
    public decimal RefundAmount { get; set; }

    [Required, MaxLength(500), Column("reason")]
    public string Reason { get; set; } = default!;

    [Column("notes")]
    public string? Notes { get; set; }

    // pending | approved | rejected | completed
    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "pending";

    [Column("approved_by")]
    public Guid? ApprovedBy { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Order? Order { get; set; }
    public Customer? Customer { get; set; }
    public Branch? Branch { get; set; }
    public User? ProcessedByUser { get; set; }
    public User? ApprovedByUser { get; set; }
    public ICollection<CustomerReturnItem> Items { get; set; } = [];
}

[Table("customer_return_items")]
public class CustomerReturnItem
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("return_id")]
    public Guid ReturnId { get; set; }

    [Required, Column("product_id")]
    public Guid ProductId { get; set; }

    [Column("order_item_id")]
    public Guid? OrderItemId { get; set; }

    [Column("quantity")]
    public decimal Quantity { get; set; }

    [Column("unit_price")]
    public decimal UnitPrice { get; set; }

    [Column("refund_amount")]
    public decimal RefundAmount { get; set; }

    [MaxLength(255), Column("condition")]
    public string? Condition { get; set; } // good | damaged | expired

    [Column("restock")]
    public bool Restock { get; set; } = true;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public CustomerReturn? Return { get; set; }
    public Product? Product { get; set; }
}
