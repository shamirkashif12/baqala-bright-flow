import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, CheckCircle, XCircle, PackageCheck, Eye, RotateCcw, Trash2, X, ScanLine, Loader2 } from "lucide-react";
import { api, type CustomerReturn, type CustomerReturnItem, type Order, type Customer, type OrderItem } from "@/lib/api";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { useBranch } from "@/lib/branch-context";
import { usePermission } from "@/lib/use-permission";
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
function DetailSheet({ ret, onClose, onAction, canApprove }: {
  ret: CustomerReturn | null; onClose: () => void; onAction: () => void; canApprove?: boolean;
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
          {ret.status === "pending" && canApprove && (
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
          {ret.status === "approved" && canApprove && (
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

type ItemRow = { orderItemId: string; productId: string; productName: string; unitPrice: number; refundPerUnit: number; maxQty: number; qty: number; condition: string; restock: boolean; selected: boolean; };

// What the customer actually paid per unit of this order line — the base price carrying its
// prorated share of the order's discount, VAT and custom fees, plus the line's own tobacco
// excise — NOT the flat pre-tax unitPrice. Mirrors ReturnsController.Create, which recomputes
// this server-side and is authoritative; this copy only exists so the cashier sees the real
// refund figure before submitting.
function refundPerUnit(order: Order, oi: OrderItem): number {
  const subtotal = order.subtotal || 0;
  const discount = order.discountAmount || 0;
  const qty = Number(oi.quantity) || 1;
  const baseShare = subtotal > 0 ? oi.unitPrice / subtotal : 0;
  const discountShare = discount * baseShare;
  const customFeeShare = (order.customFeeAmount ?? 0) * baseShare;
  const tobaccoPerUnit = (oi.tobaccoFeeAmount ?? 0) / qty;
  const taxableBase = subtotal - discount + (order.tobaccoFeeAmount ?? 0);
  const taxShare = taxableBase > 0 ? (order.taxAmount || 0) * ((oi.unitPrice - discountShare + tobaccoPerUnit) / taxableBase) : 0;
  return oi.unitPrice - discountShare + tobaccoPerUnit + taxShare + customFeeShare;
}

function Returns() {
  const { canCreate, canApprove } = usePermission("Returns");
  const { branches: allBranches } = useBranch();
  const [returns, setReturns] = useState<CustomerReturn[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState("");
  const [branchFilter, setBranchFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewReturn, setViewReturn] = useState<CustomerReturn | null>(null);
  const [form, setForm] = useState<ReturnForm>(emptyForm);
  const [itemRows, setItemRows] = useState<ItemRow[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceError, setInvoiceError] = useState("");
  const [matchedOrder, setMatchedOrder] = useState<Order | null>(null);
  const [matchedBranchName, setMatchedBranchName] = useState<string>("");
  const [loadingItems, setLoadingItems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invoiceInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    // Keep whatever returns list is already on screen if this fails — previously had no
    // .catch() at all, so a failed fetch left `returns` in whatever state it was in with no
    // signal to the cashier that the tiles/table might be stale (86eyag3ny).
    api.getReturns({
      branchId: branchFilter.length ? branchFilter : undefined,
      status: statusFilter.length ? statusFilter : undefined,
    }).then(r => { setReturns(r); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [branchFilter, statusFilter]);
  useEffect(() => { load(); }, [load]);


  useEffect(() => {
    if (!sheetOpen) return;
    Promise.all([api.getOrders(), api.getCustomers()])
      .then(([o, c]) => { setOrders(o); setCustomers(c); })
      .catch(console.error);
  }, [sheetOpen]);

  const filtered = returns.filter(r => {
    const matchQ = !q
      || r.returnNumber?.toLowerCase().includes(q.toLowerCase())
      || r.customer?.fullName?.toLowerCase().includes(q.toLowerCase())
      || r.order?.orderNumber?.toLowerCase().includes(q.toLowerCase());
    const mdf = !dateFrom || (!!r.createdAt && r.createdAt >= dateFrom);
    const mdt = !dateTo || (!!r.createdAt && r.createdAt <= dateTo + "T23:59:59");
    return matchQ && mdf && mdt;
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
          // Always take the freshly-looked-up order's own customerId, never fall back to
          // whatever was in the form before — switching from a customer's order to an
          // anonymous/walk-in one within the same open sheet used to leave the PREVIOUS
          // order's customerId attached, misattributing the return to an unrelated customer.
          customerId: order.customerId ?? "",
          refundAmount: order.totalAmount.toFixed(2),
        }));
        setItemRows((order.items ?? []).map((oi: OrderItem) => ({
          orderItemId: oi.id ?? "",
          productId: oi.productId,
          productName: oi.product?.name ?? oi.productId,
          unitPrice: oi.unitPrice,
          refundPerUnit: refundPerUnit(order, oi),
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

  // Every row defaulted to condition "good" / restock true regardless of the selected reason —
  // a cashier picking "Damaged packaging" or "Expired product" had to remember to separately
  // flip the restock toggle, or that stock silently went back to sellable inventory. Re-derive
  // the sensible default whenever the reason changes; the restock toggle below can still
  // override it per return (e.g. only the outer packaging was damaged).
  useEffect(() => {
    const nonSellable = form.reason === "Damaged packaging" || form.reason === "Expired product" || form.reason === "Quality issue";
    const condition = form.reason === "Expired product" ? "expired" : nonSellable ? "damaged" : "good";
    setItemRows(rows => rows.map(r => ({ ...r, condition, restock: !nonSellable })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.reason]);

  const selectedItems = itemRows.filter(r => r.selected);
  const totalRefund = selectedItems.reduce((s, r) => s + r.qty * r.refundPerUnit, 0);

  const lookupInvoice = async () => {
    const num = invoiceNumber.trim();
    if (!num) return;
    setInvoiceError("");
    setLoadingItems(true);
    setItemRows([]);
    setMatchedOrder(null);
    setMatchedBranchName("");
    try {
      // Quick check in preloaded list to get the ID, then fetch full order with products
      const cached = orders.find(o => o.orderNumber.toLowerCase() === num.toLowerCase());
      let order: Order | null = null;
      if (cached) {
        order = await api.getOrder(cached.id).catch(() => null);
      } else {
        order = await api.getOrderByNumber(num).catch(() => null);
      }
      if (!order) { setInvoiceError("Invoice not found. Check the number and try again."); return; }
      setMatchedOrder(order);
      // Resolve branch name from the order (use embedded branch object, or look up from context list)
      const branchName =
        order.branch?.name ??
        allBranches.find(b => b.id === order!.branchId)?.name ??
        "Unknown branch";
      setMatchedBranchName(branchName);
      // Same fix as the orderId-select path above — always take this order's own customerId.
      setForm(p => ({ ...p, orderId: order!.id, branchId: order!.branchId, customerId: order!.customerId ?? "" }));
      const rows: ItemRow[] = (order.items ?? []).map((oi: OrderItem) => ({
        orderItemId: oi.id ?? "",
        productId: oi.productId,
        productName: oi.product?.name ?? oi.productId,
        unitPrice: oi.unitPrice,
        refundPerUnit: refundPerUnit(order, oi),
        maxQty: Number(oi.quantity),
        qty: 1,
        condition: "good",
        restock: true,
        selected: false,
      }));
      setItemRows(rows);
    } catch {
      setInvoiceError("Failed to look up invoice. Try again.");
    } finally { setLoadingItems(false); }
  };

  const handleSubmit = async () => {
    const selectedItems = itemRows.filter(r => r.selected && r.qty > 0);
    if (!form.orderId || !form.branchId || !form.reason || selectedItems.length === 0) {
      setError("Scan an invoice, select at least one item, and choose a reason.");
      return;
    }
    setSaving(true); setError(null);
    try {
      // refundAmount here is advisory — ReturnsController.Create recomputes both the per-line
      // and header amounts from the original order server-side and ignores what we send.
      const items: CustomerReturnItem[] = selectedItems.map(row => ({
        productId: row.productId,
        orderItemId: row.orderItemId || undefined,
        quantity: row.qty,
        unitPrice: row.unitPrice,
        refundAmount: row.qty * row.refundPerUnit,
        condition: row.condition,
        restock: row.restock,
      }));
      const totalRefundAmount = selectedItems.reduce((s, r) => s + r.qty * r.refundPerUnit, 0);
      await api.createReturn({
        orderId: form.orderId,
        customerId: form.customerId || undefined,
        branchId: form.branchId,
        returnType: form.returnType,
        refundMethod: form.refundMethod,
        refundAmount: totalRefundAmount,
        reason: form.reason,
        notes: form.notes || undefined,
        items,
      });
      setSheetOpen(false);
      setForm(emptyForm);
      setItemRows([]);
      setInvoiceNumber("");
      setMatchedOrder(null);
      setMatchedBranchName("");
      setInvoiceError("");
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to submit return.");
    } finally { setSaving(false); }
  };

  const pendingCount = returns.filter(r => r.status === "pending").length;

  return (
    <PageShell title="Returns" subtitle="Customer return requests and refund processing">
      {loadError && <LoadErrorBanner onRetry={load} />}
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
        <div className="w-44">
          <SearchableMultiSelect
            placeholder="All Branches"
            options={allBranches.map(b => ({ id: b.id, label: b.name }))}
            selected={branchFilter}
            onChange={setBranchFilter}
          />
        </div>
        <div className="w-44">
          <SearchableMultiSelect
            placeholder="All Statuses"
            options={[
              { id: "pending", label: `Pending${pendingCount > 0 ? ` (${pendingCount})` : ""}` },
              { id: "approved", label: "Approved" },
              { id: "completed", label: "Completed" },
              { id: "rejected", label: "Rejected" },
            ]}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
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
        <Sheet open={sheetOpen} onOpenChange={v => { setSheetOpen(v); if (!v) { setForm(emptyForm); setItemRows([]); setInvoiceNumber(""); setMatchedOrder(null); setMatchedBranchName(""); setInvoiceError(""); setError(null); } }}>
          {canCreate && (
            <SheetTrigger asChild>
              <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9">
                <Plus className="h-4 w-4" /> New Return
              </Button>
            </SheetTrigger>
          )}
          <SheetContent className="w-[420px] overflow-y-auto">
            <SheetHeader><SheetTitle className="text-lg">Process customer return</SheetTitle></SheetHeader>
            <div className="mt-6 space-y-5">

              {/* Original Invoice */}
              <FieldRow label="Original invoice">
                <div className="flex gap-2">
                  <Input
                    ref={invoiceInputRef}
                    value={invoiceNumber}
                    onChange={e => setInvoiceNumber(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && lookupInvoice()}
                    placeholder="ORD-20260623-ABCDEF"
                    className="h-11 text-sm flex-1"
                  />
                  <Button variant="outline" className="h-11 px-4 gap-2 shrink-0" onClick={loadingItems ? undefined : lookupInvoice} disabled={loadingItems}>
                    {loadingItems ? <Loader2 className="h-4 w-4 animate-spin" /> : <><ScanLine className="h-4 w-4" />Scan</>}
                  </Button>
                </div>
                {invoiceError && <p className="text-xs text-destructive mt-1">{invoiceError}</p>}
                {matchedOrder && (
                  <div className="mt-1 space-y-1">
                    <p className="text-xs text-success">✓ {matchedOrder.orderNumber} · SAR {matchedOrder.totalAmount.toFixed(2)} · {matchedOrder.items?.length ?? 0} item(s)</p>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                      Branch: <span className="font-medium text-foreground">{matchedBranchName}</span>
                    </div>
                  </div>
                )}
              </FieldRow>

              {/* Items — multi-select with per-item quantity */}
              {itemRows.length > 0 && (
                <FieldRow label={`Select items to return (${selectedItems.length} selected)`}>
                  <div className="space-y-2 mt-1">
                    {itemRows.map((row, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer transition-colors ${row.selected ? "border-primary/50 bg-primary/5" : "border-border/60 hover:border-border"}`}
                        onClick={() => updateRow(i, { selected: !row.selected })}
                      >
                        <input
                          type="checkbox"
                          checked={row.selected}
                          readOnly
                          className="h-4 w-4 accent-primary shrink-0 pointer-events-none"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{row.productName}</p>
                          <p className="text-xs text-muted-foreground"><SARIcon />{row.refundPerUnit.toFixed(2)}/unit refund · max {row.maxQty}</p>
                        </div>
                        {row.selected && (
                          <Input
                            type="number"
                            min={1}
                            max={row.maxQty}
                            value={row.qty}
                            onClick={e => e.stopPropagation()}
                            onChange={e => updateRow(i, { qty: Math.min(Math.max(1, Number(e.target.value) || 1), row.maxQty) })}
                            className="h-8 w-20 text-center text-sm shrink-0"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </FieldRow>
              )}

              {/* Reason */}
              <FieldRow label="Reason">
                <Select value={form.reason} onValueChange={v => setForm(p => ({ ...p, reason: v }))}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select reason" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Damaged packaging">Damaged packaging</SelectItem>
                    <SelectItem value="Wrong item received">Wrong item received</SelectItem>
                    <SelectItem value="Expired product">Expired product</SelectItem>
                    <SelectItem value="Quality issue">Quality issue</SelectItem>
                    <SelectItem value="Customer changed mind">Customer changed mind</SelectItem>
                    <SelectItem value="Duplicate purchase">Duplicate purchase</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>

              {/* Refund method */}
              <FieldRow label="Refund method">
                <Select value={form.refundMethod} onValueChange={v => setForm(p => ({ ...p, refundMethod: v }))}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card_reversal">Card Reversal</SelectItem>
                    <SelectItem value="store_credit">Store Credit</SelectItem>
                    <SelectItem value="original_payment">Original Payment Method</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>

              {/* Notes */}
              <FieldRow label="Notes">
                <Textarea value={form.notes} onChange={setF("notes")} placeholder="Optional notes for audit…" rows={3} className="resize-none text-sm" />
              </FieldRow>

              {/* Restock toggle — applies to all selected items */}
              {selectedItems.length > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-border/60 px-4 py-3">
                  <span className="text-sm text-muted-foreground">Restock selected items to inventory</span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextRestock = !(selectedItems[0]?.restock ?? true);
                      setItemRows(prev => prev.map(r => r.selected ? { ...r, restock: nextRestock } : r));
                    }}
                    className={`px-4 py-1 rounded-full text-xs font-semibold border transition-colors cursor-pointer select-none ${
                      selectedItems[0]?.restock ?? true
                        ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                        : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                    }`}
                  >
                    {selectedItems[0]?.restock ?? true ? "Yes" : "No"}
                  </button>
                </div>
              )}

              {/* Refund preview */}
              {selectedItems.length > 0 && (
                <div className="rounded-xl bg-muted/40 px-4 py-2.5 flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Total refund ({selectedItems.length} item{selectedItems.length !== 1 ? "s" : ""})
                  </span>
                  <span className="font-semibold"><SARIcon />{totalRefund.toFixed(2)}</span>
                </div>
              )}

              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button className="w-full gradient-primary text-primary-foreground border-0 h-11 text-sm font-semibold" onClick={handleSubmit} disabled={saving || !matchedOrder || selectedItems.length === 0}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Submit return
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
                  <th className="px-3 py-3 font-semibold">Branch</th>
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
                    <td className="px-3 py-3 text-xs">{allBranches.find(b => b.id === r.branchId)?.name ?? "—"}</td>
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
                        {r.status === "pending" && canApprove && (
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
                        {r.status === "approved" && canApprove && (
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
                  <tr><td colSpan={10} className="text-center py-10 text-muted-foreground text-sm">No returns found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <DetailSheet ret={viewReturn} onClose={() => setViewReturn(null)} onAction={load} canApprove={canApprove} />
    </PageShell>
  );
}
