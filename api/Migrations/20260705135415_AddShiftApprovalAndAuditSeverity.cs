using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddShiftApprovalAndAuditSeverity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "approved_at",
                table: "cashier_shifts",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "approved_by",
                table: "cashier_shifts",
                type: "char(36)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "close_reason",
                table: "cashier_shifts",
                type: "longtext",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "closed_by",
                table: "cashier_shifts",
                type: "char(36)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "requires_approval",
                table: "cashier_shifts",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "severity",
                table: "audit_logs",
                type: "varchar(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "approved_at",
                table: "cashier_shifts");

            migrationBuilder.DropColumn(
                name: "approved_by",
                table: "cashier_shifts");

            migrationBuilder.DropColumn(
                name: "close_reason",
                table: "cashier_shifts");

            migrationBuilder.DropColumn(
                name: "closed_by",
                table: "cashier_shifts");

            migrationBuilder.DropColumn(
                name: "requires_approval",
                table: "cashier_shifts");

            migrationBuilder.DropColumn(
                name: "severity",
                table: "audit_logs");
        }
    }
}
