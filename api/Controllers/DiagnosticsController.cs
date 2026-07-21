using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

// Temporary: reports the live database's actual migration state (applied/pending/last startup
// error) so this can be diagnosed without SSH or DB-client access to the production server.
// Remove once the migration pipeline is confirmed stable.
[ApiController]
[Route("api/diagnostics")]
public class DiagnosticsController(BaqalaDbContext db) : ControllerBase
{
    [HttpGet("migrations")]
    public async Task<IActionResult> GetMigrationStatus()
    {
        if (User.FindFirst("role")?.Value != "tenant_admin") return Forbid();

        var applied = await db.Database.GetAppliedMigrationsAsync();
        var pending = await db.Database.GetPendingMigrationsAsync();

        return Ok(new
        {
            applied,
            pending,
            lastStartupError = new
            {
                migration = MigrationStartupStatus.LastErrorMigration,
                message = MigrationStartupStatus.LastErrorMessage,
            },
        });
    }

    [HttpGet("errors")]
    public IActionResult GetRecentErrors()
    {
        if (User.FindFirst("role")?.Value != "tenant_admin") return Forbid();
        return Ok(RecentErrors.All());
    }

    [HttpGet("errors/{referenceId}")]
    public IActionResult GetError(string referenceId)
    {
        if (User.FindFirst("role")?.Value != "tenant_admin") return Forbid();
        var entry = RecentErrors.Find(referenceId);
        return entry is null ? NotFound() : Ok(entry);
    }
}
