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
import { api, type AuditLog, type AuditTrailReport as AuditTrailData, type AuditTrailRow, type Product, type ReportExportFormat, type User } from "@/lib/api";
import { useBranch } from "@/lib/branch-context";
import { downloadBlob } from "@/lib/csv-export";
import { describeChanges } from "@/lib/audit-changes";
import { toast } from "sonner";
import { ShieldAlert, KeyRound, Wrench, Settings, Download, ArrowRight } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";

export const Route = createFileRoute("/_app/reports/audit-trail")({ component: AuditTrail });

const SEVERITY_COLORS: Record<string, string> = { info: "var(--primary)", warning: "var(--warning)", critical: "var(--destructive)" };

/**
 * The Before/After columns used to dump the stored JSON snapshot straight into the cell, which is
 * unreadable for the order rows that carry a full `Items[]` payload. The same diff the Employee
 * Audit Center uses is applied here instead, so a reviewer sees "Discount: SAR 0.00 → SAR 1.00"
 * rather than a wall of braces.
 *
 * Not every row carries JSON: masked rows store "***masked***", and several actions (shift close,
 * branch created) store a plain sentence. Both fall through to being rendered verbatim, which is
 * already readable — only the JSON rows needed help.
 */
function ChangesCell({ row, productName }: { row: AuditTrailRow; productName: (id: string) => string }) {
  const changes = describeChanges(
    { oldValues: row.beforeValue, newValues: row.afterValue } as AuditLog,
    productName,
  );

  if (changes.length === 0) {
    const raw = [row.beforeValue, row.afterValue].filter(Boolean).join(" → ");
    if (!raw) return <span className="text-muted-foreground">—</span>;
    return <span className="block max-w-[280px] whitespace-normal break-words text-xs">{raw}</span>;
  }

  return (
    <div className="max-w-[320px] space-y-1">
      {changes.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1 text-[11px]">
          <span className="font-medium text-muted-foreground">{c.label}</span>
          <span className="font-mono text-muted-foreground line-through">{c.before ?? "—"}</span>
          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
          <span className="font-mono font-medium text-foreground">{c.after ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}

function sevenDaysAgoStr() {
  return new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function AuditTrail() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [from, setFrom] = useState(sevenDaysAgoStr());
  const [to, setTo] = useState(todayStr());
  const [severity, setSeverity] = useState("all");
  const [module, setModule] = useState("all");
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [userId, setUserId] = useState("all");
  const [users, setUsers] = useState<User[]>([]);
  const [data, setData] = useState<AuditTrailData | null>(null);
  const [loading, setLoading] = useState(true);
  // Order snapshots reference products by id only, so the diff needs a name lookup to render
  // "Item added — Laban 1L" instead of a truncated GUID. Loaded once, not per filter change.
  const [productMap, setProductMap] = useState<Map<string, Product>>(new Map());

  useEffect(() => { api.getUsers({ branchId: branchId !== "all" ? branchId : undefined }).then(setUsers).catch(() => {}); }, [branchId]);
  useEffect(() => { api.getProducts().then((p) => setProductMap(new Map(p.map((x) => [x.id, x])))).catch(() => {}); }, []);

  const productName = useCallback((id: string) => productMap.get(id)?.name ?? `${id.slice(0, 8)}…`, [productMap]);

  const load = useCallback(() => {
    setLoading(true);
    api.getAuditTrailReport({
      from, to, severity: severity !== "all" ? severity : undefined, module: module !== "all" ? module : undefined,
      branchId: branchId !== "all" ? branchId : undefined, userId: userId !== "all" ? userId : undefined,
    })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, severity, module, branchId, userId]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportAuditTrailReport({
        from, to, severity: severity !== "all" ? severity : undefined, module: module !== "all" ? module : undefined,
        branchId: branchId !== "all" ? branchId : undefined, userId: userId !== "all" ? userId : undefined,
        exportedBy: user?.id, format,
      });
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
            {/* These are matched verbatim against audit_logs.entity_type, so every option must be
                a string some controller actually writes. "ZatcaSettings" and "TaxFeeRule" were
                listed here but are written by nothing, while six real modules — CashierShift and
                Product among them — had no option at all and were unfilterable. */}
            <SelectItem value="Order">Order</SelectItem>
            <SelectItem value="Product">Product</SelectItem>
            <SelectItem value="InventoryAdjustment">Inventory Adjustment</SelectItem>
            <SelectItem value="InventoryBatch">Stock Received</SelectItem>
            <SelectItem value="StockCount">Stock Count</SelectItem>
            <SelectItem value="CustomerReturn">Return / Refund</SelectItem>
            <SelectItem value="CashierShift">Cashier Shift</SelectItem>
            <SelectItem value="User">User</SelectItem>
            <SelectItem value="Branch">Branch</SelectItem>
            <SelectItem value="PosSettings">POS Settings</SelectItem>
            <SelectItem value="ZatcaInvoice">ZATCA Invoice</SelectItem>
            <SelectItem value="Report">Report Export</SelectItem>
          </SelectContent>
        </Select>
        {!lockedBranchId && (
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Branch" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Employee" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
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
            { key: "beforeValue", label: "Changes", render: (r: AuditTrailRow) => <ChangesCell row={r} productName={productName} /> },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
