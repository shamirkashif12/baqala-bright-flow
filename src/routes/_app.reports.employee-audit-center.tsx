import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable, type Column } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { api, type EmployeeAuditRow, type Employee, type ReportExportFormat } from "@/lib/api";
import { downloadBlob, exportFileExtension } from "@/lib/csv-export";
import { toast } from "sonner";
import { ShieldAlert, Users, Percent, Ban } from "lucide-react";

export const Route = createFileRoute("/_app/reports/employee-audit-center")({ component: EmployeeAuditCenter });

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Mirrors ReportsController.EmployeeAuditActionMap's category set exactly.
const CATEGORIES = ["Added Item", "Edited Item", "Deleted Item", "Cancelled Item", "Approved Request", "Gave Discount", "Refunded Order", "Moved Stock"];

const CATEGORY_TONE: Record<string, string> = {
  "Added Item": "bg-success/15 text-success",
  "Edited Item": "bg-primary/15 text-primary",
  "Deleted Item": "bg-destructive/15 text-destructive",
  "Cancelled Item": "bg-destructive/15 text-destructive",
  "Approved Request": "bg-primary/15 text-primary",
  "Gave Discount": "bg-warning/20 text-warning-foreground",
  "Refunded Order": "bg-warning/20 text-warning-foreground",
  "Moved Stock": "bg-muted text-muted-foreground",
};

function EmployeeAuditCenter() {
  const { user } = useAuth();
  const { branches } = useBranch();
  const { canExport } = usePermission("Reports");

  // Mirrors ReportsController.IsAuditManagerTierAsync exactly — whoever actually manages other
  // employees sees the full branch + an employee filter; everyone else only ever sees their own
  // activity (enforced server-side regardless of what this UI shows), so these filters are simply
  // hidden rather than disabled for a self-scoped user.
  const hrAttendance = usePermission("HR Attendance");
  const hrShifts = usePermission("HR Shifts");
  const leaveManagement = usePermission("Leave Management");
  const employeesPerm = usePermission("Employees");
  const isManagerTier = user?.role === "tenant_admin"
    || hrAttendance.canApprove || hrAttendance.canEdit
    || hrShifts.canApprove || hrShifts.canEdit
    || leaveManagement.canApprove || leaveManagement.canEdit
    || employeesPerm.canEdit;

  const [dateFrom, setDateFrom] = useState(firstOfMonthStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rows, setRows] = useState<EmployeeAuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isManagerTier) api.getEmployees({ status: "active" }).then(setEmployees).catch(() => {});
  }, [isManagerTier]);

  const filterParams = {
    from: dateFrom, to: dateTo,
    branchId: isManagerTier ? branchIds : undefined,
    employeeId: isManagerTier ? employeeIds : undefined,
    category: categories,
    search: search || undefined,
  };

  const load = useCallback(() => {
    setLoading(true);
    api.getEmployeeAuditCenter(filterParams)
      .then(setRows)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, branchIds, employeeIds, categories, search, isManagerTier]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportEmployeeAuditCenter({ ...filterParams, exportedBy: user?.id, format });
      downloadBlob(blob, `employee-audit-center-${dateFrom}-to-${dateTo}.${exportFileExtension(format)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const employeeCount = useMemo(() => new Set(rows.map(r => r.employeeName)).size, [rows]);
  const discountCount = useMemo(() => rows.filter(r => r.actionCategory === "Gave Discount").length, [rows]);
  const riskCount = useMemo(() => rows.filter(r => r.actionCategory === "Cancelled Item" || r.actionCategory === "Refunded Order" || r.actionCategory === "Deleted Item").length, [rows]);

  const columns: Column[] = [
    { key: "date", label: "Date & Time", render: r => new Date(r.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) },
    { key: "employee", label: "Employee", render: r => r.employeeName },
    { key: "action", label: "Action Performed", render: r => <Badge variant="outline" className={`text-[10px] border-0 whitespace-nowrap ${CATEGORY_TONE[r.actionCategory] ?? "bg-muted text-muted-foreground"}`}>{r.actionLabel}</Badge> },
    { key: "oldValue", label: "Old Value", className: "max-w-[220px] whitespace-normal", render: r => r.oldValueSummary ?? "—" },
    { key: "newValue", label: "New Value", className: "max-w-[220px] whitespace-normal", render: r => r.newValueSummary ?? "—" },
    { key: "branch", label: "Branch", render: r => r.branchName },
    { key: "device", label: "Device", render: r => r.deviceName },
    { key: "transaction", label: "Related Transaction", render: r => r.relatedTransaction },
  ];

  return (
    <PageShell title="Employee Audit Center" subtitle="Full employee activity history for audit and misuse tracking">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 w-40" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 w-40" />
          {isManagerTier && (
            <>
              <div className="w-40">
                <SearchableMultiSelect
                  placeholder="All Branches"
                  options={branches.map(b => ({ id: b.id, label: b.name }))}
                  selected={branchIds}
                  onChange={setBranchIds}
                />
              </div>
              <div className="w-48">
                <SearchableMultiSelect
                  placeholder="All Employees"
                  options={employees.map(e => ({ id: e.id, label: e.fullName }))}
                  selected={employeeIds}
                  onChange={setEmployeeIds}
                />
              </div>
            </>
          )}
          <div className="w-48">
            <SearchableMultiSelect
              placeholder="All Activity Types"
              options={CATEGORIES.map(c => ({ id: c, label: c }))}
              selected={categories}
              onChange={setCategories}
            />
          </div>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee or action…" className="h-9 w-56" />
          <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} formats={["excel", "pdf"]} /></div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total Activities" value={String(rows.length)} icon={ShieldAlert} accent="primary" />
          <MetricCard label="Employees Involved" value={String(employeeCount)} icon={Users} />
          <MetricCard label="Discounts Given" value={String(discountCount)} icon={Percent} accent="warning" />
          <MetricCard label="Cancellations / Refunds / Deletions" value={String(riskCount)} icon={Ban} accent="destructive" />
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
