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
            // Guarded like AddOrderDiscounts/AddHrmShiftsAndAttendance: approval_requests' FKs
            // point at branches/users, both created in earlier migrations, so their collation may
            // not match today's ambient default — the same bug MigrationCollationHelper exists to
            // fix. This project's startup runner also executes each migration's SQL directly
            // without a wrapping transaction (see Program.cs), so every statement here is guarded
            // to stay safe against a partial-failure retry. See MigrationIdempotencyHelper.
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS `approval_requests` (
                    `id` char(36) NOT NULL,
                    `request_type` varchar(30) NOT NULL,
                    `entity_type` varchar(30) NOT NULL,
                    `entity_id` char(36) NULL,
                    `branch_id` char(36) NULL,
                    `requested_by` char(36) NOT NULL,
                    `requested_at` datetime(6) NOT NULL,
                    `status` varchar(20) NOT NULL,
                    `approved_by` char(36) NULL,
                    `approved_at` datetime(6) NULL,
                    `reason` varchar(500) NULL,
                    `rejection_reason` varchar(500) NULL,
                    `details_json` longtext NULL,
                    `created_at` datetime(6) NOT NULL,
                    PRIMARY KEY (`id`)
                );
            ");

            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS `company_profile` (
                    `id` char(36) NOT NULL,
                    `legal_name` varchar(500) NULL,
                    `cr_number` varchar(50) NULL,
                    `vat_number` varchar(20) NULL,
                    `updated_by` char(36) NULL,
                    `created_at` datetime(6) NOT NULL,
                    `updated_at` datetime(6) NOT NULL,
                    PRIMARY KEY (`id`)
                );
            ");

            // Fixed seed id, so a plain INSERT would fail on 'Duplicate entry' if a prior partial
            // run already got this far — IGNORE makes it a no-op instead.
            migrationBuilder.Sql(@"
                INSERT IGNORE INTO `company_profile`
                    (`id`, `legal_name`, `cr_number`, `vat_number`, `updated_by`, `created_at`, `updated_at`)
                VALUES
                    ('00000000-0000-0000-0000-000000000002', NULL, NULL, NULL, NULL, '2026-01-01 00:00:00.000000', '2026-01-01 00:00:00.000000');
            ");

            migrationBuilder.CreateIndexIfNotExists("IX_approval_requests_approved_by", "approval_requests", "`approved_by`");
            migrationBuilder.CreateIndexIfNotExists("IX_approval_requests_branch_id", "approval_requests", "`branch_id`");
            migrationBuilder.CreateIndexIfNotExists("IX_approval_requests_requested_by", "approval_requests", "`requested_by`");

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_approval_requests_branches_branch_id",
                table: "approval_requests",
                column: "branch_id",
                principalTable: "branches",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_approval_requests_users_approved_by",
                table: "approval_requests",
                column: "approved_by",
                principalTable: "users",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_approval_requests_users_requested_by",
                table: "approval_requests",
                column: "requested_by",
                principalTable: "users",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: false);
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
