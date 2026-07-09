using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Controllers;

// Personal inbox — every query is scoped to the caller's own UserId, so no [RequirePermission]
// module gate is needed beyond the global authenticated-user policy (see Program.cs FallbackPolicy).
[ApiController]
[Route("api/[controller]")]
public class NotificationsController(BaqalaDbContext db, INotificationService notifications) : ControllerBase
{
    private Guid? CallerId() =>
        Guid.TryParse(User.FindFirst("sub")?.Value ?? User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value, out var id) ? id : null;

    // Self-notify: lets the frontend log a notification for the CALLING user only (never on
    // someone else's behalf — userId is always the caller's own claim, not request input). This
    // is what makes purely client-side/ephemeral events (item scanned, bill held, coupon applied)
    // show up in the same persisted Bell as backend-triggered ones, without a bespoke local/
    // localStorage notification store that wouldn't survive route navigation.
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateNotificationRequest req)
    {
        var callerId = CallerId();
        if (callerId is null) return Unauthorized();

        var branchId = req.BranchId ?? (Guid.TryParse(User.FindFirst("branchId")?.Value, out var bid) ? bid : (Guid?)null);
        await notifications.NotifyUserAsync(callerId.Value, req.Category, req.Type, req.Title, req.Message,
            req.Severity ?? "info", req.EntityType, req.EntityId, branchId);

        return Ok(new { success = true });
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] bool? unreadOnly,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        var callerId = CallerId();
        if (callerId is null) return Unauthorized();

        var query = db.Notifications.Where(n => n.UserId == callerId);
        if (unreadOnly == true) query = query.Where(n => !n.IsRead);

        var total = await query.CountAsync();
        var items = await query
            .OrderByDescending(n => n.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync();

        return Ok(new { total, page, pageSize, items });
    }

    [HttpGet("unread-count")]
    public async Task<IActionResult> GetUnreadCount()
    {
        var callerId = CallerId();
        if (callerId is null) return Unauthorized();

        var count = await db.Notifications.CountAsync(n => n.UserId == callerId && !n.IsRead);
        return Ok(new { count });
    }

    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid id)
    {
        var callerId = CallerId();
        if (callerId is null) return Unauthorized();

        var notification = await db.Notifications.FirstOrDefaultAsync(n => n.Id == id && n.UserId == callerId);
        if (notification is null) return NotFound();
        if (!notification.IsRead)
        {
            notification.IsRead = true;
            notification.ReadAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }
        return Ok(notification);
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllRead()
    {
        var callerId = CallerId();
        if (callerId is null) return Unauthorized();

        var now = DateTime.UtcNow;
        await db.Notifications
            .Where(n => n.UserId == callerId && !n.IsRead)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(n => n.IsRead, true)
                .SetProperty(n => n.ReadAt, now));

        return Ok(new { success = true });
    }
}

public record CreateNotificationRequest(
    string Category,
    string Type,
    string Title,
    string Message,
    string? Severity,
    string? EntityType,
    Guid? EntityId,
    Guid? BranchId
);
