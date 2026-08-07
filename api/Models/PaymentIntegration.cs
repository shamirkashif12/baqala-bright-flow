using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

// Admin → Payments: per-branch connection state for a payment provider (NearPay, Nami,
// MyFatoorah, ...). Each provider needs a different credential shape (merchant ID, terminal ID,
// API key/secret, environment, ...), so those live in ConfigJson rather than as fixed columns —
// see PaymentIntegrationsController for the per-provider field catalog and secret masking.
[Table("payment_integrations")]
public class PaymentIntegration
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required, Column("branch_id")]
    public Guid BranchId { get; set; }

    [Required, MaxLength(50), Column("provider")]
    public string Provider { get; set; } = default!;

    [Column("is_enabled")]
    public bool IsEnabled { get; set; }

    [Column("config_json")]
    public string? ConfigJson { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
