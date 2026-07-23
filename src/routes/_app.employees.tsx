import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { StatusBadge } from "@/components/module-placeholder";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Eye, Pencil, Plus, Trash2, Camera, User as UserIcon, Phone, Building2, IdCard, CalendarClock, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import {
  api, type Employee, type Department, type Designation, type Role, type WorkShift, type EmployeeShiftAssignment,
  type LeaveRequest, type LeaveType, type LeavePolicy, type EmployeeDocument, type EmployeeContract, type SalaryComponent,
  type EmployeeActivityRow, type ReportExportFormat,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { usePermission } from "@/lib/use-permission";
import { fileToCompressedDataUrl, fileToDataUrl } from "@/lib/image";
import { localDateStr } from "@/lib/utils";
import { downloadBlob, exportFileExtension } from "@/lib/csv-export";
import { ReportExportButton } from "@/components/report-export-button";

export const Route = createFileRoute("/_app/employees")({
  validateSearch: (search) => ({
    departmentId: (search.departmentId as string) || undefined,
    designationId: (search.designationId as string) || undefined,
  }),
  component: Employees,
});

const todayStr = localDateStr();

function FieldRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}{required && <span className="text-destructive"> *</span>}</Label>
      {children}
    </div>
  );
}

// Prefers the real EmployeeContract record (latestContract) so a Terminated contract can
// actually surface — falls back to the Employee's own contract* fields only when no
// EmployeeContract row has ever been uploaded for them (FRD 6.2 Contract Snapshot).
function contractStatus(e: Employee): { label: string; tone: string } {
  const type = e.latestContract?.contractType ?? e.contractType;
  const openEnded = e.latestContract ? e.latestContract.openEnded : e.contractOpenEnded;
  const endDate = e.latestContract ? e.latestContract.endDate : e.contractEndDate;
  const status = e.latestContract?.status;

  if (!type) return { label: "Not Set", tone: "bg-muted text-muted-foreground" };
  if (status === "terminated") return { label: "Terminated", tone: "bg-destructive/15 text-destructive" };
  if (openEnded) return { label: "Active", tone: "bg-success/15 text-success" };
  if (!endDate) return { label: "Active", tone: "bg-success/15 text-success" };
  const days = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: "Expired", tone: "bg-destructive/15 text-destructive" };
  if (days <= 30) return { label: "Expiring Soon", tone: "bg-warning/20 text-warning-foreground" };
  return { label: "Active", tone: "bg-success/15 text-success" };
}

type EmployeeForm = {
  fullName: string; email: string; phone: string; emergencyContact: string;
  nationalId: string; iqamaExpiry: string; dateOfBirth: string; gender: string;
  nationality: string; maritalStatus: string; profileImageUrl: string;
  branchId: string; departmentId: string; designationId: string; roleId: string; leavePolicyId: string; userId: string;
  hireDate: string; employmentStatus: string;
  currentAddress: string; permanentAddress: string; sameAsCurrent: boolean;
  contractType: string; contractStartDate: string; contractEndDate: string; contractOpenEnded: boolean;
};

const emptyForm: EmployeeForm = {
  fullName: "", email: "", phone: "", emergencyContact: "",
  nationalId: "", iqamaExpiry: "", dateOfBirth: "", gender: "", nationality: "", maritalStatus: "",
  profileImageUrl: "",
  branchId: "", departmentId: "none", designationId: "none", roleId: "none", leavePolicyId: "none", userId: "none",
  hireDate: todayStr, employmentStatus: "active",
  currentAddress: "", permanentAddress: "", sameAsCurrent: false,
  contractType: "none", contractStartDate: todayStr, contractEndDate: "", contractOpenEnded: false,
};

