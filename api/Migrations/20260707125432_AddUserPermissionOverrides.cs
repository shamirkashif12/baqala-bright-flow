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
                    table.ForeignKey(
                        name: "FK_user_permissions_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySQL:Charset", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_user_permissions_user_id",
                table: "user_permissions",
                column: "user_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "user_permissions");
        }
    }
}
