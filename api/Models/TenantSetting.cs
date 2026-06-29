using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

[Table("tenant_settings")]
public class TenantSetting
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    [Required, MaxLength(100), Column("setting_key")]
    public string SettingKey { get; set; } = default!;

    [Column("setting_value")]
    public string? SettingValue { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
