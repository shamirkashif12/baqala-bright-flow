using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddLoyaltyProgram : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "loyalty_discount_amount",
                table: "orders",
                type: "decimal(18,4)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "loyalty_points_redeemed",
                table: "orders",
                type: "decimal(18,4)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<bool>(
                name: "expired_flag",
                table: "loyalty_transactions",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "monetary_value",
                table: "loyalty_transactions",
                type: "decimal(18,4)",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "loyalty_programs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    program_name = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    description = table.Column<string>(type: "longtext", nullable: true),
                    logo_url = table.Column<string>(type: "longtext", nullable: true),
                    brand_color = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: true),
                    points_per_currency_unit = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    redemption_value_per_point = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    min_points_to_redeem = table.Column<int>(type: "int", nullable: false),
                    max_redeem_pct_of_order = table.Column<decimal>(type: "decimal(18,4)", nullable: true),
                    points_expiry_days = table.Column<int>(type: "int", nullable: true),
                    silver_threshold = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    gold_threshold = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    platinum_threshold = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    silver_earn_multiplier = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    gold_earn_multiplier = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    platinum_earn_multiplier = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    is_active = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_loyalty_programs", x => x.id);
                    table.ForeignKey(
                        name: "FK_loyalty_programs_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.InsertData(
                table: "loyalty_programs",
                columns: new[] { "id", "branch_id", "brand_color", "created_at", "description", "gold_earn_multiplier", "gold_threshold", "is_active", "logo_url", "max_redeem_pct_of_order", "min_points_to_redeem", "platinum_earn_multiplier", "platinum_threshold", "points_expiry_days", "points_per_currency_unit", "program_name", "redemption_value_per_point", "silver_earn_multiplier", "silver_threshold", "updated_at" },
                values: new object[] { new Guid("00000000-0000-0000-0000-000000000001"), null, "#7c3aed", new DateTime(2026, 7, 21, 0, 0, 0, 0, DateTimeKind.Utc), null, 1m, 5000m, true, null, 50m, 100, 1m, 10000m, 365, 1m, "Loyalty Rewards", 0.01m, 1m, 1000m, new DateTime(2026, 7, 21, 0, 0, 0, 0, DateTimeKind.Utc) });

            migrationBuilder.CreateIndex(
                name: "IX_loyalty_programs_branch_id",
                table: "loyalty_programs",
                column: "branch_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "loyalty_programs");

            migrationBuilder.DropColumn(
                name: "loyalty_discount_amount",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "loyalty_points_redeemed",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "expired_flag",
                table: "loyalty_transactions");

            migrationBuilder.DropColumn(
                name: "monetary_value",
                table: "loyalty_transactions");
        }
    }
}
