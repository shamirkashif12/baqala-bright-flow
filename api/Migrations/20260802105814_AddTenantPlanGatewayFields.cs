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
            migrationBuilder.AddColumn<int>(
                name: "business_id",
                table: "tenant_plan",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "category",
                table: "tenant_plan",
                type: "varchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ecr_id",
                table: "tenant_plan",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "last_event_id",
                table: "tenant_plan",
                type: "varchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "max_products",
                table: "tenant_plan",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "subscription_id",
                table: "tenant_plan",
                type: "int",
                nullable: true);

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
