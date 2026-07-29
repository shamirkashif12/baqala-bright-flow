using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace BaqalaPOS.Api.Models;

// One row per online order (Order.Source == "online"), holding everything the public checkout
// form collects. Kept off Order/Customer rather than adding columns there: an online order is
// placed anonymously (no CustomerId — see OnlineOrdersController), so this is the only place a
// delivery address/contact exists for it. OrderId is both PK and FK, enforcing the 1:1.
[Table("order_delivery_details")]
public class OrderDeliveryDetail
{
    [Key, Column("order_id")]
    public Guid OrderId { get; set; }

    [Required, MaxLength(255), Column("full_name")]
    public string FullName { get; set; } = default!;

    [Required, MaxLength(50), Column("phone")]
    public string Phone { get; set; } = default!;

    [MaxLength(255), Column("email")]
    public string? Email { get; set; }

    [Required, Column("address_line")]
    public string AddressLine { get; set; } = default!;

    // Set only when the customer used the map picker — the address line above is always the
    // human-readable text actually shown/edited/submitted, this is purely for showing a pin on
    // the admin-side map and is never required.
    [Column("latitude")]
    public decimal? Latitude { get; set; }

    [Column("longitude")]
    public decimal? Longitude { get; set; }

    [Column("notes")]
    public string? Notes { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    [JsonIgnore] public Order? Order { get; set; }
}
