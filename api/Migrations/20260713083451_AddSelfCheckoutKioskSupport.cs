using System;
using Microsoft.EntityFrameworkCore.Migrations;
using MySql.EntityFrameworkCore.Metadata;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSelfCheckoutKioskSupport : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "pairing_secret_hash",
                table: "terminals",
                type: "varchar(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "pairing_secret_set_at",
                table: "terminals",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "allow_self_checkout",
                table: "products",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<decimal>(
                name: "self_checkout_max_order_value_sar",
                table: "pos_settings",
                type: "decimal(18,4)",
                nullable: false,
                defaultValue: 500m);

            // Age-restricted items must never be self-checkout-eligible, even though the new
            // column otherwise defaults every existing row to true.
            migrationBuilder.Sql("UPDATE products SET allow_self_checkout = 0 WHERE is_tobacco = 1;");

            migrationBuilder.CreateTable(
                name: "DataProtectionKeys",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySQL:ValueGenerationStrategy", MySQLValueGenerationStrategy.IdentityColumn),
                    FriendlyName = table.Column<string>(type: "longtext", nullable: true),
                    Xml = table.Column<string>(type: "longtext", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DataProtectionKeys", x => x.Id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.InsertData(
                table: "roles",
                columns: new[] { "id", "created_at", "description", "is_system", "name", "name_ar", "updated_at" },
                values: new object[] { new Guid("666c6573-635f-6568-636b-6f75745f6b69"), new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "System role: Self-Checkout Kiosk", true, "Self-Checkout Kiosk", "كشك الدفع الذاتي", new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "DataProtectionKeys");

            migrationBuilder.DeleteData(
                table: "roles",
                keyColumn: "id",
                keyValue: new Guid("666c6573-635f-6568-636b-6f75745f6b69"));

            migrationBuilder.DropColumn(
                name: "pairing_secret_hash",
                table: "terminals");

            migrationBuilder.DropColumn(
                name: "pairing_secret_set_at",
                table: "terminals");

            migrationBuilder.DropColumn(
                name: "allow_self_checkout",
                table: "products");

            migrationBuilder.DropColumn(
                name: "self_checkout_max_order_value_sar",
                table: "pos_settings");
        }
    }
}
