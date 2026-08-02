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
            // warehouse_id is a brand-new column added here, referencing `warehouses` (created in
            // an earlier migration) — same class of bug MigrationCollationHelper exists for: this
            // migration used a plain AddForeignKey instead of the collation-matching variant, and
            // MySQL rejects the FK outright ("Referencing column and referenced column ... are
            // incompatible") whenever the server's ambient default collation drifted between the
            // two migrations' run times. Also made every statement idempotent — same no-transaction
            // partial-failure risk as every other migration in this file that's been patched.
            migrationBuilder.DropForeignKeyIfExists("inventory_batches", "FK_inventory_batches_branches_branch_id");

            migrationBuilder.Sql("ALTER TABLE `inventory_batches` MODIFY `branch_id` char(36) NULL;");

            migrationBuilder.AddColumnIfNotExists("inventory_batches", "warehouse_id", "char(36) NULL");
            migrationBuilder.CreateIndexIfNotExists("IX_inventory_batches_warehouse_id", "inventory_batches", "warehouse_id");

            migrationBuilder.AddForeignKeyIfNotExists(
                name: "FK_inventory_batches_branches_branch_id",
                table: "inventory_batches",
                column: "branch_id",
                principalTable: "branches",
                principalColumn: "id",
                onDeleteSql: "RESTRICT");

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_inventory_batches_warehouses_warehouse_id",
                table: "inventory_batches",
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
