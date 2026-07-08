import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable, StatusBadge } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { api, type TobaccoExciseReport as TobaccoExciseData, type TobaccoExciseRow, type ReportExportFormat } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Cigarette, Coins, Package, RotateCcw, Tag, AlertTriangle } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_app/reports/tobacco-excise")({ component: TobaccoExcise });

function firstOfMonthStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function TobaccoExcise() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [data, setData] = useState<TobaccoExciseData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.getTobaccoExciseReport({ from, to, branchId: branchId !== "all" ? branchId : undefined })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, branchId]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportTobaccoExciseReport({ from, to, branchId: branchId !== "all" ? branchId : undefined, exportedBy: user?.id, format });
      downloadBlob(blob, `tobacco-excise-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const chartData = (data?.rows ?? []).slice(0, 10).map((r) => ({ name: r.sku, excise: r.exciseAmount }));

  return (
    <PageShell title="Tobacco Excise Report" subtitle="Excise tax calculations on regulated tobacco products">
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
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <MetricCard label="Excise Sales Value" value={<><SARIcon />{fmt(kpis?.exciseSalesValue ?? 0)}</>} icon={Cigarette} accent="primary" />
        <MetricCard label="Excise Tax Amount" value={<><SARIcon />{fmt(kpis?.exciseTaxAmount ?? 0)}</>} icon={Coins} accent="warning" />
        <MetricCard label="Tobacco Units Sold" value={String(kpis?.tobaccoUnitsSold ?? 0)} icon={Package} />
        <MetricCard label="Excise Refunds" value={<><SARIcon />{fmt(kpis?.exciseRefunds ?? 0)}</>} icon={RotateCcw} accent="destructive" />
        <MetricCard label="Top Tobacco SKU" value={kpis?.topTobaccoSku ?? "—"} icon={Tag} />
        <MetricCard label="Compliance Exceptions" value={String(kpis?.complianceExceptions ?? 0)} icon={AlertTriangle} accent="destructive" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Excise Amount by SKU</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip formatter={(v: number) => fmtSAR(v)} />
            <Bar dataKey="excise" fill="var(--warning)" radius={[4, 4, 0, 0]} />
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
            { key: "brand", label: "Brand" },
            { key: "category", label: "Category" },
            { key: "branch", label: "Branch" },
            { key: "unitsSold", label: "Units Sold" },
            { key: "taxablePrice", label: "Taxable Price", render: (r: TobaccoExciseRow) => <><SARIcon />{fmt(r.taxablePrice)}</> },
            { key: "exciseRate", label: "Excise Rate", render: (r: TobaccoExciseRow) => `${r.exciseRate}%` },
            { key: "exciseAmount", label: "Excise Amount", render: (r: TobaccoExciseRow) => <span className="font-semibold"><SARIcon />{fmt(r.exciseAmount)}</span> },
            { key: "netExcise", label: "Net Excise", render: (r: TobaccoExciseRow) => <><SARIcon />{fmt(r.netExcise)}</> },
            { key: "complianceStatus", label: "Compliance Status", render: (r: TobaccoExciseRow) => <StatusBadge status={r.complianceStatus} /> },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
