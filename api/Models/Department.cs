using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

[Table("departments")]
public class Department
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(150), Column("name")]
    public string Name { get; set; } = default!;

    // Null = applies across all branches (tenant-wide department).
    [Column("branch_id")]
    public Guid? BranchId { get; set; }

    [Column("manager_employee_id")]
    public Guid? ManagerEmployeeId { get; set; }

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "active"; // active | inactive

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Branch? Branch { get; set; }
    public Employee? ManagerEmployee { get; set; }
}
