using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddZatcaInvoiceBuyerAddress : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "buyer_building_number",
                table: "zatca_invoices",
                type: "varchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "buyer_city_name",
                table: "zatca_invoices",
                type: "varchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "buyer_city_subdivision_name",
                table: "zatca_invoices",
                type: "varchar(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "buyer_postal_zone",
                table: "zatca_invoices",
                type: "varchar(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "buyer_street_name",
                table: "zatca_invoices",
                type: "varchar(255)",
                maxLength: 255,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "buyer_building_number",
                table: "zatca_invoices");

            migrationBuilder.DropColumn(
                name: "buyer_city_name",
                table: "zatca_invoices");

            migrationBuilder.DropColumn(
                name: "buyer_city_subdivision_name",
                table: "zatca_invoices");

            migrationBuilder.DropColumn(
                name: "buyer_postal_zone",
                table: "zatca_invoices");

            migrationBuilder.DropColumn(
                name: "buyer_street_name",
                table: "zatca_invoices");
        }
    }
}
