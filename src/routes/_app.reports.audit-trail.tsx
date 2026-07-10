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
import { api, type AuditTrailReport as AuditTrailData, type AuditTrailRow, type ReportExportFormat } from "@/lib/api";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { ShieldAlert, KeyRound, Wrench, Settings, Download } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";

export const Route = createFileRoute("/_app/reports/audit-trail")({ component: AuditTrail });

const SEVERITY_COLORS: Record<string, string> = { info: "var(--primary)", warning: "var(--warning)", critical: "var(--destructive)" };

function sevenDaysAgoStr() {
  return new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function AuditTrail() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");

  const [from, setFrom] = useState(sevenDaysAgoStr());
  const [to, setTo] = useState(todayStr());
  const [severity, setSeverity] = useState("all");
  const [module, setModule] = useState("all");
  const [data, setData] = useState<AuditTrailData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.getAuditTrailReport({ from, to, severity: severity !== "all" ? severity : undefined, module: module !== "all" ? module : undefined })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, severity, module]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportAuditTrailReport({ from, to, severity: severity !== "all" ? severity : undefined, module: module !== "all" ? module : undefined, exportedBy: user?.id, format });
      downloadBlob(blob, `audit-trail-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const severityCounts = ["info", "warning", "critical"].map((s) => ({
    severity: s, count: (data?.rows ?? []).filter((r) => r.severity === s).length,
  })).filter((s) => s.count > 0);

  return (
    <PageShell title="Audit Trail Report" subtitle="Read-only log of critical system events and changes">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        </div>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Severity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <Select value={module} onValueChange={setModule}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Module" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Modules</SelectItem>
            <SelectItem value="Report">Report</SelectItem>
            <SelectItem value="Order">Order</SelectItem>
            <SelectItem value="User">User</SelectItem>
            <SelectItem value="ZatcaSettings">ZATCA Settings</SelectItem>
            <SelectItem value="TaxFeeRule">Tax/Fee Rule</SelectItem>
            <SelectItem value="InventoryAdjustment">Inventory Adjustment</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Critical Events" value={String(kpis?.criticalEvents ?? 0)} icon={ShieldAlert} accent="destructive" />
        <MetricCard label="Failed Logins" value={String(kpis?.failedLogins ?? 0)} icon={KeyRound} accent="warning" />
        <MetricCard label="Override Count" value={String(kpis?.overrideCount ?? 0)} icon={Wrench} />
        <MetricCard label="Configuration Changes" value={String(kpis?.configurationChanges ?? 0)} icon={Settings} />
        <MetricCard label="Exports Generated" value={String(kpis?.exportsGenerated ?? 0)} icon={Download} accent="primary" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Events by Severity</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={severityCounts}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="severity" fontSize={11} className="capitalize" />
            <YAxis fontSize={11} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {severityCounts.map((s) => <Cell key={s.severity} fill={SEVERITY_COLORS[s.severity]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "eventId", label: "Event ID" },
            { key: "timestamp", label: "Timestamp", render: (r: AuditTrailRow) => new Date(r.timestamp).toLocaleString("en-SA", { dateStyle: "short", timeStyle: "short" }) },
            { key: "severity", label: "Severity", render: (r: AuditTrailRow) => <StatusBadge status={r.severity} /> },
            { key: "module", label: "Module" },
            { key: "action", label: "Action" },
            { key: "user", label: "User" },
            { key: "role", label: "Role" },
            { key: "branch", label: "Branch" },
            { key: "ipAddress", label: "IP Address" },
            { key: "beforeValue", label: "Before Value", render: (r: AuditTrailRow) => <span className="block max-w-[220px] whitespace-normal break-words font-mono text-xs">{r.beforeValue ?? "—"}</span> },
            { key: "afterValue", label: "After Value", render: (r: AuditTrailRow) => <span className="block max-w-[220px] whitespace-normal break-words font-mono text-xs">{r.afterValue ?? "—"}</span> },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
