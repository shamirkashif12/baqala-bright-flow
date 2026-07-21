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

    // Temporary: the HRM backfill/demo-data patches in DataSeeder only ever ran under
    // IsDevelopment(). This lets an admin trigger them once on live via an authenticated call
    // instead of flipping ASPNETCORE_ENVIRONMENT (which would also re-run the full dev seed
    // block). Every patch method is idempotent, so calling this more than once is a no-op after
    // the first successful run. Remove once live HRM data is confirmed seeded.
    [HttpPost("seed-hrm")]
    public async Task<IActionResult> SeedHrm([FromServices] BaqalaDbContext dbContext)
    {
        if (User.FindFirst("role")?.Value != "tenant_admin") return Forbid();

        await DataSeeder.PatchBackfillEmployeesFromUsersAsync(dbContext);
        await DataSeeder.PatchSeedHrmOrgDataAsync(dbContext);
        await DataSeeder.PatchSeedHrmEmployeeContractDefaultsAsync(dbContext);
        await DataSeeder.PatchSeedHrmHolidaysAsync(dbContext);
        await DataSeeder.PatchSeedHrmShiftsAsync(dbContext);
        await DataSeeder.PatchSeedHrmAttendanceAsync(dbContext);
        await DataSeeder.PatchSeedHrmLeaveDataAsync(dbContext);
        await DataSeeder.PatchSeedHrmPayrollDataAsync(dbContext);

        return Ok(new { message = "HRM seed patches completed." });
    }
}
