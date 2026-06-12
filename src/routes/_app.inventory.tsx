import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { StatusBadge, StatChip } from "@/components/module-placeholder";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Package, AlertTriangle, CalendarClock, XCircle, Search, Plus, Download, Eye, Pencil, PackagePlus, Sliders } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/inventory")({ component: Inventory });

type StockStatus = "in stock" | "low" | "out of stock" | "overstock";
type ExpiryStatus = "safe" | "close" | "expired";
type Product = {
  id: string; name: string; sku: string; barcode: string; cat: string;
  branch: string; warehouse: string; qty: number; stockStatus: StockStatus;
  expiry: string; expiryStatus: ExpiryStatus; daysLeft: number; supplier: string;
  purchase: number; price: number; vat: number; customFee: number; status: "active" | "inactive";
};

const products: Product[] = [
  { id: "P-1001", name: "Almarai Laban 1L", sku: "ALM-LB-1L", barcode: "6281007012340", cat: "Dairy", branch: "Olaya", warehouse: "WH-RYD-01", qty: 240, stockStatus: "in stock", expiry: "2026-09-12", expiryStatus: "safe", daysLeft: 102, supplier: "Almarai Co.", purchase: 4.2, price: 6.5, vat: 15, customFee: 0, status: "active" },
  { id: "P-1002", name: "Nadec Milk 2L", sku: "NDC-MK-2L", barcode: "6281007012341", cat: "Dairy", branch: "Olaya", warehouse: "WH-RYD-01", qty: 18, stockStatus: "low", expiry: "2026-06-18", expiryStatus: "close", daysLeft: 16, supplier: "Nadec", purchase: 8.1, price: 12, vat: 15, customFee: 0, status: "active" },
  { id: "P-1003", name: "Al Rabie Mango 1L", sku: "ARB-MG-1L", barcode: "6281007012342", cat: "Beverages", branch: "Khobar", warehouse: "WH-EST-01", qty: 0, stockStatus: "out of stock", expiry: "2026-07-22", expiryStatus: "safe", daysLeft: 50, supplier: "Al Rabie", purchase: 5, price: 7.75, vat: 15, customFee: 0, status: "active" },
  { id: "P-1006", name: "Sadia Chicken 1kg", sku: "SDA-CK-1KG", barcode: "6281007012345", cat: "Meat", branch: "Madinah", warehouse: "WH-MED-01", qty: 14, stockStatus: "low", expiry: "2026-06-08", expiryStatus: "close", daysLeft: 6, supplier: "BRF Sadia", purchase: 19.5, price: 28, vat: 15, customFee: 0, status: "active" },
  { id: "P-1010", name: "Marlboro Red 20s", sku: "TBC-001", barcode: "6281007090001", cat: "Tobacco", branch: "Olaya", warehouse: "WH-RYD-01", qty: 240, stockStatus: "in stock", expiry: "2027-12-01", expiryStatus: "safe", daysLeft: 540, supplier: "PMI KSA", purchase: 18, price: 41.4, vat: 15, customFee: 0, status: "active" },
  { id: "P-1011", name: "KitKat Chunky", sku: "KKT-CH-50", barcode: "6281007012350", cat: "Snacks", branch: "Olaya", warehouse: "WH-RYD-01", qty: 920, stockStatus: "overstock", expiry: "2027-03-12", expiryStatus: "safe", daysLeft: 280, supplier: "Nestlé KSA", purchase: 3, price: 4.5, vat: 15, customFee: 0.25, status: "active" },
];

const categories = ["All", ...Array.from(new Set(products.map(p => p.cat)))];
const branches = ["All", ...Array.from(new Set(products.map(p => p.branch)))];

function ExpiryBadge({ p }: { p: Product }) {
  if (p.expiryStatus === "expired") return <Badge className="bg-destructive text-destructive-foreground border-0">Expired</Badge>;
  if (p.expiryStatus === "close") return <Badge className="bg-warning text-warning-foreground border-0">{p.daysLeft}d left</Badge>;
  return <Badge variant="outline" className="bg-success/10 text-success border-success/30">Safe</Badge>;
}

