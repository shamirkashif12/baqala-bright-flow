using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddWarehouseAndApprovalFlowToStockCount : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_stock_counts_branches_branch_id",
                table: "stock_counts");

            migrationBuilder.AlterColumn<Guid>(
                name: "branch_id",
                table: "stock_counts",
                type: "char(36)",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "char(36)");

            migrationBuilder.AddColumn<DateTime>(
                name: "approved_at",
                table: "stock_counts",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "approved_by",
                table: "stock_counts",
                type: "char(36)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "rejection_reason",
                table: "stock_counts",
                type: "varchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "reviewed_at",
                table: "stock_counts",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "reviewed_by",
                table: "stock_counts",
                type: "char(36)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "stock_applied",
                table: "stock_counts",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "warehouse_id",
                table: "stock_counts",
                type: "char(36)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_stock_counts_approved_by",
                table: "stock_counts",
                column: "approved_by");

            migrationBuilder.CreateIndex(
                name: "IX_stock_counts_completed_by",
                table: "stock_counts",
                column: "completed_by");

            migrationBuilder.CreateIndex(
                name: "IX_stock_counts_reviewed_by",
                table: "stock_counts",
                column: "reviewed_by");

            migrationBuilder.CreateIndex(
                name: "IX_stock_counts_started_by",
                table: "stock_counts",
                column: "started_by");

            migrationBuilder.CreateIndex(
                name: "IX_stock_counts_warehouse_id",
                table: "stock_counts",
                column: "warehouse_id");

            migrationBuilder.AddForeignKey(
                name: "FK_stock_counts_branches_branch_id",
                table: "stock_counts",
                column: "branch_id",
                principalTable: "branches",
                principalColumn: "id");

            migrationBuilder.AddForeignKey(
                name: "FK_stock_counts_users_approved_by",
                table: "stock_counts",
                column: "approved_by",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_stock_counts_users_completed_by",
                table: "stock_counts",
                column: "completed_by",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_stock_counts_users_reviewed_by",
                table: "stock_counts",
                column: "reviewed_by",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_stock_counts_users_started_by",
                table: "stock_counts",
                column: "started_by",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_stock_counts_warehouses_warehouse_id",
                table: "stock_counts",
                column: "warehouse_id",
                principalTable: "warehouses",
                principalColumn: "id");

            // Sessions that finished under the old rules already had their variance applied to
            // on-hand at completion time — "completed" is folded into the new terminal "approved"
            // state with stock_applied backfilled to true, since that history is real. reviewed_by/
            // approved_by are deliberately left null rather than backfilled from completed_by: no
            // separate review actually happened on these, and inventing one would misattribute a
            // sign-off nobody gave (same reasoning as InventoryAdjustment.ApprovalStatus not being
            // backfilled onto pre-gating rows).
            migrationBuilder.Sql("UPDATE stock_counts SET status = 'approved', stock_applied = 1 WHERE status = 'completed';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_stock_counts_branches_branch_id",
                table: "stock_counts");

            migrationBuilder.DropForeignKey(
                name: "FK_stock_counts_users_approved_by",
                table: "stock_counts");

            migrationBuilder.DropForeignKey(
                name: "FK_stock_counts_users_completed_by",
                table: "stock_counts");

            migrationBuilder.DropForeignKey(
                name: "FK_stock_counts_users_reviewed_by",
                table: "stock_counts");

            migrationBuilder.DropForeignKey(
                name: "FK_stock_counts_users_started_by",
                table: "stock_counts");

            migrationBuilder.DropForeignKey(
                name: "FK_stock_counts_warehouses_warehouse_id",
                table: "stock_counts");

            migrationBuilder.DropIndex(
                name: "IX_stock_counts_approved_by",
                table: "stock_counts");

            migrationBuilder.DropIndex(
                name: "IX_stock_counts_completed_by",
                table: "stock_counts");

            migrationBuilder.DropIndex(
                name: "IX_stock_counts_reviewed_by",
                table: "stock_counts");

            migrationBuilder.DropIndex(
                name: "IX_stock_counts_started_by",
                table: "stock_counts");

            migrationBuilder.DropIndex(
                name: "IX_stock_counts_warehouse_id",
                table: "stock_counts");

            migrationBuilder.DropColumn(
                name: "approved_at",
                table: "stock_counts");

            migrationBuilder.DropColumn(
                name: "approved_by",
                table: "stock_counts");

            migrationBuilder.DropColumn(
                name: "rejection_reason",
                table: "stock_counts");

            migrationBuilder.DropColumn(
                name: "reviewed_at",
                table: "stock_counts");

            migrationBuilder.DropColumn(
                name: "reviewed_by",
                table: "stock_counts");

            migrationBuilder.DropColumn(
                name: "stock_applied",
                table: "stock_counts");

            migrationBuilder.DropColumn(
                name: "warehouse_id",
                table: "stock_counts");

            migrationBuilder.AlterColumn<Guid>(
                name: "branch_id",
                table: "stock_counts",
                type: "char(36)",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "char(36)",
                oldNullable: true);

            migrationBuilder.AddForeignKey(
                name: "FK_stock_counts_branches_branch_id",
                table: "stock_counts",
                column: "branch_id",
                principalTable: "branches",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
