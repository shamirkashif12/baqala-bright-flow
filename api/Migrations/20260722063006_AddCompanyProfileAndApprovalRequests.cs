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
            // Guarded per this project's standard pattern (see MigrationCollationHelper /
            // MigrationIdempotencyHelper): the inline FKs below reference tables (branches, users)
            // created in earlier migrations, which hits the same incompatible-collation bug guarded
            // in AddOrderDiscounts/AddOrderServiceCharges/AddLoyaltyProgram — the FKs are created
            // separately below instead of inline in CreateTable.
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

            migrationBuilder.Sql(@"
                INSERT IGNORE INTO `company_profile` (`id`, `cr_number`, `created_at`, `legal_name`, `updated_at`, `updated_by`, `vat_number`)
                VALUES ('00000000-0000-0000-0000-000000000002', NULL, '2026-01-01 00:00:00', NULL, '2026-01-01 00:00:00', NULL, NULL);
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
