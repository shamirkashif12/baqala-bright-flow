import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AuditDetailDrawer } from "@/components/audit-detail-drawer";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { DateRangeField } from "@/components/report-filters/date-range-field";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable, FilterField, type Column } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { api, type EmployeeAuditRow, type Employee, type Terminal, type ReportExportFormat } from "@/lib/api";
import { downloadBlob, exportFileExtension } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ShieldAlert, Users, Percent, Ban, Eye, X, SlidersHorizontal, ChevronDown } from "lucide-react";

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
const CATEGORIES = ["Added Item", "Edited Item", "Deleted Item", "Cancelled Item", "Modified Order", "Price Override", "Approved Request", "Gave Discount", "Refunded Order", "Moved Stock"];

const CATEGORY_TONE: Record<string, string> = {
  "Added Item": "bg-success/15 text-success",
  "Edited Item": "bg-primary/15 text-primary",
  "Deleted Item": "bg-destructive/15 text-destructive",
  "Cancelled Item": "bg-destructive/15 text-destructive",
  "Modified Order": "bg-warning/20 text-warning-foreground",
  "Price Override": "bg-warning/20 text-warning-foreground",
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
  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  const [transactionTypes, setTransactionTypes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [rows, setRows] = useState<EmployeeAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Accumulates every EntityType seen across loads (not just the current, possibly filtered,
  // result set) so picking one Transaction Type doesn't shrink the option list out from under
  // whatever else the tenant's audit history actually contains.
  const [transactionTypesSeen, setTransactionTypesSeen] = useState<string[]>([]);

  useEffect(() => {
    if (isManagerTier) api.getEmployees({ status: ["active"] }).then(setEmployees).catch(() => {});
  }, [isManagerTier]);
  useEffect(() => { api.getTerminals().then(setTerminals).catch(() => {}); }, []);
  useEffect(() => {
    const seen = rows.map((r) => r.entityType).filter((t): t is string => !!t);
    if (seen.length) setTransactionTypesSeen((prev) => Array.from(new Set([...prev, ...seen])).sort());
  }, [rows]);

  const filterParams = {
    from: dateFrom, to: dateTo,
    branchId: isManagerTier ? branchIds : undefined,
    employeeId: isManagerTier ? employeeIds : undefined,
    category: categories,
    deviceId: deviceIds.length ? deviceIds : undefined,
    transactionType: transactionTypes.length ? transactionTypes : undefined,
    search: search || undefined,
  };

  const load = useCallback(() => {
    setLoading(true);
    api.getEmployeeAuditCenter(filterParams)
      .then(setRows)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, branchIds, employeeIds, categories, deviceIds, transactionTypes, search, isManagerTier]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportEmployeeAuditCenter({ ...filterParams, exportedBy: user?.id, format });
      downloadBlob(blob, `employee-audit-center-${dateFrom}-to-${dateTo}.${exportFileExtension(format)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const hasFilters = dateFrom !== firstOfMonthStr() || dateTo !== todayStr() || branchIds.length > 0
    || employeeIds.length > 0 || categories.length > 0 || deviceIds.length > 0 || transactionTypes.length > 0 || search !== "";
  const clearFilters = () => {
    setDateFrom(firstOfMonthStr()); setDateTo(todayStr()); setBranchIds([]); setEmployeeIds([]);
    setCategories([]); setDeviceIds([]); setTransactionTypes([]); setSearch("");
  };
  const advancedFilterCount = categories.length + deviceIds.length + transactionTypes.length;

  const employeeCount = useMemo(() => new Set(rows.map(r => r.employeeName)).size, [rows]);
  const discountCount = useMemo(() => rows.filter(r => r.actionCategory === "Gave Discount").length, [rows]);
  const riskCount = useMemo(() => rows.filter(r => r.actionCategory === "Cancelled Item" || r.actionCategory === "Refunded Order" || r.actionCategory === "Deleted Item").length, [rows]);
  const overrideCount = useMemo(() => rows.filter(r => r.actionCategory === "Price Override" || r.actionCategory === "Modified Order").length, [rows]);

  const columns: Column[] = [
    { key: "date", label: "Date & Time", render: r => new Date(r.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) },
    { key: "employee", label: "Employee", render: r => r.employeeName },
    { key: "action", label: "Action Performed", render: r => <Badge variant="outline" className={`text-[10px] border-0 whitespace-nowrap ${CATEGORY_TONE[r.actionCategory] ?? "bg-muted text-muted-foreground"}`}>{r.actionLabel}</Badge> },
    // The client's ask: every record must show the affected products and quantities, not just who
    // did what. The counts are the at-a-glance answer; the Details drawer has the full breakdown.
    { key: "products", label: "Products", render: r => r.itemCount > 0 ? `${r.itemCount} product${r.itemCount !== 1 ? "s" : ""}` : "—" },
    { key: "quantity", label: "Total Qty", render: r => r.totalQuantity > 0 ? String(r.totalQuantity) : "—" },
    // Truncated to one line — a summary can run long (several fields joined with commas), and
    // letting it wrap made every row a different height, breaking the table's scan-ability. The
    // full text is a hover away here, and always available in full (with names, not raw ids) in
    // the Details drawer.
    { key: "oldValue", label: "Old Value", className: "max-w-[200px]", render: r => <p className="truncate" title={r.oldValueSummary ?? undefined}>{r.oldValueSummary ?? "—"}</p> },
    { key: "newValue", label: "New Value", className: "max-w-[200px]", render: r => <p className="truncate" title={r.newValueSummary ?? undefined}>{r.newValueSummary ?? "—"}</p> },
    { key: "branch", label: "Branch", render: r => r.branchName },
    { key: "device", label: "Device", render: r => r.deviceName },
    { key: "transaction", label: "Related Transaction", render: r => r.relatedTransaction },
    {
      key: "details", label: "Details",
      render: r => (
        <Button size="icon" variant="ghost" className="h-7 w-7" title="View full detail" onClick={() => setDetailId(r.id)}>
          <Eye className="h-3.5 w-3.5" />
        </Button>
      ),
    },
  ];

  return (
    <PageShell title="Employee Audit Center" subtitle="Full employee activity history for audit and misuse tracking">
      <div className="space-y-4">
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="rounded-xl border border-border/60 bg-card p-3 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <DateRangeField from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
            {isManagerTier && (
              <>
                <FilterField label="Branch">
                  <div className="w-40">
                    <SearchableMultiSelect
                      placeholder="All Branches"
                      options={branches.map(b => ({ id: b.id, label: b.name }))}
                      selected={branchIds}
                      onChange={setBranchIds}
                    />
                  </div>
                </FilterField>
                <FilterField label="Employee">
                  <div className="w-48">
                    <SearchableMultiSelect
                      placeholder="All Employees"
                      options={employees.map(e => ({ id: e.id, label: e.fullName }))}
                      selected={employeeIds}
                      onChange={setEmployeeIds}
                    />
                  </div>
                </FilterField>
              </>
            )}
            <FilterField label="Search">
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee or action…" className="h-9 w-56" />
            </FilterField>

            <CollapsibleTrigger asChild>
              <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Advanced
                {advancedFilterCount > 0 && (
                  <Badge variant="secondary" className="h-4 min-w-4 rounded-full px-1 text-[10px] leading-none">{advancedFilterCount}</Badge>
                )}
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", advancedOpen && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
            {hasFilters && (
              <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" /> Clear Filters
              </Button>
            )}
            <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} formats={["excel", "pdf"]} /></div>
          </div>

          <CollapsibleContent className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(180px,1fr))] pt-3 border-t border-border/50">
            <FilterField label="Activity Type">
              <SearchableMultiSelect
                placeholder="All Activity Types"
                options={CATEGORIES.map(c => ({ id: c, label: c }))}
                selected={categories}
                onChange={setCategories}
              />
            </FilterField>
            <FilterField label="Device">
              <SearchableMultiSelect
                placeholder="All Devices"
                options={terminals.map(t => ({ id: t.id, label: t.name }))}
                selected={deviceIds}
                onChange={setDeviceIds}
              />
            </FilterField>
            <FilterField label="Transaction Type">
              <SearchableMultiSelect
                placeholder="All Transaction Types"
                options={transactionTypesSeen.map(t => ({ id: t, label: t.replace(/([a-z])([A-Z])/g, "$1 $2") }))}
                selected={transactionTypes}
                onChange={setTransactionTypes}
              />
            </FilterField>
          </CollapsibleContent>
        </Collapsible>

        <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
          <MetricCard label="Total Activities" value={String(rows.length)} icon={ShieldAlert} accent="primary" />
          <MetricCard label="Employees Involved" value={String(employeeCount)} icon={Users} />
          <MetricCard label="Discounts Given" value={String(discountCount)} icon={Percent} accent="warning" />
          <MetricCard label="Order Edits / Price Overrides" value={String(overrideCount)} icon={Percent} accent="warning" />
          <MetricCard label="Cancellations / Refunds / Deletions" value={String(riskCount)} icon={Ban} accent="destructive" />
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
