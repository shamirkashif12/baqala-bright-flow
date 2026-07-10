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

    // ── Expiry policy tab ────────────────────────────────────────────────────
    [Column("close_to_expiry_alert_days")]
    public int CloseToExpiryAlertDays { get; set; } = 7;

    [Column("allow_expiry_manager_override")]
    public bool AllowExpiryManagerOverride { get; set; } = false;

    [Column("auto_move_expired_to_blocked_list")]
    public bool AutoMoveExpiredToBlockedList { get; set; } = true;

    [Column("expiry_notification_frequency_hours")]
    public int ExpiryNotificationFrequencyHours { get; set; } = 24;

    // ── Permissible items policy tab ─────────────────────────────────────────
    [Column("tobacco_age_restricted")]
    public bool TobaccoAgeRestricted { get; set; } = true;

    [Column("tobacco_require_manager_approval")]
    public bool TobaccoRequireManagerApproval { get; set; } = false;

    [Column("block_age_restricted_at_cashier")]
    public bool BlockAgeRestrictedAtCashier { get; set; } = false;

    [Column("min_customer_age")]
    public int MinCustomerAge { get; set; } = 21;

    // ── Returns policy tab ───────────────────────────────────────────────────
    [Column("return_window_days")]
    public int ReturnWindowDays { get; set; } = 14;

    [Column("return_require_receipt_only")]
    public bool ReturnRequireReceiptOnly { get; set; } = true;

    [Column("allow_returns_without_receipt")]
    public bool AllowReturnsWithoutReceipt { get; set; } = false;

    /// Real gate: read by `ReturnsController.GetManagerApprovalRefundThresholdAsync`
    /// for the cashier-vs-manager approval check on `PATCH /returns/{id}/approve`.
    [Column("return_manager_approval_above_sar")]
    public decimal ReturnManagerApprovalAboveSar { get; set; } = 100m;

    [Column("refundable_cash")]
    public bool RefundableCash { get; set; } = true;

    [Column("refundable_card")]
    public bool RefundableCard { get; set; } = true;

    [Column("refundable_wallet")]
    public bool RefundableWallet { get; set; } = true;

    [Column("issue_store_credit_for_damaged_items")]
    public bool IssueStoreCreditForDamagedItems { get; set; } = true;

    [Column("allow_expired_item_return")]
    public bool AllowExpiredItemReturn { get; set; } = false;

    // ── Refund policy tab ────────────────────────────────────────────────────
    [Column("max_refund_per_cashier_sar")]
    public decimal MaxRefundPerCashierSar { get; set; } = 200m;

    [Column("refund_manager_approval_above_sar")]
    public decimal RefundManagerApprovalAboveSar { get; set; } = 500m;

    [Column("allow_refund_reversal_within_24h")]
    public bool AllowRefundReversalWithin24h { get; set; } = true;

    [Column("auto_print_refund_receipt")]
    public bool AutoPrintRefundReceipt { get; set; } = true;

    // ── Discount policy tab ──────────────────────────────────────────────────
    [Column("cashier_max_discount_pct")]
    public decimal CashierMaxDiscountPct { get; set; } = 5m;

    [Column("manager_max_discount_pct")]
    public decimal ManagerMaxDiscountPct { get; set; } = 25m;

    [Column("require_reason_for_discount")]
    public bool RequireReasonForDiscount { get; set; } = true;

    // ── Coupon policy tab ────────────────────────────────────────────────────
    [Column("combine_multiple_coupons")]
    public bool CombineMultipleCoupons { get; set; } = false;

    [Column("max_coupon_value_sar")]
    public decimal MaxCouponValueSar { get; set; } = 50m;

    // ── Cashier shift policy tab ─────────────────────────────────────────────
    [Column("max_shift_duration_hours")]
    public int MaxShiftDurationHours { get; set; } = 9;

    [Column("require_break_after_4h")]
    public bool RequireBreakAfter4h { get; set; } = true;

    [Column("auto_checkout_on_shift_end")]
    public bool AutoCheckoutOnShiftEnd { get; set; } = false;

    // ── Opening / closing cash policy tab ────────────────────────────────────
    [Column("min_opening_cash_sar")]
    public decimal MinOpeningCashSar { get; set; } = 500m;

    [Column("max_opening_cash_sar")]
    public decimal MaxOpeningCashSar { get; set; } = 3000m;

    /// Real gate: read by `ShiftsController.GetCashVarianceThresholdAsync` for the
    /// closing-report manager-approval check.
    [Column("cash_variance_threshold_sar")]
    public decimal CashVarianceThresholdSar { get; set; } = 20m;

    [Column("require_manager_approval_above_cash_threshold")]
    public bool RequireManagerApprovalAboveCashThreshold { get; set; } = true;

    // ── Inventory adjustment policy tab ──────────────────────────────────────
    [Column("require_reason_for_adjustments")]
    public bool RequireReasonForAdjustments { get; set; } = true;

    [Column("adjustment_cap_per_day_units")]
    public int AdjustmentCapPerDayUnits { get; set; } = 100;

    [Column("manager_approval_for_damaged_items")]
    public bool ManagerApprovalForDamagedItems { get; set; } = true;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Branch? Branch { get; set; }
}
