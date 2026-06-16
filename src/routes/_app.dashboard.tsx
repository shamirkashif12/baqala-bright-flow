import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DollarSign, Users, Monitor, RefreshCw,
  AlertTriangle, Clock, CheckCircle, TrendingUp, TrendingDown,
} from "lucide-react";
import { api, type DashboardMetrics } from "@/lib/api";

export const Route = createFileRoute("/_app/dashboard")({ component: Dashboard });

interface MetricCardDef {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent?: "primary" | "success" | "warning" | "destructive";
}

function buildCards(data: DashboardMetrics): MetricCardDef[] {
  return [
    { label: "Pending Orders", value: String(data.orders.pending ?? 0), sub: `${data.orders.processing ?? 0} processing`, icon: Clock },
    { label: "Ready to Deliver", value: String(data.orders.readyToDeliver ?? 0), sub: `${data.orders.delivered ?? 0} delivered today`, icon: CheckCircle, accent: "success" },
    { label: "Today's Revenue", value: `SAR ${(data.sales.totalToday ?? 0).toLocaleString("en-SA", { minimumFractionDigits: 2 })}`, icon: DollarSign, accent: "primary" },
    { label: "Active Cashiers", value: String(data.shifts.active ?? 0), sub: `of ${data.shifts.totalCashiers ?? 0} total`, icon: Users },
    { label: "Active Terminals", value: String(data.terminals.active ?? 0), sub: `of ${data.terminals.total ?? 0} total`, icon: Monitor },
    { label: "Low Stock Items", value: String(data.inventory.lowStockCount ?? 0), sub: `${data.inventory.expiringCount ?? 0} expiring soon`, icon: AlertTriangle, accent: "warning" },
  ];
}

const FALLBACK_CARDS: MetricCardDef[] = [
  { label: "Pending Orders", value: "—", icon: Clock },
  { label: "Ready to Deliver", value: "—", icon: CheckCircle },
  { label: "Today's Revenue", value: "SAR —", icon: DollarSign, accent: "primary" },
  { label: "Active Cashiers", value: "—", icon: Users },
  { label: "Active Terminals", value: "—", icon: Monitor },
  { label: "Low Stock Items", value: "—", icon: AlertTriangle, accent: "warning" },
];

function PayRow({ label, value, pct }: { label: string; value: number; pct: number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm min-w-[80px]">{label}</span>
      <div className="flex items-center gap-3 flex-1">
        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums w-14 text-right">{pct.toFixed(1)}%</span>
        <span className="text-xs font-semibold tabular-nums w-24 text-right">SAR {value.toLocaleString("en-SA", { minimumFractionDigits: 2 })}</span>
      </div>
    </div>
  );
}

function Dashboard() {
  const [dashData, setDashData] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState("today");
  const [day, setDay] = useState("mon");
  const [branch, setBranch] = useState("all");

  useEffect(() => {
    setLoading(true);
    api.getDashboard({ period, branch: branch === "all" ? undefined : branch })
      .then(setDashData)
      .finally(() => setLoading(false));
  }, [period, branch]);

  const cards = dashData ? buildCards(dashData) : FALLBACK_CARDS;
  const payBreakdown = dashData?.sales.paymentBreakdown ?? [];
  const totalPay = payBreakdown.reduce((s, p) => s + p.amount, 0);
  const cashierPerf = dashData?.cashierPerformance ?? [];
  const branchPerf = dashData?.branchPerformance ?? [];

  return (
    <PageShell title="Dashboard" subtitle="Live snapshot across all branches">
      {/* Filter bar */}
      <Card className="p-4 border-border/60 shadow-card">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
          </Select>
          <Select value={day} onValueChange={setDay}>
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["mon","tue","wed","thu","fri","sat","sun"].map(d => (
                <SelectItem key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              <SelectItem value="riyadh">Riyadh</SelectItem>
              <SelectItem value="jeddah">Jeddah</SelectItem>
              <SelectItem value="dammam">Dammam</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* KPI cards */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <MetricCard key={c.label} label={c.label} value={c.value} sub={c.sub} icon={c.icon} accent={c.accent} />
          ))}
        </div>
      )}

      {/* Bottom rows */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1 border-border/60 shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><DollarSign className="h-4 w-4 text-primary" />Payment Breakdown</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)
            ) : payBreakdown.length > 0 ? (
              payBreakdown.map(p => (
                <PayRow key={p.method} label={p.method} value={p.amount} pct={totalPay > 0 ? (p.amount / totalPay) * 100 : 0} />
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No payment data available.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-primary" />Cashier Performance</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full mb-2" />)
            ) : cashierPerf.length > 0 ? (
              <div className="space-y-2">
                {cashierPerf.slice(0, 5).map((c) => (
                  <div key={c.cashierId} className="flex items-center justify-between text-sm">
                    <span className="truncate max-w-[140px]">{c.fullName}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{c.orderCount} orders</span>
                      <span className="font-semibold text-xs tabular-nums">SAR {c.totalSales.toLocaleString("en-SA", { maximumFractionDigits: 0 })}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No cashier data available.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" />Branch Performance</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full mb-2" />)
            ) : branchPerf.length > 0 ? (
              <div className="space-y-2">
                {branchPerf.map((b) => (
                  <div key={b.branchId} className="flex items-center justify-between text-sm">
                    <span className="truncate max-w-[140px]">{b.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{b.orderCount} orders</span>
                      <span className="font-semibold text-xs tabular-nums">SAR {b.totalSales.toLocaleString("en-SA", { maximumFractionDigits: 0 })}</span>
                      {b.growth != null && (
                        <span className={`text-xs flex items-center gap-0.5 ${b.growth >= 0 ? "text-success" : "text-destructive"}`}>
                          {b.growth >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {Math.abs(b.growth).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No branch data available.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {dashData?.returns && (
        <Card className="border-border/60 shadow-card">
          <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold flex items-center gap-2"><RefreshCw className="h-4 w-4 text-warning" />Returns Summary</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-6 text-sm">
              <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Count</p><p className="text-xl font-bold">{dashData.returns.count ?? 0}</p></div>
              <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Refunded</p><p className="text-xl font-bold">SAR {(dashData.returns.refundedAmount ?? 0).toLocaleString("en-SA", { minimumFractionDigits: 2 })}</p></div>
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
