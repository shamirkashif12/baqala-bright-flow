using BaqalaPOS.Api.Data;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Authorization;

public enum PermAction { View, Create, Edit, Delete, Approve, Export }

// Server-side enforcement of the same Module/Action permission matrix the frontend
// already reads via usePermission() (src/lib/use-permission.ts) — until now that matrix
// was only used to hide/show UI, so any authenticated caller could hit the API directly
// and bypass it entirely. tenant_admin always bypasses, matching usePermission()'s rule.
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

        var role = user.FindFirst("role")?.Value;
        if (role == "tenant_admin") return;

        if (!Guid.TryParse(user.FindFirst("roleId")?.Value, out var roleId))
        {
            context.Result = new Microsoft.AspNetCore.Mvc.ForbidResult();
            return;
        }

        var db = context.HttpContext.RequestServices.GetRequiredService<BaqalaDbContext>();
        var perm = await db.RolePermissions.AsNoTracking()
            .FirstOrDefaultAsync(p => p.RoleId == roleId && p.Module == module);

        var allowed = perm is not null && action switch
        {
            PermAction.View     => perm.CanView,
            PermAction.Create   => perm.CanCreate,
            PermAction.Edit     => perm.CanEdit,
            PermAction.Delete   => perm.CanDelete,
            PermAction.Approve  => perm.CanApprove,
            PermAction.Export   => perm.CanExport,
            _ => false,
        };

        if (!allowed)
        {
            context.Result = new Microsoft.AspNetCore.Mvc.ObjectResult(
                new { message = $"You do not have permission to {action.ToString().ToLower()} {module}." })
            { StatusCode = 403 };
        }
    }
}
