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
import { api, type LoyaltyReportResult, type LoyaltyReportRow, type ReportExportFormat } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Star, Gift, Users, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

export const Route = createFileRoute("/_app/reports/loyalty")({ component: LoyaltyReport });

const TIER_COLORS: Record<string, string> = {
  standard: "var(--muted-foreground)", silver: "#94a3b8", gold: "#eab308", platinum: "#a855f7",
};

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function LoyaltyReport() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [data, setData] = useState<LoyaltyReportResult | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.getLoyaltyReport({ from, to, branchId: branchId !== "all" ? branchId : undefined })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, branchId]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportLoyaltyReport({ from, to, branchId: branchId !== "all" ? branchId : undefined, exportedBy: user?.id, format });
      downloadBlob(blob, `loyalty-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const tierPieData = (data?.tierBreakdown ?? []).map((t) => ({ name: t.tier, value: t.members }));

  return (
    <PageShell title="Loyalty Program Report" subtitle="Points earned, redeemed and expired by branch">
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Points Earned" value={(kpis?.totalPointsEarned ?? 0).toLocaleString()} icon={ArrowUpCircle} accent="success" />
        <MetricCard label="Points Redeemed" value={(kpis?.totalPointsRedeemed ?? 0).toLocaleString()} icon={ArrowDownCircle} accent="warning" />
        <MetricCard label="Points Expired" value={(kpis?.totalPointsExpired ?? 0).toLocaleString()} icon={Star} accent="destructive" />
        <MetricCard label="Redemption Value" value={<><SARIcon />{fmt(kpis?.totalRedemptionValue ?? 0)}</>} icon={Gift} accent="primary" />
        <MetricCard label="Active Members" value={String(kpis?.totalActiveMembers ?? 0)} icon={Users} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6 border-border/60 shadow-card">
          <h3 className="font-semibold mb-4">Active Members by Tier</h3>
          {tierPieData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">No loyalty activity in this period.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={tierPieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
                  {tierPieData.map((d) => <Cell key={d.name} fill={TIER_COLORS[d.name] ?? "var(--muted-foreground)"} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-6 border-border/60 shadow-card">
          <h3 className="font-semibold mb-4">Tier Breakdown</h3>
          <div className="space-y-2">
            {(data?.tierBreakdown ?? []).map((t) => (
              <div key={t.tier} className="flex items-center justify-between text-sm py-1.5 border-b border-border/40 last:border-0">
                <span className="capitalize font-medium">{t.tier}</span>
                <span className="text-muted-foreground">{t.members} members</span>
                <span className="tabular-nums font-semibold">{t.totalBalance.toLocaleString()} pts</span>
              </div>
            ))}
            {(data?.tierBreakdown ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">No loyalty activity in this period.</p>
            )}
          </div>
        </Card>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "branchName", label: "Branch" },
            { key: "pointsEarned", label: "Points Earned", render: (r: LoyaltyReportRow) => r.pointsEarned.toLocaleString() },
            { key: "pointsRedeemed", label: "Points Redeemed", render: (r: LoyaltyReportRow) => r.pointsRedeemed.toLocaleString() },
            { key: "pointsExpired", label: "Points Expired", render: (r: LoyaltyReportRow) => r.pointsExpired.toLocaleString() },
            { key: "redemptionValue", label: "Redemption Value", render: (r: LoyaltyReportRow) => <span className="font-semibold"><SARIcon />{fmt(r.redemptionValue)}</span> },
            { key: "activeMembers", label: "Active Members" },
          ]}
          rows={data?.byBranch ?? []}
        />
      )}
    </PageShell>
  );
}
