using BaqalaPOS.Api.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace BaqalaPOS.Api.Services;

/// <summary>Shared Excel (default)/PDF/CSV export file builder for HRM list/report endpoints —
/// Excel is the FRD-mandated format; PDF/CSV remain available as its optional formats.</summary>
public static class ExportFileBuilder
{
    public static async Task<FileContentResult> BuildAsync(
        ControllerBase controller, BaqalaDbContext db,
        string? format, string title, string filterSummary,
        string[] headers, IReadOnlyList<object?[]> rows, string baseFileName, Guid? exportedBy = null)
    {
        if (string.Equals(format, "pdf", StringComparison.OrdinalIgnoreCase))
        {
            var pdfBytes = ReportPdfWriter.Write(title, filterSummary, [], headers, rows);
            return controller.File(pdfBytes, "application/pdf", $"{baseFileName}.pdf");
        }
        if (string.Equals(format, "csv", StringComparison.OrdinalIgnoreCase))
        {
            var csvBytes = CsvWriter.Write(headers, rows);
            return controller.File(csvBytes, "text/csv", $"{baseFileName}.csv");
        }
        var generatedBy = exportedBy.HasValue ? (await db.Users.FindAsync(exportedBy.Value))?.FullName : null;
        var xlsxBytes = ExcelWriter.Write(title, filterSummary, headers, rows, generatedBy);
        return controller.File(xlsxBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"{baseFileName}.xlsx");
    }
}
