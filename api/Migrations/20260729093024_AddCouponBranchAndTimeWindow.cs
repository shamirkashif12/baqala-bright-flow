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
            migrationBuilder.AddColumnIfNotExists(
                table: "discounts",
                column: "auto_apply",
                columnDefinitionSql: "tinyint(1) NOT NULL DEFAULT 0");

            // Existing discount rows must stay combinable=true — before this column existed, every
            // discount always stacked with everything else unconditionally, so backfilling false
            // here would silently change behavior for every discount already configured.
            migrationBuilder.AddColumnIfNotExists(
                table: "discounts",
                column: "combinable",
                columnDefinitionSql: "tinyint(1) NOT NULL DEFAULT 1");

            migrationBuilder.AddColumnIfNotExists(
                table: "discounts",
                column: "max_discount_amount",
                columnDefinitionSql: "decimal(18,4) NULL");

            migrationBuilder.AddColumnIfNotExists(
                table: "coupons",
                column: "branch_id",
                columnDefinitionSql: "char(36) NULL");

            migrationBuilder.AddColumnIfNotExists(
                table: "coupons",
                column: "end_time",
                columnDefinitionSql: "time(6) NULL");

            migrationBuilder.AddColumnIfNotExists(
                table: "coupons",
                column: "start_time",
                columnDefinitionSql: "time(6) NULL");
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
