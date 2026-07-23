using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class RemoveDiscountMinCustomerTier : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded per this project's standard pattern (MigrationIdempotencyHelper) — this
            // migration is sequenced directly behind AddSupplierProfileAuditDeviceAndPoReceivedBy,
            // which partially applied on live before being fixed for safe re-run. A plain DropColumn
            // here would blow up on "unknown column" if this migration's Up() ever gets replayed
            // after already having applied successfully once.
            migrationBuilder.DropColumnIfExists("discounts", "min_customer_tier");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "min_customer_tier",
                table: "discounts",
                type: "varchar(20)",
                maxLength: 20,
                nullable: true);
        }
    }
}
