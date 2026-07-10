using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class FixCouponTaxRuleFKs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_coupons_users_CreatedByUserId",
                table: "coupons");

            migrationBuilder.DropForeignKey(
                name: "FK_tax_fee_rules_users_CreatedByUserId",
                table: "tax_fee_rules");

            migrationBuilder.DropIndex(
                name: "IX_tax_fee_rules_CreatedByUserId",
                table: "tax_fee_rules");

            migrationBuilder.DropIndex(
                name: "IX_coupons_CreatedByUserId",
                table: "coupons");

            migrationBuilder.DropColumn(
                name: "CreatedByUserId",
                table: "tax_fee_rules");

            migrationBuilder.DropColumn(
                name: "CreatedByUserId",
                table: "coupons");

            migrationBuilder.AlterColumn<DateTime>(
                name: "supply_date",
                table: "zatca_invoices",
                type: "datetime(6)",
                nullable: true,
                oldClrType: typeof(DateOnly),
                oldType: "date",
                oldNullable: true);

            migrationBuilder.AlterColumn<DateTime>(
                name: "expiry_date",
                table: "warehouse_request_items",
                type: "datetime(6)",
                nullable: true,
                oldClrType: typeof(DateOnly),
                oldType: "date",
                oldNullable: true);

            migrationBuilder.AlterColumn<DateTime>(
                name: "end_date",
                table: "tax_fee_rules",
                type: "datetime(6)",
                nullable: true,
                oldClrType: typeof(DateOnly),
                oldType: "date",
                oldNullable: true);

            migrationBuilder.AlterColumn<DateTime>(
                name: "effective_date",
                table: "tax_fee_rules",
                type: "datetime(6)",
                nullable: false,
                oldClrType: typeof(DateOnly),
                oldType: "date");

            migrationBuilder.AlterColumn<DateTime>(
                name: "last_supply_date",
                table: "suppliers",
                type: "datetime(6)",
                nullable: true,
                oldClrType: typeof(DateOnly),
                oldType: "date",
                oldNullable: true);

            migrationBuilder.AlterColumn<DateTime>(
                name: "effective_to",
                table: "product_price_lists",
                type: "datetime(6)",
                nullable: true,
                oldClrType: typeof(DateOnly),
                oldType: "date",
                oldNullable: true);

            migrationBuilder.AlterColumn<DateTime>(
                name: "effective_from",
                table: "product_price_lists",
                type: "datetime(6)",
                nullable: false,
                oldClrType: typeof(DateOnly),
                oldType: "date");

            migrationBuilder.AlterColumn<DateTime>(
                name: "expiry_date",
                table: "loyalty_transactions",
                type: "datetime(6)",
                nullable: true,
                oldClrType: typeof(DateOnly),
                oldType: "date",
                oldNullable: true);

            migrationBuilder.AlterColumn<DateTime>(
                name: "received_date",
                table: "inventory_batches",
                type: "datetime(6)",
                nullable: false,
                oldClrType: typeof(DateOnly),
                oldType: "date");

            migrationBuilder.AlterColumn<DateTime>(
                name: "expiry_date",
                table: "inventory_batches",
                type: "datetime(6)",
                nullable: true,
                oldClrType: typeof(DateOnly),
                oldType: "date",
                oldNullable: true);

            migrationBuilder.AlterColumn<DateTime>(
                name: "expense_date",
                table: "expenses",
                type: "datetime(6)",
                nullable: false,
                oldClrType: typeof(DateOnly),
                oldType: "date");

            migrationBuilder.AlterColumn<DateTime>(
                name: "start_date",
                table: "coupons",
                type: "datetime(6)",
                nullable: false,
                oldClrType: typeof(DateOnly),
                oldType: "date");

            migrationBuilder.AlterColumn<DateTime>(
                name: "end_date",
                table: "coupons",
                type: "datetime(6)",
                nullable: false,
                oldClrType: typeof(DateOnly),
                oldType: "date");

            migrationBuilder.CreateIndex(
                name: "IX_tax_fee_rules_created_by",
                table: "tax_fee_rules",
                column: "created_by");

            migrationBuilder.CreateIndex(
                name: "IX_coupons_created_by",
                table: "coupons",
                column: "created_by");

            // `created_by` is a pre-existing column from InitialSchema, only now getting its
            // first FK — its collation may not match `users.id`'s if the server's ambient
            // default drifted between the two migrations. See MigrationCollationHelper.
            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_coupons_users_created_by",
                table: "coupons",
                column: "created_by",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_tax_fee_rules_users_created_by",
                table: "tax_fee_rules",
                column: "created_by",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_coupons_users_created_by",
                table: "coupons");

            migrationBuilder.DropForeignKey(
                name: "FK_tax_fee_rules_users_created_by",
                table: "tax_fee_rules");

            migrationBuilder.DropIndex(
                name: "IX_tax_fee_rules_created_by",
                table: "tax_fee_rules");

            migrationBuilder.DropIndex(
                name: "IX_coupons_created_by",
                table: "coupons");

            migrationBuilder.AlterColumn<DateOnly>(
                name: "supply_date",
                table: "zatca_invoices",
                type: "date",
                nullable: true,
                oldClrType: typeof(DateTime),
                oldType: "datetime(6)",
                oldNullable: true);

            migrationBuilder.AlterColumn<DateOnly>(
                name: "expiry_date",
                table: "warehouse_request_items",
                type: "date",
                nullable: true,
                oldClrType: typeof(DateTime),
                oldType: "datetime(6)",
                oldNullable: true);

            migrationBuilder.AlterColumn<DateOnly>(
                name: "end_date",
                table: "tax_fee_rules",
                type: "date",
                nullable: true,
                oldClrType: typeof(DateTime),
                oldType: "datetime(6)",
                oldNullable: true);

            migrationBuilder.AlterColumn<DateOnly>(
                name: "effective_date",
                table: "tax_fee_rules",
                type: "date",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "datetime(6)");

            migrationBuilder.AddColumn<Guid>(
                name: "CreatedByUserId",
                table: "tax_fee_rules",
                type: "char(36)",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AlterColumn<DateOnly>(
                name: "last_supply_date",
                table: "suppliers",
                type: "date",
                nullable: true,
                oldClrType: typeof(DateTime),
                oldType: "datetime(6)",
                oldNullable: true);

            migrationBuilder.AlterColumn<DateOnly>(
                name: "effective_to",
                table: "product_price_lists",
                type: "date",
                nullable: true,
                oldClrType: typeof(DateTime),
                oldType: "datetime(6)",
                oldNullable: true);

            migrationBuilder.AlterColumn<DateOnly>(
                name: "effective_from",
                table: "product_price_lists",
                type: "date",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "datetime(6)");

            migrationBuilder.AlterColumn<DateOnly>(
                name: "expiry_date",
                table: "loyalty_transactions",
                type: "date",
                nullable: true,
                oldClrType: typeof(DateTime),
                oldType: "datetime(6)",
                oldNullable: true);

            migrationBuilder.AlterColumn<DateOnly>(
                name: "received_date",
                table: "inventory_batches",
                type: "date",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "datetime(6)");

            migrationBuilder.AlterColumn<DateOnly>(
                name: "expiry_date",
                table: "inventory_batches",
                type: "date",
                nullable: true,
                oldClrType: typeof(DateTime),
                oldType: "datetime(6)",
                oldNullable: true);

            migrationBuilder.AlterColumn<DateOnly>(
                name: "expense_date",
                table: "expenses",
                type: "date",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "datetime(6)");

            migrationBuilder.AlterColumn<DateOnly>(
                name: "start_date",
                table: "coupons",
                type: "date",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "datetime(6)");

            migrationBuilder.AlterColumn<DateOnly>(
                name: "end_date",
                table: "coupons",
                type: "date",
                nullable: false,
                oldClrType: typeof(DateTime),
                oldType: "datetime(6)");

            migrationBuilder.AddColumn<Guid>(
                name: "CreatedByUserId",
                table: "coupons",
                type: "char(36)",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.CreateIndex(
                name: "IX_tax_fee_rules_CreatedByUserId",
                table: "tax_fee_rules",
                column: "CreatedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_coupons_CreatedByUserId",
                table: "coupons",
                column: "CreatedByUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_coupons_users_CreatedByUserId",
                table: "coupons",
                column: "CreatedByUserId",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_tax_fee_rules_users_CreatedByUserId",
                table: "tax_fee_rules",
                column: "CreatedByUserId",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
