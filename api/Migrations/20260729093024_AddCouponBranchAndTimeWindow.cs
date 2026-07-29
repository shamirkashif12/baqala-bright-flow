using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCouponBranchAndTimeWindow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "auto_apply",
                table: "discounts",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            // Existing discount rows must stay combinable=true — before this column existed, every
            // discount always stacked with everything else unconditionally, so backfilling false
            // here would silently change behavior for every discount already configured.
            migrationBuilder.AddColumn<bool>(
                name: "combinable",
                table: "discounts",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<decimal>(
                name: "max_discount_amount",
                table: "discounts",
                type: "decimal(18,4)",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "branch_id",
                table: "coupons",
                type: "char(36)",
                nullable: true);

            migrationBuilder.AddColumn<TimeSpan>(
                name: "end_time",
                table: "coupons",
                type: "time(6)",
                nullable: true);

            migrationBuilder.AddColumn<TimeSpan>(
                name: "start_time",
                table: "coupons",
                type: "time(6)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "auto_apply",
                table: "discounts");

            migrationBuilder.DropColumn(
                name: "combinable",
                table: "discounts");

            migrationBuilder.DropColumn(
                name: "max_discount_amount",
                table: "discounts");

            migrationBuilder.DropColumn(
                name: "branch_id",
                table: "coupons");

            migrationBuilder.DropColumn(
                name: "end_time",
                table: "coupons");

            migrationBuilder.DropColumn(
                name: "start_time",
                table: "coupons");
        }
    }
}
