using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

// Master data: Annual, Sick, Casual, Emergency, Unpaid, Maternity, Other — tenant-editable list.
[Table("leave_types")]
public class LeaveType
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(100), Column("name")]
    public string Name { get; set; } = default!;

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "active"; // active | inactive

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

// Simple named bundle assignable to an Employee at onboarding or later — deliberately no
// accrual/balance calculation engine, per the FRD's explicit scope boundary.
[Table("leave_policies")]
public class LeavePolicy
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(150), Column("name")]
    public string Name { get; set; } = default!;

    [Column("annual_days")]
    public int AnnualDays { get; set; } = 0;

    [Column("sick_days")]
    public int SickDays { get; set; } = 0;

    [Column("casual_days")]
    public int CasualDays { get; set; } = 0;

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "active"; // active | inactive

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

[Table("leave_requests")]
public class LeaveRequest
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("employee_id")]
    public Guid EmployeeId { get; set; }

    [Required, Column("leave_type_id")]
    public Guid LeaveTypeId { get; set; }

    [Required, Column("from_date")]
    public DateOnly FromDate { get; set; }

    [Required, Column("to_date")]
    public DateOnly ToDate { get; set; }

    [Column("total_days")]
    public int TotalDays { get; set; }

    [Required, Column("reason")]
    public string Reason { get; set; } = default!;

    [Column("attachment_url", TypeName = "longtext")]
    public string? AttachmentUrl { get; set; }

    // pending | approved | rejected | cancelled
    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "pending";

    [Column("approver_id")]
    public Guid? ApproverId { get; set; }

    [Column("approved_at")]
    public DateTime? ApprovedAt { get; set; }

    [Column("rejection_reason")]
    public string? RejectionReason { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Employee? Employee { get; set; }
    public LeaveType? LeaveType { get; set; }
    public User? Approver { get; set; }
}
