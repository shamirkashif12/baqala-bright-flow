using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddConfigurableTobaccoExciseMinimum : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // DEFAULT 25 here (not the EF-scaffolded 0) matters for more than new rows: MySQL's
            // ADD COLUMN ... DEFAULT backfills every EXISTING row too, so the current
            // tobacco_excise rule row picks up the same 25 SAR floor that was previously
            // hardcoded — this migration must not silently change what a live tobacco sale
            // charges. Guarded per this project's standard pattern (MigrationIdempotencyHelper).
            migrationBuilder.AddColumnIfNotExists("tax_fee_rules", "minimum_excise_amount", "decimal(18,4) NOT NULL DEFAULT 25.0000");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "minimum_excise_amount",
                table: "tax_fee_rules");
        }
    }
}
