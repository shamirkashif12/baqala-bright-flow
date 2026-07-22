using BaqalaPOS.Api.Data;
using BaqalaPOS.Api.Models;
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
        var company = await db.CompanyProfiles.FindAsync(CompanyProfile.SingletonId);
        var companyHeader = FormatCompanyHeader(company);

        if (string.Equals(format, "pdf", StringComparison.OrdinalIgnoreCase))
        {
            var pdfBytes = ReportPdfWriter.Write(title, filterSummary, [], headers, rows, companyHeader);
            return controller.File(pdfBytes, "application/pdf", $"{baseFileName}.pdf");
        }
        if (string.Equals(format, "csv", StringComparison.OrdinalIgnoreCase))
        {
            var csvBytes = CsvWriter.Write(headers, rows, companyHeader);
            return controller.File(csvBytes, "text/csv", $"{baseFileName}.csv");
        }
        var generatedBy = exportedBy.HasValue ? (await db.Users.FindAsync(exportedBy.Value))?.FullName : null;
        var xlsxBytes = ExcelWriter.Write(title, filterSummary, headers, rows, generatedBy, companyHeader: companyHeader);
        return controller.File(xlsxBytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", $"{baseFileName}.xlsx");
    }

    /// <summary>Formats the company-wide legal identity for a print/export header, omitting any blank parts.</summary>
    public static string FormatCompanyHeader(CompanyProfile? company)
    {
        if (company is null) return "";
        var parts = new List<string>();
        if (!string.IsNullOrWhiteSpace(company.LegalName)) parts.Add(company.LegalName);
        if (!string.IsNullOrWhiteSpace(company.CrNumber)) parts.Add($"CR {company.CrNumber}");
        if (!string.IsNullOrWhiteSpace(company.VatNumber)) parts.Add($"VAT {company.VatNumber}");
        return string.Join("  ·  ", parts);
    }
}
