using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOnlineOrdering : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumnIfNotExists(
                table: "pos_settings",
                column: "online_ordering_enabled",
                columnDefinitionSql: "tinyint(1) NOT NULL DEFAULT 0");

            migrationBuilder.AddColumnIfNotExists(
                table: "pos_settings",
                column: "online_ordering_max_order_value_sar",
                columnDefinitionSql: "decimal(18,4) NOT NULL DEFAULT 1000");

            migrationBuilder.AddColumnIfNotExists(
                table: "pos_settings",
                column: "online_ordering_min_order_amount_sar",
                columnDefinitionSql: "decimal(18,4) NOT NULL DEFAULT 0");

            migrationBuilder.AddColumnIfNotExists(
                table: "orders",
                column: "approved_at",
                columnDefinitionSql: "datetime(6) NULL");

            migrationBuilder.AddColumnIfNotExists(
                table: "orders",
                column: "approved_by",
                columnDefinitionSql: "char(36) NULL");

            migrationBuilder.AddColumnIfNotExists(
                table: "orders",
                column: "rejection_reason",
                columnDefinitionSql: "varchar(500) NULL");

            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS `order_delivery_details` (
                    `order_id` char(36) NOT NULL,
                    `full_name` varchar(255) NOT NULL,
                    `phone` varchar(50) NOT NULL,
                    `email` varchar(255) NULL,
                    `address_line` longtext NOT NULL,
                    `latitude` decimal(18,4) NULL,
                    `longitude` decimal(18,4) NULL,
                    `notes` longtext NULL,
                    `created_at` datetime(6) NOT NULL,
                    CONSTRAINT `PK_order_delivery_details` PRIMARY KEY (`order_id`)
                ) CHARACTER SET utf8mb4;
            ");

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_order_delivery_details_orders_order_id",
                table: "order_delivery_details",
                column: "order_id",
                principalTable: "orders",
                principalColumn: "id",
                onDeleteSql: "CASCADE");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "order_delivery_details");

            migrationBuilder.DropColumn(
                name: "online_ordering_enabled",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "online_ordering_max_order_value_sar",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "online_ordering_min_order_amount_sar",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "approved_at",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "approved_by",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "rejection_reason",
                table: "orders");
        }
    }
}
