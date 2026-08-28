using QuestPDF.Drawing;

namespace BaqalaPOS.Api.Services;

// PDF text falls back through a font family list — see QuestPDF's remarks on
// TextStyleExtensions.FontFamily(string[]): host-installed fonts (Arial, Courier New) don't carry
// Arabic glyphs on most Linux deployment hosts, so seller/customer names in Arabic render as "?".
// Bundling this font as an embedded resource keeps it working regardless of what's installed on the host.
public static class PdfFonts
{
    public const string Arabic = "Noto Sans Arabic";

    private static readonly Lazy<bool> Registered = new(() =>
    {
        FontManager.RegisterFontFromEmbeddedResource("BaqalaPOS.Api.Assets.Fonts.NotoSansArabic.ttf");
        return true;
    });

    public static void EnsureRegistered() => _ = Registered.Value;
}