// Module-scope — not nested inside EmployeesTab, so it never remounts on parent re-render.
function EmployeeFormFields({
  form, setForm, onSave, saving, branches, departments, designations, roles, leavePolicies, linkableUsers, branchLocked,
}: {
  form: EmployeeForm;
  setForm: React.Dispatch<React.SetStateAction<EmployeeForm>>;
  onSave: () => void;
  saving: boolean;
  branches: { id: string; name: string }[];
  departments: Department[];
  designations: Designation[];
  roles: Role[];
  leavePolicies: LeavePolicy[];
  linkableUsers: { id: string; fullName: string; email: string }[];
  branchLocked: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof EmployeeForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));
  const setS = (k: keyof EmployeeForm) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  const departmentOptions = departments.filter(d => !form.branchId || !d.branchId || d.branchId === form.branchId);
  const designationOptions = designations.filter(d => form.departmentId !== "none" && d.departmentId === form.departmentId);

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      setForm(p => ({ ...p, profileImageUrl: dataUrl }));
    } catch {
      toast.error("Failed to load image.");
    }
  };

  const missing = !form.fullName || !form.phone || !form.nationalId || !form.branchId || !form.hireDate || !form.currentAddress;

  return (
    <div className="mt-4 space-y-5">
      {/* Profile */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => fileInputRef.current?.click()} className="relative h-16 w-16 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0 border border-border/60">
          {form.profileImageUrl ? <img src={form.profileImageUrl} alt="" className="h-full w-full object-cover" /> : <UserIcon className="h-7 w-7 text-muted-foreground" />}
          <div className="absolute inset-0 bg-black/30 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity">
            <Camera className="h-5 w-5 text-white" />
          </div>
        </button>
        <div>
          <Button type="button" size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>Upload Photo</Button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Basic Information</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><FieldRow label="Full Name" required><Input value={form.fullName} onChange={set("fullName")} className="h-9" /></FieldRow></div>
          <FieldRow label="Email"><Input type="email" value={form.email} onChange={set("email")} className="h-9" /></FieldRow>
          <FieldRow label="Phone Number" required><Input value={form.phone} onChange={set("phone")} className="h-9" placeholder="+966 5XX XXX XXX" /></FieldRow>
          <FieldRow label="Emergency Contact"><Input value={form.emergencyContact} onChange={set("emergencyContact")} className="h-9" /></FieldRow>
          <FieldRow label="National ID / Iqama" required><Input value={form.nationalId} onChange={set("nationalId")} className="h-9" /></FieldRow>
          <FieldRow label="ID / Iqama Expiry"><Input type="date" value={form.iqamaExpiry} onChange={set("iqamaExpiry")} className="h-9" /></FieldRow>
          <FieldRow label="Date of Birth"><Input type="date" max={todayStr} value={form.dateOfBirth} onChange={set("dateOfBirth")} className="h-9" /></FieldRow>
          <FieldRow label="Gender">
            <Select value={form.gender || "none"} onValueChange={v => setS("gender")(v === "none" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select gender</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Nationality"><Input value={form.nationality} onChange={set("nationality")} className="h-9" /></FieldRow>
          <FieldRow label="Marital Status">
            <Select value={form.maritalStatus || "none"} onValueChange={v => setS("maritalStatus")(v === "none" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select status</SelectItem>
                <SelectItem value="single">Single</SelectItem>
                <SelectItem value="married">Married</SelectItem>
                <SelectItem value="divorced">Divorced</SelectItem>
                <SelectItem value="widowed">Widowed</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Employment Information</p>
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="Branch" required>
            <Select value={form.branchId} onValueChange={setS("branchId")} disabled={branchLocked}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Department">
            <Select value={form.departmentId} onValueChange={v => setForm(p => ({ ...p, departmentId: v, designationId: "none" }))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select department</SelectItem>
                {departmentOptions.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Designation">
            <Select value={form.designationId} onValueChange={setS("designationId")} disabled={form.departmentId === "none"}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select designation</SelectItem>
                {designationOptions.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Role (from ACL)">
            <Select value={form.roleId} onValueChange={setS("roleId")}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select role</SelectItem>
                {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Link to Login Account">
            <Select value={form.userId} onValueChange={setS("userId")}>
              <SelectTrigger className="h-9"><SelectValue placeholder="No login account" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not linked (no POS/admin login)</SelectItem>
                {linkableUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.fullName} ({u.email})</SelectItem>)}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Leave Policy">
            <Select value={form.leavePolicyId} onValueChange={setS("leavePolicyId")}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select leave policy" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not Assigned</SelectItem>
                {leavePolicies.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Hire Date" required><Input type="date" value={form.hireDate} onChange={set("hireDate")} className="h-9" /></FieldRow>
          <FieldRow label="Employment Status" required>
            <Select value={form.employmentStatus} onValueChange={setS("employmentStatus")}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="resigned">Resigned</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Address Information</p>
        <div className="grid grid-cols-1 gap-3">
          <FieldRow label="Current Address" required><Textarea value={form.currentAddress} onChange={set("currentAddress")} className="min-h-16" /></FieldRow>
          <div className="flex items-center gap-2">
            <Checkbox id="sameAsCurrent" checked={form.sameAsCurrent} onCheckedChange={v => setForm(p => ({ ...p, sameAsCurrent: !!v, permanentAddress: v ? p.currentAddress : p.permanentAddress }))} />
            <Label htmlFor="sameAsCurrent" className="text-xs font-normal">Permanent address same as current</Label>
          </div>
          {!form.sameAsCurrent && (
            <FieldRow label="Permanent Address"><Textarea value={form.permanentAddress} onChange={set("permanentAddress")} className="min-h-16" /></FieldRow>
          )}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Contract Details</p>
        <div className="grid grid-cols-2 gap-3">
          <FieldRow label="Contract Type">
            <Select value={form.contractType} onValueChange={setS("contractType")}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select contract type</SelectItem>
                <SelectItem value="Permanent">Permanent</SelectItem>
                <SelectItem value="Temporary">Temporary</SelectItem>
                <SelectItem value="Probation">Probation</SelectItem>
                <SelectItem value="Part-Time">Part-Time</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Contract Start Date"><Input type="date" value={form.contractStartDate} onChange={set("contractStartDate")} className="h-9" /></FieldRow>
          <FieldRow label="Contract End Date">
            <Input type="date" value={form.contractEndDate} onChange={set("contractEndDate")} className="h-9" disabled={form.contractOpenEnded} />
          </FieldRow>
          <div className="flex items-center gap-2 pt-6">
            <Checkbox id="openEnded" checked={form.contractOpenEnded} onCheckedChange={v => setForm(p => ({ ...p, contractOpenEnded: !!v, contractEndDate: v ? "" : p.contractEndDate }))} />
            <Label htmlFor="openEnded" className="text-xs font-normal">Open-ended contract</Label>
          </div>
        </div>
      </div>

      <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={onSave} disabled={saving || missing}>
        {saving ? "Saving…" : "Save Employee"}
      </Button>
    </div>
  );
}

function EmployeeCard({ employee, onView, onEdit, onEditTab, onDelete, onActivate, canEdit, canDelete, deleting }: {
  employee: Employee; onView: () => void; onEdit: () => void; onEditTab: (tab: string) => void; onDelete: () => void; onActivate: () => void;
  canEdit: boolean; canDelete: boolean; deleting?: boolean;
}) {
  const cs = contractStatus(employee);
  return (
    <Card className="border-border/60 shadow-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
            {employee.profileImageUrl ? <img src={employee.profileImageUrl} alt="" className="h-full w-full object-cover" /> : <UserIcon className="h-5 w-5 text-muted-foreground" />}
          </div>
          <div className="min-w-0">
            <button onClick={onView} className="font-semibold text-sm truncate hover:text-primary text-left">{employee.fullName}</button>
            <p className="text-xs text-muted-foreground font-mono">{employee.employeeCode}</p>
          </div>
        </div>
        <StatusBadge status={employee.employmentStatus} />
      </div>

      <div className="grid grid-cols-2 gap-y-1.5 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground"><Building2 className="h-3 w-3" /> {employee.branch?.name ?? "—"}</div>
        <div className="flex items-center gap-1.5 text-muted-foreground"><IdCard className="h-3 w-3" /> {employee.designation?.name ?? "—"}</div>
        <div className="col-span-2 text-muted-foreground">{employee.department?.name ?? "No department"} {employee.role?.name && `· ${employee.role.name}`}</div>
        <div className="flex items-center gap-1.5 text-muted-foreground"><Phone className="h-3 w-3" /> {employee.phone}</div>
        <div className="flex items-center gap-1.5 text-muted-foreground"><CalendarClock className="h-3 w-3" /> Hired {new Date(employee.hireDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge variant="outline" className={`text-[10px] ${cs.tone} border-0`}>{cs.label} contract</Badge>
        <Badge variant="outline" className={`text-[10px] border-0 ${employee.currentShift ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
          {employee.currentShift ? `Shift: ${employee.currentShift.shiftName}` : "Shift: Not Assigned"}
        </Badge>
        <Badge variant="outline" className={`text-[10px] border-0 ${employee.leavePolicy ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
          {employee.leavePolicy ? employee.leavePolicy.name : "Leave: Not Assigned"}
        </Badge>
        {employee.onLeaveToday && <Badge variant="outline" className="text-[10px] border-0 bg-warning/20 text-warning-foreground">On Leave</Badge>}
        <Badge variant="outline" className={`text-[10px] border-0 ${
          employee.documentStatus === "Complete" ? "bg-success/15 text-success"
          : employee.documentStatus === "Expiring Soon" ? "bg-warning/20 text-warning-foreground"
          : employee.documentStatus === "Expired" ? "bg-destructive/15 text-destructive"
          : "bg-muted text-muted-foreground"
        }`}>
          Documents: {employee.documentStatus ?? "Pending"}
        </Badge>
      </div>

      <div className="flex justify-end gap-1 pt-1 border-t border-border/40">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onView}><Eye className="h-3.5 w-3.5" /></Button>
        {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>}
        {canDelete && (
          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={onDelete} disabled={deleting}>
            {deleting ? <span className="h-3.5 w-3.5 animate-pulse text-[10px]">…</span> : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
        )}
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEditTab("documents")}>Upload Document</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEditTab("documents")}>Upload Contract</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEditTab("shifts")}>Assign Shift</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEditTab("leaves")}>Assign Leave</DropdownMenuItem>
              {employee.employmentStatus !== "active" && <DropdownMenuItem onClick={onActivate}>Activate</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </Card>
  );
}

function EmployeeShiftsSection({ employee, onChanged }: { employee: Employee; onChanged: () => void }) {
  const { canEdit } = usePermission("HR Shifts");
  const [history, setHistory] = useState<EmployeeShiftAssignment[]>([]);
  const [shifts, setShifts] = useState<WorkShift[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [shiftId, setShiftId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(localDateStr());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getEmployeeShiftHistory(employee.id).then(setHistory).catch(() => {});
    api.getWorkShifts({ status: "active" }).then(setShifts).catch(() => {});
  }, [employee.id]);

  const handleAssign = async () => {
    if (!shiftId) return;
    setSaving(true);
    try {
      await api.assignWorkShift(shiftId, { employeeIds: [employee.id], effectiveFrom });
      setAssigning(false);
      api.getEmployeeShiftHistory(employee.id).then(setHistory).catch(() => {});
      onChanged();
    } catch (e: any) {
      toast.error(e?.message || "Failed to assign shift.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Shifts</p>
        {canEdit && !assigning && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAssigning(true)}>Assign Shift</Button>
        )}
      </div>
      {assigning && (
        <div className="rounded-xl border border-border/60 p-3 space-y-2 mb-3">
          <Select value={shiftId} onValueChange={setShiftId}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Select shift" /></SelectTrigger>
            <SelectContent>{shifts.map(s => <SelectItem key={s.id} value={s.id}>{s.name} ({s.startTime}-{s.endTime})</SelectItem>)}</SelectContent>
          </Select>
          <Input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} className="h-9" />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 gradient-primary text-primary-foreground border-0" disabled={!shiftId || saving} onClick={handleAssign}>
              {saving ? "Assigning…" : "Confirm"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAssigning(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {history.length === 0 ? (
        <p className="text-xs text-muted-foreground">No shift assigned yet.</p>
      ) : (
        <div className="space-y-1.5">
          {history.map(h => (
            <div key={h.id} className="flex items-center justify-between text-xs border-b border-border/40 pb-1.5">
              <div>
                <span className="font-medium">{h.shift?.name ?? "—"}</span>
                <span className="text-muted-foreground"> · {h.effectiveFrom}{h.effectiveTo ? ` → ${h.effectiveTo}` : ""}</span>
              </div>
              <StatusBadge status={h.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// FRD 9.1 "balances" — consumed vs remaining per bucket, matched by leave type name against the
// policy's fixed Annual/Sick/Casual allotments (the only buckets a LeavePolicy tracks).
function leaveBalances(history: LeaveRequest[], policy: Employee["leavePolicy"]) {
  if (!policy) return [];
  // Match by substring, not exact equality — seeded/admin-created leave types are named
  // "Annual Leave"/"Sick Leave"/"Casual Leave" (not the bare bucket name), and an exact
  // match against "Annual"/"Sick"/"Casual" never hits, so consumed silently stayed 0 forever.
  const consumedByType = (name: string) => history
    .filter(l => l.status === "approved" && (l.leaveType?.name ?? "").toLowerCase().includes(name.toLowerCase()))
    .reduce((s, l) => s + l.totalDays, 0);
  return [
    { label: "Annual", allotted: policy.annualDays, consumed: consumedByType("Annual") },
    { label: "Sick", allotted: policy.sickDays, consumed: consumedByType("Sick") },
    { label: "Casual", allotted: policy.casualDays, consumed: consumedByType("Casual") },
  ];
}

function EmployeeLeavesSection({ employee }: { employee: Employee }) {
  const { canCreate, canEdit } = usePermission("Leave Management");
  const [history, setHistory] = useState<LeaveRequest[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leavePolicies, setLeavePolicies] = useState<LeavePolicy[]>([]);
  const [applying, setApplying] = useState(false);
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [fromDate, setFromDate] = useState(localDateStr());
  const [toDate, setToDate] = useState(localDateStr());
  const [reason, setReason] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [assigningPolicy, setAssigningPolicy] = useState(false);
  const [policyId, setPolicyId] = useState(employee.leavePolicyId ?? "");
  const [policyEffective, setPolicyEffective] = useState(localDateStr());
  const [policySaving, setPolicySaving] = useState(false);
  const [localPolicy, setLocalPolicy] = useState(employee.leavePolicy);

  const reload = () => api.getEmployeeLeaves(employee.id).then(setHistory).catch(() => {});
  useEffect(() => {
    reload();
    api.getLeaveTypes({ status: "active" }).then(setLeaveTypes).catch(() => {});
    api.getLeavePolicies({ status: "active" }).then(setLeavePolicies).catch(() => {});
  }, [employee.id]);

  const handleApply = async () => {
    if (!leaveTypeId || !reason.trim()) return;
    setSaving(true);
    try {
      await api.applyLeave({ employeeId: employee.id, leaveTypeId, fromDate, toDate, reason, attachmentUrl });
      setApplying(false);
      setReason("");
      setAttachmentUrl(undefined);
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Failed to apply leave.");
    } finally {
      setSaving(false);
    }
  };

  const handleAssignPolicy = async () => {
    setPolicySaving(true);
    try {
      const updated = await api.updateEmployee(employee.id, { ...employee, leavePolicyId: policyId || undefined, leavePolicyEffectiveFrom: policyEffective });
      setLocalPolicy(updated.leavePolicy ?? leavePolicies.find(p => p.id === policyId));
      setAssigningPolicy(false);
      toast.success("Leave policy updated.");
    } catch (e: any) {
      toast.error(e?.message || "Failed to update leave policy.");
    } finally {
      setPolicySaving(false);
    }
  };

  const balances = leaveBalances(history, localPolicy);

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leaves</p>
        {canCreate && !applying && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setApplying(true)}>Apply Leave</Button>
        )}
      </div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted-foreground">Policy: {localPolicy?.name ?? "Not Assigned"}{employee.leavePolicyEffectiveFrom && ` · effective ${employee.leavePolicyEffectiveFrom}`}</p>
        {canEdit && !assigningPolicy && (
          <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setAssigningPolicy(true)}>Assign / Update</Button>
        )}
      </div>
      {assigningPolicy && (
        <div className="rounded-xl border border-border/60 p-3 space-y-2 mb-3">
          <Select value={policyId} onValueChange={setPolicyId}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Select leave policy" /></SelectTrigger>
            <SelectContent>{leavePolicies.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <div>
            <label className="text-[11px] text-muted-foreground">Effective From</label>
            <Input type="date" value={policyEffective} onChange={e => setPolicyEffective(e.target.value)} className="h-9" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 gradient-primary text-primary-foreground border-0" disabled={policySaving} onClick={handleAssignPolicy}>
              {policySaving ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAssigningPolicy(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {balances.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {balances.map(b => (
            <div key={b.label} className="rounded-lg border border-border/50 p-2 text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{b.label}</p>
              <p className="text-sm font-semibold">{Math.max(0, b.allotted - b.consumed)}<span className="text-xs text-muted-foreground font-normal">/{b.allotted}</span></p>
            </div>
          ))}
        </div>
      )}
      {applying && (
        <div className="rounded-xl border border-border/60 p-3 space-y-2 mb-3">
          <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Select leave type" /></SelectTrigger>
            <SelectContent>{leaveTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-9" />
            <Input type="date" value={toDate} min={fromDate} onChange={e => setToDate(e.target.value)} className="h-9" />
          </div>
          <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason" className="min-h-14" />
          <Input type="file" accept=".pdf,image/*" disabled={uploading} onChange={async e => {
            const file = e.target.files?.[0];
            if (!file) return;
            setUploading(true);
            try { setAttachmentUrl(await fileToDataUrl(file)); } catch { toast.error("Failed to attach file."); } finally { setUploading(false); }
          }} className="h-9" />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 gradient-primary text-primary-foreground border-0" disabled={!leaveTypeId || !reason.trim() || saving} onClick={handleApply}>
              {saving ? "Submitting…" : "Submit"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setApplying(false)}>Cancel</Button>
          </div>
        </div>
      )}
      {history.length === 0 ? (
        <p className="text-xs text-muted-foreground">No leave requests yet.</p>
      ) : (
        <div className="space-y-1.5">
          {history.map(l => (
            <div key={l.id} className="flex items-center justify-between text-xs border-b border-border/40 pb-1.5">
              <div>
                <span className="font-medium">{l.leaveType?.name ?? "—"}</span>
                <span className="text-muted-foreground"> · {l.fromDate} → {l.toDate} ({l.totalDays}d)</span>
              </div>
              <StatusBadge status={l.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DOC_TYPES() {
  return ["Iqama / National ID", "Passport", "Health Certificate", "Work Permit", "Other"];
}

function documentStatus(doc: EmployeeDocument): { label: string; tone: string } {
  if (!doc.expiryDate) return { label: "Complete", tone: "bg-success/15 text-success" };
  const days = Math.ceil((new Date(doc.expiryDate).getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: "Expired", tone: "bg-destructive/15 text-destructive" };
  if (days <= 30) return { label: "Expiring Soon", tone: "bg-warning/20 text-warning-foreground" };
  return { label: "Complete", tone: "bg-success/15 text-success" };
}

function EmployeeDocumentsSection({ employee }: { employee: Employee }) {
  const { canEdit, canDelete } = usePermission("Employees");
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [documentType, setDocumentType] = useState(DOC_TYPES()[0]);
  const [expiryDate, setExpiryDate] = useState("");
  const [file, setFile] = useState<{ name: string; url: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = () => { api.getEmployeeDocuments(employee.id).then(setDocuments).catch(() => {}); };
  useEffect(reload, [employee.id]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const url = await fileToDataUrl(f);
      setFile({ name: f.name, url });
    } catch {
      toast.error("Failed to read file.");
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setSaving(true);
    try {
      await api.uploadEmployeeDocument(employee.id, { documentType, fileName: file.name, fileUrl: file.url, expiryDate: expiryDate || undefined });
      setUploading(false);
      setFile(null);
      setExpiryDate("");
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Failed to upload document.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("Delete this document?")) return;
    try {
      await api.deleteEmployeeDocument(employee.id, docId);
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete document.");
    }
  };

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Documents</p>
        {canEdit && !uploading && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setUploading(true)}>Upload Document</Button>
        )}
      </div>
      {uploading && (
        <div className="rounded-xl border border-border/60 p-3 space-y-2 mb-3">
          <Select value={documentType} onValueChange={setDocumentType}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{DOC_TYPES().map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} placeholder="Expiry date (optional)" className="h-9" />
          <Button size="sm" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>{file ? file.name : "Choose File (PDF/JPG/PNG)"}</Button>
          <input ref={fileInputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleFile} />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 gradient-primary text-primary-foreground border-0" disabled={!file || saving} onClick={handleUpload}>
              {saving ? "Uploading…" : "Save"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setUploading(false); setFile(null); }}>Cancel</Button>
          </div>
        </div>
      )}
      {documents.length === 0 ? (
        <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>
      ) : (
        <div className="space-y-1.5">
          {documents.map(d => {
            const st = documentStatus(d);
            return (
              <div key={d.id} className="flex items-center justify-between text-xs border-b border-border/40 pb-1.5">
                <div>
                  <span className="font-medium">{d.documentType}</span>
                  <span className="text-muted-foreground"> · {d.fileName}{d.expiryDate && ` · exp. ${d.expiryDate}`}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className={`text-[10px] border-0 ${st.tone}`}>{st.label}</Badge>
                  {canDelete && <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => handleDelete(d.id)}><Trash2 className="h-3 w-3" /></Button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EmployeeContractsSection({ employee }: { employee: Employee }) {
  const { canEdit } = usePermission("Employees");
  const [contracts, setContracts] = useState<EmployeeContract[]>([]);
  const [uploading, setUploading] = useState(false);
  const [contractType, setContractType] = useState("Permanent");
  const [startDate, setStartDate] = useState(localDateStr());
  const [endDate, setEndDate] = useState("");
  const [openEnded, setOpenEnded] = useState(false);
  const [file, setFile] = useState<{ name: string; url: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = () => { api.getEmployeeContracts(employee.id).then(setContracts).catch(() => {}); };
  useEffect(reload, [employee.id]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const url = await fileToDataUrl(f);
      setFile({ name: f.name, url });
    } catch {
      toast.error("Failed to read file.");
    }
  };

  const handleUpload = async () => {
    setSaving(true);
    try {
      await api.uploadEmployeeContract(employee.id, {
        contractType, startDate, endDate: openEnded ? undefined : (endDate || undefined), openEnded,
        fileName: file?.name, fileUrl: file?.url,
      });
      setUploading(false);
      setFile(null);
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Failed to upload contract.");
    } finally {
      setSaving(false);
    }
  };

  const handleTerminate = async (contractId: string) => {
    if (!confirm("Terminate this contract?")) return;
    try {
      await api.terminateEmployeeContract(employee.id, contractId);
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Failed to terminate contract.");
    }
  };

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contracts</p>
        {canEdit && !uploading && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setUploading(true)}>Upload Contract</Button>
        )}
      </div>
      {uploading && (
        <div className="rounded-xl border border-border/60 p-3 space-y-2 mb-3">
          <Select value={contractType} onValueChange={setContractType}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Permanent", "Temporary", "Probation", "Part-Time", "Other"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9" />
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} disabled={openEnded} className="h-9" />
          </div>
          <label className="flex items-center gap-2 text-xs">
            <Checkbox checked={openEnded} onCheckedChange={v => setOpenEnded(!!v)} /> Open-ended contract
          </label>
          <Button size="sm" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>{file ? file.name : "Choose File (optional)"}</Button>
          <input ref={fileInputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleFile} />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 gradient-primary text-primary-foreground border-0" disabled={saving} onClick={handleUpload}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setUploading(false); setFile(null); }}>Cancel</Button>
          </div>
        </div>
      )}
      {contracts.length === 0 ? (
        <p className="text-xs text-muted-foreground">No contracts uploaded yet.</p>
      ) : (
        <div className="space-y-1.5">
          {contracts.map(c => (
            <div key={c.id} className="flex items-center justify-between text-xs border-b border-border/40 pb-1.5">
              <div>
                <span className="font-medium">{c.contractType}</span>
                <span className="text-muted-foreground"> · {c.startDate} → {c.openEnded ? "Open-ended" : (c.endDate ?? "—")}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <StatusBadge status={c.status} />
                {canEdit && c.status === "active" && <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" onClick={() => handleTerminate(c.id)}>Terminate</Button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SALARY_FREQUENCIES = ["Monthly", "Weekly", "Bi-Weekly", "One-Time"];
const CUSTOM_NAME = "__custom__";
// Canonical names so payroll processing (which matches "Basic Salary" to populate the
// payslip's Basic Salary column) gets a consistent string instead of relying on free text —
// picking from this list avoids variants like "basic salary"/"Base Salary" landing here.
const EARNING_NAME_PRESETS = ["Basic Salary", "Housing Allowance", "Transport Allowance", "Food Allowance", "Overtime", "Bonus"];
const DEDUCTION_NAME_PRESETS = ["Loan Deduction", "Advance Deduction", "Absence Deduction", "GOSI / Social Insurance", "Tax Deduction"];

function EmployeeSalarySection({ employee }: { employee: Employee }) {
  const { canCreate, canEdit, canDelete } = usePermission("Payroll");
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameChoice, setNameChoice] = useState("");
  const [componentName, setComponentName] = useState("");
  const [componentType, setComponentType] = useState("Earning");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState("Monthly");
  const [effectiveFrom, setEffectiveFrom] = useState(localDateStr());
  const [effectiveTo, setEffectiveTo] = useState("");
  const [openEnded, setOpenEnded] = useState(true);
  const [status, setStatus] = useState("active");
  const [saving, setSaving] = useState(false);

  const namePresets = componentType === "Deduction" ? DEDUCTION_NAME_PRESETS : EARNING_NAME_PRESETS;
  const isCustomName = nameChoice === CUSTOM_NAME;

  const reload = () => { api.getEmployeeSalaryComponents(employee.id).then(setComponents).catch(() => {}); };
  useEffect(reload, [employee.id]);

  const resetForm = () => {
    setAdding(false); setEditingId(null); setNameChoice(""); setComponentName(""); setComponentType("Earning"); setAmount("");
    setFrequency("Monthly"); setEffectiveFrom(localDateStr()); setEffectiveTo(""); setOpenEnded(true); setStatus("active");
  };

  const changeType = (type: string) => {
    setComponentType(type);
    const presets = type === "Deduction" ? DEDUCTION_NAME_PRESETS : EARNING_NAME_PRESETS;
    if (nameChoice !== CUSTOM_NAME && !presets.includes(nameChoice)) {
      setNameChoice("");
      setComponentName("");
    }
  };

  const changeNameChoice = (choice: string) => {
    setNameChoice(choice);
    if (choice !== CUSTOM_NAME) setComponentName(choice);
    else setComponentName("");
  };

  const openEdit = (c: SalaryComponent) => {
    setEditingId(c.id);
    setAdding(false);
    const presets = c.componentType === "Deduction" ? DEDUCTION_NAME_PRESETS : EARNING_NAME_PRESETS;
    const preset = presets.find(p => p.toLowerCase() === c.componentName.toLowerCase());
    setNameChoice(preset ?? CUSTOM_NAME);
    setComponentName(c.componentName);
    setComponentType(c.componentType);
    setAmount(String(c.amount));
    setFrequency(c.frequency || "Monthly");
    setEffectiveFrom(c.effectiveFrom || localDateStr());
    setEffectiveTo(c.effectiveTo || "");
    setOpenEnded(!c.effectiveTo);
    setStatus(c.status || "active");
  };

  const handleAdd = async () => {
    if (!componentName.trim() || !amount) return;
    setSaving(true);
    try {
      await api.addSalaryComponent(employee.id, {
        componentName, componentType, amount: Number(amount), frequency, effectiveFrom,
        effectiveTo: openEnded ? undefined : (effectiveTo || undefined),
      });
      resetForm();
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Failed to add salary component.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingId || !componentName.trim() || !amount) return;
    setSaving(true);
    try {
      await api.updateSalaryComponent(employee.id, editingId, {
        componentName, componentType, amount: Number(amount), frequency, effectiveFrom,
        effectiveTo: openEnded ? undefined : (effectiveTo || undefined), status,
      });
      resetForm();
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update salary component.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (componentId: string) => {
    if (!confirm("Remove this salary component?")) return;
    try {
      await api.deleteSalaryComponent(employee.id, componentId);
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Failed to remove component.");
    }
  };

  if (components.length === 0 && !canCreate) return null; // no visibility and nothing to add

  const gross = components.filter(c => c.componentType === "Earning").reduce((s, c) => s + c.amount, 0);
  const deductions = components.filter(c => c.componentType === "Deduction").reduce((s, c) => s + c.amount, 0);
  const formOpen = adding || !!editingId;

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Salary Components</p>
        {canCreate && !formOpen && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAdding(true)}>Add Component</Button>
        )}
      </div>
      {formOpen && (
        <div className="rounded-xl border border-border/60 p-3 space-y-2 mb-3">
          <div className="grid grid-cols-2 gap-2">
            <Select value={componentType} onValueChange={changeType}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Earning">Earning</SelectItem>
                <SelectItem value="Deduction">Deduction</SelectItem>
              </SelectContent>
            </Select>
            <Select value={nameChoice} onValueChange={changeNameChoice}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select component name" /></SelectTrigger>
              <SelectContent>
                {namePresets.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                <SelectItem value={CUSTOM_NAME}>Other (type your own)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isCustomName && (
            <Input value={componentName} onChange={e => setComponentName(e.target.value)} placeholder="Component name" className="h-9" />
          )}
          <Input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount (SAR)" className="h-9" />
          <div className="grid grid-cols-2 gap-2">
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SALARY_FREQUENCIES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
            {editingId && (
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-muted-foreground">Effective From</label>
              <Input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} className="h-9" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Effective To</label>
              <Input type="date" value={effectiveTo} disabled={openEnded} onChange={e => setEffectiveTo(e.target.value)} className="h-9" />
            </div>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={openEnded} onChange={e => setOpenEnded(e.target.checked)} />
            Open-ended (no end date)
          </label>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 gradient-primary text-primary-foreground border-0" disabled={!componentName.trim() || !amount || saving} onClick={editingId ? handleUpdate : handleAdd}>
              {saving ? "Saving…" : editingId ? "Update" : "Save"}
            </Button>
            <Button size="sm" variant="outline" onClick={resetForm}>Cancel</Button>
          </div>
        </div>
      )}
      {components.length === 0 ? (
        <p className="text-xs text-muted-foreground">No salary components configured yet.</p>
      ) : (
        <div className="space-y-1.5">
          {components.map(c => (
            <div key={c.id} className="flex items-center justify-between text-xs border-b border-border/40 pb-1.5">
              <span className={c.componentType === "Deduction" ? "text-destructive" : ""}>{c.componentName}</span>
              <div className="flex items-center gap-1.5">
                <span className="font-medium">{c.componentType === "Deduction" ? "-" : ""}SAR {c.amount.toLocaleString()}</span>
                {canEdit && <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit(c)}><Pencil className="h-3 w-3" /></Button>}
                {canDelete && <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => handleDelete(c.id)}><Trash2 className="h-3 w-3" /></Button>}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between text-xs font-semibold pt-1">
            <span>Net (Gross - Deductions)</span>
            <span>SAR {(gross - deductions).toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function activitySeverityTone(s: string) {
  if (s === "critical") return "bg-destructive/15 text-destructive";
  if (s === "warning") return "bg-warning/20 text-warning-foreground";
  return "bg-muted text-muted-foreground";
}

function EmployeeActivitySection({ employee }: { employee: Employee }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<EmployeeActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.getEmployeeActivityReport({ employeeId: employee.id }).then(setRows).catch(() => {}).finally(() => setLoading(false));
  }, [employee.id]);

  const recent = rows.slice(0, 8);

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent Activity</p>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => navigate({ to: "/reports/employee-activity" })}>
          View Full Report
        </Button>
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : recent.length === 0 ? (
        <p className="text-xs text-muted-foreground">No recorded activity for this employee yet.</p>
      ) : (
        <div className="space-y-1.5">
          {recent.map(r => (
            <div key={r.id} className="flex items-start justify-between gap-2 text-xs border-b border-border/40 pb-1.5">
              <div className="min-w-0">
                <p className="font-medium truncate">{r.action}</p>
                <p className="text-muted-foreground truncate">
                  {new Date(r.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {r.performedBy ? ` · by ${r.performedBy.fullName}` : ""}
                </p>
              </div>
              <Badge variant="outline" className={`text-[10px] border-0 shrink-0 ${activitySeverityTone(r.severity)}`}>{r.severity}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EmployeeProfileDrawer({ employee, onClose, onEdit, onChanged }: { employee: Employee | null; onClose: () => void; onEdit: (e: Employee) => void; onChanged: () => void }) {
  const { canEdit } = usePermission("Employees");
  if (!employee) return <Dialog open={false} onOpenChange={() => {}}><DialogContent /></Dialog>;
  const cs = contractStatus(employee);
  const rows: [string, string][] = [
    ["Full Name", employee.fullName],
    ["Email", employee.email ?? "—"],
    ["Phone", employee.phone],
    ["Emergency Contact", employee.emergencyContact ?? "—"],
    ["National ID / Iqama", employee.nationalId],
    ["Date of Birth", employee.dateOfBirth ? new Date(employee.dateOfBirth).toLocaleDateString("en-GB") : "—"],
    ["Gender", employee.gender ?? "—"],
    ["Nationality", employee.nationality ?? "—"],
    ["Branch", employee.branch?.name ?? "—"],
    ["Department", employee.department?.name ?? "—"],
    ["Designation", employee.designation?.name ?? "—"],
    ["Assigned ACL Role", employee.role?.name ?? "—"],
    ["Hire Date", new Date(employee.hireDate).toLocaleDateString("en-GB")],
    ["Employment Status", employee.employmentStatus],
    ["Current Address", employee.currentAddress ?? "—"],
    ["Permanent Address", employee.permanentAddress ?? "—"],
    ["Contract Type", employee.contractType ?? "Not Set"],
    ["Contract Status", cs.label],
  ];
  return (
    <Dialog open={!!employee} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader className="pb-4 border-b border-border/60">
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogTitle className="text-base">{employee.fullName}</DialogTitle>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">{employee.employeeCode}</p>
            </div>
            <div className="flex items-center gap-2 pr-6">
              <StatusBadge status={employee.employmentStatus} />
              {canEdit && <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onEdit(employee)}><Pencil className="h-3.5 w-3.5" /></Button>}
            </div>
          </div>
        </DialogHeader>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
          {rows.map(([l, v]) => (
            <div key={l} className="flex justify-between gap-3 border-b border-border/40 pb-2 text-sm">
              <span className="text-muted-foreground shrink-0">{l}</span>
              <span className="font-medium text-right">{v}</span>
            </div>
          ))}
        </div>
        <EmployeeShiftsSection employee={employee} onChanged={onChanged} />
        <EmployeeLeavesSection employee={employee} />
        <EmployeeSalarySection employee={employee} />
        <EmployeeDocumentsSection employee={employee} />
        <EmployeeContractsSection employee={employee} />
        <EmployeeActivitySection employee={employee} />
      </DialogContent>
    </Dialog>
  );
}

function EmployeesTab() {
  const { user } = useAuth();
  const { branches } = useBranch();
  const search = Route.useSearch();
  const { canCreate, canEdit, canDelete, canExport } = usePermission("Employees");
  const branchLocked = user?.role !== "tenant_admin";

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [leavePolicies, setLeavePolicies] = useState<LeavePolicy[]>([]);
  const [linkableUsers, setLinkableUsers] = useState<{ id: string; fullName: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [q, setQ] = useState("");
  const [branchFilter, setBranchFilter] = useState<string[]>([]);
  const [departmentFilter, setDepartmentFilter] = useState<string[]>(search.departmentId ? [search.departmentId] : []);
  const [designationFilter, setDesignationFilter] = useState<string[]>(search.designationId ? [search.designationId] : []);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [roleFilter, setRoleFilter] = useState<string[]>([]);
  const [contractStatusFilter, setContractStatusFilter] = useState<string[]>([]);
  const [documentStatusFilter, setDocumentStatusFilter] = useState<string[]>([]);
  const [shiftFilter, setShiftFilter] = useState<string[]>([]);
  const [leaveStatusFilter, setLeaveStatusFilter] = useState<string[]>([]);
  const [shifts, setShifts] = useState<WorkShift[]>([]);

  const [viewEmployee, setViewEmployee] = useState<Employee | null>(null);
  // The employee open in the Add/Edit drawer. Null means "creating a brand-new employee, not
  // saved yet" — the Documents/Salary/Leaves/Shifts tabs stay disabled until Details is saved
  // once and this becomes non-null (FRD 6.4's tabbed Add Employee, adapted for the fact that you
  // can't attach a document/shift/leave to an employee that doesn't have an id yet).
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeEmployee, setActiveEmployee] = useState<Employee | null>(null);
  const [activeTab, setActiveTab] = useState("details");
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.getEmployees()
      .then(e => { setEmployees(e); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
    api.getDepartments({ status: "active" }).then(setDepartments).catch(() => {});
    api.getDesignations({ status: "active" }).then(setDesignations).catch(() => {});
    api.getRoles().then(setRoles).catch(() => {});
    api.getLeavePolicies({ status: "active" }).then(setLeavePolicies).catch(() => {});
    api.getWorkShifts({ status: "active" }).then(setShifts).catch(() => {});
  };
  useEffect(load, []);

  const openCreate = () => {
    setActiveEmployee(null);
    setForm({ ...emptyForm, branchId: branchLocked ? (user?.branchId ?? "") : "" });
    setActiveTab("details");
    setDrawerOpen(true);
    api.getLinkableUsers().then(setLinkableUsers).catch(() => {});
  };

  const openEdit = (e: Employee, tab: string = "details") => {
    setViewEmployee(null);
    setActiveEmployee(e);
    setActiveTab(tab);
    setDrawerOpen(true);
    api.getLinkableUsers(e.id).then(setLinkableUsers).catch(() => {});
    setForm({
      fullName: e.fullName, email: e.email ?? "", phone: e.phone, emergencyContact: e.emergencyContact ?? "",
      nationalId: e.nationalId, iqamaExpiry: e.iqamaExpiry?.slice(0, 10) ?? "", dateOfBirth: e.dateOfBirth?.slice(0, 10) ?? "",
      gender: e.gender ?? "", nationality: e.nationality ?? "", maritalStatus: e.maritalStatus ?? "",
      profileImageUrl: e.profileImageUrl ?? "",
      branchId: e.branchId, departmentId: e.departmentId ?? "none", designationId: e.designationId ?? "none", roleId: e.roleId ?? "none",
      leavePolicyId: e.leavePolicyId ?? "none", userId: e.userId ?? "none",
      hireDate: e.hireDate.slice(0, 10), employmentStatus: e.employmentStatus,
      currentAddress: e.currentAddress ?? "", permanentAddress: e.permanentAddress ?? "", sameAsCurrent: !!e.permanentAddress && e.permanentAddress === e.currentAddress,
      contractType: e.contractType ?? "none", contractStartDate: e.contractStartDate?.slice(0, 10) ?? todayStr,
      contractEndDate: e.contractEndDate?.slice(0, 10) ?? "", contractOpenEnded: e.contractOpenEnded,
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Partial<Employee> = {
        fullName: form.fullName, email: form.email || undefined, phone: form.phone,
        emergencyContact: form.emergencyContact || undefined, nationalId: form.nationalId,
        iqamaExpiry: form.iqamaExpiry || undefined, dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined, nationality: form.nationality || undefined, maritalStatus: form.maritalStatus || undefined,
        profileImageUrl: form.profileImageUrl || undefined,
        branchId: form.branchId,
        departmentId: form.departmentId === "none" ? undefined : form.departmentId,
        designationId: form.designationId === "none" ? undefined : form.designationId,
        roleId: form.roleId === "none" ? undefined : form.roleId,
        userId: form.userId === "none" ? undefined : form.userId,
        leavePolicyId: form.leavePolicyId === "none" ? undefined : form.leavePolicyId,
        hireDate: form.hireDate, employmentStatus: form.employmentStatus,
        currentAddress: form.currentAddress, permanentAddress: (form.sameAsCurrent ? form.currentAddress : form.permanentAddress) || undefined,
        contractType: form.contractType === "none" ? undefined : form.contractType,
        contractStartDate: form.contractStartDate || undefined,
        contractEndDate: form.contractOpenEnded ? undefined : (form.contractEndDate || undefined),
        contractOpenEnded: form.contractOpenEnded,
      };
      if (activeEmployee) {
        const updated = await api.updateEmployee(activeEmployee.id, payload);
        setActiveEmployee(updated);
        toast.success("Employee updated.");
      } else {
        const created = await api.createEmployee(payload);
        setActiveEmployee(created);
        toast.success("Employee created — Documents, Salary, Leaves and Shifts are now available above.");
      }
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save employee.");
    } finally {
      setSaving(false);
    }
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const handleDelete = async (e: Employee) => {
    if (!confirm(`Deactivate employee "${e.fullName}"?`)) return;
    setDeletingId(e.id);
    try {
      await api.deleteEmployee(e.id);
      toast.success(`${e.fullName} deactivated.`);
      load();
    } catch (err: any) {
      toast.error(err?.message || "Failed to deactivate employee.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleActivate = async (e: Employee) => {
    try {
      await api.updateEmployee(e.id, { ...e, employmentStatus: "active" });
      toast.success(`${e.fullName} activated.`);
      load();
    } catch (err: any) {
      toast.error(err?.message || "Failed to activate employee.");
    }
  };

  const filtered = employees.filter(e => {
    const mq = !q || e.fullName.toLowerCase().includes(q.toLowerCase()) || e.employeeCode.toLowerCase().includes(q.toLowerCase()) || e.phone.includes(q) || (e.email?.toLowerCase().includes(q.toLowerCase()) ?? false);
    const mb = !branchFilter.length || branchFilter.includes(e.branchId);
    const md = !departmentFilter.length || (!!e.departmentId && departmentFilter.includes(e.departmentId));
    const mdes = !designationFilter.length || (!!e.designationId && designationFilter.includes(e.designationId));
    const ms = !statusFilter.length || statusFilter.includes(e.employmentStatus);
    const mrole = !roleFilter.length || (!!e.roleId && roleFilter.includes(e.roleId));
    const mcontract = !contractStatusFilter.length || contractStatusFilter.includes(contractStatus(e).label.replace(" ", "-").toLowerCase());
    const mdoc = !documentStatusFilter.length || documentStatusFilter.includes(e.documentStatus ?? "Pending");
    const mshift = !shiftFilter.length || shiftFilter.some(f => f === "none" ? !e.currentShift : e.currentShift?.shiftId === f);
    const mleave = !leaveStatusFilter.length || leaveStatusFilter.some(f => f === "on_leave" ? e.onLeaveToday : f === "working" ? !e.onLeaveToday : false);
    return mq && mb && md && mdes && ms && mrole && mcontract && mdoc && mshift && mleave;
  });

  // Backend export — respects the same branch/department/designation/role/status/search filters
  // the list applies, plus ACL masking, filter-summary/generated-by/at metadata and an audit log
  // entry (FRD 4.4), unlike the previous client-side CSV built from already-loaded rows.
  const handleExport = async (format: ReportExportFormat) => {
    try {
      // exportEmployees' backend action still takes single-value filters (not yet converted to
      // arrays) — only pass a value through when exactly one is selected in the multi-select;
      // with 0 or 2+ selected we omit it rather than guess, matching "no filter" over a wrong one.
      const single = (arr: string[]) => arr.length === 1 ? arr[0] : undefined;
      const blob = await api.exportEmployees({
        branchId: single(branchFilter),
        departmentId: single(departmentFilter),
        designationId: single(designationFilter),
        roleId: single(roleFilter),
        status: single(statusFilter),
        search: q || undefined,
        exportedBy: user?.id,
        format,
      });
      downloadBlob(blob, `employees-${localDateStr()}.${exportFileExtension(format)}`);
    } catch (e: any) {
      toast.error(e?.message || "Export failed.");
    }
  };

  return (
    <div className="space-y-5">
      {loadError && <LoadErrorBanner onRetry={load} />}

      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, ID or phone…" className="h-9 w-60" />
        {!branchLocked && (
          <div className="w-40">
            <SearchableMultiSelect
              placeholder="All Branches"
              options={branches.map(b => ({ id: b.id, label: b.name }))}
              selected={branchFilter}
              onChange={setBranchFilter}
            />
          </div>
        )}
        <div className="w-44">
          <SearchableMultiSelect
            placeholder="All Departments"
            options={departments.map(d => ({ id: d.id, label: d.name }))}
            selected={departmentFilter}
            onChange={setDepartmentFilter}
          />
        </div>
        <div className="w-44">
          <SearchableMultiSelect
            placeholder="All Designations"
            options={designations.map(d => ({ id: d.id, label: d.name }))}
            selected={designationFilter}
            onChange={setDesignationFilter}
          />
        </div>
        <div className="w-36">
          <SearchableMultiSelect
            placeholder="All Statuses"
            options={[
              { id: "active", label: "Active" },
              { id: "inactive", label: "Inactive" },
              { id: "suspended", label: "Suspended" },
              { id: "resigned", label: "Resigned" },
            ]}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
        <div className="w-40">
          <SearchableMultiSelect
            placeholder="All ACL Roles"
            options={roles.map(r => ({ id: r.id, label: r.name }))}
            selected={roleFilter}
            onChange={setRoleFilter}
          />
        </div>
        <div className="w-40">
          <SearchableMultiSelect
            placeholder="All Contract Statuses"
            options={[
              { id: "active", label: "Active" },
              { id: "expiring-soon", label: "Expiring Soon" },
              { id: "expired", label: "Expired" },
              { id: "terminated", label: "Terminated" },
              { id: "not-set", label: "Not Uploaded" },
            ]}
            selected={contractStatusFilter}
            onChange={setContractStatusFilter}
          />
        </div>
        <div className="w-40">
          <SearchableMultiSelect
            placeholder="All Document Statuses"
            options={[
              { id: "Complete", label: "Complete" },
              { id: "Pending", label: "Pending" },
              { id: "Expiring Soon", label: "Expiring Soon" },
              { id: "Expired", label: "Expired" },
            ]}
            selected={documentStatusFilter}
            onChange={setDocumentStatusFilter}
          />
        </div>
        <div className="w-40">
          <SearchableMultiSelect
            placeholder="All Shifts"
            options={[{ id: "none", label: "Not Assigned" }, ...shifts.map(s => ({ id: s.id, label: s.name }))]}
            selected={shiftFilter}
            onChange={setShiftFilter}
          />
        </div>
        <div className="w-36">
          <SearchableMultiSelect
            placeholder="Leave: All"
            options={[
              { id: "working", label: "Working" },
              { id: "on_leave", label: "On Leave" },
            ]}
            selected={leaveStatusFilter}
            onChange={setLeaveStatusFilter}
          />
        </div>
        <div className="flex-1" />
        <ReportExportButton onExport={handleExport} disabled={!canExport} formats={["excel", "pdf"]} />
        {canCreate && (
          <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add Employee
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <Card className="border-border/60 shadow-card py-14 text-center text-sm text-muted-foreground">No employees found.</Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(e => (
            <EmployeeCard
              key={e.id}
              employee={e}
              onView={() => setViewEmployee(e)}
              onEdit={() => openEdit(e)}
              onEditTab={(tab) => openEdit(e, tab)}
              onDelete={() => handleDelete(e)}
              onActivate={() => handleActivate(e)}
              canEdit={canEdit}
              canDelete={canDelete}
              deleting={deletingId === e.id}
            />
          ))}
        </div>
      )}

      <EmployeeProfileDrawer employee={viewEmployee} onClose={() => setViewEmployee(null)} onEdit={openEdit} onChanged={load} />

      <Dialog open={drawerOpen} onOpenChange={v => { setDrawerOpen(v); if (!v) { setActiveEmployee(null); setActiveTab("details"); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{activeEmployee ? "Edit Employee" : "Add Employee"}</DialogTitle></DialogHeader>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
            <TabsList className="grid grid-cols-5 h-9">
              <TabsTrigger value="details" className="text-xs">Details</TabsTrigger>
              <TabsTrigger value="documents" className="text-xs" disabled={!activeEmployee}>Documents</TabsTrigger>
              <TabsTrigger value="salary" className="text-xs" disabled={!activeEmployee}>Salary</TabsTrigger>
              <TabsTrigger value="leaves" className="text-xs" disabled={!activeEmployee}>Leaves</TabsTrigger>
              <TabsTrigger value="shifts" className="text-xs" disabled={!activeEmployee}>Shifts</TabsTrigger>
            </TabsList>
            {!activeEmployee && (
              <p className="text-xs text-muted-foreground mt-2">Save Details first to unlock Documents, Salary, Leaves and Shifts.</p>
            )}
            <TabsContent value="details">
              <EmployeeFormFields form={form} setForm={setForm} onSave={handleSave} saving={saving} branches={branches} departments={departments} designations={designations} roles={roles} leavePolicies={leavePolicies} linkableUsers={linkableUsers} branchLocked={branchLocked} />
            </TabsContent>
            <TabsContent value="documents">
              {activeEmployee && <><EmployeeDocumentsSection employee={activeEmployee} /><EmployeeContractsSection employee={activeEmployee} /></>}
            </TabsContent>
            <TabsContent value="salary">
              {activeEmployee && <EmployeeSalarySection employee={activeEmployee} />}
            </TabsContent>
            <TabsContent value="leaves">
              {activeEmployee && <EmployeeLeavesSection employee={activeEmployee} />}
            </TabsContent>
            <TabsContent value="shifts">
              {activeEmployee && <EmployeeShiftsSection employee={activeEmployee} onChanged={load} />}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Employees() {
  return (
    <PageShell title="Employees" subtitle="Manage your mart's employee directory" breadcrumb={["Human Resources", "Employees"]}>
      <EmployeesTab />
    </PageShell>
  );
}
