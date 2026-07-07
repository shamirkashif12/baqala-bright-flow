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
import { api, type ProfitMarginReport as ProfitMarginData, type ProfitMarginRow, type ReportExportFormat } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { TrendingUp, Percent, AlertTriangle, ShieldAlert } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";

export const Route = createFileRoute("/_app/reports/profit-margin")({ component: ProfitMargin });

function firstOfMonthStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function ProfitMargin() {
  const { user, canViewModule } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();
  // Entire report is margin-gated, not just its columns — FRD AC#101/#105.
  const canViewMargin = canViewModule("Accounting & Finance");

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [groupBy, setGroupBy] = useState<"product" | "category" | "branch">("product");
  const [data, setData] = useState<ProfitMarginData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!canViewMargin) { setLoading(false); return; }
    setLoading(true);
    api.getProfitMarginReport({ from, to, branchId: branchId !== "all" ? branchId : undefined, groupBy })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, branchId, groupBy, canViewMargin]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportProfitMarginReport({ from, to, branchId: branchId !== "all" ? branchId : undefined, groupBy, exportedBy: user?.id, format });
      downloadBlob(blob, `profit-margin-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  if (!canViewMargin) {
    return (
      <PageShell title="Profit Margin" subtitle="Gross and net margin by product, category, supplier and branch">
        <Card className="p-8 border-border/60 shadow-card text-center flex flex-col items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-destructive" />
          <p className="text-sm font-medium">You don't have permission to view this report.</p>
          <p className="text-xs text-muted-foreground">Margin and cost data requires Accounting &amp; Finance access.</p>
        </Card>
      </PageShell>
    );
  }

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const chartData = (data?.rows ?? []).slice(0, 10).map((r) => ({ name: r.groupName, margin: r.marginPct ?? 0 }));

  return (
    <PageShell title="Profit Margin" subtitle="Gross and net margin by product, category and branch">
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
        <Select value={groupBy} onValueChange={(v) => setGroupBy(v as typeof groupBy)}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Group By" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="product">Group by Product</SelectItem>
            <SelectItem value="category">Group by Category</SelectItem>
            <SelectItem value="branch">Group by Branch</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Gross Profit" value={<><SARIcon />{fmt(kpis?.grossProfit ?? 0)}</>} icon={TrendingUp} accent="success" />
        <MetricCard label="Gross Margin %" value={kpis?.grossMarginPct != null ? `${kpis.grossMarginPct}%` : "N/A"} icon={Percent} accent="primary" />
        <MetricCard label="Net Margin %" value={kpis?.netMarginPct != null ? `${kpis.netMarginPct}%` : "N/A"} icon={Percent} />
        <MetricCard label="Low Margin SKUs" value={String(kpis?.lowMarginSkus ?? 0)} icon={AlertTriangle} accent="warning" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Margin % by {groupBy}</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" fontSize={11} />
            <YAxis fontSize={11} unit="%" />
            <Tooltip formatter={(v: number) => `${v}%`} />
            <Bar dataKey="margin" radius={[4, 4, 0, 0]}>
              {chartData.map((d) => <Cell key={d.name} fill={d.margin < 10 ? "var(--destructive)" : "var(--success)"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "groupName", label: "Group" },
            { key: "branch", label: "Branch" },
            { key: "unitsSold", label: "Units Sold" },
            { key: "netSales", label: "Net Sales", render: (r: ProfitMarginRow) => <span className="font-semibold"><SARIcon />{fmt(r.netSales)}</span> },
            { key: "cogs", label: "COGS", render: (r: ProfitMarginRow) => <><SARIcon />{fmt(r.cogs)}</> },
            { key: "grossProfit", label: "Gross Profit", render: (r: ProfitMarginRow) => <><SARIcon />{fmt(r.grossProfit)}</> },
            { key: "marginPct", label: "Gross Margin %", render: (r: ProfitMarginRow) => (r.marginPct != null ? `${r.marginPct}%` : "N/A") },
            { key: "discountValue", label: "Discount Value", render: (r: ProfitMarginRow) => <><SARIcon />{fmt(r.discountValue)}</> },
            { key: "returnImpact", label: "Return Impact", render: (r: ProfitMarginRow) => <><SARIcon />{fmt(r.returnImpact)}</> },
            { key: "netProfit", label: "Net Profit", render: (r: ProfitMarginRow) => <><SARIcon />{fmt(r.netProfit)}</> },
            { key: "netMarginPct", label: "Net Margin %", render: (r: ProfitMarginRow) => (r.netMarginPct != null ? `${r.netMarginPct}%` : "N/A") },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
