using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddKioskLockdownPin : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "kiosk_lockdown_pin_hash",
                table: "terminals",
                type: "varchar(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "kiosk_lockdown_pin_set_at",
                table: "terminals",
                type: "datetime(6)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "kiosk_lockdown_pin_hash",
                table: "terminals");

            migrationBuilder.DropColumn(
                name: "kiosk_lockdown_pin_set_at",
                table: "terminals");
        }
    }
}
