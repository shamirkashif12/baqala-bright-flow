using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderServiceCharges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Both FKs below reference tables (orders, tax_fee_rules) created in earlier
            // migrations — same incompatible-collation risk guarded elsewhere in this migration
            // sequence (see AddOrderDiscounts, AddLoyaltyProgram). Guarded here too rather than
            // waiting to hit the same failure on the next deploy.
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS `order_service_charges` (
                    `id` char(36) NOT NULL,
                    `order_id` char(36) NOT NULL,
                    `tax_fee_rule_id` char(36) NULL,
                    `name` varchar(255) NOT NULL,
                    `amount` decimal(18,4) NOT NULL,
                    `created_at` datetime(6) NOT NULL,
                    PRIMARY KEY (`id`)
                );
            ");

            migrationBuilder.CreateIndexIfNotExists("IX_order_service_charges_order_id", "order_service_charges", "`order_id`");
            migrationBuilder.CreateIndexIfNotExists("IX_order_service_charges_tax_fee_rule_id", "order_service_charges", "`tax_fee_rule_id`");

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_order_service_charges_orders_order_id",
                table: "order_service_charges",
                column: "order_id",
                principalTable: "orders",
                principalColumn: "id",
                onDeleteSql: "CASCADE",
                nullable: false);

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_order_service_charges_tax_fee_rules_tax_fee_rule_id",
                table: "order_service_charges",
                column: "tax_fee_rule_id",
                principalTable: "tax_fee_rules",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "order_service_charges");
        }
    }
}
