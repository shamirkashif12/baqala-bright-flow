using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

// HRM employee profile — deliberately separate from User (the POS/admin login account).
// Not every employee (baker, warehouse keeper, ...) needs or gets a login; UserId links the
// two only when that person also has one. RoleId is the "Assigned ACL Role" the FRD asks for:
// read-only in the HRM UI, sourced from the same Role table Users/Roles already manages.
[Table("employees")]
public class Employee
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    // Server-generated (EmployeesController.Create) — not [Required] so the client's create
    // payload, which never includes it, doesn't fail ASP.NET's automatic model validation.
    [MaxLength(20), Column("employee_code")]
    public string EmployeeCode { get; set; } = "";

    [Required, MaxLength(255), Column("full_name")]
    public string FullName { get; set; } = default!;

    [MaxLength(255), Column("email")]
    public string? Email { get; set; }

    [Required, MaxLength(50), Column("phone")]
    public string Phone { get; set; } = default!;

    [MaxLength(50), Column("emergency_contact")]
    public string? EmergencyContact { get; set; }

    [Required, MaxLength(50), Column("national_id")]
    public string NationalId { get; set; } = default!;

    [Column("iqama_expiry")]
    public DateOnly? IqamaExpiry { get; set; }

    [Column("date_of_birth")]
    public DateOnly? DateOfBirth { get; set; }

    [MaxLength(20), Column("gender")]
    public string? Gender { get; set; }

    [MaxLength(100), Column("nationality")]
    public string? Nationality { get; set; }

    [MaxLength(20), Column("marital_status")]
    public string? MaritalStatus { get; set; }

    // Base64 data-URL, same convention as Product.ImageUrl.
    [Column("profile_image_url", TypeName = "longtext")]
    public string? ProfileImageUrl { get; set; }

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    [Column("department_id")]
    public Guid? DepartmentId { get; set; }

    [Column("designation_id")]
    public Guid? DesignationId { get; set; }

    [Column("role_id")]
    public Guid? RoleId { get; set; }

    [Column("user_id")]
    public Guid? UserId { get; set; }

    [Column("leave_policy_id")]
    public Guid? LeavePolicyId { get; set; }

    [Required, Column("hire_date")]
    public DateOnly HireDate { get; set; }

    // active | inactive | suspended | resigned
    [Required, MaxLength(20), Column("employment_status")]
    public string EmploymentStatus { get; set; } = "active";

    [Column("current_address")]
    public string? CurrentAddress { get; set; }

    [Column("permanent_address")]
    public string? PermanentAddress { get; set; }

    // Permanent | Temporary | Probation | Part-Time | Other
    [MaxLength(30), Column("contract_type")]
    public string? ContractType { get; set; }

    [Column("contract_start_date")]
    public DateOnly? ContractStartDate { get; set; }

    [Column("contract_end_date")]
    public DateOnly? ContractEndDate { get; set; }

    [Column("contract_open_ended")]
    public bool ContractOpenEnded { get; set; } = false;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Branch? Branch { get; set; }
    public Department? Department { get; set; }
    public Designation? Designation { get; set; }
    public Role? Role { get; set; }
    public User? User { get; set; }
    public LeavePolicy? LeavePolicy { get; set; }

    // Populated by EmployeesController from EmployeeShiftAssignment — not a real EF relation
    // (Employee doesn't need a mapped nav property for a query-time convenience field).
    [NotMapped]
    public CurrentShiftInfo? CurrentShift { get; set; }

    // Populated by EmployeesController from EmployeeDocuments — the card's Document Snapshot
    // (FRD 6.2) only needs "has at least one document on file", not the full list.
    [NotMapped]
    public bool HasDocuments { get; set; }

    // Populated by EmployeesController from LeaveRequests — the card's Leave Snapshot (FRD 6.2).
    [NotMapped]
    public bool OnLeaveToday { get; set; }
}

public class CurrentShiftInfo
{
    public Guid ShiftId { get; set; }
    public string ShiftName { get; set; } = default!;
    public string StartTime { get; set; } = default!;
    public string EndTime { get; set; } = default!;
    public DateOnly EffectiveFrom { get; set; }
}
