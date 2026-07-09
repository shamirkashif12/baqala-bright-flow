using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddSupplyChainModels : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "product_variants",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    product_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    variant_type = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false),
                    variant_value = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: false),
                    sku_suffix = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: true),
                    barcode = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: true),
                    price_modifier = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_product_variants", x => x.id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "warehouses",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    code = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    name = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    name_ar = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    address = table.Column<string>(type: "varchar(500)", maxLength: 500, nullable: true),
                    city = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: true),
                    capacity = table.Column<decimal>(type: "decimal(18,4)", nullable: true),
                    contact_person = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: true),
                    contact_number = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: true),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_warehouses", x => x.id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "branch_warehouses",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    warehouse_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    is_primary = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_branch_warehouses", x => x.id);
                    table.ForeignKey(
                        name: "FK_branch_warehouses_warehouses_warehouse_id",
                        column: x => x.warehouse_id,
                        principalTable: "warehouses",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "purchase_orders",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    po_number = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    supplier_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    warehouse_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    ordered_by = table.Column<Guid>(type: "char(36)", nullable: false),
                    approved_by = table.Column<Guid>(type: "char(36)", nullable: true),
                    status = table.Column<string>(type: "varchar(25)", maxLength: 25, nullable: false),
                    payment_status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    payment_terms = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: true),
                    total_amount = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    paid_amount = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    tax_amount = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    discount_amount = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    expected_delivery_date = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    received_date = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    notes = table.Column<string>(type: "longtext", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_purchase_orders", x => x.id);
                    table.ForeignKey(
                        name: "FK_purchase_orders_warehouses_warehouse_id",
                        column: x => x.warehouse_id,
                        principalTable: "warehouses",
                        principalColumn: "id");
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "warehouse_stock",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    warehouse_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    product_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    quantity = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    reserved_quantity = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    reorder_level = table.Column<int>(type: "int", nullable: false),
                    last_updated = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_warehouse_stock", x => x.id);
                    table.ForeignKey(
                        name: "FK_warehouse_stock_warehouses_warehouse_id",
                        column: x => x.warehouse_id,
                        principalTable: "warehouses",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "warehouse_suppliers",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    warehouse_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    supplier_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    is_primary = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    notes = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_warehouse_suppliers", x => x.id);
                    table.ForeignKey(
                        name: "FK_warehouse_suppliers_warehouses_warehouse_id",
                        column: x => x.warehouse_id,
                        principalTable: "warehouses",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "purchase_order_items",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    po_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    product_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    ordered_quantity = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    received_quantity = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    unit_cost = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    subtotal = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    expiry_date = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    notes = table.Column<string>(type: "longtext", nullable: true),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    PurchaseOrderId = table.Column<Guid>(type: "char(36)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_purchase_order_items", x => x.id);
                    table.ForeignKey(
                        name: "FK_purchase_order_items_purchase_orders_PurchaseOrderId",
                        column: x => x.PurchaseOrderId,
                        principalTable: "purchase_orders",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "stock_transfers",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    transfer_number = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    transfer_type = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false),
                    source_branch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    source_warehouse_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    source_supplier_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    dest_branch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    dest_warehouse_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    dest_supplier_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    purchase_order_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    created_by = table.Column<Guid>(type: "char(36)", nullable: false),
                    approved_by = table.Column<Guid>(type: "char(36)", nullable: true),
                    status = table.Column<string>(type: "varchar(25)", maxLength: 25, nullable: false),
                    return_reason = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: true),
                    notes = table.Column<string>(type: "longtext", nullable: true),
                    expected_date = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    completed_date = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_stock_transfers", x => x.id);
                    table.ForeignKey(
                        name: "FK_stock_transfers_purchase_orders_purchase_order_id",
                        column: x => x.purchase_order_id,
                        principalTable: "purchase_orders",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_stock_transfers_warehouses_dest_warehouse_id",
                        column: x => x.dest_warehouse_id,
                        principalTable: "warehouses",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_stock_transfers_warehouses_source_warehouse_id",
                        column: x => x.source_warehouse_id,
                        principalTable: "warehouses",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "supplier_payments",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    po_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    supplier_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    amount = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    payment_date = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    payment_method = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    reference_number = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: true),
                    notes = table.Column<string>(type: "longtext", nullable: true),
                    recorded_by = table.Column<Guid>(type: "char(36)", nullable: false),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    PurchaseOrderId = table.Column<Guid>(type: "char(36)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_supplier_payments", x => x.id);
                    table.ForeignKey(
                        name: "FK_supplier_payments_purchase_orders_PurchaseOrderId",
                        column: x => x.PurchaseOrderId,
                        principalTable: "purchase_orders",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "stock_transfer_items",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    transfer_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    product_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    batch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    requested_quantity = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    approved_quantity = table.Column<decimal>(type: "decimal(18,4)", nullable: true),
                    received_quantity = table.Column<decimal>(type: "decimal(18,4)", nullable: true),
                    unit_cost = table.Column<decimal>(type: "decimal(18,4)", nullable: true),
                    expiry_date = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    return_reason = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: true),
                    notes = table.Column<string>(type: "longtext", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_stock_transfer_items", x => x.id);
                    table.ForeignKey(
                        name: "FK_stock_transfer_items_stock_transfers_transfer_id",
                        column: x => x.transfer_id,
                        principalTable: "stock_transfers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_branch_warehouses_branch_id",
                table: "branch_warehouses",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_branch_warehouses_warehouse_id",
                table: "branch_warehouses",
                column: "warehouse_id");

            migrationBuilder.CreateIndex(
                name: "IX_product_variants_product_id",
                table: "product_variants",
                column: "product_id");

            migrationBuilder.CreateIndex(
                name: "IX_purchase_order_items_product_id",
                table: "purchase_order_items",
                column: "product_id");

            migrationBuilder.CreateIndex(
                name: "IX_purchase_order_items_PurchaseOrderId",
                table: "purchase_order_items",
                column: "PurchaseOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_purchase_orders_approved_by",
                table: "purchase_orders",
                column: "approved_by");

            migrationBuilder.CreateIndex(
                name: "IX_purchase_orders_branch_id",
                table: "purchase_orders",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_purchase_orders_ordered_by",
                table: "purchase_orders",
                column: "ordered_by");

            migrationBuilder.CreateIndex(
                name: "IX_purchase_orders_po_number",
                table: "purchase_orders",
                column: "po_number",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_purchase_orders_supplier_id",
                table: "purchase_orders",
                column: "supplier_id");

            migrationBuilder.CreateIndex(
                name: "IX_purchase_orders_warehouse_id",
                table: "purchase_orders",
                column: "warehouse_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_transfer_items_batch_id",
                table: "stock_transfer_items",
                column: "batch_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_transfer_items_product_id",
                table: "stock_transfer_items",
                column: "product_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_transfer_items_transfer_id",
                table: "stock_transfer_items",
                column: "transfer_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_transfers_approved_by",
                table: "stock_transfers",
                column: "approved_by");

            migrationBuilder.CreateIndex(
                name: "IX_stock_transfers_created_by",
                table: "stock_transfers",
                column: "created_by");

            migrationBuilder.CreateIndex(
                name: "IX_stock_transfers_dest_branch_id",
                table: "stock_transfers",
                column: "dest_branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_transfers_dest_supplier_id",
                table: "stock_transfers",
                column: "dest_supplier_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_transfers_dest_warehouse_id",
                table: "stock_transfers",
                column: "dest_warehouse_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_transfers_purchase_order_id",
                table: "stock_transfers",
                column: "purchase_order_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_transfers_source_branch_id",
                table: "stock_transfers",
                column: "source_branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_transfers_source_supplier_id",
                table: "stock_transfers",
                column: "source_supplier_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_transfers_source_warehouse_id",
                table: "stock_transfers",
                column: "source_warehouse_id");

            migrationBuilder.CreateIndex(
                name: "IX_stock_transfers_transfer_number",
                table: "stock_transfers",
                column: "transfer_number",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_supplier_payments_PurchaseOrderId",
                table: "supplier_payments",
                column: "PurchaseOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_supplier_payments_recorded_by",
                table: "supplier_payments",
                column: "recorded_by");

            migrationBuilder.CreateIndex(
                name: "IX_supplier_payments_supplier_id",
                table: "supplier_payments",
                column: "supplier_id");

            migrationBuilder.CreateIndex(
                name: "IX_warehouse_stock_product_id",
                table: "warehouse_stock",
                column: "product_id");

            migrationBuilder.CreateIndex(
                name: "IX_warehouse_stock_warehouse_id_product_id",
                table: "warehouse_stock",
                columns: new[] { "warehouse_id", "product_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_warehouse_suppliers_supplier_id",
                table: "warehouse_suppliers",
                column: "supplier_id");

            migrationBuilder.CreateIndex(
                name: "IX_warehouse_suppliers_warehouse_id",
                table: "warehouse_suppliers",
                column: "warehouse_id");

            migrationBuilder.CreateIndex(
                name: "IX_warehouses_code",
                table: "warehouses",
                column: "code",
                unique: true);

            // branches/suppliers/users/products/inventory_batches were created in InitialSchema
            // — their actual collation may not match whatever these new columns got from the
            // server's ambient default. See MigrationCollationHelper. FKs to warehouses/
            // purchase_orders/stock_transfers (created earlier in this same migration) stay
            // inline above since both sides always share the same ambient default.
            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_product_variants_products_product_id",
                table: "product_variants", column: "product_id",
                principalTable: "products", principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_branch_warehouses_branches_branch_id",
                table: "branch_warehouses", column: "branch_id",
                principalTable: "branches", principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_purchase_orders_branches_branch_id",
                table: "purchase_orders", column: "branch_id",
                principalTable: "branches", principalColumn: "id",
                onDelete: ReferentialAction.Restrict, nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_purchase_orders_suppliers_supplier_id",
                table: "purchase_orders", column: "supplier_id",
                principalTable: "suppliers", principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_purchase_orders_users_approved_by",
                table: "purchase_orders", column: "approved_by",
                principalTable: "users", principalColumn: "id",
                onDelete: ReferentialAction.Restrict, nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_purchase_orders_users_ordered_by",
                table: "purchase_orders", column: "ordered_by",
                principalTable: "users", principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_warehouse_stock_products_product_id",
                table: "warehouse_stock", column: "product_id",
                principalTable: "products", principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_warehouse_suppliers_suppliers_supplier_id",
                table: "warehouse_suppliers", column: "supplier_id",
                principalTable: "suppliers", principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_purchase_order_items_products_product_id",
                table: "purchase_order_items", column: "product_id",
                principalTable: "products", principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_stock_transfers_branches_dest_branch_id",
                table: "stock_transfers", column: "dest_branch_id",
                principalTable: "branches", principalColumn: "id",
                onDelete: ReferentialAction.Restrict, nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_stock_transfers_branches_source_branch_id",
                table: "stock_transfers", column: "source_branch_id",
                principalTable: "branches", principalColumn: "id",
                onDelete: ReferentialAction.Restrict, nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_stock_transfers_suppliers_dest_supplier_id",
                table: "stock_transfers", column: "dest_supplier_id",
                principalTable: "suppliers", principalColumn: "id",
                onDelete: ReferentialAction.Restrict, nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_stock_transfers_suppliers_source_supplier_id",
                table: "stock_transfers", column: "source_supplier_id",
                principalTable: "suppliers", principalColumn: "id",
                onDelete: ReferentialAction.Restrict, nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_stock_transfers_users_approved_by",
                table: "stock_transfers", column: "approved_by",
                principalTable: "users", principalColumn: "id",
                onDelete: ReferentialAction.Restrict, nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_stock_transfers_users_created_by",
                table: "stock_transfers", column: "created_by",
                principalTable: "users", principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_supplier_payments_suppliers_supplier_id",
                table: "supplier_payments", column: "supplier_id",
                principalTable: "suppliers", principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_supplier_payments_users_recorded_by",
                table: "supplier_payments", column: "recorded_by",
                principalTable: "users", principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_stock_transfer_items_inventory_batches_batch_id",
                table: "stock_transfer_items", column: "batch_id",
                principalTable: "inventory_batches", principalColumn: "id",
                onDelete: ReferentialAction.Restrict, nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_stock_transfer_items_products_product_id",
                table: "stock_transfer_items", column: "product_id",
                principalTable: "products", principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "branch_warehouses");

            migrationBuilder.DropTable(
                name: "product_variants");

            migrationBuilder.DropTable(
                name: "purchase_order_items");

            migrationBuilder.DropTable(
                name: "stock_transfer_items");

            migrationBuilder.DropTable(
                name: "supplier_payments");

            migrationBuilder.DropTable(
                name: "warehouse_stock");

            migrationBuilder.DropTable(
                name: "warehouse_suppliers");

            migrationBuilder.DropTable(
                name: "stock_transfers");

            migrationBuilder.DropTable(
                name: "purchase_orders");

            migrationBuilder.DropTable(
                name: "warehouses");
        }
    }
}
