/** Maps a ReportExportFormat to its real file extension — "excel" downloads as .xlsx, not .excel. */
export function exportFileExtension(format: string): string {
  return format === "excel" ? "xlsx" : format;
}

/** Triggers a browser download for a Blob (used by report CSV export buttons). */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Client-side CSV export for module list pages (Employees, Departments, Holidays, etc.) whose
 * data is already fully loaded and — where it matters (e.g. Payroll amounts) — already masked
 * server-side. Mirrors the backend CsvWriter's UTF-8-BOM convention so Excel opens Arabic text
 * correctly. Used where a dedicated report/export endpoint (with its own audit logging) isn't
 * warranted — see the HRM Reports pages for that heavier pattern.
 *
 * `companyHeader` (from useCompanyHeader()) prepends the same legal name/CR/VAT line the backend
 * exports carry, separated by a blank row exactly like CsvWriter.Write does server-side.
 */
export function exportRowsAsCsv(headers: string[], rows: unknown[][], filename: string, companyHeader?: string) {
  const lines = [headers, ...rows].map(row => row.map(escapeCsvCell).join(","));
  if (companyHeader) lines.unshift(escapeCsvCell(companyHeader), "");
  const csv = "﻿" + lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, filename);
}
