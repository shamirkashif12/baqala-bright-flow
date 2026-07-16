using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddStockMovements : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // No inline FKs to branches/inventory_batches/products/users/warehouses here — they
            // were all created in earlier migrations, so their actual collation may not match
            // whatever this new table's columns get from the server's ambient default. See
            // MigrationCollationHelper for why.
            migrationBuilder.CreateTable(
                name: "stock_movements",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    product_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    warehouse_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    batch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    movement_type = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false),
                    quantity = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    reference_type = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: true),
                    reference_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    reference_number = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: true),
                    notes = table.Column<string>(type: "longtext", nullable: true),
                    created_by = table.Column<Guid>(type: "char(36)", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "char(36)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_stock_movements", x => x.id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_stock_movements_batch_id",
                table: "stock_movements",
                column: "batch_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_movements_branch_id",
                table: "stock_movements",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_movements_CreatedByUserId",
                table: "stock_movements",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_stock_movements_product_id",
                table: "stock_movements",
                column: "product_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_movements_warehouse_id",
                table: "stock_movements",
                column: "warehouse_id");

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_stock_movements_branches_branch_id",
                table: "stock_movements",
                column: "branch_id",
                principalTable: "branches",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict,
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_stock_movements_inventory_batches_batch_id",
                table: "stock_movements",
                column: "batch_id",
                principalTable: "inventory_batches",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict,
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_stock_movements_products_product_id",
                table: "stock_movements",
                column: "product_id",
                principalTable: "products",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_stock_movements_users_CreatedByUserId",
                table: "stock_movements",
                column: "CreatedByUserId",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict,
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_stock_movements_warehouses_warehouse_id",
                table: "stock_movements",
                column: "warehouse_id",
                principalTable: "warehouses",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "stock_movements");
        }
    }
}
