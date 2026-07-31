import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Pencil, Trash2, Loader2, Tag, CheckCircle2, Search,
  ToggleLeft, ToggleRight, Clock, ChevronRight, ChevronDown, Layers, CornerDownRight, FolderPlus,
} from "lucide-react";
import { api, type Category } from "@/lib/api";
import { RoleGate } from "@/components/role-gate";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/categories")({
  component: () => (
    <RoleGate allow={["tenant_admin"]}>
      <CategoriesPage />
    </RoleGate>
  ),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function FieldRow({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

const NONE_PARENT = "__none__";

// ─── Add / Edit Dialog ────────────────────────────────────────────────────

function CategoryDialog({ open, onClose, editing, presetParentId, categories, onDone }: {
  open: boolean; onClose: () => void;
  editing: Category | null;
  presetParentId?: string;
  categories: Category[];
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", nameAr: "", sortOrder: "0", isActive: true, parentId: NONE_PARENT });

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        nameAr: editing.nameAr ?? "",
        sortOrder: String(editing.sortOrder ?? 0),
        isActive: editing.isActive,
        parentId: editing.parentId ?? NONE_PARENT,
      });
    } else {
      setForm({ name: "", nameAr: "", sortOrder: "0", isActive: true, parentId: presetParentId ?? NONE_PARENT });
    }
    setError("");
  }, [editing, presetParentId, open]);

  // Only top-level categories can be a parent (subcategories are capped at one level deep), and a
  // category can never be its own parent.
  const parentOptions = categories.filter(c => !c.parentId && c.id !== editing?.id);
  const parentName = parentOptions.find(c => c.id === (presetParentId ?? form.parentId))?.name;
  const isSubcategory = form.parentId !== NONE_PARENT;
  const title = editing
    ? (isSubcategory ? "Edit Subcategory" : "Edit Category")
    : (presetParentId ? `Add Subcategory to ${parentName ?? "Category"}` : "Add Category");

  const handleSave = async () => {
    if (!form.name.trim()) return setError("Name is required.");
    setSaving(true); setError("");
    try {
      const payload: Partial<Category> = {
        name: form.name.trim(),
        nameAr: form.nameAr.trim() || undefined,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
        parentId: form.parentId === NONE_PARENT ? undefined : form.parentId,
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
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <FieldRow label={isSubcategory || presetParentId ? "Subcategory Name (English) *" : "Category Name (English) *"}>
            <Input className="h-9" value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </FieldRow>
          <FieldRow label="Name (Arabic)">
            <Input className="h-9" dir="rtl" value={form.nameAr}
              onChange={e => setForm(p => ({ ...p, nameAr: e.target.value }))} />
          </FieldRow>
          <FieldRow label="Parent Category" hint="Leave as top-level to create a category, or pick one to make this a subcategory.">
            <Select value={form.parentId} onValueChange={v => setForm(p => ({ ...p, parentId: v }))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_PARENT}>None — Top-level Category</SelectItem>
                {parentOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Sort Order">
            <Input type="number" min={0} className="h-9" placeholder="0" value={form.sortOrder}
              onChange={e => setForm(p => ({ ...p, sortOrder: e.target.value }))} />
          </FieldRow>
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Inactive entries are hidden from product forms</p>
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
          {editing ? "Save Changes" : isSubcategory ? "Create Subcategory" : "Create Category"}
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
  const [reason, setReason] = useState("");

  const handleDelete = async () => {
    if (!category) return;
    setDeleting(true); setError("");
    try {
      await api.deleteCategory(category.id, reason.trim() || undefined);
      // Always queues in the Approval Center — no self-approve bypass, even for a manager.
      toast.success("Deletion request sent for manager approval.");
      setReason("");
      onDone(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to delete."); }
    finally { setDeleting(false); }
  };

  const isSubcategory = !!category?.parentId;

  return (
    <Dialog open={!!category} onOpenChange={v => { if (!v) { setReason(""); onClose(); } }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete {isSubcategory ? "Subcategory" : "Category"}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mt-1">
          Delete <span className="font-semibold text-foreground">{category?.name}</span>? This always
          goes to a manager for approval first — even you can't action your own request — and only
          takes effect once approved. A {isSubcategory ? "subcategory" : "category"} with products or
          {isSubcategory ? "" : " subcategories"} still assigned to it can't be deleted until those are
          reassigned first.
        </p>
        <div className="mt-2">
          <Label className="text-xs">Reason (optional)</Label>
          <Textarea className="resize-none text-sm h-16 mt-1" placeholder="e.g. Merged into another category…"
            value={reason} onChange={e => setReason(e.target.value)} />
        </div>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
        <div className="flex gap-2 mt-4">
          <Button variant="outline" className="flex-1" onClick={() => { setReason(""); onClose(); }} disabled={deleting}>Cancel</Button>
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
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [addParentId, setAddParentId] = useState<string | undefined>(undefined);
  const [editItem, setEditItem] = useState<Category | null>(null);
  const [deleteItem, setDeleteItem] = useState<Category | null>(null);

  const load = () => {
    setLoading(true);
    // includeInactive so the Inactive metric card reflects reality — the visible
    // tree below still filters back down to active-only rows.
    api.getCategories({ includeInactive: true })
      .then((cats) => { setCategories(cats); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const topCategories = useMemo(
    () => categories.filter(c => !c.parentId).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [categories],
  );
  const subcategoriesOf = (parentId: string) =>
    categories.filter(c => c.parentId === parentId).slice().sort((a, b) => a.sortOrder - b.sortOrder);

  const active = categories.filter(c => c.isActive).length;
  const inactive = categories.length - active;
  const subcategoryCount = categories.length - topCategories.length;

  const matches = (c: Category) =>
    !q || c.name.toLowerCase().includes(q.toLowerCase()) || (c.nameAr ?? "").includes(q);
  const visible = (c: Category) => showInactive || c.isActive;

  const rows = topCategories
    .map(top => ({ top, children: subcategoriesOf(top.id).filter(visible) }))
    .filter(({ top, children }) => visible(top) && (
      !q || matches(top) || children.some(matches)
    ));

  const toggle = (id: string) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const openAdd = (parentId?: string) => { setAddParentId(parentId); setAddOpen(true); };
  const closeDialogs = () => { setAddOpen(false); setAddParentId(undefined); setEditItem(null); };

  return (
    <PageShell
      title="Categories"
      subtitle="Manage product categories & subcategories · used in inventory & POS"
      actions={
        <Button className="gradient-primary text-primary-foreground border-0 shadow-glow h-9 gap-1.5"
          onClick={() => openAdd(undefined)}>
          <Plus className="h-4 w-4" />Add Category
        </Button>
      }
    >
      {loadError && <LoadErrorBanner onRetry={load} />}
      {/* ── Metrics ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border/60 bg-card shadow-card p-4 flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl gradient-primary flex items-center justify-center shrink-0">
            <Tag className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Categories</p>
            <p className="text-2xl font-black">{topCategories.length}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card shadow-card p-4 flex items-center gap-4">
          <div className="h-11 w-11 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <Layers className="h-5 w-5 text-foreground" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Subcategories</p>
            <p className="text-2xl font-black">{subcategoryCount}</p>
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
            {/* Hidden inactive rows aren't part of what's currently on screen, so the tile reads 0
                to match the tree below — the "Show Inactive (N)" button is where the true count
                still surfaces, so nothing is actually hidden from the user. */}
            <p className="text-2xl font-black">{showInactive ? inactive : 0}</p>
          </div>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="h-9 pl-9 bg-muted/40" placeholder="Search categories & subcategories…"
            value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Button
          size="sm" variant={showInactive ? "default" : "outline"}
          className={`h-9 gap-1.5 text-xs ${showInactive ? "gradient-primary text-primary-foreground border-0" : ""}`}
          onClick={() => setShowInactive(v => !v)}
        >
          {showInactive ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}
          {showInactive ? "Hide Inactive" : `Show Inactive (${inactive})`}
        </Button>
      </div>

      {/* ── Tree ── */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />Loading categories…
        </div>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-card divide-y divide-border/40">
          {rows.map(({ top, children: allChildren }) => {
            const children = q ? allChildren.filter(matches) : allChildren;
            const isCollapsed = collapsed.has(top.id) && !q;
            return (
              <div key={top.id}>
                <div className="flex items-center gap-2 px-4 py-3 hover:bg-muted/20">
                  <button type="button" className="shrink-0 text-muted-foreground disabled:opacity-0"
                    disabled={children.length === 0} onClick={() => toggle(top.id)}>
                    {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <span className="font-semibold truncate" data-no-i18n>{top.name}</span>
                    {top.nameAr && <span className="text-xs text-muted-foreground" dir="rtl" data-no-i18n>{top.nameAr}</span>}
                    {children.length > 0 && (
                      <Badge variant="outline" className="text-[10px]">{children.length} subcategor{children.length === 1 ? "y" : "ies"}</Badge>
                    )}
                    {top.isActive
                      ? <Badge variant="outline" className="bg-success/15 text-success border-success/30 text-[10px] gap-1"><span className="h-1.5 w-1.5 rounded-full bg-success inline-block" />Active</Badge>
                      : <Badge variant="outline" className="text-[10px] gap-1"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground inline-block" />Inactive</Badge>}
                    {top.pendingApproval && (
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 text-[10px] gap-1" title={`Requested by ${top.pendingApproval.requestedByName ?? "—"}`}>
                        <Clock className="h-2.5 w-2.5" />Deletion Pending
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => openAdd(top.id)}>
                      <FolderPlus className="h-3.5 w-3.5" />Subcategory
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit"
                      onClick={() => setEditItem(top)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                      title={top.pendingApproval ? "Deletion already pending manager approval" : "Delete"}
                      disabled={!!top.pendingApproval}
                      onClick={() => setDeleteItem(top)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {!isCollapsed && children.map(c => (
                  <div key={c.id} className="flex items-center gap-2 pl-10 pr-4 py-2.5 bg-muted/10 hover:bg-muted/25 border-t border-border/30">
                    <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <span className="text-sm truncate" data-no-i18n>{c.name}</span>
                      {c.nameAr && <span className="text-xs text-muted-foreground" dir="rtl" data-no-i18n>{c.nameAr}</span>}
                      {c.isActive
                        ? <Badge variant="outline" className="bg-success/15 text-success border-success/30 text-[10px] gap-1"><span className="h-1.5 w-1.5 rounded-full bg-success inline-block" />Active</Badge>
                        : <Badge variant="outline" className="text-[10px] gap-1"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground inline-block" />Inactive</Badge>}
                      {c.pendingApproval && (
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 text-[10px] gap-1" title={`Requested by ${c.pendingApproval.requestedByName ?? "—"}`}>
                          <Clock className="h-2.5 w-2.5" />Deletion Pending
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit"
                        onClick={() => setEditItem(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                        title={c.pendingApproval ? "Deletion already pending manager approval" : "Delete"}
                        disabled={!!c.pendingApproval}
                        onClick={() => setDeleteItem(c)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
          {rows.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {q ? "No categories or subcategories match your search." : "No categories yet. Add one above."}
            </div>
          )}
        </Card>
      )}

      <CategoryDialog open={addOpen || !!editItem} onClose={closeDialogs}
        editing={editItem} presetParentId={editItem ? undefined : addParentId} categories={categories} onDone={load} />
      <DeleteDialog category={deleteItem} onClose={() => setDeleteItem(null)} onDone={load} />
    </PageShell>
  );
}
