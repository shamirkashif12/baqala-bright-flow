import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/module-placeholder";
import { Download, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { api, type WorkShift, type Department, type Employee } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { usePermission } from "@/lib/use-permission";
import { exportRowsAsCsv } from "@/lib/csv-export";
import { localDateStr } from "@/lib/utils";

export const Route = createFileRoute("/_app/work-shifts")({ component: WorkShifts });

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

type ShiftForm = {
  name: string; branchId: string; departmentId: string; workingDays: string[];
  startTime: string; endTime: string; breakStart: string; breakEnd: string;
  graceInMinutes: string; graceOutMinutes: string; status: string;
};
const emptyForm: ShiftForm = {
  name: "", branchId: "all", departmentId: "all", workingDays: ["Sun", "Mon", "Tue", "Wed", "Thu"],
  startTime: "09:00", endTime: "17:00", breakStart: "", breakEnd: "",
  graceInMinutes: "0", graceOutMinutes: "0", status: "active",
};

function ShiftFormFields({
  form, setForm, onSave, saving, branches, departments, branchLocked,
}: {
  form: ShiftForm;
  setForm: React.Dispatch<React.SetStateAction<ShiftForm>>;
  onSave: () => void;
  saving: boolean;
  branches: { id: string; name: string }[];
  departments: Department[];
  branchLocked: boolean;
}) {
  const set = (k: keyof ShiftForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));
  const setS = (k: keyof ShiftForm) => (v: string) => setForm(p => ({ ...p, [k]: v }));
  const toggleDay = (day: string) =>
    setForm(p => ({ ...p, workingDays: p.workingDays.includes(day) ? p.workingDays.filter(d => d !== day) : [...p.workingDays, day] }));

  const missing = !form.name || form.workingDays.length === 0 || !form.startTime || !form.endTime;

  return (
    <div className="mt-4 space-y-3">
      <FieldRow label="Shift Name"><Input value={form.name} onChange={set("name")} className="h-9" placeholder="Morning Shift" /></FieldRow>
      <FieldRow label="Branch">
        <Select value={form.branchId} onValueChange={setS("branchId")} disabled={branchLocked}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Department">
        <Select value={form.departmentId} onValueChange={setS("departmentId")}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Working Days">
        <div className="flex flex-wrap gap-2">
          {DAYS.map(day => (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              className={`h-8 px-2.5 rounded-lg text-xs font-medium border transition-colors ${form.workingDays.includes(day) ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 text-muted-foreground border-border/60"}`}
            >
              {day}
            </button>
          ))}
        </div>
      </FieldRow>
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Start Time"><Input type="time" value={form.startTime} onChange={set("startTime")} className="h-9" /></FieldRow>
        <FieldRow label="End Time"><Input type="time" value={form.endTime} onChange={set("endTime")} className="h-9" /></FieldRow>
        <FieldRow label="Break Start"><Input type="time" value={form.breakStart} onChange={set("breakStart")} className="h-9" /></FieldRow>
        <FieldRow label="Break End"><Input type="time" value={form.breakEnd} onChange={set("breakEnd")} className="h-9" /></FieldRow>
        <FieldRow label="Grace In (minutes)"><Input type="number" min="0" value={form.graceInMinutes} onChange={set("graceInMinutes")} className="h-9" /></FieldRow>
        <FieldRow label="Grace Out (minutes)"><Input type="number" min="0" value={form.graceOutMinutes} onChange={set("graceOutMinutes")} className="h-9" /></FieldRow>
      </div>
      <FieldRow label="Status">
        <Select value={form.status} onValueChange={setS("status")}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={onSave} disabled={saving || missing}>
        {saving ? "Saving…" : "Save Shift"}
      </Button>
    </div>
  );
}

