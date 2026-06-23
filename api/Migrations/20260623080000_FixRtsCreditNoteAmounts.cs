using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using BaqalaPOS.Api.Data;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    [DbContext(typeof(BaqalaDbContext))]
    [Migration("20260623080000_FixRtsCreditNoteAmounts")]
    public class FixRtsCreditNoteAmounts : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Back-fill amount = 0 on RTS credit notes by summing
            // (received_quantity * unit_cost) per transfer, falling back to
            // product cost_price when unit_cost is null or zero.
            migrationBuilder.Sql(@"
                UPDATE supplier_credit_notes cn
                JOIN (
                    SELECT
                        si.transfer_id,
                        SUM(
                            COALESCE(si.received_quantity, si.requested_quantity) *
                            COALESCE(NULLIF(si.unit_cost, 0), p.cost_price, 0)
                        ) AS total_cost
                    FROM stock_transfer_items si
                    JOIN products p ON p.id = si.product_id
                    GROUP BY si.transfer_id
                ) costs ON costs.transfer_id = cn.transfer_id
                SET cn.amount = costs.total_cost
                WHERE cn.amount = 0
                  AND cn.credit_type = 'rts_return';
            ");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Cannot reliably undo; leave amounts as-is on rollback
        }
    }
}
