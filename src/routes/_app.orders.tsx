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
import { ShoppingBag, Clock, Truck, CheckCircle2, Eye, Printer, Pencil } from "lucide-react";
import { api, type Order } from "@/lib/api";

export const Route = createFileRoute("/_app/orders")({ component: Orders });

function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState<string | null>(null);

  useEffect(() => {
    api.getOrders()
      .then(setOrders)
      .finally(() => setLoading(false));
  }, []);

  const pending   = orders.filter((o) => o.orderStatus === "pending").length;
  const processing = orders.filter((o) => o.orderStatus === "processing").length;
  const ready     = orders.filter((o) => o.orderStatus === "ready_to_deliver").length;
  const delivered = orders.filter((o) => o.orderStatus === "delivered").length;

  const fmt = (n: number) => `ر.س ${n.toLocaleString("en-SA", { minimumFractionDigits: 2 })}`;
  const fmtDate = (s: string) => new Date(s).toLocaleString("en-SA", { dateStyle: "short", timeStyle: "short" });

  return (
    <PageShell title="Orders" subtitle="Track, update & deliver every customer order">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Pending"          value={String(pending)}   icon={Clock}        accent="warning" />
        <MetricCard label="Processing"       value={String(processing)} icon={ShoppingBag}  accent="primary" />
        <MetricCard label="Ready to Deliver" value={String(ready)}     icon={Truck} />
        <MetricCard label="Delivered"        value={String(delivered)} icon={CheckCircle2} accent="success" />
      </div>

      <Toolbar
        placeholder="Search order ID, customer…"
        primaryLabel="New Order"
        extra={<Button size="sm" variant="outline" className="h-10" onClick={() => setOpen(true)}>+ Quick Add</Button>}
      />

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <DataTable
          columns={[
            { key: "orderNumber", label: "ID",     render: (r: Order) => <span className="font-mono font-semibold">{r.orderNumber}</span> },
            { key: "totalAmount", label: "Amount", render: (r: Order) => <span className="font-semibold">{fmt(r.totalAmount)}</span> },
            { key: "orderStatus", label: "Status", render: (r: Order) => <StatusBadge status={r.orderStatus} /> },
            { key: "paymentStatus", label: "Payment", render: (r: Order) => <StatusBadge status={r.paymentStatus} /> },
            { key: "createdAt",   label: "Date",   render: (r: Order) => fmtDate(r.createdAt) },
            { key: "actions",     label: "",       render: (r: Order) => (
              <div className="flex gap-1 justify-end">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setStatusOpen(r.id)}><Eye className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setStatusOpen(r.id)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setPrintOpen(r.id)}><Printer className="h-4 w-4" /></Button>
              </div>
            )},
          ]}
          rows={orders}
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Order</DialogTitle>
            <DialogDescription>Create a quick order for an existing or walk-in customer.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div><Label>Customer</Label><Input placeholder="Walk-in customer" className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Branch</Label><Select defaultValue="olaya"><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="olaya">Riyadh — Olaya</SelectItem><SelectItem value="khobar">Khobar</SelectItem><SelectItem value="jeddah">Jeddah</SelectItem></SelectContent></Select></div>
              <div><Label>Payment</Label><Select defaultValue="cash"><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="card">Mada</SelectItem><SelectItem value="wallet">STC Pay</SelectItem></SelectContent></Select></div>
            </div>
            <div><Label>Notes</Label><Input placeholder="Optional notes" className="mt-1" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground border-0" onClick={() => setOpen(false)}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!statusOpen} onOpenChange={(v) => !v && setStatusOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Order {statusOpen}</DialogTitle>
            <DialogDescription>Move the order through fulfilment stages.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 my-2">
            {["pending","processing","ready_to_deliver","delivered","cancelled"].map((s) => (
              <Button key={s} variant="outline" className="justify-start capitalize" onClick={() => {
                if (statusOpen) api.updateOrderStatus(statusOpen, s).then(() => api.getOrders().then(setOrders));
                setStatusOpen(null);
              }}>{s.replace(/_/g, " ")}</Button>
            ))}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setStatusOpen(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!printOpen} onOpenChange={(v) => !v && setPrintOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invoice {printOpen}</DialogTitle><DialogDescription>Choose delivery method</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline">Preview</Button>
            <Button variant="outline">Print</Button>
            <Button variant="outline">Send WhatsApp</Button>
            <Button variant="outline">Email</Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
