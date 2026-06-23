using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using BaqalaPOS.Api.Data;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    [DbContext(typeof(BaqalaDbContext))]
    [Migration("20260623070000_AddAlKhobarCornicheSampleStock")]
    public class AddAlKhobarCornicheSampleStock : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Seed 150 units of every active product into the Al Khobar Corniche branch.
            // Skips any product that already has a stock record there.
            migrationBuilder.Sql(@"
                INSERT INTO inventory_stock
                    (id, product_id, branch_id, quantity, reserved_quantity, reorder_level, last_updated, created_at, updated_at)
                SELECT
                    UUID(),
                    p.id,
                    b.id,
                    150,   -- opening quantity
                    0,
                    10,    -- reorder level
                    NOW(),
                    NOW(),
                    NOW()
                FROM products p
                CROSS JOIN branches b
                WHERE b.name = 'Al Khobar Corniche'
                  AND p.status = 'active'
                  AND NOT EXISTS (
                      SELECT 1 FROM inventory_stock s
                      WHERE s.product_id = p.id
                        AND s.branch_id  = b.id
                  );
            ");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Removes all stock records that were seeded for Al Khobar Corniche.
            migrationBuilder.Sql(@"
                DELETE s
                FROM inventory_stock s
                JOIN branches b ON s.branch_id = b.id
                WHERE b.name = 'Al Khobar Corniche';
            ");
        }
    }
}
