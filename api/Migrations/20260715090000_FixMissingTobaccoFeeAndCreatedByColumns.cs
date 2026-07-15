using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using BaqalaPOS.Api.Data;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <summary>
    /// Repairs databases where 20260714091115_AddTobaccoFeeAndPurchaseOrderCreatedBy applied its
    /// no-op Up() and thus recorded itself in __EFMigrationsHistory WITHOUT ever creating the
    /// columns it was named for. That is exactly what happened on the production/GitLab database
    /// (migrate.sh → `dotnet ef database update` ran the empty migration), leaving the Order,
    /// OrderItem and PurchaseOrder entities mapping columns the live schema doesn't have — so
    /// every `SELECT ... tobacco_fee_amount ...` / `... created_by ...` threw "Unknown column"
    /// and surfaced as the generic 500 "Something went wrong on our end. Reference: …".
    ///
    /// Every statement is guarded against information_schema so this is a safe no-op on the dev
    /// database (which already has the columns) and correctly adds them on production and on any
    /// fresh deployment. DDL is emitted via PREPARE/EXECUTE because MySQL 8 has no
    /// `ADD COLUMN IF NOT EXISTS`.
    /// </summary>
    [DbContext(typeof(BaqalaDbContext))]
    [Migration("20260715090000_FixMissingTobaccoFeeAndCreatedByColumns")]
    public partial class FixMissingTobaccoFeeAndCreatedByColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ── orders.tobacco_fee_amount ──────────────────────────────────────
            migrationBuilder.Sql(@"
                SET @sql := (SELECT IF(
                    (SELECT COUNT(*) FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'
                         AND COLUMN_NAME = 'tobacco_fee_amount') > 0,
                    'SELECT 1',
                    'ALTER TABLE `orders` ADD COLUMN `tobacco_fee_amount` decimal(18,4) NOT NULL DEFAULT 0'));
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");

            // ── order_items.tobacco_fee_amount ─────────────────────────────────
            migrationBuilder.Sql(@"
                SET @sql := (SELECT IF(
                    (SELECT COUNT(*) FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items'
                         AND COLUMN_NAME = 'tobacco_fee_amount') > 0,
                    'SELECT 1',
                    'ALTER TABLE `order_items` ADD COLUMN `tobacco_fee_amount` decimal(18,4) NOT NULL DEFAULT 0'));
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");

            // ── purchase_orders.created_by ─────────────────────────────────────
            // Added nullable first so the backfill can populate existing rows before the NOT NULL
            // constraint is applied (see PurchaseOrder.CreatedBy: "Backfilled to OrderedBy").
            migrationBuilder.Sql(@"
                SET @sql := (SELECT IF(
                    (SELECT COUNT(*) FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_orders'
                         AND COLUMN_NAME = 'created_by') > 0,
                    'SELECT 1',
                    'ALTER TABLE `purchase_orders` ADD COLUMN `created_by` char(36) NULL'));
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");

            // Backfill created_by ← ordered_by for pre-existing rows (only touches NULLs, so it is
            // a no-op once the column is populated).
            migrationBuilder.Sql(
                "UPDATE `purchase_orders` SET `created_by` = `ordered_by` WHERE `created_by` IS NULL;");

            // Promote to NOT NULL to match the model. Idempotent — re-running MODIFY on an already
            // NOT NULL column is harmless (ordered_by is Required, so no NULLs remain to block it).
            migrationBuilder.Sql(
                "ALTER TABLE `purchase_orders` MODIFY COLUMN `created_by` char(36) NOT NULL;");

            // Index on created_by.
            migrationBuilder.Sql(@"
                SET @sql := (SELECT IF(
                    (SELECT COUNT(*) FROM information_schema.STATISTICS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_orders'
                         AND INDEX_NAME = 'IX_purchase_orders_created_by') > 0,
                    'SELECT 1',
                    'CREATE INDEX `IX_purchase_orders_created_by` ON `purchase_orders` (`created_by`)'));
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");

            // FK created_by → users(id). ON DELETE RESTRICT to match the sibling
            // FK_purchase_orders_users_ordered_by.
            migrationBuilder.Sql(@"
                SET @sql := (SELECT IF(
                    (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_orders'
                         AND CONSTRAINT_NAME = 'FK_purchase_orders_users_created_by') > 0,
                    'SELECT 1',
                    'ALTER TABLE `purchase_orders` ADD CONSTRAINT `FK_purchase_orders_users_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT'));
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Guarded so a rollback doesn't fail on a database where the earlier no-op migration's
            // Down() (which drops the same objects) has already run.
            migrationBuilder.Sql(@"
                SET @sql := (SELECT IF(
                    (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_orders'
                         AND CONSTRAINT_NAME = 'FK_purchase_orders_users_created_by') > 0,
                    'ALTER TABLE `purchase_orders` DROP FOREIGN KEY `FK_purchase_orders_users_created_by`',
                    'SELECT 1'));
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");

            migrationBuilder.Sql(@"
                SET @sql := (SELECT IF(
                    (SELECT COUNT(*) FROM information_schema.STATISTICS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_orders'
                         AND INDEX_NAME = 'IX_purchase_orders_created_by') > 0,
                    'DROP INDEX `IX_purchase_orders_created_by` ON `purchase_orders`',
                    'SELECT 1'));
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");

            migrationBuilder.Sql(@"
                SET @sql := (SELECT IF(
                    (SELECT COUNT(*) FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_orders'
                         AND COLUMN_NAME = 'created_by') > 0,
                    'ALTER TABLE `purchase_orders` DROP COLUMN `created_by`',
                    'SELECT 1'));
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");

            migrationBuilder.Sql(@"
                SET @sql := (SELECT IF(
                    (SELECT COUNT(*) FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items'
                         AND COLUMN_NAME = 'tobacco_fee_amount') > 0,
                    'ALTER TABLE `order_items` DROP COLUMN `tobacco_fee_amount`',
                    'SELECT 1'));
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");

            migrationBuilder.Sql(@"
                SET @sql := (SELECT IF(
                    (SELECT COUNT(*) FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders'
                         AND COLUMN_NAME = 'tobacco_fee_amount') > 0,
                    'ALTER TABLE `orders` DROP COLUMN `tobacco_fee_amount`',
                    'SELECT 1'));
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");
        }
    }
}
