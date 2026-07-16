using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddWarehouseToInventoryBatch : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_inventory_batches_branches_branch_id",
                table: "inventory_batches");

            migrationBuilder.AlterColumn<Guid>(
                name: "branch_id",
                table: "inventory_batches",
                type: "char(36)",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "char(36)");

            migrationBuilder.AddColumn<Guid>(
                name: "warehouse_id",
                table: "inventory_batches",
                type: "char(36)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_inventory_batches_warehouse_id",
                table: "inventory_batches",
                column: "warehouse_id");

            migrationBuilder.AddForeignKey(
                name: "FK_inventory_batches_branches_branch_id",
                table: "inventory_batches",
                column: "branch_id",
                principalTable: "branches",
                principalColumn: "id");

            migrationBuilder.AddForeignKey(
                name: "FK_inventory_batches_warehouses_warehouse_id",
                table: "inventory_batches",
                column: "warehouse_id",
                principalTable: "warehouses",
                principalColumn: "id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_inventory_batches_branches_branch_id",
                table: "inventory_batches");

            migrationBuilder.DropForeignKey(
                name: "FK_inventory_batches_warehouses_warehouse_id",
                table: "inventory_batches");

            migrationBuilder.DropIndex(
                name: "IX_inventory_batches_warehouse_id",
                table: "inventory_batches");

            migrationBuilder.DropColumn(
                name: "warehouse_id",
                table: "inventory_batches");

            migrationBuilder.AlterColumn<Guid>(
                name: "branch_id",
                table: "inventory_batches",
                type: "char(36)",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "char(36)",
                oldNullable: true);

            migrationBuilder.AddForeignKey(
                name: "FK_inventory_batches_branches_branch_id",
                table: "inventory_batches",
                column: "branch_id",
                principalTable: "branches",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
