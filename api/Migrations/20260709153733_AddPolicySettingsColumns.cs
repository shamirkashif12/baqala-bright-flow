using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPolicySettingsColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "adjustment_cap_per_day_units",
                table: "pos_settings",
                type: "int",
                nullable: false,
                defaultValue: 100);

            migrationBuilder.AddColumn<bool>(
                name: "allow_expired_item_return",
                table: "pos_settings",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "allow_expiry_manager_override",
                table: "pos_settings",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "allow_refund_reversal_within_24h",
                table: "pos_settings",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "allow_returns_without_receipt",
                table: "pos_settings",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "auto_checkout_on_shift_end",
                table: "pos_settings",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "auto_move_expired_to_blocked_list",
                table: "pos_settings",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "auto_print_refund_receipt",
                table: "pos_settings",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "block_age_restricted_at_cashier",
                table: "pos_settings",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "cash_variance_threshold_sar",
                table: "pos_settings",
                type: "decimal(18,4)",
                nullable: false,
                defaultValue: 20m);

            migrationBuilder.AddColumn<decimal>(
                name: "cashier_max_discount_pct",
                table: "pos_settings",
                type: "decimal(18,4)",
                nullable: false,
                defaultValue: 5m);

            migrationBuilder.AddColumn<int>(
                name: "close_to_expiry_alert_days",
                table: "pos_settings",
                type: "int",
                nullable: false,
                defaultValue: 7);

            migrationBuilder.AddColumn<bool>(
                name: "combine_multiple_coupons",
                table: "pos_settings",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "expiry_notification_frequency_hours",
                table: "pos_settings",
                type: "int",
                nullable: false,
                defaultValue: 24);

            migrationBuilder.AddColumn<bool>(
                name: "issue_store_credit_for_damaged_items",
                table: "pos_settings",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "manager_approval_for_damaged_items",
                table: "pos_settings",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<decimal>(
                name: "manager_max_discount_pct",
                table: "pos_settings",
                type: "decimal(18,4)",
                nullable: false,
                defaultValue: 25m);

            migrationBuilder.AddColumn<decimal>(
                name: "max_coupon_value_sar",
                table: "pos_settings",
                type: "decimal(18,4)",
                nullable: false,
                defaultValue: 50m);

            migrationBuilder.AddColumn<decimal>(
                name: "max_opening_cash_sar",
                table: "pos_settings",
                type: "decimal(18,4)",
                nullable: false,
                defaultValue: 3000m);

            migrationBuilder.AddColumn<decimal>(
                name: "max_refund_per_cashier_sar",
                table: "pos_settings",
                type: "decimal(18,4)",
                nullable: false,
                defaultValue: 200m);

            migrationBuilder.AddColumn<int>(
                name: "max_shift_duration_hours",
                table: "pos_settings",
                type: "int",
                nullable: false,
                defaultValue: 9);

            migrationBuilder.AddColumn<int>(
                name: "min_customer_age",
                table: "pos_settings",
                type: "int",
                nullable: false,
                defaultValue: 21);

            migrationBuilder.AddColumn<decimal>(
                name: "min_opening_cash_sar",
                table: "pos_settings",
                type: "decimal(18,4)",
                nullable: false,
                defaultValue: 500m);

            migrationBuilder.AddColumn<decimal>(
                name: "refund_manager_approval_above_sar",
                table: "pos_settings",
                type: "decimal(18,4)",
                nullable: false,
                defaultValue: 500m);

            migrationBuilder.AddColumn<bool>(
                name: "refundable_card",
                table: "pos_settings",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "refundable_cash",
                table: "pos_settings",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "refundable_wallet",
                table: "pos_settings",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "require_break_after_4h",
                table: "pos_settings",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "require_manager_approval_above_cash_threshold",
                table: "pos_settings",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "require_reason_for_adjustments",
                table: "pos_settings",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "require_reason_for_discount",
                table: "pos_settings",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<decimal>(
                name: "return_manager_approval_above_sar",
                table: "pos_settings",
                type: "decimal(18,4)",
                nullable: false,
                defaultValue: 100m);

            migrationBuilder.AddColumn<bool>(
                name: "return_require_receipt_only",
                table: "pos_settings",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<int>(
                name: "return_window_days",
                table: "pos_settings",
                type: "int",
                nullable: false,
                defaultValue: 14);

            migrationBuilder.AddColumn<bool>(
                name: "tobacco_age_restricted",
                table: "pos_settings",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "tobacco_require_manager_approval",
                table: "pos_settings",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "adjustment_cap_per_day_units",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "allow_expired_item_return",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "allow_expiry_manager_override",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "allow_refund_reversal_within_24h",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "allow_returns_without_receipt",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "auto_checkout_on_shift_end",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "auto_move_expired_to_blocked_list",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "auto_print_refund_receipt",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "block_age_restricted_at_cashier",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "cash_variance_threshold_sar",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "cashier_max_discount_pct",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "close_to_expiry_alert_days",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "combine_multiple_coupons",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "expiry_notification_frequency_hours",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "issue_store_credit_for_damaged_items",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "manager_approval_for_damaged_items",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "manager_max_discount_pct",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "max_coupon_value_sar",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "max_opening_cash_sar",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "max_refund_per_cashier_sar",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "max_shift_duration_hours",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "min_customer_age",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "min_opening_cash_sar",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "refund_manager_approval_above_sar",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "refundable_card",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "refundable_cash",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "refundable_wallet",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "require_break_after_4h",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "require_manager_approval_above_cash_threshold",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "require_reason_for_adjustments",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "require_reason_for_discount",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "return_manager_approval_above_sar",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "return_require_receipt_only",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "return_window_days",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "tobacco_age_restricted",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "tobacco_require_manager_approval",
                table: "pos_settings");
        }
    }
}
