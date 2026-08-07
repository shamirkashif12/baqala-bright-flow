using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using BaqalaPOS.Api.Data;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <summary>
    /// Adds payment_integrations: per-branch connection state for a payment provider (NearPay,
    /// Nami, MyFatoorah, ...), see PaymentIntegration.cs. Hand-written, no Designer.cs, matching
    /// every other recent migration on this table — an EF scaffold would diff the whole model
    /// against whatever else is mid-flight. Uses raw "CREATE TABLE IF NOT EXISTS" plus the
    /// IfNotExists helpers for the usual no-transaction partial-failure reasons — see
    /// MigrationIdempotencyHelper. [DbContext] is required here since there's no Designer.cs to
    /// carry it — without it EF's migrations assembly scan never associates this migration with
    /// BaqalaDbContext, so GetPendingMigrationsAsync silently never returns it.
    /// </summary>
    [DbContext(typeof(BaqalaDbContext))]
    [Migration("20260807090000_AddPaymentIntegrations")]
    public partial class AddPaymentIntegrations : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS `payment_integrations` (
                    `id` char(36) NOT NULL,
                    `branch_id` char(36) NOT NULL,
                    `provider` varchar(50) NOT NULL,
                    `is_enabled` tinyint(1) NOT NULL DEFAULT 0,
                    `config_json` longtext NULL,
                    `created_at` datetime(6) NOT NULL,
                    `updated_at` datetime(6) NOT NULL,
                    PRIMARY KEY (`id`)
                ) CHARACTER SET utf8mb4;
            ");

            migrationBuilder.CreateIndexIfNotExists(
                name: "IX_payment_integrations_branch_id_provider",
                table: "payment_integrations",
                columnsSql: "`branch_id`, `provider`",
                unique: true);

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_payment_integrations_branches_branch_id",
                table: "payment_integrations",
                column: "branch_id",
                principalTable: "branches",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: false);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "payment_integrations");
        }
    }
}
