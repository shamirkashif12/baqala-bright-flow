import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
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
import { PaginatedDataTable, FilterField } from "@/components/module-placeholder";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { toast } from "sonner";
import { TrendingDown, Hourglass, Sparkles, TrendingUp, Minus, PackageX, X, Info } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_app/reports/inventory-dashboard")({ component: InventoryDashboard });

const firstOfMonthStr = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const todayStr = () => new Date().toISOString().slice(0, 10);

// Catalog state of the SKU — the filter the client asked for. Distinct from the performance
// Classification below: a Dead Stock line reads very differently once you can see the product was
// discontinued deliberately rather than having quietly stopped selling.
const PRODUCT_STATUSES = [
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "discontinued", label: "Discontinued" },
];
const CLASSIFICATIONS = ["Star Products", "High Performers", "Average Performers", "Slow Moving Products", "Dead Stock"]
  .map((c) => ({ id: c, label: c }));
// Mirrors ReportsController.BucketFor's buckets exactly.
const AGE_BUCKETS = ["0-30 days", "31-60 days", "61-90 days", "90+ days"].map((b) => ({ id: b, label: b }));

const PRODUCT_STATUS_CLASS: Record<string, string> = {
  active: "bg-success/15 text-success",
  inactive: "bg-muted text-muted-foreground",
  discontinued: "bg-destructive/15 text-destructive",
};

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
  const [productIds, setProductIds] = useState<string[]>([]);
  const [productStatuses, setProductStatuses] = useState<string[]>([]);
  const [classifications, setClassifications] = useState<string[]>([]);
  const [ageBuckets, setAgeBuckets] = useState<string[]>([]);
  const [locationTypeFilter, setLocationTypeFilter] = useState<string>("all");
  const [deadOnly, setDeadOnly] = useState(false);
  const [data, setData] = useState<InventoryDashboardReport | null>(null);
  const [loading, setLoading] = useState(true);
  // Same server-resolved scope the Inventory report uses, so both pages agree on which pools and
  // filters this user has.
  const [scope, setScope] = useState<InventorySnapshotScope | null>(null);

  const scopedBranchId = branchIds.length === 1 ? branchIds[0] : undefined;
  const scopedCategoryId = categoryIds.length === 1 ? categoryIds[0] : undefined;
  const { categories, products } = useReportFilterOptions(scopedBranchId, scopedCategoryId);

  useEffect(() => { api.getInventorySnapshotScope().then(setScope).catch(() => {}); }, []);

  // Drop product selections the current (category-narrowed) list no longer offers, so the table
  // can't silently empty while a stale name is still shown in the picker.
  useEffect(() => {
    setProductIds((prev) => prev.filter((id) => products.some((p) => p.id === id)));
  }, [products]);

  const filters = useMemo(() => ({
    branchId: branchIds.length ? branchIds : undefined,
    warehouseId: warehouseIds.length ? warehouseIds : undefined,
    categoryId: categoryIds.length ? categoryIds : undefined,
    productId: productIds.length ? productIds : undefined,
    productStatus: productStatuses.length ? productStatuses : undefined,
    classification: classifications.length ? classifications : undefined,
    ageBucket: ageBuckets.length ? ageBuckets : undefined,
    locationType: locationTypeFilter !== "all" ? locationTypeFilter : undefined,
  }), [branchIds, warehouseIds, categoryIds, productIds, productStatuses, classifications, ageBuckets, locationTypeFilter]);

  const load = useCallback(() => {
    setLoading(true);
    api.getInventoryDashboardReport({ from, to, ...filters })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [from, to, filters]);

  useEffect(() => { load(); }, [load]);

  const hasFilters = from !== firstOfMonthStr() || to !== todayStr() || branchIds.length !== (lockedBranchId ? 1 : 0)
    || warehouseIds.length > 0 || categoryIds.length > 0 || productIds.length > 0 || productStatuses.length > 0
    || classifications.length > 0 || ageBuckets.length > 0 || locationTypeFilter !== "all" || deadOnly !== false;
  const clearFilters = () => {
    setFrom(firstOfMonthStr()); setTo(todayStr()); setBranchIds(lockedBranchId ? [lockedBranchId] : []);
    setWarehouseIds([]); setCategoryIds([]); setProductIds([]); setProductStatuses([]); setClassifications([]);
    setAgeBuckets([]); setLocationTypeFilter("all"); setDeadOnly(false);
  };

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
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground -mt-2">
        <Info className="h-3.5 w-3.5" />
        Looking for sales velocity, turnover and profitability instead? See{" "}
        <Link to="/reports/inventory-aging-performance" className="underline underline-offset-2 hover:text-foreground">Product Performance & Classification</Link>.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <FilterField label="From"><Input type="date" className="h-9 w-36" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></FilterField>
        <FilterField label="To"><Input type="date" className="h-9 w-36" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></FilterField>
        {!lockedBranchId && scope?.canFilterBranch && (
          <FilterField label="Branch">
            <div className="w-44">
              <SearchableMultiSelect
                placeholder="All Branches"
                options={branches.map((b) => ({ id: b.id, label: b.name }))}
                selected={branchIds}
                onChange={setBranchIds}
              />
            </div>
          </FilterField>
        )}
        {scope?.canFilterWarehouse && (
          <FilterField label="Warehouse">
            <div className="w-44">
              <SearchableMultiSelect
                placeholder="All Warehouses"
                options={scope.warehouses.map((w) => ({ id: w.id, label: w.name }))}
                selected={warehouseIds}
                onChange={setWarehouseIds}
              />
            </div>
          </FilterField>
        )}
        <FilterField label="Category">
          <div className="w-40">
            <SearchableMultiSelect
              placeholder="All Categories"
              options={categories.map((c) => ({ id: c.id, label: c.name }))}
              selected={categoryIds}
              onChange={setCategoryIds}
            />
          </div>
        </FilterField>
        <FilterField label="Product">
          <div className="w-48">
            <SearchableMultiSelect
              placeholder="All Products"
              options={products.map((p) => ({ id: p.id, label: p.name }))}
              selected={productIds}
              onChange={setProductIds}
            />
          </div>
        </FilterField>
        <FilterField label="Product Status">
          <div className="w-44">
            <SearchableMultiSelect
              placeholder="All Product Statuses"
              options={PRODUCT_STATUSES}
              selected={productStatuses}
              onChange={setProductStatuses}
            />
          </div>
        </FilterField>
        <FilterField label="Classification">
          <div className="w-48">
            <SearchableMultiSelect
              placeholder="All Statuses (Aging)"
              options={CLASSIFICATIONS}
              selected={classifications}
              onChange={setClassifications}
            />
          </div>
        </FilterField>
        <FilterField label="Age Bucket">
          <div className="w-40">
            <SearchableMultiSelect
              placeholder="All Age Buckets"
              options={AGE_BUCKETS}
              selected={ageBuckets}
              onChange={setAgeBuckets}
            />
          </div>
        </FilterField>
        <FilterField label="Location Type">
          <Select value={locationTypeFilter} onValueChange={setLocationTypeFilter}>
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Branch & Warehouse</SelectItem>
              <SelectItem value="branch">Branch only</SelectItem>
              <SelectItem value="warehouse">Warehouse only</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        {hasFilters && (
          <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" /> Clear Filters
          </Button>
        )}
      </div>

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
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
              {
                key: "productStatus", label: "Product Status",
                render: (r: InventoryAgingRow) => (
                  <Badge variant="outline" className={`text-[10px] border-0 capitalize ${PRODUCT_STATUS_CLASS[r.productStatus] ?? "bg-muted text-muted-foreground"}`}>
                    {r.productStatus}
                  </Badge>
                ),
              },
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
