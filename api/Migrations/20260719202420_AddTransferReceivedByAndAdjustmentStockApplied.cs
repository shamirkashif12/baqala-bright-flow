using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTransferReceivedByAndAdjustmentStockApplied : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Only the two genuinely-new columns for this feature. Every other add EF's diff
            // produced belongs to an earlier staged migration (approval flow, stock count type,
            // pricing rules, recalls…) that already owns it — the committed model snapshot was
            // behind those migrations, so `migrations add` re-diffed them. Regenerating the
            // snapshot (kept) fixed that; this Up is trimmed so it can't re-add existing columns.

            migrationBuilder.AddColumn<Guid>(
                name: "received_by",
                table: "stock_transfers",
                type: "char(36)",
                nullable: true);

            // Default true backfills every existing adjustment as already-applied — which is the
            // truth: before approval-gating, all write-offs deducted stock immediately. New pending
            // wastage rows are written with false explicitly by InventoryController.Adjust.
            migrationBuilder.AddColumn<bool>(
                name: "stock_applied",
                table: "inventory_adjustments",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: true);

            migrationBuilder.CreateIndex(
                name: "IX_stock_transfers_received_by",
                table: "stock_transfers",
                column: "received_by");

            migrationBuilder.AddForeignKey(
                name: "FK_stock_transfers_users_received_by",
                table: "stock_transfers",
                column: "received_by",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_stock_transfers_users_received_by",
                table: "stock_transfers");

            migrationBuilder.DropIndex(
                name: "IX_stock_transfers_received_by",
                table: "stock_transfers");

            migrationBuilder.DropColumn(
                name: "received_by",
                table: "stock_transfers");

            migrationBuilder.DropColumn(
                name: "stock_applied",
                table: "inventory_adjustments");
        }
    }
}
