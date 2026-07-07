using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace BaqalaPOS.Api.Models;

// Per-user permission override — takes precedence over the user's role default for
// the same module when present (see RequirePermissionAttribute). A user with no rows
// here simply inherits their role's RolePermission matrix unchanged.
[Table("user_permissions")]
public class UserPermission : IPermissionFlags
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("user_id")]
    public Guid UserId { get; set; }

    [Required, MaxLength(100), Column("module")]
    public string Module { get; set; } = default!;

    [Column("can_view")]   public bool CanView   { get; set; } = false;
    [Column("can_create")] public bool CanCreate { get; set; } = false;
    [Column("can_edit")]   public bool CanEdit   { get; set; } = false;
    [Column("can_delete")] public bool CanDelete { get; set; } = false;
    [Column("can_approve")]public bool CanApprove{ get; set; } = false;
    [Column("can_export")] public bool CanExport { get; set; } = false;

    [JsonIgnore] public User? User { get; set; }
}
