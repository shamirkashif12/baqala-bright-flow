using System.Text.RegularExpressions;

namespace BaqalaPOS.Api.Services;

// Shared by every form that collects a Saudi mobile number server-side (Warehouses, Branches,
// Suppliers, Purchase Orders) — several of these accepted anything with no format check at all.
// Mirrors src/lib/validation.ts's isValidSaudiPhone exactly, so a client-side pass always succeeds
// server-side too.
public static class ContactValidation
{
    private static readonly Regex SaudiPhoneRegex =
        new(@"^(05\d{8}|9665\d{8})$", RegexOptions.Compiled);
    private static readonly Regex SaudiCrRegex = new(@"^\d{10}$", RegexOptions.Compiled);
    private static readonly Regex SaudiVatRegex = new(@"^3\d{13}3$", RegexOptions.Compiled);

    public static bool IsValidSaudiPhone(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone)) return true; // optional field — only format-checked when present
        var digitsOnly = new string(phone.Where(char.IsDigit).ToArray());
        return SaudiPhoneRegex.IsMatch(digitsOnly);
    }

    public static bool IsValidSaudiCr(string? cr)
    {
        if (string.IsNullOrWhiteSpace(cr)) return true; // optional field — only format-checked when present
        return SaudiCrRegex.IsMatch(cr.Trim());
    }

    public static bool IsValidSaudiVat(string? vat)
    {
        if (string.IsNullOrWhiteSpace(vat)) return true; // optional field — only format-checked when present
        return SaudiVatRegex.IsMatch(vat.Trim());
    }
}
