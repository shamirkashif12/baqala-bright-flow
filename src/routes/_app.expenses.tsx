import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/module-placeholder";
import { Plus, Receipt, Tags, CheckCircle, XCircle, X, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type Expense, type ExpenseType, type Branch } from "@/lib/api";
import { SARIcon } from "@/lib/currency";

export const Route = createFileRoute("/_app/expenses")({ component: Expenses });

const PAYMENT_METHODS = ["Cash", "Card", "Bank Transfer", "Wallet"];

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

type ExpenseForm = {
  expenseTypeId: string; branchId: string; amount: string; paidAmount: string;
  description: string; expenseDate: string; referenceNumber: string; paymentMethod: string;
};
const emptyForm: ExpenseForm = {
  expenseTypeId: "", branchId: "", amount: "", paidAmount: "",
  description: "", expenseDate: new Date().toISOString().slice(0, 10),
  referenceNumber: "", paymentMethod: "Cash",
};

function EntriesTab() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [form, setForm] = useState<ExpenseForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.getExpenseTypes(), api.getBranches()])
      .then(([t, b]) => { setExpenseTypes(t); setBranches(b); })
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    api.getExpenses({
      branchId: branchFilter !== "all" ? branchFilter : undefined,
      paymentMethod: methodFilter !== "all" ? methodFilter.toLowerCase().replace(" ", "_") : undefined,
      expenseTypeId: typeFilter !== "all" ? typeFilter : undefined,
    })
      .then(setExpenses)
      .finally(() => setLoading(false));
  }, [branchFilter, methodFilter, typeFilter]);
  useEffect(() => { load(); }, [load]);

  const filtered = expenses.filter((e) => {
    const matchQ = !q || e.referenceNumber?.toLowerCase().includes(q.toLowerCase()) || e.description?.toLowerCase().includes(q.toLowerCase());
    const mdf = !dateFrom || (!!e.expenseDate && e.expenseDate >= dateFrom);
    const mdt = !dateTo || (!!e.expenseDate && e.expenseDate <= dateTo);
    return matchQ && mdf && mdt;
  });

  const openAdd = () => { setEditExpense(null); setForm(emptyForm); setSheetOpen(true); };
  const openEdit = (e: Expense) => {
    setEditExpense(e);
    setForm({
      expenseTypeId: e.expenseTypeId,
      branchId: e.branchId,
      amount: String(e.amount),
      paidAmount: String(e.paidAmount ?? e.amount),
      description: e.description ?? "",
      expenseDate: e.expenseDate.slice(0, 10),
      referenceNumber: e.referenceNumber ?? "",
      paymentMethod: e.paymentMethod
        ? e.paymentMethod.charAt(0).toUpperCase() + e.paymentMethod.slice(1).replace("_", " ")
        : "Cash",
    });
    setSheetOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      expenseTypeId: form.expenseTypeId,
      branchId: form.branchId,
      amount: Number(form.amount),
      paidAmount: Number(form.paidAmount) || undefined,
      description: form.description || undefined,
      referenceNumber: form.referenceNumber || undefined,
      expenseDate: form.expenseDate,
      paymentMethod: form.paymentMethod.toLowerCase().replace(" ", "_"),
    };
    try {
      if (editExpense) {
        await api.updateExpense(editExpense.id, payload);
      } else {
        await api.createExpense(payload);
      }
      setSheetOpen(false);
      load();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!delId) return;
    await api.deleteExpense(delId);
    setDelId(null);
    load();
  };

  const handleApprove = async (id: string, approved: boolean) => {
    await api.approveExpense(id, approved, "00000000-0000-0000-0000-000000000000");
    load();
  };

  const set = (k: keyof ExpenseForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));
  const setS = (k: keyof ExpenseForm) => (v: string) =>
    setForm(p => ({ ...p, [k]: v }));

  const methodLabel = (m?: string) => {
    if (!m) return "—";
    return m.charAt(0).toUpperCase() + m.slice(1).replace("_", " ");
  };

  return (
    <div className="space-y-4">
      {/* ─── Toolbar ─── */}
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search ref or description…" className="h-9 w-52 flex-shrink-0" />
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="All Branches" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {expenseTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={methodFilter} onValueChange={setMethodFilter}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="All Methods" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Methods</SelectItem>
            {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Input type="date" className="h-9 w-36" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" className="h-9 w-36" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" onClick={() => { setDateFrom(""); setDateTo(""); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="flex-1" />
        <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9" onClick={openAdd}>
          <Plus className="h-4 w-4" /> Add Expense
        </Button>
      </div>

      {/* ─── Table ─── */}
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
                  <th className="px-3 py-3 font-semibold">Branch</th>
                  <th className="px-3 py-3 font-semibold">Method</th>
                  <th className="px-3 py-3 font-semibold">Amount</th>
                  <th className="px-3 py-3 font-semibold">Paid</th>
                  <th className="px-3 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-3 py-3 font-mono text-xs">{e.referenceNumber ?? "—"}</td>
                    <td className="px-3 py-3 max-w-[200px] truncate">{e.description ?? "—"}</td>
                    <td className="px-3 py-3"><Badge variant="outline" className="text-xs">{e.expenseType?.name ?? "—"}</Badge></td>
                    <td className="px-3 py-3 text-xs">{branches.find(b => b.id === e.branchId)?.name ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{methodLabel(e.paymentMethod)}</td>
                    <td className="px-3 py-3 tabular-nums font-semibold"><SARIcon />{e.amount.toFixed(2)}</td>
                    <td className="px-3 py-3 tabular-nums text-xs text-muted-foreground">
                      {e.paidAmount != null ? <><SARIcon />{e.paidAmount.toFixed(2)}</> : "—"}
                    </td>
                    <td className="px-3 py-3 text-xs">{e.expenseDate ? new Date(e.expenseDate).toLocaleDateString("en-SA") : "—"}</td>
                    <td className="px-3 py-3"><StatusBadge status={e.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1 justify-end">
                        {e.status === "pending" && (
                          <>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-success" title="Approve" onClick={() => handleApprove(e.id, true)}>
                              <CheckCircle className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Reject" onClick={() => handleApprove(e.id, false)}>
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" onClick={() => openEdit(e)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Delete" onClick={() => setDelId(e.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={10} className="text-center py-10 text-muted-foreground text-sm">No expenses found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ─── Add / Edit Sheet ─── */}
      <Sheet open={sheetOpen} onOpenChange={v => !v && setSheetOpen(false)}>
        <SheetContent>
          <SheetHeader><SheetTitle>{editExpense ? "Edit Expense" : "Add Expense"}</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-4">
            <FieldRow label="Description">
              <Input value={form.description} onChange={set("description")} className="h-9" placeholder="Electricity bill — June" />
            </FieldRow>
            <FieldRow label="Expense Type *">
              <Select value={form.expenseTypeId} onValueChange={setS("expenseTypeId")}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {expenseTypes.filter(t => t.isActive).map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Branch *">
              <Select value={form.branchId} onValueChange={setS("branchId")}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Payment Method">
              <Select value={form.paymentMethod} onValueChange={setS("paymentMethod")}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldRow>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Amount (SAR) *">
                <Input type="number" value={form.amount} onChange={set("amount")} className="h-9" placeholder="450.00" />
              </FieldRow>
              <FieldRow label="Paid Amount">
                <Input type="number" value={form.paidAmount} onChange={set("paidAmount")} className="h-9" placeholder="450.00" />
              </FieldRow>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Date">
                <Input type="date" value={form.expenseDate} onChange={set("expenseDate")} className="h-9" />
              </FieldRow>
              <FieldRow label="Reference #">
                <Input value={form.referenceNumber} onChange={set("referenceNumber")} className="h-9" placeholder="Optional" />
              </FieldRow>
            </div>
            <Button className="w-full gradient-primary text-primary-foreground border-0 mt-2" onClick={handleSave}
              disabled={saving || !form.expenseTypeId || !form.branchId || !form.amount}>
              {saving ? "Saving…" : editExpense ? "Save Changes" : "Save Expense"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ─── Delete Confirm ─── */}
      <Dialog open={!!delId} onOpenChange={v => !v && setDelId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Expense?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setDelId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type TypeForm = { name: string; nameAr: string; description: string; isActive: boolean };
const emptyTypeForm: TypeForm = { name: "", nameAr: "", description: "", isActive: true };

function TypesTab() {
  const [types, setTypes] = useState<ExpenseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editType, setEditType] = useState<ExpenseType | null>(null);
  const [form, setForm] = useState<TypeForm>(emptyTypeForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadTypes = () => {
    setLoading(true);
    api.getExpenseTypes(true).then(setTypes).finally(() => setLoading(false));
  };
  useEffect(loadTypes, []);

  const openAdd = () => { setEditType(null); setForm(emptyTypeForm); setSheetOpen(true); };
  const openEdit = (t: ExpenseType) => {
    setEditType(t);
    setForm({ name: t.name, nameAr: t.nameAr ?? "", description: t.description ?? "", isActive: t.isActive });
    setSheetOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editType) await api.updateExpenseType(editType.id, form);
      else await api.createExpenseType(form);
      setSheetOpen(false);
      loadTypes();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await api.deleteExpenseType(id);
      toast.success("Expense type deleted");
      loadTypes();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete expense type");
    } finally { setDeleting(null); }
  };

  const set = (k: keyof TypeForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{types.filter(t => t.isActive).length} active types</p>
        <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9" onClick={openAdd}>
          <Plus className="h-4 w-4" /> Add Type
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
                  <th className="px-3 py-3 font-semibold">Name</th>
                  <th className="px-3 py-3 font-semibold">Arabic Name</th>
                  <th className="px-3 py-3 font-semibold">Description</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-3 py-3 font-semibold">{t.name}</td>
                    <td className="px-3 py-3 text-muted-foreground" dir="rtl">{t.nameAr ?? "—"}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground max-w-[200px] truncate">{t.description ?? "—"}</td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className={`text-xs ${t.isActive ? "bg-green-100 text-green-700 border-green-200" : "bg-gray-100 text-gray-500"}`}>
                        {t.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" disabled={deleting === t.id} onClick={() => handleDelete(t.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {types.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">No expense types yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Sheet open={sheetOpen} onOpenChange={v => !v && setSheetOpen(false)}>
        <SheetContent>
          <SheetHeader><SheetTitle>{editType ? "Edit Expense Type" : "Add Expense Type"}</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-4">
            <FieldRow label="Name *">
              <Input value={form.name} onChange={set("name")} className="h-9" placeholder="e.g. Utilities" />
            </FieldRow>
            <FieldRow label="Arabic Name">
              <Input value={form.nameAr} onChange={set("nameAr")} className="h-9" dir="rtl" placeholder="اسم بالعربي" />
            </FieldRow>
            <FieldRow label="Description">
              <Input value={form.description} onChange={set("description")} className="h-9" placeholder="Optional description" />
            </FieldRow>
            {editType && (
              <FieldRow label="Status">
                <Select value={form.isActive ? "active" : "inactive"} onValueChange={v => setForm(p => ({ ...p, isActive: v === "active" }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
            )}
            <Button className="w-full gradient-primary text-primary-foreground border-0 mt-2" onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? "Saving…" : editType ? "Save Changes" : "Add Type"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Expenses() {
  return (
    <PageShell title="Expenses" subtitle="Record, categorize, and track business spending">
      <Tabs defaultValue="entries">
        <TabsList className="mb-4">
          <TabsTrigger value="entries" className="gap-1.5"><Receipt className="h-3.5 w-3.5" />Entries</TabsTrigger>
          <TabsTrigger value="types" className="gap-1.5"><Tags className="h-3.5 w-3.5" />Expense Types</TabsTrigger>
        </TabsList>
        <TabsContent value="entries" className="mt-0"><EntriesTab /></TabsContent>
        <TabsContent value="types" className="mt-0"><TypesTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
