using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using BaqalaPOS.Api.Data;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <summary>
    /// Pack breaking — lets a "pack" product (e.g. a carton of 12 eggs) declare which "single"
    /// product it breaks down into (e.g. individual eggs), so InventoryController's Break Pack
    /// action can convert on-hand cartons into on-hand loose units. Nullable and unused by every
    /// existing pack product until an operator opts in by picking a loose product for it.
    ///
    /// Hand-written (like AddProductPackFields), no Designer.cs, for the same reason: this touches
    /// exactly one column, and an EF scaffold would diff the whole model against whatever else is
    /// mid-flight. Uses the IfNotExists/collation-matched helpers introduced after
    /// AddProductPackFields shipped, for the same no-transaction partial-failure and ambient-
    /// collation-drift risks as every other migration on this table — see
    /// MigrationIdempotencyHelper / MigrationCollationHelper.
    /// </summary>
    [DbContext(typeof(BaqalaDbContext))]
    [Migration("20260804000000_AddProductLooseUnitLink")]
    public partial class AddProductLooseUnitLink : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumnIfNotExists("products", "loose_unit_product_id", "char(36) NULL");
            migrationBuilder.CreateIndexIfNotExists("IX_products_loose_unit_product_id", "products", "loose_unit_product_id");

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_products_products_loose_unit_product_id",
                table: "products",
                column: "loose_unit_product_id",
                principalTable: "products",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_products_products_loose_unit_product_id",
                table: "products");

            migrationBuilder.DropIndex(
                name: "IX_products_loose_unit_product_id",
                table: "products");

            migrationBuilder.DropColumn(
                name: "loose_unit_product_id",
                table: "products");
        }
    }
}
