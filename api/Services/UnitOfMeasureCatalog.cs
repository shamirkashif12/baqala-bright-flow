namespace BaqalaPOS.Api.Services;

/// <summary>
/// The canonical set of selling units. Product.UnitOfMeasure has existed as a free-text string
/// since the initial schema but nothing ever validated or read it for behaviour — the only thing
/// driving fractional-quantity handling was the separate Product.WeightBased bool, hardcoded to
/// mean kilograms. That left two fields free to disagree (UnitOfMeasure "kg" + WeightBased false
/// was accepted and behaved as a piece-counted product) and made ml/litre selling impossible.
///
/// This catalog makes UnitOfMeasure the single source of truth: whether fractional quantities are
/// legal, how many decimals are meaningful, and which UN/ECE code the ZATCA e-invoice must carry.
/// WeightBased is now derived from it on every write (see ProductsController.NormalizeUnitFields)
/// rather than captured independently, so the two can no longer drift apart.
/// </summary>
public static class UnitOfMeasureCatalog
{
    public const string Count = "count";
    public const string Weight = "weight";
    public const string Volume = "volume";
    public const string Length = "length";

    public const string DefaultCode = "piece";

    /// <param name="Code">Stored in products.unit_of_measure. Stable — never localise this.</param>
    /// <param name="Category">count | weight | volume | length.</param>
    /// <param name="ZatcaUnitCode">
    /// UN/ECE Recommendation 20 code, required on every ZATCA invoice line's InvoicedQuantity.
    /// </param>
    /// <param name="DecimalPlaces">
    /// Meaningful precision when entering a quantity. Count units are whole-only (0); weight and
    /// volume go to 3 so a gram / millilitre is expressible in the major unit (0.001 kg = 1 g).
    /// The DB stores every quantity as decimal(18,4), so this bounds the UI, not the schema.
    /// </param>
    /// <param name="SubUnitLabel">
    /// The minor unit a cashier may prefer to type (grams, millilitres). null for units with no
    /// customary minor unit. Purely an input affordance — see SubUnitsPerUnit.
    /// </param>
    /// <param name="SubUnitsPerUnit">
    /// How many minor units make one major unit (1000 g per kg). Quantities are always stored and
    /// priced in the major unit; typing "350 g" is converted to 0.35 kg before it reaches stock or
    /// price maths, so no second stock unit is ever introduced.
    /// </param>
    public record UnitDefinition(
        string Code,
        string Category,
        string ZatcaUnitCode,
        int DecimalPlaces,
        string? SubUnitLabel = null,
        decimal? SubUnitsPerUnit = null);

    public static readonly IReadOnlyList<UnitDefinition> All =
    [
        // Count — whole numbers only. "dozen"/"box" here are a *pricing and stocking* unit (one
        // row of on-hand means one dozen), which is deliberately distinct from Product.SaleUnitType
        // "pack" + ItemsPerPack, which describes a pack that can be physically broken open into a
        // different product. A product sold by the dozen with no loose-unit link is just counted.
        new(DefaultCode, Count, "PCE", 0),
        new("dozen", Count, "DZN", 0),
        new("box", Count, "BX", 0),

        // Weight — fractional. BasePrice is the price of one kilogram (or one gram, if that is the
        // chosen unit); a 250 g sale is quantity 0.25 against a per-kg price, exactly how a shelf
        // tag reads.
        new("kilogram", Weight, "KGM", 3, "gram", 1000m),
        new("gram", Weight, "GRM", 0),

        // Volume — fractional. Bulk goods dispensed by the litre (cooking oil, fuel, syrups). A
        // sealed 1.5 L bottle is NOT this: that is a countable piece whose size is a label, and is
        // best expressed as a ProductVariant value.
        new("liter", Volume, "LTR", 3, "milliliter", 1000m),
        new("milliliter", Volume, "MLT", 0),

        new("meter", Length, "MTR", 2, "centimeter", 100m),
    ];

    private static readonly Dictionary<string, UnitDefinition> ByCode =
        All.ToDictionary(u => u.Code, StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Legacy and shorthand spellings seen in free-text data written before this catalog existed,
    /// mapped onto canonical codes. Normalisation runs on every product write, so an operator (or
    /// an old row) saying "kg" lands on "kilogram" rather than being rejected.
    /// </summary>
    private static readonly Dictionary<string, string> Aliases = new(StringComparer.OrdinalIgnoreCase)
    {
        ["kg"] = "kilogram",
        ["kgs"] = "kilogram",
        ["kilo"] = "kilogram",
        ["kilogramme"] = "kilogram",
        ["g"] = "gram",
        ["gm"] = "gram",
        ["gms"] = "gram",
        ["gramme"] = "gram",
        ["l"] = "liter",
        ["ltr"] = "liter",
        ["litre"] = "liter",
        ["ml"] = "milliliter",
        ["millilitre"] = "milliliter",
        ["m"] = "meter",
        ["metre"] = "meter",
        ["cm"] = "centimeter",
        ["pc"] = DefaultCode,
        ["pcs"] = DefaultCode,
        ["each"] = DefaultCode,
        ["unit"] = DefaultCode,
        ["units"] = DefaultCode,
        ["item"] = DefaultCode,
        ["doz"] = "dozen",
        ["dz"] = "dozen",
        ["carton"] = "box",
        ["case"] = "box",
    };

    public static UnitDefinition? Find(string? code)
    {
        if (string.IsNullOrWhiteSpace(code)) return null;
        var trimmed = code.Trim();
        if (ByCode.TryGetValue(trimmed, out var unit)) return unit;
        if (Aliases.TryGetValue(trimmed, out var canonical) && ByCode.TryGetValue(canonical, out var aliased)) return aliased;
        return null;
    }

    public static UnitDefinition Get(string? code) => Find(code) ?? ByCode[DefaultCode];

    /// <summary>
    /// Canonical code for storage. Unknown input falls back to "piece" rather than throwing:
    /// every product written before this catalog existed carries whatever string was typed, and a
    /// hard failure on read would take down product listing for the whole tenant.
    /// </summary>
    public static string Normalize(string? code) => Get(code).Code;

    public static bool IsKnown(string? code) => Find(code) is not null;

    /// <summary>
    /// Whether a fractional quantity is physically meaningful. This is what replaces the old
    /// standalone WeightBased flag as the actual decision — weight, volume and length can be sold
    /// in parts of a unit; you cannot sell 0.4 of a piece.
    /// </summary>
    public static bool IsFractional(string? code)
    {
        var unit = Get(code);
        return unit.Category is Weight or Volume or Length;
    }

    public static string ZatcaCode(string? code) => Get(code).ZatcaUnitCode;

    public static int DecimalPlaces(string? code) => Get(code).DecimalPlaces;

    /// <summary>
    /// Rounds a quantity to the unit's meaningful precision. Guards against a client posting
    /// 0.3333333 kg (or 1.5 pieces) and that noise entering the stock ledger permanently, where it
    /// would never reconcile against a physical count.
    /// </summary>
    public static decimal RoundQuantity(string? code, decimal quantity)
        => Math.Round(quantity, DecimalPlaces(code), MidpointRounding.AwayFromZero);
}
