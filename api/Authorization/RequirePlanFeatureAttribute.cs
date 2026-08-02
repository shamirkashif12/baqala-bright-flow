using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc.Filters;

namespace BaqalaPOS.Api.Authorization;

// Gates an endpoint behind the tenant's provisioned plan tier — an independent dimension from
// RequirePermissionAttribute's DB-driven role/user permission matrix. A caller can have full
// "Stocks" module permission and still be denied here if their plan doesn't include stocktaking;
// the two filters stack (either can deny) rather than one subsuming the other. Fails open (never
// denies) when unprovisioned or when this key is absent from the plan's FeaturesJson — see
// ITenantPlanService.IsFeatureEnabledAsync.
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class, AllowMultiple = true)]
public class RequirePlanFeatureAttribute(string featureKey) : Attribute, IAsyncAuthorizationFilter
{
    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var tenantPlans = context.HttpContext.RequestServices.GetRequiredService<ITenantPlanService>();
        if (!await tenantPlans.IsFeatureEnabledAsync(featureKey))
        {
            context.Result = new Microsoft.AspNetCore.Mvc.ObjectResult(
                new { message = "This feature requires a higher plan tier. Upgrade to unlock it." })
            { StatusCode = 403 };
        }
    }
}
