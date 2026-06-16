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
import { api, type ExpenseType } from "@/lib/api";

export const Route = createFileRoute("/_app/expense-types")({ component: ExpenseTypes });

function ExpenseTypes() {
  const [types, setTypes] = useState<ExpenseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<ExpenseType | null>(null);
  const [del, setDel] = useState<string | null>(null);

  useEffect(() => {
    api.getExpenseTypes()
      .then(setTypes)
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageShell title="Expense Types" subtitle="Categorize every expense entry">
      <Toolbar placeholder="Search types…" extra={<Button size="sm" className="h-10 gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5" onClick={() => setEdit({} as ExpenseType)}><Plus className="h-4 w-4" /> Add Type</Button>} />
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
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEdit(r)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDel(r.id)}><Trash2 className="h-4 w-4" /></Button>
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
            <div><Label>Name</Label><Input defaultValue={edit?.name ?? ""} className="mt-1" /></div>
            <div><Label>Description</Label><Textarea defaultValue={edit?.description ?? ""} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground border-0" onClick={() => setEdit(null)}>Save</Button>
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
            <Button variant="destructive" onClick={() => setDel(null)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
