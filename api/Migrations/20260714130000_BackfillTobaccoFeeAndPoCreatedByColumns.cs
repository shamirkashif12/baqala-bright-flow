using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    /// <remarks>
    /// The sibling migration <c>AddTobaccoFeeAndPurchaseOrderCreatedBy</c> (timestamp 091115) has a
    /// deliberate no-op <c>Up()</c> — its author's database already had these columns/index/FK from
    /// an earlier migration file that was lost to a git reset, so it only records itself in
    /// <c>__EFMigrationsHistory</c>. That means NO migration actually creates these objects on any
    /// database that didn't already have them (this dev DB, a fresh checkout, CI, production). This
    /// migration performs that real DDL.
    ///
    /// Every operation is guarded against INFORMATION_SCHEMA so it is fully idempotent: it creates
    /// each column/index/FK only where missing, and is a clean no-op where they already exist (e.g.
    /// the original author's machine). Uses the same multi-statement PREPARE/EXECUTE idiom already
    /// established in this project (see MigrationCollationHelper / AddUserPermissionOverrides) —
    /// which requires "Allow User Variables=True" on the connection string.
    ///
    /// Column/index/FK names match <c>AddTobaccoFeeAndPurchaseOrderCreatedBy.Down()</c> exactly, so
    /// a future rollback of that migration still finds and drops the right objects.
    /// </remarks>
    public partial class BackfillTobaccoFeeAndPoCreatedByColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ── order_items.tobacco_fee_amount ──────────────────────────────────────
            migrationBuilder.Sql(@"
                SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'tobacco_fee_amount');
                SET @ddl := IF(@exist = 0,
                    'ALTER TABLE `order_items` ADD COLUMN `tobacco_fee_amount` decimal(18,4) NOT NULL DEFAULT 0',
                    'SELECT 1');
                PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
            ");

            // ── orders.tobacco_fee_amount ───────────────────────────────────────────
            migrationBuilder.Sql(@"
                SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'tobacco_fee_amount');
                SET @ddl := IF(@exist = 0,
                    'ALTER TABLE `orders` ADD COLUMN `tobacco_fee_amount` decimal(18,4) NOT NULL DEFAULT 0',
                    'SELECT 1');
                PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
            ");

            // ── purchase_orders.created_by (nullable first, so the backfill can populate it) ──
            migrationBuilder.Sql(@"
                SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_orders' AND COLUMN_NAME = 'created_by');
                SET @ddl := IF(@exist = 0,
                    'ALTER TABLE `purchase_orders` ADD COLUMN `created_by` char(36) NULL',
                    'SELECT 1');
                PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
            ");

            // Backfill from ordered_by (always populated, already FK-validated against users) rather
            // than a placeholder zero-GUID — mirrors the runtime fallback in
            // PurchaseOrdersController.Create: `CreatedBy = CallerId() ?? OrderedBy ?? Guid.Empty`.
            // Only touches rows still NULL, so it's a no-op where created_by was already populated.
            migrationBuilder.Sql("UPDATE `purchase_orders` SET `created_by` = `ordered_by` WHERE `created_by` IS NULL;");

            // Match created_by's collation to users.id's actual collation, then make it NOT NULL.
            // Same collation-mismatch guard MigrationCollationHelper documents — a FK between a new
            // column and an old table's column fails on any server whose ambient default collation
            // drifted since InitialSchema unless the two columns' collations match exactly. Safe to
            // re-run (a plain MODIFY).
            migrationBuilder.Sql(@"
                SET @ref := (SELECT COLLATION_NAME FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id');
                SET @ddl := CONCAT('ALTER TABLE `purchase_orders` MODIFY `created_by` char(36) CHARACTER SET utf8mb4 COLLATE ', @ref, ' NOT NULL');
                PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
            ");

            // ── index IX_purchase_orders_created_by ─────────────────────────────────
            migrationBuilder.Sql(@"
                SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_orders' AND INDEX_NAME = 'IX_purchase_orders_created_by');
                SET @ddl := IF(@exist = 0,
                    'CREATE INDEX `IX_purchase_orders_created_by` ON `purchase_orders` (`created_by`)',
                    'SELECT 1');
                PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
            ");

            // ── FK FK_purchase_orders_users_created_by ──────────────────────────────
            migrationBuilder.Sql(@"
                SET @exist := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_orders'
                      AND CONSTRAINT_NAME = 'FK_purchase_orders_users_created_by' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
                SET @ddl := IF(@exist = 0,
                    'ALTER TABLE `purchase_orders` ADD CONSTRAINT `FK_purchase_orders_users_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT',
                    'SELECT 1');
                PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
            ");
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
