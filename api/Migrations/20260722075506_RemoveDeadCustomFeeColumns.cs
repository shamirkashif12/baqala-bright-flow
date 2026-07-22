using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class RemoveDeadCustomFeeColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Both columns were confirmed dead: captured/audited/displayed but never read by any
            // pricing, checkout, or reporting code. Guarded per this project's standard pattern
            // (see MigrationIdempotencyHelper) even though a single DropColumn can't leave partial
            // state on its own — this migration drops two, so a failure after the first commits
            // would otherwise make a retry blow up on "unknown column" for that one.
            migrationBuilder.DropColumnIfExists("products", "custom_fee");
            migrationBuilder.DropColumnIfExists("order_items", "custom_fee_amount");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "custom_fee",
                table: "products",
                type: "decimal(18,4)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "custom_fee_amount",
                table: "order_items",
                type: "decimal(18,4)",
                nullable: false,
                defaultValue: 0m);
        }
    }
}
