using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class InitialSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "branches",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    branch_code = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    name = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    name_ar = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    address = table.Column<string>(type: "longtext", nullable: true),
                    city = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: true),
                    contact_number = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: true),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_branches", x => x.id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "categories",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    name = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    name_ar = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    parent_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    description = table.Column<string>(type: "longtext", nullable: true),
                    image_url = table.Column<string>(type: "varchar(500)", maxLength: 500, nullable: true),
                    is_active = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    sort_order = table.Column<int>(type: "int", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_categories", x => x.id);
                    table.ForeignKey(
                        name: "FK_categories_categories_parent_id",
                        column: x => x.parent_id,
                        principalTable: "categories",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "expense_types",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    name = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    name_ar = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    description = table.Column<string>(type: "longtext", nullable: true),
                    is_active = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_expense_types", x => x.id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "roles",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    name = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: false),
                    name_ar = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: true),
                    description = table.Column<string>(type: "longtext", nullable: true),
                    is_system = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_roles", x => x.id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "suppliers",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    supplier_code = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    name = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    warehouse_name = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    contact_person = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    contact_number = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: true),
                    email = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    address = table.Column<string>(type: "longtext", nullable: true),
                    city = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: true),
                    supply_type = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    last_supply_date = table.Column<DateOnly>(type: "date", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_suppliers", x => x.id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "customers",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    customer_code = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    full_name = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    phone = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    email = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    loyalty_balance = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    total_spend = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    visit_count = table.Column<int>(type: "int", nullable: false),
                    tier = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    preferred_branch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_customers", x => x.id);
                    table.ForeignKey(
                        name: "FK_customers_branches_preferred_branch_id",
                        column: x => x.preferred_branch_id,
                        principalTable: "branches",
                        principalColumn: "id");
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "pos_settings",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    require_shift_open = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    require_opening_cash_count = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    allow_customer_view_paid_shifts = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    allow_negative_stock = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    require_reason_for_void = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    require_manager_approval_for_refund = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    auto_print_receipt = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    offline_mode_enabled = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_pos_settings", x => x.id);
                    table.ForeignKey(
                        name: "FK_pos_settings_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "zatca_settings",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    vat_registration_number = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: true),
                    seller_name = table.Column<string>(type: "varchar(500)", maxLength: 500, nullable: true),
                    csid = table.Column<string>(type: "longtext", nullable: true),
                    private_key = table.Column<string>(type: "longtext", nullable: true),
                    compliance_check_invoice_id = table.Column<string>(type: "longtext", nullable: true),
                    phase2_enabled = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    environment = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_zatca_settings", x => x.id);
                    table.ForeignKey(
                        name: "FK_zatca_settings_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "products",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    sku = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: false),
                    barcode = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: true),
                    name = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    name_ar = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    category_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    brand = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    description = table.Column<string>(type: "longtext", nullable: true),
                    unit_of_measure = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    weight_based = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    base_price = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    cost_price = table.Column<decimal>(type: "numeric(18,4)", nullable: true),
                    tax_percentage = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    custom_fee = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    image_url = table.Column<string>(type: "varchar(500)", maxLength: 500, nullable: true),
                    reorder_level = table.Column<int>(type: "int", nullable: false),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_products", x => x.id);
                    table.ForeignKey(
                        name: "FK_products_categories_category_id",
                        column: x => x.category_id,
                        principalTable: "categories",
                        principalColumn: "id");
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "role_permissions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    role_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    module = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: false),
                    can_view = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    can_create = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    can_edit = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    can_delete = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    can_approve = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    can_export = table.Column<bool>(type: "tinyint(1)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_role_permissions", x => x.id);
                    table.ForeignKey(
                        name: "FK_role_permissions_roles_role_id",
                        column: x => x.role_id,
                        principalTable: "roles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    email = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    username = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: false),
                    password_hash = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    pin_hash = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    full_name = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    full_name_ar = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    role_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    last_login = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_users", x => x.id);
                    table.ForeignKey(
                        name: "FK_users_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_users_roles_role_id",
                        column: x => x.role_id,
                        principalTable: "roles",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "inventory_batches",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    batch_number = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: false),
                    product_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    supplier_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    quantity = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    remaining_quantity = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    purchase_cost = table.Column<decimal>(type: "numeric(18,4)", nullable: true),
                    expiry_date = table.Column<DateOnly>(type: "date", nullable: true),
                    received_date = table.Column<DateOnly>(type: "date", nullable: false),
                    receiving_location = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    notes = table.Column<string>(type: "longtext", nullable: true),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_inventory_batches", x => x.id);
                    table.ForeignKey(
                        name: "FK_inventory_batches_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_inventory_batches_products_product_id",
                        column: x => x.product_id,
                        principalTable: "products",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_inventory_batches_suppliers_supplier_id",
                        column: x => x.supplier_id,
                        principalTable: "suppliers",
                        principalColumn: "id");
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "inventory_stock",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    product_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    quantity = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    reserved_quantity = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    reorder_level = table.Column<int>(type: "int", nullable: false),
                    last_updated = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_inventory_stock", x => x.id);
                    table.ForeignKey(
                        name: "FK_inventory_stock_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_inventory_stock_products_product_id",
                        column: x => x.product_id,
                        principalTable: "products",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "product_price_lists",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    product_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    price_type = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    price = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    effective_from = table.Column<DateOnly>(type: "date", nullable: false),
                    effective_to = table.Column<DateOnly>(type: "date", nullable: true),
                    is_active = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_product_price_lists", x => x.id);
                    table.ForeignKey(
                        name: "FK_product_price_lists_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_product_price_lists_products_product_id",
                        column: x => x.product_id,
                        principalTable: "products",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "audit_logs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    user_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    action = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    entity_type = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: true),
                    entity_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    old_values = table.Column<string>(type: "longtext", nullable: true),
                    new_values = table.Column<string>(type: "longtext", nullable: true),
                    ip_address = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: true),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_audit_logs", x => x.id);
                    table.ForeignKey(
                        name: "FK_audit_logs_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_audit_logs_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id");
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "coupons",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    code = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    name = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    name_ar = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    type = table.Column<string>(type: "varchar(25)", maxLength: 25, nullable: false),
                    value = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    min_order_amount = table.Column<decimal>(type: "numeric(18,4)", nullable: true),
                    max_discount_amount = table.Column<decimal>(type: "numeric(18,4)", nullable: true),
                    usage_limit = table.Column<int>(type: "int", nullable: true),
                    used_count = table.Column<int>(type: "int", nullable: false),
                    applicable_to = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    applicable_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    start_date = table.Column<DateOnly>(type: "date", nullable: false),
                    end_date = table.Column<DateOnly>(type: "date", nullable: false),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    created_by = table.Column<Guid>(type: "char(36)", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "char(36)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_coupons", x => x.id);
                    table.ForeignKey(
                        name: "FK_coupons_users_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "expenses",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    expense_type_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    amount = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    description = table.Column<string>(type: "longtext", nullable: true),
                    reference_number = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: true),
                    recorded_by = table.Column<Guid>(type: "char(36)", nullable: false),
                    expense_date = table.Column<DateOnly>(type: "date", nullable: false),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    approved_by = table.Column<Guid>(type: "char(36)", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_expenses", x => x.id);
                    table.ForeignKey(
                        name: "FK_expenses_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_expenses_expense_types_expense_type_id",
                        column: x => x.expense_type_id,
                        principalTable: "expense_types",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_expenses_users_approved_by",
                        column: x => x.approved_by,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_expenses_users_recorded_by",
                        column: x => x.recorded_by,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "rules_engine",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    rule_name = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    rule_type = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false),
                    applies_to = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false),
                    applies_to_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    rule_config = table.Column<string>(type: "longtext", nullable: false),
                    priority = table.Column<int>(type: "int", nullable: false),
                    is_active = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    created_by = table.Column<Guid>(type: "char(36)", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rules_engine", x => x.id);
                    table.ForeignKey(
                        name: "FK_rules_engine_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_rules_engine_users_created_by",
                        column: x => x.created_by,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "staff_attendance",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    user_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    check_in = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    check_out = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    notes = table.Column<string>(type: "longtext", nullable: true),
                    recorded_by = table.Column<Guid>(type: "char(36)", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_staff_attendance", x => x.id);
                    table.ForeignKey(
                        name: "FK_staff_attendance_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_staff_attendance_users_recorded_by",
                        column: x => x.recorded_by,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_staff_attendance_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "tax_fee_rules",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    rule_name = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    rule_type = table.Column<string>(type: "varchar(25)", maxLength: 25, nullable: false),
                    applicable_to = table.Column<string>(type: "varchar(25)", maxLength: 25, nullable: false),
                    applicable_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    vat_percentage = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    custom_fee_amount = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    excise_percentage = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    zatca_enabled = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    is_tobacco = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    effective_date = table.Column<DateOnly>(type: "date", nullable: false),
                    end_date = table.Column<DateOnly>(type: "date", nullable: true),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    created_by = table.Column<Guid>(type: "char(36)", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    CreatedByUserId = table.Column<Guid>(type: "char(36)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tax_fee_rules", x => x.id);
                    table.ForeignKey(
                        name: "FK_tax_fee_rules_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_tax_fee_rules_users_CreatedByUserId",
                        column: x => x.CreatedByUserId,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "terminals",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    terminal_code = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    name = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    assigned_cashier_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    last_sync = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    uptime_minutes = table.Column<int>(type: "int", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_terminals", x => x.id);
                    table.ForeignKey(
                        name: "FK_terminals_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_terminals_users_assigned_cashier_id",
                        column: x => x.assigned_cashier_id,
                        principalTable: "users",
                        principalColumn: "id");
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "warehouse_requests",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    request_number = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    source_branch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    destination_branch_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    supplier_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    requested_by = table.Column<Guid>(type: "char(36)", nullable: false),
                    approved_by = table.Column<Guid>(type: "char(36)", nullable: true),
                    approval_status = table.Column<string>(type: "varchar(25)", maxLength: 25, nullable: false),
                    delivery_status = table.Column<string>(type: "varchar(15)", maxLength: 15, nullable: false),
                    notes = table.Column<string>(type: "longtext", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_warehouse_requests", x => x.id);
                    table.ForeignKey(
                        name: "FK_warehouse_requests_branches_destination_branch_id",
                        column: x => x.destination_branch_id,
                        principalTable: "branches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_warehouse_requests_branches_source_branch_id",
                        column: x => x.source_branch_id,
                        principalTable: "branches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_warehouse_requests_suppliers_supplier_id",
                        column: x => x.supplier_id,
                        principalTable: "suppliers",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_warehouse_requests_users_approved_by",
                        column: x => x.approved_by,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_warehouse_requests_users_requested_by",
                        column: x => x.requested_by,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "inventory_adjustments",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    product_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    batch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    adjustment_type = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false),
                    quantity = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    reason = table.Column<string>(type: "varchar(500)", maxLength: 500, nullable: false),
                    notes = table.Column<string>(type: "longtext", nullable: true),
                    adjusted_by = table.Column<Guid>(type: "char(36)", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_inventory_adjustments", x => x.id);
                    table.ForeignKey(
                        name: "FK_inventory_adjustments_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_inventory_adjustments_inventory_batches_batch_id",
                        column: x => x.batch_id,
                        principalTable: "inventory_batches",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_inventory_adjustments_products_product_id",
                        column: x => x.product_id,
                        principalTable: "products",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_inventory_adjustments_users_adjusted_by",
                        column: x => x.adjusted_by,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "cashier_shifts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    cashier_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    terminal_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    opening_amount = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    closing_amount = table.Column<decimal>(type: "numeric(18,4)", nullable: true),
                    cash_sales = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    card_sales = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    digital_sales = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    total_sales = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    variance = table.Column<decimal>(type: "numeric(18,4)", nullable: true),
                    status = table.Column<string>(type: "varchar(10)", maxLength: 10, nullable: false),
                    opened_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    closed_at = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    notes = table.Column<string>(type: "longtext", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_cashier_shifts", x => x.id);
                    table.ForeignKey(
                        name: "FK_cashier_shifts_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_cashier_shifts_terminals_terminal_id",
                        column: x => x.terminal_id,
                        principalTable: "terminals",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_cashier_shifts_users_cashier_id",
                        column: x => x.cashier_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "devices",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    device_name = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    device_type = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false),
                    serial_number = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: true),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    terminal_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    sync_status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    behaviour_profile = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    last_activity = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_devices", x => x.id);
                    table.ForeignKey(
                        name: "FK_devices_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_devices_terminals_terminal_id",
                        column: x => x.terminal_id,
                        principalTable: "terminals",
                        principalColumn: "id");
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "warehouse_request_items",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    request_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    product_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    batch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    requested_quantity = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    approved_quantity = table.Column<decimal>(type: "numeric(18,4)", nullable: true),
                    available_stock = table.Column<decimal>(type: "numeric(18,4)", nullable: true),
                    expiry_date = table.Column<DateOnly>(type: "date", nullable: true),
                    notes = table.Column<string>(type: "longtext", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_warehouse_request_items", x => x.id);
                    table.ForeignKey(
                        name: "FK_warehouse_request_items_inventory_batches_batch_id",
                        column: x => x.batch_id,
                        principalTable: "inventory_batches",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_warehouse_request_items_products_product_id",
                        column: x => x.product_id,
                        principalTable: "products",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_warehouse_request_items_warehouse_requests_request_id",
                        column: x => x.request_id,
                        principalTable: "warehouse_requests",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "orders",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    order_number = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    source = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    customer_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    cashier_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    terminal_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    shift_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    coupon_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    subtotal = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    discount_amount = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    tax_amount = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    custom_fee_amount = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    total_amount = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    payment_status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    order_status = table.Column<string>(type: "varchar(25)", maxLength: 25, nullable: false),
                    notes = table.Column<string>(type: "longtext", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_orders", x => x.id);
                    table.ForeignKey(
                        name: "FK_orders_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_orders_cashier_shifts_shift_id",
                        column: x => x.shift_id,
                        principalTable: "cashier_shifts",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_orders_coupons_coupon_id",
                        column: x => x.coupon_id,
                        principalTable: "coupons",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_orders_customers_customer_id",
                        column: x => x.customer_id,
                        principalTable: "customers",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_orders_terminals_terminal_id",
                        column: x => x.terminal_id,
                        principalTable: "terminals",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_orders_users_cashier_id",
                        column: x => x.cashier_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "shift_cash_movements",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    shift_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    type = table.Column<string>(type: "varchar(10)", maxLength: 10, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    reason = table.Column<string>(type: "varchar(500)", maxLength: 500, nullable: false),
                    recorded_by = table.Column<Guid>(type: "char(36)", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_shift_cash_movements", x => x.id);
                    table.ForeignKey(
                        name: "FK_shift_cash_movements_cashier_shifts_shift_id",
                        column: x => x.shift_id,
                        principalTable: "cashier_shifts",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_shift_cash_movements_users_recorded_by",
                        column: x => x.recorded_by,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "customer_returns",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    return_number = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    order_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    customer_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    processed_by = table.Column<Guid>(type: "char(36)", nullable: true),
                    return_type = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    refund_method = table.Column<string>(type: "varchar(25)", maxLength: 25, nullable: false),
                    refund_amount = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    reason = table.Column<string>(type: "varchar(500)", maxLength: 500, nullable: false),
                    notes = table.Column<string>(type: "longtext", nullable: true),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    approved_by = table.Column<Guid>(type: "char(36)", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_customer_returns", x => x.id);
                    table.ForeignKey(
                        name: "FK_customer_returns_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_customer_returns_customers_customer_id",
                        column: x => x.customer_id,
                        principalTable: "customers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_customer_returns_orders_order_id",
                        column: x => x.order_id,
                        principalTable: "orders",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_customer_returns_users_approved_by",
                        column: x => x.approved_by,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_customer_returns_users_processed_by",
                        column: x => x.processed_by,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "loyalty_transactions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    customer_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    order_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    transaction_type = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    points = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    balance_after = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    description = table.Column<string>(type: "varchar(500)", maxLength: 500, nullable: true),
                    expiry_date = table.Column<DateOnly>(type: "date", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_loyalty_transactions", x => x.id);
                    table.ForeignKey(
                        name: "FK_loyalty_transactions_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_loyalty_transactions_customers_customer_id",
                        column: x => x.customer_id,
                        principalTable: "customers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_loyalty_transactions_orders_order_id",
                        column: x => x.order_id,
                        principalTable: "orders",
                        principalColumn: "id");
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "order_items",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    order_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    product_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    batch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    quantity = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    unit_price = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    discount_amount = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    tax_amount = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    custom_fee_amount = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    total_price = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_order_items", x => x.id);
                    table.ForeignKey(
                        name: "FK_order_items_inventory_batches_batch_id",
                        column: x => x.batch_id,
                        principalTable: "inventory_batches",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_order_items_orders_order_id",
                        column: x => x.order_id,
                        principalTable: "orders",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_order_items_products_product_id",
                        column: x => x.product_id,
                        principalTable: "products",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "order_payments",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    order_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    payment_method = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    amount = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    reference_number = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_order_payments", x => x.id);
                    table.ForeignKey(
                        name: "FK_order_payments_orders_order_id",
                        column: x => x.order_id,
                        principalTable: "orders",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "zatca_invoices",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    order_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    invoice_number = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: false),
                    invoice_type = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    issue_date = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    supply_date = table.Column<DateOnly>(type: "date", nullable: true),
                    total_amount = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    tax_amount = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    discount_amount = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    buyer_name = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    buyer_vat_number = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: true),
                    qr_code_value = table.Column<string>(type: "longtext", nullable: true),
                    xml_content = table.Column<string>(type: "longtext", nullable: true),
                    zatca_status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    zatca_response = table.Column<string>(type: "longtext", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_zatca_invoices", x => x.id);
                    table.ForeignKey(
                        name: "FK_zatca_invoices_branches_branch_id",
                        column: x => x.branch_id,
                        principalTable: "branches",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_zatca_invoices_orders_order_id",
                        column: x => x.order_id,
                        principalTable: "orders",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateTable(
                name: "customer_return_items",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    return_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    product_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    order_item_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    quantity = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    unit_price = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    refund_amount = table.Column<decimal>(type: "numeric(18,4)", nullable: false),
                    condition = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: true),
                    restock = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_customer_return_items", x => x.id);
                    table.ForeignKey(
                        name: "FK_customer_return_items_customer_returns_return_id",
                        column: x => x.return_id,
                        principalTable: "customer_returns",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_customer_return_items_products_product_id",
                        column: x => x.product_id,
                        principalTable: "products",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.InsertData(
                table: "roles",
                columns: new[] { "id", "created_at", "description", "is_system", "name", "name_ar", "updated_at" },
                values: new object[,]
                {
                    { new Guid("616e6574-746e-615f-646d-696e00000000"), new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "System role: Tenant Administrator", true, "Tenant Administrator", "مدير المستأجر", new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) },
                    { new Guid("616e6966-636e-5f65-7573-657200000000"), new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "System role: Finance User", true, "Finance User", "مستخدم المالية", new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) },
                    { new Guid("65707573-7672-7369-6f72-000000000000"), new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "System role: Supervisor", true, "Supervisor", "المشرف", new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) },
                    { new Guid("68736163-6569-0072-0000-000000000000"), new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "System role: Cashier", true, "Cashier", "أمين الصندوق", new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) },
                    { new Guid("6b636970-7265-0000-0000-000000000000"), new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "System role: Picker", true, "Picker", "المرتب", new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) },
                    { new Guid("6b72616d-7465-6e69-675f-757365720000"), new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "System role: Marketing User", true, "Marketing User", "مستخدم التسويق", new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) },
                    { new Guid("6e617262-6863-6d5f-616e-616765720000"), new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "System role: Branch Manager", true, "Branch Manager", "مدير الفرع", new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) },
                    { new Guid("726f7473-6b65-6565-7065-720000000000"), new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "System role: Storekeeper", true, "Storekeeper", "أمين المخزن", new DateTime(2025, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc) }
                });

            migrationBuilder.CreateIndex(
                name: "IX_audit_logs_branch_id",
                table: "audit_logs",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_audit_logs_user_id",
                table: "audit_logs",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "IX_branches_branch_code",
                table: "branches",
                column: "branch_code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_cashier_shifts_branch_id",
                table: "cashier_shifts",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_cashier_shifts_cashier_id",
                table: "cashier_shifts",
                column: "cashier_id");

            migrationBuilder.CreateIndex(
                name: "IX_cashier_shifts_terminal_id",
                table: "cashier_shifts",
                column: "terminal_id");

            migrationBuilder.CreateIndex(
                name: "IX_categories_parent_id",
                table: "categories",
                column: "parent_id");

            migrationBuilder.CreateIndex(
                name: "IX_coupons_code",
                table: "coupons",
                column: "code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_coupons_CreatedByUserId",
                table: "coupons",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_customer_return_items_product_id",
                table: "customer_return_items",
                column: "product_id");

            migrationBuilder.CreateIndex(
                name: "IX_customer_return_items_return_id",
                table: "customer_return_items",
                column: "return_id");

            migrationBuilder.CreateIndex(
                name: "IX_customer_returns_approved_by",
                table: "customer_returns",
                column: "approved_by");

            migrationBuilder.CreateIndex(
                name: "IX_customer_returns_branch_id",
                table: "customer_returns",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_customer_returns_customer_id",
                table: "customer_returns",
                column: "customer_id");

            migrationBuilder.CreateIndex(
                name: "IX_customer_returns_order_id",
                table: "customer_returns",
                column: "order_id");

            migrationBuilder.CreateIndex(
                name: "IX_customer_returns_processed_by",
                table: "customer_returns",
                column: "processed_by");

            migrationBuilder.CreateIndex(
                name: "IX_customers_customer_code",
                table: "customers",
                column: "customer_code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_customers_phone",
                table: "customers",
                column: "phone",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_customers_preferred_branch_id",
                table: "customers",
                column: "preferred_branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_devices_branch_id",
                table: "devices",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_devices_terminal_id",
                table: "devices",
                column: "terminal_id");

            migrationBuilder.CreateIndex(
                name: "IX_expenses_approved_by",
                table: "expenses",
                column: "approved_by");

            migrationBuilder.CreateIndex(
                name: "IX_expenses_branch_id",
                table: "expenses",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_expenses_expense_type_id",
                table: "expenses",
                column: "expense_type_id");

            migrationBuilder.CreateIndex(
                name: "IX_expenses_recorded_by",
                table: "expenses",
                column: "recorded_by");

            migrationBuilder.CreateIndex(
                name: "IX_inventory_adjustments_adjusted_by",
                table: "inventory_adjustments",
                column: "adjusted_by");

            migrationBuilder.CreateIndex(
                name: "IX_inventory_adjustments_batch_id",
                table: "inventory_adjustments",
                column: "batch_id");

            migrationBuilder.CreateIndex(
                name: "IX_inventory_adjustments_branch_id",
                table: "inventory_adjustments",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_inventory_adjustments_product_id",
                table: "inventory_adjustments",
                column: "product_id");

            migrationBuilder.CreateIndex(
                name: "IX_inventory_batches_branch_id",
                table: "inventory_batches",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_inventory_batches_product_id",
                table: "inventory_batches",
                column: "product_id");

            migrationBuilder.CreateIndex(
                name: "IX_inventory_batches_supplier_id",
                table: "inventory_batches",
                column: "supplier_id");

            migrationBuilder.CreateIndex(
                name: "IX_inventory_stock_branch_id",
                table: "inventory_stock",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_inventory_stock_product_id_branch_id",
                table: "inventory_stock",
                columns: new[] { "product_id", "branch_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_loyalty_transactions_branch_id",
                table: "loyalty_transactions",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_loyalty_transactions_customer_id",
                table: "loyalty_transactions",
                column: "customer_id");

            migrationBuilder.CreateIndex(
                name: "IX_loyalty_transactions_order_id",
                table: "loyalty_transactions",
                column: "order_id");

            migrationBuilder.CreateIndex(
                name: "IX_order_items_batch_id",
                table: "order_items",
                column: "batch_id");

            migrationBuilder.CreateIndex(
                name: "IX_order_items_order_id",
                table: "order_items",
                column: "order_id");

            migrationBuilder.CreateIndex(
                name: "IX_order_items_product_id",
                table: "order_items",
                column: "product_id");

            migrationBuilder.CreateIndex(
                name: "IX_order_payments_order_id",
                table: "order_payments",
                column: "order_id");

            migrationBuilder.CreateIndex(
                name: "IX_orders_branch_id",
                table: "orders",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_orders_cashier_id",
                table: "orders",
                column: "cashier_id");

            migrationBuilder.CreateIndex(
                name: "IX_orders_coupon_id",
                table: "orders",
                column: "coupon_id");

            migrationBuilder.CreateIndex(
                name: "IX_orders_customer_id",
                table: "orders",
                column: "customer_id");

            migrationBuilder.CreateIndex(
                name: "IX_orders_order_number",
                table: "orders",
                column: "order_number",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_orders_shift_id",
                table: "orders",
                column: "shift_id");

            migrationBuilder.CreateIndex(
                name: "IX_orders_terminal_id",
                table: "orders",
                column: "terminal_id");

            migrationBuilder.CreateIndex(
                name: "IX_pos_settings_branch_id",
                table: "pos_settings",
                column: "branch_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_product_price_lists_branch_id",
                table: "product_price_lists",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_product_price_lists_product_id",
                table: "product_price_lists",
                column: "product_id");

            migrationBuilder.CreateIndex(
                name: "IX_products_barcode",
                table: "products",
                column: "barcode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_products_category_id",
                table: "products",
                column: "category_id");

            migrationBuilder.CreateIndex(
                name: "IX_products_sku",
                table: "products",
                column: "sku",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_role_permissions_role_id",
                table: "role_permissions",
                column: "role_id");

            migrationBuilder.CreateIndex(
                name: "IX_rules_engine_branch_id",
                table: "rules_engine",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_rules_engine_created_by",
                table: "rules_engine",
                column: "created_by");

            migrationBuilder.CreateIndex(
                name: "IX_shift_cash_movements_recorded_by",
                table: "shift_cash_movements",
                column: "recorded_by");

            migrationBuilder.CreateIndex(
                name: "IX_shift_cash_movements_shift_id",
                table: "shift_cash_movements",
                column: "shift_id");

            migrationBuilder.CreateIndex(
                name: "IX_staff_attendance_branch_id",
                table: "staff_attendance",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_staff_attendance_recorded_by",
                table: "staff_attendance",
                column: "recorded_by");

            migrationBuilder.CreateIndex(
                name: "IX_staff_attendance_user_id",
                table: "staff_attendance",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "IX_suppliers_supplier_code",
                table: "suppliers",
                column: "supplier_code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_tax_fee_rules_branch_id",
                table: "tax_fee_rules",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_tax_fee_rules_CreatedByUserId",
                table: "tax_fee_rules",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_terminals_assigned_cashier_id",
                table: "terminals",
                column: "assigned_cashier_id");

            migrationBuilder.CreateIndex(
                name: "IX_terminals_branch_id",
                table: "terminals",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_terminals_terminal_code",
                table: "terminals",
                column: "terminal_code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_users_branch_id",
                table: "users",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_users_email",
                table: "users",
                column: "email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_users_role_id",
                table: "users",
                column: "role_id");

            migrationBuilder.CreateIndex(
                name: "IX_users_username",
                table: "users",
                column: "username",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_warehouse_request_items_batch_id",
                table: "warehouse_request_items",
                column: "batch_id");

            migrationBuilder.CreateIndex(
                name: "IX_warehouse_request_items_product_id",
                table: "warehouse_request_items",
                column: "product_id");

            migrationBuilder.CreateIndex(
                name: "IX_warehouse_request_items_request_id",
                table: "warehouse_request_items",
                column: "request_id");

            migrationBuilder.CreateIndex(
                name: "IX_warehouse_requests_approved_by",
                table: "warehouse_requests",
                column: "approved_by");

            migrationBuilder.CreateIndex(
                name: "IX_warehouse_requests_destination_branch_id",
                table: "warehouse_requests",
                column: "destination_branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_warehouse_requests_request_number",
                table: "warehouse_requests",
                column: "request_number",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_warehouse_requests_requested_by",
                table: "warehouse_requests",
                column: "requested_by");

            migrationBuilder.CreateIndex(
                name: "IX_warehouse_requests_source_branch_id",
                table: "warehouse_requests",
                column: "source_branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_warehouse_requests_supplier_id",
                table: "warehouse_requests",
                column: "supplier_id");

            migrationBuilder.CreateIndex(
                name: "IX_zatca_invoices_branch_id",
                table: "zatca_invoices",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_zatca_invoices_order_id",
                table: "zatca_invoices",
                column: "order_id");

            migrationBuilder.CreateIndex(
                name: "IX_zatca_settings_branch_id",
                table: "zatca_settings",
                column: "branch_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "audit_logs");

            migrationBuilder.DropTable(
                name: "customer_return_items");

            migrationBuilder.DropTable(
                name: "devices");

            migrationBuilder.DropTable(
                name: "expenses");

            migrationBuilder.DropTable(
                name: "inventory_adjustments");

            migrationBuilder.DropTable(
                name: "inventory_stock");

            migrationBuilder.DropTable(
                name: "loyalty_transactions");

            migrationBuilder.DropTable(
                name: "order_items");

            migrationBuilder.DropTable(
                name: "order_payments");

            migrationBuilder.DropTable(
                name: "pos_settings");

            migrationBuilder.DropTable(
                name: "product_price_lists");

            migrationBuilder.DropTable(
                name: "role_permissions");

            migrationBuilder.DropTable(
                name: "rules_engine");

            migrationBuilder.DropTable(
                name: "shift_cash_movements");

            migrationBuilder.DropTable(
                name: "staff_attendance");

            migrationBuilder.DropTable(
                name: "tax_fee_rules");

            migrationBuilder.DropTable(
                name: "warehouse_request_items");

            migrationBuilder.DropTable(
                name: "zatca_invoices");

            migrationBuilder.DropTable(
                name: "zatca_settings");

            migrationBuilder.DropTable(
                name: "customer_returns");

            migrationBuilder.DropTable(
                name: "expense_types");

            migrationBuilder.DropTable(
                name: "inventory_batches");

            migrationBuilder.DropTable(
                name: "warehouse_requests");

            migrationBuilder.DropTable(
                name: "orders");

            migrationBuilder.DropTable(
                name: "products");

            migrationBuilder.DropTable(
                name: "suppliers");

            migrationBuilder.DropTable(
                name: "cashier_shifts");

            migrationBuilder.DropTable(
                name: "coupons");

            migrationBuilder.DropTable(
                name: "customers");

            migrationBuilder.DropTable(
                name: "categories");

            migrationBuilder.DropTable(
                name: "terminals");

            migrationBuilder.DropTable(
                name: "users");

            migrationBuilder.DropTable(
                name: "branches");

            migrationBuilder.DropTable(
                name: "roles");
        }
    }
}
