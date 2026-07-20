using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using BaqalaPOS.Api.Data;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <summary>
    /// FRD §2.3 — put existing write-offs into the review queue.
    ///
    /// AddAdjustmentApprovalFlow deliberately left approval_status NULL on every pre-existing row,
    /// reasoning that a null means "not subject to review" and that backfilling would invent a queue
    /// nobody asked for. In practice that made the whole feature invisible: every write-off in the
    /// system predates the flow, so the Wastage report showed a dash and no Approve/Reject action
    /// anywhere, and approved_by stayed permanently empty.
    ///
    /// "Pending" is the honest state for these rows — they are real write-offs that genuinely were
    /// never signed off by anyone. This does NOT fabricate approvals (which would be dishonest); it
    /// only says they still need one.
    ///
    /// Scoped to waste/damage only, matching InventoryController.RequiresApproval. "expired" is
    /// excluded for the same reason it is there: those are raised automatically by
    /// OperationalAlertsService from a date the system already knows is past, so there is no human
    /// judgement to review.
    /// </summary>
    [DbContext(typeof(BaqalaDbContext))]
    [Migration("20260717120000_BackfillWasteApprovalStatus")]
    public class BackfillWasteApprovalStatus : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                UPDATE inventory_adjustments
                SET approval_status = 'pending'
                WHERE adjustment_type IN ('waste', 'damage')
                  AND approval_status IS NULL;
            ");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Only un-set rows still awaiting review. A row approved/rejected since this ran is a
            // real decision by a real person — reverting the migration must not erase it.
            migrationBuilder.Sql(@"
                UPDATE inventory_adjustments
                SET approval_status = NULL
                WHERE adjustment_type IN ('waste', 'damage')
                  AND approval_status = 'pending'
                  AND approved_by IS NULL;
            ");
        }
    }
}