function AssignShiftFields({ shift, employees, onAssign, saving }: { shift: WorkShift; employees: Employee[]; onAssign: (employeeIds: string[], effectiveFrom: string, effectiveTo: string) => void; saving: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [effectiveTo, setEffectiveTo] = useState("");

  const toggle = (id: string) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  return (
    <div className="mt-4 space-y-3">
      <FieldRow label="Effective From"><Input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} className="h-9" /></FieldRow>
      <FieldRow label="Effective To (optional)"><Input type="date" value={effectiveTo} onChange={e => setEffectiveTo(e.target.value)} className="h-9" /></FieldRow>
      <FieldRow label="Employees">
        <div className="max-h-64 overflow-y-auto border border-border/60 rounded-xl divide-y divide-border/40">
          {employees.map(e => (
            <label key={e.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/30">
              <Checkbox checked={selected.includes(e.id)} onCheckedChange={() => toggle(e.id)} />
              <span className="truncate">{e.fullName}</span>
              <span className="text-xs text-muted-foreground ml-auto font-mono">{e.employeeCode}</span>
            </label>
          ))}
        </div>
      </FieldRow>
      <Button className="w-full gradient-primary text-primary-foreground border-0" disabled={saving || selected.length === 0} onClick={() => onAssign(selected, effectiveFrom, effectiveTo)}>
        {saving ? "Assigning…" : `Assign to ${selected.length || ""} Employee${selected.length === 1 ? "" : "s"}`}
      </Button>
    </div>
  );
}

function WorkShiftsTab() {
  const { user } = useAuth();
  const { branches } = useBranch();
  const { canCreate, canEdit, canDelete, canApprove } = usePermission("HR Shifts");
  // A View-only grant (no Approve/Edit) only unlocks the caller's OWN assigned shift(s)
  // server-side (WorkShiftsController.GetAll) — branch/department/employee filters are
  // meaningless over that single-shift result, so hide them.
  const canViewAll = canApprove || canEdit;
  const branchLocked = user?.role !== "tenant_admin";

  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [branchFilter, setBranchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [workingDayFilter, setWorkingDayFilter] = useState("all");
  const [effectiveDateFilter, setEffectiveDateFilter] = useState("");
  const [employeeShiftIds, setEmployeeShiftIds] = useState<string[] | null>(null);
  const [assignments, setAssignments] = useState<{ shiftId: string; effectiveFrom: string; effectiveTo?: string }[]>([]);
  const [editShift, setEditShift] = useState<WorkShift | null>(null);
  const [assignShift, setAssignShift] = useState<WorkShift | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<ShiftForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.getWorkShifts()
      .then(s => { setShifts(s); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
    api.getDepartments({ status: "active" }).then(setDepartments).catch(() => {});
    api.getEmployees({ status: "active" }).then(setEmployees).catch(() => {});
    api.getWorkShiftAssignments({ status: "active" }).then(setAssignments).catch(() => {});
  };
  useEffect(load, []);

  // FRD 13.2 Employee filter — no "which shifts is employee X assigned to" list endpoint exists,
  // so this reuses the employee's own shift-history endpoint and filters the shift list to it.
  useEffect(() => {
    if (employeeFilter === "all") { setEmployeeShiftIds(null); return; }
    api.getEmployeeShiftHistory(employeeFilter)
      .then(history => setEmployeeShiftIds(history.filter(a => a.status === "active").map(a => a.shiftId)))
      .catch(() => setEmployeeShiftIds([]));
  }, [employeeFilter]);

  const openCreate = () => {
    setForm({ ...emptyForm, branchId: branchLocked ? (user?.branchId ?? "all") : "all" });
    setCreateOpen(true);
  };

  const openEdit = (s: WorkShift) => {
    setEditShift(s);
    setForm({
      name: s.name, branchId: s.branchId ?? "all", departmentId: s.departmentId ?? "all",
      workingDays: s.workingDays.split(",").filter(Boolean),
      startTime: s.startTime, endTime: s.endTime, breakStart: s.breakStart ?? "", breakEnd: s.breakEnd ?? "",
      graceInMinutes: String(s.graceInMinutes), graceOutMinutes: String(s.graceOutMinutes), status: s.status,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        branchId: form.branchId === "all" ? null : form.branchId,
        departmentId: form.departmentId === "all" ? null : form.departmentId,
        workingDays: form.workingDays.join(","),
        startTime: form.startTime, endTime: form.endTime,
        breakStart: form.breakStart || null, breakEnd: form.breakEnd || null,
        graceInMinutes: Number(form.graceInMinutes) || 0, graceOutMinutes: Number(form.graceOutMinutes) || 0,
        status: form.status,
      };
      if (editShift) {
        await api.updateWorkShift(editShift.id, payload as Partial<WorkShift>);
        setEditShift(null);
      } else {
        await api.createWorkShift(payload as Partial<WorkShift>);
        setCreateOpen(false);
      }
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save shift.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: WorkShift) => {
    if (!confirm(`Deactivate shift "${s.name}"?`)) return;
    try {
      await api.deleteWorkShift(s.id);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete shift.");
    }
  };

  // FRD SHF-05 — a conflicting existing assignment blocks the save (409) unless the caller
  // explicitly overrides; surface the conflicting shift(s) and let them confirm before retrying.
  const handleAssign = async (employeeIds: string[], effectiveFrom: string, effectiveTo: string, override = false) => {
    if (!assignShift) return;
    setSaving(true);
    try {
      const res = await api.assignWorkShift(assignShift.id, { employeeIds, effectiveFrom, effectiveTo: effectiveTo || undefined, override });
      toast.success(`Assigned shift to ${res.assigned} employee${res.assigned === 1 ? "" : "s"}.`);
      setAssignShift(null);
      load();
    } catch (e: any) {
      const conflicts = (e?.body as { conflicts?: { employeeName: string; conflictingShift: string; effectiveFrom: string; effectiveTo?: string }[] } | undefined)?.conflicts;
      if (e?.status === 409 && conflicts?.length) {
        const summary = conflicts.map(c => `${c.employeeName} → already on "${c.conflictingShift}" (${c.effectiveFrom}${c.effectiveTo ? ` to ${c.effectiveTo}` : " onward"})`).join("\n");
        if (confirm(`Some employees already have an overlapping shift assignment:\n\n${summary}\n\nAssign anyway? This will end their existing assignment.`)) {
          return handleAssign(employeeIds, effectiveFrom, effectiveTo, true);
        }
      } else {
        toast.error(e?.message || "Failed to assign shift.");
      }
    } finally {
      setSaving(false);
    }
  };

  // FRD 13.2 Effective Date filter — only shifts with a live assignment covering the chosen date.
  const shiftIdsEffectiveOnDate = effectiveDateFilter
    ? new Set(assignments.filter(a => a.effectiveFrom <= effectiveDateFilter && (!a.effectiveTo || a.effectiveTo >= effectiveDateFilter)).map(a => a.shiftId))
    : null;

  const filtered = shifts.filter(s => {
    const mb = branchFilter === "all" || s.branchId === branchFilter;
    const ms = statusFilter === "all" || s.status === statusFilter;
    const md = departmentFilter === "all" || s.departmentId === departmentFilter;
    const me = employeeShiftIds === null || employeeShiftIds.includes(s.id);
    const mw = workingDayFilter === "all" || s.workingDays.split(",").includes(workingDayFilter);
    const md2 = shiftIdsEffectiveOnDate === null || shiftIdsEffectiveOnDate.has(s.id);
    return mb && ms && md && me && mw && md2;
  });

  const handleExport = () => exportRowsAsCsv(
    ["Shift Name", "Branch", "Working Days", "Start", "End", "Grace In (m)", "Grace Out (m)", "Assigned", "Status"],
    filtered.map(s => [s.name, s.branch?.name ?? "All Branches", s.workingDays, s.startTime, s.endTime, s.graceInMinutes, s.graceOutMinutes, s.assignedEmployees ?? 0, s.status]),
    `shifts-${localDateStr(new Date())}.csv`
  );

  return (
    <div className="space-y-5">
      {loadError && <LoadErrorBanner onRetry={load} />}

      <div className="flex flex-wrap items-center gap-2">
        {!branchLocked && canViewAll && (
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
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
        <Select value={workingDayFilter} onValueChange={setWorkingDayFilter}>
          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Days</SelectItem>
            {DAYS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={effectiveDateFilter} onChange={e => setEffectiveDateFilter(e.target.value)} placeholder="Effective date" title="Effective Date" className="h-9 w-40" />
        {effectiveDateFilter && (
          <Button size="sm" variant="ghost" className="h-9 px-2 text-xs" onClick={() => setEffectiveDateFilter("")}>Clear date</Button>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={handleExport}>
          <Download className="h-4 w-4" /> Export
        </Button>
        {canCreate && (
          <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Create Shift
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
                  <th className="px-3 py-3 font-semibold">Shift Name</th>
                  <th className="px-3 py-3 font-semibold">Branch</th>
                  <th className="px-3 py-3 font-semibold">Working Days</th>
                  <th className="px-3 py-3 font-semibold">Timing</th>
                  <th className="px-3 py-3 font-semibold">Grace (In/Out)</th>
                  <th className="px-3 py-3 font-semibold">Assigned</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-3 py-3 font-semibold">{s.name}</td>
                    <td className="px-3 py-3 text-xs">{s.branch?.name ?? "All Branches"}</td>
                    <td className="px-3 py-3 text-xs">{s.workingDays}</td>
                    <td className="px-3 py-3 text-xs">{s.startTime} – {s.endTime}</td>
                    <td className="px-3 py-3 text-xs">{s.graceInMinutes}m / {s.graceOutMinutes}m</td>
                    <td className="px-3 py-3 text-xs">{s.assignedEmployees ?? 0}</td>
                    <td className="px-3 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1 justify-end">
                        {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7" title="Assign Employees" onClick={() => setAssignShift(s)}><Users className="h-3.5 w-3.5" /></Button>}
                        {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>}
                        {canDelete && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(s)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">No shifts found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Sheet open={!!editShift} onOpenChange={v => !v && setEditShift(null)}>
        <SheetContent>
          <SheetHeader><SheetTitle>Edit Shift</SheetTitle></SheetHeader>
          <ShiftFormFields form={form} setForm={setForm} onSave={handleSave} saving={saving} branches={branches} departments={departments} branchLocked={branchLocked} />
        </SheetContent>
      </Sheet>

      <Sheet open={createOpen} onOpenChange={v => !v && setCreateOpen(false)}>
        <SheetContent>
          <SheetHeader><SheetTitle>Create Shift</SheetTitle></SheetHeader>
          <ShiftFormFields form={form} setForm={setForm} onSave={handleSave} saving={saving} branches={branches} departments={departments} branchLocked={branchLocked} />
        </SheetContent>
      </Sheet>

      <Sheet open={!!assignShift} onOpenChange={v => !v && setAssignShift(null)}>
        <SheetContent>
          <SheetHeader><SheetTitle>Assign "{assignShift?.name}" to Employees</SheetTitle></SheetHeader>
          {assignShift && <AssignShiftFields shift={assignShift} employees={employees} onAssign={handleAssign} saving={saving} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function WorkShifts() {
  const { canEdit, canApprove } = usePermission("HR Shifts");
  const canViewAll = canApprove || canEdit;
  return (
    <PageShell
      title="Shifts"
      subtitle={canViewAll ? "Shift templates and employee schedule assignment" : "Your assigned shift(s)"}
      breadcrumb={["Human Resources", "Shifts"]}
    >
      <WorkShiftsTab />
    </PageShell>
  );
}
