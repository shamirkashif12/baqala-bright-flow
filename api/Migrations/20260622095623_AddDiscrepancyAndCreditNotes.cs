using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddDiscrepancyAndCreditNotes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "stock_discrepancies",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    po_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    transfer_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    supplier_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    product_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    expected_quantity = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    received_quantity = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    discrepancy_quantity = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    unit_cost = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    discrepancy_value = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    discrepancy_type = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    status = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false),
                    notes = table.Column<string>(type: "longtext", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_stock_discrepancies", x => x.id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "supplier_credit_notes",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    credit_note_number = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: true),
                    supplier_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    po_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    transfer_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    discrepancy_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    amount = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    credit_type = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    notes = table.Column<string>(type: "longtext", nullable: true),
                    issued_date = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_supplier_credit_notes", x => x.id);
                    table.ForeignKey(
                        name: "FK_supplier_credit_notes_stock_discrepancies_discrepancy_id",
                        column: x => x.discrepancy_id,
                        principalTable: "stock_discrepancies",
                        principalColumn: "id");
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_stock_discrepancies_po_id",
                table: "stock_discrepancies",
                column: "po_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_discrepancies_product_id",
                table: "stock_discrepancies",
                column: "product_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_discrepancies_supplier_id",
                table: "stock_discrepancies",
                column: "supplier_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_discrepancies_transfer_id",
                table: "stock_discrepancies",
                column: "transfer_id");

            migrationBuilder.CreateIndex(
                name: "IX_supplier_credit_notes_discrepancy_id",
                table: "supplier_credit_notes",
                column: "discrepancy_id");

            migrationBuilder.CreateIndex(
                name: "IX_supplier_credit_notes_po_id",
                table: "supplier_credit_notes",
                column: "po_id");

            migrationBuilder.CreateIndex(
                name: "IX_supplier_credit_notes_supplier_id",
                table: "supplier_credit_notes",
                column: "supplier_id");

            migrationBuilder.CreateIndex(
                name: "IX_supplier_credit_notes_transfer_id",
                table: "supplier_credit_notes",
                column: "transfer_id");

            // products/suppliers were created in InitialSchema, purchase_orders/stock_transfers
            // in AddSupplyChainModels — all earlier migrations. See MigrationCollationHelper.
            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_stock_discrepancies_products_product_id",
                table: "stock_discrepancies", column: "product_id",
                principalTable: "products", principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_stock_discrepancies_purchase_orders_po_id",
                table: "stock_discrepancies", column: "po_id",
                principalTable: "purchase_orders", principalColumn: "id",
                onDelete: ReferentialAction.Restrict, nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_stock_discrepancies_stock_transfers_transfer_id",
                table: "stock_discrepancies", column: "transfer_id",
                principalTable: "stock_transfers", principalColumn: "id",
                onDelete: ReferentialAction.Restrict, nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_stock_discrepancies_suppliers_supplier_id",
                table: "stock_discrepancies", column: "supplier_id",
                principalTable: "suppliers", principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_supplier_credit_notes_purchase_orders_po_id",
                table: "supplier_credit_notes", column: "po_id",
                principalTable: "purchase_orders", principalColumn: "id",
                onDelete: ReferentialAction.Restrict, nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_supplier_credit_notes_stock_transfers_transfer_id",
                table: "supplier_credit_notes", column: "transfer_id",
                principalTable: "stock_transfers", principalColumn: "id",
                onDelete: ReferentialAction.Restrict, nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_supplier_credit_notes_suppliers_supplier_id",
                table: "supplier_credit_notes", column: "supplier_id",
                principalTable: "suppliers", principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "supplier_credit_notes");

            migrationBuilder.DropTable(
                name: "stock_discrepancies");
        }
    }
}
