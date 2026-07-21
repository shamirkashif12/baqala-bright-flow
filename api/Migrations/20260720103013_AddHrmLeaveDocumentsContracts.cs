using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddHrmLeaveDocumentsContracts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "leave_policy_id",
                table: "employees",
                type: "char(36)",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "employee_contracts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    employee_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    contract_type = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false),
                    start_date = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    end_date = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    open_ended = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    file_name = table.Column<string>(type: "longtext", nullable: true),
                    file_url = table.Column<string>(type: "longtext", nullable: true),
                    uploaded_by = table.Column<Guid>(type: "char(36)", nullable: true),
                    uploaded_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_employee_contracts", x => x.id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "employee_documents",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    employee_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    document_type = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    file_name = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    file_url = table.Column<string>(type: "longtext", nullable: false),
                    issue_date = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    expiry_date = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    uploaded_by = table.Column<Guid>(type: "char(36)", nullable: true),
                    uploaded_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_employee_documents", x => x.id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "leave_policies",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    name = table.Column<string>(type: "varchar(150)", maxLength: 150, nullable: false),
                    annual_days = table.Column<int>(type: "int", nullable: false),
                    sick_days = table.Column<int>(type: "int", nullable: false),
                    casual_days = table.Column<int>(type: "int", nullable: false),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_leave_policies", x => x.id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "leave_types",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    name = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: false),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_leave_types", x => x.id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "leave_requests",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    employee_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    leave_type_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    from_date = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    to_date = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    total_days = table.Column<int>(type: "int", nullable: false),
                    reason = table.Column<string>(type: "longtext", nullable: false),
                    attachment_url = table.Column<string>(type: "longtext", nullable: true),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    approver_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    approved_at = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    rejection_reason = table.Column<string>(type: "longtext", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_leave_requests", x => x.id);
                    table.ForeignKey(
                        name: "FK_leave_requests_leave_types_leave_type_id",
                        column: x => x.leave_type_id,
                        principalTable: "leave_types",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_employees_leave_policy_id",
                table: "employees",
                column: "leave_policy_id");

            migrationBuilder.CreateIndex(
                name: "IX_employee_contracts_employee_id",
                table: "employee_contracts",
                column: "employee_id");

            migrationBuilder.CreateIndex(
                name: "IX_employee_contracts_uploaded_by",
                table: "employee_contracts",
                column: "uploaded_by");

            migrationBuilder.CreateIndex(
                name: "IX_employee_documents_employee_id",
                table: "employee_documents",
                column: "employee_id");

            migrationBuilder.CreateIndex(
                name: "IX_employee_documents_uploaded_by",
                table: "employee_documents",
                column: "uploaded_by");

            migrationBuilder.CreateIndex(
                name: "IX_leave_requests_approver_id",
                table: "leave_requests",
                column: "approver_id");

            migrationBuilder.CreateIndex(
                name: "IX_leave_requests_employee_id",
                table: "leave_requests",
                column: "employee_id");

            migrationBuilder.CreateIndex(
                name: "IX_leave_requests_leave_type_id",
                table: "leave_requests",
                column: "leave_type_id");

            // employees/users were created in earlier migrations, so their actual collation may
            // not match whatever these new FK columns get from the server's ambient default. See
            // MigrationCollationHelper for why. employees.leave_policy_id needs the same
            // treatment even though leave_policies is brand new in this migration: it's added via
            // AddColumn to a table that already existed, so it inherits employees' own collation
            // from whenever it was originally created, not today's ambient default that
            // leave_policies.id just got.
            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_employees_leave_policies_leave_policy_id",
                table: "employees",
                column: "leave_policy_id",
                principalTable: "leave_policies",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict,
                nullable: true);
            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_employee_contracts_employees_employee_id",
                table: "employee_contracts",
                column: "employee_id",
                principalTable: "employees",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_employee_contracts_users_uploaded_by",
                table: "employee_contracts",
                column: "uploaded_by",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict,
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_employee_documents_employees_employee_id",
                table: "employee_documents",
                column: "employee_id",
                principalTable: "employees",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_employee_documents_users_uploaded_by",
                table: "employee_documents",
                column: "uploaded_by",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict,
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_leave_requests_employees_employee_id",
                table: "leave_requests",
                column: "employee_id",
                principalTable: "employees",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_leave_requests_users_approver_id",
                table: "leave_requests",
                column: "approver_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_employees_leave_policies_leave_policy_id",
                table: "employees");

            migrationBuilder.DropTable(
                name: "employee_contracts");

            migrationBuilder.DropTable(
                name: "employee_documents");

            migrationBuilder.DropTable(
                name: "leave_policies");

            migrationBuilder.DropTable(
                name: "leave_requests");

            migrationBuilder.DropTable(
                name: "leave_types");

            migrationBuilder.DropIndex(
                name: "IX_employees_leave_policy_id",
                table: "employees");

            migrationBuilder.DropColumn(
                name: "leave_policy_id",
                table: "employees");
        }
    }
}
