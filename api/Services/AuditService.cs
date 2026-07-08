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
        string? notes = null);
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
        string? notes = null)
    {
        // The FRD's Audit Trail "IP Address" column was always blank — nothing ever captured
        // it. The caller's HttpContext is available here (this runs inside a request), so read
        // it once at the point of logging rather than threading it through every call site.
        var ipAddress = httpContextAccessor.HttpContext?.Connection.RemoteIpAddress?.ToString();
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
        });
        await db.SaveChangesAsync();
    }
}
