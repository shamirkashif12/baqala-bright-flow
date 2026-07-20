using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddHrmPayroll : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "payroll_runs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    year = table.Column<int>(type: "int", nullable: false),
                    month = table.Column<int>(type: "int", nullable: false),
                    pay_date = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    employee_count = table.Column<int>(type: "int", nullable: false),
                    total_amount = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    processed_by = table.Column<Guid>(type: "char(36)", nullable: true),
                    processed_at = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_payroll_runs", x => x.id);
                    table.ForeignKey(
                        name: "FK_payroll_runs_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_payroll_runs_users_processed_by",
                        column: x => x.processed_by,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "salary_components",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    employee_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    component_name = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: false),
                    component_type = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    amount = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    frequency = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    effective_from = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    effective_to = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_salary_components", x => x.id);
                    table.ForeignKey(
                        name: "FK_salary_components_employees_employee_id",
                        column: x => x.employee_id,
                        principalTable: "employees",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "payroll_run_employees",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    payroll_run_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    employee_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    basic_salary = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    gross_earnings = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    total_deductions = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    net_payable = table.Column<decimal>(type: "decimal(18,4)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_payroll_run_employees", x => x.id);
                    table.ForeignKey(
                        name: "FK_payroll_run_employees_employees_employee_id",
                        column: x => x.employee_id,
                        principalTable: "employees",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_payroll_run_employees_payroll_runs_payroll_run_id",
                        column: x => x.payroll_run_id,
                        principalTable: "payroll_runs",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_payroll_run_employees_employee_id",
                table: "payroll_run_employees",
                column: "employee_id");

            migrationBuilder.CreateIndex(
                name: "IX_payroll_run_employees_payroll_run_id",
                table: "payroll_run_employees",
                column: "payroll_run_id");

            migrationBuilder.CreateIndex(
                name: "IX_payroll_runs_branch_id",
                table: "payroll_runs",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_payroll_runs_processed_by",
                table: "payroll_runs",
                column: "processed_by");

            migrationBuilder.CreateIndex(
                name: "IX_salary_components_employee_id",
                table: "salary_components",
                column: "employee_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "payroll_run_employees");

            migrationBuilder.DropTable(
                name: "salary_components");

            migrationBuilder.DropTable(
                name: "payroll_runs");
        }
    }
}
