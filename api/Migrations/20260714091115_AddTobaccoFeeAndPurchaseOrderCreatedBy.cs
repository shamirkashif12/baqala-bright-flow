using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTobaccoFeeAndPurchaseOrderCreatedBy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // No-op: this dev database already has these columns/FK/index (and the created_by
            // backfill) from an earlier run of this exact migration under a different timestamp,
            // before its migration file was lost to an unrelated git reset. Re-running the DDL
            // here would fail with "Duplicate column name" — this migration exists only to record
            // itself in __EFMigrationsHistory so `dotnet ef database update` treats the model as
            // in sync. Down() below still performs the real rollback if ever needed.
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_purchase_orders_users_created_by",
                table: "purchase_orders");

            migrationBuilder.DropIndex(
                name: "IX_purchase_orders_created_by",
                table: "purchase_orders");

            migrationBuilder.DropColumn(
                name: "created_by",
                table: "purchase_orders");

            migrationBuilder.DropColumn(
                name: "tobacco_fee_amount",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "tobacco_fee_amount",
                table: "order_items");
        }
    }
}
