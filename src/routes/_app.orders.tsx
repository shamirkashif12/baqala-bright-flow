import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingBag, Clock, Truck, CheckCircle2, Eye, Printer, Pencil } from "lucide-react";

export const Route = createFileRoute("/_app/orders")({ component: Orders });

const orders = [
  { id: "ORD-10241", customer: "Khalid Al Otaibi", amount: "ر.س 248.50", status: "pending", payment: "Cash", by: "Cashier-01", date: "02 Jun 26 · 10:14", pay: "unpaid" },
  { id: "ORD-10240", customer: "Sara Al Ghamdi", amount: "ر.س 1,420.00", status: "processing", payment: "Mada", by: "Cashier-02", date: "02 Jun 26 · 10:08", pay: "paid" },
  { id: "ORD-10239", customer: "Mohammed Al Qahtani", amount: "ر.س 86.75", status: "ready to deliver", payment: "STC Pay", by: "Cashier-01", date: "02 Jun 26 · 09:51", pay: "paid" },
  { id: "ORD-10238", customer: "Nora Al Harbi", amount: "ر.س 512.00", status: "delivered", payment: "Mada", by: "Cashier-03", date: "02 Jun 26 · 09:32", pay: "paid" },
  { id: "ORD-10237", customer: "Ahmad Al Dossary", amount: "ر.س 64.00", status: "cancelled", payment: "Cash", by: "Cashier-02", date: "02 Jun 26 · 09:11", pay: "refunded" },
  { id: "ORD-10236", customer: "Layla Al Saud", amount: "ر.س 980.20", status: "delivered", payment: "Apple Pay", by: "Cashier-01", date: "02 Jun 26 · 08:55", pay: "paid" },
];

function Orders() {
  const [open, setOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState<string | null>(null);
  const [printOpen, setPrintOpen] = useState<string | null>(null);
  return (
    <PageShell title="Orders" subtitle="Track, update & deliver every customer order">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Pending" value="38" icon={Clock} accent="warning" />
        <MetricCard label="Processing" value="22" icon={ShoppingBag} accent="primary" />
        <MetricCard label="Ready to Deliver" value="14" icon={Truck} />
        <MetricCard label="Delivered" value="1,210" delta="+12%" trend="up" icon={CheckCircle2} accent="success" />
      </div>

      <div className="flex flex-wrap gap-2">
        {["Daily", "Weekly", "Monthly", "Custom"].map((p, i) => (
          <Button key={p} size="sm" variant={i === 0 ? "default" : "outline"} className={i === 0 ? "gradient-primary text-primary-foreground border-0" : ""}>{p}</Button>
        ))}
      </div>

      <Toolbar
        placeholder="Search order ID, customer…"
        primaryLabel="New Order"
        extra={<Button size="sm" variant="outline" className="h-10" onClick={() => setOpen(true)}>+ Quick Add</Button>}
      />

      <DataTable
        columns={[
          { key: "id", label: "ID", render: (r) => <span className="font-mono font-semibold">{r.id}</span> },
          { key: "customer", label: "Customer" },
          { key: "amount", label: "Order Amount", render: (r) => <span className="font-semibold">{r.amount}</span> },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "payment", label: "Payment" },
          { key: "pay", label: "Payment Status", render: (r) => <StatusBadge status={r.pay} /> },
          { key: "by", label: "Created By" },
          { key: "date", label: "Created Date" },
          { key: "actions", label: "", render: (r) => (
            <div className="flex gap-1 justify-end">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setStatusOpen(r.id)}><Eye className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setStatusOpen(r.id)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setPrintOpen(r.id)}><Printer className="h-4 w-4" /></Button>
            </div>
          ) },
        ]}
        rows={orders}
      />

      {/* Add / Quick Order */}
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
              <div><Label>Payment</Label><Select defaultValue="cash"><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="mada">Mada</SelectItem><SelectItem value="stc">STC Pay</SelectItem></SelectContent></Select></div>
            </div>
            <div><Label>Notes</Label><Input placeholder="Optional notes" className="mt-1" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground border-0" onClick={() => setOpen(false)}>Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update status */}
      <Dialog open={!!statusOpen} onOpenChange={(v) => !v && setStatusOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Order {statusOpen}</DialogTitle>
            <DialogDescription>Move the order through fulfilment stages.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 my-2">
            {["Pending", "Processing", "Ready to Deliver", "Delivered", "Cancelled"].map((s) => (
              <Button key={s} variant="outline" className="justify-start">{s}</Button>
            ))}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setStatusOpen(null)}>Close</Button><Button className="gradient-primary text-primary-foreground border-0" onClick={() => setStatusOpen(null)}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print invoice */}
      <Dialog open={!!printOpen} onOpenChange={(v) => !v && setPrintOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invoice {printOpen}</DialogTitle><DialogDescription>Choose delivery method</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline">Preview</Button>
            <Button variant="outline">Print</Button>
            <Button variant="outline">Send WhatsApp</Button>
            <Button variant="outline">Email</Button>
          </div>
          <div className="mt-3 rounded-lg border bg-muted/30 p-4 text-sm font-mono">
            <p className="font-bold">MI Money Mart · Olaya</p>
            <p className="text-xs text-muted-foreground">VAT 310-XXX-XXX-00003</p>
            <div className="mt-2 border-t border-dashed pt-2 space-y-0.5">
              <p>Almarai Laban 1L × 2 ........ ر.س 18.00</p>
              <p>Bread Pack × 1 .............. ر.س 6.50</p>
              <p>Nadec Milk 2L × 1 ........... ر.س 14.00</p>
              <p className="border-t border-dashed pt-1 font-bold">TOTAL ............. ر.س 38.50</p>
              <p className="text-xs">VAT 15% included</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}