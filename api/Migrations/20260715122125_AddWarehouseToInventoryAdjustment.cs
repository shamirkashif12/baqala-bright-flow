using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddWarehouseToInventoryAdjustment : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Same bug and fix as the identically-shaped AddWarehouseToInventoryBatch migration
            // right before this one: warehouse_id is new here and needs its collation matched to
            // `warehouses.id` before the FK can be added, plus every statement made idempotent.
            migrationBuilder.DropForeignKeyIfExists("inventory_adjustments", "FK_inventory_adjustments_branches_branch_id");

            migrationBuilder.Sql("ALTER TABLE `inventory_adjustments` MODIFY `branch_id` char(36) NULL;");

            migrationBuilder.AddColumnIfNotExists("inventory_adjustments", "warehouse_id", "char(36) NULL");
            migrationBuilder.CreateIndexIfNotExists("IX_inventory_adjustments_warehouse_id", "inventory_adjustments", "warehouse_id");

            migrationBuilder.AddForeignKeyIfNotExists(
                name: "FK_inventory_adjustments_branches_branch_id",
                table: "inventory_adjustments",
                column: "branch_id",
                principalTable: "branches",
                principalColumn: "id",
                onDeleteSql: "RESTRICT");

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_inventory_adjustments_warehouses_warehouse_id",
                table: "inventory_adjustments",
                column: "warehouse_id",
                principalTable: "warehouses",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_inventory_adjustments_branches_branch_id",
                table: "inventory_adjustments");

            migrationBuilder.DropForeignKey(
                name: "FK_inventory_adjustments_warehouses_warehouse_id",
                table: "inventory_adjustments");

            migrationBuilder.DropIndex(
                name: "IX_inventory_adjustments_warehouse_id",
                table: "inventory_adjustments");

            migrationBuilder.DropColumn(
                name: "warehouse_id",
                table: "inventory_adjustments");

            migrationBuilder.AlterColumn<Guid>(
                name: "branch_id",
                table: "inventory_adjustments",
                type: "char(36)",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "char(36)",
                oldNullable: true);

            migrationBuilder.AddForeignKey(
                name: "FK_inventory_adjustments_branches_branch_id",
                table: "inventory_adjustments",
                column: "branch_id",
                principalTable: "branches",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
