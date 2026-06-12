import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { DataTable, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ShoppingBag, Clock, Truck, CheckCircle2, Eye, Pencil, Download, Plus, SlidersHorizontal, Zap, Trash2, Globe } from "lucide-react";

export const Route = createFileRoute("/_app/orders")({ component: Orders });

const orders = [
  { id: "ORD-10241", customer: "Khalid Al Otaibi", branch: "Olaya", items: 4, amount: "ر.س 248.50", status: "pending", payment: "Cash", by: "Cashier-01", date: "02 Jun 26 · 10:14", pay: "unpaid" },
  { id: "ORD-10240", customer: "Sara Al Ghamdi", branch: "Khobar", items: 12, amount: "ر.س 1,420.00", status: "processing", payment: "Mada", by: "Cashier-02", date: "02 Jun 26 · 10:08", pay: "paid" },
  { id: "ORD-10239", customer: "Mohammed Al Qahtani", branch: "Jeddah", items: 2, amount: "ر.س 86.75", status: "ready to deliver", payment: "STC Pay", by: "Cashier-01", date: "02 Jun 26 · 09:51", pay: "paid" },
  { id: "ORD-10238", customer: "Nora Al Harbi", branch: "Olaya", items: 8, amount: "ر.س 512.00", status: "delivered", payment: "Mada", by: "Cashier-03", date: "02 Jun 26 · 09:32", pay: "paid" },
  { id: "ORD-10237", customer: "Ahmad Al Dossary", branch: "Madinah", items: 1, amount: "ر.س 64.00", status: "cancelled", payment: "Cash", by: "Cashier-02", date: "02 Jun 26 · 09:11", pay: "refunded" },
];

const onlineOrders = [
  { id: "ONL-50012", customer: "Layla Al Saud", branch: "Olaya", source: "HungerStation", items: 6, payment: "Paid · Card", status: "processing", date: "02 Jun 26 · 10:21" },
  { id: "ONL-50011", customer: "Faisal R.", branch: "Khobar", source: "Jahez", items: 3, payment: "Paid · Wallet", status: "ready to deliver", date: "02 Jun 26 · 10:05" },
  { id: "ONL-50010", customer: "Mona K.", branch: "Jeddah", source: "Mart Website", items: 14, payment: "Paid · STC Pay", status: "delivered", date: "02 Jun 26 · 09:42" },
  { id: "ONL-50009", customer: "Yousef T.", branch: "Olaya", source: "WhatsApp Order", items: 2, payment: "Cash on delivery", status: "pending", date: "02 Jun 26 · 09:28" },
  { id: "ONL-50008", customer: "Reem A.", branch: "Madinah", source: "Mobile App", items: 5, payment: "Paid · Card", status: "delivered", date: "02 Jun 26 · 09:01" },
];

