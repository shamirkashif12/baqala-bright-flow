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

    // ── How Order.DeliveryFeeAmount was arrived at ───────────────────────────
    // The fee lives on the order (it's part of the total); this is its provenance. Kept because
    // the rule that produced it can be edited or deleted afterwards, and "why was I charged 15?"
    // is a question asked days later, when re-resolving against today's rules would give a
    // different — and therefore useless — answer.

    /// The DeliveryFeeRule that matched, or null when the branch's default fee applied (or none).
    /// Not a hard FK: the rule may be deleted later and this row must still mean something.
    [Column("delivery_fee_rule_id")]
    public Guid? DeliveryFeeRuleId { get; set; }

    /// Snapshot of the matched rule's name at order time, for the same reason.
    [MaxLength(255), Column("delivery_fee_rule_name")]
    public string? DeliveryFeeRuleName { get; set; }

    /// Great-circle distance from the matched radius rule's centre, in km. Null when the address
    /// had no pin, or the winning rule wasn't distance-based.
    [Column("delivery_distance_km")]
    public decimal? DeliveryDistanceKm { get; set; }

    // Staff override trail (PATCH /online-orders/{id}/delivery-fee). Present only when someone
    // changed the computed fee by hand.

    [Column("delivery_fee_overridden_by")]
    public Guid? DeliveryFeeOverriddenBy { get; set; }

    [Column("delivery_fee_overridden_at")]
    public DateTime? DeliveryFeeOverriddenAt { get; set; }

    [MaxLength(500), Column("delivery_fee_override_reason")]
    public string? DeliveryFeeOverrideReason { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    [JsonIgnore] public Order? Order { get; set; }
}
