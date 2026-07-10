using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddUserPermissionOverrides : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // No inline FK here (unlike the original version of this migration) — see the
            // collation-fix step below for why.
            migrationBuilder.CreateTable(
                name: "user_permissions",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "char(36)", nullable: false),
                    user_id = table.Column<Guid>(type: "char(36)", nullable: false),
                    module = table.Column<string>(type: "varchar(100)", maxLength: 100, nullable: false),
                    can_view = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    can_create = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    can_edit = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    can_delete = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    can_approve = table.Column<bool>(type: "tinyint(1)", nullable: false),
                    can_export = table.Column<bool>(type: "tinyint(1)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_permissions", x => x.id);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            // No collation is pinned anywhere in this project (BaqalaDbContext has no
            // UseCollation), so every CREATE TABLE silently inherits whatever the server's
            // ambient default collation happens to be at the moment it runs. That's fine as
            // long as it never changes — but on the server this failed on, `users.id` was
            // created under a different default than what's in effect now, so the new
            // `user_id char(36)` column above came back with a mismatched collation and MySQL
            // refused to create the FK ("Referencing column and referenced column are
            // incompatible"). Rather than hardcode a guessed collation literal (which would
            // just move the bug to whichever environment doesn't happen to match the guess),
            // read `users.id`'s actual collation at migration time and apply that exact value —
            // correct on every environment regardless of its ambient default.
            //
            // Requires "Allow User Variables=True" on the connection string (see
            // appsettings.Development.json / the production connection string) — without it,
            // MySql.Data's client-side parameter parser intercepts `@users_id_collation` as an
            // ADO.NET bind parameter and throws "Parameter '@users_id_collation' must be
            // defined" before this ever reaches the server. Verified against MySql.Data 10.0.7
            // (the exact package/version this project uses) before relying on it here.
            migrationBuilder.Sql(@"
                SET @users_id_collation = (
                    SELECT COLLATION_NAME FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'id'
                );
                SET @ddl = CONCAT('ALTER TABLE `user_permissions` MODIFY `user_id` CHAR(36) CHARACTER SET utf8mb4 COLLATE ', @users_id_collation, ' NOT NULL');
                PREPARE stmt FROM @ddl;
                EXECUTE stmt;
                DEALLOCATE PREPARE stmt;
            ");

            migrationBuilder.CreateIndex(
                name: "IX_user_permissions_user_id",
                table: "user_permissions",
                column: "user_id");

            migrationBuilder.AddForeignKey(
                name: "FK_user_permissions_users_user_id",
                table: "user_permissions",
                column: "user_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "user_permissions");
        }
    }
}
