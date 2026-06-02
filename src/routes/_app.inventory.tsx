import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { DataTable, Toolbar, StatusBadge, StatChip } from "@/components/module-placeholder";
import { Package, AlertTriangle, CalendarClock, TrendingUp, TrendingDown, XCircle } from "lucide-react";
import { MetricCard } from "@/components/metric-card";

export const Route = createFileRoute("/_app/inventory")({
  component: Inventory,
});

const products = [
  { sku: "1234567", name: "Almarai Laban 1L", cat: "Dairy", price: "ر.س 6.50", cost: "ر.س 4.20", stock: 240, reorder: 60, branch: "Olaya", status: "in stock" },
  { sku: "1234568", name: "Nadec Milk 2L", cat: "Dairy", price: "ر.س 12.00", cost: "ر.س 8.10", stock: 18, reorder: 40, branch: "Olaya", status: "low" },
  { sku: "1234569", name: "Al Rabie Mango 1L", cat: "Beverages", price: "ر.س 7.75", cost: "ر.س 5.00", stock: 0, reorder: 30, branch: "Khobar", status: "out of stock" },
  { sku: "1234570", name: "Lipton Tea 100 Bags", cat: "Beverages", price: "ر.س 18.50", cost: "ر.س 12.30", stock: 92, reorder: 25, branch: "Jeddah", status: "in stock" },
  { sku: "1234571", name: "Pepsi 330ml Can", cat: "Beverages", price: "ر.س 2.50", cost: "ر.س 1.40", stock: 412, reorder: 100, branch: "Olaya", status: "in stock" },
  { sku: "1234572", name: "Sadia Chicken 1kg", cat: "Meat", price: "ر.س 28.00", cost: "ر.س 19.50", stock: 14, reorder: 30, branch: "Madinah", status: "low" },
  { sku: "1234573", name: "Sugar 1kg Al Osra", cat: "Pantry", price: "ر.س 5.00", cost: "ر.س 3.20", stock: 8, reorder: 50, branch: "Khobar", status: "low" },
  { sku: "1234574", name: "Tide Detergent 3kg", cat: "Household", price: "ر.س 42.00", cost: "ر.س 28.00", stock: 56, reorder: 20, branch: "Olaya", status: "in stock" },
];

function Inventory() {
  return (
    <PageShell title="Inventory" subtitle="Catalog · stock · branches" actions={null}>
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

      <Toolbar placeholder="Search by name, SKU, barcode…" primaryLabel="Add Product" />

      <DataTable
        columns={[
          { key: "name", label: "Product", render: (r) => (
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center text-base shrink-0">📦</div>
              <div className="min-w-0">
                <p className="font-semibold text-sm">{r.name}</p>
                <p className="text-xs text-muted-foreground">SKU {r.sku} · {r.cat}</p>
              </div>
            </div>
          )},
          { key: "price", label: "Price" },
          { key: "cost", label: "Cost" },
          { key: "stock", label: "Stock", render: (r) => (
            <span className={r.status === "out of stock" ? "text-destructive font-semibold" : r.status === "low" ? "text-warning-foreground font-semibold" : "font-semibold"}>{r.stock}</span>
          )},
          { key: "reorder", label: "Reorder lvl" },
          { key: "branch", label: "Branch" },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rows={products}
      />
    </PageShell>
  );
}