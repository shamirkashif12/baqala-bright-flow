import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/module-placeholder";
import { PaginatedDataTable, type Column } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { downloadBlob } from "@/lib/csv-export";
import { api, type StaffAttendance, type Department, type WorkShift, type ReportExportFormat } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { usePermission } from "@/lib/use-permission";
import { localDateStr } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/reports/hrm-attendance")({ component: HrmAttendanceReport });

const todayStr = localDateStr();

function timeStr(v?: string) {
  return v ? v.slice(11, 16) : "—";
}

function totalHours(row: StaffAttendance): string {
  if (!row.checkIn || !row.checkOut) return "—";
  const ms = new Date(row.checkOut).getTime() - new Date(row.checkIn).getTime();
  return ms > 0 ? `${(ms / 3600000).toFixed(1)}h` : "—";
}

function HrmAttendanceReport() {
  const { user } = useAuth();
  const { branches } = useBranch();
  const { canExport } = usePermission("Reports");
  const branchLocked = user?.role !== "tenant_admin";

  const [rows, setRows] = useState<StaffAttendance[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [loading, setLoading] = useState(true);

  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [branchId, setBranchId] = useState("all");
  const [departmentId, setDepartmentId] = useState("all");
  const [shiftId, setShiftId] = useState("all");
  const [status, setStatus] = useState("all");

  const filterParams = {
    branchId: branchLocked ? (user?.branchId ?? undefined) : (branchId === "all" ? undefined : branchId),
    departmentId: departmentId === "all" ? undefined : departmentId,
    shiftId: shiftId === "all" ? undefined : shiftId,
    status: status === "all" ? undefined : status,
    dateFrom, dateTo,
  };

  const load = useCallback(() => {
    setLoading(true);
    api.getHrAttendanceReport(filterParams).then(setRows).catch(() => {}).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, departmentId, shiftId, status, dateFrom, dateTo]);
  useEffect(load, [load]);
  useEffect(() => {
    api.getDepartments({ status: "active" }).then(setDepartments).catch(() => {});
    api.getWorkShifts({ status: "active" }).then(setShifts).catch(() => {});
  }, []);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportHrAttendanceReport({ ...filterParams, exportedBy: user?.id, format });
      downloadBlob(blob, `attendance-report-${dateFrom}-to-${dateTo}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const columns: Column[] = [
    { key: "date", label: "Date", render: r => r.date ?? "—" },
    { key: "employee", label: "Employee", render: r => r.employee?.fullName ?? "—" },
    { key: "department", label: "Department", render: r => r.employee?.department?.name ?? "—" },
    { key: "shift", label: "Shift", render: r => r.shift?.name ?? "—" },
    { key: "checkIn", label: "Check-In", render: r => timeStr(r.checkIn) },
    { key: "checkOut", label: "Check-Out", render: r => timeStr(r.checkOut) },
    { key: "hours", label: "Total Hours", render: r => totalHours(r) },
    { key: "status", label: "Status", render: r => <StatusBadge status={r.status} /> },
    { key: "late", label: "Late", render: r => r.lateMinutes > 0 ? `${r.lateMinutes}m` : "—" },
    { key: "early", label: "Early Leave", render: r => r.earlyLeaveMinutes > 0 ? `${r.earlyLeaveMinutes}m` : "—" },
    { key: "remarks", label: "Remarks", render: r => r.remarks ?? "—" },
  ];

  return (
    <PageShell title="Attendance Report" subtitle="Filter and export employee attendance across dates and branches">
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
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="present">Present</SelectItem>
              <SelectItem value="late">Late</SelectItem>
              <SelectItem value="absent">Absent</SelectItem>
              <SelectItem value="on_leave">On Leave</SelectItem>
              <SelectItem value="checkout_missing">Checkout Missing</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground py-10 text-center">Loading…</div>
        ) : (
          <PaginatedDataTable columns={columns} rows={rows} emptyMessage="No attendance records match the current filters." />
        )}
      </div>
    </PageShell>
  );
}
