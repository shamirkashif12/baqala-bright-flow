using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class SplitZatcaIdentityFromSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "zatca_identity",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    csid = table.Column<string>(type: "longtext", nullable: true),
                    private_key = table.Column<string>(type: "longtext", nullable: true),
                    compliance_check_invoice_id = table.Column<string>(type: "longtext", nullable: true),
                    phase2_enabled = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    environment = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    csr = table.Column<string>(type: "longtext", nullable: true),
                    egs_serial = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    ccsid_request_id = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: true),
                    ccsid_binary_security_token = table.Column<string>(type: "longtext", nullable: true),
                    ccsid_secret = table.Column<string>(type: "longtext", nullable: true),
                    pcsid_request_id = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: true),
                    pcsid_binary_security_token = table.Column<string>(type: "longtext", nullable: true),
                    pcsid_secret = table.Column<string>(type: "longtext", nullable: true),
                    last_icv = table.Column<int>(type: "int", nullable: false),
                    last_invoice_hash = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false, defaultValue: "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ=="),
                    onboarding_status = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false, defaultValue: "not_started"),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_zatca_identity", x => x.id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.InsertData(
                table: "zatca_identity",
                columns: new[] { "id", "ccsid_binary_security_token", "ccsid_request_id", "ccsid_secret", "compliance_check_invoice_id", "created_at", "csid", "csr", "egs_serial", "environment", "last_icv", "last_invoice_hash", "onboarding_status", "pcsid_binary_security_token", "pcsid_request_id", "pcsid_secret", "phase2_enabled", "private_key", "updated_at" },
                values: new object[] { new Guid("00000000-0000-0000-0000-000000000001"), null, null, null, null, new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc), null, null, null, "sandbox", 0, "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==", "not_started", null, null, null, false, null, new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc) });

            // Backfill the shared identity from whichever existing branch row made the most
            // onboarding progress (production_ready > compliance_csid_obtained > csr_generated >
            // not_started; tie-break: highest last_icv, then earliest created_at). Phase2Enabled
            // becomes an OR across all branches — "any branch had it on" means the merged flag is on.
            // Runs BEFORE the DropColumn calls below, while zatca_settings still has this data.
            migrationBuilder.Sql(@"
                UPDATE zatca_identity i
                JOIN (
                    SELECT s.*,
                           CASE s.onboarding_status
                               WHEN 'production_ready' THEN 4
                               WHEN 'compliance_csid_obtained' THEN 3
                               WHEN 'csr_generated' THEN 2
                               ELSE 1
                           END AS progress_rank,
                           (SELECT MAX(phase2_enabled) FROM zatca_settings) AS any_enabled
                    FROM zatca_settings s
                    ORDER BY progress_rank DESC, s.last_icv DESC, s.created_at ASC
                    LIMIT 1
                ) best ON 1 = 1
                SET i.csr = best.csr, i.private_key = best.private_key, i.egs_serial = best.egs_serial,
                    i.csid = best.csid, i.ccsid_request_id = best.ccsid_request_id,
                    i.ccsid_binary_security_token = best.ccsid_binary_security_token,
                    i.ccsid_secret = best.ccsid_secret, i.pcsid_request_id = best.pcsid_request_id,
                    i.pcsid_binary_security_token = best.pcsid_binary_security_token,
                    i.pcsid_secret = best.pcsid_secret,
                    i.compliance_check_invoice_id = best.compliance_check_invoice_id,
                    i.onboarding_status = best.onboarding_status, i.environment = best.environment,
                    i.phase2_enabled = best.any_enabled, i.last_icv = best.last_icv,
                    i.last_invoice_hash = best.last_invoice_hash, i.updated_at = UTC_TIMESTAMP()
                WHERE i.id = '00000000-0000-0000-0000-000000000001';");

            migrationBuilder.DropColumn(
                name: "ccsid_binary_security_token",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "ccsid_request_id",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "ccsid_secret",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "compliance_check_invoice_id",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "csid",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "csr",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "egs_serial",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "environment",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "last_icv",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "last_invoice_hash",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "onboarding_status",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "pcsid_binary_security_token",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "pcsid_request_id",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "pcsid_secret",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "phase2_enabled",
                table: "zatca_settings");

            migrationBuilder.DropColumn(
                name: "private_key",
                table: "zatca_settings");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "zatca_identity");

            migrationBuilder.AddColumn<string>(
                name: "ccsid_binary_security_token",
                table: "zatca_settings",
                type: "longtext",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ccsid_request_id",
                table: "zatca_settings",
                type: "varchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ccsid_secret",
                table: "zatca_settings",
                type: "longtext",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "compliance_check_invoice_id",
                table: "zatca_settings",
                type: "longtext",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "csid",
                table: "zatca_settings",
                type: "longtext",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "csr",
                table: "zatca_settings",
                type: "longtext",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "egs_serial",
                table: "zatca_settings",
                type: "varchar(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "environment",
                table: "zatca_settings",
                type: "varchar(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "last_icv",
                table: "zatca_settings",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "last_invoice_hash",
                table: "zatca_settings",
                type: "varchar(255)",
                maxLength: 255,
                nullable: false,
                defaultValue: "NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==");

            migrationBuilder.AddColumn<string>(
                name: "onboarding_status",
                table: "zatca_settings",
                type: "varchar(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "not_started");

            migrationBuilder.AddColumn<string>(
                name: "pcsid_binary_security_token",
                table: "zatca_settings",
                type: "longtext",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "pcsid_request_id",
                table: "zatca_settings",
                type: "varchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "pcsid_secret",
                table: "zatca_settings",
                type: "longtext",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "phase2_enabled",
                table: "zatca_settings",
                type: "tinyint(1)",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "private_key",
                table: "zatca_settings",
                type: "longtext",
                nullable: true);
        }
    }
}
