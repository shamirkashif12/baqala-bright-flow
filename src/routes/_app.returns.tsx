import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/module-placeholder";
import { Plus } from "lucide-react";
import { api, type CustomerReturn, type Order, type Customer, type Branch } from "@/lib/api";

export const Route = createFileRoute("/_app/returns")({ component: Returns });

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

type ReturnForm = {
  orderId: string;
  customerId: string;
  branchId: string;
  returnType: string;
  refundMethod: string;
  refundAmount: string;
  reason: string;
  notes: string;
  restock: boolean;
};

const emptyForm: ReturnForm = {
  orderId: "", customerId: "", branchId: "",
  returnType: "full_return", refundMethod: "cash",
  refundAmount: "", reason: "", notes: "", restock: true,
};

function Returns() {
  const [returns, setReturns] = useState<CustomerReturn[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [form, setForm] = useState<ReturnForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.getReturns().then(setReturns).finally(() => setLoading(false));
  };
  useEffect(load, []);

  useEffect(() => {
    if (!sheetOpen) return;
    Promise.all([api.getOrders(), api.getCustomers(), api.getBranches()])
      .then(([o, c, b]) => { setOrders(o); setCustomers(c); setBranches(b); })
      .catch(console.error);
  }, [sheetOpen]);

  const filtered = returns.filter(r => {
    const matchQ = !q
      || r.returnNumber?.toLowerCase().includes(q.toLowerCase())
      || r.customer?.fullName?.toLowerCase().includes(q.toLowerCase())
      || r.order?.orderNumber?.toLowerCase().includes(q.toLowerCase());
    const matchSt = statusFilter === "all" || r.status === statusFilter;
    return matchQ && matchSt;
  });

  const setF = (k: keyof ReturnForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));
  const setS = (k: keyof ReturnForm) => (v: string) => {
    setForm(p => {
      const next = { ...p, [k]: v };
      if (k === "orderId") {
        const order = orders.find(o => o.id === v);
        if (order) {
          next.branchId = order.branchId;
          if (order.customerId) next.customerId = order.customerId;
        }
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!form.orderId || !form.customerId || !form.branchId || !form.reason || !form.refundAmount) {
      setError("Order, customer, branch, reason and refund amount are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.createReturn({
        orderId: form.orderId,
        customerId: form.customerId,
        branchId: form.branchId,
        returnType: form.returnType,
        refundMethod: form.refundMethod,
        refundAmount: Number(form.refundAmount),
        reason: form.reason,
        notes: form.notes || undefined,
        items: [],
      });
      setSheetOpen(false);
      setForm(emptyForm);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to submit return.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageShell title="Returns" subtitle="Customer return requests and refund processing">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search return#, customer, order…" className="h-9 w-56 flex-shrink-0" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Sheet open={sheetOpen} onOpenChange={v => { setSheetOpen(v); if (!v) { setForm(emptyForm); setError(null); } }}>
          <SheetTrigger asChild>
            <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9">
              <Plus className="h-4 w-4" /> New Return
            </Button>
          </SheetTrigger>
          <SheetContent className="max-w-md overflow-y-auto">
            <SheetHeader><SheetTitle>New Return</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-4">
              <FieldRow label="Order">
                <Select value={form.orderId} onValueChange={setS("orderId")}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select order" /></SelectTrigger>
                  <SelectContent>
                    {orders.map(o => (
                      <SelectItem key={o.id} value={o.id}>{o.orderNumber} — SAR {o.totalAmount.toFixed(2)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Customer">
                <Select value={form.customerId} onValueChange={setS("customerId")}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.fullName} — {c.phone}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Branch">
                <Select value={form.branchId} onValueChange={setS("branchId")}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FieldRow>
              <div className="grid grid-cols-2 gap-3">
                <FieldRow label="Return Type">
                  <Select value={form.returnType} onValueChange={setS("returnType")}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full_return">Full Return</SelectItem>
                      <SelectItem value="partial_return">Partial Return</SelectItem>
                      <SelectItem value="exchange">Exchange</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldRow>
                <FieldRow label="Refund Amount (SAR)">
                  <Input type="number" value={form.refundAmount} onChange={setF("refundAmount")} className="h-9" placeholder="0.00" />
                </FieldRow>
              </div>
              <FieldRow label="Refund Method">
                <Select value={form.refundMethod} onValueChange={setS("refundMethod")}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card_reversal">Card Reversal</SelectItem>
                    <SelectItem value="store_credit">Store Credit</SelectItem>
                    <SelectItem value="original_payment">Original Payment Method</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Reason">
                <Textarea value={form.reason} onChange={setF("reason")} placeholder="Reason for return…" rows={3} />
              </FieldRow>
              <FieldRow label="Notes (optional)">
                <Textarea value={form.notes} onChange={setF("notes")} placeholder="Additional notes…" rows={2} />
              </FieldRow>
              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
                <div>
                  <p className="text-sm font-medium">Restock Item</p>
                  <p className="text-xs text-muted-foreground">Return to inventory on approval</p>
                </div>
                <Switch checked={form.restock} onCheckedChange={v => setForm(p => ({ ...p, restock: v }))} />
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button
                className="w-full gradient-primary text-primary-foreground border-0"
                onClick={handleSubmit}
                disabled={saving}
              >
                {saving ? "Submitting…" : "Submit Return"}
              </Button>
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
                  <th className="px-3 py-3 font-semibold">Return#</th>
                  <th className="px-3 py-3 font-semibold">Invoice</th>
                  <th className="px-3 py-3 font-semibold">Customer</th>
                  <th className="px-3 py-3 font-semibold">Reason</th>
                  <th className="px-3 py-3 font-semibold">Refund</th>
                  <th className="px-3 py-3 font-semibold">Method</th>
                  <th className="px-3 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-3 py-3 font-mono text-xs font-bold">{r.returnNumber}</td>
                    <td className="px-3 py-3 font-mono text-xs">{r.order?.orderNumber ?? "—"}</td>
                    <td className="px-3 py-3">{r.customer?.fullName ?? "—"}</td>
                    <td className="px-3 py-3 text-xs max-w-[160px] truncate">{r.reason ?? "—"}</td>
                    <td className="px-3 py-3 tabular-nums font-semibold">SAR {r.refundAmount.toFixed(2)}</td>
                    <td className="px-3 py-3 text-xs">{r.refundMethod ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{new Date(r.createdAt).toLocaleDateString("en-SA")}</td>
                    <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">No returns found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </PageShell>
  );
}
