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
            migrationBuilder.DropForeignKey(
                name: "FK_stock_movements_users_CreatedByUserId",
                table: "stock_movements");

            migrationBuilder.DropIndex(
                name: "IX_stock_movements_CreatedByUserId",
                table: "stock_movements");

            migrationBuilder.DropColumn(
                name: "CreatedByUserId",
                table: "stock_movements");

            migrationBuilder.CreateIndex(
                name: "IX_stock_movements_created_by",
                table: "stock_movements",
                column: "created_by");

            migrationBuilder.AddForeignKey(
                name: "FK_stock_movements_users_created_by",
                table: "stock_movements",
                column: "created_by",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
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
