using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using BaqalaPOS.Api.Data;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    [DbContext(typeof(BaqalaDbContext))]
    [Migration("20260630130000_DeleteStaleShortageClaimNotes")]
    public class DeleteStaleShortageClaimNotes : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Remove stale shortage_claim credit notes that were created in error during testing.
            // Also removes any orphaned stock_discrepancy records that referenced them.
            migrationBuilder.Sql(@"
                DELETE FROM stock_discrepancies
                WHERE id IN (
                    SELECT discrepancy_id FROM supplier_credit_notes
                    WHERE credit_note_number IN (
                        'DN-20260623-F568D1',
                        'DN-20260623-2318C0',
                        'DN-20260622-0338F0'
                    )
                    AND discrepancy_id IS NOT NULL
                );
            ");

            migrationBuilder.Sql(@"
                DELETE FROM supplier_credit_notes
                WHERE credit_note_number IN (
                    'DN-20260623-F568D1',
                    'DN-20260623-2318C0',
                    'DN-20260622-0338F0'
                );
            ");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Data deletion is not reversible
        }
    }
}
