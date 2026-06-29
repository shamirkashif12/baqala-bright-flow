using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;

namespace BaqalaPOS.Api.Services;

public interface IAuditService
{
    Task LogAsync(
        string action,
        string? entityType = null,
        Guid? entityId = null,
        Guid? userId = null,
        Guid? branchId = null,
        string? details = null);
}

public class AuditService(BaqalaDbContext db) : IAuditService
{
    public async Task LogAsync(
        string action,
        string? entityType = null,
        Guid? entityId = null,
        Guid? userId = null,
        Guid? branchId = null,
        string? details = null)
    {
        db.AuditLogs.Add(new AuditLog
        {
            Id = Guid.NewGuid(),
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            UserId = userId,
            BranchId = branchId,
            NewValues = details,
            CreatedAt = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();
    }
}
