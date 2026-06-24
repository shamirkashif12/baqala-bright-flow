import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useCallback } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Printer, Download, Globe, Pencil, Package, CreditCard,
  User, Store, ChevronRight, Loader2, RefreshCw,
  CheckCircle2, XCircle, Clock, Truck, AlertCircle, X,
} from "lucide-react";
import { api, type Order, type Branch } from "@/lib/api";
import { SARIcon } from "@/lib/currency";

export const Route = createFileRoute("/_app/orders")({ component: Orders });

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ORDER_STATUSES = ["pending", "processing", "ready_to_deliver", "delivered", "completed", "cancelled", "refunded"];
const PAYMENT_STATUSES = ["pending", "paid", "partially_paid", "refunded"];

function statusColor(s: string) {
  switch (s) {
    case "paid": case "completed": case "delivered": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "pending": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "processing": case "ready_to_deliver": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "cancelled": case "refunded": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    case "partially_paid": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
    default: return "bg-muted text-muted-foreground";
  }
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    paid: "bg-green-500", completed: "bg-green-500", delivered: "bg-green-500",
    pending: "bg-yellow-500", processing: "bg-blue-500", ready_to_deliver: "bg-blue-400",
    cancelled: "bg-red-500", refunded: "bg-red-400", partially_paid: "bg-orange-500",
  };
  return <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${colors[status] ?? "bg-muted-foreground"}`} />;
}

function SBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${statusColor(status)}`}>
      <StatusDot status={status} />{status.replace(/_/g, " ")}
    </span>
  );
}

function statusIcon(s: string) {
  if (["completed", "delivered", "paid"].includes(s)) return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (["cancelled", "refunded"].includes(s)) return <XCircle className="h-4 w-4 text-red-500" />;
  if (["processing", "ready_to_deliver"].includes(s)) return <Truck className="h-4 w-4 text-blue-500" />;
  return <Clock className="h-4 w-4 text-yellow-500" />;
}

