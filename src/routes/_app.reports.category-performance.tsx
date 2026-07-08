import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { api, type CategoryPerformanceReport as CategoryPerformanceData, type CategoryPerformanceRow, type ReportExportFormat, type Category } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Tags, Layers, Percent } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

export const Route = createFileRoute("/_app/reports/category-performance")({ component: CategoryPerformance });

const COLORS = ["var(--primary)", "var(--success)", "var(--warning)", "var(--destructive)", "var(--muted-foreground)"];

function firstOfMonthStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function CategoryPerformance() {
  const { user, canViewModule } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();
  const canViewMargin = canViewModule("Accounting & Finance");

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [categoryId, setCategoryId] = useState("all");
  const [categories, setCategories] = useState<Category[]>([]);
  const [data, setData] = useState<CategoryPerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.getCategories().then(setCategories).catch(() => {}); }, []);

  const load = useCallback(() => {
    setLoading(true);
    api.getCategoryPerformanceReport({ from, to, branchId: branchId !== "all" ? branchId : undefined, categoryId: categoryId !== "all" ? categoryId : undefined })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, branchId, categoryId]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportCategoryPerformanceReport({ from, to, branchId: branchId !== "all" ? branchId : undefined, categoryId: categoryId !== "all" ? categoryId : undefined, exportedBy: user?.id, includeMargin: canViewMargin, format });
      downloadBlob(blob, `category-performance-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const pieData = (data?.rows ?? []).slice(0, 6).map((r) => ({ name: r.categoryName, value: r.netSales }));

  return (
    <PageShell title="Category Performance" subtitle="Sales contribution, margin and velocity by category">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        </div>
        {!lockedBranchId && (
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="All Branches" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Top Category" value={kpis?.topCategory ?? "—"} icon={Tags} accent="primary" />
        {canViewMargin && <MetricCard label="Highest Margin Category" value={kpis?.highestMarginCategory ?? "—"} icon={Percent} accent="success" />}
        <MetricCard label="Category Return Rate" value={`${kpis?.categoryReturnRatePct ?? 0}%`} icon={Layers} accent="warning" />
        <MetricCard label="Categories Sold" value={String(kpis?.totalCategoriesSold ?? 0)} icon={Layers} />
        <MetricCard label="Category Discount Value" value={<><SARIcon />{fmt(kpis?.categoryDiscountValue ?? 0)}</>} icon={Percent} accent="warning" />
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
