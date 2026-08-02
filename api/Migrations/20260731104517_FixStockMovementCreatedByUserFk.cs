using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class FixStockMovementCreatedByUserFk : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Idempotent throughout — this migration got stuck permanently pending on the live
            // server: the no-transaction startup runner (Program.cs) had already dropped
            // FK_stock_movements_users_CreatedByUserId on an earlier partial attempt, so every
            // retry died immediately on "Constraint ... does not exist" before ever reaching the
            // AddForeignKey at the end, which blocked every migration after this one (including
            // AddTenantPlan/AddTenantPlanGatewayFields) on every single restart.
            migrationBuilder.DropForeignKeyIfExists("stock_movements", "FK_stock_movements_users_CreatedByUserId");
            migrationBuilder.DropIndexIfExists("stock_movements", "IX_stock_movements_CreatedByUserId");
            migrationBuilder.DropColumnIfExists("stock_movements", "CreatedByUserId");
            migrationBuilder.CreateIndexIfNotExists("IX_stock_movements_created_by", "stock_movements", "created_by");

            // Belt-and-suspenders for the *other* failure this migration can hit on real data:
            // adding the FK below fails with "foreign key constraint fails" if any stock_movements
            // row's created_by points at a user id that no longer exists (e.g. a deleted account).
            // created_by is nullable, so clearing dangling references is a safe, non-destructive
            // way to make the constraint addable rather than leaving it permanently unsatisfiable.
            migrationBuilder.Sql(@"
                UPDATE `stock_movements`
                SET `created_by` = NULL
                WHERE `created_by` IS NOT NULL
                  AND `created_by` NOT IN (SELECT `id` FROM `users`);
            ");

            migrationBuilder.AddForeignKeyIfNotExists(
                name: "FK_stock_movements_users_created_by",
                table: "stock_movements",
                column: "created_by",
                principalTable: "users",
                principalColumn: "id",
                onDeleteSql: "RESTRICT");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_stock_movements_users_created_by",
                table: "stock_movements");

            migrationBuilder.DropIndex(
                name: "IX_stock_movements_created_by",
                table: "stock_movements");

            migrationBuilder.AddColumn<Guid>(
                name: "CreatedByUserId",
                table: "stock_movements",
                type: "char(36)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_stock_movements_CreatedByUserId",
                table: "stock_movements",
                column: "CreatedByUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_stock_movements_users_CreatedByUserId",
                table: "stock_movements",
                column: "CreatedByUserId",
                principalTable: "users",
                principalColumn: "id");
        }
    }
}
