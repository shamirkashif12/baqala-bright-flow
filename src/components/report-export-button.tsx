import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, FileText, FileSpreadsheet } from "lucide-react";
import type { ReportExportFormat } from "@/lib/api";

const FORMAT_LABEL: Record<ReportExportFormat, string> = { excel: "Excel (.xlsx)", csv: "CSV", pdf: "PDF" };
const FORMAT_ICON: Record<ReportExportFormat, typeof FileText> = { excel: FileSpreadsheet, csv: FileSpreadsheet, pdf: FileText };

/**
 * Shared Export control for report detail pages — lets the user pick a format, per the Reports
 * FRD's export dropdown. Defaults to CSV/PDF (this app's ~25 non-HRM reports); HRM report pages
 * pass formats={["excel","pdf"]} since Excel is their FRD-mandated format and their backend
 * (HrReportsController) actually implements it — the generic ReportsController used by every
 * other report does not, so Excel isn't offered there by default.
 */
export function ReportExportButton({ onExport, disabled, formats = ["csv", "pdf"] }: {
  onExport: (format: ReportExportFormat) => void; disabled?: boolean; formats?: ReportExportFormat[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" disabled={disabled}>
          <Download className="h-4 w-4" />Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {formats.map(f => {
          const Icon = FORMAT_ICON[f];
          return (
            <DropdownMenuItem key={f} onClick={() => onExport(f)}>
              <Icon className="h-4 w-4" />{FORMAT_LABEL[f]}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
