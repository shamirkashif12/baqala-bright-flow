using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using BaqalaPOS.Api.Data;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <summary>
    /// Adds pos_card_payments: the mart's own record of every POS-checkout card payment sent to
    /// the NamiPay terminal, from initiation through approval/decline and its link to the sale
    /// (see PosCardPayment.cs for the lifecycle and why — in short, so money taken on the
    /// terminal can never exist with nothing here to reconcile it against). Hand-written, no
    /// Designer.cs, matching every other recent migration; raw CREATE TABLE IF NOT EXISTS +
    /// IfNotExists helpers for the usual no-transaction partial-failure reasons — see
    /// MigrationIdempotencyHelper. [DbContext] is required since there's no Designer.cs to carry it.
    /// </summary>
    [DbContext(typeof(BaqalaDbContext))]
    [Migration("20260820100000_AddPosCardPayments")]
    public partial class AddPosCardPayments : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS `pos_card_payments` (
                    `id` char(36) NOT NULL,
                    `branch_id` char(36) NOT NULL,
                    `provider` varchar(30) NOT NULL,
                    `terminal_id` varchar(32) NOT NULL,
                    `order_ref` varchar(64) NOT NULL,
                    `gateway_transaction_id` varchar(64) NULL,
                    `amount` decimal(18,4) NOT NULL,
                    `status` varchar(20) NOT NULL,
                    `response_code` varchar(10) NULL,
                    `response_message` varchar(255) NULL,
                    `rrn` varchar(32) NULL,
                    `auth_code` varchar(32) NULL,
                    `pan_masked` varchar(32) NULL,
                    `order_id` char(36) NULL,
                    `cashier_id` char(36) NULL,
                    `last_error` varchar(500) NULL,
                    `created_at` datetime(6) NOT NULL,
                    `updated_at` datetime(6) NOT NULL,
                    `approved_at` datetime(6) NULL,
                    `resolved_at` datetime(6) NULL,
                    `attention_notified_at` datetime(6) NULL,
                    PRIMARY KEY (`id`)
                ) CHARACTER SET utf8mb4;
            ");

            migrationBuilder.CreateIndexIfNotExists(
                name: "IX_pos_card_payments_order_ref",
                table: "pos_card_payments",
                columnsSql: "`order_ref`",
                unique: true);

            migrationBuilder.CreateIndexIfNotExists(
                name: "IX_pos_card_payments_status_created_at",
                table: "pos_card_payments",
                columnsSql: "`status`, `created_at`");

            migrationBuilder.CreateIndexIfNotExists(
                name: "IX_pos_card_payments_order_id",
                table: "pos_card_payments",
                columnsSql: "`order_id`");

            migrationBuilder.CreateIndexIfNotExists(
                name: "IX_pos_card_payments_gateway_transaction_id",
                table: "pos_card_payments",
                columnsSql: "`gateway_transaction_id`");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "pos_card_payments");
        }
    }
}
