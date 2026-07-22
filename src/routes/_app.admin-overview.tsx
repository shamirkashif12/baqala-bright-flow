import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import {
  Warehouse, Building2, Package, AlertTriangle, CalendarClock,
  Boxes, TrendingDown, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { api, type Branch, type Warehouse as WarehouseType, type InventoryStock, type Category } from "@/lib/api";
import { SARIcon } from "@/lib/currency";
import { RoleGate } from "@/components/role-gate";

export const Route = createFileRoute("/_app/admin-overview")({
  component: () => (
    <RoleGate allow={["tenant_admin"]}>
      <AdminOverview />
    </RoleGate>
  ),
});

function daysLeft(date?: string | null) {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

function fmtSAR(n: number) {
  return n.toLocaleString("en-SA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

type StockItem = InventoryStock & {
  branchName?: string;
  warehouseName?: string;
  expiryDate?: string;
};

function MetricTile({
  icon: Icon,
  label,
  value,
  sub,
  accent = "default",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  accent?: "default" | "warning" | "danger" | "success";
}) {
  const colors: Record<string, string> = {
    default: "bg-primary/10 text-primary",
    warning: "bg-warning/20 text-warning",
    danger: "bg-destructive/15 text-destructive",
    success: "bg-success/15 text-success",
  };
  return (
    <div className="rounded-2xl border border-border/60 bg-card shadow-card p-4 flex items-center gap-4">
      <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${colors[accent]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-2xl font-black mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function AdminOverview() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      api.getBranches(),
      api.getWarehouses(),
      api.getStock(),
      api.getCategories(),
      api.getBatches(),
    ])
      .then(([b, w, s, c, batches]) => {
        setBranches(b);
        setWarehouses(w);
        const expiryMap = new Map<string, string>();
        for (const batch of batches) {
          if (!batch.expiryDate) continue;
          const key = `${batch.productId}:${batch.branchId}`;
          const existing = expiryMap.get(key);
          if (!existing || new Date(batch.expiryDate) < new Date(existing))
            expiryMap.set(key, batch.expiryDate);
        }
        setStock(s.map(item => ({ ...item, expiryDate: expiryMap.get(`${item.productId}:${item.branchId}`) })) as StockItem[]);
        setCategories(c);
      })
      .catch(() => toast.error("Failed to load some dashboard data."))
      .finally(() => setLoading(false));
  }, []);

  // ── Filtered stock ────────────────────────────────────────────────────────
  const filteredStock = useMemo(() => stock.filter(s => {
    const mb = !(branchFilter.length && !branchFilter.includes(s.branchId));
    const mc = !(categoryFilter.length && !categoryFilter.includes(s.product?.category?.name ?? ""));
    return mb && mc;
  }), [stock, branchFilter, categoryFilter]);

  // ── Global metrics ────────────────────────────────────────────────────────
  const totalSKUs = filteredStock.length;
  const outOfStock = filteredStock.filter(s => s.quantity === 0).length;
  const lowStock = filteredStock.filter(s => s.quantity > 0 && s.quantity <= s.reorderLevel).length;
  const expiringSoon = filteredStock.filter(s => { const d = daysLeft(s.expiryDate); return d !== null && d >= 0 && d <= 7; }).length;
  const inventoryValue = filteredStock.reduce((sum, s) => sum + s.quantity * (s.product?.costPrice ?? 0), 0);

  // ── Per-branch summary ────────────────────────────────────────────────────
  const branchSummaries = useMemo(() => {
    const displayBranches = branchFilter.length === 0 ? branches : branches.filter(b => branchFilter.includes(b.id));
    return displayBranches.map(branch => {
      const items = stock.filter(s => s.branchId === branch.id && !(categoryFilter.length && !categoryFilter.includes(s.product?.category?.name ?? "")));
      const value = items.reduce((sum, s) => sum + s.quantity * (s.product?.costPrice ?? 0), 0);
      const skus = items.length;
      const oos = items.filter(s => s.quantity === 0).length;
      const low = items.filter(s => s.quantity > 0 && s.quantity <= s.reorderLevel).length;
      const exp = items.filter(s => { const d = daysLeft(s.expiryDate); return d !== null && d >= 0 && d <= 7; }).length;
      const linked = warehouses.filter(w =>
        w.branchWarehouses?.some((bw: { branchId: string }) => bw.branchId === branch.id)
      );
      return { branch, skus, value, oos, low, exp, linked };
    });
  }, [stock, branches, warehouses, branchFilter, categoryFilter]);

  return (
    <PageShell
      title="Admin Overview"
      subtitle="System-wide snapshot — warehouses, inventory, and branch health"
    >
      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-2">
        <div className="w-48">
          <SearchableMultiSelect
            placeholder="All Branches"
            options={branches.map(b => ({ id: b.id, label: b.name }))}
            selected={branchFilter}
            onChange={setBranchFilter}
          />
        </div>
        <div className="w-48">
          <SearchableMultiSelect
            placeholder="All Categories"
            options={categories.map(c => ({ id: c.name, label: c.name }))}
            selected={categoryFilter}
            onChange={setCategoryFilter}
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : (
        <>
          {/* ── Summary metrics ── */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <MetricTile icon={Warehouse}   label="Warehouses"     value={warehouses.length} />
            <MetricTile icon={Building2}   label="Branches"       value={branches.length} />
            <MetricTile icon={Boxes}       label="Total SKUs"     value={totalSKUs.toLocaleString()} />
            <MetricTile icon={AlertTriangle} label="Low / OOS"    value={`${lowStock} / ${outOfStock}`} accent="warning" />
            <MetricTile icon={CalendarClock} label="Expiring ≤7d" value={expiringSoon} accent={expiringSoon > 0 ? "danger" : "default"} />
          </div>

          {/* Inventory value chip */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="rounded-full bg-primary/15 text-primary border border-primary/30 px-4 py-2 text-sm font-semibold flex items-center gap-1.5">
              <SARIcon /> Inventory Value (filtered): <strong>{fmtSAR(inventoryValue)} SAR</strong>
            </span>
          </div>

          {/* ── Warehouses ── */}
          <section>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Warehouse className="h-4 w-4" />Warehouses ({warehouses.length})
            </h2>
            {warehouses.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No warehouses configured.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {warehouses.map(w => (
                  <div key={w.id} className="rounded-2xl border border-border/60 bg-card p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-sm">{w.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{w.code}</p>
                      </div>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${w.status === "active" ? "bg-success/15 text-success border-success/30" : "bg-muted text-muted-foreground"}`}>
                        {w.status ?? "active"}
                      </Badge>
                    </div>
                    {w.address && <p className="text-xs text-muted-foreground">{w.address}</p>}
                    {(w.branchWarehouses?.length ?? 0) > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Linked branches: <span className="font-medium text-foreground">{w.branchWarehouses?.length}</span>
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Inventory by Branch ── */}
          <section>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Building2 className="h-4 w-4" />Inventory by Branch
            </h2>
            <Card className="overflow-hidden border-border/60 shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3 font-semibold">Branch</th>
                      <th className="px-4 py-3 font-semibold text-center">SKUs</th>
                      <th className="px-4 py-3 font-semibold text-center">Low Stock</th>
                      <th className="px-4 py-3 font-semibold text-center">Out of Stock</th>
                      <th className="px-4 py-3 font-semibold text-center">Expiring ≤7d</th>
                      <th className="px-4 py-3 font-semibold text-center">Warehouses</th>
                      <th className="px-4 py-3 font-semibold text-right">Inventory Value</th>
                      <th className="px-4 py-3 font-semibold text-center">Health</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchSummaries.map(({ branch, skus, value, oos, low, exp, linked }) => {
                      const healthy = oos === 0 && low === 0 && exp === 0;
                      // "Critical" = out of stock, matching the Dashboard/Inventory definition.
                      const critical = oos > 0;
                      return (
                        <tr key={branch.id} className="border-b border-border/40 hover:bg-muted/20 last:border-0">
                          <td className="px-4 py-3">
                            <p className="font-semibold">{branch.name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{branch.branchCode}</p>
                          </td>
                          <td className="px-4 py-3 text-center font-bold tabular-nums">{skus}</td>
                          <td className="px-4 py-3 text-center">
                            {low > 0
                              ? <span className="text-warning-foreground font-semibold">{low}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {oos > 0
                              ? <span className="text-destructive font-semibold">{oos}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {exp > 0
                              ? <span className="text-destructive font-semibold">{exp}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                            {linked.length > 0 ? linked.map(w => w.code).join(", ") : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-sm font-semibold">
                            <span className="flex items-center justify-end gap-0.5">
                              <SARIcon />{fmtSAR(value)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {healthy
                              ? <Badge variant="outline" className="text-[10px] bg-success/15 text-success border-success/30 gap-1"><CheckCircle2 className="h-3 w-3" />Healthy</Badge>
                              : critical
                                ? <Badge variant="outline" className="text-[10px] bg-destructive/15 text-destructive border-destructive/30 gap-1"><AlertTriangle className="h-3 w-3" />Critical</Badge>
                                : <Badge variant="outline" className="text-[10px] bg-warning/20 text-warning-foreground border-warning/30 gap-1"><TrendingDown className="h-3 w-3" />Attention</Badge>}
                          </td>
                        </tr>
                      );
                    })}
                    {branchSummaries.length === 0 && (
                      <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">No branches found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          {/* ── Top products across all branches ── */}
          {filteredStock.length > 0 && (
            <section>
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                <Package className="h-4 w-4" />Stock Alerts (filtered)
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Out of stock */}
                <Card className="p-4 border-destructive/20 bg-destructive/5">
                  <p className="text-xs font-bold uppercase tracking-wider text-destructive mb-3">Out of Stock ({outOfStock})</p>
                  {filteredStock.filter(s => s.quantity === 0).slice(0, 6).map(s => (
                    <div key={s.id} className="flex justify-between items-center py-1.5 border-b border-border/30 last:border-0 text-sm">
                      <span className="font-medium truncate pr-2">{s.product?.name ?? "—"}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{s.branch?.name ?? "—"}</span>
                    </div>
                  ))}
                  {outOfStock === 0 && <p className="text-xs text-muted-foreground py-2">All items in stock.</p>}
                </Card>
                {/* Expiring soon */}
                <Card className="p-4 border-warning/20 bg-warning/5">
                  <p className="text-xs font-bold uppercase tracking-wider text-warning mb-3">Expiring ≤ 7 days ({expiringSoon})</p>
                  {filteredStock.filter(s => { const d = daysLeft(s.expiryDate); return d !== null && d >= 0 && d <= 7; }).slice(0, 6).map(s => {
                    const d = daysLeft(s.expiryDate);
                    return (
                      <div key={s.id} className="flex justify-between items-center py-1.5 border-b border-border/30 last:border-0 text-sm">
                        <span className="font-medium truncate pr-2">{s.product?.name ?? "—"}</span>
                        <span className="text-xs text-warning-foreground shrink-0 font-semibold">{d}d · {s.branch?.name ?? "—"}</span>
                      </div>
                    );
                  })}
                  {expiringSoon === 0 && <p className="text-xs text-muted-foreground py-2">No items expiring soon.</p>}
                </Card>
              </div>
            </section>
          )}
        </>
      )}
    </PageShell>
  );
}
