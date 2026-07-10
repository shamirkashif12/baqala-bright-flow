using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace BaqalaPOS.Api.Authorization;

public enum PermAction { View, Create, Edit, Delete, Approve, Export }

// Shared by RequirePermissionAttribute (route-level gate) and any controller that needs to
// resolve the same Module/Action matrix inline — e.g. to decide whether to mask a field in a
// response rather than block the whole endpoint (see ReportsController margin/cost masking).
public static class PermissionCheck
{
    public static async Task<bool> HasPermissionAsync(ClaimsPrincipal user, BaqalaDbContext db, string module, PermAction action)
    {
        if (user.Identity?.IsAuthenticated != true) return false;

        // tenant_admin's access is governed by the same RolePermissions matrix as every other
        // role below — no bypass. (Previously always returned true here; removed at the tenant's
        // request, who accepted that misconfiguring the Admin role's own Roles/Users permissions
        // can strand the tenant with no one able to grant permissions back.)
        if (!Guid.TryParse(user.FindFirst("roleId")?.Value, out var roleId)) return false;

        var userIdClaim = user.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? user.FindFirst("sub")?.Value;
        Guid.TryParse(userIdClaim, out var userId);
        return await HasPermissionForUserAsync(db, userId, roleId, module, action);
    }

    // Shared by HasPermissionAsync (resolves userId/roleId from the calling ClaimsPrincipal) and
    // the Approval Workflow's verify-approver endpoint, which checks a DIFFERENT user's (the
    // approver's) permission — one who isn't the currently authenticated caller, so there's no
    // ClaimsPrincipal for them to read claims from.
    public static async Task<bool> HasPermissionForUserAsync(BaqalaDbContext db, Guid userId, Guid roleId, string module, PermAction action)
    {
        // Per-user override takes precedence over the role default for the same module.
        IPermissionFlags? perm = userId != Guid.Empty
            ? await db.UserPermissions.AsNoTracking()
                .FirstOrDefaultAsync(p => p.UserId == userId && p.Module == module)
            : null;

        perm ??= await db.RolePermissions.AsNoTracking()
            .FirstOrDefaultAsync(p => p.RoleId == roleId && p.Module == module);

        return perm is not null && action switch
        {
            PermAction.View     => perm.CanView,
            PermAction.Create   => perm.CanCreate,
            PermAction.Edit     => perm.CanEdit,
            PermAction.Delete   => perm.CanDelete,
            PermAction.Approve  => perm.CanApprove,
            PermAction.Export   => perm.CanExport,
            _ => false,
        };
    }
}

// Server-side enforcement of the same Module/Action permission matrix the frontend
// already reads via usePermission() (src/lib/use-permission.ts) — until now that matrix
// was only used to hide/show UI, so any authenticated caller could hit the API directly
// and bypass it entirely. No role bypass, including tenant_admin — see the comment in
// PermissionCheck.HasPermissionAsync above.
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class, AllowMultiple = true)]
public class RequirePermissionAttribute(string module, PermAction action) : Attribute, IAsyncAuthorizationFilter
{
    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var user = context.HttpContext.User;
        if (user.Identity?.IsAuthenticated != true)
        {
            context.Result = new Microsoft.AspNetCore.Mvc.UnauthorizedResult();
            return;
        }

        var db = context.HttpContext.RequestServices.GetRequiredService<BaqalaDbContext>();
        var allowed = await PermissionCheck.HasPermissionAsync(user, db, module, action);

        if (!allowed)
        {
            context.Result = new Microsoft.AspNetCore.Mvc.ObjectResult(
                new { message = $"You do not have permission to {action.ToString().ToLower()} {module}." })
            { StatusCode = 403 };

            var userIdClaim = user.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? user.FindFirst("sub")?.Value;
            if (Guid.TryParse(userIdClaim, out var userId))
            {
                var branchId = Guid.TryParse(user.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null;
                var notifications = context.HttpContext.RequestServices.GetRequiredService<INotificationService>();
                await notifications.NotifyUserAsync(userId,
                    "Admin / Security", "Unauthorized Action Attempt", "Unauthorized Action Attempt",
                    $"You do not have permission for this action ({action.ToString().ToLower()} {module})",
                    severity: "warning", branchId: branchId);
            }
        }
    }
}
