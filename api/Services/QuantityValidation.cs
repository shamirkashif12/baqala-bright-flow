using BaqalaPOS.Api.Models;

namespace BaqalaPOS.Api.Services;

// Shared by every stock-quantity write endpoint (Inventory receive/adjust, Stock Transfers
// create/receive, Purchase Orders create/receive). A count-based product (e.g. "piece", "dozen")
// has no meaningful fractional unit; only a weight/volume/length-based product (kg, liter, meter)
// can legitimately move a fractional quantity.
public static class QuantityValidation
{
    /// <summary>
    /// Whether this product may hold a fractional quantity. Reads the unit of measure (the source
    /// of truth since UnitOfMeasureCatalog landed) but still honours a legacy WeightBased flag:
    /// rows written before the two were unified can carry WeightBased=true with the unit string
    /// left at its "piece" default, and demoting those to whole-units-only would silently reject
    /// the next sale of every existing weighed product. The backfill migration reconciles the
    /// stored data; this OR keeps anything it misses working.
    /// </summary>
    public static bool AllowsFractional(Product product)
        => product.WeightBased || UnitOfMeasureCatalog.IsFractional(product.UnitOfMeasure);

    public static string? ValidateWholeUnit(Product? product, decimal quantity, string label = "Quantity")
    {
        if (product is null) return null; // product lookup failure is a separate concern, not this check's job
        if (AllowsFractional(product)) return null;
        if (quantity == Math.Floor(quantity)) return null;
        return $"{label} must be a whole number for \"{product.Name}\" ({quantity} given) — this product is tracked by {UnitOfMeasureCatalog.Get(product.UnitOfMeasure).Code}, not by weight/volume.";
    }
}
