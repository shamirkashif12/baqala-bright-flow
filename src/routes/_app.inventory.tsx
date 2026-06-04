import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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

export const Route = createFileRoute("/_app/inventory")({
  component: Inventory,
});

type StockStatus = "in stock" | "low" | "out of stock" | "overstock";
type ExpiryStatus = "safe" | "close" | "expired";

type Product = {
  id: string; name: string; sku: string; barcode: string; cat: string;
  branch: string; warehouse: string; qty: number; stockStatus: StockStatus;
  expiry: string; expiryStatus: ExpiryStatus; daysLeft: number; supplier: string;
  purchase: number; price: number; status: "active" | "inactive";
};

const products: Product[] = [
  { id: "P-1001", name: "Almarai Laban 1L", sku: "ALM-LB-1L", barcode: "6281007012340", cat: "Dairy", branch: "Olaya", warehouse: "WH-RYD-01", qty: 240, stockStatus: "in stock", expiry: "2026-09-12", expiryStatus: "safe", daysLeft: 102, supplier: "Almarai Co.", purchase: 4.2, price: 6.5, status: "active" },
  { id: "P-1002", name: "Nadec Milk 2L", sku: "NDC-MK-2L", barcode: "6281007012341", cat: "Dairy", branch: "Olaya", warehouse: "WH-RYD-01", qty: 18, stockStatus: "low", expiry: "2026-06-18", expiryStatus: "close", daysLeft: 16, supplier: "Nadec", purchase: 8.1, price: 12, status: "active" },
  { id: "P-1003", name: "Al Rabie Mango 1L", sku: "ARB-MG-1L", barcode: "6281007012342", cat: "Beverages", branch: "Khobar", warehouse: "WH-EST-01", qty: 0, stockStatus: "out of stock", expiry: "2026-07-22", expiryStatus: "safe", daysLeft: 50, supplier: "Al Rabie", purchase: 5, price: 7.75, status: "active" },
  { id: "P-1004", name: "Lipton Tea 100 Bags", sku: "LPT-TB-100", barcode: "6281007012343", cat: "Beverages", branch: "Jeddah", warehouse: "WH-JED-01", qty: 92, stockStatus: "in stock", expiry: "2027-01-30", expiryStatus: "safe", daysLeft: 240, supplier: "Unilever KSA", purchase: 12.3, price: 18.5, status: "active" },
  { id: "P-1005", name: "Pepsi 330ml Can", sku: "PEP-CN-330", barcode: "6281007012344", cat: "Beverages", branch: "Olaya", warehouse: "WH-RYD-01", qty: 412, stockStatus: "in stock", expiry: "2026-12-01", expiryStatus: "safe", daysLeft: 180, supplier: "PepsiCo KSA", purchase: 1.4, price: 2.5, status: "active" },
  { id: "P-1006", name: "Sadia Chicken 1kg", sku: "SDA-CK-1KG", barcode: "6281007012345", cat: "Meat", branch: "Madinah", warehouse: "WH-MED-01", qty: 14, stockStatus: "low", expiry: "2026-06-08", expiryStatus: "close", daysLeft: 6, supplier: "BRF Sadia", purchase: 19.5, price: 28, status: "active" },
  { id: "P-1007", name: "Sugar 1kg Al Osra", sku: "AOS-SG-1KG", barcode: "6281007012346", cat: "Pantry", branch: "Khobar", warehouse: "WH-EST-01", qty: 8, stockStatus: "low", expiry: "2028-01-01", expiryStatus: "safe", daysLeft: 580, supplier: "United Sugar", purchase: 3.2, price: 5, status: "active" },
  { id: "P-1008", name: "Tide Detergent 3kg", sku: "TID-DT-3KG", barcode: "6281007012347", cat: "Household", branch: "Olaya", warehouse: "WH-RYD-01", qty: 56, stockStatus: "in stock", expiry: "2028-05-15", expiryStatus: "safe", daysLeft: 720, supplier: "P&G Arabia", purchase: 28, price: 42, status: "active" },
  { id: "P-1009", name: "L'usine Croissant", sku: "LSN-CR-1", barcode: "6281007012348", cat: "Bakery", branch: "Jeddah", warehouse: "WH-JED-01", qty: 64, stockStatus: "in stock", expiry: "2026-06-05", expiryStatus: "close", daysLeft: 3, supplier: "L'usine", purchase: 2.5, price: 4, status: "active" },
  { id: "P-1010", name: "Almarai Yogurt 170g", sku: "ALM-YG-170", barcode: "6281007012349", cat: "Dairy", branch: "Olaya", warehouse: "WH-RYD-01", qty: 36, stockStatus: "in stock", expiry: "2026-06-04", expiryStatus: "close", daysLeft: 2, supplier: "Almarai Co.", purchase: 1.8, price: 3, status: "active" },
  { id: "P-1011", name: "KitKat Chunky", sku: "KKT-CH-50", barcode: "6281007012350", cat: "Snacks", branch: "Olaya", warehouse: "WH-RYD-01", qty: 920, stockStatus: "overstock", expiry: "2027-03-12", expiryStatus: "safe", daysLeft: 280, supplier: "Nestlé KSA", purchase: 3, price: 4.5, status: "active" },
  { id: "P-1012", name: "Lay's Classic 75g", sku: "LYS-CL-75", barcode: "6281007012351", cat: "Snacks", branch: "Jeddah", warehouse: "WH-JED-01", qty: 6, stockStatus: "low", expiry: "2026-05-25", expiryStatus: "expired", daysLeft: -8, supplier: "PepsiCo KSA", purchase: 2.1, price: 3.5, status: "active" },
];

