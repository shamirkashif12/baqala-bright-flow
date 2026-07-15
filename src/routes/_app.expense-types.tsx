import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { DataTable, Toolbar } from "@/components/module-placeholder";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, type ExpenseType } from "@/lib/api";
import { usePermission } from "@/lib/use-permission";

export const Route = createFileRoute("/_app/expense-types")({ component: ExpenseTypes });

type TypeForm = { name: string; description: string };
const emptyTypeForm: TypeForm = { name: "", description: "" };

function ExpenseTypes() {
  const { canCreate, canEdit, canDelete } = usePermission("Accounting & Finance");

  const [types, setTypes] = useState<ExpenseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<ExpenseType | null>(null);
  const [form, setForm] = useState<TypeForm>(emptyTypeForm);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => {
    setLoading(true);
    api.getExpenseTypes()
      .then(setTypes)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openAdd = () => { setEdit({} as ExpenseType); setForm(emptyTypeForm); };
  const openEdit = (t: ExpenseType) => { setEdit(t); setForm({ name: t.name, description: t.description ?? "" }); };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (edit && edit.id) {
        await api.updateExpenseType(edit.id, {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          isActive: edit.isActive,
        });
      } else {
        await api.createExpenseType({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
        });
      }
      setEdit(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save expense type");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!del) return;
    setDeleting(true);
    try {
      await api.deleteExpenseType(del);
      setDel(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete expense type");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <PageShell title="Expense Types" subtitle="Categorize every expense entry">
      <Toolbar placeholder="Search types…" extra={canCreate && (
        <Button size="sm" className="h-10 gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5" onClick={openAdd}>
          <Plus className="h-4 w-4" /> Add Type
        </Button>
      )} />
      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <DataTable
          columns={[
            { key: "name", label: "Name", render: (r: ExpenseType) => <span className="font-semibold">{r.name}</span> },
            { key: "description", label: "Description", render: (r: ExpenseType) => r.description ?? "—" },
            { key: "isActive", label: "Active", render: (r: ExpenseType) => r.isActive ? "Yes" : "No" },
            { key: "createdAt", label: "Created", render: (r: ExpenseType) => new Date(r.createdAt).toLocaleDateString("en-SA") },
            { key: "a", label: "", render: (r: ExpenseType) => (
              <div className="flex gap-1 justify-end">
                {canEdit && <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>}
                {canDelete && <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDel(r.id)}><Trash2 className="h-4 w-4" /></Button>}
              </div>
            )},
          ]}
          rows={types}
        />
      )}

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Edit" : "Add"} Expense Type</DialogTitle>
            <DialogDescription>Used to classify expense lines.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="mt-1" /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground border-0" onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!del} onOpenChange={(v) => !v && setDel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete expense type?</DialogTitle>
            <DialogDescription>Existing expenses will keep their type label.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDel(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
