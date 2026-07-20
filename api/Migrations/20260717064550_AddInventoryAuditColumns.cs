using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddInventoryAuditColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "quantity_after",
                table: "stock_movements",
                type: "decimal(18,4)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "quantity_before",
                table: "stock_movements",
                type: "decimal(18,4)",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "approved_by",
                table: "inventory_adjustments",
                type: "char(36)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_inventory_adjustments_approved_by",
                table: "inventory_adjustments",
                column: "approved_by");

            // `users` dates back to InitialSchema, so its collation can differ from this server's
            // current ambient default — a bare AddForeignKey then fails with "Referencing column
            // and referenced column are incompatible". Match the referenced column's actual
            // collation first. See MigrationCollationHelper.
            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_inventory_adjustments_users_approved_by",
                table: "inventory_adjustments",
                column: "approved_by",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_inventory_adjustments_users_approved_by",
                table: "inventory_adjustments");

            migrationBuilder.DropIndex(
                name: "IX_inventory_adjustments_approved_by",
                table: "inventory_adjustments");

            migrationBuilder.DropColumn(
                name: "quantity_after",
                table: "stock_movements");

            migrationBuilder.DropColumn(
                name: "quantity_before",
                table: "stock_movements");

            migrationBuilder.DropColumn(
                name: "approved_by",
                table: "inventory_adjustments");
        }
    }
}
