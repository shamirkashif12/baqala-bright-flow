using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using BaqalaPOS.Api.Data;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <summary>
    /// Adds the receipt logo fields to CompanyProfile: LogoDataUrl (on-screen preview) and
    /// LogoEscPosBase64 (pre-rasterized ESC/POS bitmap bytes, computed client-side at upload time
    /// — see src/lib/image.ts fileToLogoAssets), plus the two show/hide scope flags keyed on
    /// Order.Source (staff receipt vs. customer-facing slip).
    ///
    /// Hand-written, no Designer.cs, matching every migration on this table since
    /// AddPartialUniqueBarcodeForActiveProducts: an EF scaffold would diff the whole model against
    /// whatever else is mid-flight. Uses the IfNotExists helpers for the usual no-transaction
    /// partial-failure reasons — see MigrationIdempotencyHelper.
    /// </summary>
    [DbContext(typeof(BaqalaDbContext))]
    [Migration("20260806080000_AddReceiptLogoToCompanyProfile")]
    public partial class AddReceiptLogoToCompanyProfile : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumnIfNotExists("company_profile", "logo_data_url", "LONGTEXT NULL");
            migrationBuilder.AddColumnIfNotExists("company_profile", "logo_esc_pos_base64", "LONGTEXT NULL");
            migrationBuilder.AddColumnIfNotExists("company_profile", "show_logo_on_staff_receipt", "tinyint(1) NOT NULL DEFAULT FALSE");
            migrationBuilder.AddColumnIfNotExists("company_profile", "show_logo_on_customer_slip", "tinyint(1) NOT NULL DEFAULT FALSE");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumnIfExists("company_profile", "logo_data_url");
            migrationBuilder.DropColumnIfExists("company_profile", "logo_esc_pos_base64");
            migrationBuilder.DropColumnIfExists("company_profile", "show_logo_on_staff_receipt");
            migrationBuilder.DropColumnIfExists("company_profile", "show_logo_on_customer_slip");
        }
    }
}
