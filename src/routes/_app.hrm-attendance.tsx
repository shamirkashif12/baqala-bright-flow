import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/module-placeholder";
import { Pencil, Plus, Download } from "lucide-react";
import { toast } from "sonner";
import { api, type StaffAttendance, type Employee, type WorkShift, type Department } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { usePermission } from "@/lib/use-permission";
import { localDateStr } from "@/lib/utils";
import { exportRowsAsCsv } from "@/lib/csv-export";

export const Route = createFileRoute("/_app/hrm-attendance")({ component: HrmAttendance });

const todayStr = localDateStr();

function FieldRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}{required && <span className="text-destructive"> *</span>}</Label>{children}</div>;
}

function totalHours(row: StaffAttendance): string {
  if (!row.checkIn || !row.checkOut) return "—";
  const ms = new Date(row.checkOut).getTime() - new Date(row.checkIn).getTime();
  if (ms <= 0) return "—";
  const hrs = ms / 3600000;
  return `${hrs.toFixed(1)}h`;
}

// Check-in/out are entered as branch wall-clock time (e.g. "08:05") and stored/echoed as-is —
// the backend's global DateTime serializer appends a "Z" to every timestamp in the app (used
// elsewhere for real UTC instants), but these values were never actually converted through UTC.
// Slicing the ISO string directly avoids new Date(v).toLocaleTimeString(), which would
// re-interpret that "Z" as real UTC and shift the displayed time by the viewer's browser
// timezone offset instead of showing what was actually typed in.
function timeStr(v?: string) {
  if (!v) return "—";
  return v.slice(11, 16);
}

type MarkForm = { employeeId: string; date: string; shiftId: string; checkInTime: string; checkOutTime: string; status: string; remarks: string };
const emptyMarkForm: MarkForm = { employeeId: "", date: todayStr, shiftId: "none", checkInTime: "", checkOutTime: "", status: "present", remarks: "" };

function MarkAttendanceFields({ form, setForm, onSave, saving, employees, shifts }: {
  form: MarkForm; setForm: React.Dispatch<React.SetStateAction<MarkForm>>; onSave: () => void; saving: boolean;
  employees: Employee[]; shifts: WorkShift[];
}) {
  const setS = (k: keyof MarkForm) => (v: string) => setForm(p => ({ ...p, [k]: v }));
  const set = (k: keyof MarkForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [k]: e.target.value }));
  const needsCheckIn = form.status === "present" || form.status === "late";
  return (
    <div className="mt-4 space-y-3">
      <FieldRow label="Employee" required>
        <Select value={form.employeeId} onValueChange={setS("employeeId")}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Select employee" /></SelectTrigger>
          <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</SelectItem>)}</SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Date" required><Input type="date" value={form.date} onChange={set("date")} className="h-9" /></FieldRow>
      <FieldRow label="Shift">
        <Select value={form.shiftId} onValueChange={setS("shiftId")}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No shift</SelectItem>
            {shifts.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.startTime}-{s.endTime})</SelectItem>)}
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Attendance Status" required>
        <Select value={form.status} onValueChange={setS("status")}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="present">Present</SelectItem>
            <SelectItem value="late">Late</SelectItem>
            <SelectItem value="absent">Absent</SelectItem>
            <SelectItem value="on_leave">On Leave</SelectItem>
            <SelectItem value="holiday">Holiday</SelectItem>
            <SelectItem value="half_day">Half Day</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      {needsCheckIn && (
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="Check-In Time"><Input type="time" value={form.checkInTime} onChange={set("checkInTime")} className="h-9" /></FieldRow>
          <FieldRow label="Check-Out Time"><Input type="time" value={form.checkOutTime} onChange={set("checkOutTime")} className="h-9" /></FieldRow>
        </div>
      )}
      <FieldRow label="Remarks"><Textarea value={form.remarks} onChange={set("remarks")} className="min-h-16" /></FieldRow>
      <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={onSave} disabled={saving || !form.employeeId || !form.date}>
        {saving ? "Saving…" : "Mark Attendance"}
      </Button>
    </div>
  );
}

type CorrectionForm = { shiftId: string; checkInTime: string; checkOutTime: string; status: string; correctionReason: string; correctionNote: string };

