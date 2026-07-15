using BaqalaPOS.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    [DbContext(typeof(BaqalaDbContext))]
    [Migration("20260713083450_AddIsTobaccoToProducts")]
    public partial class AddIsTobaccoToProducts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Guarded like FixMissingTobaccoFeeAndCreatedByColumns: the live database already has
            // is_tobacco (added long ago by a migration — MakeCodeFieldsNullableAddIsTobacco — whose
            // file no longer exists anywhere in git history, only its __EFMigrationsHistory record).
            // A plain ADD COLUMN here throws "Duplicate column name 'is_tobacco'" on that database and
            // on this project's dev DB, which permanently blocks every later pending migration behind
            // it (confirmed via GET /api/diagnostics/migrations on production). Safe no-op wherever the
            // column already exists; still creates it correctly on a genuinely fresh database.
            migrationBuilder.Sql(@"
                SET @sql := (SELECT IF(
                    (SELECT COUNT(*) FROM information_schema.COLUMNS
                       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'
                         AND COLUMN_NAME = 'is_tobacco') > 0,
                    'SELECT 1',
                    'ALTER TABLE `products` ADD COLUMN `is_tobacco` tinyint(1) NOT NULL DEFAULT 0'));
                PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "is_tobacco",
                table: "products");
        }
    }
}
