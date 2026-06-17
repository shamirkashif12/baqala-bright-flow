using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace BaqalaPOS.Api.Models;

[Table("roles")]
public class Role
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, MaxLength(100), Column("name")]
    public string Name { get; set; } = default!;

    [MaxLength(100), Column("name_ar")]
    public string? NameAr { get; set; }

    [Column("description")]
    public string? Description { get; set; }

    [Column("is_system")]
    public bool IsSystem { get; set; } = false;

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Set by controller queries — not persisted
    [NotMapped]
    public int UserCount { get; set; }

    // Navigation
    public ICollection<RolePermission> Permissions { get; set; } = [];
    [JsonIgnore] public ICollection<User> Users { get; set; } = [];
}

[Table("role_permissions")]
public class RolePermission
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("role_id")]
    public Guid RoleId { get; set; }

    [Required, MaxLength(100), Column("module")]
    public string Module { get; set; } = default!;

    [Column("can_view")]   public bool CanView   { get; set; } = false;
    [Column("can_create")] public bool CanCreate { get; set; } = false;
    [Column("can_edit")]   public bool CanEdit   { get; set; } = false;
    [Column("can_delete")] public bool CanDelete { get; set; } = false;
    [Column("can_approve")]public bool CanApprove{ get; set; } = false;
    [Column("can_export")] public bool CanExport { get; set; } = false;

    // Navigation — nullable so ASP.NET model binder doesn't require it in PUT/POST bodies
    [JsonIgnore] public Role? Role { get; set; }
}