function CorrectionFields({ row, form, setForm, onSave, saving, shifts }: {
  row: StaffAttendance; form: CorrectionForm; setForm: React.Dispatch<React.SetStateAction<CorrectionForm>>; onSave: () => void; saving: boolean;
  shifts: WorkShift[];
}) {
  const { user } = useAuth();
  const setS = (k: keyof CorrectionForm) => (v: string) => setForm(p => ({ ...p, [k]: v }));
  const set = (k: keyof CorrectionForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [k]: e.target.value }));
  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-xl bg-muted/40 p-3 text-xs space-y-1">
        <p><span className="text-muted-foreground">Employee:</span> <span className="font-medium">{row.employee?.fullName}</span></p>
        <p><span className="text-muted-foreground">Date:</span> <span className="font-medium">{row.date}</span></p>
        <p><span className="text-muted-foreground">Original:</span> Check-In {timeStr(row.checkIn)} · Check-Out {timeStr(row.checkOut)} · {row.status}{row.isCorrected && " (already corrected once)"}</p>
      </div>
      <FieldRow label="Shift" required>
        <Select value={form.shiftId} onValueChange={setS("shiftId")}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{shifts.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.startTime}-{s.endTime})</SelectItem>)}</SelectContent>
        </Select>
      </FieldRow>
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Corrected Check-In"><Input type="time" value={form.checkInTime} onChange={set("checkInTime")} className="h-9" /></FieldRow>
        <FieldRow label="Corrected Check-Out"><Input type="time" value={form.checkOutTime} onChange={set("checkOutTime")} className="h-9" /></FieldRow>
      </div>
      <FieldRow label="Attendance Status" required>
        <Select value={form.status} onValueChange={setS("status")}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="present">Present</SelectItem>
            <SelectItem value="late">Late</SelectItem>
            <SelectItem value="absent">Absent</SelectItem>
            <SelectItem value="on_leave">On Leave</SelectItem>
            <SelectItem value="holiday">Holiday</SelectItem>
            <SelectItem value="half_day">Half Day</SelectItem>
            <SelectItem value="checkout_missing">Checkout Missing</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Correction Reason" required><Textarea value={form.correctionReason} onChange={set("correctionReason")} className="min-h-16" placeholder="Why is this record being corrected?" /></FieldRow>
      <FieldRow label="Correction Note"><Textarea value={form.correctionNote} onChange={set("correctionNote")} className="min-h-14" /></FieldRow>
      <FieldRow label="Corrected By"><Input value={user?.name ?? ""} disabled className="h-9" /></FieldRow>
      <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={onSave} disabled={saving || !form.correctionReason.trim()}>
        {saving ? "Saving…" : "Save Correction"}
      </Button>
    </div>
  );
}

