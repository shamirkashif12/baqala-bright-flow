using BaqalaPOS.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    [DbContext(typeof(BaqalaDbContext))]
    [Migration("20260629130000_ExpandPosSettingsAndBranch")]
    public partial class ExpandPosSettingsAndBranch : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS tenant_settings (
                  id CHAR(36) NOT NULL,
                  branch_id CHAR(36) NOT NULL,
                  setting_key VARCHAR(100) NOT NULL,
                  setting_value TEXT NULL,
                  created_at DATETIME(6) NOT NULL,
                  updated_at DATETIME(6) NOT NULL,
                  PRIMARY KEY (id),
                  UNIQUE KEY uq_branch_key (branch_id, setting_key)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
            ");

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

            migrationBuilder.Sql("DROP TABLE IF EXISTS tenant_settings;");
        }
    }
}
