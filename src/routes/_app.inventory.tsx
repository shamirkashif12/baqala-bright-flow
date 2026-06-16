import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { StatusBadge, StatChip } from "@/components/module-placeholder";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Package, AlertTriangle, CalendarClock, XCircle, Search, Plus, Download } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { cn } from "@/lib/utils";
import { api, type InventoryStock } from "@/lib/api";

export const Route = createFileRoute("/_app/inventory")({ component: Inventory });

function expiryStatus(batch?: string) {
  if (!batch) return "safe";
  const days = Math.ceil((new Date(batch).getTime() - Date.now()) / 86400000);
  if (days < 0) return "expired";
  if (days <= 30) return "close";
  return "safe";
}

function ExpiryBadge({ date }: { date?: string }) {
  const status = expiryStatus(date);
  if (status === "expired") return <Badge className="bg-destructive text-destructive-foreground border-0">Expired</Badge>;
  if (status === "close") {
    const days = Math.ceil((new Date(date!).getTime() - Date.now()) / 86400000);
    return <Badge className="bg-warning text-warning-foreground border-0">{days}d left</Badge>;
  }
  return <Badge variant="outline" className="bg-success/10 text-success border-success/30">Safe</Badge>;
}

function Inventory() {
  const [stock, setStockData] = useState<InventoryStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [stockFilter, setStockFilter] = useState("All");

  useEffect(() => {
    api.getStock()
      .then(setStockData)
      .finally(() => setLoading(false));
  }, []);

  const lowStock  = stock.filter((s) => s.quantity > 0 && s.quantity <= s.reorderLevel).length;
  const outOfStock = stock.filter((s) => s.quantity === 0).length;

  const filtered = useMemo(() => stock.filter((s) => {
    const ql = q.trim().toLowerCase();
    if (ql && !s.product?.name.toLowerCase().includes(ql) && !s.product?.sku.toLowerCase().includes(ql)) return false;
    if (stockFilter === "Low Stock"    && !(s.quantity > 0 && s.quantity <= s.reorderLevel)) return false;
    if (stockFilter === "Out of Stock" && s.quantity !== 0) return false;
    if (stockFilter === "In Stock"     && s.quantity <= 0) return false;
    return true;
  }), [stock, q, stockFilter]);

  return (
    <PageShell title="Inventory" subtitle="Catalog · stock · branches · warehouses">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total SKUs"    value={String(stock.length)} delta="" trend="up" icon={Package} accent="primary" />
        <MetricCard label="Low Stock"     value={String(lowStock)}     delta="" trend="down" icon={AlertTriangle} accent="warning" />
        <MetricCard label="Expiring Soon" value="—" hint="check batches" icon={CalendarClock} accent="warning" />
        <MetricCard label="Out of Stock"  value={String(outOfStock)}   trend="down" icon={XCircle} accent="destructive" />
      </div>

      <div className="flex flex-wrap gap-3">
        <StatChip label="In stock"    value={`${stock.filter(s => s.quantity > s.reorderLevel).length} SKUs`} tone="success" />
        <StatChip label="Low stock"   value={`${lowStock} SKUs`} tone="warning" />
        <StatChip label="Out of stock" value={`${outOfStock} SKUs`} tone="destructive" />
      </div>

      <Card className="p-4 border-border/60 shadow-card space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name or SKU…" className="pl-9 h-10" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button variant="outline" className="h-10 gap-1.5"><Download className="h-4 w-4" /> Export</Button>
          <AddProductDialog />
        </div>
        <div className="flex gap-2 flex-wrap">
          {["All", "In Stock", "Low Stock", "Out of Stock"].map((f) => (
            <Button key={f} size="sm" variant={stockFilter === f ? "default" : "outline"} onClick={() => setStockFilter(f)}
              className={stockFilter === f ? "gradient-primary text-primary-foreground border-0" : ""}>{f}</Button>
          ))}
        </div>
      </Card>

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">SKU / Barcode</th>
                  <th className="px-4 py-3 font-semibold">Qty</th>
                  <th className="px-4 py-3 font-semibold">Stock</th>
                  <th className="px-4 py-3 font-semibold">Price</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const isLow = s.quantity > 0 && s.quantity <= s.reorderLevel;
                  const isOut = s.quantity === 0;
                  return (
                    <tr key={s.id} className={cn("border-b border-border/40 hover:bg-muted/30 transition-colors last:border-0",
                      isOut ? "bg-destructive/5" : isLow ? "bg-warning/10" : "")}>
                      <td className="px-4 py-3.5">
                        <p className="font-semibold">{s.product?.name ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3.5 tabular-nums text-xs">
                        <p>{s.product?.sku}</p>
                        <p className="text-muted-foreground">{s.product?.barcode}</p>
                      </td>
                      <td className="px-4 py-3.5 font-semibold tabular-nums">{s.quantity}</td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={isOut ? "out of stock" : isLow ? "low" : "in stock"} />
                      </td>
                      <td className="px-4 py-3.5 tabular-nums">
                        <p className="text-xs text-muted-foreground">Cost: ر.س {s.product?.costPrice?.toFixed(2) ?? "—"}</p>
                        <p className="font-semibold">ر.س {s.product?.basePrice?.toFixed(2) ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <Button variant="ghost" size="sm">Edit</Button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">No products match the current filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </PageShell>
  );
}

function AddProductDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-10 gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow"><Plus className="h-4 w-4" /> Add Product</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add Product</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Product Name" placeholder="e.g. Almarai Laban 1L" />
          <Field label="SKU" placeholder="ALM-LB-1L" />
          <Field label="Barcode" placeholder="6281007012340" />
          <Field label="Category" placeholder="Dairy" />
          <Field label="Purchase Price" placeholder="4.20" />
          <Field label="Selling Price" placeholder="6.50" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="gradient-primary text-primary-foreground border-0" onClick={() => setOpen(false)}>Save Product</Button>
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
