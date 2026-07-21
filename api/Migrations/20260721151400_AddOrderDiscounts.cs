using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderDiscounts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "order_discounts",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    order_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    discount_id = table.Column<Guid>(type: "char(36)", nullable: true),
                    name = table.Column<string>(type: "varchar(255)", maxLength: 255, nullable: false),
                    amount = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_order_discounts", x => x.id);
                    table.ForeignKey(
                        name: "FK_order_discounts_discounts_discount_id",
                        column: x => x.discount_id,
                        principalTable: "discounts",
                        principalColumn: "id");
                    table.ForeignKey(
                        name: "FK_order_discounts_orders_order_id",
                        column: x => x.order_id,
                        principalTable: "orders",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_order_discounts_discount_id",
                table: "order_discounts",
                column: "discount_id");

            migrationBuilder.CreateIndex(
                name: "IX_order_discounts_order_id",
                table: "order_discounts",
                column: "order_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "order_discounts");
        }
    }
}
