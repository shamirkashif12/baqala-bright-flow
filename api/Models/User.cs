using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace BaqalaPOS.Api.Models;

[Table("users")]
public class User
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(255), Column("email")]
    public string Email { get; set; } = default!;

    [Required, MaxLength(100), Column("username")]
    public string Username { get; set; } = default!;

    [Required, MaxLength(255), Column("password_hash")]
    [JsonIgnore] public string PasswordHash { get; set; } = default!;

    [MaxLength(255), Column("pin_hash")]
    [JsonIgnore] public string? PinHash { get; set; }

    [Required, MaxLength(255), Column("full_name")]
    public string FullName { get; set; } = default!;

    [MaxLength(255), Column("full_name_ar")]
    public string? FullNameAr { get; set; }

    [Required, Column("role_id")]
    public Guid RoleId { get; set; }

    [Column("branch_id")]
    public Guid? BranchId { get; set; }

    [Required, MaxLength(20), Column("status")]
    public string Status { get; set; } = "active"; // active | inactive | suspended

    [Column("last_login")]
    public DateTime? LastLogin { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Role Role { get; set; } = default!;
    public Branch? Branch { get; set; }
    [JsonIgnore] public ICollection<CashierShift> Shifts { get; set; } = [];
}