function exportCSV(orders: Order[]) {
  const rows = [
    ["Order#", "Branch", "Cashier", "Subtotal", "Discount", "Tax", "Total", "Order Status", "Payment Status", "Date"],
    ...orders.map(o => [
      o.orderNumber, o.branch?.name ?? "", o.cashier?.fullName ?? "",
      o.subtotal.toFixed(2), o.discountAmount.toFixed(2), o.taxAmount.toFixed(2),
      o.totalAmount.toFixed(2), o.orderStatus, o.paymentStatus,
      new Date(o.createdAt).toLocaleString("en-SA"),
    ]),
  ];
  const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function printOrders(orders: Order[]) {
  const rows = orders.map(o => `
    <tr>
      <td>${o.orderNumber}</td>
      <td>${o.branch?.name ?? "—"}</td>
      <td>${o.cashier?.fullName ?? "—"}</td>
      <td>SAR ${o.totalAmount.toFixed(2)}</td>
      <td>${o.orderStatus.replace(/_/g, " ")}</td>
      <td>${o.paymentStatus.replace(/_/g, " ")}</td>
      <td>${new Date(o.createdAt).toLocaleDateString("en-SA")}</td>
    </tr>`).join("");

  const win = window.open("", "_blank", "width=900,height=650");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Orders</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; margin: 24px; color: #000; }
      h2 { font-size: 16px; margin-bottom: 4px; }
      p.sub { font-size: 11px; color: #666; margin: 0 0 16px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #000; color: #fff; padding: 7px 10px; text-align: left; font-size: 11px; text-transform: uppercase; }
      td { padding: 7px 10px; border-bottom: 1px solid #e0e0e0; }
      tr:nth-child(even) td { background: #f9f9f9; }
      td:nth-child(4) { font-weight: bold; }
    </style>
  </head><body>
    <h2>Orders Report</h2>
    <p class="sub">Printed ${new Date().toLocaleString("en-SA")} &nbsp;·&nbsp; ${orders.length} orders</p>
    <table>
      <thead><tr>
        <th>Order #</th><th>Branch</th><th>Cashier</th>
        <th>Total</th><th>Status</th><th>Payment</th><th>Date</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 400);
}

// ─── Order Detail Drawer ──────────────────────────────────────────────────────
function OrderDetail({ orderId, onStatusChanged }: {
  orderId: string; onStatusChanged: () => void;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.getOrder(orderId).then(o => { setOrder(o); setNewStatus(o.orderStatus); }).finally(() => setLoading(false));
  }, [orderId]);

  const saveStatus = async () => {
    if (!order) return;
    setSaving(true);
    try {
      await api.updateOrderStatus(order.id, newStatus);
      setOrder(o => o ? { ...o, orderStatus: newStatus } : o);
      setEditing(false);
      onStatusChanged();
    } finally { setSaving(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (!order) return <div className="text-center py-12 text-muted-foreground">Order not found.</div>;

  const payMethod = order.payments?.[0]?.paymentMethod;

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-lg font-bold">{order.orderNumber}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(order.createdAt).toLocaleString("en-SA", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <SBadge status={order.orderStatus} />
          <SBadge status={order.paymentStatus} />
        </div>
      </div>

      <Separator />

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Store className="h-4 w-4 shrink-0" />
          <div>
            <p className="text-[11px]">Branch</p>
            <p className="font-medium text-foreground">{order.branch?.name ?? "—"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <User className="h-4 w-4 shrink-0" />
          <div>
            <p className="text-[11px]">Cashier</p>
            <p className="font-medium text-foreground">{order.cashier?.fullName ?? "—"}</p>
          </div>
        </div>
        {order.customer && (
          <div className="flex items-center gap-2 text-muted-foreground col-span-2">
            <User className="h-4 w-4 shrink-0" />
            <div>
              <p className="text-[11px]">Customer</p>
              <p className="font-medium text-foreground">{order.customer.fullName}</p>
              {order.customer.phone && <p className="text-xs text-muted-foreground">{order.customer.phone}</p>}
              {order.customer.email && <p className="text-xs text-muted-foreground">{order.customer.email}</p>}
            </div>
          </div>
        )}
        {payMethod && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <CreditCard className="h-4 w-4 shrink-0" />
            <div>
              <p className="text-[11px]">Payment</p>
              <p className="font-medium text-foreground capitalize">{payMethod}</p>
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Items */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5" /> Items
        </p>
        <div className="space-y-2">
          {(order.items ?? []).map((item, i) => (
            <div key={i} className="flex items-center justify-between text-sm bg-muted/30 rounded-lg px-3 py-2">
              <div>
                <p className="font-medium">{(item as any).product?.name ?? "Product"}</p>
                <p className="text-xs text-muted-foreground"><SARIcon />{item.unitPrice.toFixed(2)} × {item.quantity}</p>
              </div>
              <p className="font-semibold tabular-nums"><SARIcon />{item.totalPrice.toFixed(2)}</p>
            </div>
          ))}
          {(order.items ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground italic">No items</p>
          )}
        </div>
      </div>

      <Separator />

      {/* Totals */}
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span><span><SARIcon />{order.subtotal.toFixed(2)}</span>
        </div>
        {order.discountAmount > 0 && (
          <div className="flex justify-between text-red-600">
            <span>Discount</span><span>-<SARIcon />{order.discountAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-muted-foreground">
          <span>VAT</span><span><SARIcon />{order.taxAmount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between font-bold text-base border-t pt-2 mt-1">
          <span>Total</span><span className="text-primary"><SARIcon />{order.totalAmount.toFixed(2)}</span>
        </div>
      </div>

      <Separator />

      {/* Status update */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Update Status</p>
        {editing ? (
          <div className="space-y-2">
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORDER_STATUSES.map(s => (
                  <SelectItem key={s} value={s}>
                    <span className="capitalize">{s.replace(/_/g, " ")}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 gradient-primary text-primary-foreground border-0" onClick={saveStatus} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEditing(false); setNewStatus(order.orderStatus); }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">{statusIcon(order.orderStatus)}<span className="capitalize text-sm">{order.orderStatus.replace(/_/g, " ")}</span></div>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5" /> Change
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── POS Tab ──────────────────────────────────────────────────────────────────
function POSTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [branchId, setBranchId] = useState("all");
  const [stFilter, setStFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    api.getBranches("active").then(setBranches).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    api.getOrders({
      branchId: branchId !== "all" ? branchId : undefined,
      status: stFilter !== "all" ? stFilter : undefined,
      from: dateFrom || undefined,
      to: dateTo || undefined,
    }).then(setOrders).finally(() => setLoading(false));
  }, [branchId, stFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  // Client-side text search only
  const filtered = useMemo(() => orders.filter(o => {
    if (!q) return true;
    return o.orderNumber?.toLowerCase().includes(q.toLowerCase()) ||
      o.branch?.name?.toLowerCase().includes(q.toLowerCase()) ||
      o.cashier?.fullName?.toLowerCase().includes(q.toLowerCase());
  }), [orders, q]);

  // Summary cards
  const totalRevenue = filtered.reduce((s, o) => s + o.totalAmount, 0);
  const pendingCount = filtered.filter(o => o.orderStatus === "pending").length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Orders", value: filtered.length, color: "text-foreground" },
          { label: "Revenue", value: <><SARIcon />{totalRevenue.toFixed(2)}</>, color: "text-primary" },
          { label: "Pending", value: pendingCount, color: "text-yellow-600" },
        ].map(c => (
          <Card key={c.label} className="px-4 py-3 border-border/60 shadow-card">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search order number, branch, cashier…" className="h-9 w-64 flex-shrink-0" />
        <Select value={branchId} onValueChange={setBranchId}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="All Branches" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={stFilter} onValueChange={setStFilter}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {ORDER_STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Order Date:</span>
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
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => load()}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => exportCSV(filtered)} disabled={filtered.length === 0}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => printOrders(filtered)} disabled={filtered.length === 0}>
          <Printer className="h-4 w-4" /> Print
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading orders…
        </div>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 font-semibold">Order#</th>
                  <th className="px-3 py-3 font-semibold">Branch</th>
                  <th className="px-3 py-3 font-semibold">Cashier</th>
                  <th className="px-3 py-3 font-semibold">Total</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Payment</th>
                  <th className="px-3 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 font-semibold w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-border/40 hover:bg-muted/30 last:border-0 cursor-pointer transition-colors"
                    onClick={() => setSelectedId(o.id)}
                  >
                    <td className="px-3 py-3 font-mono text-xs font-bold text-primary">{o.orderNumber}</td>
                    <td className="px-3 py-3 text-xs">{o.branch?.name ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{o.cashier?.fullName ?? "—"}</td>
                    <td className="px-3 py-3 tabular-nums font-semibold"><SARIcon />{o.totalAmount.toFixed(2)}</td>
                    <td className="px-3 py-3"><SBadge status={o.orderStatus} /></td>
                    <td className="px-3 py-3"><SBadge status={o.paymentStatus} /></td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {new Date(o.createdAt).toLocaleDateString("en-SA")}
                    </td>
                    <td className="px-3 py-3">
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                      <AlertCircle className="h-6 w-6 mx-auto mb-2 opacity-40" />
                      No orders match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="px-4 py-2 border-t border-border/40 text-xs text-muted-foreground">
              Showing {filtered.length} of {orders.length} orders
            </div>
          )}
        </Card>
      )}

      {/* Order detail drawer */}
      <Sheet open={!!selectedId} onOpenChange={v => !v && setSelectedId(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <Package className="h-4 w-4" /> Order Details
            </SheetTitle>
          </SheetHeader>
          {selectedId && (
            <OrderDetail
              orderId={selectedId}
              onStatusChanged={load}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Online Tab ───────────────────────────────────────────────────────────────
function OnlineTab() {
  return (
    <Card className="p-8 border-border/60 shadow-card text-center text-muted-foreground text-sm">
      <Globe className="h-8 w-8 mx-auto mb-3 opacity-40" />
      Online order integration requires a third-party e-commerce channel (website / mobile app).<br />
      Connect via the Settings → Integrations panel.
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
function Orders() {
  return (
    <PageShell title="Orders" subtitle="POS and online order management">
      <Tabs defaultValue="pos">
        <TabsList className="mb-4">
          <TabsTrigger value="pos">POS Orders</TabsTrigger>
          <TabsTrigger value="online" className="gap-1.5">
            <Globe className="h-3.5 w-3.5" /> Online Orders
          </TabsTrigger>
        </TabsList>
        <TabsContent value="pos" className="mt-0"><POSTab /></TabsContent>
        <TabsContent value="online" className="mt-0"><OnlineTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
