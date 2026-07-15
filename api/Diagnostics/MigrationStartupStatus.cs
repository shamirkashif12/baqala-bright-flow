namespace BaqalaPOS.Api.Diagnostics;

// Captures the outcome of the startup migration attempt in Program.cs so an authenticated
// diagnostic endpoint can report it without needing server log/SSH access — used to track down
// why migrations kept silently failing on the live server with no way to see the real exception.
public static class MigrationStartupStatus
{
    public static string? LastErrorMessage { get; set; }
    public static string? LastErrorMigration { get; set; }
}
