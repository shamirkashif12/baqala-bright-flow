using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

// FR-SET-01: POS Settings - toggles per branch
[Table("pos_settings")]
public class PosSettings
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    [Column("require_shift_open")]
    public bool RequireShiftOpen { get; set; } = true;

    [Column("require_opening_cash_count")]
    public bool RequireOpeningCashCount { get; set; } = true;

    [Column("allow_customer_view_paid_shifts")]
    public bool AllowCustomerViewPaidShifts { get; set; } = false;

    [Column("allow_negative_stock")]
    public bool AllowNegativeStock { get; set; } = false;

    [Column("require_reason_for_void")]
    public bool RequireReasonForVoid { get; set; } = true;

    [Column("require_manager_approval_for_refund")]
    public bool RequireManagerApprovalForRefund { get; set; } = true;

    [Column("auto_print_receipt")]
    public bool AutoPrintReceipt { get; set; } = true;

    [Column("offline_mode_enabled")]
    public bool OfflineModeEnabled { get; set; } = false;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Branch Branch { get; set; } = default!;
}
