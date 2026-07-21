using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class ExtendAuditLogForHrmReports : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "employee_id",
                table: "audit_logs",
                type: "char(36)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "module",
                table: "audit_logs",
                type: "varchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_audit_logs_employee_id",
                table: "audit_logs",
                column: "employee_id");

            // audit_logs.employee_id is added via AddColumn to a table that's existed since
            // InitialSchema, so it inherits audit_logs' own collation from back then, which may
            // not match employees.id's collation (employees is new, from AddHrmCoreTables, and
            // got whatever the server's ambient default was at that later point). See
            // MigrationCollationHelper for why.
            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_audit_logs_employees_employee_id",
                table: "audit_logs",
                column: "employee_id",
                principalTable: "employees",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_audit_logs_employees_employee_id",
                table: "audit_logs");

            migrationBuilder.DropIndex(
                name: "IX_audit_logs_employee_id",
                table: "audit_logs");

            migrationBuilder.DropColumn(
                name: "employee_id",
                table: "audit_logs");

            migrationBuilder.DropColumn(
                name: "module",
                table: "audit_logs");
        }
    }
}
