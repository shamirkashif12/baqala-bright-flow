import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable, FilterField } from "@/components/module-placeholder";
import { DateRangeField } from "@/components/report-filters/date-range-field";
import { ReportExportButton } from "@/components/report-export-button";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { api, type TaxReport as TaxReportData, type TaxReportRow, type ReportExportFormat, type User } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Coins, Percent, Ban, Wallet, X } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_app/reports/tax")({ component: TaxReportPage });

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function TaxReportPage() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [cashierId, setCashierId] = useState("all");
  const [cashiers, setCashiers] = useState<User[]>([]);
  const [data, setData] = useState<TaxReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getUsers({ branchId: branchId !== "all" ? branchId : undefined }).then((u) => setCashiers(u.filter((x) => x.status === "active" && x.roleName === "Cashier"))).catch(() => {});
    setCashierId("all");
  }, [branchId]);

  const load = useCallback(() => {
    setLoading(true);
    api.getTaxReport({ from, to, branchId: branchId !== "all" ? branchId : undefined, cashierId: cashierId !== "all" ? cashierId : undefined })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, branchId, cashierId]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportTaxReport({ from, to, branchId: branchId !== "all" ? branchId : undefined, cashierId: cashierId !== "all" ? cashierId : undefined, exportedBy: user?.id, format });
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

  const hasFilters = from !== firstOfMonthStr() || to !== todayStr() || branchId !== (lockedBranchId ?? "all") || cashierId !== "all";
  const clearFilters = () => {
    setFrom(firstOfMonthStr()); setTo(todayStr()); setBranchId(lockedBranchId ?? "all"); setCashierId("all");
  };

  return (
    <PageShell title="Tax Report" subtitle="Tax breakdown by branch, cashier and tax code">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex items-center gap-1">
          <DateRangeField from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        </div>
        {!lockedBranchId && (
          <FilterField label="Branch">
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="h-9 w-44"><SelectValue placeholder="All Branches" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterField>
        )}
        <FilterField label="Cashier">
          <Select value={cashierId} onValueChange={setCashierId}>
            <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Cashier" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cashiers</SelectItem>
              {cashiers.map((c) => <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>)}
            </SelectContent>
          </Select>
        </FilterField>
        {hasFilters && (
          <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" /> Clear Filters
          </Button>
        )}
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
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
