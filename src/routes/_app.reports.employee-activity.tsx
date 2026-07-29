import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PaginatedDataTable, FilterField, type Column } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { AuditDetailDrawer } from "@/components/audit-detail-drawer";
import { Eye, X } from "lucide-react";
import { downloadBlob, exportFileExtension } from "@/lib/csv-export";
import { api, type EmployeeActivityRow, type Employee, type User, type ReportExportFormat } from "@/lib/api";
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

// "Inventory" (product/category deletions) and "Approvals" (maker-checker decisions) were logged
// but had no way to be filtered for — the two modules an auditor reaches for first.
const MODULES = ["Employees", "HR Master Data", "HR Attendance", "HR Shifts", "Leave Management", "Authentication", "POS", "Orders", "Returns", "Inventory", "Approvals", "Audit Logs"];
// BRD 16.2 fixed Activity Type set — mirrors HrReportsController.ActivityTypeOf's buckets exactly.
const ACTIVITY_TYPES = ["Created", "Updated", "Deleted", "Approved", "Rejected", "Exported", "Login", "Logout", "Correction", "Access Denied", "Other"];

function severityTone(s: string) {
  if (s === "critical") return "bg-destructive/15 text-destructive";
  if (s === "warning") return "bg-warning/20 text-warning-foreground";
  return "bg-muted text-muted-foreground";
}

function EmployeeActivityReport() {
  const { user } = useAuth();
  const { branches } = useBranch();
  const { canExport } = usePermission("Audit Logs");
  const branchLocked = user?.role !== "tenant_admin";

  const [rows, setRows] = useState<EmployeeActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [dateFrom, setDateFrom] = useState(firstOfMonthStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [branchId, setBranchId] = useState("all");
  const [module, setModule] = useState("all");
  const [employeeId, setEmployeeId] = useState("all");
  const [performedBy, setPerformedBy] = useState("all");
  const [activityType, setActivityType] = useState("all");
  const [referenceId, setReferenceId] = useState("");
  const [ipOrDevice, setIpOrDevice] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const filterParams = {
    branchId: branchLocked ? (user?.branchId ?? undefined) : (branchId === "all" ? undefined : branchId),
    module: module === "all" ? undefined : module,
    employeeId: employeeId === "all" ? undefined : employeeId,
    performedBy: performedBy === "all" ? undefined : performedBy,
    activityType: activityType === "all" ? undefined : activityType,
    referenceId: referenceId || undefined,
    ipOrDevice: ipOrDevice || undefined,
    dateFrom: dateFrom ? `${dateFrom}T00:00:00` : undefined,
    dateTo: dateTo ? `${dateTo}T23:59:59` : undefined,
  };

  const load = useCallback(() => {
    setLoading(true);
    api.getEmployeeActivityReport(filterParams).then(setRows).catch(() => {}).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, module, employeeId, performedBy, activityType, referenceId, ipOrDevice, dateFrom, dateTo]);
  useEffect(load, [load]);
  useEffect(() => {
    api.getEmployees({ status: ["active"] }).then(setEmployees).catch(() => {});
    api.getUsers().then(setUsers).catch(() => {});
  }, []);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportEmployeeActivityReport({ ...filterParams, exportedBy: user?.id, format });
      downloadBlob(blob, `employee-activity-report-${dateFrom}-to-${dateTo}.${exportFileExtension(format)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const columns: Column[] = [
    { key: "date", label: "Date & Time", render: r => new Date(r.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) },
    { key: "employee", label: "Employee", render: r => r.employee?.fullName ?? "—" },
    { key: "employeeId", label: "Employee ID", render: r => r.employee?.employeeCode ?? "—" },
    { key: "branch", label: "Branch", render: r => r.branchName ?? "—" },
    { key: "module", label: "Module", render: r => r.module ?? r.entityType ?? "—" },
    { key: "activityType", label: "Activity Type", render: r => <Badge variant="outline" className="text-[10px] border-0 bg-muted text-muted-foreground whitespace-nowrap">{r.activityType}</Badge> },
    { key: "description", label: "Description", className: "max-w-[240px] whitespace-normal break-words text-xs", render: r => r.description ?? "—" },
    { key: "oldValue", label: "Old Value", className: "max-w-[200px] whitespace-normal break-words text-xs", render: r => r.oldValueSummary ?? "—" },
    { key: "newValue", label: "New Value", className: "max-w-[200px] whitespace-normal break-words text-xs", render: r => r.newValueSummary ?? "—" },
    { key: "performedBy", label: "Performed By", render: r => r.performedBy?.fullName ?? "—" },
    { key: "device", label: "Device / IP Address", render: r => [r.deviceName, r.ipAddress].filter(Boolean).join(" / ") || "—" },
    { key: "referenceId", label: "Reference ID", render: r => r.entityId ? `${r.entityId.slice(0, 8)}…` : "—" },
    { key: "severity", label: "Severity", render: r => <Badge variant="outline" className={`text-[10px] border-0 ${severityTone(r.severity)}`}>{r.severity}</Badge> },
    // The one-line Old/New Value summaries above deliberately drop line items — this opens the
    // full record: every affected product, its quantity and price, and the field-level diff.
    {
      key: "details", label: "Action",
      render: r => (
        <Button size="icon" variant="ghost" className="h-7 w-7" title="View full detail" onClick={() => setDetailId(r.id)}>
          <Eye className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  const hasFilters = dateFrom !== firstOfMonthStr() || dateTo !== todayStr() || branchId !== "all" || module !== "all"
    || employeeId !== "all" || performedBy !== "all" || activityType !== "all" || !!referenceId || !!ipOrDevice;
  const clearFilters = () => {
    setDateFrom(firstOfMonthStr()); setDateTo(todayStr()); setBranchId("all"); setModule("all");
    setEmployeeId("all"); setPerformedBy("all"); setActivityType("all"); setReferenceId(""); setIpOrDevice("");
  };

  return (
    <PageShell title="Employee Activity Report" subtitle="Audit trail of employee actions across HRM and POS modules" breadcrumb={["Human Resources", "Employee Activity Report"]}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <FilterField label="From"><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 w-40" /></FilterField>
          <FilterField label="To"><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 w-40" /></FilterField>
          {!branchLocked && (
            <FilterField label="Branch">
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FilterField>
          )}
          <FilterField label="Module">
            <Select value={module} onValueChange={setModule}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modules</SelectItem>
                {MODULES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Employee">
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.fullName}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Performed By">
            <Select value={performedBy} onValueChange={setPerformedBy}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Performed By</SelectItem>
                {users.map(u => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Activity Type">
            <Select value={activityType} onValueChange={setActivityType}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Activity Types</SelectItem>
                {ACTIVITY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Reference ID"><Input value={referenceId} onChange={e => setReferenceId(e.target.value)} placeholder="Reference ID…" className="h-9 w-40" /></FilterField>
          <FilterField label="IP / Device"><Input value={ipOrDevice} onChange={e => setIpOrDevice(e.target.value)} placeholder="IP / Device…" className="h-9 w-36" /></FilterField>
          {hasFilters && (
            <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" /> Clear Filters
            </Button>
          )}
          <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} formats={["excel", "pdf"]} /></div>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground py-10 text-center">Loading…</div>
        ) : (
          <PaginatedDataTable columns={columns} rows={rows} emptyMessage="No activity matches the current filters." />
        )}
      </div>

      <AuditDetailDrawer auditLogId={detailId} onClose={() => setDetailId(null)} />
    </PageShell>
  );
}
