import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { TrendingDown, Hourglass } from "lucide-react";
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
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [warehouseId, setWarehouseId] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [deadOnly, setDeadOnly] = useState(false);
  const [data, setData] = useState<InventoryDashboardReport | null>(null);
  const [loading, setLoading] = useState(true);
  // Same server-resolved scope the Inventory report uses, so both pages agree on which pools and
  // filters this user has.
  const [scope, setScope] = useState<InventorySnapshotScope | null>(null);

  const { categories } = useReportFilterOptions(branchId, categoryId);

  useEffect(() => { api.getInventorySnapshotScope().then(setScope).catch(() => {}); }, []);

  const filters = useMemo(() => ({
    branchId: branchId !== "all" ? branchId : undefined,
    warehouseId: warehouseId !== "all" ? warehouseId : undefined,
    categoryId: categoryId !== "all" ? categoryId : undefined,
  }), [branchId, warehouseId, categoryId]);

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
    () => (data?.agingRows ?? []).filter((r) => !deadOnly || r.isDeadStock),
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
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="All Branches" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {scope?.canFilterWarehouse && (
          <Select value={warehouseId} onValueChange={setWarehouseId}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="All Warehouses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Warehouses</SelectItem>
              {scope.warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
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
          <span className="font-medium text-foreground">Dead stock</span> = on hand with no sales in the selected period.{" "}
          <span className="font-medium text-foreground">Slow moving</span> = sold, but below the average velocity
          ({avgMoved.toFixed(1)} units/SKU across moving stock).{" "}
          <span className="font-medium text-foreground">Moving</span> = sold at or above average.
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
                key: "isDeadStock", label: "Status",
                // Three-way: nothing sold at all (dead) → sold below the average velocity (slow) →
                // at/above average (moving). The average excludes dead stock, so a slow mover is
                // genuinely lagging its peers rather than being dragged down by idle SKUs.
                render: (r: InventoryAgingRow) => r.isDeadStock
                  ? <Badge variant="destructive" className="text-[10px]">Dead stock</Badge>
                  : r.unitsMovedInPeriod < avgMoved
                    ? <Badge variant="secondary" className="text-[10px]">Slow moving</Badge>
                    : <Badge variant="outline" className="text-[10px]">Moving</Badge>,
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
