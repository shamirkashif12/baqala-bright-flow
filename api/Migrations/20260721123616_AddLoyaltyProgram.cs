using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddLoyaltyProgram : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // This migration failed partway through on at least one environment: the four
            // AddColumn calls below committed (this project's startup runner executes each
            // migration's SQL directly without a wrapping transaction — see Program.cs), but the
            // migration was never recorded as applied, so retrying replayed the whole Up() from
            // scratch and blew up on "Duplicate column name 'loyalty_discount_amount'". The most
            // likely original failure point is the CreateTable's inline FK just below: branches
            // was created in an earlier migration, so its actual collation may not match whatever
            // this new FK column gets from the server's ambient default — the same
            // incompatible-collation bug MigrationCollationHelper exists to fix (see
            // AddHrmShiftsAndAttendance for the first occurrence of this exact failure mode).
            // Every statement here is now guarded so re-running is safe regardless of how far a
            // previous attempt got. See MigrationIdempotencyHelper.
            migrationBuilder.AddColumnIfNotExists("orders", "loyalty_discount_amount", "decimal(18,4) NOT NULL DEFAULT 0.0");
            migrationBuilder.AddColumnIfNotExists("orders", "loyalty_points_redeemed", "decimal(18,4) NOT NULL DEFAULT 0.0");
            migrationBuilder.AddColumnIfNotExists("loyalty_transactions", "expired_flag", "tinyint(1) NOT NULL DEFAULT FALSE");
            migrationBuilder.AddColumnIfNotExists("loyalty_transactions", "monetary_value", "decimal(18,4) NULL");

            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS `loyalty_programs` (
                    `id` char(36) NOT NULL,
                    `branch_id` char(36) NULL,
                    `program_name` varchar(255) NOT NULL,
                    `description` longtext NULL,
                    `logo_url` longtext NULL,
                    `brand_color` varchar(20) NULL,
                    `points_per_currency_unit` decimal(18,4) NOT NULL,
                    `redemption_value_per_point` decimal(18,4) NOT NULL,
                    `min_points_to_redeem` int NOT NULL,
                    `max_redeem_pct_of_order` decimal(18,4) NULL,
                    `points_expiry_days` int NULL,
                    `silver_threshold` decimal(18,4) NOT NULL,
                    `gold_threshold` decimal(18,4) NOT NULL,
                    `platinum_threshold` decimal(18,4) NOT NULL,
                    `silver_earn_multiplier` decimal(18,4) NOT NULL,
                    `gold_earn_multiplier` decimal(18,4) NOT NULL,
                    `platinum_earn_multiplier` decimal(18,4) NOT NULL,
                    `is_active` tinyint(1) NOT NULL,
                    `created_at` datetime(6) NOT NULL,
                    `updated_at` datetime(6) NOT NULL,
                    PRIMARY KEY (`id`)
                );
            ");

            // Fixed seed id, so a plain INSERT would fail on 'Duplicate entry' if a prior partial
            // run already got this far — IGNORE makes it a no-op instead.
            migrationBuilder.Sql(@"
                INSERT IGNORE INTO `loyalty_programs`
                    (`id`, `branch_id`, `brand_color`, `created_at`, `description`, `gold_earn_multiplier`, `gold_threshold`, `is_active`, `logo_url`, `max_redeem_pct_of_order`, `min_points_to_redeem`, `platinum_earn_multiplier`, `platinum_threshold`, `points_expiry_days`, `points_per_currency_unit`, `program_name`, `redemption_value_per_point`, `silver_earn_multiplier`, `silver_threshold`, `updated_at`)
                VALUES
                    ('00000000-0000-0000-0000-000000000001', NULL, '#7c3aed', '2026-07-21 00:00:00.000000', NULL, 1.0, 5000.0, TRUE, NULL, 50.0, 100, 1.0, 10000.0, 365, 1.0, 'Loyalty Rewards', 0.01, 1.0, 1000.0, '2026-07-21 00:00:00.000000');
            ");

            migrationBuilder.CreateIndexIfNotExists("IX_loyalty_programs_branch_id", "loyalty_programs", "`branch_id`", unique: true);

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_loyalty_programs_branches_branch_id",
                table: "loyalty_programs",
                column: "branch_id",
                principalTable: "branches",
                principalColumn: "id",
                onDeleteSql: "SET NULL",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "loyalty_programs");

            migrationBuilder.DropColumn(
                name: "loyalty_discount_amount",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "loyalty_points_redeemed",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "expired_flag",
                table: "loyalty_transactions");

            migrationBuilder.DropColumn(
                name: "monetary_value",
                table: "loyalty_transactions");
        }
    }
}
