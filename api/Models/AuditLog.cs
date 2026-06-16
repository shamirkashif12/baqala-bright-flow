using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

[Table("audit_logs")]
public class AuditLog
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Column("user_id")]
    public Guid? UserId { get; set; }

    [Required, MaxLength(255), Column("action")]
    public string Action { get; set; } = default!;

    [MaxLength(100), Column("entity_type")]
    public string? EntityType { get; set; }

    [Column("entity_id")]
    public Guid? EntityId { get; set; }

    [Column("old_values")]
    public string? OldValues { get; set; } // JSON string

    [Column("new_values")]
    public string? NewValues { get; set; } // JSON string

    [MaxLength(50), Column("ip_address")]
    public string? IpAddress { get; set; }

    [Column("branch_id")]
    public Guid? BranchId { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public User? User { get; set; }
    public Branch? Branch { get; set; }
}
