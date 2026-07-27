using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddNotificationTerminalAndActor : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "terminal_id",
                table: "notifications",
                type: "char(36)",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "triggered_by_user_id",
                table: "notifications",
                type: "char(36)",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_notifications_terminal_id",
                table: "notifications",
                column: "terminal_id");

            migrationBuilder.CreateIndex(
                name: "IX_notifications_triggered_by_user_id",
                table: "notifications",
                column: "triggered_by_user_id");

            // notifications/terminals/users all predate this migration — terminal_id and
            // triggered_by_user_id are AddColumn'd onto the pre-existing notifications table, so
            // their collation can (and has, before, on the live server) differ from their
            // principal tables' id columns. See MigrationCollationHelper.cs / the
            // migration-collation-addcolumn-gotcha memory.
            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_notifications_terminals_terminal_id",
                table: "notifications",
                column: "terminal_id",
                principalTable: "terminals",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict,
                nullable: true);

            migrationBuilder.AddForeignKeyWithMatchedCollation(
                name: "FK_notifications_users_triggered_by_user_id",
                table: "notifications",
                column: "triggered_by_user_id",
                principalTable: "users",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_notifications_terminals_terminal_id",
                table: "notifications");

            migrationBuilder.DropForeignKey(
                name: "FK_notifications_users_triggered_by_user_id",
                table: "notifications");

            migrationBuilder.DropIndex(
                name: "IX_notifications_terminal_id",
                table: "notifications");

            migrationBuilder.DropIndex(
                name: "IX_notifications_triggered_by_user_id",
                table: "notifications");

            migrationBuilder.DropColumn(
                name: "terminal_id",
                table: "notifications");

            migrationBuilder.DropColumn(
                name: "triggered_by_user_id",
                table: "notifications");
        }
    }
}
