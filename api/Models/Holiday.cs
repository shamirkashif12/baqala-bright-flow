using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

[Table("holidays")]
public class Holiday
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(150), Column("name")]
    public string Name { get; set; } = default!;

    // Company Holiday | Optional Holiday
    [Required, MaxLength(30), Column("holiday_type")]
    public string HolidayType { get; set; } = "Company Holiday";

    [Required, Column("date")]
    public DateOnly Date { get; set; }

    // Null = applies to all branches.
    [Column("branch_id")]
    public Guid? BranchId { get; set; }

    [Column("description")]
    public string? Description { get; set; }

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "active"; // active | inactive

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Branch? Branch { get; set; }
}
