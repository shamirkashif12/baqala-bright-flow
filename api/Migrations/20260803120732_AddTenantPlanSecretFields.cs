using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantPlanSecretFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // IfNotExists — same no-transaction startup-runner partial-failure risk as every other
            // migration on this table (see AddTenantPlanGatewayFields); safe to retry from any state.
            migrationBuilder.AddColumnIfNotExists("tenant_plan", "gateway_jwt_audience", "varchar(200) NULL");
            migrationBuilder.AddColumnIfNotExists("tenant_plan", "gateway_jwt_issuer", "varchar(200) NULL");
            migrationBuilder.AddColumnIfNotExists("tenant_plan", "gateway_jwt_key", "varchar(200) NULL");
            migrationBuilder.AddColumnIfNotExists("tenant_plan", "webhook_shared_secret", "varchar(200) NULL");

            migrationBuilder.UpdateData(
                table: "tenant_plan",
                keyColumn: "id",
                keyValue: new Guid("00000000-0000-0000-0000-000000000003"),
                columns: new[] { "gateway_jwt_audience", "gateway_jwt_issuer", "gateway_jwt_key", "webhook_shared_secret" },
                values: new object[] { null, null, null, null });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "gateway_jwt_audience",
                table: "tenant_plan");

            migrationBuilder.DropColumn(
                name: "gateway_jwt_issuer",
                table: "tenant_plan");

            migrationBuilder.DropColumn(
                name: "gateway_jwt_key",
                table: "tenant_plan");

            migrationBuilder.DropColumn(
                name: "webhook_shared_secret",
                table: "tenant_plan");
        }
    }
}
