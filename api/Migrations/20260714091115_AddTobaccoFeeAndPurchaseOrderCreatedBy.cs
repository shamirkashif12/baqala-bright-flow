using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTobaccoFeeAndPurchaseOrderCreatedBy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Idempotent DDL. One developer database already has these columns/FK/index/backfill
            // from an earlier run of this migration under a different timestamp (its file was lost
            // to a git reset), so a plain ADD COLUMN would fail there with "Duplicate column name".
            // But every other database — CI, staging, production — has never seen them, and a
            // no-op Up() only records the migration in __EFMigrationsHistory without creating the
            // columns. The app then crashes at startup: Program.cs calls db.Database.Migrate()
            // followed by the DataSeeder, whose queries reference tobacco_fee_amount / created_by
            // and hit "Unknown column". Each change below is guarded by an information_schema check
            // so it runs exactly where needed and is skipped where it already exists.

            // orders.tobacco_fee_amount
            migrationBuilder.Sql(@"
                SET @exist := (SELECT COUNT(*) FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'tobacco_fee_amount');
                SET @sql := IF(@exist = 0,
                    'ALTER TABLE `orders` ADD COLUMN `tobacco_fee_amount` decimal(18,4) NOT NULL DEFAULT 0',
                    'DO 0');
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");

            // order_items.tobacco_fee_amount
            migrationBuilder.Sql(@"
                SET @exist := (SELECT COUNT(*) FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'tobacco_fee_amount');
                SET @sql := IF(@exist = 0,
                    'ALTER TABLE `order_items` ADD COLUMN `tobacco_fee_amount` decimal(18,4) NOT NULL DEFAULT 0',
                    'DO 0');
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");

            // purchase_orders.created_by — add nullable first so existing rows can be backfilled.
            migrationBuilder.Sql(@"
                SET @exist := (SELECT COUNT(*) FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_orders' AND COLUMN_NAME = 'created_by');
                SET @sql := IF(@exist = 0,
                    'ALTER TABLE `purchase_orders` ADD COLUMN `created_by` char(36) NULL',
                    'DO 0');
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");

            // Backfill created_by = ordered_by for rows that predate the column, then enforce NOT NULL.
            migrationBuilder.Sql(@"UPDATE `purchase_orders` SET `created_by` = `ordered_by` WHERE `created_by` IS NULL;");
            migrationBuilder.Sql(@"ALTER TABLE `purchase_orders` MODIFY COLUMN `created_by` char(36) NOT NULL;");

            // Index on purchase_orders.created_by
            migrationBuilder.Sql(@"
                SET @exist := (SELECT COUNT(*) FROM information_schema.STATISTICS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_orders' AND INDEX_NAME = 'IX_purchase_orders_created_by');
                SET @sql := IF(@exist = 0,
                    'CREATE INDEX `IX_purchase_orders_created_by` ON `purchase_orders` (`created_by`)',
                    'DO 0');
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");

            // FK purchase_orders.created_by -> users.id
            migrationBuilder.Sql(@"
                SET @exist := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_orders' AND CONSTRAINT_NAME = 'FK_purchase_orders_users_created_by');
                SET @sql := IF(@exist = 0,
                    'ALTER TABLE `purchase_orders` ADD CONSTRAINT `FK_purchase_orders_users_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT',
                    'DO 0');
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_purchase_orders_users_created_by",
                table: "purchase_orders");

            migrationBuilder.DropIndex(
                name: "IX_purchase_orders_created_by",
                table: "purchase_orders");

            migrationBuilder.DropColumn(
                name: "created_by",
                table: "purchase_orders");

            migrationBuilder.DropColumn(
                name: "tobacco_fee_amount",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "tobacco_fee_amount",
                table: "order_items");
        }
    }
}
