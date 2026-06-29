using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

[Table("pos_settings")]
public class PosSettings
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    // ── Cashier tab ──────────────────────────────────────────────────────────
    [Column("require_shift_open")]
    public bool RequireShiftOpen { get; set; } = true;

    [Column("require_opening_cash_count")]
    public bool RequireOpeningCashCount { get; set; } = true;

    [Column("auto_lock_idle")]
    public bool AutoLockIdle { get; set; } = true;

    [Column("allow_customer_view_paid_shifts")]
    public bool AllowCustomerViewPaidShifts { get; set; } = false;

    // ── Terminal tab ─────────────────────────────────────────────────────────
    [Column("allow_terminal_switching")]
    public bool AllowTerminalSwitching { get; set; } = true;

    [Column("preserve_held_orders")]
    public bool PreserveHeldOrders { get; set; } = true;

    [Column("offline_mode_enabled")]
    public bool OfflineModeEnabled { get; set; } = false;

    // ── Invoice / print tab ──────────────────────────────────────────────────
    [Column("auto_print_receipt")]
    public bool AutoPrintReceipt { get; set; } = true;

    [Column("send_sms_invoice")]
    public bool SendSmsInvoice { get; set; } = false;

    // ── Permissions tab ──────────────────────────────────────────────────────
    [Column("cashier_can_discount")]
    public bool CashierCanDiscount { get; set; } = true;

    [Column("cashier_can_coupon")]
    public bool CashierCanCoupon { get; set; } = true;

    [Column("cashier_can_refund")]
    public bool CashierCanRefund { get; set; } = false;

    [Column("cashier_can_hold_order")]
    public bool CashierCanHoldOrder { get; set; } = true;

    [Column("cashier_can_edit_order")]
    public bool CashierCanEditOrder { get; set; } = false;

    [Column("require_reason_for_void")]
    public bool RequireReasonForVoid { get; set; } = true;

    [Column("require_manager_approval_for_refund")]
    public bool RequireManagerApprovalForRefund { get; set; } = true;

    [Column("allow_negative_stock")]
    public bool AllowNegativeStock { get; set; } = false;

    // ── Scan & expiry tab ────────────────────────────────────────────────────
    [Column("beep_on_scan")]
    public bool BeepOnScan { get; set; } = true;

    [Column("warn_near_expiry")]
    public bool WarnNearExpiry { get; set; } = true;

    [Column("allow_near_expiry_sale")]
    public bool AllowNearExpirySale { get; set; } = true;

    [Column("block_expired_items")]
    public bool BlockExpiredItems { get; set; } = true;

    [Column("block_nonpermissible_items")]
    public bool BlockNonpermissibleItems { get; set; } = true;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Branch? Branch { get; set; }
}
