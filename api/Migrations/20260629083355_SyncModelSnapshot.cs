using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class SyncModelSnapshot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // All schema changes were applied directly to the DB via ALTER TABLE.
            // This migration exists only to update the EF model snapshot.
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "tenant_settings");

            migrationBuilder.DropColumn(
                name: "allow_near_expiry_sale",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "allow_terminal_switching",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "auto_lock_idle",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "beep_on_scan",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "block_expired_items",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "block_nonpermissible_items",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "cashier_can_coupon",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "cashier_can_discount",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "cashier_can_edit_order",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "cashier_can_hold_order",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "cashier_can_refund",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "preserve_held_orders",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "send_sms_invoice",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "warn_near_expiry",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "commercial_registration",
                table: "branches");

            migrationBuilder.DropColumn(
                name: "email",
                table: "branches");
        }
    }
}
