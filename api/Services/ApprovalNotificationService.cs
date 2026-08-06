using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

public interface IApprovalNotificationService
{
    /// <summary>Every active user who can actually approve <paramref name="module"/> — role
    /// defaults overlaid with per-user overrides, scoped to the branch the request belongs to
    /// (tenant admins see every branch).</summary>
    Task<List<Guid>> ResolveApproverIdsAsync(string module, Guid? branchId);

    /// <summary>Notifies those approvers that a request is waiting. Best-effort: a notification
    /// failure must never roll back the request it is announcing.</summary>
    Task NotifyPendingAsync(ApprovalRequest request, string module, string title, string message);

    /// <summary>Same "tell whoever can decide this" fan-out as <see cref="NotifyPendingAsync"/>, but
    /// for the maker-checker flows that predate ApprovalRequest and own their own tables (stock
    /// counts, wastage write-offs, leave, warehouse requests, returns, transfers, POs). Best-effort.</summary>
    Task NotifyApproversAsync(
        string module, Guid? branchId, Guid? requestedBy,
        string category, string type, string title, string message,
        string entityType, Guid entityId, string severity = "warning",
        Guid? terminalId = null, Guid? warehouseId = null);

    /// <summary>The return leg: tells whoever raised a request that it was approved or rejected.
    /// Emits the "Manager Approval Granted"/"Manager Approval Rejected" types the bell already
    /// deep-links on, so every flow's decision lands the requester on the right screen.
    /// Skips the requester when they ARE the decider (self-approval) — they already know.
    /// <paramref name="alsoNotifyDecider"/> additionally files the same row against whoever decided,
    /// as a receipt of their own action. Best-effort.</summary>
    Task NotifyRequesterAsync(
        Guid? requestedBy, Guid? decidedBy, bool approved,
        string category, string subject, string? reason,
        string entityType, Guid entityId, Guid? branchId,
        Guid? terminalId = null, Guid? warehouseId = null, bool alsoNotifyDecider = false);
}

