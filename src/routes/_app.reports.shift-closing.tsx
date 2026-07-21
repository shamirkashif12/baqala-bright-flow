import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/module-placeholder";
import { PaginatedDataTable, type Column } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { downloadBlob, exportFileExtension } from "@/lib/csv-export";
import { api, type ShiftClosingRow, type Department, type WorkShift, type ReportExportFormat } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { usePermission } from "@/lib/use-permission";
import { localDateStr } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/reports/shift-closing")({ component: ShiftClosingReport });

const todayStr = localDateStr();

function timeStr(v?: string) {
  return v ? v.slice(11, 16) : "—";
}

function ShiftClosingReport() {
  const { user } = useAuth();
  const { branches } = useBranch();
  const { canExport } = usePermission("Reports");
  const branchLocked = user?.role !== "tenant_admin";

  const [rows, setRows] = useState<ShiftClosingRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [loading, setLoading] = useState(true);

  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [branchId, setBranchId] = useState("all");
  const [departmentId, setDepartmentId] = useState("all");
  const [shiftId, setShiftId] = useState("all");
  const [closingStatus, setClosingStatus] = useState("all");

  const filterParams = {
    branchId: branchLocked ? (user?.branchId ?? undefined) : (branchId === "all" ? undefined : branchId),
    departmentId: departmentId === "all" ? undefined : departmentId,
    shiftId: shiftId === "all" ? undefined : shiftId,
    closingStatus: closingStatus === "all" ? undefined : closingStatus,
    dateFrom, dateTo,
  };

  const load = useCallback(() => {
    setLoading(true);
    api.getShiftClosingReport(filterParams).then(setRows).catch(() => {}).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, departmentId, shiftId, closingStatus, dateFrom, dateTo]);
  useEffect(load, [load]);
  useEffect(() => {
    api.getDepartments({ status: "active" }).then(setDepartments).catch(() => {});
    api.getWorkShifts({ status: "active" }).then(setShifts).catch(() => {});
  }, []);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportShiftClosingReport({ ...filterParams, exportedBy: user?.id, format });
      downloadBlob(blob, `shift-closing-report-${dateFrom}-to-${dateTo}.${exportFileExtension(format)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const columns: Column[] = [
    { key: "date", label: "Date", render: r => r.date ?? "—" },
    { key: "employee", label: "Employee", render: r => r.employee?.fullName ?? "—" },
    { key: "department", label: "Department", render: r => r.department ?? "—" },
    { key: "shift", label: "Shift", render: r => r.shift?.name ?? "—" },
    { key: "scheduled", label: "Scheduled", render: r => r.shift ? `${r.scheduledStart}–${r.scheduledEnd}` : "—" },
    { key: "checkIn", label: "Actual Check-In", render: r => timeStr(r.actualCheckIn) },
    { key: "checkOut", label: "Actual Check-Out", render: r => timeStr(r.actualCheckOut) },
    { key: "status", label: "Closing Status", render: r => <StatusBadge status={r.closingStatus} /> },
    { key: "closedBy", label: "Closed By", render: r => r.closedBy ?? "—" },
    { key: "remarks", label: "Remarks", render: r => r.remarks ?? "—" },
  ];

  return (
    <PageShell title="Shift Closing Report" subtitle="Monitor shift closing completion and exceptions" breadcrumb={["Human Resources", "Shift Closing Report"]}>
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
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={shiftId} onValueChange={setShiftId}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Shifts</SelectItem>
              {shifts.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={closingStatus} onValueChange={setClosingStatus}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Open">Open</SelectItem>
              <SelectItem value="Closed">Closed</SelectItem>
              <SelectItem value="Late Closed">Late Closed</SelectItem>
              <SelectItem value="Manually Closed">Manually Closed</SelectItem>
              <SelectItem value="Checkout Missing">Checkout Missing</SelectItem>
              <SelectItem value="Cancelled">Cancelled</SelectItem>
              <SelectItem value="Not Applicable">Not Applicable</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} formats={["excel", "pdf"]} /></div>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground py-10 text-center">Loading…</div>
        ) : (
          <PaginatedDataTable columns={columns} rows={rows} emptyMessage="No shift closing records match the current filters." />
        )}
      </div>
    </PageShell>
  );
}
