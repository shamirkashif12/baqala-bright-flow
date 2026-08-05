using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace BaqalaPOS.Api.Models;

/// <summary>
/// One "what does delivery cost to here" rule for online orders.
///
/// Delivery fees were previously expressible only as a <c>TaxFeeRule</c> of type
/// <c>custom_fee</c> — a flat or percentage amount applied to every order regardless of where it
/// was going, which cannot express the thing every delivery operation actually needs: a fee that
/// depends on distance. This table is that missing dimension. It does NOT replace custom fees;
/// those still apply on top, exactly as before.
///
/// Geography is matched against the delivery pin the shopper drops on the checkout map
/// (<c>OrderDeliveryDetail.Latitude/Longitude</c>) — the only location signal an anonymous order
/// carries. A rule that needs coordinates simply never matches an order placed without them, so a
/// typed-address-only order falls through to the flat rules and the branch default. That is the
/// whole reason coordinates stay optional at checkout: making them mandatory would turn a fee
/// feature into a barrier to ordering at all.
/// </summary>
[Table("delivery_fee_rules")]
public class DeliveryFeeRule
{
    [Key, Column("id")]
    public Guid Id { get; set; } = Guid.NewGuid();

    /// null = applies to every branch (tenant-wide default). A branch's own rule always beats a
    /// tenant-wide one — see DeliveryFeeService's ordering.
    [Column("branch_id")]
    public Guid? BranchId { get; set; }

    /// Shown to the shopper on the checkout summary and stored on the order, so a customer
    /// querying their bill later sees the same label the operator configured ("Outer city zone").
    [Required, MaxLength(255), Column("name")]
    public string Name { get; set; } = default!;

    /// How this rule decides whether it applies to a delivery address.
    ///   flat   — applies to every delivery in scope. The catch-all/base fee.
    ///   radius — applies between MinDistanceKm and MaxDistanceKm of (CenterLatitude,
    ///            CenterLongitude), great-circle. Rings ("0–5 km", "5–15 km") are expressed as
    ///            several of these rather than one rule with a formula, so an operator can read
    ///            the fee for any distance off the list without doing arithmetic.
    ///   bbox   — applies inside a latitude/longitude rectangle. For the district-shaped areas a
    ///            circle can't describe (one side of a highway, a walled compound).
    [Required, MaxLength(20), Column("rule_type")]
    public string RuleType { get; set; } = RuleTypes.Flat;

    public static class RuleTypes
    {
        public const string Flat = "flat";
        public const string Radius = "radius";
        public const string Bbox = "bbox";
        public static readonly string[] All = [Flat, Radius, Bbox];
    }

    // ── radius ───────────────────────────────────────────────────────────────
    // The centre is stored on the rule rather than read from the branch: a store's delivery rings
    // are not always centred on the store (a depot, a city centre, the far side of a bridge), and
    // a tenant-wide rule has no single branch to take a location from.

    [Column("center_latitude")]
    public decimal? CenterLatitude { get; set; }

    [Column("center_longitude")]
    public decimal? CenterLongitude { get; set; }

    /// Inclusive lower bound, in kilometres. 0/null means "from the centre".
    [Column("min_distance_km")]
    public decimal? MinDistanceKm { get; set; }

    /// Inclusive upper bound, in kilometres. null means unbounded — which, paired with
    /// IsServiceable = false, is how "we don't deliver beyond this" is expressed.
    [Column("max_distance_km")]
    public decimal? MaxDistanceKm { get; set; }

    // ── bbox ─────────────────────────────────────────────────────────────────

    [Column("min_latitude")]
    public decimal? MinLatitude { get; set; }

    [Column("max_latitude")]
    public decimal? MaxLatitude { get; set; }

    [Column("min_longitude")]
    public decimal? MinLongitude { get; set; }

    [Column("max_longitude")]
    public decimal? MaxLongitude { get; set; }

    // ── the fee itself ───────────────────────────────────────────────────────

    [Column("fee_amount")]
    public decimal FeeAmount { get; set; } = 0m;

    /// Waive the fee once the order's goods subtotal reaches this. null = never waived. Compared
    /// against the subtotal (goods only), not the grand total — a threshold that counted the
    /// delivery fee towards itself would be self-referential.
    [Column("free_above_order_amount")]
    public decimal? FreeAboveOrderAmount { get; set; }

    /// false = this area is outside the delivery zone. An order whose pin matches an
    /// unserviceable rule is refused at checkout with UnserviceableMessage rather than quoted a
    /// fee, which is the honest answer for an address nobody is going to drive to.
    [Column("is_serviceable")]
    public bool IsServiceable { get; set; } = true;

    [MaxLength(500), Column("unserviceable_message")]
    public string? UnserviceableMessage { get; set; }

    /// Higher wins when two rules match equally specifically. Without it, overlapping zones would
    /// resolve by insertion order, i.e. arbitrarily.
    [Column("priority")]
    public int Priority { get; set; } = 0;

    [Column("is_active")]
    public bool IsActive { get; set; } = true;

    [Column("created_by")]
    public Guid? CreatedBy { get; set; }

    [Column("created_at")]
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Column("updated_at")]
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    // Navigation
    public Branch? Branch { get; set; }
}
