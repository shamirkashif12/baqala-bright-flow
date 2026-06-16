import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import { TrendingUp, Wallet, ShoppingBag, Undo2, BadgePercent, Building2, Truck, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type DashboardMetrics } from "@/lib/api";

export const Route = createFileRoute("/_app/bi")({ component: BI });

const trend = [12, 18, 16, 22, 28, 24, 30, 26, 34, 32, 40, 38, 44, 48];

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

  useEffect(() => {
    api.getDashboard().then(setDashboard).catch(console.error);
  }, []);

  const totalRevenue = dashboard?.sales.totalToday ?? 0;
  const totalOrders = dashboard?.orders.totalToday ?? 0;
  const returnsCount = dashboard?.returns.count ?? 0;
  const refundRate = totalOrders > 0 ? ((returnsCount / totalOrders) * 100).toFixed(1) + "%" : "0%";
  const payBreakdown = dashboard?.sales.paymentBreakdown ?? [];
  const branchPerf = dashboard?.branchPerformance ?? [];
  const maxBranchSales = branchPerf.reduce((mx, b) => Math.max(mx, b.sales), 1);
  const fmt = (n: number) => `ر.س ${n.toLocaleString("en-SA", { minimumFractionDigits: 0 })}`;

  return (
    <PageShell title="Business Intelligence" subtitle="Performance, trends and analytics across the chain">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Revenue (today)" value={fmt(totalRevenue)} icon={Wallet} accent="primary" />
        <MetricCard label="Orders (today)" value={String(totalOrders)} icon={ShoppingBag} />
        <MetricCard label="Refund Rate" value={refundRate} icon={Undo2} accent="success" />
        <MetricCard label="Returns Today" value={String(returnsCount)} icon={BadgePercent} accent="warning" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-6 border-border/60 shadow-card">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-base font-semibold">Sales Trends</h3>
              <p className="text-xs text-muted-foreground">Last 14 days · all branches</p>
            </div>
            <Badge className="bg-success/15 text-success border-success/30" variant="outline"><TrendingUp className="h-3 w-3 mr-1" />+18% WoW</Badge>
          </div>
          <Sparkline data={trend} />
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
          <h3 className="text-base font-semibold mb-3">Best Selling Products</h3>
          <div className="space-y-3">
            {[
              { n: "Almarai Laban 1L", u: 1842, pct: 92 },
              { n: "Nadec Milk 2L", u: 1240, pct: 78 },
              { n: "Sadia Chicken 1kg", u: 920, pct: 60 },
              { n: "Lipton Tea 100 Bags", u: 740, pct: 50 },
              { n: "Pepsi 330ml Can", u: 620, pct: 42 },
            ].map((p) => (
              <div key={p.n}>
                <div className="flex justify-between text-sm mb-1"><span className="truncate pr-2">{p.n}</span><span className="font-semibold tabular-nums">{p.u}</span></div>
                <Progress value={p.pct} className="h-1.5" />
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-6 border-border/60 shadow-card">
          <h3 className="text-base font-semibold mb-3">Slow Moving SKUs</h3>
          <div className="space-y-3">
            {[
              { n: "Tide Detergent 3kg", u: 14, age: "42d" },
              { n: "Imported Olive Oil 2L", u: 8, age: "61d" },
              { n: "Saffron 5g Premium", u: 3, age: "88d" },
              { n: "Korean Noodles Pack", u: 6, age: "55d" },
            ].map((p) => (
              <div key={p.n} className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                <div><p className="text-sm font-medium">{p.n}</p><p className="text-xs text-muted-foreground">No movement in {p.age}</p></div>
                <Badge variant="outline" className="bg-warning/15 text-warning-foreground border-warning/40">{p.u} sold/mo</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-6 border-border/60 shadow-card">
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" />Branch Performance (today)</h3>
          {(branchPerf.length > 0
            ? branchPerf
            : [{ branch: "Olaya", orders: 0, sales: 92 }, { branch: "Khobar", orders: 0, sales: 85 }, { branch: "Jeddah", orders: 0, sales: 80 }, { branch: "Madinah", orders: 0, sales: 68 }]
          ).map(b => (
            <div key={b.branch} className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <span>{b.branch}</span>
                <span className="font-semibold">{branchPerf.length > 0 ? fmt(b.sales) : `${b.sales}%`}</span>
              </div>
              <Progress value={Math.round(b.sales / maxBranchSales * 100)} className="h-1.5" />
            </div>
          ))}
        </Card>
        <Card className="p-6 border-border/60 shadow-card">
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2"><Package className="h-4 w-4 text-warning-foreground" />Expiry Loss (month)</h3>
          <p className="text-3xl font-bold">ر.س 4,820</p>
          <p className="text-xs text-muted-foreground mt-1">From 142 expired SKU units</p>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span>Dairy</span><span className="font-semibold">ر.س 2,180</span></div>
            <div className="flex justify-between"><span>Bakery</span><span className="font-semibold">ر.س 1,420</span></div>
            <div className="flex justify-between"><span>Meat</span><span className="font-semibold">ر.س 920</span></div>
            <div className="flex justify-between"><span>Other</span><span className="font-semibold">ر.س 300</span></div>
          </div>
        </Card>
        <Card className="p-6 border-border/60 shadow-card">
          <h3 className="text-base font-semibold mb-3 flex items-center gap-2"><Truck className="h-4 w-4 text-success" />Warehouse Insights</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span>Stock turnover</span><span className="font-bold">4.2x / mo</span></div>
            <div className="flex justify-between"><span>Inbound (week)</span><span className="font-bold">12,840 units</span></div>
            <div className="flex justify-between"><span>Outbound (week)</span><span className="font-bold">11,920 units</span></div>
            <div className="flex justify-between"><span>Transfers</span><span className="font-bold">38</span></div>
            <div className="flex justify-between"><span>Adjustments</span><span className="font-bold text-warning-foreground">142</span></div>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}