function Inventory() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [br, setBr] = useState("All");
  const [active, setActive] = useState<Product | null>(null);
  const [edit, setEdit] = useState<Product | null>(null);
  const [adjust, setAdjust] = useState<Product | null>(null);
  const filtered = useMemo(() => products.filter(p => {
    const ql = q.toLowerCase();
    if (ql && !`${p.name} ${p.sku} ${p.barcode}`.toLowerCase().includes(ql)) return false;
    if (cat !== "All" && p.cat !== cat) return false;
    if (br !== "All" && p.branch !== br) return false;
    return true;
  }), [q, cat, br]);

  return (
    <PageShell title="Inventory" subtitle="Catalog · stock · VAT · custom fees" actions={
      <div className="flex gap-2">
        <ReceiveBatchSheet />
        <AddProductSheet />
      </div>
    }>
      {/* Dashboard alerts */}
      <div className="grid gap-3 md:grid-cols-2">
        <Link to="/batches">
          <Card className="p-4 border-2 border-warning/40 bg-warning/10 flex items-center gap-3 hover:shadow-elegant">
            <CalendarClock className="h-8 w-8 text-warning-foreground" />
            <div className="flex-1"><p className="text-xs uppercase font-bold opacity-80">Near Expiry Items</p><p className="text-2xl font-bold">41 SKUs</p><p className="text-xs">Next 7 days · review now</p></div>
          </Card>
        </Link>
        <Card className="p-4 border-2 border-destructive/40 bg-destructive/10 flex items-center gap-3">
          <AlertTriangle className="h-8 w-8 text-destructive" />
          <div className="flex-1"><p className="text-xs uppercase font-bold opacity-80">Low Stock Items</p><p className="text-2xl font-bold">23 SKUs</p><p className="text-xs">6 critical · reorder soon</p></div>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total SKUs" value="2,148" delta="+34 this week" trend="up" icon={Package} accent="primary" />
        <MetricCard label="Low Stock" value="23" delta="6 critical" trend="down" icon={AlertTriangle} accent="warning" />
        <MetricCard label="Expiring Soon" value="41" hint="next 7 days" icon={CalendarClock} accent="warning" />
        <MetricCard label="Out of Stock" value="7" trend="down" icon={XCircle} accent="destructive" />
      </div>

      <div className="flex flex-wrap gap-3">
        <StatChip label="Fast moving" value="184 SKUs" tone="success" />
        <StatChip label="Slow moving" value="72 SKUs" tone="warning" />
        <StatChip label="Expired (blocked)" value="12 SKUs" tone="destructive" />
        <StatChip label="Inventory value" value="ر.س 842k" tone="primary" />
      </div>

      <Card className="p-3 border-border/60 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by item name, SKU, barcode…" className="pl-9 h-9" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <Select value={cat} onValueChange={setCat}><SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c === "All" ? "All Categories" : c}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={br} onValueChange={setBr}><SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>{branches.map(b => <SelectItem key={b} value={b}>{b === "All" ? "All Branches" : b}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" className="h-9 gap-1.5"><Download className="h-4 w-4" />Export</Button>
        </div>
      </Card>

      <Card className="overflow-hidden border-border/60 shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Product</th><th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Branch / WH</th><th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Stock</th><th className="px-4 py-3">Expiry</th>
                <th className="px-4 py-3">Cost / Price</th><th className="px-4 py-3">VAT / Fee</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-border/40 hover:bg-muted/30">
                  <td className="px-4 py-3"><p className="font-semibold">{p.name}</p><p className="text-xs text-muted-foreground">{p.sku} · {p.barcode}</p></td>
                  <td className="px-4 py-3">{p.cat}</td>
                  <td className="px-4 py-3"><p className="text-sm">{p.branch}</p><p className="text-xs text-muted-foreground">{p.warehouse}</p></td>
                  <td className="px-4 py-3 font-semibold tabular-nums">{p.qty}</td>
                  <td className="px-4 py-3"><StatusBadge status={p.stockStatus} /></td>
                  <td className="px-4 py-3"><p className="text-xs text-muted-foreground">{p.expiry}</p><ExpiryBadge p={p} /></td>
                  <td className="px-4 py-3 tabular-nums"><p className="text-xs text-muted-foreground">ر.س {p.purchase.toFixed(2)}</p><p className="font-semibold">ر.س {p.price.toFixed(2)}</p></td>
                  <td className="px-4 py-3 text-xs"><p>VAT {p.vat}%</p><p className="text-muted-foreground">Fee: ر.س {p.customFee.toFixed(2)}</p></td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setActive(p)} title="View"><Eye className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEdit(p)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setAdjust(p)} title="Adjust stock"><Sliders className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* View item */}
      <Sheet open={!!active} onOpenChange={v => !v && setActive(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{active?.name}</SheetTitle><SheetDescription>{active?.sku} · {active?.barcode}</SheetDescription></SheetHeader>
          {active && (
            <div className="space-y-3 mt-4 text-sm">
              {[["Category", active.cat],["Branch", active.branch],["Warehouse", active.warehouse],["Quantity", String(active.qty)],["Stock status", active.stockStatus],["Expiry", active.expiry],["Supplier", active.supplier],["Purchase price", `ر.س ${active.purchase.toFixed(2)}`],["Selling price", `ر.س ${active.price.toFixed(2)}`],["VAT", `${active.vat}%`],["Custom fee", `ر.س ${active.customFee.toFixed(2)}`]].map(([k,v]) => (
                <div key={k} className="flex justify-between border-b border-border/40 py-2"><span className="text-muted-foreground">{k}</span><span className="font-semibold">{v}</span></div>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit item drawer */}
      <Sheet open={!!edit} onOpenChange={v => !v && setEdit(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>Edit {edit?.name}</SheetTitle></SheetHeader>
          {edit && (
            <div className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Product name" defaultValue={edit.name} />
                <Field label="SKU" defaultValue={edit.sku} />
                <Field label="Barcode" defaultValue={edit.barcode} />
                <Field label="Category" defaultValue={edit.cat} />
                <Field label="Branch" defaultValue={edit.branch} />
                <Field label="Warehouse" defaultValue={edit.warehouse} />
                <Field label="Purchase price" defaultValue={String(edit.purchase)} />
                <Field label="Selling price" defaultValue={String(edit.price)} />
                <Field label="Quantity" defaultValue={String(edit.qty)} />
                <Field label="Expiry date" defaultValue={edit.expiry} />
              </div>
              <Card className="p-3 border-dashed bg-muted/30">
                <p className="text-xs font-semibold mb-2 text-muted-foreground">Optional tax / fee fields</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="VAT %" defaultValue={String(edit.vat)} placeholder="15" />
                  <Field label="Custom fee (ر.س)" defaultValue={String(edit.customFee)} placeholder="0.25" />
                </div>
              </Card>
            </div>
          )}
          <SheetFooter className="mt-4"><Button className="gradient-primary text-primary-foreground border-0" onClick={() => setEdit(null)}>Save</Button></SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Adjust stock */}
      <Sheet open={!!adjust} onOpenChange={v => !v && setAdjust(null)}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>Adjust stock · {adjust?.name}</SheetTitle></SheetHeader>
          {adjust && (
            <div className="space-y-3 mt-4">
              <Card className="p-3 bg-muted/40"><p className="text-xs">Current quantity</p><p className="text-2xl font-bold">{adjust.qty}</p></Card>
              <div className="grid grid-cols-2 gap-3">
                <Field label="New quantity" placeholder={String(adjust.qty)} />
                <div className="space-y-1"><Label className="text-xs">Reason</Label>
                  <Select defaultValue="count"><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="count">Cycle count</SelectItem><SelectItem value="damage">Damage</SelectItem><SelectItem value="expired">Expired</SelectItem><SelectItem value="transfer">Transfer</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1"><Label className="text-xs">Notes</Label><Textarea rows={2} /></div>
            </div>
          )}
          <SheetFooter className="mt-4"><Button className="gradient-primary text-primary-foreground border-0" onClick={() => setAdjust(null)}>Save adjustment</Button></SheetFooter>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}

function AddProductSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild><Button className="h-9 gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow"><Plus className="h-4 w-4" /> Add Product</Button></SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle>Add Product</SheetTitle></SheetHeader>
        <div className="grid gap-3 sm:grid-cols-2 mt-4">
          <Field label="Product Name" placeholder="Almarai Laban 1L" />
          <Field label="SKU" placeholder="ALM-LB-1L" />
          <Field label="Barcode" placeholder="6281007012340" />
          <Field label="Category" placeholder="Dairy" />
          <Field label="Branch" placeholder="Olaya" />
          <Field label="Warehouse" placeholder="WH-RYD-01" />
          <Field label="Purchase Price" placeholder="4.20" />
          <Field label="Selling Price" placeholder="6.50" />
          <Field label="Quantity" placeholder="100" />
          <Field label="Expiry Date" placeholder="2026-12-31" />
        </div>
        <Card className="p-3 mt-3 border-dashed bg-muted/30">
          <p className="text-xs font-semibold mb-2 text-muted-foreground">Optional tax / fee fields</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="VAT %" placeholder="15" />
            <Field label="Custom fee (ر.س)" placeholder="0.00" />
          </div>
        </Card>
        <SheetFooter className="mt-4"><Button className="gradient-primary text-primary-foreground border-0">Save Product</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function ReceiveBatchSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild><Button variant="outline" className="h-9 gap-1.5"><PackagePlus className="h-4 w-4" />Receive Batch</Button></SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle>Receive Batch</SheetTitle><SheetDescription>Record a new batch arrival into a branch or warehouse.</SheetDescription></SheetHeader>
        <div className="grid gap-3 sm:grid-cols-2 mt-4">
          <Field label="Batch number" placeholder="B-2406-A" />
          <Field label="Supplier" placeholder="Almarai Co." />
          <Field label="Item name / SKU" placeholder="Almarai Laban 1L" />
          <Field label="Quantity received" placeholder="240" />
          <Field label="Expiry date" placeholder="2026-12-31" />
          <Field label="Purchase cost (per unit)" placeholder="4.20" />
          <Field label="VAT %" placeholder="15" />
          <Field label="Custom fee" placeholder="0.00" />
          <Field label="Receiving branch / WH" placeholder="WH-RYD-01" />
        </div>
        <div className="space-y-1 mt-3"><Label className="text-xs">Notes</Label><Textarea rows={2} placeholder="e.g. condition on arrival…" /></div>
        <SheetFooter className="mt-4"><Button className="gradient-primary text-primary-foreground border-0 gap-1.5"><PackagePlus className="h-4 w-4" />Receive batch</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, defaultValue, placeholder }: { label: string; defaultValue?: string; placeholder?: string }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label><Input className="h-9" defaultValue={defaultValue} placeholder={placeholder} /></div>;
}
