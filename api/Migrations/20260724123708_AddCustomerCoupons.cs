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
            // No inline table.ForeignKey(...) here — coupons/customers/users all predate this
            // migration, so their id columns' collation may not match this fresh table's ambient
            // default (see MigrationCollationHelper.cs / the migration-collation-addcolumn-gotcha
            // memory: "principal table created in an earlier migration" applies here even though
            // customer_coupons itself is brand new, because the FK's OTHER side isn't). Confirmed
            // failing on production with "Referencing column and referenced column are
            // incompatible" before this fix.
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

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_customer_coupons_coupons_coupon_id",
                table: "customer_coupons",
                column: "coupon_id",
                principalTable: "coupons",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_customer_coupons_customers_customer_id",
                table: "customer_coupons",
                column: "customer_id",
                principalTable: "customers",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_customer_coupons_users_assigned_by",
                table: "customer_coupons",
                column: "assigned_by",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "customer_coupons");
        }
    }
}
