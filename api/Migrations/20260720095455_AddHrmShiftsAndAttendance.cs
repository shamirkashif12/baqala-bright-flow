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
            // This migration previously failed partway through on production (first on an
            // incompatible-collation FK, then again — after that fix — on "Duplicate column name
            // 'date'"), because this project's startup runner executes each migration's SQL
            // directly without a wrapping transaction (see Program.cs), so everything before the
            // failure point had already committed without the migration being recorded as
            // applied. Every statement below is guarded so re-running this migration is safe
            // regardless of how far a previous attempt got. See MigrationIdempotencyHelper.
            migrationBuilder.AlterColumn<Guid>(
                name: "user_id",
                table: "staff_attendance",
                type: "char(36)",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "char(36)");

            migrationBuilder.AddColumnIfNotExists("staff_attendance", "date", "datetime(6) NULL");
            migrationBuilder.AddColumnIfNotExists("staff_attendance", "early_leave_minutes", "int NOT NULL DEFAULT 0");
            migrationBuilder.AddColumnIfNotExists("staff_attendance", "employee_id", "char(36) NULL");
            migrationBuilder.AddColumnIfNotExists("staff_attendance", "late_minutes", "int NOT NULL DEFAULT 0");
            migrationBuilder.AddColumnIfNotExists("staff_attendance", "remarks", "longtext NULL");
            migrationBuilder.AddColumnIfNotExists("staff_attendance", "shift_id", "char(36) NULL");

            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS `work_shifts` (
                    `id` char(36) NOT NULL,
                    `name` varchar(150) NOT NULL,
                    `branch_id` char(36) NULL,
                    `department_id` char(36) NULL,
                    `working_days` varchar(50) NOT NULL,
                    `start_time` varchar(5) NOT NULL,
                    `end_time` varchar(5) NOT NULL,
                    `break_start` varchar(5) NULL,
                    `break_end` varchar(5) NULL,
                    `grace_in_minutes` int NOT NULL,
                    `grace_out_minutes` int NOT NULL,
                    `status` varchar(20) NOT NULL,
                    `created_at` datetime(6) NOT NULL,
                    `updated_at` datetime(6) NOT NULL,
                    PRIMARY KEY (`id`)
                );
            ");

            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS `employee_shift_assignments` (
                    `id` char(36) NOT NULL,
                    `employee_id` char(36) NOT NULL,
                    `shift_id` char(36) NOT NULL,
                    `effective_from` datetime(6) NOT NULL,
                    `effective_to` datetime(6) NULL,
                    `status` varchar(20) NOT NULL,
                    `assigned_by` char(36) NULL,
                    `assigned_at` datetime(6) NOT NULL,
                    PRIMARY KEY (`id`),
                    CONSTRAINT `FK_employee_shift_assignments_work_shifts_shift_id` FOREIGN KEY (`shift_id`) REFERENCES `work_shifts` (`id`) ON DELETE RESTRICT
                );
            ");

            migrationBuilder.CreateIndexIfNotExists("IX_staff_attendance_employee_id_date", "staff_attendance", "`employee_id`, `date`", unique: true);
            migrationBuilder.CreateIndexIfNotExists("IX_staff_attendance_shift_id", "staff_attendance", "`shift_id`");
            migrationBuilder.CreateIndexIfNotExists("IX_employee_shift_assignments_assigned_by", "employee_shift_assignments", "`assigned_by`");
            migrationBuilder.CreateIndexIfNotExists("IX_employee_shift_assignments_employee_id", "employee_shift_assignments", "`employee_id`");
            migrationBuilder.CreateIndexIfNotExists("IX_employee_shift_assignments_shift_id", "employee_shift_assignments", "`shift_id`");
            migrationBuilder.CreateIndexIfNotExists("IX_work_shifts_branch_id", "work_shifts", "`branch_id`");
            migrationBuilder.CreateIndexIfNotExists("IX_work_shifts_department_id", "work_shifts", "`department_id`");

            // branches/departments/employees/users were all created in earlier migrations, so
            // their actual collation may not match whatever these new FK columns get from the
            // server's ambient default. See MigrationCollationHelper for why. staff_attendance's
            // employee_id/shift_id columns need the same treatment even though work_shifts is
            // brand new in this migration: they're added via AddColumn to a table that already
            // existed, so they inherit staff_attendance's own collation from whenever it was
            // originally created, not today's ambient default that work_shifts.id just got.
            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_staff_attendance_employees_employee_id",
                table: "staff_attendance",
                column: "employee_id",
                principalTable: "employees",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_staff_attendance_work_shifts_shift_id",
                table: "staff_attendance",
                column: "shift_id",
                principalTable: "work_shifts",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_work_shifts_branches_branch_id",
                table: "work_shifts",
                column: "branch_id",
                principalTable: "branches",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_work_shifts_departments_department_id",
                table: "work_shifts",
                column: "department_id",
                principalTable: "departments",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_employee_shift_assignments_employees_employee_id",
                table: "employee_shift_assignments",
                column: "employee_id",
                principalTable: "employees",
                principalColumn: "id",
                onDeleteSql: "RESTRICT");

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_employee_shift_assignments_users_assigned_by",
                table: "employee_shift_assignments",
                column: "assigned_by",
                principalTable: "users",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
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
