using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

// FR-CSH-05: Staff attendance is a separate module from cashier shift
[Table("staff_attendance")]
public class StaffAttendance
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("user_id")]
    public Guid UserId { get; set; }

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    [Column("check_in")]
    public DateTime? CheckIn { get; set; }

    [Column("check_out")]
    public DateTime? CheckOut { get; set; }

    // present | absent | late | half_day | on_leave
    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "present";

    [Column("notes")]
    public string? Notes { get; set; }

    [Column("recorded_by")]
    public Guid? RecordedBy { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public User User { get; set; } = default!;
    public Branch Branch { get; set; } = default!;
    public User? RecordedByUser { get; set; }
}
