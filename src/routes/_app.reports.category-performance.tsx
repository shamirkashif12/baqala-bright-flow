import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable, FilterField } from "@/components/module-placeholder";
import { DateRangeField } from "@/components/report-filters/date-range-field";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { ReportExportButton } from "@/components/report-export-button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { api, type CategoryPerformanceReport as CategoryPerformanceData, type CategoryPerformanceRow, type ReportExportFormat } from "@/lib/api";
import { useReportFilterOptions } from "@/lib/use-report-filters";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Tags, Layers, Percent, Cigarette, X, SlidersHorizontal, ChevronDown } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

export const Route = createFileRoute("/_app/reports/category-performance")({ component: CategoryPerformance });

const COLORS = ["var(--primary)", "var(--success)", "var(--warning)", "var(--destructive)", "var(--muted-foreground)"];

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CategoryPerformance() {
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
  const [terminalIds, setTerminalIds] = useState<string[]>([]);
  const [hasTobaccoFee, setHasTobaccoFee] = useState(false);
  const [data, setData] = useState<CategoryPerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const scopedBranchId = branchIds.length === 1 ? branchIds[0] : undefined;
  const scopedCategoryId = categoryIds.length === 1 ? categoryIds[0] : undefined;
  const { categories, products, employees, terminals } = useReportFilterOptions(scopedBranchId, scopedCategoryId);

  useEffect(() => { setCashierIds([]); setTerminalIds([]); }, [scopedBranchId]);
  useEffect(() => {
    setProductIds((prev) => prev.filter((id) => products.some((p) => p.id === id)));
  }, [products]);

  const filters = useMemo(() => ({
    branchId: branchIds.length ? branchIds : undefined,
    categoryId: categoryIds.length ? categoryIds : undefined,
    productId: productIds.length ? productIds : undefined,
    cashierId: cashierIds.length ? cashierIds : undefined,
    terminalId: terminalIds.length ? terminalIds : undefined,
    hasTobaccoFee: hasTobaccoFee || undefined,
  }), [branchIds, categoryIds, productIds, cashierIds, terminalIds, hasTobaccoFee]);

  const load = useCallback(() => {
    setLoading(true);
    api.getCategoryPerformanceReport({ from, to, ...filters })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, filters]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportCategoryPerformanceReport({ from, to, ...filters, exportedBy: user?.id, includeMargin: canViewMargin, format });
      downloadBlob(blob, `category-performance-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const pieData = (data?.rows ?? []).slice(0, 6).map((r) => ({ name: r.categoryName, value: r.netSales }));

  const defaultBranchIds = useMemo(() => (lockedBranchId ? [lockedBranchId] : []), [lockedBranchId]);
  const hasFilters = from !== firstOfMonthStr() || to !== todayStr() || (!lockedBranchId && branchIds.length > 0)
    || categoryIds.length > 0 || productIds.length > 0 || cashierIds.length > 0 || terminalIds.length > 0 || hasTobaccoFee !== false;
  const clearFilters = () => {
    setFrom(firstOfMonthStr()); setTo(todayStr()); setBranchIds(defaultBranchIds);
    setCategoryIds([]); setProductIds([]); setCashierIds([]); setTerminalIds([]); setHasTobaccoFee(false);
  };
  const advancedFilterCount = categoryIds.length + productIds.length + cashierIds.length + terminalIds.length + (hasTobaccoFee ? 1 : 0);

  return (
    <PageShell title="Category Performance" subtitle="Sales contribution, margin and velocity by category">
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="rounded-xl border border-border/60 bg-card p-3 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
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

          <CollapsibleTrigger asChild>
            <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Advanced
              {advancedFilterCount > 0 && (
                <Badge variant="secondary" className="h-4 min-w-4 rounded-full px-1 text-[10px] leading-none">{advancedFilterCount}</Badge>
              )}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", advancedOpen && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
          {hasFilters && (
            <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" /> Clear Filters
            </Button>
          )}
          <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
        </div>

        <CollapsibleContent className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(180px,1fr))] pt-3 border-t border-border/50">
          <FilterField label="Category">
            <SearchableMultiSelect
              placeholder="All Categories"
              options={categories.map((c) => ({ id: c.id, label: c.name }))}
              selected={categoryIds}
              onChange={setCategoryIds}
            />
          </FilterField>
          <FilterField label="Product">
            <SearchableMultiSelect
              placeholder="All Products"
              options={products.map((p) => ({ id: p.id, label: p.name }))}
              selected={productIds}
              onChange={setProductIds}
            />
          </FilterField>
          <FilterField label="Employee">
            <SearchableMultiSelect
              placeholder="All Employees"
              options={employees.map((e) => ({ id: e.id, label: e.fullName }))}
              selected={cashierIds}
              onChange={setCashierIds}
            />
          </FilterField>
          <FilterField label="Device">
            <SearchableMultiSelect
              placeholder="All Devices"
              options={terminals.map((t) => ({ id: t.id, label: t.name }))}
              selected={terminalIds}
              onChange={setTerminalIds}
            />
          </FilterField>
          <label className="flex items-center gap-1.5 text-sm px-2 self-center">
            <Checkbox checked={hasTobaccoFee} onCheckedChange={(v) => setHasTobaccoFee(v === true)} />
            Tobacco fee only
          </label>
        </CollapsibleContent>
      </Collapsible>

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <MetricCard label="Top Category" value={kpis?.topCategory ?? "—"} icon={Tags} accent="primary" />
        {canViewMargin && <MetricCard label="Highest Margin Category" value={kpis?.highestMarginCategory ?? "—"} icon={Percent} accent="success" />}
        <MetricCard label="Category Return Rate" value={`${kpis?.categoryReturnRatePct ?? 0}%`} icon={Layers} accent="warning" />
        <MetricCard label="Categories Sold" value={String(kpis?.totalCategoriesSold ?? 0)} icon={Layers} />
        <MetricCard label="Category Discount Value" value={<><SARIcon />{fmt(kpis?.categoryDiscountValue ?? 0)}</>} icon={Percent} accent="warning" />
        <MetricCard label="Tobacco Fees" value={<><SARIcon />{fmt(kpis?.totalTobaccoFees ?? 0)}</>} icon={Cigarette} accent="warning" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Category Contribution</h3>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
              {pieData.map((entry, i) => <Cell key={entry.name} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v: number) => fmtSAR(v)} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "categoryName", label: "Category" },
            { key: "parentCategory", label: "Parent Category" },
            { key: "skuCount", label: "SKU Count" },
            { key: "unitsSold", label: "Units Sold" },
            { key: "grossSales", label: "Gross Sales", render: (r: CategoryPerformanceRow) => <><SARIcon />{fmt(r.grossSales)}</> },
            { key: "discounts", label: "Discounts", render: (r: CategoryPerformanceRow) => <><SARIcon />{fmt(r.discounts)}</> },
            { key: "returns", label: "Returns", render: (r: CategoryPerformanceRow) => <><SARIcon />{fmt(r.returns)}</> },
            { key: "returnRatePct", label: "Return Rate %", render: (r: CategoryPerformanceRow) => `${r.returnRatePct}%` },
            { key: "netSales", label: "Net Sales", render: (r: CategoryPerformanceRow) => <span className="font-semibold"><SARIcon />{fmt(r.netSales)}</span> },
            { key: "salesContributionPct", label: "Contribution %", render: (r: CategoryPerformanceRow) => `${r.salesContributionPct}%` },
            { key: "tobaccoFees", label: "Tobacco Fees", render: (r: CategoryPerformanceRow) => <><SARIcon />{fmt(r.tobaccoFees)}</> },
            ...(canViewMargin
              ? [
                  { key: "cogs", label: "COGS", render: (r: CategoryPerformanceRow) => <><SARIcon />{fmt(r.cogs)}</> },
                  { key: "grossProfit", label: "Gross Profit", render: (r: CategoryPerformanceRow) => <><SARIcon />{fmt(r.grossProfit)}</> },
                  { key: "marginPct", label: "Margin %", render: (r: CategoryPerformanceRow) => (r.marginPct != null ? `${r.marginPct}%` : "N/A") },
                ]
              : []),
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
