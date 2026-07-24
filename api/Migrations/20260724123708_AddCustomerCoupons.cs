using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomerCoupons : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "customer_coupons",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    coupon_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    customer_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    assigned_by = table.Column<Guid>(type: "char(36)", nullable: true),
                    assigned_at = table.Column<DateTime>(type: "datetime(6)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_customer_coupons", x => x.id);
                    table.ForeignKey(
                        name: "FK_customer_coupons_coupons_coupon_id",
                        column: x => x.coupon_id,
                        principalTable: "coupons",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_customer_coupons_customers_customer_id",
                        column: x => x.customer_id,
                        principalTable: "customers",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_customer_coupons_users_assigned_by",
                        column: x => x.assigned_by,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_customer_coupons_assigned_by",
                table: "customer_coupons",
                column: "assigned_by");

            migrationBuilder.CreateIndex(
                name: "IX_customer_coupons_coupon_id_customer_id",
                table: "customer_coupons",
                columns: new[] { "coupon_id", "customer_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_customer_coupons_customer_id",
                table: "customer_coupons",
                column: "customer_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "customer_coupons");
        }
    }
}
