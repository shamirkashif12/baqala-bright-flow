import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MetricCard } from "@/components/metric-card";
import { Warehouse, ClipboardCheck, CheckCircle2, XCircle, Truck, Eye, Plus, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/_app/warehouses")({ component: Warehouses });

type Approval = "Request Generated" | "Approved" | "Unapproved";
type Delivery = "Pending" | "On Way" | "Delivered";

type Req = {
  id: string; src: string; dest: string; itemsSummary: string;
  by: string; approval: Approval; delivery: Delivery; created: string; notes: string;
  items: { name: string; sku: string; reqQty: number; appQty: number; stock: number; batch: string; expiry: string; notes: string }[];
};

const requests: Req[] = [
  { id: "WHR-2041", src: "WH-RYD-01 Central", dest: "Olaya Branch", itemsSummary: "6 items · 240 units", by: "Salman Al-Mutairi", approval: "Request Generated", delivery: "Pending", created: "02 Jun 26 · 09:00", notes: "Weekend stocking", items: [
    { name: "Almarai Laban 1L", sku: "ALM-LB-1L", reqQty: 60, appQty: 0, stock: 1240, batch: "B-2406-A", expiry: "2026-09-12", notes: "" },
    { name: "Nadec Milk 2L", sku: "NDC-MK-2L", reqQty: 24, appQty: 0, stock: 320, batch: "B-2406-B", expiry: "2026-06-18", notes: "Close to expiry — ship first" },
  ] },
  { id: "WHR-2040", src: "WH-JED-01 Jeddah", dest: "Jeddah Tahlia", itemsSummary: "3 items · 120 units", by: "Faisal Al-Harbi", approval: "Approved", delivery: "On Way", created: "01 Jun 26 · 16:40", notes: "Urgent restock after promo", items: [
    { name: "Lipton Tea 100", sku: "LPT-TB-100", reqQty: 24, appQty: 24, stock: 580, batch: "B-2405-X", expiry: "2027-01-30", notes: "" },
  ] },
  { id: "WHR-2039", src: "WH-EST-01 Khobar", dest: "Khobar Corniche", itemsSummary: "2 items · 200 units", by: "Yousef Al-Qahtani", approval: "Approved", delivery: "Delivered", created: "01 Jun 26 · 11:22", notes: "", items: [] },
  { id: "WHR-2038", src: "WH-MED-01 Madinah", dest: "Madinah Quba", itemsSummary: "1 item · 8 units", by: "Tariq Al-Otaibi", approval: "Unapproved", delivery: "Pending", created: "31 May 26 · 14:10", notes: "Stock too low at source", items: [] },
];

function ApprovalBadge({ s }: { s: Approval }) {
  const map = { "Request Generated": "bg-primary/15 text-primary border-primary/30", Approved: "bg-success/15 text-success border-success/30", Unapproved: "bg-destructive/15 text-destructive border-destructive/30" };
  return <Badge variant="outline" className={map[s]}>{s}</Badge>;
}
function DeliveryBadge({ s }: { s: Delivery }) {
  const map = { Pending: "bg-warning/20 text-warning-foreground border-warning/40", "On Way": "bg-primary/15 text-primary border-primary/30", Delivered: "bg-success/15 text-success border-success/30" };
  return <Badge variant="outline" className={map[s]}>{s}</Badge>;
}

function Warehouses() {
  const [view, setView] = useState<Req | null>(null);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => requests.filter(r => !q || `${r.id} ${r.src} ${r.dest}`.toLowerCase().includes(q.toLowerCase())), [q]);

  return (
    <PageShell title="Warehouses" subtitle="Inter-branch & warehouse stock requests with approval flow" actions={
      <Sheet>
        <SheetTrigger asChild><Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow"><Plus className="h-4 w-4" />New Request</Button></SheetTrigger>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader><SheetTitle>New warehouse request</SheetTitle></SheetHeader>
          <div className="space-y-3 mt-4">
            <div className="grid grid-cols-2 gap-3"><F label="Source" placeholder="WH-RYD-01" /><F label="Destination" placeholder="Olaya Branch" /></div>
            <F label="Item(s) summary" placeholder="3 items · 120 units" />
            <div className="space-y-1"><Label className="text-xs">Notes</Label><Textarea rows={2} placeholder="Creator notes…" /></div>
          </div>
          <SheetFooter className="mt-4"><Button className="gradient-primary text-primary-foreground border-0">Submit request</Button></SheetFooter>
        </SheetContent>
      </Sheet>
    }>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Requests" value={String(requests.length)} icon={ClipboardCheck} accent="primary" />
        <MetricCard label="Pending Approval" value="1" icon={ClipboardCheck} accent="warning" />
        <MetricCard label="Approved" value="2" icon={CheckCircle2} accent="success" />
        <MetricCard label="On Way" value="1" icon={Truck} />
      </div>

      <Card className="p-3 border-border/60 shadow-card">
        <Input placeholder="Search by request ID, source, destination…" value={q} onChange={e => setQ(e.target.value)} className="h-9 max-w-md" />
      </Card>

      <Card className="overflow-hidden border-border/60 shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-3">Request ID</th><th className="px-3 py-3">Source</th><th className="px-3 py-3">Destination</th>
              <th className="px-3 py-3">Items</th><th className="px-3 py-3">Requested By</th>
              <th className="px-3 py-3">Approval</th><th className="px-3 py-3">Delivery</th>
              <th className="px-3 py-3">Created</th><th className="px-3 py-3">Notes</th><th className="px-3 py-3">Actions</th>
            </tr></thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30">
                  <td className="px-3 py-3 font-mono font-semibold text-xs">{r.id}</td>
                  <td className="px-3 py-3 text-xs">{r.src}</td>
                  <td className="px-3 py-3 text-xs">{r.dest}</td>
                  <td className="px-3 py-3 text-xs">{r.itemsSummary}</td>
                  <td className="px-3 py-3 text-xs">{r.by}</td>
                  <td className="px-3 py-3"><ApprovalBadge s={r.approval} /></td>
                  <td className="px-3 py-3"><DeliveryBadge s={r.delivery} /></td>
                  <td className="px-3 py-3 text-xs">{r.created}</td>
                  <td className="px-3 py-3 text-xs max-w-[140px] truncate text-muted-foreground">{r.notes || "—"}</td>
                  <td className="px-3 py-3">
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setView(r)}><Eye className="h-3.5 w-3.5" />View Details</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Sheet open={!!view} onOpenChange={v => !v && setView(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader><SheetTitle>{view?.id} · Request details</SheetTitle></SheetHeader>
          {view && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Info k="Source" v={view.src} /><Info k="Destination" v={view.dest} />
                <Info k="Requested by" v={view.by} /><Info k="Created" v={view.created} />
                <Info k="Approval" v={view.approval} /><Info k="Delivery" v={view.delivery} />
              </div>

              <Tabs defaultValue="items">
                <TabsList>
                  <TabsTrigger value="items">Requested Items</TabsTrigger>
                  <TabsTrigger value="notes" className="gap-1.5"><MessageSquare className="h-3.5 w-3.5" />Notes</TabsTrigger>
                  <TabsTrigger value="track">Delivery Tracking</TabsTrigger>
                </TabsList>
                <TabsContent value="items" className="mt-3">
                  <div className="rounded-xl border overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 uppercase tracking-wider text-muted-foreground">
                        <tr><th className="text-left px-2 py-2">Item</th><th className="text-left px-2 py-2">SKU</th><th className="px-2 py-2">Requested</th><th className="px-2 py-2">Approved</th><th className="px-2 py-2">Stock</th><th className="px-2 py-2">Batch</th><th className="px-2 py-2">Expiry</th><th className="text-left px-2 py-2">Notes</th></tr>
                      </thead>
                      <tbody>
                        {view.items.map(it => (
                          <tr key={it.sku} className="border-t">
                            <td className="px-2 py-2 font-semibold">{it.name}</td>
                            <td className="px-2 py-2 font-mono">{it.sku}</td>
                            <td className="px-2 py-2 text-center">{it.reqQty}</td>
                            <td className="px-2 py-2 text-center"><Input type="number" defaultValue={it.appQty || it.reqQty} className="h-7 w-16 text-center" /></td>
                            <td className="px-2 py-2 text-center">{it.stock}</td>
                            <td className="px-2 py-2">{it.batch}</td>
                            <td className="px-2 py-2">{it.expiry}</td>
                            <td className="px-2 py-2 text-muted-foreground">{it.notes || "—"}</td>
                          </tr>
                        ))}
                        {view.items.length === 0 && <tr><td colSpan={8} className="text-center py-6 text-muted-foreground">No items captured</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
                <TabsContent value="notes" className="mt-3 space-y-3">
                  <Card className="p-3 bg-muted/40 text-sm">
                    <p className="text-xs font-semibold text-muted-foreground">Creator notes</p>
                    <p>{view.notes || "—"}</p>
                  </Card>
                  <Textarea placeholder="Add a note…" rows={2} />
                  <Button size="sm" variant="outline" className="gap-1.5"><Plus className="h-3.5 w-3.5" />Add note</Button>
                </TabsContent>
                <TabsContent value="track" className="mt-3">
                  <div className="space-y-2 text-sm">
                    {[["Request created", view.created, true],["Approved", view.approval !== "Request Generated", view.approval === "Approved"],["Dispatched", view.delivery !== "Pending", true],["Delivered", view.delivery === "Delivered", true]].map(([l, ok], i) => (
                      <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg ${ok ? "bg-success/10" : "bg-muted/40"}`}>
                        <div className={`h-2 w-2 rounded-full ${ok ? "bg-success" : "bg-muted-foreground"}`} />
                        <span className="font-medium">{l as string}</span>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>

              <div className="flex gap-2 pt-2 border-t">
                {view.approval === "Request Generated" && (
                  <>
                    <Button className="gradient-primary text-primary-foreground border-0 gap-1.5"><CheckCircle2 className="h-4 w-4" />Approve</Button>
                    <Button variant="outline" className="gap-1.5 text-destructive"><XCircle className="h-4 w-4" />Unapprove</Button>
                  </>
                )}
                {view.approval === "Approved" && view.delivery !== "Delivered" && (
                  <Select defaultValue={view.delivery}><SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="Pending">Pending</SelectItem><SelectItem value="On Way">On Way</SelectItem><SelectItem value="Delivered">Delivered</SelectItem></SelectContent>
                  </Select>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}

function F({ label, placeholder }: { label: string; placeholder?: string }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label><Input className="h-9" placeholder={placeholder} /></div>;
}
function Info({ k, v }: { k: string; v: string }) {
  return <div className="rounded-xl border border-border/60 p-3"><p className="text-[10px] uppercase font-semibold text-muted-foreground">{k}</p><p className="text-sm font-bold mt-0.5">{v}</p></div>;
}
