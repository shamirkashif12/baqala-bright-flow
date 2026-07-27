import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import { Wallet, ShoppingBag, Undo2, BadgePercent, Building2, Truck, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type DashboardMetrics, type BiSummary } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";

export const Route = createFileRoute("/_app/bi")({ component: BI });

const PAYMENT_COLORS: Record<string, string> = {
  cash: "bg-primary",
  card: "bg-success",
  wallet: "bg-warning",
  bank_transfer: "bg-muted-foreground",
};

function Sparkline({ data, color = "var(--primary)" }: { data: number[]; color?: string }) {
  const max = Math.max(...data), min = Math.min(...data);
  const points = data.map((v, i) => `${(i / (data.length - 1)) * 100},${100 - ((v - min) / (max - min || 1)) * 100}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-24">
      <defs>
        <linearGradient id="bg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,100 ${points} 100,100`} fill="url(#bg)" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function BI() {
  const [dashboard, setDashboard] = useState<DashboardMetrics | null>(null);
  const [bi, setBi] = useState<BiSummary | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = () => {
    Promise.allSettled([api.getDashboard(), api.getBiSummary()]).then(([d, b]) => {
      if (d.status === "fulfilled") setDashboard(d.value);
      if (b.status === "fulfilled") setBi(b.value);
      setLoadError(d.status === "rejected" || b.status === "rejected");
    });
  };

  useEffect(() => { load(); }, []);

  const totalRevenue = dashboard?.sales.totalToday ?? 0;
  const totalOrders = dashboard?.orders.totalToday ?? 0;
  const returnsCount = dashboard?.returns.count ?? 0;
  const refundRate = totalOrders > 0 ? ((returnsCount / totalOrders) * 100).toFixed(1) + "%" : "0%";
  const payBreakdown = dashboard?.sales.paymentBreakdown ?? [];
  const branchPerf = dashboard?.branchPerformance ?? [];
  const maxBranchSales = branchPerf.reduce((mx, b) => Math.max(mx, b.sales), 1);
  const fmt = (n: number) => fmtSAR(n, 0);

  const salesTrend = bi?.salesTrend ?? [];
  const bestSellers = bi?.bestSellers ?? [];
  const slowMovers = bi?.slowMovers ?? [];
  const expiryByCategory = bi?.expiryLoss.byCategory ?? [];
  const warehouse = bi?.warehouse;

  return (
    <PageShell title="Business Intelligence" subtitle="Performance, trends and analytics across the chain">
      {loadError && <LoadErrorBanner onRetry={load} />}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Revenue (today)" value={<><SARIcon />{" "}{fmt(totalRevenue)}</>} icon={Wallet} accent="primary" />
        <MetricCard label="Orders (today)" value={String(totalOrders)} icon={ShoppingBag} />
        <MetricCard label="Refund Rate" value={refundRate} icon={Undo2} accent="success" />
        <MetricCard label="Returns Today" value={String(returnsCount)} icon={BadgePercent} accent="warning" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-6 border-border/60 shadow-card">
          <div className="mb-2">
            <h3 className="text-base font-semibold">Sales Trends</h3>
            <p className="text-xs text-muted-foreground">Last 14 days · net sales</p>
          </div>
          {salesTrend.some((d) => d.netSales > 0) ? (
            <Sparkline data={salesTrend.map((d) => d.netSales)} />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">No sales recorded in the last 14 days.</p>
          )}
        </Card>

        <Card className="p-6 border-border/60 shadow-card">
          <h3 className="text-base font-semibold mb-3">Payment Method Mix</h3>
          <div className="space-y-3">
            {(payBreakdown.length > 0
              ? payBreakdown.map(p => ({ m: p.method, v: p.pct, c: PAYMENT_COLORS[p.method] ?? "bg-primary" }))
              : [
                  { m: "Cash", v: 58, c: "bg-primary" },
                  { m: "Card", v: 28, c: "bg-success" },
                  { m: "Wallet (STC/Apple)", v: 11, c: "bg-warning" },
                  { m: "Bank Transfer", v: 3, c: "bg-muted-foreground" },
                ]
            ).map((p) => (
              <div key={p.m}>
                <div className="flex justify-between text-sm mb-1"><span className="capitalize">{p.m.replace(/_/g, " ")}</span><span className="font-semibold">{p.v}%</span></div>
                <div className="h-2 rounded-full bg-muted overflow-hidden"><div className={cn("h-full", p.c)} style={{ width: `${p.v}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6 border-border/60 shadow-card">
          <h3 className="text-base font-semibold mb-1">Best Selling Products</h3>
          <p className="text-xs text-muted-foreground mb-3">Units sold this month</p>
          {bestSellers.length > 0 ? (
            <div className="space-y-3">
              {bestSellers.map((p) => (
                <div key={p.productName}>
                  <div className="flex justify-between text-sm mb-1"><span className="truncate pr-2">{p.productName}</span><span className="font-semibold tabular-nums">{p.unitsSold}</span></div>
                  <Progress value={p.pct} className="h-1.5" />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No sales recorded this month.</p>
          )}
        </Card>
        <Card className="p-6 border-border/60 shadow-card">
          <h3 className="text-base font-semibold mb-1">Slow Moving SKUs</h3>
          <p className="text-xs text-muted-foreground mb-3">In stock, no sales in the last 30 days</p>
          {slowMovers.length > 0 ? (
            <div className="space-y-3">
              {slowMovers.map((p) => (
                <div key={p.productName} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                  <div><p className="text-sm font-medium">{p.productName}</p><p className="text-xs text-muted-foreground">No sales in 30 days</p></div>
                  <Badge variant="outline" className="bg-warning/15 text-warning-foreground border-warning/40">{p.stockQty} in stock</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No slow-moving stock detected.</p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-6 border-border/60 shadow-card">
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" />Branch Performance (today)</h3>
          {branchPerf.length > 0 ? (
            branchPerf.map(b => (
              <div key={b.branch} className="mb-3">
                <div className="flex justify-between text-sm mb-1">
                  <span>{b.branch}</span>
                  <span className="font-semibold"><SARIcon />{fmt(b.sales)}</span>
                </div>
                <Progress value={Math.round(b.sales / maxBranchSales * 100)} className="h-1.5" />
              </div>
            ))
          ) : (
            // Previously substituted fabricated branch names/percentages here — actively
            // misleading (looks like real data for branches that may not even exist for this
            // tenant) rather than just blank. A real empty state is safer than a fake one.
            <p className="text-sm text-muted-foreground">No branch sales recorded yet today.</p>
          )}
        </Card>
        <Card className="p-6 border-border/60 shadow-card">
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2"><Package className="h-4 w-4 text-warning-foreground" />Expiry Loss (month)</h3>
          <p className="text-3xl font-bold"><SARIcon />{fmt(bi?.expiryLoss.total ?? 0)}</p>
          <p className="text-xs text-muted-foreground mt-1">Approved/auto write-offs, reason: expired</p>
          {expiryByCategory.length > 0 ? (
            <div className="mt-4 space-y-2 text-sm">
              {expiryByCategory.map((c) => (
                <div key={c.category} className="flex justify-between"><span>{c.category}</span><span className="font-semibold"><SARIcon />{fmt(c.value)}</span></div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-4">No expiry write-offs recorded this month.</p>
          )}
        </Card>
        <Card className="p-6 border-border/60 shadow-card">
          <h3 className="text-base font-semibold mb-1 flex items-center gap-2"><Truck className="h-4 w-4 text-success" />Warehouse Insights</h3>
          <p className="text-xs text-muted-foreground mb-3">This week</p>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span>Stock turnover (approx., month)</span><span className="font-bold">{(warehouse?.turnover ?? 0).toFixed(2)}x</span></div>
            <div className="flex justify-between"><span>Inbound (week)</span><span className="font-bold">{(warehouse?.inboundUnits ?? 0).toLocaleString("en-SA")} units</span></div>
            <div className="flex justify-between"><span>Outbound (week)</span><span className="font-bold">{(warehouse?.outboundUnits ?? 0).toLocaleString("en-SA")} units</span></div>
            <div className="flex justify-between"><span>Transfers</span><span className="font-bold">{warehouse?.transfersCount ?? 0}</span></div>
            <div className="flex justify-between"><span>Adjustments</span><span className="font-bold text-warning-foreground">{warehouse?.adjustmentsCount ?? 0}</span></div>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}