function Orders() {
  const [statusOpen, setStatusOpen] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState<any | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [tab, setTab] = useState("pos");
  const [q, setQ] = useState(""); const [br, setBr] = useState("All");
  const [st, setSt] = useState("All"); const [src, setSrc] = useState("All");
  const filteredOnline = useMemo(() => onlineOrders.filter(o =>
    (!q || `${o.id} ${o.customer} ${o.source}`.toLowerCase().includes(q.toLowerCase())) &&
    (br === "All" || o.branch === br) && (st === "All" || o.status === st) && (src === "All" || o.source === src)
  ), [q, br, st, src]);

  return (
    <PageShell title="Orders" subtitle="In-store, mobile and online orders in one place" actions={
      <div className="flex flex-wrap gap-2">
        <QuickAddSheet />
        <ExportSheet />
        <AdvancedFiltersSheet />
        <NewOrderSheet />
      </div>
    }>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Pending" value="38" icon={Clock} accent="warning" />
        <MetricCard label="Processing" value="22" icon={ShoppingBag} accent="primary" />
        <MetricCard label="Ready to Deliver" value="14" icon={Truck} />
        <MetricCard label="Delivered" value="1,210" delta="+12%" trend="up" icon={CheckCircle2} accent="success" />
      </div>

      {/* Responsive filter bar */}
      <Card className="p-3 border-border/60 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Search by order id, customer, item…" value={q} onChange={e => setQ(e.target.value)} className="h-9 flex-1 min-w-[180px]" />
          <Select value={br} onValueChange={setBr}><SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>{["All","Olaya","Khobar","Jeddah","Madinah"].map(o => <SelectItem key={o} value={o}>{o === "All" ? "All Branches" : o}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={st} onValueChange={setSt}><SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>{["All","pending","processing","ready to deliver","delivered","cancelled"].map(o => <SelectItem key={o} value={o}>{o === "All" ? "All Status" : o}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={src} onValueChange={setSrc}><SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>{["All","HungerStation","Jahez","Mart Website","WhatsApp Order","Mobile App"].map(o => <SelectItem key={o} value={o}>{o === "All" ? "All Sources" : o}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pos" className="gap-1.5"><ShoppingBag className="h-4 w-4" />POS Orders</TabsTrigger>
          <TabsTrigger value="online" className="gap-1.5"><Globe className="h-4 w-4" />Online Orders</TabsTrigger>
        </TabsList>

        <TabsContent value="pos" className="mt-4">
          <DataTable
            columns={[
              { key: "id", label: "ID", render: r => <span className="font-mono font-semibold">{r.id}</span> },
              { key: "customer", label: "Customer" },
              { key: "branch", label: "Branch" },
              { key: "items", label: "Items" },
              { key: "amount", label: "Amount", render: r => <span className="font-semibold">{r.amount}</span> },
              { key: "status", label: "Status", render: r => <StatusBadge status={r.status} /> },
              { key: "pay", label: "Payment", render: r => <StatusBadge status={r.pay} /> },
              { key: "date", label: "Created" },
              { key: "a", label: "", render: r => (
                <div className="flex gap-1 justify-end">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setStatusOpen(r.id)}><Eye className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditOpen(r)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setDelId(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              )},
            ]}
            rows={orders}
          />
        </TabsContent>

        <TabsContent value="online" className="mt-4">
          <DataTable
            columns={[
              { key: "id", label: "Order ID", render: r => <span className="font-mono font-semibold">{r.id}</span> },
              { key: "customer", label: "Customer" },
              { key: "branch", label: "Branch" },
              { key: "source", label: "Source", render: r => <span className="inline-flex items-center gap-1 text-xs font-semibold rounded-md bg-primary/10 text-primary px-2 py-0.5">{r.source}</span> },
              { key: "items", label: "Items" },
              { key: "payment", label: "Payment Status" },
              { key: "status", label: "Order Status", render: r => <StatusBadge status={r.status} /> },
              { key: "date", label: "Created" },
              { key: "a", label: "", render: r => (
                <div className="flex gap-1 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setStatusOpen(r.id)}>View</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditOpen(r)}>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-destructive">Cancel</Button>
                </div>
              )},
            ]}
            rows={filteredOnline}
          />
        </TabsContent>
      </Tabs>

      {/* View */}
      <Dialog open={!!statusOpen} onOpenChange={(v) => !v && setStatusOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Order {statusOpen}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-2 my-2">
            {["Pending", "Processing", "Ready to Deliver", "Delivered", "Cancelled"].map((s) => (<Button key={s} variant="outline" className="justify-start">{s}</Button>))}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setStatusOpen(null)}>Close</Button><Button className="gradient-primary text-primary-foreground border-0" onClick={() => setStatusOpen(null)}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit drawer */}
      <Sheet open={!!editOpen} onOpenChange={(v) => !v && setEditOpen(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>Edit Order {editOpen?.id}</SheetTitle><SheetDescription>Modify items, notes and status.</SheetDescription></SheetHeader>
          <div className="space-y-4 mt-4">
            <F label="Customer" defaultValue={editOpen?.customer} />
            <div className="grid grid-cols-2 gap-3">
              <F label="Branch" defaultValue={editOpen?.branch} /><F label="Amount" defaultValue={editOpen?.amount} />
            </div>
            <div className="space-y-1"><Label className="text-xs">Notes</Label><Textarea placeholder="Add or edit notes…" rows={2} /></div>
            <Card className="p-3 border-dashed">
              <p className="text-xs font-semibold mb-2">Items</p>
              <div className="space-y-1.5 text-sm">
                {["Almarai Laban 1L × 2", "Bread Pack × 1", "Nadec Milk 2L × 1"].map(i => (
                  <div key={i} className="flex items-center justify-between rounded-md bg-muted/30 px-2 py-1.5"><span>{i}</span><Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button></div>
                ))}
              </div>
              <Button size="sm" variant="outline" className="mt-2 gap-1.5 w-full"><Plus className="h-3.5 w-3.5" /> Add Item</Button>
            </Card>
          </div>
          <SheetFooter className="mt-4 gap-2">
            <Button variant="outline" className="text-destructive" onClick={() => { setEditOpen(null); setDelId(editOpen?.id); }}>Delete Order</Button>
            <Button className="gradient-primary text-primary-foreground border-0" onClick={() => setEditOpen(null)}>Save changes</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={!!delId} onOpenChange={v => !v && setDelId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete {delId}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Requires delete permission. Cannot be undone.</p>
          <DialogFooter><Button variant="outline" onClick={() => setDelId(null)}>Cancel</Button><Button variant="destructive" onClick={() => setDelId(null)}>Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function F({ label, defaultValue, placeholder }: { label: string; defaultValue?: string; placeholder?: string }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label><Input className="h-9" defaultValue={defaultValue} placeholder={placeholder} /></div>;
}

function NewOrderSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild><Button size="sm" className="h-9 gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow"><Plus className="h-4 w-4" />New Order</Button></SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle>New Order</SheetTitle><SheetDescription>Create a new in-store or online order.</SheetDescription></SheetHeader>
        <div className="space-y-3 mt-4">
          <F label="Customer" placeholder="Walk-in customer" />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Branch</Label>
              <Select defaultValue="olaya"><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="olaya">Olaya</SelectItem><SelectItem value="khobar">Khobar</SelectItem><SelectItem value="jeddah">Jeddah</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Source</Label>
              <Select defaultValue="pos"><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="pos">POS</SelectItem><SelectItem value="online">Online</SelectItem><SelectItem value="hs">HungerStation</SelectItem><SelectItem value="jahez">Jahez</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <F label="Notes" placeholder="Optional…" />
        </div>
        <SheetFooter className="mt-4"><Button className="gradient-primary text-primary-foreground border-0">Create order</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function QuickAddSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild><Button size="sm" variant="outline" className="h-9 gap-1.5"><Zap className="h-4 w-4" />Quick Add</Button></SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>Quick add item to order</SheetTitle></SheetHeader>
        <div className="space-y-3 mt-4">
          <F label="Order ID" placeholder="ORD-10241" />
          <F label="Item barcode / name" placeholder="6281007012340 or Almarai…" />
          <div className="grid grid-cols-2 gap-3"><F label="Qty" defaultValue="1" /><F label="Discount" defaultValue="0" /></div>
        </div>
        <SheetFooter className="mt-4"><Button className="gradient-primary text-primary-foreground border-0">Add to order</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ExportSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild><Button size="sm" variant="outline" className="h-9 gap-1.5"><Download className="h-4 w-4" />Export</Button></SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>Export orders</SheetTitle><SheetDescription>Choose format and range.</SheetDescription></SheetHeader>
        <div className="space-y-3 mt-4">
          <div className="space-y-1"><Label className="text-xs">Format</Label>
            <Select defaultValue="xlsx"><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="xlsx">Excel (.xlsx)</SelectItem><SelectItem value="csv">CSV</SelectItem><SelectItem value="pdf">PDF</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3"><F label="From" placeholder="2026-06-01" /><F label="To" placeholder="2026-06-30" /></div>
        </div>
        <SheetFooter className="mt-4"><Button className="gradient-primary text-primary-foreground border-0 gap-1.5"><Download className="h-4 w-4" />Download</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function AdvancedFiltersSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild><Button size="sm" variant="outline" className="h-9 gap-1.5"><SlidersHorizontal className="h-4 w-4" />Advanced Filters</Button></SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>Advanced filters</SheetTitle><SheetDescription>Combine multiple criteria.</SheetDescription></SheetHeader>
        <div className="space-y-3 mt-4">
          <div className="grid grid-cols-2 gap-3"><F label="Date from" placeholder="2026-06-01" /><F label="Date to" placeholder="2026-06-30" /></div>
          <F label="Item name" placeholder="e.g. Pepsi" />
          <F label="Order ID" placeholder="ORD-10241" />
          <div className="space-y-1"><Label className="text-xs">Branch</Label>
            <Select defaultValue="all"><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All branches</SelectItem><SelectItem value="olaya">Olaya</SelectItem><SelectItem value="khobar">Khobar</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Order status</Label>
            <Select defaultValue="all"><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Any</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="processing">Processing</SelectItem><SelectItem value="delivered">Delivered</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <SheetFooter className="mt-4 gap-2"><Button variant="outline">Reset</Button><Button className="gradient-primary text-primary-foreground border-0">Apply filters</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
