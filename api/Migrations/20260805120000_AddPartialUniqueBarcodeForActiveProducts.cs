using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using BaqalaPOS.Api.Data;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <summary>
    /// Fixes barcode reuse on discontinued products, which has never actually worked:
    /// ProductsController's own duplicate-barcode check deliberately excludes status ==
    /// "discontinued" ("that barcode is free to reuse once its old product was soft-deleted"), but
    /// IX_products_barcode is a plain unique index across every product regardless of status — so
    /// the DB still rejected the insert as an unhandled DbUpdateException, surfaced to the caller as
    /// a generic 500 instead of the friendly Conflict the app-level check exists to produce for a
    /// *genuine* duplicate.
    ///
    /// Fix: replace the flat unique index with a MariaDB virtual generated column (barcode_active —
    /// NULL whenever the row is discontinued, the barcode otherwise) carrying the unique constraint
    /// instead. MySQL/MariaDB unique indexes treat NULL as distinct, so any number of discontinued
    /// products (or products with no barcode at all) can share a NULL barcode_active — uniqueness is
    /// enforced only among non-discontinued products, exactly what the application code already
    /// assumed. barcode_active is DB-only (no C# property, never queried directly); Create/Update
    /// still read/write the plain barcode column, which keeps its own — now non-unique — index for
    /// lookup performance (GetByBarcode, the duplicate checks).
    ///
    /// Hand-written, no Designer.cs, matching every migration on this table since AddProductPackFields:
    /// an EF scaffold would diff the whole model against whatever else is mid-flight. Uses the
    /// IfNotExists helpers for the usual no-transaction partial-failure reasons — see
    /// MigrationIdempotencyHelper.
    /// </summary>
    [DbContext(typeof(BaqalaDbContext))]
    [Migration("20260805120000_AddPartialUniqueBarcodeForActiveProducts")]
    public partial class AddPartialUniqueBarcodeForActiveProducts : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndexIfExists("products", "IX_products_barcode");
            migrationBuilder.CreateIndexIfNotExists("IX_products_barcode", "products", "`barcode`");

            // AddColumnIfNotExists's helper embeds this string inside its own single-quoted dynamic
            // SQL, so the literal below needs its quotes doubled ('' not ') — the usual MySQL
            // in-string escape — or the outer string closes early at the first ' in 'discontinued'
            // and the generated DDL fails with a syntax error right there.
            migrationBuilder.AddColumnIfNotExists(
                "products",
                "barcode_active",
                "VARCHAR(100) GENERATED ALWAYS AS (CASE WHEN `status` = ''discontinued'' THEN NULL ELSE `barcode` END) VIRTUAL");

            migrationBuilder.CreateIndexIfNotExists(
                "IX_products_barcode_active",
                "products",
                "`barcode_active`",
                unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndexIfExists("products", "IX_products_barcode_active");
            migrationBuilder.DropColumnIfExists("products", "barcode_active");
            migrationBuilder.DropIndexIfExists("products", "IX_products_barcode");
            migrationBuilder.CreateIndexIfNotExists("IX_products_barcode", "products", "`barcode`", unique: true);
        }
    }
}