function HrmAttendanceTab() {
  const { user } = useAuth();
  const { branches } = useBranch();
  const { canCreate, canEdit, canApprove } = usePermission("HR Attendance");
  // A View-only grant (no Approve/Edit) only unlocks the caller's OWN attendance server-side
  // (HrAttendanceController.GetAll) — branch/department/employee filters are meaningless for a
  // single-row result, so hide them rather than show controls that silently do nothing.
  const canViewAll = canApprove || canEdit;
  const branchLocked = user?.role !== "tenant_admin";

  const [rows, setRows] = useState<StaffAttendance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [branchFilter, setBranchFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [correctionFilter, setCorrectionFilter] = useState("all");
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState(todayStr);
  const [dateTo, setDateTo] = useState(todayStr);

  const [markOpen, setMarkOpen] = useState(false);
  const [markForm, setMarkForm] = useState<MarkForm>(emptyMarkForm);
  const [correctRow, setCorrectRow] = useState<StaffAttendance | null>(null);
  const [correctForm, setCorrectForm] = useState<CorrectionForm>({ shiftId: "", checkInTime: "", checkOutTime: "", status: "present", correctionReason: "", correctionNote: "" });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.getHrAttendance({
      branchId: branchLocked ? user?.branchId ?? undefined : (branchFilter === "all" ? undefined : branchFilter),
      departmentId: departmentFilter === "all" ? undefined : departmentFilter,
      employeeId: employeeFilter === "all" ? undefined : employeeFilter,
      shiftId: shiftFilter === "all" ? undefined : shiftFilter,
      status: statusFilter === "all" ? undefined : statusFilter,
      correctionStatus: correctionFilter === "all" ? undefined : correctionFilter,
      dateFrom, dateTo,
    })
      .then(r => { setRows(r); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };
  useEffect(load, [branchFilter, departmentFilter, employeeFilter, shiftFilter, statusFilter, correctionFilter, dateFrom, dateTo]);

  const visibleRows = rows.filter(r => {
    if (!q) return true;
    const needle = q.toLowerCase();
    return (r.employee?.fullName ?? "").toLowerCase().includes(needle)
      || (r.employee?.employeeCode ?? "").toLowerCase().includes(needle)
      || (r.employee?.phone ?? "").includes(q);
  });

  const handleExport = () => {
    exportRowsAsCsv(
      ["Date", "Employee", "Employee ID", "Branch", "Department", "Shift", "Check-In", "Check-Out", "Total Hours", "Status", "Late (min)", "Early Leave (min)", "Correction Status", "Remarks"],
      visibleRows.map(r => [r.date ?? "", r.employee?.fullName ?? "", r.employee?.employeeCode ?? "", r.branchId, r.employee?.department?.name ?? "", r.shift?.name ?? "", timeStr(r.checkIn), timeStr(r.checkOut), totalHours(r), r.status, r.lateMinutes, r.earlyLeaveMinutes, r.isCorrected ? "Corrected" : "Original", r.remarks ?? ""]),
      `attendance-${dateFrom}-to-${dateTo}.csv`
    );
  };
  useEffect(() => {
    api.getEmployees({ status: "active" }).then(setEmployees).catch(() => {});
    api.getDepartments({ status: "active" }).then(setDepartments).catch(() => {});
    api.getWorkShifts({ status: "active" }).then(setShifts).catch(() => {});
  }, []);

  const handleMark = async () => {
    setSaving(true);
    try {
      await api.markAttendance({
        employeeId: markForm.employeeId, date: markForm.date,
        shiftId: markForm.shiftId === "none" ? undefined : markForm.shiftId,
        checkInTime: markForm.checkInTime ? `${markForm.date}T${markForm.checkInTime}:00` : undefined,
        checkOutTime: markForm.checkOutTime ? `${markForm.date}T${markForm.checkOutTime}:00` : undefined,
        status: markForm.status, remarks: markForm.remarks || undefined,
      });
      setMarkOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to mark attendance.");
    } finally {
      setSaving(false);
    }
  };

  const openCorrection = (row: StaffAttendance) => {
    setCorrectRow(row);
    setCorrectForm({
      shiftId: row.shiftId ?? "",
      checkInTime: row.checkIn ? new Date(row.checkIn).toISOString().slice(11, 16) : "",
      checkOutTime: row.checkOut ? new Date(row.checkOut).toISOString().slice(11, 16) : "",
      status: row.status, correctionReason: "", correctionNote: "",
    });
  };

  const handleCorrect = async () => {
    if (!correctRow) return;
    setSaving(true);
    try {
      const date = correctRow.date;
      await api.correctAttendance(correctRow.id, {
        shiftId: correctForm.shiftId || undefined,
        checkInTime: correctForm.checkInTime ? `${date}T${correctForm.checkInTime}:00` : undefined,
        checkOutTime: correctForm.checkOutTime ? `${date}T${correctForm.checkOutTime}:00` : undefined,
        status: correctForm.status, correctionReason: correctForm.correctionReason, correctionNote: correctForm.correctionNote || undefined,
      });
      setCorrectRow(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save correction.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {loadError && <LoadErrorBanner onRetry={load} />}

      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, ID or phone…" className="h-9 w-48" />
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 w-40" />
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 w-40" />
        {!branchLocked && canViewAll && (
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {canViewAll && (
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {canViewAll && (
          <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>
              {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.fullName}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={shiftFilter} onValueChange={setShiftFilter}>
          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Shifts</SelectItem>
            {shifts.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="present">Present</SelectItem>
            <SelectItem value="late">Late</SelectItem>
            <SelectItem value="absent">Absent</SelectItem>
            <SelectItem value="on_leave">On Leave</SelectItem>
            <SelectItem value="holiday">Holiday</SelectItem>
            <SelectItem value="checkout_missing">Checkout Missing</SelectItem>
          </SelectContent>
        </Select>
        <Select value={correctionFilter} onValueChange={setCorrectionFilter}>
          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Original &amp; Corrected</SelectItem>
            <SelectItem value="original">Original Only</SelectItem>
            <SelectItem value="corrected">Corrected Only</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={handleExport}>
          <Download className="h-4 w-4" /> Export
        </Button>
        {canCreate && (
          <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9" onClick={() => { setMarkForm({ ...emptyMarkForm, date: dateFrom }); setMarkOpen(true); }}>
            <Plus className="h-4 w-4" /> Mark Attendance
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 font-semibold">Employee</th>
                  <th className="px-3 py-3 font-semibold">Branch</th>
                  <th className="px-3 py-3 font-semibold">Department</th>
                  <th className="px-3 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 font-semibold">Shift</th>
                  <th className="px-3 py-3 font-semibold">Check-In</th>
                  <th className="px-3 py-3 font-semibold">Check-Out</th>
                  <th className="px-3 py-3 font-semibold">Total Hours</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Late</th>
                  <th className="px-3 py-3 font-semibold">Early Leave</th>
                  <th className="px-3 py-3 font-semibold">Remarks</th>
                  <th className="px-3 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map(r => (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-3 py-3 font-semibold">
                      {r.employee?.fullName ?? "—"}
                      {r.employee?.employeeCode && <span className="block text-[11px] font-normal text-muted-foreground">{r.employee.employeeCode}{r.employee.designation?.name ? ` · ${r.employee.designation.name}` : ""}</span>}
                    </td>
                    <td className="px-3 py-3 text-xs">{branches.find(b => b.id === r.branchId)?.name ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{r.employee?.department?.name ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{r.date}</td>
                    <td className="px-3 py-3 text-xs">{r.shift?.name ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{timeStr(r.checkIn)}</td>
                    <td className="px-3 py-3 text-xs">{timeStr(r.checkOut)}</td>
                    <td className="px-3 py-3 text-xs">{totalHours(r)}</td>
                    <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-3 py-3 text-xs">{r.lateMinutes > 0 ? `${r.lateMinutes}m` : "—"}</td>
                    <td className="px-3 py-3 text-xs">{r.earlyLeaveMinutes > 0 ? `${r.earlyLeaveMinutes}m` : "—"}</td>
                    <td className="px-3 py-3 text-xs max-w-[160px] truncate" title={r.remarks}>{r.remarks ?? "—"}</td>
                    <td className="px-3 py-3">
                      {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openCorrection(r)}><Pencil className="h-3.5 w-3.5" /></Button>}
                    </td>
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr><td colSpan={13} className="text-center py-10 text-muted-foreground text-sm">No attendance records found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Sheet open={markOpen} onOpenChange={setMarkOpen}>
        <SheetContent>
          <SheetHeader><SheetTitle>Mark Attendance</SheetTitle></SheetHeader>
          <MarkAttendanceFields form={markForm} setForm={setMarkForm} onSave={handleMark} saving={saving} employees={employees} shifts={shifts} />
        </SheetContent>
      </Sheet>

      <Sheet open={!!correctRow} onOpenChange={v => !v && setCorrectRow(null)}>
        <SheetContent>
          <SheetHeader><SheetTitle>Manual Correction</SheetTitle></SheetHeader>
          {correctRow && <CorrectionFields row={correctRow} form={correctForm} setForm={setCorrectForm} onSave={handleCorrect} saving={saving} shifts={shifts} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function HrmAttendance() {
  const { canEdit, canApprove } = usePermission("HR Attendance");
  const canViewAll = canApprove || canEdit;
  return (
    <PageShell
      title="Attendance"
      subtitle={canViewAll ? "Track and manage employee attendance records" : "Your own attendance records"}
      breadcrumb={["Human Resources", "Attendance"]}
    >
      <HrmAttendanceTab />
    </PageShell>
  );
}
