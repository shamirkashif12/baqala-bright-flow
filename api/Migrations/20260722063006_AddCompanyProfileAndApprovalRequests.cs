using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCompanyProfileAndApprovalRequests : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "approval_requests",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    request_type = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false),
                    entity_type = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false),
                    entity_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    requested_by = table.Column<Guid>(type: "char(36)", nullable: false),
                    requested_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    approved_by = table.Column<Guid>(type: "char(36)", nullable: true),
                    approved_at = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    reason = table.Column<string>(type: "varchar(500)", maxLength: 500, nullable: true),
                    rejection_reason = table.Column<string>(type: "varchar(500)", maxLength: 500, nullable: true),
                    details_json = table.Column<string>(type: "longtext", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_approval_requests", x => x.id);
                    table.ForeignKey(
                        name: "FK_approval_requests_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_approval_requests_users_approved_by",
                        column: x => x.approved_by,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_approval_requests_users_requested_by",
                        column: x => x.requested_by,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "company_profile",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    legal_name = table.Column<string>(type: "varchar(500)", maxLength: 500, nullable: true),
                    cr_number = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: true),
                    vat_number = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: true),
                    updated_by = table.Column<Guid>(type: "char(36)", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_company_profile", x => x.id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.InsertData(
                table: "company_profile",
                columns: new[] { "id", "cr_number", "created_at", "legal_name", "updated_at", "updated_by", "vat_number" },
                values: new object[] { new Guid("00000000-0000-0000-0000-000000000002"), null, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, null });

            migrationBuilder.CreateIndex(
                name: "IX_approval_requests_approved_by",
                table: "approval_requests",
                column: "approved_by");

            migrationBuilder.CreateIndex(
                name: "IX_approval_requests_branch_id",
                table: "approval_requests",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_approval_requests_requested_by",
                table: "approval_requests",
                column: "requested_by");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "approval_requests");

            migrationBuilder.DropTable(
                name: "company_profile");
        }
    }
}
