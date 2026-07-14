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
import { api, type FeeReport as FeeReportData, type FeeRow, type ReportExportFormat } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { DollarSign, Receipt, TrendingUp } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_app/reports/fees")({ component: FeeReportPage });

function firstOfMonthStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function FeeReportPage() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [data, setData] = useState<FeeReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.getFeeReport({ from, to, branchId: branchId !== "all" ? branchId : undefined })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, branchId]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportFeeReport({ from, to, branchId: branchId !== "all" ? branchId : undefined, exportedBy: user?.id, format });
      downloadBlob(blob, `fees-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const chartData = Object.values(
    (data?.rows ?? []).reduce<Record<string, { date: string; value: number }>>((acc, r) => {
      const day = r.dateTime.slice(0, 10);
      acc[day] ??= { date: day.slice(5), value: 0 };
      acc[day].value += r.feeAmount;
      return acc;
    }, {})
  );

  return (
    <PageShell title="Fee Report" subtitle="Custom fees collected across transactions">
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Fees Collected" value={<><SARIcon />{fmt(kpis?.totalFeesCollected ?? 0)}</>} icon={DollarSign} accent="primary" />
        <MetricCard label="Transactions with Fees" value={String(kpis?.transactionsWithFees ?? 0)} icon={Receipt} />
        <MetricCard label="Avg Fee per Transaction" value={<><SARIcon />{fmt(kpis?.averageFeePerTransaction ?? 0)}</>} icon={TrendingUp} accent="success" />
        <MetricCard label="Tobacco Fees" value={<><SARIcon />{fmt(kpis?.totalTobaccoFees ?? 0)}</>} icon={DollarSign} accent="warning" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Fee Trend</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip formatter={(v: number) => fmtSAR(v)} />
            <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "feeId", label: "Fee ID" },
            { key: "feeType", label: "Fee Type" },
            { key: "invoiceNo", label: "Invoice No." },
            { key: "dateTime", label: "Date/Time", render: (r: FeeRow) => new Date(r.dateTime).toLocaleString("en-SA", { dateStyle: "short", timeStyle: "short" }) },
            { key: "branch", label: "Branch" },
            { key: "cashier", label: "Cashier" },
            { key: "customerType", label: "Customer Type" },
            { key: "feeAmount", label: "Fee Amount", render: (r: FeeRow) => <span className="font-semibold"><SARIcon />{fmt(r.feeAmount)}</span> },
            { key: "netFee", label: "Net Fee", render: (r: FeeRow) => <><SARIcon />{fmt(r.netFee)}</> },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
