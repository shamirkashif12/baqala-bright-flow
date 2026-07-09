using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPromotionsModels : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "discounts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    name = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    name_ar = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    applies_to = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    product_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    category_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    discount_type = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    value = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    is_active = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    start_date = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    end_date = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_discounts", x => x.id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "offers",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    name = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    offer_type = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    trigger_product_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    get_product_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    trigger_quantity = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    get_quantity = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    offer_price = table.Column<decimal>(type: "decimal(18,4)", nullable: true),
                    discount_percentage = table.Column<decimal>(type: "decimal(18,4)", nullable: true),
                    items_description = table.Column<string>(type: "longtext", nullable: true),
                    min_basket_amount = table.Column<decimal>(type: "decimal(18,4)", nullable: true),
                    winners = table.Column<int>(type: "int", nullable: true),
                    usage_limit = table.Column<int>(type: "int", nullable: true),
                    used_count = table.Column<int>(type: "int", nullable: false),
                    start_date = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    end_date = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    is_active = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_offers", x => x.id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_discounts_branch_id",
                table: "discounts",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_discounts_product_id",
                table: "discounts",
                column: "product_id");

            migrationBuilder.CreateIndex(
                name: "IX_offers_branch_id",
                table: "offers",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_offers_get_product_id",
                table: "offers",
                column: "get_product_id");

            migrationBuilder.CreateIndex(
                name: "IX_offers_trigger_product_id",
                table: "offers",
                column: "trigger_product_id");

            // branches/products were created in InitialSchema — see MigrationCollationHelper.
            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_discounts_branches_branch_id",
                table: "discounts", column: "branch_id",
                principalTable: "branches", principalColumn: "id",
                onDelete: ReferentialAction.SetNull, nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_discounts_products_product_id",
                table: "discounts", column: "product_id",
                principalTable: "products", principalColumn: "id",
                onDelete: ReferentialAction.SetNull, nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_offers_branches_branch_id",
                table: "offers", column: "branch_id",
                principalTable: "branches", principalColumn: "id",
                onDelete: ReferentialAction.SetNull, nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_offers_products_get_product_id",
                table: "offers", column: "get_product_id",
                principalTable: "products", principalColumn: "id",
                onDelete: ReferentialAction.SetNull, nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_offers_products_trigger_product_id",
                table: "offers", column: "trigger_product_id",
                principalTable: "products", principalColumn: "id",
                onDelete: ReferentialAction.SetNull, nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "discounts");

            migrationBuilder.DropTable(
                name: "offers");
        }
    }
}
