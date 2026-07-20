using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <summary>
    /// FRD §2.3 — post-hoc review for write-offs, pairing with the approved_by column added in
    /// AddInventoryAuditColumns (which nothing could populate until now).
    ///
    /// All three columns are nullable and NOT backfilled, on purpose: approval_status = null means
    /// "not subject to review", which is the honest state for every adjustment predating this flow.
    /// Backfilling "pending" would invent a review queue over historic write-offs; "approved" would
    /// fabricate sign-offs that never happened. Only new waste/damage rows enter the flow.
    /// </summary>
    public partial class AddAdjustmentApprovalFlow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "approval_status",
                table: "inventory_adjustments",
                type: "varchar(20)",
                maxLength: 20,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "approved_at",
                table: "inventory_adjustments",
                type: "datetime(6)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "rejection_reason",
                table: "inventory_adjustments",
                type: "varchar(500)",
                maxLength: 500,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "approval_status",
                table: "inventory_adjustments");

            migrationBuilder.DropColumn(
                name: "approved_at",
                table: "inventory_adjustments");

            migrationBuilder.DropColumn(
                name: "rejection_reason",
                table: "inventory_adjustments");
        }
    }
}
