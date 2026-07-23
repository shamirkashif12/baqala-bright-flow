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
            // Guarded the same way as AddLoyaltyProgram/AddHrmShiftsAndAttendance: this project's
            // startup runner executes each migration's SQL directly without a wrapping transaction
            // (see Program.cs), so a partial failure here (most likely the FK re-add or one of the
            // brand-new FKs below hitting the incompatible-collation bug MigrationCollationHelper
            // exists for) would otherwise leave a mix of already-committed DDL that blows up
            // "Duplicate column name" / "check that column/key exists" on retry. See
            // MigrationIdempotencyHelper.
            migrationBuilder.DropForeignKeyIfExists("stock_counts", "FK_stock_counts_branches_branch_id");

            migrationBuilder.AlterColumn<Guid>(
                name: "branch_id",
                table: "stock_counts",
                type: "char(36)",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "char(36)");

            migrationBuilder.AddColumnIfNotExists("stock_counts", "approved_at", "datetime(6) NULL");
            migrationBuilder.AddColumnIfNotExists("stock_counts", "approved_by", "char(36) NULL");
            migrationBuilder.AddColumnIfNotExists("stock_counts", "rejection_reason", "varchar(500) NULL");
            migrationBuilder.AddColumnIfNotExists("stock_counts", "reviewed_at", "datetime(6) NULL");
            migrationBuilder.AddColumnIfNotExists("stock_counts", "reviewed_by", "char(36) NULL");
            migrationBuilder.AddColumnIfNotExists("stock_counts", "stock_applied", "tinyint(1) NOT NULL DEFAULT FALSE");
            migrationBuilder.AddColumnIfNotExists("stock_counts", "warehouse_id", "char(36) NULL");

            migrationBuilder.CreateIndexIfNotExists("IX_stock_counts_approved_by", "stock_counts", "`approved_by`");
            migrationBuilder.CreateIndexIfNotExists("IX_stock_counts_completed_by", "stock_counts", "`completed_by`");
            migrationBuilder.CreateIndexIfNotExists("IX_stock_counts_reviewed_by", "stock_counts", "`reviewed_by`");
            migrationBuilder.CreateIndexIfNotExists("IX_stock_counts_started_by", "stock_counts", "`started_by`");
            migrationBuilder.CreateIndexIfNotExists("IX_stock_counts_warehouse_id", "stock_counts", "`warehouse_id`");

            // branches/users/warehouses were all created in earlier migrations, so their actual
            // collation may not match whatever these FK columns get from the server's ambient
            // default — including completed_by/started_by, which already existed before this
            // migration but are only getting their FK now. See MigrationCollationHelper.
            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_stock_counts_branches_branch_id",
                table: "stock_counts",
                column: "branch_id",
                principalTable: "branches",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_stock_counts_users_approved_by",
                table: "stock_counts",
                column: "approved_by",
                principalTable: "users",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_stock_counts_users_completed_by",
                table: "stock_counts",
                column: "completed_by",
                principalTable: "users",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_stock_counts_users_reviewed_by",
                table: "stock_counts",
                column: "reviewed_by",
                principalTable: "users",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_stock_counts_users_started_by",
                table: "stock_counts",
                column: "started_by",
                principalTable: "users",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_stock_counts_warehouses_warehouse_id",
                table: "stock_counts",
                column: "warehouse_id",
                principalTable: "warehouses",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: true);

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
