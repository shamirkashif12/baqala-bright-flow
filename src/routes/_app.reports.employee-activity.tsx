import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PaginatedDataTable, type Column } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { downloadBlob } from "@/lib/csv-export";
import { api, type EmployeeActivityRow, type ReportExportFormat } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { usePermission } from "@/lib/use-permission";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/reports/employee-activity")({ component: EmployeeActivityReport });

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const MODULES = ["Employees", "HR Master Data", "HR Attendance", "HR Shifts", "Leave Management", "Payroll"];

function severityTone(s: string) {
  if (s === "critical") return "bg-destructive/15 text-destructive";
  if (s === "warning") return "bg-warning/20 text-warning-foreground";
  return "bg-muted text-muted-foreground";
}

function EmployeeActivityReport() {
  const { user } = useAuth();
  const { branches } = useBranch();
  const { canExport } = usePermission("Reports");
  const branchLocked = user?.role !== "tenant_admin";

  const [rows, setRows] = useState<EmployeeActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [dateFrom, setDateFrom] = useState(firstOfMonthStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [branchId, setBranchId] = useState("all");
  const [module, setModule] = useState("all");
  const [search, setSearch] = useState("");

  const filterParams = {
    branchId: branchLocked ? (user?.branchId ?? undefined) : (branchId === "all" ? undefined : branchId),
    module: module === "all" ? undefined : module,
    activityType: search || undefined,
    dateFrom: dateFrom ? `${dateFrom}T00:00:00` : undefined,
    dateTo: dateTo ? `${dateTo}T23:59:59` : undefined,
  };

  const load = useCallback(() => {
    setLoading(true);
    api.getEmployeeActivityReport(filterParams).then(setRows).catch(() => {}).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, module, search, dateFrom, dateTo]);
  useEffect(load, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportEmployeeActivityReport({ ...filterParams, exportedBy: user?.id, format });
      downloadBlob(blob, `employee-activity-report-${dateFrom}-to-${dateTo}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const columns: Column[] = [
    { key: "date", label: "Date & Time", render: r => new Date(r.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) },
    { key: "employee", label: "Employee", render: r => r.employee?.fullName ?? "—" },
    { key: "module", label: "Module", render: r => r.module ?? r.entityType ?? "—" },
    { key: "action", label: "Activity", render: r => r.action },
    { key: "description", label: "Description", className: "max-w-[220px] truncate", render: r => r.newValues ?? r.notes ?? "—" },
    { key: "performedBy", label: "Performed By", render: r => r.performedBy?.fullName ?? "—" },
    { key: "ip", label: "IP Address", render: r => r.ipAddress ?? "—" },
    { key: "severity", label: "Severity", render: r => <Badge variant="outline" className={`text-[10px] border-0 ${severityTone(r.severity)}`}>{r.severity}</Badge> },
  ];

  return (
    <PageShell title="Employee Activity Report" subtitle="Audit trail of employee actions across HRM and POS modules">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 w-40" />
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 w-40" />
          {!branchLocked && (
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={module} onValueChange={setModule}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modules</SelectItem>
              {MODULES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search activity…" className="h-9 w-48" />
          <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground py-10 text-center">Loading…</div>
        ) : (
          <PaginatedDataTable columns={columns} rows={rows} emptyMessage="No activity matches the current filters." />
        )}
      </div>
    </PageShell>
  );
}
