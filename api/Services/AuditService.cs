using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.AspNetCore.Http;

namespace BaqalaPOS.Api.Services;

public interface IAuditService
{
    Task LogAsync(
        string action,
        string? entityType = null,
        Guid? entityId = null,
        Guid? userId = null,
        Guid? branchId = null,
        string? details = null,
        string severity = "info",
        string? beforeValue = null,
        string? notes = null,
        // HRM Employee Activity Report additions — the HR-facing "module" label (e.g.
        // "Employees", "HR Attendance") and the employee the activity concerns, which is often
        // NOT the same as userId (e.g. an admin editing employee X's record: userId = admin,
        // employeeId = X). Both optional/nullable so every existing POS call site (which predates
        // these) keeps compiling unchanged.
        string? module = null,
        Guid? employeeId = null);
}

public class AuditService(BaqalaDbContext db, IHttpContextAccessor httpContextAccessor) : IAuditService
{
    public async Task LogAsync(
        string action,
        string? entityType = null,
        Guid? entityId = null,
        Guid? userId = null,
        Guid? branchId = null,
        string? details = null,
        string severity = "info",
        string? beforeValue = null,
        string? notes = null,
        string? module = null,
        Guid? employeeId = null)
    {
        // The FRD's Audit Trail "IP Address" column was always blank — nothing ever captured
        // it. The caller's HttpContext is available here (this runs inside a request), so read
        // it once at the point of logging rather than threading it through every call site.
        // Prefer X-Forwarded-For when present — behind a reverse proxy/load balancer,
        // Connection.RemoteIpAddress is the proxy's own address, not the real client's, so
        // relying on it alone silently shows the proxy IP (or null, for some proxy/named-pipe
        // setups) for every single row.
        var httpContext = httpContextAccessor.HttpContext;
        var forwardedFor = httpContext?.Request.Headers["X-Forwarded-For"].ToString();
        var ipAddress = !string.IsNullOrWhiteSpace(forwardedFor)
            ? forwardedFor.Split(',')[0].Trim()
            : httpContext?.Connection.RemoteIpAddress?.ToString();
        db.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            UserId = userId,
            BranchId = branchId,
            OldValues = beforeValue,
            NewValues = details,
            Notes = notes,
            Severity = severity,
            IpAddress = ipAddress,
            CreatedAt = DateTime.UtcNow,
            Module = module,
            EmployeeId = employeeId,
        });
        await db.SaveChangesAsync();
    }
}
