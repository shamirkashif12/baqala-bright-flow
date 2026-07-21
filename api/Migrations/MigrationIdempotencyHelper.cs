using Microsoft.EntityFrameworkCore.Migrations;

namespace BaqalaPOS.Api.Migrations;

// This project's startup migration runner (see Program.cs) generates each pending migration's
// SQL and executes it directly via ExecuteSqlRawAsync — it does not wrap a migration's statements
// in a single transaction (that would require MariaDB's GET_LOCK-based Migrate(), which is broken
// on this server). So when a migration errors out partway through (e.g. the incompatible-collation
// FK bug that MigrationCollationHelper fixes), every statement before the failure point has
// already committed to the database even though the migration was never recorded as applied in
// __EFMigrationsHistory. Retrying after the underlying bug is fixed then replays the WHOLE
// migration's Up() from scratch and blows up on "duplicate column name" / "duplicate key" for
// every object that already landed during the earlier partial run. That is exactly what happened
// to AddHrmShiftsAndAttendance: it re-hit the same failure point after the FK fix, but this time
// on "Duplicate column name 'date'" because the AddColumn calls before that FK had already
// succeeded and committed on the previous (failed) attempt.
//
// These helpers make each DDL statement a no-op when the object already exists, so a migration
// stays safe to (re)run against a database in any partial state — not just a pristine one.
internal static class MigrationIdempotencyHelper
{
    public static void AddColumnIfNotExists(
        this MigrationBuilder migrationBuilder,
        string table,
        string column,
        string columnDefinitionSql)
    {
        migrationBuilder.Sql($@"
            SET @col_exists = (
                SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{table}' AND COLUMN_NAME = '{column}'
            );
            SET @ddl = IF(@col_exists > 0, 'SELECT 1',
                'ALTER TABLE `{table}` ADD COLUMN `{column}` {columnDefinitionSql}');
            PREPARE stmt FROM @ddl;
            EXECUTE stmt;
            DEALLOCATE PREPARE stmt;
        ");
    }

    public static void CreateIndexIfNotExists(
        this MigrationBuilder migrationBuilder,
        string name,
        string table,
        string columnsSql,
        bool unique = false)
    {
        migrationBuilder.Sql($@"
            SET @idx_exists = (
                SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{table}' AND INDEX_NAME = '{name}'
            );
            SET @ddl = IF(@idx_exists > 0, 'SELECT 1',
                'CREATE {(unique ? "UNIQUE " : "")}INDEX `{name}` ON `{table}` ({columnsSql})');
            PREPARE stmt FROM @ddl;
            EXECUTE stmt;
            DEALLOCATE PREPARE stmt;
        ");
    }

    /// <summary>
    /// Same as <see cref="MigrationCollationHelper.AddForeignKeyWithMatchedCollation"/> but skips
    /// entirely (both the collation-matching MODIFY and the constraint add) if the constraint
    /// already exists, so a migration that adds this FK is safe to re-run after a partial failure.
    /// </summary>
    public static void AddForeignKeyWithMatchedCollationIfNotExists(
        this MigrationBuilder migrationBuilder,
        string name,
        string table,
        string column,
        string principalTable,
        string principalColumn,
        string onDeleteSql,
        bool nullable = false,
        string columnType = "char(36)")
    {
        migrationBuilder.Sql($@"
            SET @fk_exists = (
                SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{table}' AND CONSTRAINT_NAME = '{name}'
            );
            SET @ref_collation = (
                SELECT COLLATION_NAME FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{principalTable}' AND COLUMN_NAME = '{principalColumn}'
            );
            SET @ddl = IF(@fk_exists > 0, 'SELECT 1',
                CONCAT('ALTER TABLE `{table}` MODIFY `{column}` {columnType} CHARACTER SET utf8mb4 COLLATE ', @ref_collation, '{(nullable ? " NULL" : " NOT NULL")}'));
            PREPARE stmt FROM @ddl;
            EXECUTE stmt;
            DEALLOCATE PREPARE stmt;

            SET @ddl2 = IF(@fk_exists > 0, 'SELECT 1',
                'ALTER TABLE `{table}` ADD CONSTRAINT `{name}` FOREIGN KEY (`{column}`) REFERENCES `{principalTable}` (`{principalColumn}`) ON DELETE {onDeleteSql}');
            PREPARE stmt FROM @ddl2;
            EXECUTE stmt;
            DEALLOCATE PREPARE stmt;
        ");
    }
}
