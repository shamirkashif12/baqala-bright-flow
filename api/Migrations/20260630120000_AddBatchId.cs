using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using BaqalaPOS.Api.Data;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    [DbContext(typeof(BaqalaDbContext))]
    [Migration("20260630120000_AddBatchId")]
    public partial class AddBatchId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "batch_id",
                table: "purchase_orders",
                type: "varchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "batch_id",
                table: "stock_transfers",
                type: "varchar(50)",
                maxLength: 50,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "batch_id",
                table: "purchase_orders");

            migrationBuilder.DropColumn(
                name: "batch_id",
                table: "stock_transfers");
        }
    }
}
