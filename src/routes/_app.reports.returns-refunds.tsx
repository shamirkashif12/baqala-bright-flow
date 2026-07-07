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
import { api, type ReturnsRefundsReport as ReturnsRefundsData, type ReturnRefundRow, type ReportExportFormat } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { RotateCcw, Wallet, Receipt, Clock } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

export const Route = createFileRoute("/_app/reports/returns-refunds")({ component: ReturnsRefunds });

const METHOD_COLORS: Record<string, string> = { cash: "var(--primary)", store_credit: "var(--warning)", original_payment: "var(--success)" };

function firstOfMonthStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function ReturnsRefunds() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [refundMethod, setRefundMethod] = useState("all");
  const [data, setData] = useState<ReturnsRefundsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.getReturnsRefundsReport({ from, to, branchId: branchId !== "all" ? branchId : undefined, refundMethod: refundMethod !== "all" ? refundMethod : undefined })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, branchId, refundMethod]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportReturnsRefundsReport({ from, to, branchId: branchId !== "all" ? branchId : undefined, refundMethod: refundMethod !== "all" ? refundMethod : undefined, exportedBy: user?.id, format });
      downloadBlob(blob, `returns-refunds-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const pieData = Object.values(
    (data?.rows ?? []).reduce<Record<string, { name: string; value: number }>>((acc, r) => {
      acc[r.refundMethod] ??= { name: r.refundMethod, value: 0 };
      acc[r.refundMethod].value += r.refundAmount;
      return acc;
    }, {})
  );

  return (
    <PageShell title="Return / Refund Report" subtitle="Customer returns, refunds and VAT reversal">
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
        <Select value={refundMethod} onValueChange={setRefundMethod}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Refund Method" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Methods</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="store_credit">Store Credit</SelectItem>
            <SelectItem value="original_payment">Original Payment</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Return Count" value={String(kpis?.returnCount ?? 0)} icon={RotateCcw} accent="primary" />
        <MetricCard label="Refund Value" value={<><SARIcon />{fmt(kpis?.refundValue ?? 0)}</>} icon={Wallet} accent="destructive" />
        <MetricCard label="VAT Reversed" value={<><SARIcon />{fmt(kpis?.vatReversed ?? 0)}</>} icon={Receipt} />
        <MetricCard label="Top Return Reason" value={kpis?.topReturnReason ?? "—"} icon={RotateCcw} />
        <MetricCard label="Refunds Pending" value={String(kpis?.refundsPending ?? 0)} icon={Clock} accent="warning" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Refund Method Split</h3>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
              {pieData.map((d) => <Cell key={d.name} fill={METHOD_COLORS[d.name] ?? "var(--muted-foreground)"} />)}
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
            { key: "returnId", label: "Return ID" },
            { key: "originalOrderId", label: "Original Order" },
            { key: "dateTime", label: "Date/Time", render: (r: ReturnRefundRow) => new Date(r.dateTime).toLocaleString("en-SA", { dateStyle: "short", timeStyle: "short" }) },
            { key: "branch", label: "Branch" },
            { key: "cashier", label: "Cashier" },
            { key: "customer", label: "Customer" },
            { key: "returnType", label: "Return Type" },
            { key: "reason", label: "Reason" },
            { key: "refundMethod", label: "Refund Method" },
            { key: "refundAmount", label: "Refund Amount", render: (r: ReturnRefundRow) => <span className="font-semibold"><SARIcon />{fmt(r.refundAmount)}</span> },
            { key: "vatReversal", label: "VAT Reversal", render: (r: ReturnRefundRow) => <><SARIcon />{fmt(r.vatReversal)}</> },
            { key: "status", label: "Status", render: (r: ReturnRefundRow) => <StatusBadge status={r.status} /> },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
