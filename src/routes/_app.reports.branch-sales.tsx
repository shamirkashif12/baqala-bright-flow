import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { api, type BranchSalesReport, type BranchSalesRow, type ReportExportFormat } from "@/lib/api";
import { useReportFilterOptions } from "@/lib/use-report-filters";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Trophy, TrendingDown, Wallet, BarChart3, RotateCcw, Cigarette } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_app/reports/branch-sales")({ component: BranchSales });

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function BranchSales() {
  const { user, canViewModule } = useAuth();
  const { canExport } = usePermission("Reports");
  const canViewMargin = canViewModule("Accounting & Finance");
  const { branches } = useBranch();
  const cities = Array.from(new Set(branches.map((b) => b.city).filter((c): c is string => !!c))).sort();
  // Non-admins are branch-scoped server-side regardless of this filter (they only ever see
  // their own branch's row), and useBranch() only returns their one branch — a City dropdown
  // with a single option is confusing, not useful, so only tenant_admin sees it at all.
  const canFilterByCity = user?.role === "tenant_admin";

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [city, setCity] = useState("all");
  const [branchId, setBranchId] = useState("all");
  const [customerType, setCustomerType] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [productId, setProductId] = useState("all");
  const [cashierId, setCashierId] = useState("all");
  const [terminalId, setTerminalId] = useState("all");
  const [hasTobaccoFee, setHasTobaccoFee] = useState(false);
  const [data, setData] = useState<BranchSalesReport | null>(null);
  const [loading, setLoading] = useState(true);

  const { categories, products, employees, terminals } = useReportFilterOptions(branchId, categoryId);

  useEffect(() => { setCashierId("all"); setTerminalId("all"); }, [branchId]);
  useEffect(() => {
    if (productId !== "all" && !products.some((p) => p.id === productId)) setProductId("all");
  }, [products, productId]);

  const filters = useMemo(() => ({
    city: city !== "all" ? city : undefined,
    branchId: branchId !== "all" ? branchId : undefined,
    customerType: customerType !== "all" ? customerType : undefined,
    categoryId: categoryId !== "all" ? categoryId : undefined,
    productId: productId !== "all" ? productId : undefined,
    cashierId: cashierId !== "all" ? cashierId : undefined,
    terminalId: terminalId !== "all" ? terminalId : undefined,
    hasTobaccoFee: hasTobaccoFee || undefined,
  }), [city, branchId, customerType, categoryId, productId, cashierId, terminalId, hasTobaccoFee]);

  const load = useCallback(() => {
    setLoading(true);
    api.getBranchSalesReport({ from, to, ...filters })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, filters]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportBranchSalesReport({
        from, to, ...filters, exportedBy: user?.id, includeMargin: canViewMargin, format,
      });
      downloadBlob(blob, `branch-sales-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const chartData = (data?.rows ?? []).slice(0, 10).map((r) => ({ name: r.branchName, sales: r.netSales }));

  return (
    <PageShell title="Branch Sales" subtitle="Compare performance across branches">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        </div>
        {canFilterByCity && (
          <>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger className="h-9 w-40"><SelectValue placeholder="City" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cities</SelectItem>
                {cities.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Branch" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        )}
        <Select value={customerType} onValueChange={setCustomerType}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Customer Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Customers</SelectItem>
            <SelectItem value="registered">Registered</SelectItem>
            <SelectItem value="walk-in">Walk-in</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={productId} onValueChange={setProductId}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Product" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Products</SelectItem>
            {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={cashierId} onValueChange={setCashierId}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Employee" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.fullName}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={terminalId} onValueChange={setTerminalId}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Device" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Devices</SelectItem>
            {terminals.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-sm px-2">
          <Checkbox checked={hasTobaccoFee} onCheckedChange={(v) => setHasTobaccoFee(v === true)} />
          Tobacco fee only
        </label>
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <MetricCard label="Top Branch" value={kpis?.topBranch ?? "—"} icon={Trophy} accent="primary" />
        <MetricCard label="Lowest Branch" value={kpis?.lowestBranch ?? "—"} icon={TrendingDown} accent="warning" />
        <MetricCard label="Total Net Sales" value={<><SARIcon />{fmt(kpis?.totalNetSales ?? 0)}</>} icon={Wallet} />
        <MetricCard label="Avg Branch Sales" value={<><SARIcon />{fmt(kpis?.averageBranchSales ?? 0)}</>} icon={BarChart3} />
        <MetricCard label="Total Returns" value={<><SARIcon />{fmt(kpis?.totalReturns ?? 0)}</>} icon={RotateCcw} accent="destructive" />
        <MetricCard label="Tobacco Fees" value={<><SARIcon />{fmt(kpis?.totalTobaccoFees ?? 0)}</>} icon={Cigarette} accent="warning" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Net Sales by Branch</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis type="number" fontSize={11} />
            <YAxis type="category" dataKey="name" fontSize={11} width={120} />
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
            { key: "rank", label: "Rank" },
            { key: "branchCode", label: "Branch Code" },
            { key: "branchName", label: "Branch Name" },
            { key: "city", label: "City" },
            { key: "openTerminals", label: "Open Terminals" },
            { key: "transactions", label: "Txns" },
            { key: "grossSales", label: "Gross Sales", render: (r: BranchSalesRow) => <><SARIcon />{fmt(r.grossSales)}</> },
            { key: "discounts", label: "Discounts", render: (r: BranchSalesRow) => <><SARIcon />{fmt(r.discounts)}</> },
            { key: "returns", label: "Returns", render: (r: BranchSalesRow) => <><SARIcon />{fmt(r.returns)}</> },
            { key: "netSales", label: "Net Sales", render: (r: BranchSalesRow) => <span className="font-semibold"><SARIcon />{fmt(r.netSales)}</span> },
            { key: "vat", label: "VAT", render: (r: BranchSalesRow) => <><SARIcon />{fmt(r.vat)}</> },
            { key: "tobaccoFees", label: "Tobacco Fees", render: (r: BranchSalesRow) => <><SARIcon />{fmt(r.tobaccoFees)}</> },
            { key: "avgBasket", label: "Avg Basket", render: (r: BranchSalesRow) => <><SARIcon />{fmt(r.avgBasket)}</> },
            ...(canViewMargin
              ? [
                  { key: "grossProfit", label: "Gross Profit", render: (r: BranchSalesRow) => <><SARIcon />{fmt(r.grossProfit)}</> },
                  { key: "marginPct", label: "Margin %", render: (r: BranchSalesRow) => (r.marginPct != null ? `${r.marginPct}%` : "N/A") },
                ]
              : []),
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
