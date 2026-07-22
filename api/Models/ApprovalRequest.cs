using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

// Generic maker-checker queue for sensitive actions that had no approval gate at all before this:
// creating a Discount/promo rule, cancelling (voiding) an order, and deleting a product/category.
// Modeled on the InventoryAdjustment approval shape (real status enum + approved_at + rejection
// reason, in its own table) rather than the flag-based approach tried and reverted for Order
// void/discount in migration 20260710122553_RemoveOrderApprovalWorkflow.
//
// The four pre-existing approval flows (Returns/Refunds, Stock Counts, Stock Transfers, Inventory
// write-offs) already have their own tables/status enums and are NOT modeled here — the Approval
// Center report reads this table plus those four directly and merges them for display.
[Table("approval_requests")]
public class ApprovalRequest
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    // discount | order_cancellation | item_deletion
    [Required, MaxLength(30), Column("request_type")]
    public string RequestType { get; set; } = default!;

    // Discount | Order | Product | Category
    [Required, MaxLength(30), Column("entity_type")]
    public string EntityType { get; set; } = default!;

    // Null for "discount" until approved — the Discount row doesn't exist yet at request time.
    [Column("entity_id")]
    public Guid? EntityId { get; set; }

    [Column("branch_id")]
    public Guid? BranchId { get; set; }

    [Required, Column("requested_by")]
    public Guid RequestedBy { get; set; }

    [Column("requested_at")]
    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;

    // pending | approved | rejected
    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "pending";

    [Column("approved_by")]
    public Guid? ApprovedBy { get; set; }

    [Column("approved_at")]
    public DateTime? ApprovedAt { get; set; }

    [MaxLength(500), Column("reason")]
    public string? Reason { get; set; }

    [MaxLength(500), Column("rejection_reason")]
    public string? RejectionReason { get; set; }

    // JSON snapshot of the requested payload (e.g. the DiscountRequest body, or the void reason),
    // so the action can be executed exactly as requested at the moment it's approved.
    [Column("details_json")]
    public string? DetailsJson { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Branch? Branch { get; set; }
    public User? RequestedByUser { get; set; }
    public User? ApprovedByUser { get; set; }
}