const categories = ["All", ...Array.from(new Set(products.map(p => p.cat)))];
const branches = ["All", ...Array.from(new Set(products.map(p => p.branch)))];
const warehouses = ["All", ...Array.from(new Set(products.map(p => p.warehouse)))];
const suppliers = ["All", ...Array.from(new Set(products.map(p => p.supplier)))];

function rowTone(p: Product) {
  if (p.expiryStatus === "expired") return "bg-destructive/5";
  if (p.expiryStatus === "close") return "bg-warning/10";
  return "";
}

function ExpiryBadge({ p }: { p: Product }) {
  if (p.expiryStatus === "expired")
    return <Badge className="bg-destructive text-destructive-foreground border-0">Expired</Badge>;
  if (p.expiryStatus === "close")
    return <Badge className="bg-warning text-warning-foreground border-0">{p.daysLeft}d left</Badge>;
  return <Badge variant="outline" className="bg-success/10 text-success border-success/30">Safe</Badge>;
}

function Inventory() {
  const [q, setQ] = useState("");
  const [stock, setStock] = useState("All");
  const [expiry, setExpiry] = useState("All");
  const [cat, setCat] = useState("All");
  const [br, setBr] = useState("All");
  const [wh, setWh] = useState("All");
  const [sup, setSup] = useState("All");

  const filtered = useMemo(() => products.filter(p => {
    const ql = q.trim().toLowerCase();
    if (ql && !p.name.toLowerCase().includes(ql) && !p.sku.toLowerCase().includes(ql) && !p.barcode.includes(ql)) return false;
    if (stock !== "All" && p.stockStatus !== stock.toLowerCase()) return false;
    if (expiry !== "All" && p.expiryStatus !== expiry.toLowerCase()) return false;
    if (cat !== "All" && p.cat !== cat) return false;
    if (br !== "All" && p.branch !== br) return false;
    if (wh !== "All" && p.warehouse !== wh) return false;
    if (sup !== "All" && p.supplier !== sup) return false;
    return true;
  }), [q, stock, expiry, cat, br, wh, sup]);

  return (
    <PageShell title="Inventory" subtitle="Catalog · stock · branches · warehouses">
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

      <Card className="p-4 border-border/60 shadow-card space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search by name, SKU, barcode…" className="pl-9 h-10" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button variant="outline" className="h-10 gap-1.5"><Download className="h-4 w-4" /> Export</Button>
          <AddProductDialog />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <FilterSelect label="Stock" value={stock} onChange={setStock} options={["All", "In stock", "Low", "Out of stock", "Overstock"]} />
          <FilterSelect label="Expiry" value={expiry} onChange={setExpiry} options={["All", "Safe", "Close", "Expired"]} />
          <FilterSelect label="Category" value={cat} onChange={setCat} options={categories} />
          <FilterSelect label="Branch" value={br} onChange={setBr} options={branches} />
          <FilterSelect label="Warehouse" value={wh} onChange={setWh} options={warehouses} />
          <FilterSelect label="Supplier" value={sup} onChange={setSup} options={suppliers} />
        </div>
      </Card>

      <Card className="overflow-hidden border-border/60 shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold">Barcode</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Branch / WH</th>
                <th className="px-4 py-3 font-semibold">Qty</th>
                <th className="px-4 py-3 font-semibold">Stock</th>
                <th className="px-4 py-3 font-semibold">Expiry</th>
                <th className="px-4 py-3 font-semibold">Supplier</th>
                <th className="px-4 py-3 font-semibold">Cost / Price</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className={cn("border-b border-border/40 hover:bg-muted/30 transition-colors last:border-0", rowTone(p))}>
                  <td className="px-4 py-3.5">
                    <div className="min-w-0">
                      <p className="font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.id} · {p.sku}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 tabular-nums text-xs">{p.barcode}</td>
                  <td className="px-4 py-3.5">{p.cat}</td>
                  <td className="px-4 py-3.5">
                    <p className="text-sm">{p.branch}</p>
                    <p className="text-xs text-muted-foreground">{p.warehouse}</p>
                  </td>
                  <td className="px-4 py-3.5 font-semibold tabular-nums">{p.qty}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={p.stockStatus} /></td>
                  <td className="px-4 py-3.5">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">{p.expiry}</p>
                      <ExpiryBadge p={p} />
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-xs">{p.supplier}</td>
                  <td className="px-4 py-3.5 tabular-nums">
                    <p className="text-xs text-muted-foreground">ر.س {p.purchase.toFixed(2)}</p>
                    <p className="font-semibold">ر.س {p.price.toFixed(2)}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <Button variant="ghost" size="sm">Edit</Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="text-center py-10 text-muted-foreground text-sm">No products match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </PageShell>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
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
          <Field label="Branch" placeholder="Olaya" />
          <Field label="Warehouse" placeholder="WH-RYD-01" />
          <Field label="Purchase Price" placeholder="4.20" />
          <Field label="Selling Price" placeholder="6.50" />
          <Field label="Quantity" placeholder="100" />
          <Field label="Expiry Date" placeholder="2026-12-31" />
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