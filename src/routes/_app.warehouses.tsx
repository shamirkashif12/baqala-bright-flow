import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Warehouse, Package, AlertTriangle, CalendarClock, Plus, Eye, ArrowLeftRight, Settings2 } from "lucide-react";

export const Route = createFileRoute("/_app/warehouses")({ component: Warehouses });

const warehouses = [
  { id: "WH-RYD-01", name: "Riyadh Central Warehouse", loc: "Industrial Area, Riyadh", total: 4820, avail: 4210, low: 14, expiry: 22, mgr: "Salman Al-Mutairi", status: "active" },
  { id: "WH-EST-01", name: "Eastern Province Hub", loc: "Khobar Industrial Park", total: 3120, avail: 2680, low: 9, expiry: 12, mgr: "Yousef Al-Qahtani", status: "active" },
  { id: "WH-JED-01", name: "Jeddah West Warehouse", loc: "Al Khomrah, Jeddah", total: 2940, avail: 2530, low: 11, expiry: 18, mgr: "Faisal Al-Harbi", status: "active" },
  { id: "WH-MED-01", name: "Madinah Storage Unit", loc: "Quba District, Madinah", total: 1480, avail: 1190, low: 6, expiry: 8, mgr: "Tariq Al-Otaibi", status: "maintenance" },
];

const items = [
  { name: "Almarai Laban 1L", sku: "ALM-LB-1L", barcode: "6281007012340", batch: "B-2406-A", supplier: "Almarai Co.", qty: 1240, expiry: "2026-09-12", status: "in stock" },
  { name: "Nadec Milk 2L", sku: "NDC-MK-2L", barcode: "6281007012341", batch: "B-2406-B", supplier: "Nadec", qty: 320, expiry: "2026-06-18", status: "low" },
  { name: "Lipton Tea 100 Bags", sku: "LPT-TB-100", barcode: "6281007012343", batch: "B-2405-X", supplier: "Unilever KSA", qty: 580, expiry: "2027-01-30", status: "in stock" },
  { name: "Sugar 1kg Al Osra", sku: "AOS-SG-1KG", barcode: "6281007012346", batch: "B-2404-Z", supplier: "United Sugar", qty: 18, expiry: "2028-01-01", status: "low" },
  { name: "Sadia Chicken 1kg", sku: "SDA-CK-1KG", barcode: "6281007012345", batch: "B-2406-C", supplier: "BRF Sadia", qty: 0, expiry: "2026-06-08", status: "out of stock" },
];

const transfers = [
  { date: "2026-06-02 09:14", item: "Almarai Laban 1L", qty: 60, to: "Olaya Branch", by: "Salman" },
  { date: "2026-06-01 16:40", item: "Lipton Tea 100 Bags", qty: 24, to: "Jeddah Tahlia", by: "Salman" },
  { date: "2026-06-01 11:22", item: "Pepsi 330ml Can", qty: 240, to: "Khobar Corniche", by: "Yousef" },
];

