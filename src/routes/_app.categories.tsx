import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Plus, Pencil, Trash2, Loader2, Tag, CheckCircle2, Search,
  ToggleLeft, ToggleRight,
} from "lucide-react";
import { api, type Category } from "@/lib/api";
import { RoleGate } from "@/components/role-gate";

export const Route = createFileRoute("/_app/categories")({
  component: () => (
    <RoleGate allow={["tenant_admin"]}>
      <CategoriesPage />
    </RoleGate>
  ),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs font-medium">{label}</Label>{children}</div>;
}

// ─── Add / Edit Dialog ────────────────────────────────────────────────────────

function CategoryDialog({ open, onClose, editing, onDone }: {
  open: boolean; onClose: () => void;
  editing: Category | null;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", nameAr: "", sortOrder: "0", isActive: true });

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        nameAr: editing.nameAr ?? "",
        sortOrder: String(editing.sortOrder ?? 0),
        isActive: editing.isActive,
      });
    } else {
      setForm({ name: "", nameAr: "", sortOrder: "0", isActive: true });
    }
    setError("");
  }, [editing, open]);

  const handleSave = async () => {
    if (!form.name.trim()) return setError("Category name is required.");
    setSaving(true); setError("");
    try {
      const payload: Partial<Category> = {
        name: form.name.trim(),
        nameAr: form.nameAr.trim() || undefined,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      };
      if (editing) {
        await api.updateCategory(editing.id, payload);
      } else {
        await api.createCategory(payload);
      }
      onDone(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save."); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Category" : "Add Category"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <FieldRow label="Category Name (English) *">
            <Input className="h-9" placeholder="e.g. Dairy & Eggs" value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </FieldRow>
          <FieldRow label="Category Name (Arabic)">
            <Input className="h-9" dir="rtl" placeholder="مثال: الألبان والبيض" value={form.nameAr}
              onChange={e => setForm(p => ({ ...p, nameAr: e.target.value }))} />
          </FieldRow>
          <FieldRow label="Sort Order">
            <Input type="number" min={0} className="h-9" placeholder="0" value={form.sortOrder}
              onChange={e => setForm(p => ({ ...p, sortOrder: e.target.value }))} />
          </FieldRow>
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Inactive categories are hidden from product forms</p>
            </div>
            <button type="button" onClick={() => setForm(p => ({ ...p, isActive: !p.isActive }))}>
              {form.isActive
                ? <ToggleRight className="h-7 w-7 text-primary" />
                : <ToggleLeft className="h-7 w-7 text-muted-foreground" />}
            </button>
          </div>
        </div>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
        <Button className="w-full gradient-primary text-primary-foreground border-0 shadow-glow mt-2"
          onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          {editing ? "Save Changes" : "Create Category"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────

function DeleteDialog({ category, onClose, onDone }: {
  category: Category | null; onClose: () => void; onDone: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async () => {
    if (!category) return;
    setDeleting(true); setError("");
    try {
      await api.deleteCategory(category.id);
      onDone(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to delete."); }
    finally { setDeleting(false); }
  };

  return (
    <Dialog open={!!category} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Category</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mt-1">
          Are you sure you want to delete <span className="font-semibold text-foreground">{category?.name}</span>?
          Products assigned to this category will become uncategorised.
        </p>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
        <div className="flex gap-2 mt-4">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={deleting}>Cancel</Button>
          <Button variant="destructive" className="flex-1" onClick={handleDelete} disabled={deleting}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editItem, setEditItem] = useState<Category | null>(null);
  const [deleteItem, setDeleteItem] = useState<Category | null>(null);

  const load = () => {
    setLoading(true);
    api.getCategories()
      .then(setCategories)
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = categories.filter(c =>
    !q || c.name.toLowerCase().includes(q.toLowerCase()) || (c.nameAr ?? "").includes(q),
  );

  const active = categories.filter(c => c.isActive).length;
  const inactive = categories.length - active;

  return (
    <PageShell
      title="Categories"
      subtitle="Manage product categories · used in inventory & POS"
      actions={
        <Button className="gradient-primary text-primary-foreground border-0 shadow-glow h-9 gap-1.5"
          onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />Add Category
        </Button>
      }
    >
      {/* ── Metrics ── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl border border-border/60 bg-card shadow-card p-4 flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl gradient-primary flex items-center justify-center shrink-0">
            <Tag className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</p>
            <p className="text-2xl font-black">{categories.length}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-success/30 bg-success/5 shadow-card p-4 flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-success/20 flex items-center justify-center shrink-0">
            <ToggleRight className="h-5 w-5 text-success" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Active</p>
            <p className="text-2xl font-black text-success">{active}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card shadow-card p-4 flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <ToggleLeft className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Inactive</p>
            <p className="text-2xl font-black">{inactive}</p>
          </div>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="h-9 pl-9 bg-muted/40" placeholder="Search categories…"
          value={q} onChange={e => setQ(e.target.value)} />
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />Loading categories…
        </div>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Arabic Name</th>
                  <th className="px-4 py-3 font-semibold">Sort Order</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="border-b border-border/40 hover:bg-muted/20 last:border-0">
                    <td className="px-4 py-3 font-semibold">{c.name}</td>
                    <td className="px-4 py-3 text-sm" dir="rtl">{c.nameAr || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">{c.sortOrder}</td>
                    <td className="px-4 py-3">
                      {c.isActive
                        ? <Badge variant="outline" className="bg-success/15 text-success border-success/30 text-xs gap-1"><span className="h-1.5 w-1.5 rounded-full bg-success inline-block" />Active</Badge>
                        : <Badge variant="outline" className="text-xs gap-1"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground inline-block" />Inactive</Badge>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit"
                          onClick={() => setEditItem(c)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete"
                          onClick={() => setDeleteItem(c)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-muted-foreground text-sm">
                      {q ? "No categories match your search." : "No categories yet. Add one above."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <CategoryDialog open={addOpen || !!editItem} onClose={() => { setAddOpen(false); setEditItem(null); }}
        editing={editItem} onDone={load} />
      <DeleteDialog category={deleteItem} onClose={() => setDeleteItem(null)} onDone={load} />
    </PageShell>
  );
}
