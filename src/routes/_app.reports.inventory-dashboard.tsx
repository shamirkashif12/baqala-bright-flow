import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { PerformanceTierBadge } from "@/components/report-filters/performance-tier-badge";
import { MetricCard } from "@/components/metric-card";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import {
  api,
  type InventoryDashboardReport, type InventoryAgingRow, type InventorySnapshotScope,
} from "@/lib/api";
import { useReportFilterOptions } from "@/lib/use-report-filters";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { PaginatedDataTable } from "@/components/module-placeholder";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { toast } from "sonner";
import { TrendingDown, Hourglass, Sparkles, TrendingUp, Minus, PackageX } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_app/reports/inventory-dashboard")({ component: InventoryDashboard });

const firstOfMonthStr = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const todayStr = () => new Date().toISOString().slice(0, 10);

function InventoryDashboard() {
  const { user, canViewModule } = useAuth();
  usePermission("Reports");
  const canViewCost = canViewModule("Accounting & Finance");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [branchIds, setBranchIds] = useState<string[]>(lockedBranchId ? [lockedBranchId] : []);
  const [warehouseIds, setWarehouseIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [deadOnly, setDeadOnly] = useState(false);
  const [data, setData] = useState<InventoryDashboardReport | null>(null);
  const [loading, setLoading] = useState(true);
  // Same server-resolved scope the Inventory report uses, so both pages agree on which pools and
  // filters this user has.
  const [scope, setScope] = useState<InventorySnapshotScope | null>(null);

  const scopedBranchId = branchIds.length === 1 ? branchIds[0] : undefined;
  const scopedCategoryId = categoryIds.length === 1 ? categoryIds[0] : undefined;
  const { categories } = useReportFilterOptions(scopedBranchId, scopedCategoryId);

  useEffect(() => { api.getInventorySnapshotScope().then(setScope).catch(() => {}); }, []);

  const filters = useMemo(() => ({
    branchId: branchIds.length ? branchIds : undefined,
    warehouseId: warehouseIds.length ? warehouseIds : undefined,
    categoryId: categoryIds.length ? categoryIds : undefined,
  }), [branchIds, warehouseIds, categoryIds]);

  const load = useCallback(() => {
    setLoading(true);
    api.getInventoryDashboardReport({ from, to, ...filters })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [from, to, filters]);

  useEffect(() => { load(); }, [load]);

  const dw = data?.dataWindow;
  const fmt = (n: number) => fmtSAR(n);

  // Filtered client-side: the rows are already loaded and bounded by the report's own scope, so a
  // refetch would be a round-trip for a predicate the browser can apply instantly.
  const agingRows = useMemo(
    () => (data?.agingRows ?? []).filter((r) => !deadOnly || r.classification === "Dead Stock"),
    [data?.agingRows, deadOnly],
  );

  // Average sales velocity across SKUs that actually moved — the yardstick for "slow": a product
  // that sold below this average is slow-moving, at/above is healthy. Dead stock (no sales at all)
  // is a separate, worse category and is excluded from the average so it can't drag it down.
  const avgMoved = useMemo(() => {
    const movers = (data?.agingRows ?? []).filter((r) => r.unitsMovedInPeriod > 0);
    return movers.length ? movers.reduce((s, r) => s + r.unitsMovedInPeriod, 0) / movers.length : 0;
  }, [data?.agingRows]);

  return (
    <PageShell title="Inventory Aging" subtitle="Product age, days since last movement, slow-moving and dead stock">
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" className="h-9 w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" className="h-9 w-36" value={to} onChange={(e) => setTo(e.target.value)} />
        {!lockedBranchId && scope?.canFilterBranch && (
          <div className="w-44">
            <SearchableMultiSelect
              placeholder="All Branches"
              options={branches.map((b) => ({ id: b.id, label: b.name }))}
              selected={branchIds}
              onChange={setBranchIds}
            />
          </div>
        )}
        {scope?.canFilterWarehouse && (
          <div className="w-44">
            <SearchableMultiSelect
              placeholder="All Warehouses"
              options={scope.warehouses.map((w) => ({ id: w.id, label: w.name }))}
              selected={warehouseIds}
              onChange={setWarehouseIds}
            />
          </div>
        )}
        <div className="w-40">
          <SearchableMultiSelect
            placeholder="All Categories"
            options={categories.map((c) => ({ id: c.id, label: c.name }))}
            selected={categoryIds}
            onChange={setCategoryIds}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <MetricCard label="Star Products" value={String(data?.kpis.starCount ?? 0)} icon={Sparkles} accent="success" />
        <MetricCard label="High Performers" value={String(data?.kpis.highPerformerCount ?? 0)} icon={TrendingUp} />
        <MetricCard label="Average Performers" value={String(data?.kpis.averagePerformerCount ?? 0)} icon={Minus} />
        <MetricCard label="Slow Moving" value={String(data?.kpis.slowMovingCount ?? 0)} icon={TrendingDown} accent="warning" />
        <MetricCard label="Dead Stock" value={String(data?.deadStockSkus ?? 0)} icon={PackageX} accent="destructive" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-1 flex items-center gap-2"><TrendingDown className="h-4 w-4 text-primary" /> Inventory Aging</h3>
        <p className="text-xs text-muted-foreground mb-4">
          SKUs on hand grouped by time since their stock last changed. Zero and negative rows are excluded — they are not aging stock.
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data?.aging ?? []}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="bucket" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip formatter={(v: number, n: string) => (n === "stockValue" ? fmtSAR(v) : String(v))} />
            <Bar dataKey="skuCount" name="SKUs" fill="var(--primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {(data?.aging ?? []).map((b) => (
            <div key={b.bucket} className="rounded-lg border border-border/60 p-3">
              <p className="text-xs text-muted-foreground">{b.bucket}</p>
              <p className="font-semibold">{b.skuCount} SKUs</p>
              <p className="text-xs text-muted-foreground">{b.onHandQty} units</p>
              {canViewCost && <p className="text-xs"><SARIcon />{fmt(b.stockValue)}</p>}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6 border-border/60 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
          <h3 className="font-semibold flex items-center gap-2">
            <Hourglass className="h-4 w-4 text-primary" /> Aging Analysis by Product
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Dead stock: <span className="font-semibold text-foreground">{data?.deadStockSkus ?? 0} SKUs</span>
              {canViewCost && <> · <SARIcon />{fmt(data?.deadStockValue ?? 0)}</>}
            </span>
            <label className="flex items-center gap-1.5 text-sm">
              <Checkbox checked={deadOnly} onCheckedChange={(v) => setDeadOnly(v === true)} />
              Dead stock only
            </label>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          <span className="font-medium text-foreground">Status</span> is the same Star Products / High Performers /
          Average Performers / Slow Moving / Dead Stock classification as the Product Performance report — a
          weighted score across sales value, units sold, turnover, margin and recency, with{" "}
          <span className="font-medium text-foreground">Dead Stock</span> overriding the score whenever a product
          on hand hasn't sold in 90+ days (or ever). Units Moved shown against the average across moving stock
          ({avgMoved.toFixed(1)} units/SKU).
        </p>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <PaginatedDataTable
            columns={[
              { key: "sku", label: "SKU" },
              { key: "productName", label: "Product" },
              { key: "location", label: "Location" },
              {
                key: "locationType", label: "Type",
                render: (r: InventoryAgingRow) => (
                  <Badge variant={r.locationType === "warehouse" ? "secondary" : "outline"} className="text-[10px] capitalize">{r.locationType}</Badge>
                ),
              },
              { key: "onHandQty", label: "On Hand" },
              ...(canViewCost ? [{ key: "stockValue", label: "Stock Value", render: (r: InventoryAgingRow) => <><SARIcon />{fmt(r.stockValue)}</> }] : []),
              {
                key: "productAgeDays", label: "Age in Stock",
                // Null means no batch record exists for this product here — the stock row alone
                // can't say when the goods arrived, so a dash is the honest answer, not 0 days.
                render: (r: InventoryAgingRow) => r.productAgeDays == null
                  ? <span className="text-muted-foreground" title="No batch record — arrival date unknown">—</span>
                  : `${r.productAgeDays}d`,
              },
              {
                key: "daysSinceLastMovement", label: "Days Since Movement",
                render: (r: InventoryAgingRow) => (
                  <span
                    className={r.daysSinceLastMovement > 90 ? "text-destructive font-semibold" : r.daysSinceLastMovement > 60 ? "text-warning font-medium" : ""}
                    // A stock_row source is not a real movement — say so on hover rather than
                    // letting it read as a confirmed one.
                    title={r.lastMovementSource === "ledger"
                      ? "From the stock movement ledger"
                      : "Approximated from the stock row's last-updated date (predates the ledger)"}
                  >
                    {r.daysSinceLastMovement}d{r.lastMovementSource === "stock_row" ? "*" : ""}
                  </span>
                ),
              },
              { key: "ageBucket", label: "Bucket" },
              {
                key: "unitsMovedInPeriod", label: "Units Moved",
                // Show the per-SKU velocity next to the shared average so "slow" is legible in-row,
                // not just a badge colour.
                render: (r: InventoryAgingRow) => (
                  <span title={`Average across moving stock: ${avgMoved.toFixed(1)}/SKU`}>{r.unitsMovedInPeriod}</span>
                ),
              },
              {
                key: "classification", label: "Status",
                render: (r: InventoryAgingRow) => <PerformanceTierBadge tier={r.classification} />,
              },
            ]}
            rows={agingRows}
          />
        )}
        <p className="text-[11px] text-muted-foreground mt-3">
          * Days since movement approximated from the stock row rather than the movement ledger, which
          only records movements from{" "}
          {dw?.ledgerStart ? new Date(dw.ledgerStart).toLocaleDateString("en-SA", { dateStyle: "medium" }) : "(ledger empty)"} onward.
        </p>
      </Card>
    </PageShell>
  );
}