function Warehouses() {
  const [active, setActive] = useState<typeof warehouses[0] | null>(null);
  return (
    <PageShell title="Warehouses" subtitle="Central stock storage, batches and transfers">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Warehouses" value="4" icon={Warehouse} accent="primary" />
        <MetricCard label="Total Items" value="12,360" delta="+184 this week" trend="up" icon={Package} />
        <MetricCard label="Low Stock" value="40" icon={AlertTriangle} accent="warning" />
        <MetricCard label="Close to Expiry" value="60" icon={CalendarClock} accent="warning" />
      </div>

      <div className="flex flex-wrap gap-2 justify-end">
        <AddWarehouse />
      </div>

      <Card className="overflow-hidden border-border/60 shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Warehouse</th>
                <th className="px-4 py-3 font-semibold">Location</th>
                <th className="px-4 py-3 font-semibold">Items</th>
                <th className="px-4 py-3 font-semibold">Available</th>
                <th className="px-4 py-3 font-semibold">Low</th>
                <th className="px-4 py-3 font-semibold">Close to Expiry</th>
                <th className="px-4 py-3 font-semibold">Manager</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {warehouses.map((w) => (
                <tr key={w.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                  <td className="px-4 py-3.5">
                    <p className="font-semibold">{w.name}</p>
                    <p className="text-xs text-muted-foreground">{w.id}</p>
                  </td>
                  <td className="px-4 py-3.5 text-xs">{w.loc}</td>
                  <td className="px-4 py-3.5 font-semibold tabular-nums">{w.total}</td>
                  <td className="px-4 py-3.5 tabular-nums">{w.avail}</td>
                  <td className="px-4 py-3.5"><Badge variant="outline" className="bg-warning/20 text-warning-foreground border-warning/40">{w.low}</Badge></td>
                  <td className="px-4 py-3.5"><Badge variant="outline" className="bg-warning/20 text-warning-foreground border-warning/40">{w.expiry}</Badge></td>
                  <td className="px-4 py-3.5 text-xs">{w.mgr}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={w.status} /></td>
                  <td className="px-4 py-3.5">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setActive(w)}>
                      <Eye className="h-3.5 w-3.5" /> View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Warehouse details dialog */}
      <Dialog open={!!active} onOpenChange={(v) => !v && setActive(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{active?.name}</DialogTitle>
            <p className="text-sm text-muted-foreground">{active?.id} · {active?.loc} · Manager: {active?.mgr}</p>
          </DialogHeader>
          <div className="grid grid-cols-4 gap-3 my-2">
            <Stat label="Total Items" value={String(active?.total ?? 0)} />
            <Stat label="Available" value={String(active?.avail ?? 0)} />
            <Stat label="Low Stock" value={String(active?.low ?? 0)} tone="warning" />
            <Stat label="Close to Expiry" value={String(active?.expiry ?? 0)} tone="warning" />
          </div>

          <Tabs defaultValue="items">
            <TabsList>
              <TabsTrigger value="items">Stored Items</TabsTrigger>
              <TabsTrigger value="transfers">Transfers</TabsTrigger>
              <TabsTrigger value="logs">Movement Logs</TabsTrigger>
            </TabsList>
            <TabsContent value="items" className="space-y-2">
              <div className="flex flex-wrap gap-2 justify-end">
                <Button size="sm" variant="outline" className="gap-1.5"><Plus className="h-3.5 w-3.5" />Add Item</Button>
                <Button size="sm" variant="outline" className="gap-1.5"><ArrowLeftRight className="h-3.5 w-3.5" />Transfer to Branch</Button>
                <Button size="sm" variant="outline" className="gap-1.5"><Settings2 className="h-3.5 w-3.5" />Adjust Stock</Button>
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2">Batch</th>
                      <th className="px-3 py-2">Supplier</th>
                      <th className="px-3 py-2">Qty</th>
                      <th className="px-3 py-2">Expiry</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.sku} className="border-b last:border-0">
                        <td className="px-3 py-2.5">
                          <p className="font-medium">{it.name}</p>
                          <p className="text-xs text-muted-foreground">{it.sku} · {it.barcode}</p>
                        </td>
                        <td className="px-3 py-2.5 text-xs">{it.batch}</td>
                        <td className="px-3 py-2.5 text-xs">{it.supplier}</td>
                        <td className="px-3 py-2.5 font-semibold tabular-nums">{it.qty}</td>
                        <td className="px-3 py-2.5 text-xs">{it.expiry}</td>
                        <td className="px-3 py-2.5"><StatusBadge status={it.status} /></td>
                        <td className="px-3 py-2.5"><Button size="sm" variant="ghost">Edit</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
            <TabsContent value="transfers">
              <div className="space-y-2">
                {transfers.map((t, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
                    <ArrowLeftRight className="h-4 w-4 text-primary" />
                    <div className="flex-1 text-sm">
                      <p className="font-medium">{t.qty} × {t.item} → {t.to}</p>
                      <p className="text-xs text-muted-foreground">{t.date} by {t.by}</p>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="logs">
              <div className="space-y-2 text-sm">
                {[
                  "Inbound 480 × Lipton Tea — 2026-06-02 08:10",
                  "Stock adjusted -12 × Almarai Laban (damage) — 2026-06-01 14:32",
                  "Outbound 240 × Pepsi Can to Khobar Corniche — 2026-06-01 11:22",
                  "Cycle count completed — 2026-05-31",
                ].map((l, i) => (
                  <div key={i} className="p-2 rounded-lg bg-muted/40 text-xs">{l}</div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warning" }) {
  return (
    <div className={`rounded-xl p-3 ${tone === "warning" ? "bg-warning/15" : "bg-muted/40"}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className="text-xl font-bold mt-1 tabular-nums">{value}</p>
    </div>
  );
}

function AddWarehouse() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow"><Plus className="h-4 w-4" /> Add Warehouse</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Warehouse</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Warehouse Name" />
          <Field label="Warehouse ID" placeholder="WH-RYD-02" />
          <Field label="Location" placeholder="City, area" />
          <Field label="Manager" />
          <Field label="Capacity" placeholder="5000" />
          <Field label="Status" placeholder="active" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="gradient-primary text-primary-foreground border-0" onClick={() => setOpen(false)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, placeholder }: { label: string; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input className="h-9" placeholder={placeholder} />
    </div>
  );
}