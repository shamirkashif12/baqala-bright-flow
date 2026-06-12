import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { DataTable, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, TrendingDown, BadgeDollarSign, Receipt, Plus, Trash2, Eye, Pencil, Tags } from "lucide-react";

export const Route = createFileRoute("/_app/expenses")({ component: Expenses });

const data = [
  { id: "EXP-2041", title: "Generator diesel refill", type: "Utilities", branch: "Olaya", method: "Cash", grand: "ر.س 1,250.00", paid: "ر.س 1,250.00", due: "ر.س 0.00", date: "01 Jun 26" },
  { id: "EXP-2040", title: "Cleaning supplies — Olaya", type: "Maintenance", branch: "Olaya", method: "Card", grand: "ر.س 380.00", paid: "ر.س 200.00", due: "ر.س 180.00", date: "31 May 26" },
  { id: "EXP-2039", title: "Printer maintenance contract", type: "Maintenance", branch: "All", method: "Bank Transfer", grand: "ر.س 2,400.00", paid: "ر.س 2,400.00", due: "ر.س 0.00", date: "29 May 26" },
  { id: "EXP-2038", title: "Cold storage repair — Khobar", type: "Maintenance", branch: "Khobar", method: "Card", grand: "ر.س 4,150.00", paid: "ر.س 1,000.00", due: "ر.س 3,150.00", date: "28 May 26" },
  { id: "EXP-2037", title: "Marketing — Ramadan promo", type: "Marketing", branch: "All", method: "Bank Transfer", grand: "ر.س 6,800.00", paid: "ر.س 6,800.00", due: "ر.س 0.00", date: "20 May 26" },
];

const types = [
  { id: "ET-01", name: "Utilities", desc: "Electricity, water, internet", count: 14 },
  { id: "ET-02", name: "Rent", desc: "Branch & warehouse rent", count: 6 },
  { id: "ET-03", name: "Maintenance", desc: "Repairs and service contracts", count: 22 },
  { id: "ET-04", name: "Marketing", desc: "Campaigns, print, social", count: 8 },
  { id: "ET-05", name: "Logistics", desc: "Delivery vans, fuel", count: 18 },
];

