import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, TrendingDown, BadgeDollarSign, Receipt, Plus, Eye, Pencil } from "lucide-react";
import { api, type Expense } from "@/lib/api";

export const Route = createFileRoute("/_app/expenses")({ component: Expenses });

function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [add, setAdd] = useState(false);
  const [view, setView] = useState<Expense | null>(null);

  useEffect(() => {
    api.getExpenses()
      .then(setExpenses)
      .finally(() => setLoading(false));
  }, []);

  const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);
  const approvedAmount = expenses.filter(e => e.status === "approved").reduce((s, e) => s + e.amount, 0);
  const pendingAmount = totalAmount - approvedAmount;
  const fmt = (n: number) => `ر.س ${n.toLocaleString("en-SA", { minimumFractionDigits: 2 })}`;

  return (
    <PageShell title="Expenses" subtitle="Track every cost across all branches">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Expenses" value={fmt(totalAmount)} icon={Wallet} accent="primary" />
        <MetricCard label="Approved" value={fmt(approvedAmount)} icon={BadgeDollarSign} accent="success" />
        <MetricCard label="Pending" value={fmt(pendingAmount)} icon={TrendingDown} accent="warning" />
        <MetricCard label="Entries" value={String(expenses.length)} icon={Receipt} />
      </div>

      <Toolbar placeholder="Search expense…" extra={<Button size="sm" className="h-10 gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5" onClick={() => setAdd(true)}><Plus className="h-4 w-4" /> Add Expense</Button>} />

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <DataTable
          columns={[
            { key: "referenceNumber", label: "Ref #", render: (r: Expense) => <span className="font-mono text-xs">{r.referenceNumber ?? "—"}</span> },
            { key: "description", label: "Description", render: (r: Expense) => r.description ?? "—" },
            { key: "expenseType", label: "Type", render: (r: Expense) => r.expenseType?.name ?? "—" },
            { key: "amount", label: "Amount", render: (r: Expense) => <span className="font-semibold">{fmt(r.amount)}</span> },
            { key: "expenseDate", label: "Date", render: (r: Expense) => new Date(r.expenseDate).toLocaleDateString("en-SA") },
            { key: "status", label: "Status", render: (r: Expense) => <StatusBadge status={r.status} /> },
            { key: "a", label: "", render: (r: Expense) => (
              <div className="flex gap-1 justify-end">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setView(r)}><Eye className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setView(r)}><Pencil className="h-4 w-4" /></Button>
              </div>
            )},
          ]}
          rows={expenses}
        />
      )}

      <Dialog open={add} onOpenChange={setAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
            <DialogDescription>Record a new expense entry.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Description</Label><Input className="mt-1" placeholder="e.g. Refrigerator repair" /></div>
            <div><Label>Amount (SAR)</Label><Input className="mt-1" type="number" placeholder="0.00" /></div>
            <div><Label>Date</Label><Input type="date" className="mt-1" /></div>
            <div><Label>Status</Label>
              <Select defaultValue="pending"><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdd(false)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground border-0" onClick={() => setAdd(false)}>Save Expense</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!view} onOpenChange={(v) => !v && setView(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Expense Details</DialogTitle>
            <DialogDescription>{view?.referenceNumber ?? "No reference"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Description</Label><Input defaultValue={view?.description ?? ""} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Type</Label><Input defaultValue={view?.expenseType?.name ?? "—"} className="mt-1" readOnly /></div>
              <div><Label>Amount</Label><Input defaultValue={String(view?.amount ?? "")} className="mt-1" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setView(null)}>Close</Button>
            <Button className="gradient-primary text-primary-foreground border-0" onClick={() => setView(null)}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
