using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace BaqalaPOS.Api.Models;

// HR work-schedule shift template (working days, timing, grace) — distinct from CashierShift,
// which is a POS till/cash-drawer session. Deliberately named WorkShift + permission module
// "HR Shifts" to avoid any collision with the existing "Cashier Shifts" module.
[Table("work_shifts")]
public class WorkShift
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(150), Column("name")]
    public string Name { get; set; } = default!;

    // Null = applies across all branches.
    [Column("branch_id")]
    public Guid? BranchId { get; set; }

    // Null = applies to all departments.
    [Column("department_id")]
    public Guid? DepartmentId { get; set; }

    // CSV of 3-letter day codes, e.g. "Mon,Tue,Wed,Thu,Fri".
    [Required, MaxLength(50), Column("working_days")]
    public string WorkingDays { get; set; } = default!;

    // "HH:mm" 24-hour. End may be earlier than Start for night shifts crossing midnight.
    [Required, MaxLength(5), Column("start_time")]
    public string StartTime { get; set; } = default!;

    [Required, MaxLength(5), Column("end_time")]
    public string EndTime { get; set; } = default!;

    [MaxLength(5), Column("break_start")]
    public string? BreakStart { get; set; }

    [MaxLength(5), Column("break_end")]
    public string? BreakEnd { get; set; }

    [Column("grace_in_minutes")]
    public int GraceInMinutes { get; set; } = 0;

    [Column("grace_out_minutes")]
    public int GraceOutMinutes { get; set; } = 0;

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "active"; // active | inactive

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Branch? Branch { get; set; }
    public Department? Department { get; set; }
    [JsonIgnore] public ICollection<EmployeeShiftAssignment> Assignments { get; set; } = [];
}

// Tracks an employee's shift schedule history. Assigning a new shift closes the previous
// active assignment (EffectiveTo set, Status "ended") rather than deleting it — per FRD 13.3.
[Table("employee_shift_assignments")]
public class EmployeeShiftAssignment
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("employee_id")]
    public Guid EmployeeId { get; set; }

    [Required, Column("shift_id")]
    public Guid ShiftId { get; set; }

    [Required, Column("effective_from")]
    public DateOnly EffectiveFrom { get; set; }

    [Column("effective_to")]
    public DateOnly? EffectiveTo { get; set; }

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "active"; // active | ended

    [Column("assigned_by")]
    public Guid? AssignedBy { get; set; }

    [Column("assigned_at")]
    public DateTime AssignedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Employee? Employee { get; set; }
    public WorkShift? Shift { get; set; }
    public User? AssignedByUser { get; set; }
}
