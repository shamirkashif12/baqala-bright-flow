using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

public interface INotificationService
{
    Task NotifyUserAsync(
        Guid userId,
        string category,
        string type,
        string title,
        string message,
        string severity = "info",
        string? entityType = null,
        Guid? entityId = null,
        Guid? branchId = null);

    Task NotifyUsersAsync(
        IEnumerable<Guid> userIds,
        string category,
        string type,
        string title,
        string message,
        string severity = "info",
        string? entityType = null,
        Guid? entityId = null,
        Guid? branchId = null);

    // Fans out to every active user whose Role.Name is in roleNames — optionally scoped to a
    // branch (managers/admins of one branch, not the whole tenant). Role.Name here is the actual
    // seeded/renamed DB role name ("Manager", "Admin", ...), not the JWT "role" claim slug, which
    // uses a different vocabulary (see AuthController.ToAppRole).
    Task NotifyRoleAsync(
        IEnumerable<string> roleNames,
        Guid? branchId,
        string category,
        string type,
        string title,
        string message,
        string severity = "info",
        string? entityType = null,
        Guid? entityId = null);
}

public class NotificationService(BaqalaDbContext db) : INotificationService
{
    public async Task NotifyUserAsync(
        Guid userId, string category, string type, string title, string message,
        string severity = "info", string? entityType = null, Guid? entityId = null, Guid? branchId = null)
    {
        await NotifyUsersAsync([userId], category, type, title, message, severity, entityType, entityId, branchId);
    }

    public async Task NotifyUsersAsync(
        IEnumerable<Guid> userIds, string category, string type, string title, string message,
        string severity = "info", string? entityType = null, Guid? entityId = null, Guid? branchId = null)
    {
        var now = DateTime.UtcNow;
        foreach (var userId in userIds.Distinct())
        {
            db.Notifications.Add(new Notification
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                BranchId = branchId,
                Category = category,
                Type = type,
                Title = title,
                Message = message,
                Severity = severity,
                EntityType = entityType,
                EntityId = entityId,
                CreatedAt = now,
            });
        }
        await db.SaveChangesAsync();
    }

    public async Task NotifyRoleAsync(
        IEnumerable<string> roleNames, Guid? branchId, string category, string type, string title, string message,
        string severity = "info", string? entityType = null, Guid? entityId = null)
    {
        // Any list.Contains(...) translated into a parameterized SQL IN-list throws on this MySQL
        // EF Core provider ("Expression '@names' in the SQL tree does not have a type mapping
        // assigned") — same limitation already documented in ReportsController around
        // shiftIds/productIds.Contains(). Filter by status/branch/Admin (all single-value
        // comparisons, not list membership) in SQL, then match role names in memory.
        var names = roleNames.ToHashSet();
        var candidates = db.Users.Include(u => u.Role).Where(u => u.Status == "active");
        if (branchId.HasValue)
            candidates = candidates.Where(u => u.BranchId == branchId || u.Role!.Name == "Admin");

        var users = await candidates.ToListAsync();
        var userIds = users.Where(u => u.Role != null && names.Contains(u.Role.Name)).Select(u => u.Id).ToList();
        if (userIds.Count == 0) return;

        await NotifyUsersAsync(userIds, category, type, title, message, severity, entityType, entityId, branchId);
    }
}
