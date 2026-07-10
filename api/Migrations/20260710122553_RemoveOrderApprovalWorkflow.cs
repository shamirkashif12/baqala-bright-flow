using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class RemoveOrderApprovalWorkflow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "discount_approved_by",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "discount_requires_approval",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "void_approved_by",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "void_requested",
                table: "orders");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "discount_approved_by",
                table: "orders",
                type: "char(36)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "discount_requires_approval",
                table: "orders",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "void_approved_by",
                table: "orders",
                type: "char(36)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "void_requested",
                table: "orders",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);
        }
    }
}
