using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using BaqalaPOS.Api.Data;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <summary>
    /// Adds order_payments.gateway_invoice_id (nullable BIGINT, unique) — the MyFatoorah
    /// InvoiceId settled by an online order's card payment, see OrderPayment.GatewayInvoiceId.
    /// The unique index is the whole point: PlacePublicOrder is anonymous and only checks that
    /// an invoice is "Paid" for the right amount, and MyFatoorah keeps reporting Paid forever,
    /// so without a DB-enforced one-invoice-one-order rule the same paid InvoiceId could be
    /// replayed into any number of orders (including concurrently, which an app-level "already
    /// used?" query alone can't stop). NULL is distinct in MySQL unique indexes, so the many
    /// NULLs on cash/POS payment rows never collide.
    ///
    /// Hand-written, no Designer.cs, matching every other recent migration in this codebase — an
    /// EF scaffold would diff the whole model against whatever else is mid-flight. Uses the
    /// IfNotExists helpers for the usual no-transaction partial-failure reasons — see
    /// MigrationIdempotencyHelper. [DbContext] is required here since there's no Designer.cs to
    /// carry it — without it EF's migrations assembly scan never associates this migration with
    /// BaqalaDbContext, so GetPendingMigrationsAsync silently never returns it.
    /// </summary>
    [DbContext(typeof(BaqalaDbContext))]
    [Migration("20260818120000_AddGatewayInvoiceIdToOrderPayments")]
    public partial class AddGatewayInvoiceIdToOrderPayments : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumnIfNotExists(
                "order_payments",
                "gateway_invoice_id",
                "BIGINT NULL");

            migrationBuilder.CreateIndexIfNotExists(
                "IX_order_payments_gateway_invoice_id",
                "order_payments",
                "`gateway_invoice_id`",
                unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndexIfExists("order_payments", "IX_order_payments_gateway_invoice_id");
            migrationBuilder.DropColumnIfExists("order_payments", "gateway_invoice_id");
        }
    }
}
