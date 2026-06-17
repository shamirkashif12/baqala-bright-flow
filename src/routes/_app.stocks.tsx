import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { MetricCard } from "@/components/metric-card";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetTrigger } from "@/components/ui/sheet";
import {
  Boxes, ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, Truck, Undo2,
  Trash2, ScanLine, Plus, CheckCircle2, AlertTriangle, History, FileBarChart,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/stocks")({ component: Stocks });

function Stocks() {
  return (
    <PageShell
      title="Stocks"
      subtitle="Stock-In · Stock-Out · GRN · Transfers · Wastage · Movement"
      actions={
        <Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow animate-pulse-soft" onClick={() => toast.success("Scanner ready — point at barcode")}>
          <ScanLine className="h-4 w-4" />Scan Item
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total SKUs" value="1,284" icon={Boxes} accent="primary" />
        <MetricCard label="Stock-In Today" value="312" icon={ArrowDownToLine} accent="success" />
        <MetricCard label="Stock-Out Today" value="248" icon={ArrowUpFromLine} accent="warning" />
        <MetricCard label="Pending Approvals" value="6" icon={ClipboardCheck} accent="destructive" />
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview"><Boxes className="h-3.5 w-3.5 mr-1.5" />Overview</TabsTrigger>
          <TabsTrigger value="in"><ArrowDownToLine className="h-3.5 w-3.5 mr-1.5" />Stock-In</TabsTrigger>
          <TabsTrigger value="out"><ArrowUpFromLine className="h-3.5 w-3.5 mr-1.5" />Stock-Out</TabsTrigger>
          <TabsTrigger value="grn"><ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />GRN</TabsTrigger>
          <TabsTrigger value="delivery"><Truck className="h-3.5 w-3.5 mr-1.5" />Store Delivery</TabsTrigger>
          <TabsTrigger value="return"><Undo2 className="h-3.5 w-3.5 mr-1.5" />Supplier Return</TabsTrigger>
          <TabsTrigger value="wastage"><Trash2 className="h-3.5 w-3.5 mr-1.5" />Wastage</TabsTrigger>
          <TabsTrigger value="movement"><History className="h-3.5 w-3.5 mr-1.5" />Movement</TabsTrigger>
          <TabsTrigger value="reports"><FileBarChart className="h-3.5 w-3.5 mr-1.5" />Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4"><Overview /></TabsContent>
        <TabsContent value="in" className="mt-4"><StockIn /></TabsContent>
        <TabsContent value="out" className="mt-4"><StockOut /></TabsContent>
        <TabsContent value="grn" className="mt-4"><GRN /></TabsContent>
        <TabsContent value="delivery" className="mt-4"><StoreDelivery /></TabsContent>
        <TabsContent value="return" className="mt-4"><SupplierReturn /></TabsContent>
        <TabsContent value="wastage" className="mt-4"><Wastage /></TabsContent>
        <TabsContent value="movement" className="mt-4"><Movement /></TabsContent>
        <TabsContent value="reports" className="mt-4"><Reports /></TabsContent>
      </Tabs>
    </PageShell>
  );
}

function Overview() {
  const items = [
    { name: "Almarai Milk 1L", sku: "ALM-MK-1L", branch: 120, wh: 240, status: "Healthy" },
    { name: "Pepsi 330ml", sku: "PEP-330", branch: 80, wh: 600, status: "Healthy" },
    { name: "Bread Pack", sku: "BRD-001", branch: 12, wh: 8, status: "Low" },
    { name: "Lipton Tea 100", sku: "LPT-TB-100", branch: 30, wh: 580, status: "Close to Expiry" },
  ];
  return (
    <Card className="overflow-hidden border-border/60 shadow-card">
      <table className="w-full text-sm">
        <thead><tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
          <th className="px-3 py-3">Item</th><th className="px-3 py-3">SKU</th><th className="px-3 py-3">Branch Stock</th><th className="px-3 py-3">Warehouse Stock</th><th className="px-3 py-3">Status</th>
        </tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.sku} className="border-b border-border/40 hover:bg-muted/30 animate-fade-in">
              <td className="px-3 py-3 font-semibold">{i.name}</td>
              <td className="px-3 py-3 font-mono text-xs">{i.sku}</td>
              <td className="px-3 py-3">{i.branch}</td>
              <td className="px-3 py-3">{i.wh}</td>
              <td className="px-3 py-3">
                <Badge variant="outline" className={
                  i.status === "Healthy" ? "bg-success/15 text-success border-success/30" :
                  i.status === "Low" ? "bg-destructive/15 text-destructive border-destructive/30" :
                  "bg-warning/20 text-warning-foreground border-warning/40"
                }>{i.status}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function StockIn() {
  const rows = [
    { id: "STIN-2026-001", src: "Supplier Purchase", supplier: "Almarai Supplier KSA", po: "PO-2026-001", grn: "GRN-2026-001", item: "Almarai Milk 1L", qty: 100, batch: "BAT-MILK-3301", exp: "2026-07-30", by: "Fahad Al Saud", loc: "Riyadh Main Warehouse" },
    { id: "STIN-2026-002", src: "Warehouse Transfer", supplier: "—", po: "—", grn: "—", item: "Pepsi 330ml", qty: 240, batch: "BAT-PEP-2201", exp: "2026-12-15", by: "Ali Hassan", loc: "Riyadh Central Baqala" },
    { id: "STIN-2026-003", src: "Supplier Replacement", supplier: "Riyadh Bakery", po: "PO-2026-004", grn: "GRN-2026-004", item: "Bread Pack", qty: 20, batch: "BAT-BRD-5010", exp: "2026-06-25", by: "Fahad Al Saud", loc: "Riyadh Main Warehouse" },
  ];
  return (
    <FlowCard title="Stock-In" desc="Goods received from supplier, transfer, manual add, or replacement." cta="Add Stock-In" onCta={() => toast.success("Stock-In recorded — inventory updated")}>
      <SimpleTable
        cols={["Stock-In", "Source", "Supplier", "PO / GRN", "Item", "Qty", "Batch", "Expiry", "Location", "By"]}
        rows={rows.map((r) => [r.id, r.src, r.supplier, `${r.po} / ${r.grn}`, r.item, r.qty, r.batch, r.exp, r.loc, r.by])}
      />
    </FlowCard>
  );
}

function StockOut() {
  const rows = [
    { id: "STOUT-2026-001", item: "Pepsi 330ml", qty: 2, reason: "POS Sale", dest: "MPOS-RYD-001", link: "ORD-9981", by: "Sara Khan" },
    { id: "STOUT-2026-002", item: "Almarai Milk 1L", qty: 40, reason: "Store Delivery", dest: "Riyadh Central Baqala", link: "DEL-2026-001", by: "Fahad Al Saud" },
    { id: "STOUT-2026-003", item: "Bread Pack", qty: 20, reason: "Supplier Return", dest: "Riyadh Bakery", link: "SRET-2026-001", by: "Fahad Al Saud" },
    { id: "STOUT-2026-004", item: "Yogurt 200g", qty: 6, reason: "Expired", dest: "Wastage Bin", link: "WST-2026-001", by: "Ali Hassan" },
  ];
  return (
    <FlowCard title="Stock-Out" desc="Sale, delivery, transfer, return, damage, expired, manual correction." cta="Add Stock-Out" onCta={() => toast.warning("Stock-Out logged — movement timeline updated")}>
      <SimpleTable
        cols={["Stock-Out", "Item", "Qty", "Reason", "Destination", "Linked Doc", "By"]}
        rows={rows.map((r) => [r.id, r.item, r.qty, <Badge key={r.id} variant="outline" className="bg-warning/15 text-warning-foreground border-warning/30">{r.reason}</Badge>, r.dest, r.link, r.by])}
      />
    </FlowCard>
  );
}

function GRN() {
  const rows = [
    { id: "GRN-2026-001", po: "PO-2026-001", sup: "Almarai Supplier KSA", loc: "Riyadh Main Warehouse", date: "12 Jun 2026", items: 3, by: "Fahad Al Saud", status: "Received" },
    { id: "GRN-2026-002", po: "PO-2026-002", sup: "PepsiCo KSA", loc: "Jeddah Stock Room", date: "13 Jun 2026", items: 2, by: "Omar Al Qahtani", status: "Partially Received" },
    { id: "GRN-2026-003", po: "PO-2026-003", sup: "Nadec Supplier", loc: "Riyadh Main Warehouse", date: "14 Jun 2026", items: 4, by: "Fahad Al Saud", status: "Discrepancy Found" },
  ];
  const statusColor: Record<string, string> = {
    "Received": "bg-success/15 text-success border-success/30",
    "Partially Received": "bg-warning/20 text-warning-foreground border-warning/40",
    "Discrepancy Found": "bg-destructive/15 text-destructive border-destructive/30",
    "Draft": "bg-muted text-muted-foreground border-border",
  };
  return (
    <FlowCard title="Goods Receiving Notes (GRN)" desc="Only accepted qty increases inventory. Rejected qty flows to Supplier Return." cta="New GRN" onCta={() => toast.success("GRN draft created")}>
      <SimpleTable
        cols={["GRN", "PO", "Supplier", "Location", "Date", "Items", "Received By", "Status"]}
        rows={rows.map((r) => [r.id, r.po, r.sup, r.loc, r.date, r.items, r.by, <Badge key={r.id} variant="outline" className={statusColor[r.status]}>{r.status}</Badge>])}
      />
    </FlowCard>
  );
}

function StoreDelivery() {
  const rows = [
    { id: "DEL-2026-001", src: "Riyadh Main Warehouse", dest: "Riyadh Central Baqala", items: "Almarai Milk 1L, Pepsi 330ml", qty: 80, by: "Fahad Al Saud", to: "Sara Khan", status: "Delivered" },
    { id: "DEL-2026-002", src: "Jeddah Stock Room", dest: "Jeddah Mart 02", items: "Lipton Tea 100, Yogurt 200g", qty: 50, by: "Ali Hassan", to: "Omar Al Qahtani", status: "In Transit" },
    { id: "DEL-2026-003", src: "Khobar DC", dest: "Khobar Corniche", items: "Bread Pack", qty: 30, by: "Ahmed Al Harbi", to: "—", status: "Draft" },
  ];
  return (
    <FlowCard title="Store Delivery" desc="Warehouse → store. Dispatch reduces WH stock, receive increases branch stock." cta="New Delivery" onCta={() => toast.success("Delivery draft created")}>
      <SimpleTable
        cols={["Delivery", "Source", "Destination", "Items", "Qty", "Delivered By", "Received By", "Status"]}
        rows={rows.map((r) => [r.id, r.src, r.dest, r.items, r.qty, r.by, r.to, <Badge key={r.id} variant="outline" className="bg-primary/10 text-primary border-primary/30">{r.status}</Badge>])}
      />
    </FlowCard>
  );
}

function SupplierReturn() {
  const rows = [
    { id: "SRET-2026-001", sup: "Riyadh Bakery", po: "PO-2026-004", grn: "GRN-2026-004", item: "Bread Pack", batch: "BAT-BRD-5009", qty: 20, reason: "Expired item", repl: "Pending Replacement", fin: "Supplier Credit Created", inv: "Removed from Sellable Stock", by: "Fahad Al Saud", appr: "Ahmed Al Harbi" },
    { id: "SRET-2026-002", sup: "PepsiCo KSA", po: "PO-2026-002", grn: "GRN-2026-002", item: "Pepsi 330ml", batch: "BAT-PEP-1190", qty: 12, reason: "Damaged on arrival", repl: "Replacement Received", fin: "Closed", inv: "Replacement Added", by: "Omar Al Qahtani", appr: "Ahmed Al Harbi" },
  ];
  return (
    <FlowCard
      title="Supplier Returns"
      desc="Return reason note is mandatory. Approved return reduces inventory and posts a supplier credit in Finance."
      cta="Create Supplier Return"
      onCta={() => toast.success("Supplier return submitted for manager approval")}
    >
      <SimpleTable
        cols={["Return ID", "Supplier", "PO / GRN", "Item · Batch", "Qty", "Reason", "Replacement", "Finance", "Inventory", "By"]}
        rows={rows.map((r) => [r.id, r.sup, `${r.po} / ${r.grn}`, `${r.item} · ${r.batch}`, r.qty, r.reason, <Badge key={r.id} variant="outline" className="bg-warning/15 text-warning-foreground border-warning/30">{r.repl}</Badge>, r.fin, r.inv, r.by])}
      />
    </FlowCard>
  );
}

function Wastage() {
  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState({ source: "Branch", item: "Bread Pack", qty: "20", reason: "Expired", note: "" });

  const tabs: { key: string; label: string; rows: { id: string; item: string; qty: number; reason: string; value: string; by: string; status: string }[] }[] = [
    { key: "pending", label: "Pending Approval", rows: [
      { id: "WST-2026-003", item: "Yogurt 200g", qty: 6, reason: "Expired", value: "SAR 24.00", by: "Ali Hassan", status: "Pending" },
      { id: "WST-2026-004", item: "Tomato Pack", qty: 8, reason: "Spoiled", value: "SAR 32.00", by: "Sara Khan", status: "Pending" },
    ]},
    { key: "approved", label: "Approved", rows: [
      { id: "WST-2026-001", item: "Bread Pack", qty: 20, reason: "Expired", value: "SAR 30.00", by: "Fahad Al Saud", status: "Approved" },
    ]},
    { key: "rejected", label: "Rejected", rows: [
      { id: "WST-2026-002", item: "Pepsi 330ml", qty: 2, reason: "Leakage", value: "SAR 8.00", by: "Omar Al Qahtani", status: "Rejected" },
    ]},
    { key: "finance", label: "Finance Posted", rows: [
      { id: "WST-2026-001", item: "Bread Pack", qty: 20, reason: "Expired", value: "SAR 30.00", by: "Fahad Al Saud", status: "Posted as Wastage Loss" },
    ]},
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Wastage Today" value="18 items" icon={Trash2} accent="destructive" />
        <MetricCard label="Wastage Value" value="SAR 245.50" icon={AlertTriangle} accent="warning" />
        <MetricCard label="Pending Approvals" value="3" icon={ClipboardCheck} accent="warning" />
        <MetricCard label="Finance Posted" value="SAR 180.00" icon={CheckCircle2} accent="success" />
      </div>

      <Card className="p-4 border-border/60 shadow-card flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Trash2 className="h-4 w-4 text-destructive" />Wastage Management</h3>
          <p className="text-xs text-muted-foreground">Lives inside Stocks. Approved wastage creates Stock-Out and a Finance loss entry.</p>
        </div>
        <Sheet open={openCreate} onOpenChange={setOpenCreate}>
          <SheetTrigger asChild>
            <Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow"><Plus className="h-4 w-4" />Create Wastage</Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader><SheetTitle>Create Wastage</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-3">
              <div className="space-y-1"><Label className="text-xs">Source</Label>
                <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Branch", "Warehouse", "POS Return", "Stock Receiving", "Store Delivery", "Manual Stock Check"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">Item</Label><Input value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} className="h-9" /></div>
                <div className="space-y-1"><Label className="text-xs">Quantity</Label><Input value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} className="h-9" /></div>
              </div>
              <div className="space-y-1"><Label className="text-xs">Reason</Label>
                <Select value={form.reason} onValueChange={(v) => setForm({ ...form, reason: v })}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{["Expired", "Damaged", "Leakage", "Broken Packaging", "Spoiled", "Temperature Issue", "Poor Quality", "Lost Stock", "Customer Return Not Resellable", "Supplier Delivery Damage", "Operational Mistake", "Other"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Note (mandatory)</Label><Textarea rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Why is this being wasted?" /></div>
              <Card className="p-3 bg-muted/40 text-xs space-y-1">
                <p className="font-semibold">Impact preview</p>
                <p>Stock-Out · qty {form.qty} · reason: Wastage</p>
                <p>Finance loss entry will be posted on approval.</p>
              </Card>
            </div>
            <SheetFooter className="mt-4">
              <Button onClick={() => { if (!form.note) { toast.error("Note is mandatory"); return; } toast.success("Wastage submitted for approval"); setOpenCreate(false); }} className="gradient-primary text-primary-foreground border-0">Submit for approval</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </Card>

      <Tabs defaultValue="pending">
        <TabsList>{tabs.map((t) => <TabsTrigger key={t.key} value={t.key}>{t.label}</TabsTrigger>)}</TabsList>
        {tabs.map((t) => (
          <TabsContent key={t.key} value={t.key} className="mt-3">
            <Card className="overflow-hidden border-border/60 shadow-card">
              <SimpleTable
                cols={["Wastage ID", "Item", "Qty", "Reason", "Value", "Reported By", "Status"]}
                rows={t.rows.map((r) => [r.id, r.item, r.qty, r.reason, r.value, r.by, <Badge key={r.id} variant="outline" className={
                  r.status === "Approved" || r.status.startsWith("Posted") ? "bg-success/15 text-success border-success/30" :
                  r.status === "Rejected" ? "bg-destructive/15 text-destructive border-destructive/30" :
                  "bg-warning/20 text-warning-foreground border-warning/40"
                }>{r.status}</Badge>])}
              />
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function Movement() {
  const events = [
    { t: "Today · 10:15", k: "Stock-In", v: "+100 Almarai Milk 1L", who: "Fahad Al Saud", note: "GRN-2026-001 · PO-2026-001" },
    { t: "Today · 11:02", k: "Store Delivery", v: "−40 to Riyadh Central", who: "Fahad Al Saud", note: "DEL-2026-001" },
    { t: "Today · 13:44", k: "POS Sale", v: "−2 Pepsi 330ml", who: "Sara Khan", note: "ORD-9981" },
    { t: "Today · 14:20", k: "Wastage", v: "−6 Yogurt 200g (Expired)", who: "Ali Hassan", note: "WST-2026-003" },
    { t: "Today · 16:11", k: "Supplier Return", v: "−20 Bread Pack", who: "Fahad Al Saud", note: "SRET-2026-001" },
  ];
  return (
    <Card className="p-4 border-border/60 shadow-card">
      <div className="space-y-3">
        {events.map((e, i) => (
          <div key={i} className="flex gap-3 animate-fade-in">
            <div className="flex flex-col items-center">
              <div className="h-2 w-2 rounded-full bg-primary" />
              {i < events.length - 1 && <div className="flex-1 w-px bg-border" />}
            </div>
            <div className="flex-1 pb-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{e.k} <span className="text-muted-foreground font-normal">· {e.v}</span></p>
                <span className="text-xs text-muted-foreground">{e.t}</span>
              </div>
              <p className="text-xs text-muted-foreground">{e.who} · {e.note}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Reports() {
  const reports = [
    "Stock-In Report", "Stock-Out Report", "Stock Transfer Report", "Stock Adjustment Report",
    "Supplier Return Report", "Wastage Report", "Stock Movement Report", "Low Stock Report", "Expiry Report",
  ];
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {reports.map((r) => (
        <Card key={r} className="p-4 border-border/60 shadow-card hover:shadow-elegant transition-all cursor-pointer animate-fade-in" onClick={() => toast.success(`${r} exported`)}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl gradient-primary text-primary-foreground flex items-center justify-center"><FileBarChart className="h-5 w-5" /></div>
            <div>
              <p className="font-semibold text-sm">{r}</p>
              <p className="text-xs text-muted-foreground">Daily · Weekly · Monthly · Custom</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function FlowCard({ title, desc, cta, onCta, children }: { title: string; desc: string; cta: string; onCta: () => void; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <Card className="p-4 border-border/60 shadow-card flex items-center justify-between">
        <div><h3 className="font-semibold">{title}</h3><p className="text-xs text-muted-foreground">{desc}</p></div>
        <Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow" onClick={onCta}><Plus className="h-4 w-4" />{cta}</Button>
      </Card>
      <Card className="overflow-hidden border-border/60 shadow-card">{children}</Card>
    </div>
  );
}

function SimpleTable({ cols, rows }: { cols: string[]; rows: (string | number | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
          {cols.map((c) => <th key={c} className="px-3 py-3">{c}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/40 hover:bg-muted/30 animate-fade-in">
              {row.map((cell, j) => <td key={j} className="px-3 py-3 text-xs">{cell as React.ReactNode}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}