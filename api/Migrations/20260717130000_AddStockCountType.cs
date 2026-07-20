using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using BaqalaPOS.Api.Data;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <summary>
    /// FRD §2.1 — gives the "Stock Review" / "Stock Audit" / "Inventory Reconciliation" filters
    /// something to filter on.
    ///
    /// All three FRD names describe one StockCount session (start → count → complete). The only
    /// thing that separates them is why the count was run, which nothing recorded — so without this
    /// column the three filters would be three labels over an identical row set.
    ///
    /// Nullable and NOT backfilled: sessions that ran before this column existed have no recorded
    /// intent, and assigning them one would invent history. They read as "Unspecified".
    /// </summary>
    [DbContext(typeof(BaqalaDbContext))]
    [Migration("20260717130000_AddStockCountType")]
    public class AddStockCountType : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "count_type",
                table: "stock_counts",
                type: "varchar(20)",
                maxLength: 20,
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "count_type", table: "stock_counts");
        }
    }
}
