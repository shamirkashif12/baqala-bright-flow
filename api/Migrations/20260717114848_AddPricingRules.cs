using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <summary>
    /// FRD §12 (Pricing) + §13 (Lifecycle) — the schema behind branch-based, customer-tier,
    /// scheduled and pack pricing; FIFO costing; and product recall tracking.
    ///
    /// Every change is additive and nullable (or defaulted), so it applies to a live database
    /// without changing what a single existing row means:
    ///
    ///   product_price_lists — the table has existed since InitialSchema but nothing ever read or
    ///     wrote it. These columns turn it into the substrate IPriceResolutionService resolves
    ///     against. An empty table still resolves every product to Product.BasePrice, which is
    ///     exactly today's behaviour, so activating it changes no price anywhere.
    ///   order_items.cost_amount / batch_breakdown — actual FIFO/FEFO cost of the units sold,
    ///     captured at sale time. Null on every historic row; reports fall back to the existing
    ///     Product.CostPrice behaviour when null, so no report regresses.
    ///   product_recalls — net-new.
    ///
    /// Hand-corrected after scaffolding. EF diffed against a model snapshot that was stale in two
    /// ways and emitted three operations that do not belong to this migration:
    ///   1. DropColumn stock_transfers.received_by — the snapshot still carried that column, but
    ///      the tree has since backed the feature out (the model property, the
    ///      AddInventoryAuditColumns operations that created it, and the controller writes were all
    ///      removed together). No migration creates the column any more, so dropping it would fail
    ///      on a fresh database and destroy data on one migrated before the revert.
    ///   2. AddColumn stock_counts.count_type — already added by the hand-written
    ///      20260717130000_AddStockCountType, which is invisible to the snapshot (hand-written
    ///      migrations don't update it) and, being later-stamped, would have run second and hit a
    ///      duplicate-column error.
    ///   3. The index swap on product_price_lists was ordered drop-then-create. product_id carries
    ///      an FK to products and MySQL refuses to drop the last index backing an FK, so the new
    ///      composite must exist first. Reordered below; product_id is its leftmost prefix, which
    ///      is what lets the old single-column index go.
    /// </summary>
    public partial class AddPricingRules : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ─── product_price_lists: pricing rules (FRD §12) ─────────────────
            migrationBuilder.AddColumn<string>(
                name: "min_customer_tier",
                table: "product_price_lists",
                type: "varchar(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "unit_type",
                table: "product_price_lists",
                type: "varchar(10)",
                maxLength: 10,
                nullable: false,
                // "unit", not EF's scaffolded "": any pre-existing row is a plain unit price, and
                // "" is neither of the two values this column is documented to hold. (The resolver
                // treats anything != "pack" as a unit, so "" would behave correctly and read as a
                // bug to the next person who looks at the table.)
                defaultValue: "unit");

            migrationBuilder.AddColumn<decimal>(
                name: "pack_size",
                table: "product_price_lists",
                type: "decimal(18,4)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "pack_barcode",
                table: "product_price_lists",
                type: "varchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "label",
                table: "product_price_lists",
                type: "varchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "priority",
                table: "product_price_lists",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<Guid>(
                name: "created_by",
                table: "product_price_lists",
                type: "char(36)",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "updated_at",
                table: "product_price_lists",
                type: "datetime(6)",
                nullable: false,
                // EF scaffolded 0001-01-01, which is below MySQL's DATETIME floor of 1000-01-01 and
                // would be rejected (or silently coerced to a zero-date) for any existing row.
                defaultValueSql: "CURRENT_TIMESTAMP(6)");

            // Create the composite BEFORE dropping the single-column index it supersedes — see the
            // class comment: product_id's FK needs an index at all times, and this one covers it.
            migrationBuilder.CreateIndex(
                name: "IX_product_price_lists_product_id_price_type_is_active",
                table: "product_price_lists",
                columns: new[] { "product_id", "price_type", "is_active" });

            migrationBuilder.DropIndex(
                name: "IX_product_price_lists_product_id",
                table: "product_price_lists");

            // ─── order_items: FIFO costing (FRD §13) ──────────────────────────
            migrationBuilder.AddColumn<decimal>(
                name: "cost_amount",
                table: "order_items",
                type: "decimal(18,4)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "batch_breakdown",
                table: "order_items",
                type: "longtext",
                nullable: true);

            // ─── product_recalls: recall tracking (FRD §13) ───────────────────
            // FKs are added separately below rather than inline, because every principal table here
            // predates this migration — see MigrationCollationHelper and the AddStockMovements
            // precedent this follows.
            migrationBuilder.CreateTable(
                name: "product_recalls",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    recall_number = table.Column<string>(type: "varchar(50)", maxLength: 50, nullable: false),
                    product_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    batch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    branch_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    supplier_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    reason = table.Column<string>(type: "varchar(500)", maxLength: 500, nullable: false),
                    recall_type = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false),
                    severity = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    status = table.Column<string>(type: "varchar(20)", maxLength: 20, nullable: false),
                    quantity_quarantined = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    notes = table.Column<string>(type: "longtext", nullable: true),
                    initiated_by = table.Column<Guid>(type: "char(36)", nullable: true),
                    closed_by = table.Column<Guid>(type: "char(36)", nullable: true),
                    resolution = table.Column<string>(type: "varchar(500)", maxLength: 500, nullable: true),
                    closed_at = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    updated_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_product_recalls", x => x.id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_product_recalls_batch_id",
                table: "product_recalls",
                column: "batch_id");

            migrationBuilder.CreateIndex(
                name: "IX_product_recalls_branch_id",
                table: "product_recalls",
                column: "branch_id");

            migrationBuilder.CreateIndex(
                name: "IX_product_recalls_closed_by",
                table: "product_recalls",
                column: "closed_by");

            migrationBuilder.CreateIndex(
                name: "IX_product_recalls_initiated_by",
                table: "product_recalls",
                column: "initiated_by");

            // The POS sale guard runs this lookup for every line of every order.
            migrationBuilder.CreateIndex(
                name: "IX_product_recalls_product_id_status",
                table: "product_recalls",
                columns: new[] { "product_id", "status" });

            migrationBuilder.CreateIndex(
                name: "IX_product_recalls_supplier_id",
                table: "product_recalls",
                column: "supplier_id");

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_product_recalls_products_product_id",
                table: "product_recalls",
                column: "product_id",
                principalTable: "products",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_product_recalls_inventory_batches_batch_id",
                table: "product_recalls",
                column: "batch_id",
                principalTable: "inventory_batches",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict,
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_product_recalls_branches_branch_id",
                table: "product_recalls",
                column: "branch_id",
                principalTable: "branches",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict,
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_product_recalls_suppliers_supplier_id",
                table: "product_recalls",
                column: "supplier_id",
                principalTable: "suppliers",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict,
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_product_recalls_users_initiated_by",
                table: "product_recalls",
                column: "initiated_by",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict,
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_product_recalls_users_closed_by",
                table: "product_recalls",
                column: "closed_by",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "product_recalls");

            migrationBuilder.DropColumn(
                name: "batch_breakdown",
                table: "order_items");

            migrationBuilder.DropColumn(
                name: "cost_amount",
                table: "order_items");

            // Restore the single-column index before dropping the composite, for the same
            // FK-needs-an-index reason the Up path reorders.
            migrationBuilder.CreateIndex(
                name: "IX_product_price_lists_product_id",
                table: "product_price_lists",
                column: "product_id");

            migrationBuilder.DropIndex(
                name: "IX_product_price_lists_product_id_price_type_is_active",
                table: "product_price_lists");

            migrationBuilder.DropColumn(name: "updated_at", table: "product_price_lists");
            migrationBuilder.DropColumn(name: "created_by", table: "product_price_lists");
            migrationBuilder.DropColumn(name: "priority", table: "product_price_lists");
            migrationBuilder.DropColumn(name: "label", table: "product_price_lists");
            migrationBuilder.DropColumn(name: "pack_barcode", table: "product_price_lists");
            migrationBuilder.DropColumn(name: "pack_size", table: "product_price_lists");
            migrationBuilder.DropColumn(name: "unit_type", table: "product_price_lists");
            migrationBuilder.DropColumn(name: "min_customer_tier", table: "product_price_lists");
        }
    }
}
