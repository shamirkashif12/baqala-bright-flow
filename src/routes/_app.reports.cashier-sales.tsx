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
import { api, type CashierSalesReport, type CashierSalesRow, type ReportExportFormat, type Terminal, type User } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Trophy, Wallet, RotateCcw, Ban } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/reports/cashier-sales")({ component: CashierSales });

const VARIANCE_THRESHOLD = 50; // SAR — rows above this are flagged, matching the FRD's example threshold

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CashierSales() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [terminalId, setTerminalId] = useState("all");
  const [cashierId, setCashierId] = useState("all");
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [cashiers, setCashiers] = useState<User[]>([]);
  const [data, setData] = useState<CashierSalesReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getTerminals({ branchId: branchId !== "all" ? branchId : undefined }).then(setTerminals).catch(() => {});
    api.getUsers({ branchId: branchId !== "all" ? branchId : undefined }).then((u) => setCashiers(u.filter((x) => x.status === "active" && x.roleName === "Cashier"))).catch(() => {});
    setTerminalId("all");
    setCashierId("all");
  }, [branchId]);

  const load = useCallback(() => {
    setLoading(true);
    api.getCashierSalesReport({
      from, to, branchId: branchId !== "all" ? branchId : undefined,
      terminalId: terminalId !== "all" ? terminalId : undefined, cashierId: cashierId !== "all" ? cashierId : undefined,
    })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, branchId, terminalId, cashierId]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportCashierSalesReport({
        from, to, branchId: branchId !== "all" ? branchId : undefined,
        terminalId: terminalId !== "all" ? terminalId : undefined, cashierId: cashierId !== "all" ? cashierId : undefined,
        exportedBy: user?.id, format,
      });
      downloadBlob(blob, `cashier-sales-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const chartData = (data?.rows ?? []).slice(0, 10).map((r) => ({ name: r.cashierName, sales: r.netSales }));
  const isHighVariance = (r: CashierSalesRow) => Math.abs(r.variance ?? 0) > VARIANCE_THRESHOLD;

  return (
    <PageShell
      title="Cashier Sales"
      subtitle="Cashier-level shift performance, cash variance and productivity"
    >
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
        <Select value={cashierId} onValueChange={setCashierId}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Cashier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cashiers</SelectItem>
            {cashiers.map((c) => <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Top Cashier" value={kpis?.topCashier ?? "—"} icon={Trophy} accent="primary" />
        <MetricCard label="Total Sales" value={<><SARIcon />{fmt(kpis?.totalSales ?? 0)}</>} icon={Wallet} />
        <MetricCard label="Cash Variance" value={<><SARIcon />{fmt(kpis?.cashVariance ?? 0)}</>} icon={Wallet} accent={Math.abs(kpis?.cashVariance ?? 0) > VARIANCE_THRESHOLD ? "destructive" : "default"} />
        <MetricCard label="Returns" value={String(kpis?.returnCount ?? 0)} icon={RotateCcw} accent="warning" />
        <MetricCard label="Voids" value={String(kpis?.voidCount ?? 0)} icon={Ban} accent="destructive" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Top Cashiers by Net Sales</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis type="number" fontSize={11} />
            <YAxis type="category" dataKey="name" fontSize={11} width={120} />
            <Tooltip formatter={(v: number) => fmtSAR(v)} />
            <Bar dataKey="sales" fill="var(--primary)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "cashierName", label: "Cashier" },
            { key: "branch", label: "Branch" },
            { key: "terminal", label: "Terminal" },
            { key: "shiftStart", label: "Shift Start", render: (r: CashierSalesRow) => new Date(r.shiftStart).toLocaleString("en-SA", { dateStyle: "short", timeStyle: "short" }) },
            { key: "shiftEnd", label: "Shift End", render: (r: CashierSalesRow) => r.shiftEnd ? new Date(r.shiftEnd).toLocaleString("en-SA", { dateStyle: "short", timeStyle: "short" }) : "Open" },
            { key: "transactions", label: "Txns" },
            { key: "grossSales", label: "Gross Sales", render: (r: CashierSalesRow) => <><SARIcon />{fmt(r.grossSales)}</> },
            { key: "discounts", label: "Discounts", render: (r: CashierSalesRow) => <><SARIcon />{fmt(r.discounts)}</> },
            { key: "returns", label: "Returns", render: (r: CashierSalesRow) => <><SARIcon />{fmt(r.returns)}</> },
            { key: "netSales", label: "Net Sales", render: (r: CashierSalesRow) => <span className="font-semibold"><SARIcon />{fmt(r.netSales)}</span> },
            { key: "voids", label: "Voids" },
            { key: "cashExpected", label: "Cash Expected", render: (r: CashierSalesRow) => <><SARIcon />{fmt(r.cashExpected)}</> },
            { key: "cashCounted", label: "Cash Counted", render: (r: CashierSalesRow) => (r.cashCounted != null ? <><SARIcon />{fmt(r.cashCounted)}</> : "—") },
            {
              key: "variance", label: "Variance",
              render: (r: CashierSalesRow) => (
                <span className={cn("font-semibold", isHighVariance(r) && "text-destructive")}>
                  <SARIcon />{fmt(r.variance ?? 0)}
                </span>
              ),
            },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