function Expenses() {
  const [view, setView] = useState<string | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const [editType, setEditType] = useState<any | null>(null);
  const [q, setQ] = useState(""); const [br, setBr] = useState("All"); const [t, setT] = useState("All"); const [m, setM] = useState("All");
  const filtered = data.filter(d =>
    (!q || `${d.id} ${d.title}`.toLowerCase().includes(q.toLowerCase())) &&
    (br === "All" || d.branch === br) && (t === "All" || d.type === t) && (m === "All" || d.method === m)
  );
  return (
    <PageShell title="Expenses" subtitle="Track every cost across all branches · categories included" actions={<AddExpenseSheet />}>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="This Month" value="ر.س 38,420" delta="-6%" trend="down" icon={Wallet} accent="primary" />
        <MetricCard label="Paid" value="ر.س 31,180" icon={BadgeDollarSign} accent="success" />
        <MetricCard label="Due" value="ر.س 7,240" icon={TrendingDown} accent="warning" />
        <MetricCard label="Entries" value="42" icon={Receipt} />
      </div>

      <Tabs defaultValue="entries">
        <TabsList>
          <TabsTrigger value="entries" className="gap-1.5"><Receipt className="h-4 w-4" />Entries</TabsTrigger>
          <TabsTrigger value="types" className="gap-1.5"><Tags className="h-4 w-4" />Expense Types</TabsTrigger>
        </TabsList>
        <TabsContent value="entries" className="mt-4 space-y-3">
          <Card className="p-3 border-border/60 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <Input placeholder="Search expense…" value={q} onChange={e => setQ(e.target.value)} className="h-9 flex-1 min-w-[160px]" />
              <Select value={br} onValueChange={setBr}><SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger><SelectContent>{["All","Olaya","Khobar","Jeddah","Madinah"].map(o => <SelectItem key={o} value={o}>{o === "All" ? "All Branches" : o}</SelectItem>)}</SelectContent></Select>
              <Select value={t} onValueChange={setT}><SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger><SelectContent>{["All",...types.map(t => t.name)].map(o => <SelectItem key={o} value={o}>{o === "All" ? "All Types" : o}</SelectItem>)}</SelectContent></Select>
              <Select value={m} onValueChange={setM}><SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger><SelectContent>{["All","Cash","Card","Bank Transfer"].map(o => <SelectItem key={o} value={o}>{o === "All" ? "All Methods" : o}</SelectItem>)}</SelectContent></Select>
              <Input type="date" className="h-9 w-[150px]" />
            </div>
          </Card>
          <DataTable columns={[
            { key: "id", label: "ID", render: r => <span className="font-mono font-semibold">{r.id}</span> },
            { key: "title", label: "Title" }, { key: "type", label: "Type" }, { key: "branch", label: "Branch" }, { key: "method", label: "Method" },
            { key: "grand", label: "Total", render: r => <span className="font-semibold">{r.grand}</span> },
            { key: "due", label: "Due" }, { key: "date", label: "Date" },
            { key: "a", label: "", render: r => <div className="flex gap-1 justify-end">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setView(r.id)}><Eye className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setView(r.id)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDel(r.id)}><Trash2 className="h-4 w-4" /></Button>
            </div> }
          ]} rows={filtered} />
        </TabsContent>
        <TabsContent value="types" className="mt-4 space-y-3">
          <div className="flex justify-end"><Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow" onClick={() => setEditType({})}><Plus className="h-4 w-4" />Add Type</Button></div>
          <DataTable columns={[
            { key: "id", label: "ID", render: r => <span className="font-mono">{r.id}</span> },
            { key: "name", label: "Name", render: r => <span className="font-semibold">{r.name}</span> },
            { key: "desc", label: "Description" },
            { key: "count", label: "Entries" },
            { key: "a", label: "", render: r => <div className="flex gap-1 justify-end">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditType(r)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
            </div> }
          ]} rows={types} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!view} onOpenChange={v => !v && setView(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Expense {view}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Title" defaultValue="Generator diesel refill" />
            <div className="grid grid-cols-2 gap-3"><Field label="Type" defaultValue="Utilities" /><Field label="Amount" defaultValue="1250" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setView(null)}>Close</Button><Button className="gradient-primary text-primary-foreground border-0" onClick={() => setView(null)}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editType} onOpenChange={v => !v && setEditType(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editType?.id ? "Edit" : "Add"} Expense Type</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Name" defaultValue={editType?.name} />
            <div className="space-y-1"><Label className="text-xs">Description</Label><Textarea defaultValue={editType?.desc} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditType(null)}>Cancel</Button><Button className="gradient-primary text-primary-foreground border-0" onClick={() => setEditType(null)}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!del} onOpenChange={v => !v && setDel(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete {del}?</DialogTitle></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDel(null)}>Cancel</Button><Button variant="destructive" onClick={() => setDel(null)}>Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function AddExpenseSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild><Button size="sm" className="h-9 gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow"><Plus className="h-4 w-4" />Add Expense</Button></SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader><SheetTitle>Add Expense</SheetTitle></SheetHeader>
        <div className="space-y-3 mt-4">
          <Field label="Title" placeholder="e.g. Refrigerator repair" />
          <div className="grid grid-cols-2 gap-3"><Field label="Type" placeholder="Utilities" /><Field label="Date" placeholder="2026-06-02" /></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Branch" placeholder="Olaya" /><Field label="Payment method" placeholder="Cash" /></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Amount" placeholder="1250" /><Field label="Paid" placeholder="1250" /></div>
          <div className="space-y-1"><Label className="text-xs">Notes</Label><Textarea rows={2} /></div>
        </div>
        <SheetFooter className="mt-4"><Button className="gradient-primary text-primary-foreground border-0">Save expense</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, defaultValue, placeholder }: { label: string; defaultValue?: string; placeholder?: string }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label><Input className="h-9" defaultValue={defaultValue} placeholder={placeholder} /></div>;
}
