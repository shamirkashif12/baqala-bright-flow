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
import { api, type MonthlySalesReport, type ReportExportFormat } from "@/lib/api";
import { useReportFilterOptions } from "@/lib/use-report-filters";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Wallet, TrendingUp, Percent, RotateCcw, Lock, Cigarette } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

export const Route = createFileRoute("/_app/reports/monthly-sales")({ component: MonthlySales });

function firstOfMonthStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function MonthlySales() {
  const { user, canViewModule } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();
  // COGS / margin are financial data — only surface them to roles with Accounting & Finance access,
  // per the Reports FRD's column-masking rule for margin fields.
  const canViewMargin = canViewModule("Accounting & Finance");

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [categoryId, setCategoryId] = useState("all");
  const [productId, setProductId] = useState("all");
  const [cashierId, setCashierId] = useState("all");
  const [terminalId, setTerminalId] = useState("all");
  const [hasTobaccoFee, setHasTobaccoFee] = useState(false);
  const [comparePrevious, setComparePrevious] = useState("no");
  const [data, setData] = useState<MonthlySalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { categories, products, employees, terminals } = useReportFilterOptions(branchId, categoryId);

  // Employee/terminal/product lists are branch- and category-scoped, so a selection that's no
  // longer offered must be cleared — otherwise the report silently returns nothing.
  useEffect(() => { setCashierId("all"); setTerminalId("all"); }, [branchId]);
  useEffect(() => {
    if (productId !== "all" && !products.some((p) => p.id === productId)) setProductId("all");
  }, [products, productId]);

  const filters = useMemo(() => ({
    branchId: branchId !== "all" ? branchId : undefined,
    categoryId: categoryId !== "all" ? categoryId : undefined,
    productId: productId !== "all" ? productId : undefined,
    cashierId: cashierId !== "all" ? cashierId : undefined,
    terminalId: terminalId !== "all" ? terminalId : undefined,
    hasTobaccoFee: hasTobaccoFee || undefined,
  }), [branchId, categoryId, productId, cashierId, terminalId, hasTobaccoFee]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api.getMonthlySalesReport({ from, to, ...filters, comparePrevious: comparePrevious === "yes" })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, filters, comparePrevious]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportMonthlySalesReport({
        from, to, ...filters,
        comparePrevious: comparePrevious === "yes", exportedBy: user?.id, includeMargin: canViewMargin, format,
      });
      downloadBlob(blob, `monthly-sales-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const chartData = (data?.daily ?? []).map((d) => ({
    date: d.date.slice(5), netSales: d.netSales, marginPct: d.marginPct ?? 0, previous: d.previousPeriodSales ?? undefined,
  }));

  return (
    <PageShell
      title="Monthly Sales"
      subtitle="Sales trend and profit margin breakdown across a date range"
    >
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
        <Select value={comparePrevious} onValueChange={setComparePrevious}>
          <SelectTrigger className="h-9 w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="no">No comparison</SelectItem>
            <SelectItem value="yes">Compare previous period</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-sm px-2">
          <Checkbox checked={hasTobaccoFee} onCheckedChange={(v) => setHasTobaccoFee(v === true)} />
          Tobacco fee only
        </label>
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      {error && <Card className="p-4 border-destructive/40 bg-destructive/5 text-sm text-destructive">{error}</Card>}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        <MetricCard label="Net Sales" value={<><SARIcon />{fmt(kpis?.netSales ?? 0)}</>} icon={Wallet} accent="primary" />
        {canViewMargin ? (
          <>
            <MetricCard label="Gross Profit" value={<><SARIcon />{fmt(kpis?.grossProfit ?? 0)}</>} icon={TrendingUp} accent="success" />
            <MetricCard label="Margin %" value={kpis?.marginPct != null ? `${kpis.marginPct}%` : "N/A"} icon={Percent} />
          </>
        ) : (
          <>
            <MetricCard label="Gross Profit" value={<Lock className="h-4 w-4 text-muted-foreground" />} icon={TrendingUp} />
            <MetricCard label="Margin %" value={<Lock className="h-4 w-4 text-muted-foreground" />} icon={Percent} />
          </>
        )}
        <MetricCard label="Transactions" value={String(kpis?.transactions ?? 0)} icon={TrendingUp} />
        <MetricCard label="Return Value" value={<><SARIcon />{fmt(kpis?.returnValue ?? 0)}</>} icon={RotateCcw} accent="destructive" />
        <MetricCard label="Discount Value" value={<><SARIcon />{fmt(kpis?.discountValue ?? 0)}</>} icon={Percent} accent="warning" />
        <MetricCard label="Tobacco Fees" value={<><SARIcon />{fmt(kpis?.tobaccoFees ?? 0)}</>} icon={Cigarette} accent="warning" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Daily Net Sales{comparePrevious === "yes" ? " vs. Previous Period" : ""}</h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip formatter={(v: number) => fmtSAR(v)} />
            <Legend />
            <Line type="monotone" dataKey="netSales" stroke="var(--primary)" strokeWidth={2} dot={false} name="Net Sales" />
            {comparePrevious === "yes" && (
              <Line type="monotone" dataKey="previous" stroke="var(--muted-foreground)" strokeWidth={2} strokeDasharray="4 4" dot={false} name="Previous Period" />
            )}
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "date", label: "Date" },
            { key: "transactions", label: "Txns" },
            { key: "grossSales", label: "Gross Sales", render: (r) => <><SARIcon />{fmt(r.grossSales)}</> },
            { key: "discounts", label: "Discounts", render: (r) => <><SARIcon />{fmt(r.discounts)}</> },
            { key: "returns", label: "Returns", render: (r) => <><SARIcon />{fmt(r.returns)}</> },
            { key: "netSales", label: "Net Sales", render: (r) => <span className="font-semibold"><SARIcon />{fmt(r.netSales)}</span> },
            { key: "vat", label: "VAT", render: (r) => <><SARIcon />{fmt(r.vat)}</> },
            { key: "tobaccoFees", label: "Tobacco Fees", render: (r) => <><SARIcon />{fmt(r.tobaccoFees)}</> },
            ...(canViewMargin
              ? [
                  { key: "cogs", label: "COGS", render: (r: MonthlySalesReport["daily"][number]) => <><SARIcon />{fmt(r.cogs)}</> },
                  { key: "grossProfit", label: "Gross Profit", render: (r: MonthlySalesReport["daily"][number]) => <><SARIcon />{fmt(r.grossProfit)}</> },
                  { key: "marginPct", label: "Margin %", render: (r: MonthlySalesReport["daily"][number]) => (r.marginPct != null ? `${r.marginPct}%` : "N/A") },
                ]
              : []),
            { key: "avgBasket", label: "Avg Basket", render: (r) => <><SARIcon />{fmt(r.avgBasket)}</> },
            { key: "previousPeriodSales", label: "Previous Period", render: (r) => (r.previousPeriodSales != null ? <><SARIcon />{fmt(r.previousPeriodSales)}</> : "—") },
            { key: "growthPct", label: "Growth %", render: (r) => (r.growthPct != null ? `${r.growthPct}%` : "—") },
          ]}
          rows={data?.daily ?? []}
        />
      )}
    </PageShell>
  );
}
