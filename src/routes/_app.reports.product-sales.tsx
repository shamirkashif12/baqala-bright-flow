import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable, FilterField } from "@/components/module-placeholder";
import { DateRangeField } from "@/components/report-filters/date-range-field";
import { ReportExportButton } from "@/components/report-export-button";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { useReportFilterOptions } from "@/lib/use-report-filters";
import { api, type ProductSalesReport as ProductSalesData, type ProductSalesRow, type ReportExportFormat } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Tag, Boxes, Wallet, Percent, PackageX, RotateCcw, Cigarette, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_app/reports/product-sales")({ component: ProductSales });

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ProductSales() {
  const { user, canViewModule } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();
  const canViewMargin = canViewModule("Accounting & Finance");

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [branchIds, setBranchIds] = useState<string[]>(lockedBranchId ? [lockedBranchId] : []);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [cashierIds, setCashierIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [hasTobaccoFee, setHasTobaccoFee] = useState(false);
  const [data, setData] = useState<ProductSalesData | null>(null);
  const [loading, setLoading] = useState(true);

  const { categories, products, employees } = useReportFilterOptions(
    branchIds.length === 1 ? branchIds[0] : undefined,
    categoryIds.length === 1 ? categoryIds[0] : undefined,
  );

  // The product list follows the category filter so the picker only offers products that could
  // actually appear in the current result set; a stale selection is cleared rather than silently
  // returning an empty report.
  useEffect(() => {
    setProductIds((prev) => prev.filter((id) => products.some((p) => p.id === id)));
  }, [products]);

  const load = useCallback(() => {
    setLoading(true);
    api.getProductSalesReport({
      from, to, branchId: branchIds.length ? branchIds : undefined,
      categoryId: categoryIds.length ? categoryIds : undefined,
      productId: productIds.length ? productIds : undefined, search: search || undefined,
      cashierId: cashierIds.length ? cashierIds : undefined, hasTobaccoFee: hasTobaccoFee || undefined,
    })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, branchIds, categoryIds, productIds, search, cashierIds, hasTobaccoFee]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportProductSalesReport({
        from, to, branchId: branchIds.length ? branchIds : undefined, categoryId: categoryIds.length ? categoryIds : undefined,
        productId: productIds.length ? productIds : undefined,
        search: search || undefined, cashierId: cashierIds.length ? cashierIds : undefined, hasTobaccoFee: hasTobaccoFee || undefined,
        exportedBy: user?.id, includeMargin: canViewMargin, format,
      });
      downloadBlob(blob, `product-sales-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const chartData = (data?.rows ?? []).slice(0, 10).map((r) => ({ name: r.productName, sales: r.netSales }));

  const hasFilters = from !== firstOfMonthStr() || to !== todayStr() || (!lockedBranchId && branchIds.length > 0)
    || categoryIds.length > 0 || productIds.length > 0 || cashierIds.length > 0 || search !== "" || hasTobaccoFee;
  const clearFilters = () => {
    setFrom(firstOfMonthStr()); setTo(todayStr());
    if (!lockedBranchId) setBranchIds([]);
    setCategoryIds([]); setProductIds([]); setCashierIds([]); setSearch(""); setHasTobaccoFee(false);
  };

  return (
    <PageShell title="Product Sales" subtitle="SKU-level sales, velocity, dead stock and returns">
      <div className="flex flex-wrap items-end gap-2">
        {/* This report already covers "Top Selling Items (Daily/Monthly)" — Top SKU card, Top
            Products chart, and a sortable table with product name/units sold/net sales — it just
            needed a one-click way to switch the range instead of hand-picking dates every time. */}
        <FilterField label="Period">
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="outline" className="h-9 text-xs" onClick={() => { setFrom(todayStr()); setTo(todayStr()); }}>Today</Button>
            <Button type="button" size="sm" variant="outline" className="h-9 text-xs" onClick={() => { setFrom(firstOfMonthStr()); setTo(todayStr()); }}>This Month</Button>
          </div>
        </FilterField>
        <DateRangeField from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        {!lockedBranchId && (
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
        <FilterField label="Category">
          <div className="w-44">
            <SearchableMultiSelect
              placeholder="All Categories"
              options={categories.map((c) => ({ id: c.id, label: c.name }))}
              selected={categoryIds}
              onChange={setCategoryIds}
            />
          </div>
        </FilterField>
        <FilterField label="Product">
          <div className="w-52">
            <SearchableMultiSelect
              placeholder="All Products"
              options={products.map((p) => ({ id: p.id, label: p.name }))}
              selected={productIds}
              onChange={setProductIds}
            />
          </div>
        </FilterField>
        <FilterField label="Employee">
          <div className="w-40">
            <SearchableMultiSelect
              placeholder="All Employees"
              options={employees.map((c) => ({ id: c.id, label: c.fullName }))}
              selected={cashierIds}
              onChange={setCashierIds}
            />
          </div>
        </FilterField>
        <FilterField label="Search">
          <Input placeholder="Search SKU, barcode or name" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-48" />
        </FilterField>
        <label className="flex items-center gap-1.5 text-sm px-2">
          <Checkbox checked={hasTobaccoFee} onCheckedChange={(v) => setHasTobaccoFee(v === true)} />
          Tobacco fee only
        </label>
        {hasFilters && (
          <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" /> Clear Filters
          </Button>
        )}
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <MetricCard label="Top SKU" value={kpis?.topSku ?? "—"} icon={Tag} accent="primary" />
        <MetricCard label="Units Sold" value={String(kpis?.unitsSold ?? 0)} icon={Boxes} />
        <MetricCard label="Net Sales" value={<><SARIcon />{fmt(kpis?.netSales ?? 0)}</>} icon={Wallet} />
        {canViewMargin && <MetricCard label="Gross Margin %" value={kpis?.grossMarginPct != null ? `${kpis.grossMarginPct}%` : "N/A"} icon={Percent} accent="success" />}
        <MetricCard label="Dead Stock" value={String(kpis?.deadStockCount ?? 0)} icon={PackageX} accent="warning" />
        <MetricCard label="Return Rate %" value={`${kpis?.returnRatePct ?? 0}%`} icon={RotateCcw} accent="destructive" />
        <MetricCard label="Tobacco Fees" value={<><SARIcon />{fmt(kpis?.totalTobaccoFees ?? 0)}</>} icon={Cigarette} accent="warning" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Top Products by Net Sales</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis type="number" fontSize={11} />
            <YAxis type="category" dataKey="name" fontSize={11} width={140} />
            <Tooltip formatter={(v: number) => fmtSAR(v)} />
            <Bar dataKey="sales" fill="var(--primary)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "sku", label: "SKU" },
            { key: "barcode", label: "Barcode" },
            { key: "productName", label: "Product Name" },
            { key: "category", label: "Category" },
            { key: "brand", label: "Brand" },
            { key: "unitsSold", label: "Units Sold" },
            { key: "netSales", label: "Net Sales", render: (r: ProductSalesRow) => <span className="font-semibold"><SARIcon />{fmt(r.netSales)}</span> },
            { key: "discounts", label: "Discounts", render: (r: ProductSalesRow) => <><SARIcon />{fmt(r.discounts)}</> },
            { key: "tobaccoFeeAmount", label: "Tobacco Fees", render: (r: ProductSalesRow) => r.tobaccoFeeAmount > 0 ? <span className="text-amber-600"><SARIcon />{fmt(r.tobaccoFeeAmount)}</span> : "—" },
            { key: "returnsQty", label: "Returns Qty" },
            { key: "returnRatePct", label: "Return Rate %", render: (r: ProductSalesRow) => `${r.returnRatePct}%` },
            ...(canViewMargin
              ? [
                  { key: "cogs", label: "COGS", render: (r: ProductSalesRow) => <><SARIcon />{fmt(r.cogs)}</> },
                  { key: "grossProfit", label: "Gross Profit", render: (r: ProductSalesRow) => <><SARIcon />{fmt(r.grossProfit)}</> },
                  { key: "marginPct", label: "Margin %", render: (r: ProductSalesRow) => (r.marginPct != null ? `${r.marginPct}%` : "N/A") },
                ]
              : []),
            { key: "currentStock", label: "Current Stock" },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
