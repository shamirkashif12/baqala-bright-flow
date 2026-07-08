using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
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

        var role = user.FindFirst("role")?.Value;
        if (role == "tenant_admin") return true;

        if (!Guid.TryParse(user.FindFirst("roleId")?.Value, out var roleId)) return false;

        // Per-user override takes precedence over the role default for the same module.
        var userIdClaim = user.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? user.FindFirst("sub")?.Value;
        IPermissionFlags? perm = Guid.TryParse(userIdClaim, out var userId)
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
// and bypass it entirely. tenant_admin always bypasses, matching usePermission()'s rule.
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
        }
    }
}
