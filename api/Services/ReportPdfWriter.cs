using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace BaqalaPOS.Api.Services;

/// <summary>Management-readable PDF export shared by all report endpoints: title, filter summary,
/// generation timestamp, KPI tiles and a totals-aware data table — per the Reports FRD's export rules.</summary>
public static class ReportPdfWriter
{
    public static byte[] Write(string title, string filterSummary, (string Label, string Value)[] kpis, string[] headers, IReadOnlyList<object?[]> rows, string? companyHeader = null)
    {
        QuestPDF.Settings.License = LicenseType.Community;

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4.Landscape());
                page.MarginHorizontal(28);
                page.MarginVertical(28);
                page.DefaultTextStyle(t => t.FontSize(8).FontFamily("Arial").FontColor("#000000"));

                page.Content().Column(col =>
                {
                    col.Item().Text(title).FontSize(16).Bold();
                    if (!string.IsNullOrWhiteSpace(companyHeader))
                        col.Item().Text(companyHeader).FontSize(9).Bold().FontColor("#333333");
                    if (!string.IsNullOrWhiteSpace(filterSummary))
                        col.Item().Text(filterSummary).FontSize(9).FontColor("#555555");
                    col.Item().Text($"Generated {DateTime.UtcNow:dd MMM yyyy HH:mm} UTC · {rows.Count} row(s)")
                        .FontSize(8).FontColor("#888888");
                    col.Item().Height(10);

                    if (kpis.Length > 0)
                    {
                        col.Item().Row(row =>
                        {
                            foreach (var (label, value) in kpis)
                            {
                                row.RelativeItem().Border(1).BorderColor("#dddddd").Padding(6).Column(k =>
                                {
                                    k.Item().Text(label).FontSize(7).FontColor("#666666");
                                    k.Item().Text(value).FontSize(11).Bold();
                                });
                            }
                        });
                        col.Item().Height(12);
                    }

                    col.Item().Table(table =>
                    {
                        table.ColumnsDefinition(cols =>
                        {
                            foreach (var _ in headers) cols.RelativeColumn();
                        });

                        static IContainer TH(IContainer c) => c.Background("#000000").Padding(4);
                        table.Header(h =>
                        {
                            foreach (var header in headers)
                                h.Cell().Element(TH).Text(header).FontColor("#ffffff").Bold().FontSize(7);
                        });

                        var even = false;
                        foreach (var row in rows)
                        {
                            even = !even;
                            var bg = even ? "#f7f7f7" : "#ffffff";
                            IContainer TD(IContainer c) => c.Background(bg).BorderBottom(1).BorderColor("#e5e5e5").Padding(4);
                            foreach (var cell in row)
                                table.Cell().Element(TD).Text(FormatCell(cell)).FontSize(7);
                        }
                    });
                });
            });
        }).GeneratePdf();
    }

    private static string FormatCell(object? value) => value switch
    {
        null => "",
        decimal d => d.ToString("0.##"),
        DateTime dt => dt.ToString("yyyy-MM-dd HH:mm"),
        DateOnly dOnly => dOnly.ToString("yyyy-MM-dd"),
        _ => value.ToString() ?? "",
    };
}
