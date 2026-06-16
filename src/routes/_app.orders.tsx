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
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/module-placeholder";
import { Plus, Printer, Download, SlidersHorizontal, Zap, Trash2, Globe, Eye, Pencil } from "lucide-react";
import { api, type Order } from "@/lib/api";

export const Route = createFileRoute("/_app/orders")({ component: Orders });

const onlineOrders = [
  { id: "on1", orderNumber: "ONL-001", customer: "Fatima Al-Saud", channel: "Website", total: 312.5, status: "pending", date: "2026-06-16" },
  { id: "on2", orderNumber: "ONL-002", customer: "Mohammed Khalid", channel: "App", total: 88.0, status: "processing", date: "2026-06-16" },
  { id: "on3", orderNumber: "ONL-003", customer: "Sara Qureshi", channel: "Website", total: 540.75, status: "delivered", date: "2026-06-15" },
];

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

function POSTab() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [printOpen, setPrintOpen] = useState(false);
  const [q, setQ] = useState("");
  const [br, setBr] = useState("all");
  const [st, setSt] = useState("all");
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [delOrder, setDelOrder] = useState<string | null>(null);

  useEffect(() => {
    api.getOrders()
      .then(setOrders)
      .finally(() => setLoading(false));
  }, []);

  const filtered = orders.filter(o => {
    const matchQ = !q || o.orderNumber?.toLowerCase().includes(q.toLowerCase());
    const matchBr = br === "all" || o.branch?.name === br;
    const matchSt = st === "all" || o.orderStatus === st;
    return matchQ && matchBr && matchSt;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search order number…" className="h-9 w-52 flex-shrink-0" />
        <Select value={br} onValueChange={setBr}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Branch" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {[...new Set(orders.map(o => o.branch?.name).filter(Boolean))].map(b => (
              <SelectItem key={b!} value={b!}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={st} onValueChange={setSt}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="processing">Processing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetTrigger asChild>
            <Button size="sm" variant="outline" className="h-9 gap-1.5"><SlidersHorizontal className="h-4 w-4" />Filters</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader><SheetTitle>Advanced Filters</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-4">
              <FieldRow label="Date Range">
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" className="h-9" />
                  <Input type="date" className="h-9" />
                </div>
              </FieldRow>
              <FieldRow label="Payment Status">
                <Select><SelectTrigger className="h-9"><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent><SelectItem value="paid">Paid</SelectItem><SelectItem value="unpaid">Unpaid</SelectItem></SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Min Amount"><Input type="number" placeholder="0.00" className="h-9" /></FieldRow>
              <FieldRow label="Max Amount"><Input type="number" placeholder="10000.00" className="h-9" /></FieldRow>
              <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={() => setFiltersOpen(false)}>Apply</Button>
            </div>
          </SheetContent>
        </Sheet>
        <div className="flex-1" />
        <Sheet open={exportOpen} onOpenChange={setExportOpen}>
          <SheetTrigger asChild>
            <Button size="sm" variant="outline" className="h-9 gap-1.5"><Download className="h-4 w-4" />Export</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader><SheetTitle>Export Orders</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-4">
              <FieldRow label="Format">
                <Select><SelectTrigger className="h-9"><SelectValue placeholder="CSV" /></SelectTrigger>
                  <SelectContent><SelectItem value="csv">CSV</SelectItem><SelectItem value="xlsx">Excel</SelectItem><SelectItem value="pdf">PDF</SelectItem></SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Date Range">
                <div className="grid grid-cols-2 gap-2"><Input type="date" className="h-9" /><Input type="date" className="h-9" /></div>
              </FieldRow>
              <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={() => setExportOpen(false)}>Download</Button>
            </div>
          </SheetContent>
        </Sheet>
        <Sheet open={quickAddOpen} onOpenChange={setQuickAddOpen}>
          <SheetTrigger asChild>
            <Button size="sm" variant="outline" className="h-9 gap-1.5"><Zap className="h-4 w-4" />Quick Add</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader><SheetTitle>Quick Order</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-4">
              <FieldRow label="Customer"><Input placeholder="Walk-in customer" /></FieldRow>
              <FieldRow label="Items"><Textarea placeholder="Item list…" rows={3} /></FieldRow>
              <FieldRow label="Total (SAR)"><Input type="number" placeholder="0.00" className="h-9" /></FieldRow>
              <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={() => setQuickAddOpen(false)}>Place Order</Button>
            </div>
          </SheetContent>
        </Sheet>
        <Sheet open={newOrderOpen} onOpenChange={setNewOrderOpen}>
          <SheetTrigger asChild>
            <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9">
              <Plus className="h-4 w-4" /> New Order
            </Button>
          </SheetTrigger>
          <SheetContent className="max-w-lg">
            <SheetHeader><SheetTitle>Create New Order</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-4">
              <FieldRow label="Customer"><Input placeholder="Customer name or ID" /></FieldRow>
              <FieldRow label="Branch">
                <Select><SelectTrigger className="h-9"><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent><SelectItem value="r">Riyadh</SelectItem><SelectItem value="j">Jeddah</SelectItem></SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Items"><Textarea placeholder="Add items…" rows={4} /></FieldRow>
              <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={() => setNewOrderOpen(false)}>Create Order</Button>
            </div>
          </SheetContent>
        </Sheet>
        <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => setPrintOpen(true)}>
          <Printer className="h-4 w-4" />
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
                  <th className="px-3 py-3 font-semibold">Order#</th>
                  <th className="px-3 py-3 font-semibold">Branch</th>
                  <th className="px-3 py-3 font-semibold">Cashier</th>
                  <th className="px-3 py-3 font-semibold">Total</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Payment</th>
                  <th className="px-3 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-3 py-3 font-mono text-xs font-bold">{o.orderNumber}</td>
                    <td className="px-3 py-3 text-xs">{o.branch?.name ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{o.cashier?.fullName ?? "—"}</td>
                    <td className="px-3 py-3 tabular-nums font-semibold">SAR {o.totalAmount.toFixed(2)}</td>
                    <td className="px-3 py-3"><StatusBadge status={o.orderStatus} /></td>
                    <td className="px-3 py-3"><StatusBadge status={o.paymentStatus} /></td>
                    <td className="px-3 py-3 text-xs">{new Date(o.createdAt).toLocaleDateString("en-SA")}</td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditOrder(o)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDelOrder(o.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">No orders found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Edit Sheet */}
      <Sheet open={!!editOrder} onOpenChange={v => !v && setEditOrder(null)}>
        <SheetContent>
          <SheetHeader><SheetTitle>Edit Order {editOrder?.orderNumber}</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-4">
            <FieldRow label="Order Status">
              <Select defaultValue={editOrder?.orderStatus}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
            <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={() => setEditOrder(null)}>Save</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function OnlineTab() {
  return (
    <Card className="overflow-hidden border-border/60 shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-3 font-semibold">Order#</th>
              <th className="px-3 py-3 font-semibold">Customer</th>
              <th className="px-3 py-3 font-semibold">Channel</th>
              <th className="px-3 py-3 font-semibold">Total</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Date</th>
            </tr>
          </thead>
          <tbody>
            {onlineOrders.map((o) => (
              <tr key={o.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                <td className="px-3 py-3 font-mono text-xs font-bold">{o.orderNumber}</td>
                <td className="px-3 py-3">{o.customer}</td>
                <td className="px-3 py-3"><Badge variant="outline" className="text-xs gap-1"><Globe className="h-3 w-3" />{o.channel}</Badge></td>
                <td className="px-3 py-3 tabular-nums font-semibold">SAR {o.total.toFixed(2)}</td>
                <td className="px-3 py-3"><StatusBadge status={o.status} /></td>
                <td className="px-3 py-3 text-xs">{o.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Orders() {
  return (
    <PageShell title="Orders" subtitle="POS and online order management">
      <Tabs defaultValue="pos">
        <TabsList className="mb-4">
          <TabsTrigger value="pos">POS Orders</TabsTrigger>
          <TabsTrigger value="online" className="gap-1.5"><Globe className="h-3.5 w-3.5" />Online Orders</TabsTrigger>
        </TabsList>
        <TabsContent value="pos" className="mt-0"><POSTab /></TabsContent>
        <TabsContent value="online" className="mt-0"><OnlineTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
