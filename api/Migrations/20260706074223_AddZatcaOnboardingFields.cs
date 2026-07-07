using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddZatcaOnboardingFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "building_number",
                table: "zatca_settings",
                type: "varchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ccsid_binary_security_token",
                table: "zatca_settings",
                type: "longtext",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ccsid_request_id",
                table: "zatca_settings",
                type: "varchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ccsid_secret",
                table: "zatca_settings",
                type: "longtext",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "city_subdivision_name",
                table: "zatca_settings",
                type: "varchar(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "csr",
                table: "zatca_settings",
                type: "longtext",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "egs_serial",
                table: "zatca_settings",
                type: "varchar(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "last_icv",
                table: "zatca_settings",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "last_invoice_hash",
                table: "zatca_settings",
                type: "varchar(255)",
                maxLength: 255,
                nullable: false,
                defaultValue: "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==");

            migrationBuilder.AddColumn<string>(
                name: "onboarding_status",
                table: "zatca_settings",
                type: "varchar(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "not_started");

            migrationBuilder.AddColumn<string>(
                name: "pcsid_binary_security_token",
                table: "zatca_settings",
                type: "longtext",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "pcsid_request_id",
                table: "zatca_settings",
                type: "varchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "pcsid_secret",
                table: "zatca_settings",
                type: "longtext",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "postal_zone",
                table: "zatca_settings",
                type: "varchar(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "street_name",
                table: "zatca_settings",
                type: "varchar(255)",
                maxLength: 255,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "building_number",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "ccsid_binary_security_token",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "ccsid_request_id",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "ccsid_secret",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "city_subdivision_name",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "csr",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "egs_serial",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "last_icv",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "last_invoice_hash",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "onboarding_status",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "pcsid_binary_security_token",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "pcsid_request_id",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "pcsid_secret",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "postal_zone",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "street_name",
                table: "zatca_settings");
        }
    }
}
