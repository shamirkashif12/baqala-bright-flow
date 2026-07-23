using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSupplierProfileAuditDeviceAndPoReceivedBy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded per this project's standard pattern (see MigrationIdempotencyHelper): this
            // migration was already found partially applied (bank_account_holder present, the rest
            // missing) on a database that had its schema restored/copied independently of
            // __EFMigrationsHistory — a plain re-run blew up on "Duplicate column name
            // 'bank_account_holder'" before ever reaching the columns that were still missing.
            migrationBuilder.AddColumnIfNotExists("suppliers", "bank_account_holder", "varchar(255) NULL");
            migrationBuilder.AddColumnIfNotExists("suppliers", "bank_account_number", "varchar(100) NULL");
            migrationBuilder.AddColumnIfNotExists("suppliers", "bank_iban", "varchar(50) NULL");
            migrationBuilder.AddColumnIfNotExists("suppliers", "bank_name", "varchar(255) NULL");
            migrationBuilder.AddColumnIfNotExists("suppliers", "category", "varchar(100) NULL");
            migrationBuilder.AddColumnIfNotExists("suppliers", "cr_number", "varchar(50) NULL");
            migrationBuilder.AddColumnIfNotExists("suppliers", "credit_limit", "decimal(18,4) NULL");
            migrationBuilder.AddColumnIfNotExists("suppliers", "legal_name", "varchar(255) NULL");
            migrationBuilder.AddColumnIfNotExists("suppliers", "notes", "longtext NULL");
            migrationBuilder.AddColumnIfNotExists("suppliers", "payment_terms", "varchar(100) NULL");
            migrationBuilder.AddColumnIfNotExists("suppliers", "vat_number", "varchar(50) NULL");
            migrationBuilder.AddColumnIfNotExists("purchase_orders", "received_by", "char(36) NULL");
            migrationBuilder.AddColumnIfNotExists("audit_logs", "terminal_id", "char(36) NULL");

            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS `supplier_documents` (
                    `id` char(36) NOT NULL,
                    `supplier_id` char(36) NOT NULL,
                    `document_type` varchar(50) NOT NULL,
                    `file_name` varchar(255) NOT NULL,
                    `file_url` longtext NOT NULL,
                    `issue_date` datetime(6) NULL,
                    `expiry_date` datetime(6) NULL,
                    `uploaded_by` char(36) NULL,
                    `uploaded_at` datetime(6) NOT NULL,
                    PRIMARY KEY (`id`)
                );
            ");

            migrationBuilder.CreateIndexIfNotExists("IX_purchase_orders_received_by", "purchase_orders", "`received_by`");
            migrationBuilder.CreateIndexIfNotExists("IX_audit_logs_terminal_id", "audit_logs", "`terminal_id`");
            migrationBuilder.CreateIndexIfNotExists("IX_supplier_documents_supplier_id", "supplier_documents", "`supplier_id`");
            migrationBuilder.CreateIndexIfNotExists("IX_supplier_documents_uploaded_by", "supplier_documents", "`uploaded_by`");

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_audit_logs_terminals_terminal_id",
                table: "audit_logs",
                column: "terminal_id",
                principalTable: "terminals",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_purchase_orders_users_received_by",
                table: "purchase_orders",
                column: "received_by",
                principalTable: "users",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_supplier_documents_suppliers_supplier_id",
                table: "supplier_documents",
                column: "supplier_id",
                principalTable: "suppliers",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: false);

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_supplier_documents_users_uploaded_by",
                table: "supplier_documents",
                column: "uploaded_by",
                principalTable: "users",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_audit_logs_terminals_terminal_id",
                table: "audit_logs");

            migrationBuilder.DropForeignKey(
                name: "FK_purchase_orders_users_received_by",
                table: "purchase_orders");

            migrationBuilder.DropTable(
                name: "supplier_documents");

            migrationBuilder.DropIndex(
                name: "IX_purchase_orders_received_by",
                table: "purchase_orders");

            migrationBuilder.DropIndex(
                name: "IX_audit_logs_terminal_id",
                table: "audit_logs");

            migrationBuilder.DropColumn(
                name: "bank_account_holder",
                table: "suppliers");

            migrationBuilder.DropColumn(
                name: "bank_account_number",
                table: "suppliers");

            migrationBuilder.DropColumn(
                name: "bank_iban",
                table: "suppliers");

            migrationBuilder.DropColumn(
                name: "bank_name",
                table: "suppliers");

            migrationBuilder.DropColumn(
                name: "category",
                table: "suppliers");

            migrationBuilder.DropColumn(
                name: "cr_number",
                table: "suppliers");

            migrationBuilder.DropColumn(
                name: "credit_limit",
                table: "suppliers");

            migrationBuilder.DropColumn(
                name: "legal_name",
                table: "suppliers");

            migrationBuilder.DropColumn(
                name: "notes",
                table: "suppliers");

            migrationBuilder.DropColumn(
                name: "payment_terms",
                table: "suppliers");

            migrationBuilder.DropColumn(
                name: "vat_number",
                table: "suppliers");

            migrationBuilder.DropColumn(
                name: "received_by",
                table: "purchase_orders");

            migrationBuilder.DropColumn(
                name: "terminal_id",
                table: "audit_logs");
        }
    }
}
