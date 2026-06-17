import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/module-placeholder";
import { Plus, Receipt, ListTree, CheckCircle, XCircle } from "lucide-react";
import { api, type Expense, type ExpenseType, type Branch } from "@/lib/api";

export const Route = createFileRoute("/_app/expenses")({ component: Expenses });

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

type ExpenseForm = { expenseTypeId: string; branchId: string; amount: string; description: string; expenseDate: string; referenceNumber: string; };
const emptyForm: ExpenseForm = { expenseTypeId: "", branchId: "", amount: "", description: "", expenseDate: new Date().toISOString().slice(0, 10), referenceNumber: "" };

function EntriesTab() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<ExpenseForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([api.getExpenses(), api.getExpenseTypes(), api.getBranches()])
      .then(([e, t, b]) => { setExpenses(e); setExpenseTypes(t); setBranches(b); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = expenses.filter((e) => {
    const matchQ = !q || e.referenceNumber?.toLowerCase().includes(q.toLowerCase()) || e.description?.toLowerCase().includes(q.toLowerCase());
    const matchType = typeFilter === "all" || e.expenseType?.name === typeFilter;
    return matchQ && matchType;
  });

  const handleCreate = async () => {
    setSaving(true);
    try {
      await api.createExpense({
        expenseTypeId: form.expenseTypeId,
        branchId: form.branchId,
        amount: Number(form.amount),
        description: form.description || undefined,
        referenceNumber: form.referenceNumber || undefined,
        expenseDate: form.expenseDate,
      });
      setSheetOpen(false);
      setForm(emptyForm);
      load();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const handleApprove = async (id: string, approved: boolean) => {
    await api.approveExpense(id, approved, "00000000-0000-0000-0000-000000000000");
    load();
  };

  const set = (k: keyof ExpenseForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));
  const setS = (k: keyof ExpenseForm) => (v: string) =>
    setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search reference or description…" className="h-9 w-56 flex-shrink-0" />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {expenseTypes.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9" onClick={() => { setForm(emptyForm); setSheetOpen(true); }}>
          <Plus className="h-4 w-4" /> Add Expense
        </Button>
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
                  <th className="px-3 py-3 font-semibold"></th>
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
                    <td className="px-3 py-3">
                      {e.status === "pending" && (
                        <div className="flex gap-1 justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-success" title="Approve" onClick={() => handleApprove(e.id, true)}>
                            <CheckCircle className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Reject" onClick={() => handleApprove(e.id, false)}>
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">No expenses found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Sheet open={sheetOpen} onOpenChange={v => !v && setSheetOpen(false)}>
        <SheetContent>
          <SheetHeader><SheetTitle>Add Expense</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-4">
            <FieldRow label="Description">
              <Input value={form.description} onChange={set("description")} className="h-9" placeholder="Electricity bill — June" />
            </FieldRow>
            <FieldRow label="Expense Type">
              <Select value={form.expenseTypeId} onValueChange={setS("expenseTypeId")}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {expenseTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Amount (SAR)">
                <Input type="number" value={form.amount} onChange={set("amount")} className="h-9" placeholder="450.00" />
              </FieldRow>
              <FieldRow label="Date">
                <Input type="date" value={form.expenseDate} onChange={set("expenseDate")} className="h-9" />
              </FieldRow>
            </div>
            <FieldRow label="Branch">
              <Select value={form.branchId} onValueChange={setS("branchId")}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Reference #">
              <Input value={form.referenceNumber} onChange={set("referenceNumber")} className="h-9" placeholder="Optional" />
            </FieldRow>
            <Button className="w-full gradient-primary text-primary-foreground border-0 mt-2" onClick={handleCreate} disabled={saving || !form.expenseTypeId || !form.branchId || !form.amount}>
              {saving ? "Saving…" : "Save Expense"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function TypesTab() {
  const [types, setTypes] = useState<ExpenseType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getExpenseTypes().then(setTypes).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-muted-foreground text-sm">Loading…</div>;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {types.map((t) => (
        <Card key={t.id} className="p-5 border-border/60 shadow-card hover:shadow-elegant transition-all">
          <div className="flex items-start justify-between">
            <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary">
              <ListTree className="h-5 w-5" />
            </div>
            <Badge variant="outline" className="text-xs">{t.isActive ? "active" : "inactive"}</Badge>
          </div>
          <p className="mt-3 font-semibold">{t.name}</p>
          {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
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
