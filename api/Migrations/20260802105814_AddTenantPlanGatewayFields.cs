using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantPlanGatewayFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // AddColumnIfNotExists (see MigrationIdempotencyHelper), not plain AddColumn — same
            // no-transaction startup-runner risk as AddTenantPlan: a partial prior run would leave
            // some of these six columns already committed, and a plain AddColumn replay dies on
            // "Duplicate column name" for whichever one landed last time.
            migrationBuilder.AddColumnIfNotExists("tenant_plan", "business_id", "int NULL");
            migrationBuilder.AddColumnIfNotExists("tenant_plan", "category", "varchar(100) NULL");
            migrationBuilder.AddColumnIfNotExists("tenant_plan", "ecr_id", "int NULL");
            migrationBuilder.AddColumnIfNotExists("tenant_plan", "last_event_id", "varchar(100) NULL");
            migrationBuilder.AddColumnIfNotExists("tenant_plan", "max_products", "int NULL");
            migrationBuilder.AddColumnIfNotExists("tenant_plan", "subscription_id", "int NULL");

            // Setting already-null columns to null is a no-op regardless of how many times this
            // runs — no guard needed here, unlike the AddColumn calls above.
            migrationBuilder.UpdateData(
                table: "tenant_plan",
                keyColumn: "id",
                keyValue: new Guid("00000000-0000-0000-0000-000000000003"),
                columns: new[] { "business_id", "category", "ecr_id", "last_event_id", "max_products", "subscription_id" },
                values: new object[] { null, null, null, null, null, null });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "business_id",
                table: "tenant_plan");

            migrationBuilder.DropColumn(
                name: "category",
                table: "tenant_plan");

            migrationBuilder.DropColumn(
                name: "ecr_id",
                table: "tenant_plan");

            migrationBuilder.DropColumn(
                name: "last_event_id",
                table: "tenant_plan");

            migrationBuilder.DropColumn(
                name: "max_products",
                table: "tenant_plan");

            migrationBuilder.DropColumn(
                name: "subscription_id",
                table: "tenant_plan");
        }
    }
}