// Raising an approval request used to be silent — the row appeared in the Approval Center and
// nowhere else, so a manager only found out by going looking. This resolves who is actually
// entitled to decide a given request and tells them.
public class ApprovalNotificationService(
    BaqalaDbContext db,
    INotificationService notifications,
    ILogger<ApprovalNotificationService> logger) : IApprovalNotificationService
{
    public async Task<List<Guid>> ResolveApproverIdsAsync(string module, Guid? branchId)
    {
        // Role defaults and per-user overrides are both small tables; loaded whole and joined in
        // memory because this MySQL provider can't translate a parameterized Guid[] IN-list (see
        // the ef-mysql-inlist-gotcha memory) and the join keys here are exactly that shape.
        var approvingRoleIds = (await db.RolePermissions
                .Where(p => p.Module == module && p.CanApprove)
                .Select(p => p.RoleId)
                .ToListAsync())
            .ToHashSet();

        var overrides = (await db.UserPermissions
                .Where(p => p.Module == module)
                .Select(p => new { p.UserId, p.CanApprove })
                .ToListAsync())
            .GroupBy(p => p.UserId)
            .ToDictionary(g => g.Key, g => g.Any(x => x.CanApprove));

        var users = await db.Users
            .Where(u => u.Status == "active")
            .Select(u => new { u.Id, u.RoleId, u.BranchId, RoleName = u.Role!.Name })
            .ToListAsync();

        return users
            // A per-user override wins over the role default, exactly as PermissionCheck resolves
            // it at request time — otherwise a user whose override REVOKED approve would still be
            // pinged for every request they can't act on.
            .Where(u => overrides.TryGetValue(u.Id, out var granted)
                ? granted
                : approvingRoleIds.Contains(u.RoleId))
            // Branch-scoped approvers only hear about their own branch; a tenant-wide request (no
            // branch, e.g. a discount rule or a catalog deletion) goes to everyone who can approve it.
            // Admins are tenant-wide whatever their own BranchId says — they are routinely seeded
            // with a home branch, and treating that as a scope silently hid every other branch's
            // requests from the only people guaranteed to hold approval on them. Same carve-out
            // NotificationService.NotifyRoleAsync already makes, matched on either naming of the role.
            .Where(u => !branchId.HasValue || !u.BranchId.HasValue || u.BranchId == branchId
                || u.RoleName == "Admin" || u.RoleName == "Tenant Administrator")
            .Select(u => u.Id)
            .Distinct()
            .ToList();
    }

    // "Ahmed Nasser · Riyadh Branch" — who did it and where. Appended to every approval
    // notification because the bare message ("Return requires approval") left the approver with no
    // idea whose request it was or which location it came from without opening the screen; on the
    // decision leg it tells the requester who actually signed off. Both lookups are single-row and
    // best-effort — a missing name just shortens the line, it never blocks the notification.
    private async Task<string> DescribeContextAsync(Guid? actorId, string actorLabel, Guid? branchId, Guid? warehouseId)
    {
        var parts = new List<string>(2);

        if (actorId is { } id && id != Guid.Empty)
        {
            var name = await db.Users.Where(u => u.Id == id).Select(u => u.FullName).FirstOrDefaultAsync();
            if (!string.IsNullOrWhiteSpace(name)) parts.Add($"{actorLabel} {name}");
        }

        // Branch wins when both are set (a branch-bound request that also names a warehouse is
        // still, to the approver, "the Riyadh request"); a warehouse-only row falls back to the
        // warehouse so tenant-wide flows still say where the stock actually sits.
        var place = branchId is { } bid && bid != Guid.Empty
            ? await db.Branches.Where(b => b.Id == bid).Select(b => b.Name).FirstOrDefaultAsync()
            : warehouseId is { } wid && wid != Guid.Empty
                ? await db.Warehouses.Where(w => w.Id == wid).Select(w => w.Name).FirstOrDefaultAsync()
                : null;
        if (!string.IsNullOrWhiteSpace(place)) parts.Add(place);

        return string.Join(" · ", parts);
    }

    // The bell clamps a message to two lines, so the context rides on the same string rather than
    // in a second paragraph that would be cut off. A sentence-ending period is dropped when
    // something follows it — "was approved. · Approved by Sara" reads like a typo.
    private static string WithContext(string message, string context)
    {
        var body = message.TrimEnd();
        return string.IsNullOrEmpty(context) ? body : $"{body.TrimEnd('.')} · {context}";
    }

    public async Task NotifyPendingAsync(ApprovalRequest request, string module, string title, string message)
    {
        try
        {
            var approverIds = await ResolveApproverIdsAsync(module, request.BranchId);
            // Never ping the requester about their own request — they already know, and it would
            // read as if someone else needed something from them.
            approverIds = [.. approverIds.Where(id => id != request.RequestedBy)];
            if (approverIds.Count == 0) return;

            var context = await DescribeContextAsync(request.RequestedBy, "Requested by", request.BranchId, warehouseId: null);

            await notifications.NotifyUsersAsync(
                approverIds,
                category: "Admin / Security",
                type: "approval_pending",
                title: title,
                message: WithContext(message, context),
                severity: "warning",
                // Points at the ApprovalRequest itself, not the order/product it concerns, so the
                // notification can deep-link to the row that needs deciding.
                entityType: "ApprovalRequest",
                entityId: request.Id,
                branchId: request.BranchId,
                triggeredBy: request.RequestedBy);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to notify approvers for {RequestType} request {RequestId}", request.RequestType, request.Id);
        }
    }

    public async Task NotifyApproversAsync(
        string module, Guid? branchId, Guid? requestedBy,
        string category, string type, string title, string message,
        string entityType, Guid entityId, string severity = "warning",
        Guid? terminalId = null, Guid? warehouseId = null)
    {
        try
        {
            // Resolved from who actually holds Approve on this module, not from a hardcoded
            // ["Manager","Admin"] role-name list — a tenant that grants approval to a custom role
            // (Supervisor, Head Storekeeper) was previously never told a request existed.
            var approverIds = await ResolveApproverIdsAsync(module, branchId);
            approverIds = [.. approverIds.Where(id => id != requestedBy)];
            if (approverIds.Count == 0) return;

            var context = await DescribeContextAsync(requestedBy, "Requested by", branchId, warehouseId);

            await notifications.NotifyUsersAsync(
                approverIds, category, type, title, WithContext(message, context),
                severity: severity,
                entityType: entityType,
                entityId: entityId,
                branchId: branchId,
                terminalId: terminalId,
                triggeredBy: requestedBy);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to notify {Module} approvers for {EntityType} {EntityId}", module, entityType, entityId);
        }
    }

    public async Task NotifyRequesterAsync(
        Guid? requestedBy, Guid? decidedBy, bool approved,
        string category, string subject, string? reason,
        string entityType, Guid entityId, Guid? branchId,
        Guid? terminalId = null, Guid? warehouseId = null, bool alsoNotifyDecider = false)
    {
        try
        {
            var recipients = new HashSet<Guid>();
            // Self-approval is allowed in several of these flows (a manager raising and clearing
            // their own write-off) — telling them what they just did themselves is noise.
            if (requestedBy is { } requester && requester != Guid.Empty && requester != decidedBy)
                recipients.Add(requester);
            if (alsoNotifyDecider && decidedBy is { } decider && decider != Guid.Empty)
                recipients.Add(decider);
            if (recipients.Count == 0) return;

            var context = await DescribeContextAsync(decidedBy, approved ? "Approved by" : "Rejected by", branchId, warehouseId);
            var verdict = approved ? "approved" : "rejected";
            var message = string.IsNullOrWhiteSpace(reason)
                ? $"{subject} was {verdict}."
                : $"{subject} was {verdict} — \"{reason.Trim()}\".";

            await notifications.NotifyUsersAsync(
                recipients,
                category,
                // Reuses the type the bell already routes on (see routeForNotification in
                // app-topbar) so every flow's decision is clickable straight to its own screen.
                type: approved ? "Manager Approval Granted" : "Manager Approval Rejected",
                title: approved ? "Manager Approval Granted" : "Manager Approval Rejected",
                message: WithContext(message, context),
                severity: approved ? "info" : "warning",
                entityType: entityType,
                entityId: entityId,
                branchId: branchId,
                terminalId: terminalId,
                triggeredBy: decidedBy);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to notify requester of the decision on {EntityType} {EntityId}", entityType, entityId);
        }
    }
}
