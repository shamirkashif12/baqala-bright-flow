using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using BaqalaPOS.Api.Data;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <summary>
    /// Three related additions, all on the product catalogue:
    ///
    /// 1. products.estimated_unit_weight — average weight/volume of one physical item, letting a
    ///    weighed product also be rung up by the piece ("3 tomatoes" → 0.36 kg) without a second SKU.
    /// 2. product_substitutes — explicit interchangeable-product pairs, so an out-of-stock item can
    ///    be offered in another brand at the till.
    /// 3. A data backfill reconciling unit_of_measure with weight_based. unit_of_measure has been a
    ///    free-text column since InitialSchema that nothing validated and nothing read for
    ///    behaviour, while the separate weight_based bool did all the real work (hardcoded to mean
    ///    kilograms). UnitOfMeasureCatalog now makes the unit authoritative, so the stored strings
    ///    have to be canonicalised first — otherwise a row reading "kg" or "Kg " would resolve to
    ///    the "piece" fallback and start rejecting the fractional quantities it has always accepted.
    ///
    /// Hand-written, no Designer.cs, matching AddProductPackFields / AddProductLooseUnitLink on this
    /// same table: an EF scaffold would diff the whole model against whatever else is mid-flight.
    /// Uses the IfNotExists/collation-matched helpers for the usual no-transaction partial-failure
    /// and ambient-collation-drift reasons — see MigrationIdempotencyHelper / MigrationCollationHelper.
    /// The new table's FK columns are added bare and constrained afterwards via the collation-matched
    /// helper rather than inline in CreateTable, because a fresh table inherits the server's ambient
    /// collation, which is not necessarily the one products.id was created with.
    /// </summary>
    [DbContext(typeof(BaqalaDbContext))]
    [Migration("20260804120000_AddUnitOfMeasureSubstitutesAndEstimatedWeight")]
    public partial class AddUnitOfMeasureSubstitutesAndEstimatedWeight : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ── 1. Estimated unit weight ──────────────────────────────────────────────
            // decimal(18,4) matches the blanket precision BaqalaDbContext applies to every decimal.
            migrationBuilder.AddColumnIfNotExists("products", "estimated_unit_weight", "decimal(18,4) NULL");

            // ── 2. Substitute pairs ───────────────────────────────────────────────────
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS `product_substitutes` (
                    `id` char(36) NOT NULL,
                    `product_id` char(36) NOT NULL,
                    `substitute_product_id` char(36) NOT NULL,
                    `created_by` char(36) NULL,
                    `created_at` datetime(6) NOT NULL,
                    PRIMARY KEY (`id`)
                );
            ");

            migrationBuilder.CreateIndexIfNotExists(
                "IX_product_substitutes_product_id_substitute_product_id",
                "product_substitutes",
                "`product_id`, `substitute_product_id`",
                unique: true);

            migrationBuilder.CreateIndexIfNotExists(
                "IX_product_substitutes_substitute_product_id",
                "product_substitutes",
                "`substitute_product_id`");

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_product_substitutes_products_product_id",
                table: "product_substitutes",
                column: "product_id",
                principalTable: "products",
                principalColumn: "id",
                onDeleteSql: "CASCADE",
                nullable: false);

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_product_substitutes_products_substitute_product_id",
                table: "product_substitutes",
                column: "substitute_product_id",
                principalTable: "products",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: false);

            // ── 3. Canonicalise unit_of_measure, then re-derive weight_based from it ───
            // Order matters. Aliases are folded first so the "is this a known unit" sweep below
            // doesn't wrongly demote "kg" to "piece"; only then is weight_based recomputed.
            migrationBuilder.Sql(@"
                UPDATE `products` SET `unit_of_measure` = CASE LOWER(TRIM(`unit_of_measure`))
                    WHEN 'kg' THEN 'kilogram'
                    WHEN 'kgs' THEN 'kilogram'
                    WHEN 'kilo' THEN 'kilogram'
                    WHEN 'kilogramme' THEN 'kilogram'
                    WHEN 'g' THEN 'gram'
                    WHEN 'gm' THEN 'gram'
                    WHEN 'gms' THEN 'gram'
                    WHEN 'gramme' THEN 'gram'
                    WHEN 'l' THEN 'liter'
                    WHEN 'ltr' THEN 'liter'
                    WHEN 'litre' THEN 'liter'
                    WHEN 'ml' THEN 'milliliter'
                    WHEN 'millilitre' THEN 'milliliter'
                    WHEN 'm' THEN 'meter'
                    WHEN 'metre' THEN 'meter'
                    WHEN 'pc' THEN 'piece'
                    WHEN 'pcs' THEN 'piece'
                    WHEN 'each' THEN 'piece'
                    WHEN 'unit' THEN 'piece'
                    WHEN 'units' THEN 'piece'
                    WHEN 'item' THEN 'piece'
                    WHEN 'doz' THEN 'dozen'
                    WHEN 'dz' THEN 'dozen'
                    WHEN 'carton' THEN 'box'
                    WHEN 'case' THEN 'box'
                    ELSE LOWER(TRIM(`unit_of_measure`))
                END;
            ");

            // A legacy weighed product whose unit string was never set (left at the 'piece'
            // default, which was every such product before the Add/Edit form exposed a unit
            // picker) becomes an explicit kilogram product — the meaning weight_based always had.
            migrationBuilder.Sql(@"
                UPDATE `products`
                SET `unit_of_measure` = 'kilogram'
                WHERE `weight_based` = 1
                  AND `unit_of_measure` NOT IN ('kilogram','gram','liter','milliliter','meter');
            ");

            // Anything still unrecognised (free text typed before validation existed) falls back to
            // the same default the catalogue resolves it to at runtime, so stored data and
            // behaviour agree rather than silently diverging.
            migrationBuilder.Sql(@"
                UPDATE `products`
                SET `unit_of_measure` = 'piece'
                WHERE `unit_of_measure` NOT IN
                    ('piece','dozen','box','kilogram','gram','liter','milliliter','meter');
            ");

            // weight_based is now an output of the unit, not an independent input.
            migrationBuilder.Sql(@"
                UPDATE `products`
                SET `weight_based` = CASE
                    WHEN `unit_of_measure` IN ('kilogram','gram','liter','milliliter','meter') THEN 1
                    ELSE 0
                END;
            ");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // The unit_of_measure canonicalisation is deliberately not reversed: the pre-migration
            // values were unvalidated free text with no single mapping back ('kilogram' could have
            // been 'kg', 'Kg' or 'kilo'), and the reconciled data is correct under the old schema
            // too — weight_based still means what it always meant.
            migrationBuilder.DropForeignKeyIfExists("product_substitutes", "FK_product_substitutes_products_substitute_product_id");
            migrationBuilder.DropForeignKeyIfExists("product_substitutes", "FK_product_substitutes_products_product_id");
            migrationBuilder.Sql("DROP TABLE IF EXISTS `product_substitutes`;");
            migrationBuilder.DropColumnIfExists("products", "estimated_unit_weight");
        }
    }
}
