import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { DataTable, Toolbar } from "@/components/module-placeholder";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pencil, Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/_app/expense-types")({ component: ExpenseTypes });

const rows = [
  { id: "ET-01", name: "Utilities", desc: "Electricity, water, internet", created: "01 Jan 26", modified: "12 May 26", by: "Abdullah", mod: "Sara" },
  { id: "ET-02", name: "Rent", desc: "Branch & warehouse rent", created: "01 Jan 26", modified: "01 Jan 26", by: "Abdullah", mod: "Abdullah" },
  { id: "ET-03", name: "Maintenance", desc: "Repairs and service contracts", created: "05 Jan 26", modified: "22 Apr 26", by: "Yousef", mod: "Yousef" },
  { id: "ET-04", name: "Marketing", desc: "Campaigns, print, social", created: "10 Jan 26", modified: "30 May 26", by: "Sara", mod: "Sara" },
  { id: "ET-05", name: "Logistics", desc: "Delivery vans, fuel", created: "15 Feb 26", modified: "18 May 26", by: "Ali", mod: "Ali" },
];

function ExpenseTypes() {
  const [edit, setEdit] = useState<any | null>(null);
  const [del, setDel] = useState<string | null>(null);
  return (
    <PageShell title="Expense Types" subtitle="Categorize every expense entry">
      <Toolbar placeholder="Search types…" extra={<Button size="sm" className="h-10 gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5" onClick={() => setEdit({})}><Plus className="h-4 w-4" /> Add Type</Button>} />
      <DataTable
        columns={[
          { key: "id", label: "ID", render: (r) => <span className="font-mono">{r.id}</span> },
          { key: "name", label: "Name", render: (r) => <span className="font-semibold">{r.name}</span> },
          { key: "desc", label: "Description" },
          { key: "created", label: "Created" },
          { key: "modified", label: "Modified" },
          { key: "by", label: "Created By" },
          { key: "mod", label: "Modified By" },
          { key: "a", label: "", render: (r) => (
            <div className="flex gap-1 justify-end">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEdit(r)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDel(r.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ) },
        ]}
        rows={rows}
      />

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Edit" : "Add"} Expense Type</DialogTitle><DialogDescription>Used to classify expense lines.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input defaultValue={edit?.name} className="mt-1" /></div>
            <div><Label>Description</Label><Textarea defaultValue={edit?.desc} className="mt-1" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button className="gradient-primary text-primary-foreground border-0" onClick={() => setEdit(null)}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!del} onOpenChange={(v) => !v && setDel(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete {del}?</DialogTitle><DialogDescription>Existing expenses will keep their type label.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDel(null)}>Cancel</Button><Button variant="destructive" onClick={() => setDel(null)}>Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}