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
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, CheckCircle, XCircle, PackageCheck, Eye, RotateCcw, Trash2, X } from "lucide-react";
import { api, type CustomerReturn, type CustomerReturnItem, type Order, type Customer, type Branch, type OrderItem } from "@/lib/api";
import { SARIcon } from "@/lib/currency";

export const Route = createFileRoute("/_app/returns")({ component: Returns });

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700 border-amber-200",
    approved: "bg-blue-100 text-blue-700 border-blue-200",
    completed: "bg-green-100 text-green-700 border-green-200",
    rejected: "bg-red-100 text-red-700 border-red-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

function conditionColor(c: string) {
  if (c === "good") return "text-green-600 bg-green-50 border-green-200";
  if (c === "damaged") return "text-amber-600 bg-amber-50 border-amber-200";
  return "text-red-600 bg-red-50 border-red-200";
}

function dispositionLabel(item: CustomerReturnItem) {
  if (item.condition === "good" && item.restock) return { label: "Returned to Shelf", icon: <RotateCcw className="h-3 w-3" />, cls: "text-green-600" };
  return { label: "Written Off", icon: <Trash2 className="h-3 w-3" />, cls: "text-red-500" };
}

// ─── Detail / Action Sheet ────────────────────────────────────────────────────
function DetailSheet({ ret, onClose, onAction }: {
  ret: CustomerReturn | null; onClose: () => void; onAction: () => void;
}) {
  const [acting, setActing] = useState<string | null>(null);

  if (!ret) return null;

  const doAction = async (fn: () => Promise<unknown>, key: string) => {
    setActing(key);
    try { await fn(); onAction(); onClose(); }
    catch (e) { console.error(e); }
    finally { setActing(null); }
  };

  const refundMethodLabel: Record<string, string> = {
    cash: "Cash", card_reversal: "Card Reversal",
    store_credit: "Store Credit", original_payment: "Original Payment",
  };
  const returnTypeLabel: Record<string, string> = {
    full_return: "Full Return", partial_return: "Partial Return", exchange: "Exchange",
  };

  return (
    <Sheet open={!!ret} onOpenChange={v => !v && onClose()}>
      <SheetContent className="max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {ret.returnNumber} <StatusBadge status={ret.status} />
          </SheetTitle>
        </SheetHeader>

        {/* Summary */}
        <div className="mt-4 space-y-2 text-sm">
          {([
            ["Invoice", ret.order?.orderNumber ?? "—"],
            ["Customer", ret.customer?.fullName ?? "—"],
            ["Return Type", returnTypeLabel[ret.returnType] ?? ret.returnType],
            ["Refund Method", refundMethodLabel[ret.refundMethod] ?? ret.refundMethod],
            ["Refund Amount", <><SARIcon />{ret.refundAmount.toFixed(2)}</>],
            ["Reason", ret.reason ?? "—"],
            ...(ret.notes ? [["Notes", ret.notes]] : []),
            ["Date", new Date(ret.createdAt).toLocaleDateString("en-SA")],
          ] as [string, React.ReactNode][]).map(([l, v]) => (
            <div key={l as string} className="flex justify-between border-b border-border/40 pb-1.5">
              <span className="text-muted-foreground text-xs">{l}</span>
              <span className="font-medium text-xs text-right max-w-[220px]">{v}</span>
            </div>
          ))}
        </div>

        {/* Items */}
        {ret.items && ret.items.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Returned Items</p>
            <div className="space-y-2">
              {ret.items.map((item, i) => {
                const disp = dispositionLabel(item);
                return (
                  <div key={i} className="rounded-lg border border-border/60 p-3 flex items-center gap-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.product?.name ?? item.productId}</p>
                      <p className="text-xs text-muted-foreground">Qty: {item.quantity} · <SARIcon />{item.unitPrice.toFixed(2)}/unit</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${conditionColor(item.condition)}`}>
                      {item.condition}
                    </span>
                    {ret.status === "completed" && (
                      <span className={`flex items-center gap-1 text-xs font-medium ${disp.cls}`}>
                        {disp.icon}{disp.label}
                      </span>
                    )}
                    {ret.status !== "completed" && (
                      <span className="text-xs text-muted-foreground">
                        {item.restock ? "Will restock" : "Will write off"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 space-y-2">
          {ret.status === "pending" && (
            <>
              <p className="text-xs text-muted-foreground mb-2">Review and approve or reject this return request.</p>
              <Button className="w-full bg-green-600 hover:bg-green-700 text-white border-0 gap-2"
                onClick={() => doAction(() => api.approveReturn(ret.id, true), "approve")}
                disabled={acting !== null}>
                <CheckCircle className="h-4 w-4" />
                {acting === "approve" ? "Approving…" : "Approve Return"}
              </Button>
              <Button variant="outline" className="w-full border-red-200 text-red-600 hover:bg-red-50 gap-2"
                onClick={() => doAction(() => api.approveReturn(ret.id, false), "reject")}
                disabled={acting !== null}>
                <XCircle className="h-4 w-4" />
                {acting === "reject" ? "Rejecting…" : "Reject Return"}
              </Button>
            </>
          )}
          {ret.status === "approved" && (
            <>
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700 mb-2">
                On completion: good-condition items will be restocked; damaged/expired items will be written off.
              </div>
              <Button className="w-full gradient-primary text-primary-foreground border-0 gap-2"
                onClick={() => doAction(() => api.completeReturn(ret.id), "complete")}
                disabled={acting !== null}>
                <PackageCheck className="h-4 w-4" />
                {acting === "complete" ? "Processing…" : "Process Refund & Restock"}
              </Button>
            </>
          )}
          {ret.status === "completed" && (
            <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-center text-sm text-green-700">
              ✓ Refund processed. Eligible items returned to inventory.
            </div>
          )}
          {ret.status === "rejected" && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-center text-sm text-red-700">
              This return was rejected — no refund issued.
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── New Return Form ──────────────────────────────────────────────────────────
type ReturnForm = {
  orderId: string; customerId: string; branchId: string;
  returnType: string; refundMethod: string; refundAmount: string;
  reason: string; notes: string;
};

const emptyForm: ReturnForm = {
  orderId: "", customerId: "", branchId: "",
  returnType: "full_return", refundMethod: "cash",
  refundAmount: "", reason: "", notes: "",
};

type ItemRow = { orderItemId: string; productId: string; productName: string; unitPrice: number; maxQty: number; qty: number; condition: string; restock: boolean; selected: boolean; };

function Returns() {
  const [returns, setReturns] = useState<CustomerReturn[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewReturn, setViewReturn] = useState<CustomerReturn | null>(null);
  const [form, setForm] = useState<ReturnForm>(emptyForm);
  const [itemRows, setItemRows] = useState<ItemRow[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
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
    const mdf = !dateFrom || (!!r.createdAt && r.createdAt >= dateFrom);
    const mdt = !dateTo || (!!r.createdAt && r.createdAt <= dateTo + "T23:59:59");
    return matchQ && matchSt && mdf && mdt;
  });

  const setF = (k: keyof ReturnForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));
  const setS = (k: keyof ReturnForm) => async (v: string) => {
    setForm(p => ({ ...p, [k]: v }));
    if (k === "orderId") {
      setLoadingItems(true);
      setItemRows([]);
      try {
        const order = await api.getOrder(v);
        setForm(p => ({
          ...p, orderId: v,
          branchId: order.branchId,
          customerId: order.customerId ?? p.customerId,
          refundAmount: order.totalAmount.toFixed(2),
        }));
        setItemRows((order.items ?? []).map((oi: OrderItem) => ({
          orderItemId: oi.id ?? "",
          productId: oi.productId,
          productName: oi.product?.name ?? oi.productId,
          unitPrice: oi.unitPrice,
          maxQty: Number(oi.quantity),
          qty: Number(oi.quantity),
          condition: "good",
          restock: true,
          selected: true,
        })));
      } catch { /* ignore */ }
      finally { setLoadingItems(false); }
    }
  };

  const updateRow = (i: number, patch: Partial<ItemRow>) =>
    setItemRows(rows => rows.map((r, idx) => idx === i ? { ...r, ...patch } : r));

  const selectedItems = itemRows.filter(r => r.selected);
  const totalRefund = selectedItems.reduce((s, r) => s + r.qty * r.unitPrice, 0);

  useEffect(() => {
    if (selectedItems.length > 0)
      setForm(p => ({ ...p, refundAmount: totalRefund.toFixed(2) }));
  }, [totalRefund]);

  const handleSubmit = async () => {
    if (!form.orderId || !form.customerId || !form.branchId || !form.reason) {
      setError("Order, customer, branch and reason are required.");
      return;
    }
    setSaving(true); setError(null);
    try {
      const items: Partial<CustomerReturnItem>[] = selectedItems.map(r => ({
        productId: r.productId,
        orderItemId: r.orderItemId || undefined,
        quantity: r.qty,
        unitPrice: r.unitPrice,
        refundAmount: r.qty * r.unitPrice,
        condition: r.condition,
        restock: r.restock,
      }));
      await api.createReturn({
        orderId: form.orderId,
        customerId: form.customerId,
        branchId: form.branchId,
        returnType: form.returnType,
        refundMethod: form.refundMethod,
        refundAmount: Number(form.refundAmount),
        reason: form.reason,
        notes: form.notes || undefined,
        items,
      });
      setSheetOpen(false);
      setForm(emptyForm);
      setItemRows([]);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to submit return.");
    } finally { setSaving(false); }
  };

  const pendingCount = returns.filter(r => r.status === "pending").length;

  return (
    <PageShell title="Returns" subtitle="Customer return requests and refund processing">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-2">
        {[
          { label: "Pending Review", value: returns.filter(r => r.status === "pending").length, color: "text-amber-600" },
          { label: "Approved", value: returns.filter(r => r.status === "approved").length, color: "text-blue-600" },
          { label: "Completed", value: returns.filter(r => r.status === "completed").length, color: "text-green-600" },
          { label: "Rejected", value: returns.filter(r => r.status === "rejected").length, color: "text-red-500" },
        ].map(s => (
          <Card key={s.label} className="p-3 border-border/60">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search return#, customer, order…" className="h-9 w-56 flex-shrink-0" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending {pendingCount > 0 ? `(${pendingCount})` : ""}</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Return Date:</span>
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
        <Sheet open={sheetOpen} onOpenChange={v => { setSheetOpen(v); if (!v) { setForm(emptyForm); setItemRows([]); setError(null); } }}>
          <SheetTrigger asChild>
            <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9">
              <Plus className="h-4 w-4" /> New Return
            </Button>
          </SheetTrigger>
          <SheetContent className="max-w-lg overflow-y-auto">
            <SheetHeader><SheetTitle>New Return</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-4">
              <FieldRow label="Order">
                <Select value={form.orderId} onValueChange={setS("orderId")}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select order" /></SelectTrigger>
                  <SelectContent>
                    {orders.map(o => (
                      <SelectItem key={o.id} value={o.id}>{o.orderNumber} — <SARIcon />{o.totalAmount.toFixed(2)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>

              {/* Items from the selected order */}
              {loadingItems && <p className="text-xs text-muted-foreground">Loading order items…</p>}
              {itemRows.length > 0 && (
                <div>
                  <Label className="text-xs mb-2 block">Select Items to Return</Label>
                  <div className="space-y-2">
                    {itemRows.map((row, i) => (
                      <div key={i} className={`rounded-lg border p-3 transition-colors ${row.selected ? "border-primary/40 bg-primary/5" : "border-border/40"}`}>
                        <div className="flex items-start gap-2">
                          <Checkbox checked={row.selected} onCheckedChange={v => updateRow(i, { selected: !!v })} className="mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{row.productName}</p>
                            <p className="text-xs text-muted-foreground"><SARIcon />{row.unitPrice.toFixed(2)}/unit · max {row.maxQty}</p>
                          </div>
                        </div>
                        {row.selected && (
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            <div>
                              <Label className="text-xs">Qty</Label>
                              <Input type="number" min={1} max={row.maxQty} value={row.qty}
                                onChange={e => updateRow(i, { qty: Math.min(Number(e.target.value), row.maxQty) })}
                                className="h-8 text-xs" />
                            </div>
                            <div>
                              <Label className="text-xs">Condition</Label>
                              <Select value={row.condition} onValueChange={v => updateRow(i, { condition: v, restock: v === "good" })}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="good">Good</SelectItem>
                                  <SelectItem value="damaged">Damaged</SelectItem>
                                  <SelectItem value="expired">Expired</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex flex-col justify-end">
                              <Label className="text-xs mb-1">Restock</Label>
                              <div className="flex items-center gap-1.5 h-8">
                                <Switch checked={row.restock} disabled={row.condition !== "good"}
                                  onCheckedChange={v => updateRow(i, { restock: v })} />
                                <span className="text-xs text-muted-foreground">{row.restock ? "Yes" : "No"}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {selectedItems.length > 0 && (
                    <div className="mt-2 rounded-lg bg-muted/50 px-3 py-2 flex justify-between text-sm">
                      <span className="text-muted-foreground">{selectedItems.length} item(s) · auto refund</span>
                      <span className="font-semibold"><SARIcon />{totalRefund.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              )}

              <FieldRow label="Customer">
                <Select value={form.customerId} onValueChange={v => setForm(p => ({ ...p, customerId: v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.fullName} — {c.phone}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Branch">
                <Select value={form.branchId} onValueChange={v => setForm(p => ({ ...p, branchId: v }))}>
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
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={handleSubmit} disabled={saving}>
                {saving ? "Submitting…" : "Submit Return"}
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Table */}
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
                  <th className="px-3 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0 cursor-pointer" onClick={() => setViewReturn(r)}>
                    <td className="px-3 py-3 font-mono text-xs font-bold">{r.returnNumber}</td>
                    <td className="px-3 py-3 font-mono text-xs">{r.order?.orderNumber ?? "—"}</td>
                    <td className="px-3 py-3">{r.customer?.fullName ?? "—"}</td>
                    <td className="px-3 py-3 text-xs max-w-[130px] truncate">{r.reason ?? "—"}</td>
                    <td className="px-3 py-3 tabular-nums font-semibold"><SARIcon />{r.refundAmount.toFixed(2)}</td>
                    <td className="px-3 py-3 text-xs capitalize">{r.refundMethod?.replace(/_/g, " ") ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{new Date(r.createdAt).toLocaleDateString("en-SA")}</td>
                    <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewReturn(r)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {r.status === "pending" && (
                          <>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:bg-green-50"
                              onClick={async () => { await api.approveReturn(r.id, true); load(); }}>
                              <CheckCircle className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:bg-red-50"
                              onClick={async () => { await api.approveReturn(r.id, false); load(); }}>
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                        {r.status === "approved" && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600 hover:bg-blue-50" title="Process refund & restock"
                            onClick={async () => { await api.completeReturn(r.id); load(); }}>
                            <PackageCheck className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-10 text-muted-foreground text-sm">No returns found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <DetailSheet ret={viewReturn} onClose={() => setViewReturn(null)} onAction={load} />
    </PageShell>
  );
}
