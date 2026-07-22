using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderDiscounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Both FKs below reference tables (orders, discounts) created in earlier migrations —
            // the same incompatible-collation risk that hit AddLoyaltyProgram right before this
            // migration in the sequence. This one hasn't actually failed yet (it's never been
            // reached — blocked behind AddLoyaltyProgram), but it carries the identical latent
            // bug, so it's guarded now rather than waiting to hit the same failure on the very
            // next deploy. See MigrationIdempotencyHelper / MigrationCollationHelper.
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS `order_discounts` (
                    `id` char(36) NOT NULL,
                    `order_id` char(36) NOT NULL,
                    `discount_id` char(36) NULL,
                    `name` varchar(255) NOT NULL,
                    `amount` decimal(18,4) NOT NULL,
                    `created_at` datetime(6) NOT NULL,
                    PRIMARY KEY (`id`)
                );
            ");

            migrationBuilder.CreateIndexIfNotExists("IX_order_discounts_discount_id", "order_discounts", "`discount_id`");
            migrationBuilder.CreateIndexIfNotExists("IX_order_discounts_order_id", "order_discounts", "`order_id`");

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_order_discounts_discounts_discount_id",
                table: "order_discounts",
                column: "discount_id",
                principalTable: "discounts",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_order_discounts_orders_order_id",
                table: "order_discounts",
                column: "order_id",
                principalTable: "orders",
                principalColumn: "id",
                onDeleteSql: "CASCADE",
                nullable: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "order_discounts");
        }
    }
}
