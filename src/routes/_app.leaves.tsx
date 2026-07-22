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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/module-placeholder";
import { Check, Plus, X, Ban, Download } from "lucide-react";
import { toast } from "sonner";
import { api, type LeaveRequest, type LeaveType, type Employee, type Department } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { usePermission } from "@/lib/use-permission";
import { localDateStr } from "@/lib/utils";
import { exportRowsAsCsv } from "@/lib/csv-export";
import { useCompanyHeader } from "@/lib/use-company-header";
import { fileToDataUrl } from "@/lib/image";

export const Route = createFileRoute("/_app/leaves")({ component: Leaves });

const todayStr = localDateStr();

function FieldRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}{required && <span className="text-destructive"> *</span>}</Label>{children}</div>;
}

type ApplyForm = { employeeId: string; leaveTypeId: string; fromDate: string; toDate: string; reason: string; attachmentUrl?: string };
const emptyApplyForm: ApplyForm = { employeeId: "", leaveTypeId: "", fromDate: todayStr, toDate: todayStr, reason: "" };

function ApplyLeaveFields({ form, setForm, onSave, saving, employees, leaveTypes }: {
  form: ApplyForm; setForm: React.Dispatch<React.SetStateAction<ApplyForm>>; onSave: () => void; saving: boolean;
  employees: Employee[]; leaveTypes: LeaveType[];
}) {
  const setS = (k: keyof ApplyForm) => (v: string) => setForm(p => ({ ...p, [k]: v }));
  const set = (k: keyof ApplyForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [k]: e.target.value }));
  const totalDays = Math.max(0, Math.round((new Date(form.toDate).getTime() - new Date(form.fromDate).getTime()) / 86400000) + 1);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const url = await fileToDataUrl(file);
      setForm(p => ({ ...p, attachmentUrl: url }));
    } catch {
      toast.error("Failed to attach file.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mt-4 space-y-3">
      <FieldRow label="Employee" required>
        <Select value={form.employeeId} onValueChange={setS("employeeId")}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Select employee" /></SelectTrigger>
          <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.fullName} ({e.employeeCode})</SelectItem>)}</SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Leave Type" required>
        <Select value={form.leaveTypeId} onValueChange={setS("leaveTypeId")}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Select leave type" /></SelectTrigger>
          <SelectContent>{leaveTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
      </FieldRow>
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="From Date" required><Input type="date" value={form.fromDate} onChange={set("fromDate")} className="h-9" /></FieldRow>
        <FieldRow label="To Date" required><Input type="date" value={form.toDate} min={form.fromDate} onChange={set("toDate")} className="h-9" /></FieldRow>
      </div>
      <p className="text-xs text-muted-foreground">Total: {totalDays} day{totalDays === 1 ? "" : "s"} (server excludes holidays)</p>
      <FieldRow label="Reason" required><Textarea value={form.reason} onChange={set("reason")} className="min-h-20" /></FieldRow>
      <FieldRow label="Attachment">
        <Input type="file" accept=".pdf,image/*" disabled={uploading} onChange={e => handleFile(e.target.files?.[0])} className="h-9" />
        {form.attachmentUrl && <p className="text-xs text-success mt-1">File attached.</p>}
      </FieldRow>
      <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={onSave} disabled={saving || !form.employeeId || !form.leaveTypeId || !form.reason.trim()}>
        {saving ? "Submitting…" : "Apply Leave"}
      </Button>
    </div>
  );
}

