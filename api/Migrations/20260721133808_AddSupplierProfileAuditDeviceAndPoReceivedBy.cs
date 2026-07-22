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
            migrationBuilder.AddColumn<string>(
                name: "bank_account_holder",
                table: "suppliers",
                type: "varchar(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "bank_account_number",
                table: "suppliers",
                type: "varchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "bank_iban",
                table: "suppliers",
                type: "varchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "bank_name",
                table: "suppliers",
                type: "varchar(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "category",
                table: "suppliers",
                type: "varchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "cr_number",
                table: "suppliers",
                type: "varchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "credit_limit",
                table: "suppliers",
                type: "decimal(18,4)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "legal_name",
                table: "suppliers",
                type: "varchar(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "notes",
                table: "suppliers",
                type: "longtext",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "payment_terms",
                table: "suppliers",
                type: "varchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "vat_number",
                table: "suppliers",
                type: "varchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "received_by",
                table: "purchase_orders",
                type: "char(36)",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "terminal_id",
                table: "audit_logs",
                type: "char(36)",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "supplier_documents",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    supplier_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    document_type = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    file_name = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    file_url = table.Column<string>(type: "longtext", nullable: false),
                    issue_date = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    expiry_date = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    uploaded_by = table.Column<Guid>(type: "char(36)", nullable: true),
                    uploaded_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_supplier_documents", x => x.id);
                    table.ForeignKey(
                        name: "FK_supplier_documents_suppliers_supplier_id",
                        column: x => x.supplier_id,
                        principalTable: "suppliers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_supplier_documents_users_uploaded_by",
                        column: x => x.uploaded_by,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_purchase_orders_received_by",
                table: "purchase_orders",
                column: "received_by");

            migrationBuilder.CreateIndex(
                name: "IX_audit_logs_terminal_id",
                table: "audit_logs",
                column: "terminal_id");

            migrationBuilder.CreateIndex(
                name: "IX_supplier_documents_supplier_id",
                table: "supplier_documents",
                column: "supplier_id");

            migrationBuilder.CreateIndex(
                name: "IX_supplier_documents_uploaded_by",
                table: "supplier_documents",
                column: "uploaded_by");

            migrationBuilder.AddForeignKey(
                name: "FK_audit_logs_terminals_terminal_id",
                table: "audit_logs",
                column: "terminal_id",
                principalTable: "terminals",
                principalColumn: "id");

            migrationBuilder.AddForeignKey(
                name: "FK_purchase_orders_users_received_by",
                table: "purchase_orders",
                column: "received_by",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
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
