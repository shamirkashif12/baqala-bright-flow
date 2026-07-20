import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { StatusBadge } from "@/components/module-placeholder";
import { Download, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { api, type Department, type Employee } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { usePermission } from "@/lib/use-permission";
import { exportRowsAsCsv } from "@/lib/csv-export";
import { localDateStr } from "@/lib/utils";

export const Route = createFileRoute("/_app/departments")({ component: Departments });

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

type DepartmentForm = { name: string; branchId: string; managerEmployeeId: string; status: string };
const emptyForm: DepartmentForm = { name: "", branchId: "all", managerEmployeeId: "none", status: "active" };

// Module-scope — not nested in Departments, so it never remounts on parent re-render.
function DepartmentFormFields({
  form, setForm, onSave, saving, branches, employees, branchLocked,
}: {
  form: DepartmentForm;
  setForm: React.Dispatch<React.SetStateAction<DepartmentForm>>;
  onSave: () => void;
  saving: boolean;
  branches: { id: string; name: string }[];
  employees: Employee[];
  branchLocked: boolean;
}) {
  const set = (k: keyof DepartmentForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));
  const setS = (k: keyof DepartmentForm) => (v: string) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div className="mt-4 space-y-3">
      <FieldRow label="Department Name"><Input value={form.name} onChange={set("name")} className="h-9" placeholder="Grocery" /></FieldRow>
      <FieldRow label="Branch">
        <Select value={form.branchId} onValueChange={setS("branchId")} disabled={branchLocked}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Department Manager">
        <Select value={form.managerEmployeeId} onValueChange={setS("managerEmployeeId")}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.fullName}</SelectItem>)}
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Status">
        <Select value={form.status} onValueChange={setS("status")}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : "Save Department"}
      </Button>
    </div>
  );
}

function DepartmentsTab() {
  const { user } = useAuth();
  const { branches } = useBranch();
  const { canCreate, canEdit, canDelete } = usePermission("HR Master Data");
  const navigate = useNavigate();
  const branchLocked = user?.role !== "tenant_admin";

  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editDept, setEditDept] = useState<Department | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<DepartmentForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.getDepartments()
      .then(d => { setDepartments(d); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
    api.getEmployees().then(setEmployees).catch(() => {});
  };
  useEffect(load, []);

  const openCreate = () => {
    setForm({ ...emptyForm, branchId: branchLocked ? (user?.branchId ?? "all") : "all" });
    setCreateOpen(true);
  };

  const openEdit = (d: Department) => {
    setEditDept(d);
    setForm({ name: d.name, branchId: d.branchId ?? "all", managerEmployeeId: d.managerEmployeeId ?? "none", status: d.status });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        branchId: form.branchId === "all" ? null : form.branchId,
        managerEmployeeId: form.managerEmployeeId === "none" ? null : form.managerEmployeeId,
        status: form.status,
      };
      if (editDept) {
        await api.updateDepartment(editDept.id, payload as Partial<Department>);
        setEditDept(null);
      } else {
        await api.createDepartment(payload as Partial<Department>);
        setCreateOpen(false);
      }
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save department.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (d: Department) => {
    if (!confirm(`Deactivate department "${d.name}"?`)) return;
    try {
      await api.deleteDepartment(d.id);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete department.");
    }
  };

  const filtered = departments.filter(d => {
    const mq = !q || d.name.toLowerCase().includes(q.toLowerCase());
    const mb = branchFilter === "all" || d.branchId === branchFilter;
    const ms = statusFilter === "all" || d.status === statusFilter;
    return mq && mb && ms;
  });

  const handleExport = () => exportRowsAsCsv(
    ["Name", "Branch", "Manager", "Status"],
    filtered.map(d => [d.name, d.branch?.name ?? "All Branches", d.managerEmployee?.fullName ?? "", d.status]),
    `departments-${localDateStr(new Date())}.csv`
  );

  return (
    <div className="space-y-5">
      {loadError && <LoadErrorBanner onRetry={load} />}

      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search department…" className="h-9 w-60" />
        {!branchLocked && (
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
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={handleExport}>
          <Download className="h-4 w-4" /> Export
        </Button>
        {canCreate && (
          <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add Department
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
                  <th className="px-3 py-3 font-semibold">Name</th>
                  <th className="px-3 py-3 font-semibold">Branch</th>
                  <th className="px-3 py-3 font-semibold">Manager</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => (
                  <tr key={d.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-3 py-3 font-semibold">{d.name}</td>
                    <td className="px-3 py-3 text-xs">{d.branch?.name ?? "All Branches"}</td>
                    <td className="px-3 py-3 text-xs">{d.managerEmployee?.fullName ?? "—"}</td>
                    <td className="px-3 py-3"><StatusBadge status={d.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="View Employees" onClick={() => navigate({ to: "/employees", search: { departmentId: d.id, designationId: undefined } })}><Users className="h-3.5 w-3.5" /></Button>
                        {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(d)}><Pencil className="h-3.5 w-3.5" /></Button>}
                        {canDelete && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(d)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">No departments found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Sheet open={!!editDept} onOpenChange={v => !v && setEditDept(null)}>
        <SheetContent>
          <SheetHeader><SheetTitle>Edit Department</SheetTitle></SheetHeader>
          <DepartmentFormFields form={form} setForm={setForm} onSave={handleSave} saving={saving} branches={branches} employees={employees} branchLocked={branchLocked} />
        </SheetContent>
      </Sheet>

      <Sheet open={createOpen} onOpenChange={v => !v && setCreateOpen(false)}>
        <SheetContent>
          <SheetHeader><SheetTitle>Add Department</SheetTitle></SheetHeader>
          <DepartmentFormFields form={form} setForm={setForm} onSave={handleSave} saving={saving} branches={branches} employees={employees} branchLocked={branchLocked} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Departments() {
  return (
    <PageShell title="Departments" subtitle="Operational department master data">
      <DepartmentsTab />
    </PageShell>
  );
}
