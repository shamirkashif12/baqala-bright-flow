using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddHrmCoreTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "holidays",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    name = table.Column<string>(type: "varchar(150)", maxLength: 150, nullable: false),
                    holiday_type = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false),
                    date = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    description = table.Column<string>(type: "longtext", nullable: true),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_holidays", x => x.id);
                    table.ForeignKey(
                        name: "FK_holidays_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "departments",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    name = table.Column<string>(type: "varchar(150)", maxLength: 150, nullable: false),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    manager_employee_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_departments", x => x.id);
                    table.ForeignKey(
                        name: "FK_departments_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "designations",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    name = table.Column<string>(type: "varchar(150)", maxLength: 150, nullable: false),
                    department_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    grade = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: true),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_designations", x => x.id);
                    table.ForeignKey(
                        name: "FK_designations_departments_department_id",
                        column: x => x.department_id,
                        principalTable: "departments",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "employees",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    employee_code = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    full_name = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    email = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    phone = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    emergency_contact = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: true),
                    national_id = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    iqama_expiry = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    date_of_birth = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    gender = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: true),
                    nationality = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: true),
                    marital_status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: true),
                    profile_image_url = table.Column<string>(type: "longtext", nullable: true),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    department_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    designation_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    role_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    user_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    hire_date = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    employment_status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    current_address = table.Column<string>(type: "longtext", nullable: true),
                    permanent_address = table.Column<string>(type: "longtext", nullable: true),
                    contract_type = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: true),
                    contract_start_date = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    contract_end_date = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    contract_open_ended = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_employees", x => x.id);
                    table.ForeignKey(
                        name: "FK_employees_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_employees_departments_department_id",
                        column: x => x.department_id,
                        principalTable: "departments",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_employees_designations_designation_id",
                        column: x => x.designation_id,
                        principalTable: "designations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_employees_roles_role_id",
                        column: x => x.role_id,
                        principalTable: "roles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_employees_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_departments_branch_id",
                table: "departments",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_departments_manager_employee_id",
                table: "departments",
                column: "manager_employee_id");

            migrationBuilder.CreateIndex(
                name: "IX_departments_name_branch_id",
                table: "departments",
                columns: new[] { "name", "branch_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_designations_department_id",
                table: "designations",
                column: "department_id");

            migrationBuilder.CreateIndex(
                name: "IX_employees_branch_id",
                table: "employees",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_employees_department_id",
                table: "employees",
                column: "department_id");

            migrationBuilder.CreateIndex(
                name: "IX_employees_designation_id",
                table: "employees",
                column: "designation_id");

            migrationBuilder.CreateIndex(
                name: "IX_employees_employee_code",
                table: "employees",
                column: "employee_code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_employees_national_id",
                table: "employees",
                column: "national_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_employees_role_id",
                table: "employees",
                column: "role_id");

            migrationBuilder.CreateIndex(
                name: "IX_employees_user_id",
                table: "employees",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "IX_holidays_branch_id",
                table: "holidays",
                column: "branch_id");

            migrationBuilder.AddForeignKey(
                name: "FK_departments_employees_manager_employee_id",
                table: "departments",
                column: "manager_employee_id",
                principalTable: "employees",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_departments_employees_manager_employee_id",
                table: "departments");

            migrationBuilder.DropTable(
                name: "holidays");

            migrationBuilder.DropTable(
                name: "employees");

            migrationBuilder.DropTable(
                name: "designations");

            migrationBuilder.DropTable(
                name: "departments");
        }
    }
}
