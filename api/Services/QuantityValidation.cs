using BaqalaPOS.Api.Models;

namespace BaqalaPOS.Api.Services;

// Shared by every stock-quantity write endpoint (Inventory receive/adjust, Stock Transfers
// create/receive, Purchase Orders create/receive). A count-based product (WeightBased == false,
// the default — e.g. "piece") has no meaningful fractional unit; only a weight/volume-based
// product (kg, liter, etc.) can legitimately move a fractional quantity.
public static class QuantityValidation
{
    public static string? ValidateWholeUnit(Product? product, decimal quantity, string label = "Quantity")
    {
        if (product is null) return null; // product lookup failure is a separate concern, not this check's job
        if (product.WeightBased) return null;
        if (quantity == Math.Floor(quantity)) return null;
        return $"{label} must be a whole number for \"{product.Name}\" ({quantity} given) — this product is tracked by piece, not weight/volume.";
    }
}
