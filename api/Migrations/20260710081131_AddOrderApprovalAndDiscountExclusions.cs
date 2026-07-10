using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderApprovalAndDiscountExclusions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "discount_approved_by",
                table: "orders",
                type: "char(36)",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "void_approved_by",
                table: "orders",
                type: "char(36)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "void_reason",
                table: "orders",
                type: "longtext",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "excluded_product_ids",
                table: "discounts",
                type: "longtext",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "discount_approved_by",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "void_approved_by",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "void_reason",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "excluded_product_ids",
                table: "discounts");
        }
    }
}
