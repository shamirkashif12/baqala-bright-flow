using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

// FR-CSH-05: Staff attendance is a separate module from cashier shift
[Table("staff_attendance")]
public class StaffAttendance
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    // Nullable: HRM-created rows for an employee with no POS/admin login have no User to link
    // (only EmployeeId). Rows auto-created by ShiftsController.OpenShift always set this.
    [Column("user_id")]
    public Guid? UserId { get; set; }

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    [Column("check_in")]
    public DateTime? CheckIn { get; set; }

    [Column("check_out")]
    public DateTime? CheckOut { get; set; }

    // present | absent | late | half_day | on_leave | checkout_missing
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

    // ─── HRM Attendance module fields ────────────────────────────────────────
    // Nullable/additive: rows auto-created by ShiftsController.OpenShift (cashier till open)
    // never set these and keep working unchanged; the HRM Attendance module (HrAttendanceController)
    // always sets EmployeeId + Date, and UserId too when the employee has a linked login, so the
    // existing POS attendance-shift report keeps matching by UserId+day.
    [Column("employee_id")]
    public Guid? EmployeeId { get; set; }

    // The calendar day this record is for. Needed because Absent/On Leave/Holiday rows have no
    // CheckIn timestamp to infer a date from.
    [Column("date")]
    public DateOnly? Date { get; set; }

    [Column("shift_id")]
    public Guid? ShiftId { get; set; }

    [Column("late_minutes")]
    public int LateMinutes { get; set; } = 0;

    [Column("early_leave_minutes")]
    public int EarlyLeaveMinutes { get; set; } = 0;

    [Column("remarks")]
    public string? Remarks { get; set; }

    // Navigation
    public User? User { get; set; }
    public Branch? Branch { get; set; }
    public User? RecordedByUser { get; set; }
    public Employee? Employee { get; set; }
    public WorkShift? Shift { get; set; }
}
