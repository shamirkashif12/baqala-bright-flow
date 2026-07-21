using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddHrmShiftsAndAttendance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<Guid>(
                name: "user_id",
                table: "staff_attendance",
                type: "char(36)",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "char(36)");

            migrationBuilder.AddColumn<DateTime>(
                name: "date",
                table: "staff_attendance",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "early_leave_minutes",
                table: "staff_attendance",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "employee_id",
                table: "staff_attendance",
                type: "char(36)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "late_minutes",
                table: "staff_attendance",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "remarks",
                table: "staff_attendance",
                type: "longtext",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "shift_id",
                table: "staff_attendance",
                type: "char(36)",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "work_shifts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    name = table.Column<string>(type: "varchar(150)", maxLength: 150, nullable: false),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    department_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    working_days = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    start_time = table.Column<string>(type: "varchar(5)", maxLength: 5, nullable: false),
                    end_time = table.Column<string>(type: "varchar(5)", maxLength: 5, nullable: false),
                    break_start = table.Column<string>(type: "varchar(5)", maxLength: 5, nullable: true),
                    break_end = table.Column<string>(type: "varchar(5)", maxLength: 5, nullable: true),
                    grace_in_minutes = table.Column<int>(type: "int", nullable: false),
                    grace_out_minutes = table.Column<int>(type: "int", nullable: false),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_work_shifts", x => x.id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "employee_shift_assignments",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    employee_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    shift_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    effective_from = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    effective_to = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    assigned_by = table.Column<Guid>(type: "char(36)", nullable: true),
                    assigned_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_employee_shift_assignments", x => x.id);
                    table.ForeignKey(
                        name: "FK_employee_shift_assignments_work_shifts_shift_id",
                        column: x => x.shift_id,
                        principalTable: "work_shifts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_staff_attendance_employee_id_date",
                table: "staff_attendance",
                columns: new[] { "employee_id", "date" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_staff_attendance_shift_id",
                table: "staff_attendance",
                column: "shift_id");

            migrationBuilder.CreateIndex(
                name: "IX_employee_shift_assignments_assigned_by",
                table: "employee_shift_assignments",
                column: "assigned_by");

            migrationBuilder.CreateIndex(
                name: "IX_employee_shift_assignments_employee_id",
                table: "employee_shift_assignments",
                column: "employee_id");

            migrationBuilder.CreateIndex(
                name: "IX_employee_shift_assignments_shift_id",
                table: "employee_shift_assignments",
                column: "shift_id");

            migrationBuilder.CreateIndex(
                name: "IX_work_shifts_branch_id",
                table: "work_shifts",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_work_shifts_department_id",
                table: "work_shifts",
                column: "department_id");

            // branches/departments/employees/users were all created in earlier migrations, so
            // their actual collation may not match whatever these new FK columns get from the
            // server's ambient default. See MigrationCollationHelper for why. work_shifts is
            // created earlier in this same migration, so FKs to it can stay plain.
            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_staff_attendance_employees_employee_id",
                table: "staff_attendance",
                column: "employee_id",
                principalTable: "employees",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict,
                nullable: true);

            migrationBuilder.AddForeignKey(
                name: "FK_staff_attendance_work_shifts_shift_id",
                table: "staff_attendance",
                column: "shift_id",
                principalTable: "work_shifts",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_work_shifts_branches_branch_id",
                table: "work_shifts",
                column: "branch_id",
                principalTable: "branches",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict,
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_work_shifts_departments_department_id",
                table: "work_shifts",
                column: "department_id",
                principalTable: "departments",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict,
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_employee_shift_assignments_employees_employee_id",
                table: "employee_shift_assignments",
                column: "employee_id",
                principalTable: "employees",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_employee_shift_assignments_users_assigned_by",
                table: "employee_shift_assignments",
                column: "assigned_by",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_staff_attendance_employees_employee_id",
                table: "staff_attendance");

            migrationBuilder.DropForeignKey(
                name: "FK_staff_attendance_work_shifts_shift_id",
                table: "staff_attendance");

            migrationBuilder.DropTable(
                name: "employee_shift_assignments");

            migrationBuilder.DropTable(
                name: "work_shifts");

            migrationBuilder.DropIndex(
                name: "IX_staff_attendance_employee_id_date",
                table: "staff_attendance");

            migrationBuilder.DropIndex(
                name: "IX_staff_attendance_shift_id",
                table: "staff_attendance");

            migrationBuilder.DropColumn(
                name: "date",
                table: "staff_attendance");

            migrationBuilder.DropColumn(
                name: "early_leave_minutes",
                table: "staff_attendance");

            migrationBuilder.DropColumn(
                name: "employee_id",
                table: "staff_attendance");

            migrationBuilder.DropColumn(
                name: "late_minutes",
                table: "staff_attendance");

            migrationBuilder.DropColumn(
                name: "remarks",
                table: "staff_attendance");

            migrationBuilder.DropColumn(
                name: "shift_id",
                table: "staff_attendance");

            migrationBuilder.AlterColumn<Guid>(
                name: "user_id",
                table: "staff_attendance",
                type: "char(36)",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "char(36)",
                oldNullable: true);
        }
    }
}
