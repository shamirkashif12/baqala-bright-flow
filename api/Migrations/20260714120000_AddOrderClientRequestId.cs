using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderClientRequestId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "client_request_id",
                table: "orders",
                type: "char(36)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_orders_client_request_id",
                table: "orders",
                column: "client_request_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_orders_client_request_id",
                table: "orders");

            migrationBuilder.DropColumn(
                name: "client_request_id",
                table: "orders");
        }
    }
}
