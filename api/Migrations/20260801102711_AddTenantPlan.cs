using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTenantPlan : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "tenant_plan",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    tenant_id = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: true),
                    plan_id = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: true),
                    plan_name = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: true),
                    ecr_type = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    max_branches = table.Column<int>(type: "int", nullable: true),
                    max_terminals_per_branch = table.Column<int>(type: "int", nullable: true),
                    max_users_per_branch = table.Column<int>(type: "int", nullable: true),
                    features_json = table.Column<string>(type: "longtext", nullable: false),
                    billing_status = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    renews_at = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    provisioned_at = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tenant_plan", x => x.id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.InsertData(
                table: "tenant_plan",
                columns: new[] { "id", "billing_status", "created_at", "ecr_type", "features_json", "max_branches", "max_terminals_per_branch", "max_users_per_branch", "plan_id", "plan_name", "provisioned_at", "renews_at", "tenant_id", "updated_at" },
                values: new object[] { new Guid("00000000-0000-0000-0000-000000000003"), "active", new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "mart", "", null, null, null, null, null, null, null, null, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "tenant_plan");
        }
    }
}
