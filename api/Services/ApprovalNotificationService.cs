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
            .Select(u => new { u.Id, u.RoleId, u.BranchId })
            .ToListAsync();

        return users
            // A per-user override wins over the role default, exactly as PermissionCheck resolves
            // it at request time — otherwise a user whose override REVOKED approve would still be
            // pinged for every request they can't act on.
            .Where(u => overrides.TryGetValue(u.Id, out var granted)
                ? granted
                : approvingRoleIds.Contains(u.RoleId))
            // Branch-scoped approvers only hear about their own branch; a user with no branch
            // (tenant admin) hears about everything, and a tenant-wide request (no branch, e.g. a
            // discount rule or a catalog deletion) goes to everyone who can approve it.
            .Where(u => !branchId.HasValue || !u.BranchId.HasValue || u.BranchId == branchId)
            .Select(u => u.Id)
            .Distinct()
            .ToList();
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

            await notifications.NotifyUsersAsync(
                approverIds,
                category: "Admin / Security",
                type: "approval_pending",
                title: title,
                message: message,
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
}
