using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    public partial class ExpandPosSettingsAndBranch : Migration
    {
        // NOTE: Columns were applied directly to the DB via ALTER TABLE on 2026-06-29.
        // This migration file records that history so EF won't try to re-apply it.
        // The Up() uses raw SQL matching exactly what was run.

        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE pos_settings
                  ADD COLUMN auto_lock_idle              TINYINT(1) NOT NULL DEFAULT 1,
                  ADD COLUMN allow_terminal_switching    TINYINT(1) NOT NULL DEFAULT 1,
                  ADD COLUMN preserve_held_orders        TINYINT(1) NOT NULL DEFAULT 1,
                  ADD COLUMN send_sms_invoice            TINYINT(1) NOT NULL DEFAULT 0,
                  ADD COLUMN cashier_can_discount        TINYINT(1) NOT NULL DEFAULT 1,
                  ADD COLUMN cashier_can_coupon          TINYINT(1) NOT NULL DEFAULT 1,
                  ADD COLUMN cashier_can_refund          TINYINT(1) NOT NULL DEFAULT 0,
                  ADD COLUMN cashier_can_hold_order      TINYINT(1) NOT NULL DEFAULT 1,
                  ADD COLUMN cashier_can_edit_order      TINYINT(1) NOT NULL DEFAULT 0,
                  ADD COLUMN beep_on_scan                TINYINT(1) NOT NULL DEFAULT 1,
                  ADD COLUMN warn_near_expiry            TINYINT(1) NOT NULL DEFAULT 1,
                  ADD COLUMN allow_near_expiry_sale      TINYINT(1) NOT NULL DEFAULT 1,
                  ADD COLUMN block_expired_items         TINYINT(1) NOT NULL DEFAULT 1,
                  ADD COLUMN block_nonpermissible_items  TINYINT(1) NOT NULL DEFAULT 1;
            ");

            migrationBuilder.Sql(@"
                ALTER TABLE branches
                  ADD COLUMN commercial_registration  VARCHAR(50)  NULL,
                  ADD COLUMN email                    VARCHAR(255) NULL;
            ");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE pos_settings
                  DROP COLUMN auto_lock_idle,
                  DROP COLUMN allow_terminal_switching,
                  DROP COLUMN preserve_held_orders,
                  DROP COLUMN send_sms_invoice,
                  DROP COLUMN cashier_can_discount,
                  DROP COLUMN cashier_can_coupon,
                  DROP COLUMN cashier_can_refund,
                  DROP COLUMN cashier_can_hold_order,
                  DROP COLUMN cashier_can_edit_order,
                  DROP COLUMN beep_on_scan,
                  DROP COLUMN warn_near_expiry,
                  DROP COLUMN allow_near_expiry_sale,
                  DROP COLUMN block_expired_items,
                  DROP COLUMN block_nonpermissible_items;
            ");

            migrationBuilder.Sql(@"
                ALTER TABLE branches
                  DROP COLUMN commercial_registration,
                  DROP COLUMN email;
            ");
        }
    }
}
