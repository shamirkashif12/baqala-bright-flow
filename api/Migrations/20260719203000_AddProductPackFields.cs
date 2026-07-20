using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using BaqalaPOS.Api.Data;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <summary>
    /// FRD §12 — Pack & Unit pricing as a product attribute.
    ///
    ///   sale_unit_type  single | pack. Default "single" so every existing product is unchanged.
    ///   items_per_pack  items inside one pack; null for singles.
    ///
    /// A "pack" is sold as ONE sellable unit at its own price — selling one decrements on-hand by 1,
    /// exactly like a single. items_per_pack is shelf-edge/receipt information, not a stock
    /// multiplier, which is why this touches nothing in the sale/stock/batch path.
    ///
    /// Hand-written (like AddStockCountType) rather than EF-scaffolded on purpose: the model
    /// currently also carries stock_transfers.received_by and inventory_adjustments.stock_applied,
    /// which are separate in-progress changes with no migration of their own yet. An EF scaffold
    /// diffs the whole model and would fold those two unrelated columns into this migration; writing
    /// it by hand keeps this migration to exactly the two columns it is about. The snapshot was
    /// rebuilt from 20260717114848_AddPricingRules.Designer.cs (the authoritative post-AddPricingRules
    /// model) plus these two properties, so it still correctly flags received_by/stock_applied as
    /// needing their own migration.
    /// </summary>
    [DbContext(typeof(BaqalaDbContext))]
    [Migration("20260719203000_AddProductPackFields")]
    public partial class AddProductPackFields : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "sale_unit_type",
                table: "products",
                type: "varchar(10)",
                maxLength: 10,
                nullable: false,
                defaultValue: "single");

            migrationBuilder.AddColumn<int>(
                name: "items_per_pack",
                table: "products",
                type: "int",
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "items_per_pack", table: "products");
            migrationBuilder.DropColumn(name: "sale_unit_type", table: "products");
        }
    }
}
