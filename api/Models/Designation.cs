using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

[Table("designations")]
public class Designation
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(150), Column("name")]
    public string Name { get; set; } = default!;

    [Required, Column("department_id")]
    public Guid DepartmentId { get; set; }

    [MaxLength(50), Column("grade")]
    public string? Grade { get; set; }

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "active"; // active | inactive

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Department? Department { get; set; }
}
