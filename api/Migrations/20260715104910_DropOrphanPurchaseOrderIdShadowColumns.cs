using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class DropOrphanPurchaseOrderIdShadowColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_purchase_order_items_purchase_orders_PurchaseOrderId",
                table: "purchase_order_items");

            migrationBuilder.DropForeignKey(
                name: "FK_supplier_payments_purchase_orders_PurchaseOrderId",
                table: "supplier_payments");

            migrationBuilder.DropIndex(
                name: "IX_supplier_payments_PurchaseOrderId",
                table: "supplier_payments");

            migrationBuilder.DropIndex(
                name: "IX_purchase_order_items_PurchaseOrderId",
                table: "purchase_order_items");

            migrationBuilder.DropColumn(
                name: "PurchaseOrderId",
                table: "supplier_payments");

            migrationBuilder.DropColumn(
                name: "PurchaseOrderId",
                table: "purchase_order_items");

            migrationBuilder.CreateIndex(
                name: "IX_supplier_payments_po_id",
                table: "supplier_payments",
                column: "po_id");

            migrationBuilder.CreateIndex(
                name: "IX_purchase_order_items_po_id",
                table: "purchase_order_items",
                column: "po_id");

            migrationBuilder.AddForeignKey(
                name: "FK_purchase_order_items_purchase_orders_po_id",
                table: "purchase_order_items",
                column: "po_id",
                principalTable: "purchase_orders",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_supplier_payments_purchase_orders_po_id",
                table: "supplier_payments",
                column: "po_id",
                principalTable: "purchase_orders",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_purchase_order_items_purchase_orders_po_id",
                table: "purchase_order_items");

            migrationBuilder.DropForeignKey(
                name: "FK_supplier_payments_purchase_orders_po_id",
                table: "supplier_payments");

            migrationBuilder.DropIndex(
                name: "IX_supplier_payments_po_id",
                table: "supplier_payments");

            migrationBuilder.DropIndex(
                name: "IX_purchase_order_items_po_id",
                table: "purchase_order_items");

            migrationBuilder.AddColumn<Guid>(
                name: "PurchaseOrderId",
                table: "supplier_payments",
                type: "char(36)",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "PurchaseOrderId",
                table: "purchase_order_items",
                type: "char(36)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_supplier_payments_PurchaseOrderId",
                table: "supplier_payments",
                column: "PurchaseOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_purchase_order_items_PurchaseOrderId",
                table: "purchase_order_items",
                column: "PurchaseOrderId");

            migrationBuilder.AddForeignKey(
                name: "FK_purchase_order_items_purchase_orders_PurchaseOrderId",
                table: "purchase_order_items",
                column: "PurchaseOrderId",
                principalTable: "purchase_orders",
                principalColumn: "id");

            migrationBuilder.AddForeignKey(
                name: "FK_supplier_payments_purchase_orders_PurchaseOrderId",
                table: "supplier_payments",
                column: "PurchaseOrderId",
                principalTable: "purchase_orders",
                principalColumn: "id");
        }
    }
}
