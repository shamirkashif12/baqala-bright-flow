using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOnlineOrdering : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "online_ordering_enabled",
                table: "pos_settings",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "online_ordering_max_order_value_sar",
                table: "pos_settings",
                type: "decimal(18,4)",
                nullable: false,
                defaultValue: 1000m);

            migrationBuilder.AddColumn<decimal>(
                name: "online_ordering_min_order_amount_sar",
                table: "pos_settings",
                type: "decimal(18,4)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<DateTime>(
                name: "approved_at",
                table: "orders",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "approved_by",
                table: "orders",
                type: "char(36)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "rejection_reason",
                table: "orders",
                type: "varchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "order_delivery_details",
                columns: table => new
                {
                    order_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    full_name = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    phone = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    email = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    address_line = table.Column<string>(type: "longtext", nullable: false),
                    latitude = table.Column<decimal>(type: "decimal(18,4)", nullable: true),
                    longitude = table.Column<decimal>(type: "decimal(18,4)", nullable: true),
                    notes = table.Column<string>(type: "longtext", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_order_delivery_details", x => x.order_id);
                    table.ForeignKey(
                        name: "FK_order_delivery_details_orders_order_id",
                        column: x => x.order_id,
                        principalTable: "orders",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "order_delivery_details");

            migrationBuilder.DropColumn(
                name: "online_ordering_enabled",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "online_ordering_max_order_value_sar",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "online_ordering_min_order_amount_sar",
                table: "pos_settings");

            migrationBuilder.DropColumn(
                name: "approved_at",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "approved_by",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "rejection_reason",
                table: "orders");
        }
    }
}
