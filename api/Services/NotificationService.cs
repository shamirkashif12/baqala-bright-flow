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
        Guid? entityId = null,
        // Guarantees this user is notified exactly once alongside the role fan-out — used when a
        // personal recipient (the PO orderer, the receiving cashier) also happens to hold the
        // Manager/Admin role, which would otherwise produce two identical rows for the same event.
        Guid? alsoUserId = null);
}

public class NotificationService(BaqalaDbContext db) : INotificationService
{
    // A Role.Name in the DB is either the original seed name ("Tenant Administrator", "Branch
    // Manager", …) or a tenant-renamed short form ("Admin", "Manager", …) — AuthController.ToAppRole
    // and DataSeeder.SeedName both treat the two as the same role. Callers pass the short forms
    // (["Manager","Admin"]); on a default-named DB an exact match would find nobody, silently
    // dropping every role-targeted notification (ZATCA→Admins, low-stock alerts, PO fan-outs).
    // Expanding each requested name to include its alias makes the match work under either naming.
    private static readonly Dictionary<string, string[]> RoleAliases = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Admin"] = ["Admin", "Tenant Administrator"],
        ["Tenant Administrator"] = ["Admin", "Tenant Administrator"],
        ["Manager"] = ["Manager", "Branch Manager"],
        ["Branch Manager"] = ["Manager", "Branch Manager"],
        ["Inventory Staff"] = ["Inventory Staff", "Storekeeper"],
        ["Storekeeper"] = ["Inventory Staff", "Storekeeper"],
        ["Accountant"] = ["Accountant", "Finance User"],
        ["Finance User"] = ["Accountant", "Finance User"],
        ["Auditor"] = ["Auditor", "Marketing User"],
        ["Marketing User"] = ["Auditor", "Marketing User"],
        ["Warehouse Staff"] = ["Warehouse Staff", "Picker"],
        ["Picker"] = ["Warehouse Staff", "Picker"],
    };

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
        string severity = "info", string? entityType = null, Guid? entityId = null, Guid? alsoUserId = null)
    {
        // Any list.Contains(...) translated into a parameterized SQL IN-list throws on this MySQL
        // EF Core provider ("Expression '@names' in the SQL tree does not have a type mapping
        // assigned") — same limitation already documented in ReportsController around
        // shiftIds/productIds.Contains(). Filter by status/branch/Admin (all single-value
        // comparisons, not list membership) in SQL, then match role names in memory.
        var names = roleNames
            .SelectMany(r => RoleAliases.TryGetValue(r, out var aliases) ? aliases : [r])
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var candidates = db.Users.Include(u => u.Role).Where(u => u.Status == "active");
        if (branchId.HasValue)
            // Admins are notified tenant-wide regardless of branch — match either naming of that role.
            candidates = candidates.Where(u => u.BranchId == branchId
                || u.Role!.Name == "Admin" || u.Role!.Name == "Tenant Administrator");

        var users = await candidates.ToListAsync();
        var userIds = users.Where(u => u.Role != null && names.Contains(u.Role.Name)).Select(u => u.Id).ToList();

        // Union the explicit personal recipient in (NotifyUsersAsync de-dups) so it's reached even
        // when it holds no matching role / sits in another branch — without a second row when it does.
        if (alsoUserId is { } extra && extra != Guid.Empty) userIds.Add(extra);
        if (userIds.Count == 0) return;

        await NotifyUsersAsync(userIds, category, type, title, message, severity, entityType, entityId, branchId);
    }
}
