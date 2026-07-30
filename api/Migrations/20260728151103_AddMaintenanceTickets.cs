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
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS `maintenance_tickets` (
                    `id` char(36) NOT NULL,
                    `device_id` char(36) NOT NULL,
                    `issue_type` varchar(50) NOT NULL,
                    `priority` varchar(20) NOT NULL,
                    `description` longtext NOT NULL,
                    `reported_by` varchar(255) NULL,
                    `status` varchar(20) NOT NULL,
                    `created_at` datetime(6) NOT NULL,
                    `updated_at` datetime(6) NOT NULL,
                    CONSTRAINT `PK_maintenance_tickets` PRIMARY KEY (`id`)
                ) CHARACTER SET utf8mb4;
            ");

            migrationBuilder.CreateIndexIfNotExists(
                name: "IX_maintenance_tickets_device_id",
                table: "maintenance_tickets",
                columnsSql: "`device_id`");

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_maintenance_tickets_devices_device_id",
                table: "maintenance_tickets",
                column: "device_id",
                principalTable: "devices",
                principalColumn: "id",
                onDeleteSql: "CASCADE");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "maintenance_tickets");
        }
    }
}
