using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Models;

[Table("notifications")]
[Index(nameof(UserId), nameof(IsRead), nameof(CreatedAt))]
public class Notification
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("user_id")]
    public Guid UserId { get; set; }

    [Column("branch_id")]
    public Guid? BranchId { get; set; }

    // Which physical register the triggering event happened at — null for events with no real
    // terminal concept (a stock-count discrepancy, a compliance alert, a recall) rather than a
    // POS/shift/terminal-status event.
    [Column("terminal_id")]
    public Guid? TerminalId { get; set; }

    // Who actually did the thing this notification is about — distinct from UserId, which is who
    // the notification is FOR (the recipient). Null when there's no single acting person (an
    // automated stock-alert sweep) or the actor genuinely isn't known.
    [Column("triggered_by_user_id")]
    public Guid? TriggeredByUserId { get; set; }

    [Required, MaxLength(100), Column("category")]
    public string Category { get; set; } = default!;

    [Required, MaxLength(100), Column("type")]
    public string Type { get; set; } = default!;

    [Required, MaxLength(255), Column("title")]
    public string Title { get; set; } = default!;

    [Required, Column("message")]
    public string Message { get; set; } = default!;

    // info | warning | error — same vocabulary as AuditLog.Severity
    [MaxLength(20), Column("severity")]
    public string Severity { get; set; } = "info";

    [MaxLength(100), Column("entity_type")]
    public string? EntityType { get; set; }

    [Column("entity_id")]
    public Guid? EntityId { get; set; }

    [Column("is_read")]
    public bool IsRead { get; set; } = false;

    [Column("read_at")]
    public DateTime? ReadAt { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public User? User { get; set; }
    public Branch? Branch { get; set; }
    public Terminal? Terminal { get; set; }
    public User? TriggeredByUser { get; set; }
}
