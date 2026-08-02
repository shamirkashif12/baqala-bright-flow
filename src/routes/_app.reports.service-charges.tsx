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
import { api, type FeeReport as FeeReportData, type FeeRow, type ReportExportFormat } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Receipt, TrendingUp, Truck, X } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_app/reports/service-charges")({ component: FeeReportPage });

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

  const hasFilters = from !== firstOfMonthStr() || to !== todayStr() || (!lockedBranchId && branchId !== "all");
  const clearFilters = () => {
    setFrom(firstOfMonthStr()); setTo(todayStr());
    if (!lockedBranchId) setBranchId("all");
  };

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportFeeReport({ from, to, branchId: branchId !== "all" ? branchId : undefined, exportedBy: user?.id, format });
      downloadBlob(blob, `service-charges-${from}-to-${to}.${format}`);
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
      acc[day].value += r.serviceChargeAmount;
      return acc;
    }, {})
  );
  const grandTotal = (data?.rows ?? []).reduce((s, r) => s + r.serviceChargeAmount, 0);

  return (
    <PageShell title="Service Charges Report" subtitle="Business-configured surcharges (delivery fee, card surcharge) — not a tax. See Tobacco Excise Report for the tobacco tax.">
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
        {hasFilters && (
          <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" /> Clear Filters
          </Button>
        )}
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <MetricCard label="Total Service Charges" value={<><SARIcon />{fmt(kpis?.totalServiceCharges ?? 0)}</>} icon={Truck} accent="primary" />
        <MetricCard label="Transactions with Charge" value={String(kpis?.transactionsWithFees ?? 0)} icon={Receipt} />
        <MetricCard label="Avg Charge per Transaction" value={<><SARIcon />{fmt(kpis?.averageFeePerTransaction ?? 0)}</>} icon={TrendingUp} accent="success" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Service Charge Trend</h3>
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
        <>
          <PaginatedDataTable
            columns={[
              { key: "invoiceNo", label: "Invoice No." },
              { key: "dateTime", label: "Date/Time", render: (r: FeeRow) => new Date(r.dateTime).toLocaleString("en-SA", { dateStyle: "short", timeStyle: "short" }) },
              { key: "branch", label: "Branch" },
              { key: "cashier", label: "Cashier" },
              { key: "customerType", label: "Customer Type" },
              { key: "chargeName", label: "Charge Name" },
              { key: "serviceChargeAmount", label: "Service Charge Amount", render: (r: FeeRow) => <span className="font-semibold"><SARIcon />{fmt(r.serviceChargeAmount)}</span> },
            ]}
            rows={data?.rows ?? []}
            emptyMessage="No service charges in this period."
          />
          {(data?.rows.length ?? 0) > 0 && (
            <div className="flex justify-end mt-2 text-sm font-semibold">
              Grand Total: <SARIcon />{fmt(grandTotal)}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
