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
import { api, type Designation, type Department } from "@/lib/api";
import { usePermission } from "@/lib/use-permission";
import { exportRowsAsCsv } from "@/lib/csv-export";
import { localDateStr } from "@/lib/utils";

export const Route = createFileRoute("/_app/designations")({ component: Designations });

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

type DesignationForm = { name: string; departmentId: string; grade: string; status: string };
const emptyForm: DesignationForm = { name: "", departmentId: "", grade: "", status: "active" };

function DesignationFormFields({
  form, setForm, onSave, saving, departments,
}: {
  form: DesignationForm;
  setForm: React.Dispatch<React.SetStateAction<DesignationForm>>;
  onSave: () => void;
  saving: boolean;
  departments: Department[];
}) {
  const set = (k: keyof DesignationForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));
  const setS = (k: keyof DesignationForm) => (v: string) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div className="mt-4 space-y-3">
      <FieldRow label="Designation Name"><Input value={form.name} onChange={set("name")} className="h-9" placeholder="Cashier" /></FieldRow>
      <FieldRow label="Department">
        <Select value={form.departmentId} onValueChange={setS("departmentId")}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Select department" /></SelectTrigger>
          <SelectContent>
            {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Grade / Level"><Input value={form.grade} onChange={set("grade")} className="h-9" placeholder="Grade 2" /></FieldRow>
      <FieldRow label="Status">
        <Select value={form.status} onValueChange={setS("status")}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={onSave} disabled={saving || !form.departmentId}>
        {saving ? "Saving…" : "Save Designation"}
      </Button>
    </div>
  );
}

function DesignationsTab() {
  const { canCreate, canEdit, canDelete } = usePermission("HR Master Data");
  const navigate = useNavigate();

  const [designations, setDesignations] = useState<Designation[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editDesignation, setEditDesignation] = useState<Designation | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<DesignationForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.getDesignations()
      .then(d => { setDesignations(d); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
    api.getDepartments({ status: "active" }).then(setDepartments).catch(() => {});
  };
  useEffect(load, []);

  const openEdit = (d: Designation) => {
    setEditDesignation(d);
    setForm({ name: d.name, departmentId: d.departmentId, grade: d.grade ?? "", status: d.status });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { name: form.name, departmentId: form.departmentId, grade: form.grade || undefined, status: form.status };
      if (editDesignation) {
        await api.updateDesignation(editDesignation.id, payload as Partial<Designation>);
        setEditDesignation(null);
      } else {
        await api.createDesignation(payload as Partial<Designation>);
        setCreateOpen(false);
      }
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save designation.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (d: Designation) => {
    if (!confirm(`Deactivate designation "${d.name}"?`)) return;
    try {
      await api.deleteDesignation(d.id);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete designation.");
    }
  };

  const filtered = designations.filter(d => {
    const mq = !q || d.name.toLowerCase().includes(q.toLowerCase());
    const mdep = departmentFilter === "all" || d.departmentId === departmentFilter;
    const ms = statusFilter === "all" || d.status === statusFilter;
    return mq && mdep && ms;
  });

  const handleExport = () => exportRowsAsCsv(
    ["Name", "Department", "Grade", "Status"],
    filtered.map(d => [d.name, d.department?.name ?? "", d.grade ?? "", d.status]),
    `designations-${localDateStr(new Date())}.csv`
  );

  return (
    <div className="space-y-5">
      {loadError && <LoadErrorBanner onRetry={load} />}

      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search designation…" className="h-9 w-60" />
        <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
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
          <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9" onClick={() => { setForm(emptyForm); setCreateOpen(true); }}>
            <Plus className="h-4 w-4" /> Add Designation
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
                  <th className="px-3 py-3 font-semibold">Department</th>
                  <th className="px-3 py-3 font-semibold">Grade</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(d => (
                  <tr key={d.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-3 py-3 font-semibold">{d.name}</td>
                    <td className="px-3 py-3 text-xs">{d.department?.name ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{d.grade ?? "—"}</td>
                    <td className="px-3 py-3"><StatusBadge status={d.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="View Employees" onClick={() => navigate({ to: "/employees", search: { departmentId: undefined, designationId: d.id } })}><Users className="h-3.5 w-3.5" /></Button>
                        {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(d)}><Pencil className="h-3.5 w-3.5" /></Button>}
                        {canDelete && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(d)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">No designations found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Sheet open={!!editDesignation} onOpenChange={v => !v && setEditDesignation(null)}>
        <SheetContent>
          <SheetHeader><SheetTitle>Edit Designation</SheetTitle></SheetHeader>
          <DesignationFormFields form={form} setForm={setForm} onSave={handleSave} saving={saving} departments={departments} />
        </SheetContent>
      </Sheet>

      <Sheet open={createOpen} onOpenChange={v => !v && setCreateOpen(false)}>
        <SheetContent>
          <SheetHeader><SheetTitle>Add Designation</SheetTitle></SheetHeader>
          <DesignationFormFields form={form} setForm={setForm} onSave={handleSave} saving={saving} departments={departments} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Designations() {
  return (
    <PageShell title="Designations" subtitle="Job titles linked to departments">
      <DesignationsTab />
    </PageShell>
  );
}
