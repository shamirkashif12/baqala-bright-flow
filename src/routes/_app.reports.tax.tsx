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
import { api, type TaxReport as TaxReportData, type TaxReportRow, type ReportExportFormat } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Coins, Percent, Ban, Wallet } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_app/reports/tax")({ component: TaxReportPage });

function firstOfMonthStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function TaxReportPage() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [data, setData] = useState<TaxReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.getTaxReport({ from, to, branchId: branchId !== "all" ? branchId : undefined })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, branchId]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportTaxReport({ from, to, branchId: branchId !== "all" ? branchId : undefined, exportedBy: user?.id, format });
      downloadBlob(blob, `tax-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const chartData = Object.values(
    (data?.rows ?? []).reduce<Record<string, { name: string; value: number }>>((acc, r) => {
      acc[r.branch] ??= { name: r.branch, value: 0 };
      acc[r.branch].value += r.taxAmount;
      return acc;
    }, {})
  );

  return (
    <PageShell title="Tax Report" subtitle="Tax breakdown by branch, cashier and tax code">
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
        <MetricCard label="Total Taxable Amount" value={<><SARIcon />{fmt(kpis?.totalTaxableAmount ?? 0)}</>} icon={Coins} accent="primary" />
        <MetricCard label="VAT Amount" value={<><SARIcon />{fmt(kpis?.vatAmount ?? 0)}</>} icon={Percent} accent="success" />
        <MetricCard label="Zero-rated Sales" value={<><SARIcon />{fmt(kpis?.zeroRatedSales ?? 0)}</>} icon={Ban} />
        <MetricCard label="Net Tax Payable" value={<><SARIcon />{fmt(kpis?.netTaxPayable ?? 0)}</>} icon={Wallet} accent="warning" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Tax by Branch</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip formatter={(v: number) => fmtSAR(v)} />
            <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "branch", label: "Branch" },
            { key: "cashier", label: "Cashier" },
            { key: "taxCode", label: "Tax Code" },
            { key: "taxType", label: "Tax Type", render: (r: TaxReportRow) => <span className="capitalize">{r.taxType.replace("_", " ")}</span> },
            { key: "taxRate", label: "Tax Rate", render: (r: TaxReportRow) => `${r.taxRate}%` },
            { key: "taxableAmount", label: "Taxable Amount", render: (r: TaxReportRow) => <><SARIcon />{fmt(r.taxableAmount)}</> },
            { key: "taxAmount", label: "Tax Amount", render: (r: TaxReportRow) => <span className="font-semibold"><SARIcon />{fmt(r.taxAmount)}</span> },
            { key: "zeroRatedAmount", label: "Zero-rated Amount", render: (r: TaxReportRow) => <><SARIcon />{fmt(r.zeroRatedAmount)}</> },
            { key: "exemptAmount", label: "Exempt Amount", render: (r: TaxReportRow) => <><SARIcon />{fmt(r.exemptAmount)}</> },
            { key: "netTaxAmount", label: "Net Tax Amount", render: (r: TaxReportRow) => <><SARIcon />{fmt(r.netTaxAmount)}</> },
            { key: "transactions", label: "Transactions" },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
