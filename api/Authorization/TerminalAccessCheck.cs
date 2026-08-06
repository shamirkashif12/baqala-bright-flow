using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace BaqalaPOS.Api.Authorization;

// Shared by CustomerDisplayHub (JoinTerminal/PushCartSnapshot) and TerminalsController's
// pairable-terminals list, so the register picker can never offer a terminal the hub's own
// join check would then reject — both call the exact same logic instead of two hand-written
// copies drifting apart.
public static class TerminalAccessCheck
{
    // Layer 2 (§5): the caller must be able to view either the POS checkout page or the
    // Customer Display page itself — this is what lets a cashier who was never explicitly
    // granted the Customer Display permission still push snapshots from their own till.
    public static async Task<bool> HasPagePermissionAsync(ClaimsPrincipal user, BaqalaDbContext db)
    {
        if (user.Identity?.IsAuthenticated != true) return false;
        return await PermissionCheck.HasPermissionAsync(user, db, "POS", PermAction.View)
            || await PermissionCheck.HasPermissionAsync(user, db, "Customer Display", PermAction.View);
    }

    // "Currently assigned/operated by" (§5) has to mean whoever has the terminal's open shift
    // right now, not just Terminal.AssignedCashierId — that field is a static, admin-set default
    // (only ever written from the Terminals admin page) that's never updated on check-in/out, so a
    // cashier actually working a terminal today can easily differ from it. Falls back to the static
    // field only when nobody is currently checked in there, which still lets a terminal reserved
    // for someone (via that field) be paired by them before their shift opens, per the picker's own
    // "unassigned or already assigned to them" rule.
    public static async Task<Dictionary<Guid, Guid?>> ResolveOperatorsByTerminalAsync(BaqalaDbContext db, IEnumerable<Guid> terminalIds)
    {
        // Never `.Where(x => ids.Contains(x.Id))` against a DbSet-backed IQueryable on this app's
        // MySQL provider — it throws at execution time on 2+ values despite compiling fine. Filter
        // in-memory after materializing instead (open shifts overall is a small table).
        var ids = terminalIds.ToHashSet();
        var openShifts = await db.CashierShifts.AsNoTracking()
            .Where(s => s.Status == "open" && s.TerminalId != null)
            .Select(s => new { s.TerminalId, s.CashierId, s.OpenedAt })
            .ToListAsync();

        return openShifts
            .Where(s => ids.Contains(s.TerminalId!.Value))
            .GroupBy(s => s.TerminalId!.Value)
            .ToDictionary(g => g.Key, g => (Guid?)g.OrderByDescending(s => s.OpenedAt).First().CashierId);
    }

    // Layer 3, terminal-specific part of §5 (branch + assignment scoping), given an
    // already-loaded terminal and its resolved current operator (see ResolveOperatorsByTerminalAsync).
    // Kept synchronous/sans-db so TerminalsController's pairable list can run it in a loop over
    // terminals/operators it already fetched, without a query per terminal.
    public static bool CanAccessTerminal(ClaimsPrincipal user, Terminal terminal, Guid? operatorId, Guid callerId, bool canOverrideAssignment)
    {
        var role = user.FindFirst("role")?.Value;
        var branchId = Guid.TryParse(user.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;

        // Branch scoping: only an unscoped/HQ-level role (tenant_admin, same convention as
        // every other controller's GetCallerContext) may reach a terminal outside its own branch.
        if (role != "tenant_admin" && branchId.HasValue && terminal.BranchId != branchId)
            return false;

        // Assignment scoping: a terminal currently operated by someone else is off-limits unless
        // the caller holds the "can void transactions" / supervisor+ override — mirrors
        // OrdersController.VoidOrder's own self-approve check (Orders:Approve), the existing
        // supervisor-tier signal in this codebase.
        if (operatorId.HasValue && operatorId != callerId && !canOverrideAssignment)
            return false;

        return true;
    }

    // Full layer-3 check for a single terminal by id — used by the hub, which only ever needs
    // to authorize one terminal per call.
    public static async Task<bool> CanJoinTerminalAsync(ClaimsPrincipal user, BaqalaDbContext db, Guid terminalId)
    {
        if (!await HasPagePermissionAsync(user, db)) return false;

        var userIdClaim = user.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? user.FindFirst("sub")?.Value;
        if (!Guid.TryParse(userIdClaim, out var callerId)) return false;

        var terminal = await db.Terminals.AsNoTracking().FirstOrDefaultAsync(t => t.Id == terminalId);
        if (terminal is null) return false;

        var operators = await ResolveOperatorsByTerminalAsync(db, [terminalId]);
        var operatorId = operators.GetValueOrDefault(terminalId, terminal.AssignedCashierId);

        var canOverride = await PermissionCheck.HasPermissionAsync(user, db, "Orders", PermAction.Approve);
        return CanAccessTerminal(user, terminal, operatorId, callerId, canOverride);
    }
}
