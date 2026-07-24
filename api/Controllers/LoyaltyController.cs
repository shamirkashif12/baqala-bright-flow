using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/loyalty")]
public class LoyaltyController(BaqalaDbContext db, IAuditService audit) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : null;

    private async Task<Guid?> ResolveEmployeeIdAsync(Guid? userId) =>
        userId.HasValue ? await db.Employees.Where(e => e.UserId == userId).Select(e => (Guid?)e.Id).FirstOrDefaultAsync() : null;

    // ── Admin config CRUD ──────────────────────────────────────────────────

    [RequirePermission("Loyalty Program", PermAction.View)]
    [HttpGet("programs")]
    public async Task<IActionResult> GetPrograms([FromQuery] Guid? branchId)
    {
        var query = db.LoyaltyPrograms.AsQueryable();
        if (branchId.HasValue) query = query.Where(p => p.BranchId == branchId.Value);
        return Ok(await query.OrderBy(p => p.BranchId == null ? 0 : 1).ThenBy(p => p.ProgramName).ToListAsync());
    }

    [RequirePermission("Loyalty Program", PermAction.View)]
    [HttpGet("programs/{id:guid}")]
    public async Task<IActionResult> GetProgram(Guid id)
    {
        var program = await db.LoyaltyPrograms.FindAsync(id);
        return program is null ? NotFound() : Ok(program);
    }

    // Cashier-visible (View-only, see DataSeeder's "Loyalty Program" row) so the POS redeem
    // control can read the active rate/min/max without any admin CRUD access.
    [RequirePermission("Loyalty Program", PermAction.View)]
    [HttpGet("programs/effective/{branchId:guid}")]
    public async Task<IActionResult> GetEffectiveProgram(Guid branchId)
    {
        var program = await ResolveEffectiveAsync(branchId);
        return program is null ? NotFound() : Ok(program);
    }

    [RequirePermission("Loyalty Program", PermAction.Create)]
    [HttpPost("programs")]
    public async Task<IActionResult> CreateProgram([FromBody] LoyaltyProgram program)
    {
        var error = ValidateProgram(program);
        if (error is not null) return BadRequest(new { message = error });

        if (await db.LoyaltyPrograms.AnyAsync(p => p.BranchId == program.BranchId))
        {
            return Conflict(new
            {
                message = program.BranchId is null
                    ? "A default loyalty program already exists."
                    : "This branch already has a loyalty program configured — edit it instead."
            });
        }

        program.Id = Guid.NewGuid();
        program.CreatedAt = program.UpdatedAt = DateTime.UtcNow;
        db.LoyaltyPrograms.Add(program);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetProgram), new { id = program.Id }, program);
    }

    [RequirePermission("Loyalty Program", PermAction.Edit)]
    [HttpPut("programs/{id:guid}")]
    public async Task<IActionResult> UpdateProgram(Guid id, [FromBody] LoyaltyProgram updated)
    {
        var program = await db.LoyaltyPrograms.FindAsync(id);
        if (program is null) return NotFound();

        var error = ValidateProgram(updated);
        if (error is not null) return BadRequest(new { message = error });

        program.ProgramName = updated.ProgramName;
        program.Description = updated.Description;
        program.LogoUrl = updated.LogoUrl;
        program.BrandColor = updated.BrandColor;
        program.PointsPerCurrencyUnit = updated.PointsPerCurrencyUnit;
        program.RedemptionValuePerPoint = updated.RedemptionValuePerPoint;
        program.MinPointsToRedeem = updated.MinPointsToRedeem;
        program.MaxRedeemPctOfOrder = updated.MaxRedeemPctOfOrder;
        program.PointsExpiryDays = updated.PointsExpiryDays;
        program.SilverThreshold = updated.SilverThreshold;
        program.GoldThreshold = updated.GoldThreshold;
        program.PlatinumThreshold = updated.PlatinumThreshold;
        program.SilverEarnMultiplier = updated.SilverEarnMultiplier;
        program.GoldEarnMultiplier = updated.GoldEarnMultiplier;
        program.PlatinumEarnMultiplier = updated.PlatinumEarnMultiplier;
        program.IsActive = updated.IsActive;
        program.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(program);
    }

    [RequirePermission("Loyalty Program", PermAction.Delete)]
    [HttpDelete("programs/{id:guid}")]
    public async Task<IActionResult> DeleteProgram(Guid id)
    {
        var program = await db.LoyaltyPrograms.FindAsync(id);
        if (program is null) return NotFound();
        if (program.BranchId is null)
            return BadRequest(new { message = "The default loyalty program cannot be deleted." });

        db.LoyaltyPrograms.Remove(program);
        await db.SaveChangesAsync();

        var callerId = CallerId();
        await audit.LogAsync(action: "Loyalty program deleted", entityType: "LoyaltyProgram", entityId: program.Id,
            userId: callerId, employeeId: await ResolveEmployeeIdAsync(callerId),
            branchId: program.BranchId, severity: "warning", beforeValue: program.ProgramName, module: "Loyalty Program");

        return NoContent();
    }

    private static string? ValidateProgram(LoyaltyProgram program)
    {
        if (string.IsNullOrWhiteSpace(program.ProgramName)) return "Program name is required.";
        if (program.PointsPerCurrencyUnit < 0) return "Points per currency unit cannot be negative.";
        if (program.RedemptionValuePerPoint < 0) return "Redemption value per point cannot be negative.";
        if (program.MinPointsToRedeem < 0) return "Minimum points to redeem cannot be negative.";
        if (program.MaxRedeemPctOfOrder is < 0 or > 100) return "Max redeemable % of order must be between 0 and 100.";
        if (program.PointsExpiryDays is <= 0) return "Points expiry days must be positive, or left empty for no expiry.";
        if (!(program.SilverThreshold < program.GoldThreshold && program.GoldThreshold < program.PlatinumThreshold))
            return "Tier thresholds must strictly increase: Silver < Gold < Platinum.";
        return null;
    }

    private async Task<LoyaltyProgram?> ResolveEffectiveAsync(Guid branchId) =>
        await db.LoyaltyPrograms.FirstOrDefaultAsync(p => p.BranchId == branchId && p.IsActive)
        ?? await db.LoyaltyPrograms.FirstOrDefaultAsync(p => p.BranchId == null && p.IsActive);

    // ── Public, unauthenticated: the branded loyalty landing page ─────────
    // First genuinely public, customer-facing lookup in this codebase (every other
    // [AllowAnonymous] endpoint is device pairing, not customer data) — kept deliberately
    // minimal: no phone/email/customerCode ever echoed back, no way to enumerate customers.

    [AllowAnonymous]
    [HttpGet("public/{branchId:guid}")]
    public async Task<IActionResult> GetPublicProgram(Guid branchId)
    {
        var branch = await db.Branches.FindAsync(branchId);
        if (branch is null || branch.Status != "active") return NotFound();

        var program = await ResolveEffectiveAsync(branchId);
        if (program is null) return NotFound();

        return Ok(new
        {
            branchName = branch.Name,
            programName = program.ProgramName,
            description = program.Description,
            logoUrl = program.LogoUrl,
            brandColor = program.BrandColor,
            pointsPerCurrencyUnit = program.PointsPerCurrencyUnit,
            redemptionValuePerPoint = program.RedemptionValuePerPoint,
            minPointsToRedeem = program.MinPointsToRedeem,
        });
    }

    [AllowAnonymous]
    [HttpGet("public/{branchId:guid}/lookup")]
    public async Task<IActionResult> PublicLookup(Guid branchId, [FromQuery] string phone)
    {
        var digits = new string((phone ?? "").Where(char.IsDigit).ToArray());
        if (digits.Length < 8) return BadRequest(new { message = "Enter a valid phone number." });

        var branch = await db.Branches.FindAsync(branchId);
        if (branch is null || branch.Status != "active") return NotFound();

        // No active program for this branch (override inactive/missing AND the default also
        // inactive) means loyalty is genuinely off here — the public page has nothing to show,
        // same as GetPublicProgram above. Without this, a customer could still look up their
        // balance on a branch where the program was explicitly turned off.
        if (await ResolveEffectiveAsync(branchId) is null) return NotFound();

        var customer = await db.Customers.FirstOrDefaultAsync(c =>
            c.Phone == phone || c.Phone.Contains(digits) || digits.Contains(c.Phone));
        if (customer is null) return NotFound(new { message = "No loyalty account found for that phone number." });

        var history = await db.LoyaltyTransactions
            .Where(t => t.CustomerId == customer.Id && (t.BranchId == branchId || t.BranchId == null))
            .OrderByDescending(t => t.CreatedAt)
            .Take(10)
            .Select(t => new
            {
                t.TransactionType,
                t.Points,
                t.MonetaryValue,
                t.CreatedAt,
                t.Description,
            })
            .ToListAsync();

        return Ok(new
        {
            fullName = customer.FullName,
            tier = customer.Tier,
            loyaltyBalance = customer.LoyaltyBalance,
            recentHistory = history,
        });
    }
}
