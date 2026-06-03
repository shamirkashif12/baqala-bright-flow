import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { DataTable, Toolbar } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, TrendingDown, BadgeDollarSign, Receipt, Plus, Trash2, Eye, Pencil } from "lucide-react";

export const Route = createFileRoute("/_app/expenses")({ component: Expenses });

const data = [
  { id: "EXP-2041", title: "Generator diesel refill", grand: "ر.س 1,250.00", paid: "ر.س 1,250.00", due: "ر.س 0.00", currency: "SAR", date: "01 Jun 26" },
  { id: "EXP-2040", title: "Cleaning supplies — Olaya", grand: "ر.س 380.00", paid: "ر.س 200.00", due: "ر.س 180.00", currency: "SAR", date: "31 May 26" },
  { id: "EXP-2039", title: "Printer maintenance contract", grand: "ر.س 2,400.00", paid: "ر.س 2,400.00", due: "ر.س 0.00", currency: "SAR", date: "29 May 26" },
  { id: "EXP-2038", title: "Cold storage repair — Khobar", grand: "ر.س 4,150.00", paid: "ر.س 1,000.00", due: "ر.س 3,150.00", currency: "SAR", date: "28 May 26" },
  { id: "EXP-2037", title: "Marketing — Ramadan promo", grand: "ر.س 6,800.00", paid: "ر.س 6,800.00", due: "ر.س 0.00", currency: "SAR", date: "20 May 26" },
];

function Expenses() {
  const [add, setAdd] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const [del, setDel] = useState<string | null>(null);
  const [items, setItems] = useState([{ type: "Utilities", desc: "Electricity Olaya", qty: 1, unit: 1850, total: 1850 }]);
  const subtotal = items.reduce((s, i) => s + i.total, 0);

  return (
    <PageShell title="Expenses" subtitle="Track every cost across all branches">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="This Month" value="ر.س 38,420" delta="-6%" trend="down" icon={Wallet} accent="primary" />
        <MetricCard label="Paid" value="ر.س 31,180" icon={BadgeDollarSign} accent="success" />
        <MetricCard label="Due" value="ر.س 7,240" icon={TrendingDown} accent="warning" />
        <MetricCard label="Entries" value="42" icon={Receipt} />
      </div>

      <Toolbar placeholder="Search expense…" extra={<Button size="sm" className="h-10 gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5" onClick={() => setAdd(true)}><Plus className="h-4 w-4" /> Add Expense</Button>} />

      <DataTable
        columns={[
          { key: "id", label: "ID", render: (r) => <span className="font-mono font-semibold">{r.id}</span> },
          { key: "title", label: "Title" },
          { key: "grand", label: "Grand Total", render: (r) => <span className="font-semibold">{r.grand}</span> },
          { key: "paid", label: "Paid Amount" },
          { key: "due", label: "Due Amount" },
          { key: "currency", label: "Currency" },
          { key: "date", label: "Created Date" },
          { key: "a", label: "", render: (r) => (
            <div className="flex gap-1 justify-end">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setView(r.id)}><Eye className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setView(r.id)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDel(r.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ) },
        ]}
        rows={data}
      />

      {/* Add Expense */}
      <Dialog open={add} onOpenChange={setAdd}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
            <DialogDescription>Capture one or more cost lines under a single expense entry.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Title</Label><Input className="mt-1" placeholder="e.g. Refrigerator repair" /></div>
              <div><Label>Date</Label><Input type="date" className="mt-1" /></div>
            </div>
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr><th className="text-left px-3 py-2">Type</th><th className="text-left px-3 py-2">Description</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Unit</th><th className="px-3 py-2">Total</th><th></th></tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2">{it.type}</td>
                      <td className="px-3 py-2">{it.desc}</td>
                      <td className="px-3 py-2 text-center">{it.qty}</td>
                      <td className="px-3 py-2 text-right">ر.س {it.unit.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-semibold">ر.س {it.total.toFixed(2)}</td>
                      <td className="px-3 py-2"><Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t p-2"><Button size="sm" variant="ghost" className="text-primary" onClick={() => setItems([...items, { type: "Misc", desc: "New line", qty: 1, unit: 0, total: 0 }])}><Plus className="h-4 w-4 mr-1" /> Add line</Button></div>
            </div>
            <div className="grid grid-cols-4 gap-3 text-sm">
              <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Total</p><p className="font-bold">ر.س {subtotal.toFixed(2)}</p></div>
              <div className="rounded-lg bg-success/10 p-3"><p className="text-xs text-success">Paid</p><Input defaultValue={subtotal} className="h-7 text-sm border-0 bg-transparent p-0 font-bold" /></div>
              <div className="rounded-lg bg-warning/15 p-3"><p className="text-xs">Due</p><p className="font-bold">ر.س 0.00</p></div>
              <div className="rounded-lg bg-primary/10 p-3"><p className="text-xs text-primary">Change</p><p className="font-bold">ر.س 0.00</p></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setAdd(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground border-0" onClick={() => setAdd(false)}>Save Expense</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View / Edit */}
      <Dialog open={!!view} onOpenChange={(v) => !v && setView(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Expense {view}</DialogTitle><DialogDescription>Edit or review entry details</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title</Label><Input defaultValue="Generator diesel refill" className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Type</Label><Select defaultValue="util"><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="util">Utilities</SelectItem><SelectItem value="rent">Rent</SelectItem></SelectContent></Select></div>
              <div><Label>Amount</Label><Input defaultValue="1250" className="mt-1" /></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setView(null)}>Close</Button><Button className="gradient-primary text-primary-foreground border-0" onClick={() => setView(null)}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={!!del} onOpenChange={(v) => !v && setDel(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete {del}?</DialogTitle><DialogDescription>This action cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDel(null)}>Cancel</Button><Button variant="destructive" onClick={() => setDel(null)}>Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}