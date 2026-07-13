using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class RevertTobaccoSelfCheckoutExclusion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // AddSelfCheckoutKioskSupport blanket-excluded every tobacco product from self-checkout.
            // Reverted at the tenant's request: tobacco is now sellable through the kiosk, with the
            // KSA tobacco excise tax applied at checkout instead of an outright block. Staff can still
            // exclude any individual product via its own AllowSelfCheckout toggle for other reasons.
            migrationBuilder.Sql("UPDATE products SET allow_self_checkout = 1 WHERE is_tobacco = 1;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("UPDATE products SET allow_self_checkout = 0 WHERE is_tobacco = 1;");
        }
    }
}
