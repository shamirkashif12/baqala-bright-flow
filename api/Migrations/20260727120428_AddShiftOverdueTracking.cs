using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddShiftOverdueTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "overdue_flagged_at",
                table: "cashier_shifts",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "overdue_override_by",
                table: "cashier_shifts",
                type: "char(36)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "overdue_override_until",
                table: "cashier_shifts",
                type: "datetime(6)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "overdue_flagged_at",
                table: "cashier_shifts");

            migrationBuilder.DropColumn(
                name: "overdue_override_by",
                table: "cashier_shifts");

            migrationBuilder.DropColumn(
                name: "overdue_override_until",
                table: "cashier_shifts");
        }
    }
}
