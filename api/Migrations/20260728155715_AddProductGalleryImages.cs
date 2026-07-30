using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddProductGalleryImages : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS `product_images` (
                    `id` char(36) NOT NULL,
                    `product_id` char(36) NOT NULL,
                    `file_url` longtext NOT NULL,
                    `sort_order` int NOT NULL,
                    `uploaded_by` char(36) NULL,
                    `uploaded_at` datetime(6) NOT NULL,
                    CONSTRAINT `PK_product_images` PRIMARY KEY (`id`)
                ) CHARACTER SET utf8mb4;
            ");

            migrationBuilder.CreateIndexIfNotExists(
                name: "IX_product_images_product_id",
                table: "product_images",
                columnsSql: "`product_id`");

            migrationBuilder.CreateIndexIfNotExists(
                name: "IX_product_images_uploaded_by",
                table: "product_images",
                columnsSql: "`uploaded_by`");

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_product_images_products_product_id",
                table: "product_images",
                column: "product_id",
                principalTable: "products",
                principalColumn: "id",
                onDeleteSql: "CASCADE");

            migrationBuilder.AddForeignKeyWithMatchedCollationIfNotExists(
                name: "FK_product_images_users_uploaded_by",
                table: "product_images",
                column: "uploaded_by",
                principalTable: "users",
                principalColumn: "id",
                onDeleteSql: "RESTRICT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "product_images");
        }
    }
}
