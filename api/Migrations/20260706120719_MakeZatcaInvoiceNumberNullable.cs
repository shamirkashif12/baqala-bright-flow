using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class MakeZatcaInvoiceNumberNullable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The model has declared InvoiceNumber as nullable since before this migration, but
            // the actual DB column was never altered to match (a pre-existing model/DB drift EF's
            // own change-detection can't see, since it diffs against the tracked snapshot, which
            // already said nullable). Real orders were only ever created with ZATCA invoices
            // disabled until now, so this NOT NULL violation never surfaced before.
            migrationBuilder.AlterColumn<string>(
                name: "invoice_number",
                table: "zatca_invoices",
                type: "varchar(100)",
                maxLength: 100,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "varchar(100)",
                oldMaxLength: 100);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "invoice_number",
                table: "zatca_invoices",
                type: "varchar(100)",
                maxLength: 100,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "varchar(100)",
                oldMaxLength: 100,
                oldNullable: true);
        }
    }
}
