using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc.Filters;

namespace BaqalaPOS.Api.Authorization;

// Verifies the Tenant Admin Dashboard's `X-Signature` header on the two real inbound webhook
// endpoints (POST /pos/users/provision, /pos/entitlements/update) — hex HMAC-SHA256 of the raw
// request body, using a secret shared out-of-band with the Dashboard (config
// TenantGateway:WebhookSharedSecret).
//
// Must be an IAsyncResourceFilter, NOT an IAsyncActionFilter: ASP.NET Core's MVC pipeline runs
// model binding BEFORE action filters (Authorization → Resource filters → model binding →
// Action filters → action method). An action filter would see the body stream already consumed
// by [FromBody] deserialization by the time it tried to read it — resource filters wrap model
// binding too, so this is the only filter stage where the RAW bytes are still available.
public class RequireGatewaySignatureAttribute : Attribute, IAsyncResourceFilter
{
    public async Task OnResourceExecutionAsync(ResourceExecutingContext context, ResourceExecutionDelegate next)
    {
        var config = context.HttpContext.RequestServices.GetRequiredService<IConfiguration>();
        var secret = config["TenantGateway:WebhookSharedSecret"];
        var signature = context.HttpContext.Request.Headers["X-Signature"].ToString();

        if (string.IsNullOrEmpty(secret) || string.IsNullOrEmpty(signature))
        {
            context.Result = new Microsoft.AspNetCore.Mvc.UnauthorizedObjectResult(
                new { message = "Missing X-Signature header or server signing secret not configured." });
            return;
        }

        // EnableBuffering lets the body stream be read here AND still be read again by MVC's
        // model binder afterward (which runs later in this same pipeline, inside next()).
        context.HttpContext.Request.EnableBuffering();
        context.HttpContext.Request.Body.Position = 0;
        using var reader = new StreamReader(context.HttpContext.Request.Body, Encoding.UTF8, leaveOpen: true);
        var rawBody = await reader.ReadToEndAsync();
        context.HttpContext.Request.Body.Position = 0;

        var expected = Convert.ToHexString(
            HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(rawBody))).ToLowerInvariant();

        if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(signature.ToLowerInvariant())))
        {
            context.Result = new Microsoft.AspNetCore.Mvc.UnauthorizedObjectResult(
                new { message = "Invalid signature." });
            return;
        }

        await next();
    }
}
