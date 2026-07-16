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
import { api, type TerminalReport as TerminalReportData, type TerminalReportRow, type ReportExportFormat, type Terminal } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { ShoppingCart, WifiOff, Wallet, Gauge } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_app/reports/terminal")({ component: TerminalReportPage });

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function TerminalReportPage() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [terminalId, setTerminalId] = useState("all");
  const [status, setStatus] = useState("all");
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [data, setData] = useState<TerminalReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getTerminals({ branchId: branchId !== "all" ? branchId : undefined }).then(setTerminals).catch(() => {});
    setTerminalId("all");
  }, [branchId]);

  const load = useCallback(() => {
    setLoading(true);
    api.getTerminalReport({
      from, to, branchId: branchId !== "all" ? branchId : undefined,
      terminalId: terminalId !== "all" ? terminalId : undefined, status: status !== "all" ? status : undefined,
    })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, branchId, terminalId, status]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportTerminalReport({
        from, to, branchId: branchId !== "all" ? branchId : undefined,
        terminalId: terminalId !== "all" ? terminalId : undefined, status: status !== "all" ? status : undefined,
        exportedBy: user?.id, format,
      });
      downloadBlob(blob, `terminal-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const chartData = (data?.rows ?? []).slice(0, 10).map((r) => ({ name: r.terminalName, sales: r.netSales }));

  return (
    <PageShell title="Terminal Report" subtitle="Per-terminal sales, uptime and sync health">
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
        <Select value={terminalId} onValueChange={setTerminalId}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Terminal" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Terminals</SelectItem>
            {terminals.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
            <SelectItem value="syncing">Syncing</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active Terminals" value={String(kpis?.activeTerminals ?? 0)} icon={ShoppingCart} accent="success" />
        <MetricCard label="Offline Terminals" value={String(kpis?.offlineTerminals ?? 0)} icon={WifiOff} accent="destructive" />
        <MetricCard label="Terminal Sales" value={<><SARIcon />{fmt(kpis?.terminalSales ?? 0)}</>} icon={Wallet} accent="primary" />
        <MetricCard label="Avg Uptime %" value={`${kpis?.avgUptimePct ?? 0}%`} icon={Gauge} />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Net Sales by Terminal</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip formatter={(v: number) => fmtSAR(v)} />
            <Bar dataKey="sales" fill="var(--primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "terminalId", label: "Terminal ID" },
            { key: "terminalName", label: "Terminal Name" },
            { key: "branch", label: "Branch" },
            { key: "status", label: "Status", render: (r: TerminalReportRow) => <StatusBadge status={r.status} /> },
            { key: "assignedCashier", label: "Assigned Cashier" },
            { key: "transactions", label: "Txns" },
            { key: "netSales", label: "Net Sales", render: (r: TerminalReportRow) => <span className="font-semibold"><SARIcon />{fmt(r.netSales)}</span> },
            { key: "refunds", label: "Refunds", render: (r: TerminalReportRow) => <><SARIcon />{fmt(r.refunds)}</> },
            { key: "uptimePct", label: "Uptime %", render: (r: TerminalReportRow) => `${r.uptimePct}%` },
            { key: "lastSyncTime", label: "Last Sync", render: (r: TerminalReportRow) => (r.lastSyncTime ? new Date(r.lastSyncTime).toLocaleString("en-SA", { dateStyle: "short", timeStyle: "short" }) : "—") },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
