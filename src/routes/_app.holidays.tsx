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
import { Pencil, Plus, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { api, type Holiday } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { usePermission } from "@/lib/use-permission";
import { localDateStr } from "@/lib/utils";
import { exportRowsAsCsv } from "@/lib/csv-export";

export const Route = createFileRoute("/_app/holidays")({ component: Holidays });

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

type HolidayForm = { name: string; holidayType: string; date: string; branchId: string; description: string; status: string };
const emptyForm: HolidayForm = { name: "", holidayType: "Company Holiday", date: "", branchId: "all", description: "", status: "active" };

function HolidayFormFields({
  form, setForm, onSave, saving, branches, branchLocked,
}: {
  form: HolidayForm;
  setForm: React.Dispatch<React.SetStateAction<HolidayForm>>;
  onSave: () => void;
  saving: boolean;
  branches: { id: string; name: string }[];
  branchLocked: boolean;
}) {
  const set = (k: keyof HolidayForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));
  const setS = (k: keyof HolidayForm) => (v: string) => setForm(p => ({ ...p, [k]: v }));
  return (
    <div className="mt-4 space-y-3">
      <FieldRow label="Holiday Name"><Input value={form.name} onChange={set("name")} className="h-9" placeholder="Eid-ul-Adha" /></FieldRow>
      <FieldRow label="Holiday Type">
        <Select value={form.holidayType} onValueChange={setS("holidayType")}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Company Holiday">Company Holiday</SelectItem>
            <SelectItem value="Optional Holiday">Optional Holiday</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Date"><Input type="date" value={form.date} onChange={set("date")} className="h-9" /></FieldRow>
      <FieldRow label="Branch">
        <Select value={form.branchId} onValueChange={setS("branchId")} disabled={branchLocked}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Description"><Textarea value={form.description} onChange={set("description")} className="min-h-16" placeholder="Optional description" /></FieldRow>
      <FieldRow label="Status">
        <Select value={form.status} onValueChange={setS("status")}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={onSave} disabled={saving || !form.name || !form.date}>
        {saving ? "Saving…" : "Save Holiday"}
      </Button>
    </div>
  );
}

function HolidaysTab() {
  const { user } = useAuth();
  const { branches } = useBranch();
  const { canCreate, canEdit, canDelete } = usePermission("HR Master Data");
  const branchLocked = user?.role !== "tenant_admin";

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [editHoliday, setEditHoliday] = useState<Holiday | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<HolidayForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.getHolidays()
      .then(h => { setHolidays(h); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openCreate = () => {
    setForm({ ...emptyForm, branchId: branchLocked ? (user?.branchId ?? "all") : "all" });
    setCreateOpen(true);
  };

  const openEdit = (h: Holiday) => {
    setEditHoliday(h);
    setForm({ name: h.name, holidayType: h.holidayType, date: h.date.slice(0, 10), branchId: h.branchId ?? "all", description: h.description ?? "", status: h.status });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        holidayType: form.holidayType,
        date: form.date,
        branchId: form.branchId === "all" ? null : form.branchId,
        description: form.description || undefined,
        status: form.status,
      };
      if (editHoliday) {
        await api.updateHoliday(editHoliday.id, payload as Partial<Holiday>);
        setEditHoliday(null);
      } else {
        await api.createHoliday(payload as Partial<Holiday>);
        setCreateOpen(false);
      }
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save holiday.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (h: Holiday) => {
    if (!confirm(`Deactivate holiday "${h.name}"?`)) return;
    try {
      await api.deleteHoliday(h.id);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete holiday.");
    }
  };

  const years = Array.from(new Set(holidays.map(h => new Date(h.date).getFullYear()))).sort((a, b) => b - a);

  const filtered = holidays.filter(h => {
    const mq = !q || h.name.toLowerCase().includes(q.toLowerCase());
    const mb = branchFilter === "all" || h.branchId === branchFilter;
    const mt = typeFilter === "all" || h.holidayType === typeFilter;
    const ms = statusFilter === "all" || h.status === statusFilter;
    const my = yearFilter === "all" || String(new Date(h.date).getFullYear()) === yearFilter;
    return mq && mb && mt && ms && my;
  });

  const handleExport = () => {
    exportRowsAsCsv(
      ["Name", "Date", "Type", "Branch", "Status", "Description"],
      filtered.map(h => [h.name, h.date, h.holidayType, h.branch?.name ?? "All Branches", h.status, h.description ?? ""]),
      `holidays-${localDateStr()}.csv`
    );
  };

  return (
    <div className="space-y-5">
      {loadError && <LoadErrorBanner onRetry={load} />}

      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search holiday…" className="h-9 w-56" />
        {!branchLocked && (
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="Company Holiday">Company Holiday</SelectItem>
            <SelectItem value="Optional Holiday">Optional Holiday</SelectItem>
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
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={handleExport}>
          <Download className="h-4 w-4" /> Export
        </Button>
        {canCreate && (
          <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add Holiday
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
                  <th className="px-3 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 font-semibold">Type</th>
                  <th className="px-3 py-3 font-semibold">Branch</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(h => (
                  <tr key={h.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-3 py-3 font-semibold">{h.name}</td>
                    <td className="px-3 py-3 text-xs">{new Date(h.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td className="px-3 py-3 text-xs">{h.holidayType}</td>
                    <td className="px-3 py-3 text-xs">{h.branch?.name ?? "All Branches"}</td>
                    <td className="px-3 py-3"><StatusBadge status={h.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1 justify-end">
                        {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(h)}><Pencil className="h-3.5 w-3.5" /></Button>}
                        {canDelete && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(h)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">No holidays found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Sheet open={!!editHoliday} onOpenChange={v => !v && setEditHoliday(null)}>
        <SheetContent>
          <SheetHeader><SheetTitle>Edit Holiday</SheetTitle></SheetHeader>
          <HolidayFormFields form={form} setForm={setForm} onSave={handleSave} saving={saving} branches={branches} branchLocked={branchLocked} />
        </SheetContent>
      </Sheet>

      <Sheet open={createOpen} onOpenChange={v => !v && setCreateOpen(false)}>
        <SheetContent>
          <SheetHeader><SheetTitle>Add Holiday</SheetTitle></SheetHeader>
          <HolidayFormFields form={form} setForm={setForm} onSave={handleSave} saving={saving} branches={branches} branchLocked={branchLocked} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Holidays() {
  return (
    <PageShell title="Holidays" subtitle="Branch and company holiday calendar">
      <HolidaysTab />
    </PageShell>
  );
}
