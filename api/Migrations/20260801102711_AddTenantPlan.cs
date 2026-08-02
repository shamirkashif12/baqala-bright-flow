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
            // Plain CreateTable/InsertData here would blow up with "Table already exists" /
            // "Duplicate entry" if a prior deploy attempt got partway through this migration and
            // then failed on some later statement — the startup migration runner (see Program.cs)
            // has no transaction, so whatever already landed stays committed and gets replayed on
            // every restart until the DB matches what this migration expects. Raw idempotent SQL
            // (same pattern as MigrationIdempotencyHelper) makes this safe to rerun from any
            // partial state, not just a pristine one.
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS `tenant_plan` (
                    `id` char(36) NOT NULL,
                    `tenant_id` varchar(100) DEFAULT NULL,
                    `plan_id` varchar(100) DEFAULT NULL,
                    `plan_name` varchar(100) DEFAULT NULL,
                    `ecr_type` varchar(50) NOT NULL,
                    `max_branches` int DEFAULT NULL,
                    `max_terminals_per_branch` int DEFAULT NULL,
                    `max_users_per_branch` int DEFAULT NULL,
                    `features_json` longtext NOT NULL,
                    `billing_status` varchar(50) NOT NULL,
                    `renews_at` datetime(6) DEFAULT NULL,
                    `provisioned_at` datetime(6) DEFAULT NULL,
                    `created_at` datetime(6) NOT NULL,
                    `updated_at` datetime(6) NOT NULL,
                    PRIMARY KEY (`id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

                INSERT IGNORE INTO `tenant_plan`
                    (`id`, `billing_status`, `created_at`, `ecr_type`, `features_json`, `max_branches`, `max_terminals_per_branch`, `max_users_per_branch`, `plan_id`, `plan_name`, `provisioned_at`, `renews_at`, `tenant_id`, `updated_at`)
                VALUES
                    ('00000000-0000-0000-0000-000000000003', 'active', '2026-01-01 00:00:00.000000', 'mart', '', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-01-01 00:00:00.000000');
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "tenant_plan");
        }
    }
}
