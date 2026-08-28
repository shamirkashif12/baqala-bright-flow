using QuestPDF.Drawing;

namespace BaqalaPOS.Api.Services;

// PDF text falls back through a font family list — see QuestPDF's remarks on
// TextStyleExtensions.FontFamily(string[]): host-installed fonts (Arial, Courier New) don't carry
// Arabic glyphs on most Linux deployment hosts, so seller/customer names in Arabic render as "?".
// Bundling this font as an embedded resource keeps it working regardless of what's installed on the host.
public static class PdfFonts
{
    public const string Arabic = "Noto Sans Arabic";

    // Same glyph/path data as the on-screen receipt's <SARIcon /> (src/lib/currency.tsx) — kept in
    // sync so the downloaded PDF's currency mark matches what the customer already saw on screen,
    // instead of falling back to plain "SAR" text.
    public const string SarSvg = """
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 111.11">
          <path fill="#000000" d="M 100 66.16 L 97.22 80.3 L 60.61 87.88 L 58.59 63.89 L 50 64.9 L 47.22 84.6 L 38.38 94.44 L 0 102.78 L 4.29 89.14 L 33.84 81.82 L 35.35 68.94 L 7.32 74.75 L 5.56 66.67 L 9.6 61.11 L 34.85 56.06 L 35.35 42.93 L 36.11 8.08 L 47.22 0 L 47.22 50 L 54.29 52.02 L 58.59 49.75 L 57.32 16.41 L 70.71 6.06 L 70.45 47.22 L 99.24 41.41 L 100 47.98 L 96.21 55.56 L 70.45 60.61 L 70.45 69.95 Z M 99.24 94.44 L 97.47 102.53 L 78.79 108.59 L 58.59 111.11 L 58.59 107.32 L 62.63 96.97 L 95.96 88.89 Z" />
        </svg>
        """;

    private static readonly Lazy<bool> Registered = new(() =>
    {
        FontManager.RegisterFontFromEmbeddedResource("BaqalaPOS.Api.Assets.Fonts.NotoSansArabic.ttf");
        return true;
    });

    public static void EnsureRegistered() => _ = Registered.Value;

    // CompanyProfile.LogoDataUrl is a "data:image/png;base64,..." data URL — strip the prefix and
    // decode for QuestPDF's Image(byte[]). Never let a malformed/corrupt logo break receipt
    // generation, same defensive stance as the QR-code builders in ReceiptPdfWriter/EmailService.
    public static byte[]? DecodeLogo(string? dataUrl)
    {
        if (string.IsNullOrWhiteSpace(dataUrl)) return null;
        try
        {
            var comma = dataUrl.IndexOf(',');
            var base64 = comma >= 0 ? dataUrl[(comma + 1)..] : dataUrl;
            return Convert.FromBase64String(base64);
        }
        catch
        {
            return null;
        }
    }
}
