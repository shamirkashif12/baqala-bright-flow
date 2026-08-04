using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace BaqalaPOS.Api.Migrations
{
    /// <inheritdoc />
    public partial class RecreateDataProtectionKeysTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // On the live server, 20260713083451_AddSelfCheckoutKioskSupport is recorded as applied
            // in __EFMigrationsHistory, but its CREATE TABLE for DataProtectionKeys never landed —
            // MySQL DDL isn't transactional and this project's startup migration runner
            // (Program.cs) executes each migration's full script in one non-transactional call, so
            // a mid-script failure (or an out-of-band DROP afterward) can leave the history row
            // committed while the table itself is gone. Symptom: every IDataProtector.Protect()
            // call (e.g. ZatcaService.GenerateCsrAsync encrypting the CSR private key) throws
            // CryptographicException wrapping "Table 'DataProtectionKeys' doesn't exist". Recreate
            // it here, identical to the original migration's definition; IF NOT EXISTS keeps this a
            // no-op anywhere the table is already present (e.g. a fresh database).
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS `DataProtectionKeys` (
                    `Id` int NOT NULL AUTO_INCREMENT,
                    `FriendlyName` longtext,
                    `Xml` longtext,
                    PRIMARY KEY (`Id`)
                ) CHARACTER SET=utf8mb4;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Deliberately a no-op: this migration only repairs drift for environments where the
            // table went missing. Dropping it on Down would destroy live DataProtection keys
            // (already-encrypted secrets, e.g. the ZATCA private key, become undecryptable).
        }
    }
}
