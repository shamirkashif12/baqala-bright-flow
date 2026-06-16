import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/module-placeholder";
import { Plus, Receipt, ListTree } from "lucide-react";
import { api, type Expense } from "@/lib/api";

export const Route = createFileRoute("/_app/expenses")({ component: Expenses });

const staticTypes = [
  { id: "t1", name: "Utilities", description: "Electricity, water, internet", count: 12 },
  { id: "t2", name: "Maintenance", description: "Repairs and equipment servicing", count: 7 },
  { id: "t3", name: "Marketing", description: "Ads, promotions, branding", count: 5 },
  { id: "t4", name: "Supplies", description: "Office and store consumables", count: 18 },
  { id: "t5", name: "Salaries", description: "Staff compensation", count: 24 },
  { id: "t6", name: "Transport", description: "Delivery and logistics", count: 9 },
];

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

function EntriesTab() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("all");
  const [type, setType] = useState("all");
  const [method, setMethod] = useState("all");
  const [date, setDate] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    api.getExpenses()
      .then(setExpenses)
      .finally(() => setLoading(false));
  }, []);

  const filtered = expenses.filter((e) => {
    const matchQ = !q || e.referenceNumber?.toLowerCase().includes(q.toLowerCase()) || e.description?.toLowerCase().includes(q.toLowerCase());
    const matchType = type === "all" || e.expenseType?.name?.toLowerCase() === type.toLowerCase();
    return matchQ && matchType;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search reference or description…" className="h-9 w-56 flex-shrink-0" />
        <Select value={branch} onValueChange={setBranch}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Branch" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            <SelectItem value="riyadh">Riyadh</SelectItem>
            <SelectItem value="jeddah">Jeddah</SelectItem>
          </SelectContent>
        </Select>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {staticTypes.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Method" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Methods</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="card">Card</SelectItem>
            <SelectItem value="transfer">Transfer</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 w-40" />
        <div className="flex-1" />
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9">
              <Plus className="h-4 w-4" /> Add Expense
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader><SheetTitle>Add Expense</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-4">
              <FieldRow label="Description"><Input placeholder="Electricity bill — June" /></FieldRow>
              <FieldRow label="Expense Type">
                <Select>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>{staticTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </FieldRow>
              <div className="grid grid-cols-2 gap-3">
                <FieldRow label="Amount (SAR)"><Input type="number" placeholder="450.00" className="h-9" /></FieldRow>
                <FieldRow label="Date"><Input type="date" className="h-9" /></FieldRow>
              </div>
              <FieldRow label="Branch">
                <Select>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="riyadh">Riyadh</SelectItem>
                    <SelectItem value="jeddah">Jeddah</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Payment Method">
                <Select>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select method" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
              <Button className="w-full gradient-primary text-primary-foreground border-0 mt-2" onClick={() => setSheetOpen(false)}>Save Expense</Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 font-semibold">Ref#</th>
                  <th className="px-3 py-3 font-semibold">Description</th>
                  <th className="px-3 py-3 font-semibold">Type</th>
                  <th className="px-3 py-3 font-semibold">Amount</th>
                  <th className="px-3 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-3 py-3 font-mono text-xs">{e.referenceNumber ?? "—"}</td>
                    <td className="px-3 py-3">{e.description ?? "—"}</td>
                    <td className="px-3 py-3"><Badge variant="outline" className="text-xs">{e.expenseType?.name ?? "—"}</Badge></td>
                    <td className="px-3 py-3 tabular-nums font-semibold">SAR {e.amount.toFixed(2)}</td>
                    <td className="px-3 py-3 text-xs">{e.expenseDate ? new Date(e.expenseDate).toLocaleDateString("en-SA") : "—"}</td>
                    <td className="px-3 py-3"><StatusBadge status={e.status} /></td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">No expenses found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function TypesTab() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {staticTypes.map((t) => (
        <Card key={t.id} className="p-5 border-border/60 shadow-card hover:shadow-elegant transition-all">
          <div className="flex items-start justify-between">
            <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary">
              <ListTree className="h-5 w-5" />
            </div>
            <Badge variant="outline" className="text-xs">{t.count} entries</Badge>
          </div>
          <p className="mt-3 font-semibold">{t.name}</p>
          <p className="text-xs text-muted-foreground">{t.description}</p>
        </Card>
      ))}
    </div>
  );
}

function Expenses() {
  return (
    <PageShell title="Expenses" subtitle="Record, categorize, and track business spending">
      <Tabs defaultValue="entries">
        <TabsList className="mb-4">
          <TabsTrigger value="entries" className="gap-1.5"><Receipt className="h-3.5 w-3.5" />Entries</TabsTrigger>
          <TabsTrigger value="types" className="gap-1.5"><ListTree className="h-3.5 w-3.5" />Expense Types</TabsTrigger>
        </TabsList>
        <TabsContent value="entries" className="mt-0"><EntriesTab /></TabsContent>
        <TabsContent value="types" className="mt-0"><TypesTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
