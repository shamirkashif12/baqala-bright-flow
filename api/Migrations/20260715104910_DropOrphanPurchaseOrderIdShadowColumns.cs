using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class DropOrphanPurchaseOrderIdShadowColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded like FixMissingTobaccoFeeAndCreatedByColumns / AddIsTobaccoToProducts: the
            // author's dev database had orphan EF shadow-property columns (PurchaseOrderId) alongside
            // the real, explicitly-mapped po_id columns — production's schema history never generated
            // those shadow objects, so the plain DropForeignKey/DropColumn calls this migration used to
            // have threw "Constraint ... does not exist" and blocked every migration behind it
            // (confirmed via GET /api/diagnostics/migrations). Every drop and every add below is now
            // guarded against information_schema so this is a no-op wherever an object doesn't exist
            // (production) and still performs the real cleanup wherever it does (the original author's
            // database). The two new FKs match po_id's referenced column's actual collation at
            // migration-apply time — see MigrationCollationHelper for why that can't be hardcoded.
            migrationBuilder.Sql(@"
                SET @sql := (SELECT IF(
                    (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_order_items'
                         AND CONSTRAINT_NAME = 'FK_purchase_order_items_purchase_orders_PurchaseOrderId') > 0,
                    'ALTER TABLE `purchase_order_items` DROP FOREIGN KEY `FK_purchase_order_items_purchase_orders_PurchaseOrderId`',
                    'SELECT 1'));
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");

            migrationBuilder.Sql(@"
                SET @sql := (SELECT IF(
                    (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_payments'
                         AND CONSTRAINT_NAME = 'FK_supplier_payments_purchase_orders_PurchaseOrderId') > 0,
                    'ALTER TABLE `supplier_payments` DROP FOREIGN KEY `FK_supplier_payments_purchase_orders_PurchaseOrderId`',
                    'SELECT 1'));
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");

            migrationBuilder.Sql(@"
                SET @sql := (SELECT IF(
                    (SELECT COUNT(*) FROM information_schema.STATISTICS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_payments'
                         AND INDEX_NAME = 'IX_supplier_payments_PurchaseOrderId') > 0,
                    'DROP INDEX `IX_supplier_payments_PurchaseOrderId` ON `supplier_payments`',
                    'SELECT 1'));
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");

            migrationBuilder.Sql(@"
                SET @sql := (SELECT IF(
                    (SELECT COUNT(*) FROM information_schema.STATISTICS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_order_items'
                         AND INDEX_NAME = 'IX_purchase_order_items_PurchaseOrderId') > 0,
                    'DROP INDEX `IX_purchase_order_items_PurchaseOrderId` ON `purchase_order_items`',
                    'SELECT 1'));
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");

            migrationBuilder.Sql(@"
                SET @sql := (SELECT IF(
                    (SELECT COUNT(*) FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_payments'
                         AND COLUMN_NAME = 'PurchaseOrderId') > 0,
                    'ALTER TABLE `supplier_payments` DROP COLUMN `PurchaseOrderId`',
                    'SELECT 1'));
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");

            migrationBuilder.Sql(@"
                SET @sql := (SELECT IF(
                    (SELECT COUNT(*) FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_order_items'
                         AND COLUMN_NAME = 'PurchaseOrderId') > 0,
                    'ALTER TABLE `purchase_order_items` DROP COLUMN `PurchaseOrderId`',
                    'SELECT 1'));
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");

            migrationBuilder.Sql(@"
                SET @sql := (SELECT IF(
                    (SELECT COUNT(*) FROM information_schema.STATISTICS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_payments'
                         AND INDEX_NAME = 'IX_supplier_payments_po_id') > 0,
                    'SELECT 1',
                    'CREATE INDEX `IX_supplier_payments_po_id` ON `supplier_payments` (`po_id`)'));
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");

            migrationBuilder.Sql(@"
                SET @sql := (SELECT IF(
                    (SELECT COUNT(*) FROM information_schema.STATISTICS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_order_items'
                         AND INDEX_NAME = 'IX_purchase_order_items_po_id') > 0,
                    'SELECT 1',
                    'CREATE INDEX `IX_purchase_order_items_po_id` ON `purchase_order_items` (`po_id`)'));
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");

            migrationBuilder.Sql(@"
                SET @sql := (SELECT IF(
                    (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_order_items'
                         AND CONSTRAINT_NAME = 'FK_purchase_order_items_purchase_orders_po_id') > 0,
                    1, 0));
                SET @ref_collation := (SELECT COLLATION_NAME FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_orders' AND COLUMN_NAME = 'id');
                SET @match_ddl := CONCAT('ALTER TABLE `purchase_order_items` MODIFY `po_id` char(36) CHARACTER SET utf8mb4 COLLATE ', @ref_collation, ' NOT NULL');
                SET @add_ddl := IF(@sql = 0, @match_ddl, 'SELECT 1');
                PREPARE stmt FROM @add_ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
                SET @fk_ddl := IF(@sql = 0,
                    'ALTER TABLE `purchase_order_items` ADD CONSTRAINT `FK_purchase_order_items_purchase_orders_po_id` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`) ON DELETE CASCADE',
                    'SELECT 1');
                PREPARE stmt FROM @fk_ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;");

            migrationBuilder.Sql(@"
                SET @sql := (SELECT IF(
                    (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'supplier_payments'
                         AND CONSTRAINT_NAME = 'FK_supplier_payments_purchase_orders_po_id') > 0,
                    1, 0));
                SET @ref_collation := (SELECT COLLATION_NAME FROM information_schema.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_orders' AND COLUMN_NAME = 'id');
                SET @match_ddl := CONCAT('ALTER TABLE `supplier_payments` MODIFY `po_id` char(36) CHARACTER SET utf8mb4 COLLATE ', @ref_collation, ' NOT NULL');
                SET @add_ddl := IF(@sql = 0, @match_ddl, 'SELECT 1');
                PREPARE stmt FROM @add_ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
                SET @fk_ddl := IF(@sql = 0,
                    'ALTER TABLE `supplier_payments` ADD CONSTRAINT `FK_supplier_payments_purchase_orders_po_id` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`id`) ON DELETE CASCADE',
                    'SELECT 1');
                PREPARE stmt FROM @fk_ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_purchase_order_items_purchase_orders_po_id",
                table: "purchase_order_items");

            migrationBuilder.DropForeignKey(
                name: "FK_supplier_payments_purchase_orders_po_id",
                table: "supplier_payments");

            migrationBuilder.DropIndex(
                name: "IX_supplier_payments_po_id",
                table: "supplier_payments");

            migrationBuilder.DropIndex(
                name: "IX_purchase_order_items_po_id",
                table: "purchase_order_items");

            migrationBuilder.AddColumn<Guid>(
                name: "PurchaseOrderId",
                table: "supplier_payments",
                type: "char(36)",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PurchaseOrderId",
                table: "purchase_order_items",
                type: "char(36)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_supplier_payments_PurchaseOrderId",
                table: "supplier_payments",
                column: "PurchaseOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_purchase_order_items_PurchaseOrderId",
                table: "purchase_order_items",
                column: "PurchaseOrderId");

            migrationBuilder.AddForeignKey(
                name: "FK_purchase_order_items_purchase_orders_PurchaseOrderId",
                table: "purchase_order_items",
                column: "PurchaseOrderId",
                principalTable: "purchase_orders",
                principalColumn: "id");

            migrationBuilder.AddForeignKey(
                name: "FK_supplier_payments_purchase_orders_PurchaseOrderId",
                table: "supplier_payments",
                column: "PurchaseOrderId",
                principalTable: "purchase_orders",
                principalColumn: "id");
        }
    }
}
