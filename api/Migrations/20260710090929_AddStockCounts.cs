using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddStockCounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // No inline FKs to branches/categories/products here — they were created in earlier
            // migrations, so their actual collation may not match whatever these new columns get
            // from the server's ambient default. See MigrationCollationHelper for why.
            migrationBuilder.CreateTable(
                name: "stock_counts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    category_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    started_by = table.Column<Guid>(type: "char(36)", nullable: true),
                    completed_by = table.Column<Guid>(type: "char(36)", nullable: true),
                    notes = table.Column<string>(type: "longtext", nullable: true),
                    started_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    completed_at = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_stock_counts", x => x.id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            // stock_count_id -> stock_counts stays a plain inline FK: both tables are created in
            // this same migration, so they necessarily share whatever the server's ambient
            // default collation is at this exact moment — no drift is possible between them.
            migrationBuilder.CreateTable(
                name: "stock_count_items",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    stock_count_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    product_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    system_quantity = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    counted_quantity = table.Column<decimal>(type: "decimal(18,4)", nullable: true),
                    variance = table.Column<decimal>(type: "decimal(18,4)", nullable: true),
                    counted_at = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_stock_count_items", x => x.id);
                    table.ForeignKey(
                        name: "FK_stock_count_items_stock_counts_stock_count_id",
                        column: x => x.stock_count_id,
                        principalTable: "stock_counts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_stock_count_items_product_id",
                table: "stock_count_items",
                column: "product_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_count_items_stock_count_id",
                table: "stock_count_items",
                column: "stock_count_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_counts_branch_id",
                table: "stock_counts",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_counts_category_id",
                table: "stock_counts",
                column: "category_id");

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_stock_counts_branches_branch_id",
                table: "stock_counts",
                column: "branch_id",
                principalTable: "branches",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_stock_counts_categories_category_id",
                table: "stock_counts",
                column: "category_id",
                principalTable: "categories",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict,
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_stock_count_items_products_product_id",
                table: "stock_count_items",
                column: "product_id",
                principalTable: "products",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "stock_count_items");

            migrationBuilder.DropTable(
                name: "stock_counts");
        }
    }
}
