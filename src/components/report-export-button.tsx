import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Download, FileText, FileSpreadsheet } from "lucide-react";
import type { ReportExportFormat } from "@/lib/api";

/** Shared Export control for report detail pages — lets the user pick CSV or PDF, per the Reports FRD's export dropdown. */
export function ReportExportButton({ onExport, disabled }: { onExport: (format: ReportExportFormat) => void; disabled?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" disabled={disabled}>
          <Download className="h-4 w-4" />Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onExport("csv")}>
          <FileSpreadsheet className="h-4 w-4" />CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onExport("pdf")}>
          <FileText className="h-4 w-4" />PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
