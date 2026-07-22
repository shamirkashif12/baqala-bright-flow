import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { PerformanceTierBadge } from "@/components/report-filters/performance-tier-badge";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { api, type ProductPerformanceReport as PerfData, type ProductPerformanceRow, type ReportExportFormat } from "@/lib/api";
import { useReportFilterOptions } from "@/lib/use-report-filters";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Sparkles, TrendingUp, Minus, TrendingDown, PackageX, Boxes } from "lucide-react";

export const Route = createFileRoute("/_app/reports/inventory-aging-performance")({ component: InventoryAgingPerformance });

const firstOfMonthStr = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const todayStr = () => new Date().toISOString().slice(0, 10);

function InventoryAgingPerformance() {
  const { user, canViewModule } = useAuth();
  const { canExport } = usePermission("Reports");
  const canViewCost = canViewModule("Accounting & Finance");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [branchIds, setBranchIds] = useState<string[]>(lockedBranchId ? [lockedBranchId] : []);
  const [warehouseIds, setWarehouseIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [data, setData] = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(true);

  const scopedBranchId = branchIds.length === 1 ? branchIds[0] : undefined;
  const scopedCategoryId = categoryIds.length === 1 ? categoryIds[0] : undefined;
  const { categories, products, warehouses } = useReportFilterOptions(scopedBranchId, scopedCategoryId);

  useEffect(() => {
    setProductIds((prev) => prev.filter((id) => products.some((p) => p.id === id)));
  }, [products]);

  const filters = useMemo(() => ({
    branchId: branchIds.length ? branchIds : undefined,
    warehouseId: warehouseIds.length ? warehouseIds : undefined,
    categoryId: categoryIds.length ? categoryIds : undefined,
    productId: productIds.length ? productIds : undefined,
  }), [branchIds, warehouseIds, categoryIds, productIds]);

  const load = useCallback(() => {
    setLoading(true);
    api.getProductPerformanceReport({ from, to, ...filters })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, filters]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportProductPerformanceReport({ from, to, ...filters, exportedBy: user?.id, format });
      downloadBlob(blob, `inventory-aging-performance-${todayStr()}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);

  return (
    <PageShell
      title="Inventory Aging & Product Performance"
      subtitle="What's selling fast, what's slow, and what's dead stock — by sales velocity, turnover, days since last sale and profitability"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" className="h-9 w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" className="h-9 w-36" value={to} onChange={(e) => setTo(e.target.value)} />
        {!lockedBranchId && (
          <div className="w-44">
            <SearchableMultiSelect
              placeholder="All Branches"
              options={branches.map((b) => ({ id: b.id, label: b.name }))}
              selected={branchIds}
              onChange={setBranchIds}
            />
          </div>
        )}
        {!lockedBranchId && (
          <div className="w-44">
            <SearchableMultiSelect
              placeholder="All Warehouses"
              options={warehouses.map((w) => ({ id: w.id, label: w.name }))}
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
        <div className="w-52">
          <SearchableMultiSelect
            placeholder="All Products"
            options={products.map((p) => ({ id: p.id, label: p.name }))}
            selected={productIds}
            onChange={setProductIds}
          />
        </div>
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <MetricCard label="Products Analyzed" value={String(kpis?.productCount ?? 0)} icon={Boxes} accent="primary" />
        <MetricCard label="Star Products" value={String(kpis?.starCount ?? 0)} icon={Sparkles} accent="success" />
        <MetricCard label="High Performers" value={String(kpis?.highPerformerCount ?? 0)} icon={TrendingUp} />
        <MetricCard label="Average Performers" value={String(kpis?.averagePerformerCount ?? 0)} icon={Minus} />
        <MetricCard label="Slow Moving" value={String(kpis?.slowMovingCount ?? 0)} icon={TrendingDown} accent="warning" />
        <MetricCard label="Dead Stock" value={String(kpis?.deadStockCount ?? 0)} icon={PackageX} accent="destructive" />
      </div>

      {canViewCost && (
        <div className="grid gap-4 md:grid-cols-2">
          <MetricCard label="Total Sales Value" value={<><SARIcon />{fmt(kpis?.totalSalesValue ?? 0)}</>} icon={TrendingUp} accent="success" />
          <MetricCard label="Dead Stock Value" value={<><SARIcon />{fmt(kpis?.deadStockValue ?? 0)}</>} icon={PackageX} accent="destructive" />
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "sku", label: "SKU" },
            { key: "productName", label: "Product" },
            { key: "category", label: "Category" },
            { key: "unitsSold", label: "Units Sold" },
            { key: "salesValue", label: "Sales Value", render: (r: ProductPerformanceRow) => <><SARIcon />{fmt(r.salesValue)}</> },
            ...(canViewCost
              ? [{ key: "marginPct", label: "Margin %", render: (r: ProductPerformanceRow) => (r.marginPct != null ? `${r.marginPct}%` : "N/A") }]
              : []),
            { key: "currentStockQty", label: "Current Stock" },
            ...(canViewCost
              ? [{ key: "currentStockValue", label: "Stock Value", render: (r: ProductPerformanceRow) => <><SARIcon />{fmt(r.currentStockValue)}</> }]
              : []),
            { key: "daysInStock", label: "Days In Stock", render: (r: ProductPerformanceRow) => r.daysInStock ?? "—" },
            { key: "daysSinceLastSale", label: "Days Since Last Sale", render: (r: ProductPerformanceRow) => r.daysSinceLastSale ?? "Never" },
            { key: "turnoverRatio", label: "Turnover", render: (r: ProductPerformanceRow) => r.turnoverRatio.toFixed(2) },
            { key: "classification", label: "Classification", render: (r: ProductPerformanceRow) => <PerformanceTierBadge tier={r.classification} /> },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
