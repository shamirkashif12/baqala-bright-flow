using BaqalaPOS.Api.Authorization;
using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TerminalsController(BaqalaDbContext db, INotificationService notifications, IAuditService audit) : ControllerBase
{
    // Branch-scoped roles (anything but tenant_admin) may only see their own branch's terminals —
    // same fix as DevicesController/OrdersController: branchId was only an optional query param.
    private (string? Role, Guid? BranchId) GetCallerContext()
    {
        var role = User.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
        return (role, branchId);
    }

    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value ?? User.FindFirst("sub")?.Value, out var id) ? id : null;

    private async Task<Guid?> ResolveEmployeeIdAsync(Guid? userId) =>
        userId.HasValue ? await db.Employees.Where(e => e.UserId == userId).Select(e => (Guid?)e.Id).FirstOrDefaultAsync() : null;

    [HttpGet]
    public async Task<IActionResult> GetAll([FromQuery] Guid[]? branchId, [FromQuery] string[]? status)
    {
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue) branchId = [callerBranchId.Value];

        var query = db.Terminals.Include(t => t.Branch).Include(t => t.AssignedCashier).Include(t => t.Devices).AsQueryable();

        // AssignedCashier was serialized whole (email, username, phone, status, last login) with
        // no permission gate at all; the frontend Terminal type (src/lib/api.ts) only ever reads
        // id+fullName off it, matching the shape below.
        var terminals = await query.Select(t => new
        {
            t.Id, t.TerminalCode, t.Name, t.BranchId, t.AssignedCashierId, t.Status, t.LastSync,
            t.UptimeMinutes, t.PairingSecretSetAt,
            Branch = t.Branch == null ? null : new { t.Branch.Id, t.Branch.Name },
            AssignedCashier = t.AssignedCashier == null ? null : new { t.AssignedCashier.Id, t.AssignedCashier.FullName },
        }).ToListAsync();

        // branchId/status are arrays (multi-select filters) — never `.Contains()` a Guid[]/string[]
        // directly against a DbSet-backed IQueryable on this repo's MySQL provider (see the
        // ef-mysql-inlist-gotcha memory: throws at execution time on 2+ values despite compiling
        // and passing a single-value smoke test). Applied in-memory below, after materializing.
        var scoped = terminals.AsEnumerable();
        if (branchId is { Length: > 0 }) scoped = scoped.Where(t => branchId.Contains(t.BranchId));
        if (status is { Length: > 0 }) scoped = scoped.Where(t => status.Contains(t.Status));
        return Ok(scoped.ToList());
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id)
    {
        var terminal = await db.Terminals.Include(t => t.Devices).FirstOrDefaultAsync(t => t.Id == id);
        if (terminal is null) return NotFound();

        // Branch-scoped roles may only look up their own branch's terminal — mirrors GetAll,
        // which this direct-by-id lookup previously bypassed entirely.
        var (callerRole, callerBranchId) = GetCallerContext();
        if (callerRole is not null && callerRole != "tenant_admin" && callerBranchId.HasValue && terminal.BranchId != callerBranchId)
            return NotFound();

        return Ok(terminal);
    }

    [RequirePermission("Terminals", PermAction.Create)]
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] Terminal terminal)
    {
        terminal.Id = Guid.NewGuid();
        terminal.CreatedAt = terminal.UpdatedAt = DateTime.UtcNow;
        db.Terminals.Add(terminal);
        await db.SaveChangesAsync();
        return CreatedAtAction(nameof(GetById), new { id = terminal.Id }, terminal);
    }

    [RequirePermission("Terminals", PermAction.Edit)]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(Guid id, [FromBody] Terminal updated)
    {
        var terminal = await db.Terminals.FindAsync(id);
        if (terminal is null) return NotFound();
        terminal.Name = updated.Name;
        terminal.BranchId = updated.BranchId;
        terminal.AssignedCashierId = updated.AssignedCashierId;
        terminal.Status = updated.Status;
        terminal.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Ok(terminal);
    }

    [RequirePermission("Terminals", PermAction.Edit)]
    [HttpPatch("{id:guid}/status")]
    public async Task<IActionResult> UpdateStatus(Guid id, [FromBody] UpdateStatusRequest req)
    {
        var terminal = await db.Terminals.FindAsync(id);
        if (terminal is null) return NotFound();
        var prevStatus = terminal.Status;
        terminal.Status = req.Status;
        terminal.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        if (req.Status == "offline" && prevStatus != "offline")
        {
            await notifications.NotifyRoleAsync(["Manager", "Admin"], terminal.BranchId,
                "Terminal / Branch", "Terminal Offline", "Terminal Offline",
                $"Terminal {terminal.Name} is offline",
                severity: "error", entityType: "Terminal", entityId: terminal.Id);
        }

        return Ok(terminal);
    }

    // Generates a one-time-display pairing secret for a self-checkout kiosk. Staff types this
    // (plus the terminal's code) into the kiosk during setup; only its hash is stored here, so
    // it can never be recovered afterwards — only rotated by calling this again.
    [RequirePermission("Terminals", PermAction.Edit)]
    [HttpPost("{id:guid}/kiosk-pairing-code")]
    public async Task<IActionResult> GenerateKioskPairingCode(Guid id)
    {
        var terminal = await db.Terminals.FindAsync(id);
        if (terminal is null) return NotFound();
        if (string.IsNullOrWhiteSpace(terminal.TerminalCode))
            return BadRequest(new { message = "Terminal must have a terminal code before it can be paired as a self-checkout kiosk." });

        var secret = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(16));
        terminal.PairingSecretHash = HashSecret(secret);
        terminal.PairingSecretSetAt = DateTime.UtcNow;
        terminal.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Ok(new { terminalCode = terminal.TerminalCode, pairingSecret = secret });
    }

    // Sets/changes the PIN a self-checkout kiosk demands before entering OR exiting its
    // fullscreen lockdown. Same one-time-set, hash-only storage as the pairing secret above —
    // there's no "view current PIN" endpoint, only replace. A terminal with no PIN configured
    // simply has the lockdown feature unavailable on its kiosk.
    [RequirePermission("Terminals", PermAction.Edit)]
    [HttpPost("{id:guid}/kiosk-lockdown-pin")]
    public async Task<IActionResult> SetKioskLockdownPin(Guid id, [FromBody] SetLockdownPinRequest req)
    {
        var terminal = await db.Terminals.FindAsync(id);
        if (terminal is null) return NotFound();
        if (string.IsNullOrEmpty(req.Pin) || req.Pin.Length < 4 || req.Pin.Length > 6 || !req.Pin.All(char.IsDigit))
            return BadRequest(new { message = "PIN must be 4-6 digits." });

        terminal.KioskLockdownPinHash = HashSecret(req.Pin);
        terminal.KioskLockdownPinSetAt = DateTime.UtcNow;
        terminal.KioskLockdownPinLength = req.Pin.Length;
        terminal.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        return Ok(new { setAt = terminal.KioskLockdownPinSetAt, length = terminal.KioskLockdownPinLength });
    }

    // Removes the lockdown PIN — disables the fullscreen-lockdown feature on this kiosk
    // entirely (rather than leaving a guessable/forgotten PIN in place).
    [RequirePermission("Terminals", PermAction.Edit)]
    [HttpDelete("{id:guid}/kiosk-lockdown-pin")]
    public async Task<IActionResult> ClearKioskLockdownPin(Guid id)
    {
        var terminal = await db.Terminals.FindAsync(id);
        if (terminal is null) return NotFound();

        terminal.KioskLockdownPinHash = null;
        terminal.KioskLockdownPinSetAt = null;
        terminal.KioskLockdownPinLength = null;
        terminal.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        var callerId = CallerId();
        await audit.LogAsync(action: "Kiosk lockdown PIN cleared", entityType: "Terminal", entityId: terminal.Id,
            userId: callerId, employeeId: await ResolveEmployeeIdAsync(callerId),
            branchId: terminal.BranchId, severity: "warning", beforeValue: terminal.Name, module: "Terminals");

        return NoContent();
    }

    private static string HashSecret(string plain) =>
        Convert.ToBase64String(System.Security.Cryptography.SHA256.HashData(
            System.Text.Encoding.UTF8.GetBytes(plain + "baqala_salt")));
}

public record SetLockdownPinRequest(string Pin);
