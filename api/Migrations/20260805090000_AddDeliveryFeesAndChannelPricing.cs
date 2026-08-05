using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using BaqalaPOS.Api.Data;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <summary>
    /// Delivery fees for online orders, plus the storage side of per-channel pricing.
    ///
    /// 1. delivery_fee_rules — per-branch or tenant-wide rules that price delivery by distance
    ///    ("radius"), by area ("bbox") or flatly, and can mark an area undeliverable. Matched
    ///    against the delivery pin the shopper drops at checkout (see IDeliveryFeeService).
    /// 2. orders.delivery_fee_amount — the charge itself, part of total_amount. Its own column
    ///    rather than folded into custom_fee_amount because it is the one fee customers query and
    ///    staff override, so it has to stay separable on the order and in reporting.
    /// 3. order_delivery_details.* — provenance for that number (which rule, how far, and who
    ///    overrode it), snapshotted because the rule may be edited or deleted afterwards while
    ///    "why was I charged this?" is asked days later.
    /// 4. pos_settings — the branch's default delivery fee and free-delivery threshold, which is
    ///    the entire configuration for a shop with one citywide rate.
    ///
    /// Channel pricing itself needs NO schema change: product_price_lists.price_type has existed
    /// since the pricing feature shipped and already stores the channel. What changes is only
    /// which values are accepted (SalesChannelCatalog) and how they resolve — channel-first with a
    /// standard fallback, in PriceResolutionService. Every existing row keeps working untouched.
    ///
    /// Hand-written, no Designer.cs, matching AddProductLooseUnitLink and
    /// AddUnitOfMeasureSubstitutesAndEstimatedWeight: an EF scaffold would diff the whole model
    /// against whatever else is mid-flight. Uses the IfNotExists/collation-matched helpers for the
    /// usual no-transaction partial-failure and ambient-collation-drift reasons — see
    /// MigrationIdempotencyHelper / MigrationCollationHelper. The new table's FK column is added
    /// bare and constrained afterwards via the collation-matched helper rather than inline in
    /// CreateTable, because a fresh table inherits the server's ambient collation, which is not
    /// necessarily the one branches.id was created with.
    /// </summary>
    [DbContext(typeof(BaqalaDbContext))]
    [Migration("20260805090000_AddDeliveryFeesAndChannelPricing")]
    public partial class AddDeliveryFeesAndChannelPricing : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ── 1. Delivery fee rules ────────────────────────────────────────────────
            // decimal(18,4) throughout matches the blanket precision BaqalaDbContext applies to
            // every decimal — including the coordinates, whose 4 decimal places resolve to about
            // 11 metres, far finer than any delivery zone is drawn and the same precision
            // order_delivery_details.latitude/longitude already store the pin at.
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS `delivery_fee_rules` (
                    `id` char(36) NOT NULL,
                    `branch_id` char(36) NULL,
                    `name` varchar(255) NOT NULL,
                    `rule_type` varchar(20) NOT NULL,
                    `center_latitude` decimal(18,4) NULL,
                    `center_longitude` decimal(18,4) NULL,
                    `min_distance_km` decimal(18,4) NULL,
                    `max_distance_km` decimal(18,4) NULL,
                    `min_latitude` decimal(18,4) NULL,
                    `max_latitude` decimal(18,4) NULL,
                    `min_longitude` decimal(18,4) NULL,
                    `max_longitude` decimal(18,4) NULL,
                    `fee_amount` decimal(18,4) NOT NULL DEFAULT 0,
                    `free_above_order_amount` decimal(18,4) NULL,
                    `is_serviceable` tinyint(1) NOT NULL DEFAULT 1,
                    `unserviceable_message` varchar(500) NULL,
                    `priority` int NOT NULL DEFAULT 0,
                    `is_active` tinyint(1) NOT NULL DEFAULT 1,
                    `created_by` char(36) NULL,
                    `created_at` datetime(6) NOT NULL,
                    `updated_at` datetime(6) NOT NULL,
                    PRIMARY KEY (`id`)
                );
            ");

            migrationBuilder.CreateIndexIfNotExists(
                "IX_delivery_fee_rules_branch_id_is_active",
                "delivery_fee_rules",
                "`branch_id`, `is_active`");

            // RESTRICT, not CASCADE: deleting a branch must not silently take the tenant's
            // delivery pricing with it.
            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_delivery_fee_rules_branches_branch_id",
                table: "delivery_fee_rules",
                column: "branch_id",
                principalTable: "branches",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: true);

            // ── 2. The charge on the order ───────────────────────────────────────────
            migrationBuilder.AddColumnIfNotExists("orders", "delivery_fee_amount", "decimal(18,4) NOT NULL DEFAULT 0");

            // ── 3. How that charge was arrived at ────────────────────────────────────
            // delivery_fee_rule_id is deliberately NOT a foreign key: the rule may be deleted
            // later and this row must still mean something, which is also why the rule's name is
            // snapshotted alongside it.
            migrationBuilder.AddColumnIfNotExists("order_delivery_details", "delivery_fee_rule_id", "char(36) NULL");
            migrationBuilder.AddColumnIfNotExists("order_delivery_details", "delivery_fee_rule_name", "varchar(255) NULL");
            migrationBuilder.AddColumnIfNotExists("order_delivery_details", "delivery_distance_km", "decimal(18,4) NULL");
            migrationBuilder.AddColumnIfNotExists("order_delivery_details", "delivery_fee_overridden_by", "char(36) NULL");
            migrationBuilder.AddColumnIfNotExists("order_delivery_details", "delivery_fee_overridden_at", "datetime(6) NULL");
            migrationBuilder.AddColumnIfNotExists("order_delivery_details", "delivery_fee_override_reason", "varchar(500) NULL");

            // ── 4. Branch defaults ───────────────────────────────────────────────────
            // Both default to 0 — no fee, no threshold — so every existing branch keeps quoting
            // free delivery until someone deliberately configures otherwise.
            migrationBuilder.AddColumnIfNotExists("pos_settings", "online_ordering_delivery_fee_sar", "decimal(18,4) NOT NULL DEFAULT 0");
            migrationBuilder.AddColumnIfNotExists("pos_settings", "online_ordering_free_delivery_above_sar", "decimal(18,4) NOT NULL DEFAULT 0");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumnIfExists("pos_settings", "online_ordering_free_delivery_above_sar");
            migrationBuilder.DropColumnIfExists("pos_settings", "online_ordering_delivery_fee_sar");

            migrationBuilder.DropColumnIfExists("order_delivery_details", "delivery_fee_override_reason");
            migrationBuilder.DropColumnIfExists("order_delivery_details", "delivery_fee_overridden_at");
            migrationBuilder.DropColumnIfExists("order_delivery_details", "delivery_fee_overridden_by");
            migrationBuilder.DropColumnIfExists("order_delivery_details", "delivery_distance_km");
            migrationBuilder.DropColumnIfExists("order_delivery_details", "delivery_fee_rule_name");
            migrationBuilder.DropColumnIfExists("order_delivery_details", "delivery_fee_rule_id");

            // Dropping this loses the fee actually charged on historic orders, which total_amount
            // still includes — the columns above go with it, so the whole feature reverses
            // together rather than leaving orders whose total no longer adds up from its parts.
            migrationBuilder.DropColumnIfExists("orders", "delivery_fee_amount");

            migrationBuilder.DropForeignKeyIfExists("delivery_fee_rules", "FK_delivery_fee_rules_branches_branch_id");
            migrationBuilder.Sql("DROP TABLE IF EXISTS `delivery_fee_rules`;");
        }
    }
}
