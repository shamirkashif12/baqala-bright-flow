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
import { api, type VatZatcaReport as VatZatcaData, type VatZatcaRow, type ReportExportFormat } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { ShieldCheck, CheckCircle2, Clock, XCircle } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

export const Route = createFileRoute("/_app/reports/vat-zatca")({ component: VatZatca });

const STATUS_COLORS: Record<string, string> = { accepted: "var(--success)", pending: "var(--warning)", submitted: "var(--warning)", rejected: "var(--destructive)" };

function firstOfMonthStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function VatZatca() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [zatcaStatus, setZatcaStatus] = useState("all");
  const [data, setData] = useState<VatZatcaData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.getVatZatcaReport({ from, to, branchId: branchId !== "all" ? branchId : undefined, zatcaStatus: zatcaStatus !== "all" ? zatcaStatus : undefined })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, branchId, zatcaStatus]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportVatZatcaReport({ from, to, branchId: branchId !== "all" ? branchId : undefined, zatcaStatus: zatcaStatus !== "all" ? zatcaStatus : undefined, exportedBy: user?.id, format });
      downloadBlob(blob, `vat-zatca-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const statusCounts = ["accepted", "submitted", "pending", "rejected"].map((s) => ({
    status: s, count: (data?.rows ?? []).filter((r) => r.zatcaStatus === s).length,
  })).filter((s) => s.count > 0);

  return (
    <PageShell title="VAT / ZATCA Report" subtitle="Taxable amounts, VAT collected/reversed and e-invoicing status">
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
        <Select value={zatcaStatus} onValueChange={setZatcaStatus}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="ZATCA Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any Status</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <MetricCard label="Taxable Sales" value={<><SARIcon />{fmt(kpis?.taxableSales ?? 0)}</>} icon={ShieldCheck} accent="primary" />
        <MetricCard label="VAT Collected" value={<><SARIcon />{fmt(kpis?.vatCollected ?? 0)}</>} icon={ShieldCheck} accent="success" />
        <MetricCard label="VAT Reversed" value={<><SARIcon />{fmt(kpis?.vatReversed ?? 0)}</>} icon={ShieldCheck} accent="destructive" />
        <MetricCard label="ZATCA Success" value={String(kpis?.zatcaSuccess ?? 0)} icon={CheckCircle2} accent="success" />
        <MetricCard label="ZATCA Pending" value={String(kpis?.zatcaPending ?? 0)} icon={Clock} accent="warning" />
        <MetricCard label="ZATCA Errors" value={String(kpis?.zatcaErrors ?? 0)} icon={XCircle} accent="destructive" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">ZATCA Status Breakdown</h3>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={statusCounts} dataKey="count" nameKey="status" innerRadius={55} outerRadius={85} paddingAngle={2}>
              {statusCounts.map((s) => <Cell key={s.status} fill={STATUS_COLORS[s.status]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "invoiceNo", label: "Invoice No." },
            { key: "issueDateTime", label: "Issue Date/Time", render: (r: VatZatcaRow) => new Date(r.issueDateTime).toLocaleString("en-SA", { dateStyle: "short", timeStyle: "short" }) },
            { key: "branch", label: "Branch" },
            { key: "invoiceType", label: "Invoice Type", render: (r: VatZatcaRow) => <span className="capitalize">{r.invoiceType}</span> },
            { key: "customerVatNo", label: "Customer VAT No.", render: (r: VatZatcaRow) => r.customerVatNo ?? "—" },
            { key: "taxableAmount", label: "Taxable Amount", render: (r: VatZatcaRow) => <><SARIcon />{fmt(r.taxableAmount)}</> },
            { key: "vatAmount", label: "VAT Amount", render: (r: VatZatcaRow) => <span className="font-semibold"><SARIcon />{fmt(r.vatAmount)}</span> },
            { key: "totalWithVat", label: "Total With VAT", render: (r: VatZatcaRow) => <><SARIcon />{fmt(r.totalWithVat)}</> },
            { key: "zatcaStatus", label: "ZATCA Status", render: (r: VatZatcaRow) => <StatusBadge status={r.zatcaStatus} /> },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