function RejectDialog({ leave, onClose, onReject, saving }: { leave: LeaveRequest; onClose: () => void; onReject: (reason: string) => void; saving: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <Sheet open onOpenChange={v => !v && onClose()}>
      <SheetContent>
        <SheetHeader><SheetTitle>Reject Leave Request</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">{leave.employee?.fullName} · {leave.fromDate} → {leave.toDate}</p>
          <FieldRow label="Rejection Reason" required><Textarea value={reason} onChange={e => setReason(e.target.value)} className="min-h-20" /></FieldRow>
          <Button className="w-full" variant="destructive" disabled={!reason.trim() || saving} onClick={() => onReject(reason)}>
            {saving ? "Saving…" : "Reject Request"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function LeavesTab() {
  const { user } = useAuth();
  const { branches } = useBranch();
  const { canCreate, canApprove, canEdit } = usePermission("Leave Management");
  // A View-only grant (no Approve/Edit) only unlocks the caller's OWN leave requests server-side
  // (LeaveController.GetAll) — branch/department/approver filters are meaningless over that
  // single-employee result, so hide them.
  const canViewAll = canApprove || canEdit;
  const branchLocked = user?.role !== "tenant_admin";
  const companyHeader = useCompanyHeader();

  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [approverFilter, setApproverFilter] = useState("all");
  const [q, setQ] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyForm, setApplyForm] = useState<ApplyForm>(emptyApplyForm);
  const [rejectTarget, setRejectTarget] = useState<LeaveRequest | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.getLeaves()
      .then(l => { setLeaves(l); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  useEffect(() => {
    api.getLeaveTypes({ status: "active" }).then(setLeaveTypes).catch(() => {});
    api.getEmployees({ status: "active" }).then(setEmployees).catch(() => {});
    api.getDepartments({ status: "active" }).then(setDepartments).catch(() => {});
  }, []);

  const approvers = Array.from(
    new Map(leaves.filter(l => l.approver).map(l => [l.approver!.id, l.approver!])).values()
  );

  const handleApply = async () => {
    setSaving(true);
    try {
      await api.applyLeave(applyForm);
      setApplyOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to apply leave.");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (leave: LeaveRequest) => {
    try {
      await api.approveLeave(leave.id);
      toast.success("Leave approved.");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to approve leave.");
    }
  };

  const handleReject = async (reason: string) => {
    if (!rejectTarget) return;
    setSaving(true);
    try {
      await api.rejectLeave(rejectTarget.id, reason);
      setRejectTarget(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to reject leave.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (leave: LeaveRequest) => {
    if (!confirm("Cancel this pending leave request?")) return;
    try {
      await api.cancelLeave(leave.id);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to cancel leave.");
    }
  };

  const filtered = leaves.filter(l => {
    const ms = statusFilter === "all" || l.status === statusFilter;
    const mt = typeFilter === "all" || l.leaveTypeId === typeFilter;
    const effectiveBranch = branchLocked ? user?.branchId : (branchFilter === "all" ? undefined : branchFilter);
    const mb = !effectiveBranch || l.employee?.branchId === effectiveBranch;
    const md = departmentFilter === "all" || l.employee?.departmentId === departmentFilter;
    const mapprover = approverFilter === "all" || l.approverId === approverFilter;
    const mq = !q || l.employee?.fullName.toLowerCase().includes(q.toLowerCase()) || l.employee?.employeeCode.toLowerCase().includes(q.toLowerCase());
    const mdate = (!dateFrom || l.toDate >= dateFrom) && (!dateTo || l.fromDate <= dateTo);
    return ms && mt && mb && md && mapprover && mq && mdate;
  });

  const handleExport = () => {
    exportRowsAsCsv(
      ["Employee", "Employee ID", "Leave Type", "From", "To", "Days", "Reason", "Status", "Approved By", "Rejection Reason"],
      filtered.map(l => [l.employee?.fullName ?? "", l.employee?.employeeCode ?? "", l.leaveType?.name ?? "", l.fromDate, l.toDate, l.totalDays, l.reason, l.status, l.approver?.fullName ?? "", l.rejectionReason ?? ""]),
      `leave-requests-${localDateStr()}.csv`,
      companyHeader
    );
  };

  return (
    <div className="space-y-5">
      {loadError && <LoadErrorBanner onRetry={load} />}

      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search employee name or ID…" className="h-9 w-52" />
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="From" className="h-9 w-36" />
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="To" className="h-9 w-36" />
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
          <Select value={approverFilter} onValueChange={setApproverFilter}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Approvers</SelectItem>
              {approvers.map(a => <SelectItem key={a.id} value={a.id}>{a.fullName}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Leave Types</SelectItem>
            {leaveTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={handleExport}>
          <Download className="h-4 w-4" /> Export
        </Button>
        {canCreate && (
          <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9" onClick={() => { setApplyForm(emptyApplyForm); setApplyOpen(true); }}>
            <Plus className="h-4 w-4" /> Apply Leave
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
                  <th className="px-3 py-3 font-semibold">Leave Type</th>
                  <th className="px-3 py-3 font-semibold">From</th>
                  <th className="px-3 py-3 font-semibold">To</th>
                  <th className="px-3 py-3 font-semibold">Days</th>
                  <th className="px-3 py-3 font-semibold">Reason</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Approved By</th>
                  <th className="px-3 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => (
                  <tr key={l.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-3 py-3 font-semibold">{l.employee?.fullName ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{l.leaveType?.name ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{l.fromDate}</td>
                    <td className="px-3 py-3 text-xs">{l.toDate}</td>
                    <td className="px-3 py-3 text-xs">{l.totalDays}</td>
                    <td className="px-3 py-3 text-xs max-w-[180px] truncate" title={l.reason}>{l.reason}</td>
                    <td className="px-3 py-3"><StatusBadge status={l.status} /></td>
                    <td className="px-3 py-3 text-xs">{l.approver?.fullName ?? "—"}</td>
                    <td className="px-3 py-3">
                      {l.status === "pending" && (
                        <div className="flex gap-1 justify-end">
                          {canApprove && <Button size="icon" variant="ghost" className="h-7 w-7 text-success" title="Approve" onClick={() => handleApprove(l)}><Check className="h-3.5 w-3.5" /></Button>}
                          {canApprove && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Reject" onClick={() => setRejectTarget(l)}><X className="h-3.5 w-3.5" /></Button>}
                          {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" title="Cancel" onClick={() => handleCancel(l)}><Ban className="h-3.5 w-3.5" /></Button>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-10 text-muted-foreground text-sm">No leave requests found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Sheet open={applyOpen} onOpenChange={setApplyOpen}>
        <SheetContent>
          <SheetHeader><SheetTitle>Apply Leave</SheetTitle></SheetHeader>
          <ApplyLeaveFields form={applyForm} setForm={setApplyForm} onSave={handleApply} saving={saving} employees={employees} leaveTypes={leaveTypes} />
        </SheetContent>
      </Sheet>

      {rejectTarget && <RejectDialog leave={rejectTarget} onClose={() => setRejectTarget(null)} onReject={handleReject} saving={saving} />}
    </div>
  );
}

const DAY_MS = 86400000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// FRD 9.1 "Leave Calendar" — a distinct calendar view of approved/pending leaves, filterable by
// branch/department/employee/leave type; previously only the flat Leave Requests list existed.
function LeaveCalendarTab() {
  const { user } = useAuth();
  const { branches } = useBranch();
  const branchLocked = user?.role !== "tenant_admin";

  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });

  const [branchFilter, setBranchFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    api.getLeaves({ status: undefined }).then(l => setLeaves(l.filter(x => x.status === "approved" || x.status === "pending"))).catch(() => {});
    api.getEmployees({ status: "active" }).then(setEmployees).catch(() => {});
    api.getDepartments({ status: "active" }).then(setDepartments).catch(() => {});
    api.getLeaveTypes({ status: "active" }).then(setLeaveTypes).catch(() => {});
  }, []);

  const filtered = leaves.filter(l => {
    const emp = employees.find(e => e.id === l.employeeId);
    const mb = branchLocked ? emp?.branchId === user?.branchId : (branchFilter === "all" || emp?.branchId === branchFilter);
    const md = departmentFilter === "all" || emp?.departmentId === departmentFilter;
    const me = employeeFilter === "all" || l.employeeId === employeeFilter;
    const mt = typeFilter === "all" || l.leaveTypeId === typeFilter;
    return mb && md && me && mt;
  });

  const year = cursor.getFullYear(), month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1))];
  while (cells.length % 7 !== 0) cells.push(null);

  const leavesOn = (d: Date) => filtered.filter(l => {
    const from = new Date(l.fromDate + "T00:00:00").getTime();
    const to = new Date(l.toDate + "T00:00:00").getTime();
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return t >= from && t <= to;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {!branchLocked && (
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Branches</SelectItem>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Departments</SelectItem>{departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Employees</SelectItem>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.fullName}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Types</SelectItem>{leaveTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={() => setCursor(new Date(year, month - 1, 1))}>‹</Button>
        <span className="text-sm font-medium w-32 text-center">{cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</span>
        <Button size="sm" variant="outline" onClick={() => setCursor(new Date(year, month + 1, 1))}>›</Button>
      </div>

      <Card className="p-3">
        <div className="grid grid-cols-7 gap-1 text-xs">
          {WEEKDAYS.map(w => <div key={w} className="text-center font-semibold text-muted-foreground py-1">{w}</div>)}
          {cells.map((d, i) => {
            const dayLeaves = d ? leavesOn(d) : [];
            return (
              <div key={i} className={`min-h-20 rounded-lg border p-1 ${d ? "border-border/50" : "border-transparent"}`}>
                {d && <p className="text-[11px] text-muted-foreground mb-1">{d.getDate()}</p>}
                <div className="space-y-0.5">
                  {dayLeaves.slice(0, 3).map(l => (
                    <div key={l.id} title={`${l.employee?.fullName ?? employees.find(e => e.id === l.employeeId)?.fullName ?? ""} · ${l.leaveType?.name ?? ""}`}
                      className={`truncate rounded px-1 text-[10px] ${l.status === "approved" ? "bg-success/15 text-success" : "bg-warning/20 text-warning-foreground"}`}>
                      {employees.find(e => e.id === l.employeeId)?.fullName ?? "—"}
                    </div>
                  ))}
                  {dayLeaves.length > 3 && <p className="text-[10px] text-muted-foreground">+{dayLeaves.length - 3} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Leaves() {
  const { canApprove, canEdit } = usePermission("Leave Management");
  const canViewAll = canApprove || canEdit;
  return (
    <PageShell
      title="Leave Management"
      subtitle={canViewAll ? "Review and manage employee leave requests" : "Your own leave requests"}
      breadcrumb={["Human Resources", "Leave Management"]}
    >
      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">Leave Requests</TabsTrigger>
          <TabsTrigger value="calendar">Leave Calendar</TabsTrigger>
        </TabsList>
        <TabsContent value="requests"><LeavesTab /></TabsContent>
        <TabsContent value="calendar"><LeaveCalendarTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
