using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMaintenanceTickets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "maintenance_tickets",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    device_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    issue_type = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    priority = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    description = table.Column<string>(type: "longtext", nullable: false),
                    reported_by = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_maintenance_tickets", x => x.id);
                    table.ForeignKey(
                        name: "FK_maintenance_tickets_devices_device_id",
                        column: x => x.device_id,
                        principalTable: "devices",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_maintenance_tickets_device_id",
                table: "maintenance_tickets",
                column: "device_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "maintenance_tickets");
        }
    }
}
