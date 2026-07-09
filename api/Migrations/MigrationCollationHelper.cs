using Microsoft.EntityFrameworkCore.Migrations;

namespace BaqalaPOS.Api.Migrations;

// No collation is pinned anywhere in this project (BaqalaDbContext has no UseCollation), so
// every CREATE TABLE silently inherits whatever the server's ambient default collation happens
// to be at the moment it runs. That's fine as long as it never changes on a given server — but
// it did between when `users`/`branches`/etc. were first created (InitialSchema) and when later
// migrations added new FK columns pointing back at them, so MySQL refused to create those FKs
// ("Referencing column and referenced column are incompatible"). Rather than hardcode a guessed
// collation literal (which would just move the bug to whichever environment doesn't happen to
// match the guess), every migration that adds a FK to a column from an earlier migration should
// read that column's actual collation at migration-apply time and apply the exact same value to
// the new FK column before adding the constraint — correct on every environment regardless of
// its ambient default, including a brand-new environment migrating from scratch.
//
// Requires "Allow User Variables=True" on the connection string — without it, MySql.Data's
// client-side parameter parser intercepts the `@ref_collation`/`@ddl` session variables below as
// ADO.NET bind parameters and throws "Parameter '@ref_collation' must be defined" before this
// ever reaches the server. Verified against MySql.Data 10.0.7 (the exact package/version this
// project uses) in the AddUserPermissionOverrides migration before establishing this as the
// shared pattern.
internal static class MigrationCollationHelper
{
    /// <summary>
    /// Matches <paramref name="column"/>'s collation on <paramref name="table"/> to
    /// <paramref name="principalColumn"/>'s actual collation on <paramref name="principalTable"/>,
    /// then adds the FK. Call this instead of an inline <c>table.ForeignKey(...)</c> in
    /// <c>CreateTable</c>, or instead of a bare <c>migrationBuilder.AddForeignKey(...)</c>,
    /// whenever <paramref name="principalTable"/> was created in an earlier migration.
    /// </summary>
    public static void AddForeignKeyWithMatchedCollation(
        this MigrationBuilder migrationBuilder,
        string name,
        string table,
        string column,
        string principalTable,
        string principalColumn,
        ReferentialAction onDelete,
        bool nullable = false,
        string columnType = "char(36)")
    {
        migrationBuilder.Sql($@"
            SET @ref_collation = (
                SELECT COLLATION_NAME FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{principalTable}' AND COLUMN_NAME = '{principalColumn}'
            );
            SET @ddl = CONCAT('ALTER TABLE `{table}` MODIFY `{column}` {columnType} CHARACTER SET utf8mb4 COLLATE ', @ref_collation, '{(nullable ? " NULL" : " NOT NULL")}');
            PREPARE stmt FROM @ddl;
            EXECUTE stmt;
            DEALLOCATE PREPARE stmt;
        ");

        migrationBuilder.AddForeignKey(
            name: name,
            table: table,
            column: column,
            principalTable: principalTable,
            principalColumn: principalColumn,
            onDelete: onDelete);
    }
}
