import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Plus, Eye, Pencil, ArrowUpDown, Package, AlertTriangle, CalendarClock, Boxes } from "lucide-react";
import { api, type InventoryStock } from "@/lib/api";

export const Route = createFileRoute("/_app/inventory")({ component: Inventory });

function ExpiryBadge({ date }: { date?: string | null }) {
  if (!date) return <span className="text-muted-foreground text-xs">—</span>;
  const d = new Date(date);
  const daysLeft = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (daysLeft < 0) return <Badge className="bg-destructive/15 text-destructive border-0 text-xs">Expired</Badge>;
  if (daysLeft <= 30) return <Badge className="bg-warning/20 text-warning-foreground border-0 text-xs">{daysLeft}d left</Badge>;
  return <span className="text-xs text-muted-foreground">{d.toLocaleDateString("en-SA")}</span>;
}

function Inventory() {
  const [stock, setStock] = useState<InventoryStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [viewItem, setViewItem] = useState<InventoryStock | null>(null);
  const [editItem, setEditItem] = useState<InventoryStock | null>(null);

  useEffect(() => {
    api.getStock()
      .then(setStock)
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => [...new Set(stock.map(s => s.product?.category).filter(Boolean))], [stock]);
  const branches = useMemo(() => [...new Set(stock.map(s => s.branchName).filter(Boolean))], [stock]);

  const filtered = stock.filter(s => {
    const matchQ = !q || s.product?.name?.toLowerCase().includes(q.toLowerCase()) || s.product?.sku?.toLowerCase().includes(q.toLowerCase()) || s.product?.barcode?.toLowerCase().includes(q.toLowerCase());
    const matchCat = category === "all" || s.product?.category === category;
    const matchBr = branchFilter === "all" || s.branchName === branchFilter;
    return matchQ && matchCat && matchBr;
  });

  const lowStock = stock.filter(s => s.quantity <= s.reorderLevel).length;
  const expiringSoon = stock.filter(s => {
    if (!s.expiryDate) return false;
    return Math.ceil((new Date(s.expiryDate).getTime() - Date.now()) / 86400000) <= 30;
  }).length;

  return (
    <PageShell title="Inventory" subtitle="Stock levels, reorder alerts, and batch tracking">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total SKUs" value={String(stock.length)} icon={Boxes} accent="primary" />
        <MetricCard label="Low Stock" value={String(lowStock)} icon={AlertTriangle} accent="warning" />
        <MetricCard label="Expiring Soon" value={String(expiringSoon)} icon={CalendarClock} accent="destructive" />
        <MetricCard label="Total Units" value={stock.reduce((a, s) => a + s.quantity, 0).toLocaleString()} icon={Package} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search SKU, name, barcode…" className="h-9 w-56 flex-shrink-0" />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => <SelectItem key={c!} value={c!}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Branch" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map(b => <SelectItem key={b!} value={b!}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9">
          <Plus className="h-4 w-4" /> Add Product
        </Button>
        <Button size="sm" variant="outline" className="h-9 gap-1.5">
          <ArrowUpDown className="h-4 w-4" /> Receive Batch
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
                  <th className="px-3 py-3 font-semibold">Product</th>
                  <th className="px-3 py-3 font-semibold">SKU</th>
                  <th className="px-3 py-3 font-semibold">Category</th>
                  <th className="px-3 py-3 font-semibold">Qty</th>
                  <th className="px-3 py-3 font-semibold">Reorder</th>
                  <th className="px-3 py-3 font-semibold">Cost</th>
                  <th className="px-3 py-3 font-semibold">Price</th>
                  <th className="px-3 py-3 font-semibold">Expiry</th>
                  <th className="px-3 py-3 font-semibold">Branch</th>
                  <th className="px-3 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className={`border-b border-border/40 hover:bg-muted/30 last:border-0 ${s.quantity <= s.reorderLevel ? "bg-warning/5" : ""}`}>
                    <td className="px-3 py-3">
                      <p className="font-semibold">{s.product?.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground font-mono">{s.product?.barcode ?? ""}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{s.product?.sku ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{s.product?.category ?? "—"}</td>
                    <td className="px-3 py-3">
                      <span className={`tabular-nums font-bold ${s.quantity <= s.reorderLevel ? "text-destructive" : ""}`}>{s.quantity}</span>
                    </td>
                    <td className="px-3 py-3 tabular-nums text-xs">{s.reorderLevel}</td>
                    <td className="px-3 py-3 tabular-nums text-xs">{s.product?.costPrice != null ? `SAR ${s.product.costPrice.toFixed(2)}` : "—"}</td>
                    <td className="px-3 py-3 tabular-nums text-xs">{s.product?.basePrice != null ? `SAR ${s.product.basePrice.toFixed(2)}` : "—"}</td>
                    <td className="px-3 py-3"><ExpiryBadge date={s.expiryDate} /></td>
                    <td className="px-3 py-3 text-xs">{s.branchName ?? "—"}</td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewItem(s)}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditItem(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7"><ArrowUpDown className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={10} className="text-center py-10 text-muted-foreground text-sm">No items found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* View sheet */}
      <Sheet open={!!viewItem} onOpenChange={v => !v && setViewItem(null)}>
        <SheetContent className="w-[400px]">
          <SheetHeader><SheetTitle>{viewItem?.product?.name ?? "Item Details"}</SheetTitle></SheetHeader>
          {viewItem && (
            <div className="mt-4 space-y-3 text-sm">
              <Row label="SKU" value={viewItem.product?.sku ?? "—"} />
              <Row label="Barcode" value={viewItem.product?.barcode ?? "—"} />
              <Row label="Category" value={viewItem.product?.category ?? "—"} />
              <Row label="Quantity" value={String(viewItem.quantity)} />
              <Row label="Reorder Level" value={String(viewItem.reorderLevel)} />
              <Row label="Cost Price" value={viewItem.product?.costPrice != null ? `SAR ${viewItem.product.costPrice.toFixed(2)}` : "—"} />
              <Row label="Base Price" value={viewItem.product?.basePrice != null ? `SAR ${viewItem.product.basePrice.toFixed(2)}` : "—"} />
              <Row label="Expiry" value={viewItem.expiryDate ? new Date(viewItem.expiryDate).toLocaleDateString("en-SA") : "—"} />
              <Row label="Branch" value={viewItem.branchName ?? "—"} />
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit sheet */}
      <Sheet open={!!editItem} onOpenChange={v => !v && setEditItem(null)}>
        <SheetContent className="w-[400px]">
          <SheetHeader><SheetTitle>Adjust Stock — {editItem?.product?.name}</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-4">
            <div className="space-y-1"><Label className="text-xs">New Quantity</Label><Input type="number" defaultValue={editItem?.quantity} className="h-9" /></div>
            <div className="space-y-1"><Label className="text-xs">Reorder Level</Label><Input type="number" defaultValue={editItem?.reorderLevel} className="h-9" /></div>
            <div className="space-y-1"><Label className="text-xs">Expiry Date</Label><Input type="date" defaultValue={editItem?.expiryDate ?? ""} className="h-9" /></div>
            <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={() => setEditItem(null)}>Save Adjustment</Button>
          </div>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border/40 pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
