using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using BaqalaPOS.Api.Data;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <summary>
    /// Adds online_payments: the mart's own record of every online-order card payment from the
    /// moment its MyFatoorah invoice is created (see OnlinePayment.cs for the lifecycle and why —
    /// in short, so a payment can never exist only on MyFatoorah's side with nothing here to
    /// reconcile, refund, or turn into the order). Hand-written, no Designer.cs, matching every
    /// other recent migration; raw CREATE TABLE IF NOT EXISTS + IfNotExists helpers for the usual
    /// no-transaction partial-failure reasons — see MigrationIdempotencyHelper. [DbContext] is
    /// required since there's no Designer.cs to carry it.
    /// </summary>
    [DbContext(typeof(BaqalaDbContext))]
    [Migration("20260819090000_AddOnlinePayments")]
    public partial class AddOnlinePayments : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS `online_payments` (
                    `id` char(36) NOT NULL,
                    `branch_id` char(36) NOT NULL,
                    `provider` varchar(30) NOT NULL,
                    `gateway_invoice_id` bigint NOT NULL,
                    `invoice_url` varchar(500) NULL,
                    `amount_sar` decimal(18,4) NOT NULL,
                    `checkout_json` longtext NOT NULL,
                    `status` varchar(20) NOT NULL,
                    `order_id` char(36) NULL,
                    `gateway_payment_id` varchar(64) NULL,
                    `refund_id` bigint NULL,
                    `refund_reference` varchar(64) NULL,
                    `refund_amount` decimal(18,4) NULL,
                    `refund_currency` varchar(10) NULL,
                    `last_error` varchar(500) NULL,
                    `placement_attempts` int NOT NULL DEFAULT 0,
                    `created_at` datetime(6) NOT NULL,
                    `paid_at` datetime(6) NULL,
                    `resolved_at` datetime(6) NULL,
                    `updated_at` datetime(6) NOT NULL,
                    PRIMARY KEY (`id`)
                ) CHARACTER SET utf8mb4;
            ");

            migrationBuilder.CreateIndexIfNotExists(
                name: "IX_online_payments_gateway_invoice_id",
                table: "online_payments",
                columnsSql: "`gateway_invoice_id`",
                unique: true);

            migrationBuilder.CreateIndexIfNotExists(
                name: "IX_online_payments_status_created_at",
                table: "online_payments",
                columnsSql: "`status`, `created_at`");

            migrationBuilder.CreateIndexIfNotExists(
                name: "IX_online_payments_order_id",
                table: "online_payments",
                columnsSql: "`order_id`");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "online_payments");
        }
    }
}
