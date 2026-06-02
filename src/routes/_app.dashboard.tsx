import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { MetricCard, StatusDot } from "@/components/metric-card";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Wallet, ShoppingBag, Terminal as TerminalIcon, AlertTriangle, CalendarClock, FileBox, Building2, ReceiptText, MoreHorizontal, ArrowRight, ShieldCheck, Smartphone, Activity, Cpu,
} from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

const sparkData = [12, 18, 14, 22, 30, 26, 34, 28, 40, 36, 48, 52, 46, 58, 64];

function Sparkline({ data, color = "var(--primary)" }: { data: number[]; color?: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const points = data.map((v, i) => `${(i / (data.length - 1)) * 100},${100 - ((v - min) / (max - min || 1)) * 100}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-16">
      <defs>
        <linearGradient id="sg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,100 ${points} 100,100`} fill="url(#sg)" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Dashboard() {
  return (
    <PageShell title="Dashboard" subtitle="Tuesday, June 2 · Live across 4 branches">
      {/* Hero strip */}
      <Card className="relative overflow-hidden border-0 gradient-primary text-primary-foreground p-6 md:p-8 shadow-elegant">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, white 0, transparent 40%), radial-gradient(circle at 80% 60%, white 0, transparent 35%)" }} />
        <div className="relative grid md:grid-cols-3 gap-6 items-end">
          <div className="md:col-span-2">
            <Badge className="bg-white/15 text-primary-foreground border-white/20 backdrop-blur mb-3">
              <ShieldCheck className="h-3 w-3 mr-1" /> ZATCA Phase 2 · Connected
            </Badge>
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight">Good morning, Abdullah 👋</h2>
            <p className="text-primary-foreground/80 mt-2 max-w-xl">Your 4 baqalas have processed <span className="font-semibold text-white">1,284 invoices</span> today — that's 18% above last Tuesday.</p>
          </div>
          <div className="flex gap-3 md:justify-end">
            <Button variant="secondary" className="bg-white text-primary hover:bg-white/90 shadow-lg">Open POS</Button>
            <Button variant="outline" className="bg-white/10 border-white/30 text-primary-foreground hover:bg-white/20">View Reports</Button>
          </div>
        </div>
      </Card>

      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Sales Today" value="ر.س 48,920" delta="+18%" trend="up" hint="vs last Tue" icon={Wallet} accent="primary" />
        <MetricCard label="Orders" value="1,284" delta="+12%" trend="up" hint="3.4 avg/min" icon={ShoppingBag} />
        <MetricCard label="Active Terminals" value="11 / 12" delta="1 offline" trend="down" icon={TerminalIcon} accent="warning" />
        <MetricCard label="Low Stock Items" value="23" delta="6 critical" trend="down" icon={AlertTriangle} accent="destructive" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Sales chart */}
        <Card className="lg:col-span-2 p-6 border-border/60 shadow-card">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold">Sales Performance</h3>
              <p className="text-xs text-muted-foreground">Last 15 days · all branches</p>
            </div>
            <div className="flex gap-1">
              {["Day", "Week", "Month"].map((t, i) => (
                <Button key={t} variant={i === 1 ? "default" : "ghost"} size="sm" className={i === 1 ? "gradient-primary text-primary-foreground border-0" : ""}>{t}</Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div><p className="text-xs text-muted-foreground">Revenue</p><p className="text-xl font-bold">ر.س 312,480</p></div>
            <div><p className="text-xs text-muted-foreground">Profit</p><p className="text-xl font-bold text-success">ر.س 86,210</p></div>
            <div><p className="text-xs text-muted-foreground">VAT Collected</p><p className="text-xl font-bold">ر.س 40,620</p></div>
          </div>
          <Sparkline data={sparkData} />
        </Card>

        {/* Best sellers */}
        <Card className="p-6 border-border/60 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">Best Sellers</h3>
            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
          </div>
          <div className="space-y-3">
            {[
              { name: "Almarai Laban 1L", sold: 342, pct: 92 },
              { name: "Nadec Full Cream Milk 2L", sold: 287, pct: 78 },
              { name: "Sadia Frozen Chicken 1kg", sold: 204, pct: 60 },
              { name: "Lipton Tea 100 Bags", sold: 168, pct: 48 },
              { name: "Al Rabie Juice Mango 1L", sold: 142, pct: 40 },
            ].map((p) => (
              <div key={p.name}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span className="font-medium truncate pr-2">{p.name}</span>
                  <span className="text-muted-foreground tabular-nums">{p.sold}</span>
                </div>
                <Progress value={p.pct} className="h-1.5" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Branch performance */}
        <Card className="lg:col-span-2 p-6 border-border/60 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold">Branch Performance</h3>
              <p className="text-xs text-muted-foreground">Live snapshot · refreshed 2 min ago</p>
            </div>
            <Button variant="ghost" size="sm" className="gap-1">All <ArrowRight className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { name: "Olaya — Riyadh HQ", sales: "ر.س 18,420", orders: 412, status: "online", trend: "+22%" },
              { name: "Al Khobar Corniche", sales: "ر.س 12,890", orders: 318, status: "online", trend: "+9%" },
              { name: "Jeddah Tahlia", sales: "ر.س 11,260", orders: 287, status: "syncing", trend: "+14%" },
              { name: "Madinah Quba", sales: "ر.س 6,350", orders: 167, status: "warning", trend: "-3%" },
            ].map((b) => (
              <div key={b.name} className="rounded-xl border border-border/60 p-4 hover:border-primary/40 hover:shadow-card transition-all">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-4 w-4 text-primary shrink-0" />
                    <span className="font-semibold text-sm truncate">{b.name}</span>
                  </div>
                  <StatusDot status={b.status as any} />
                </div>
                <p className="text-xl font-bold">{b.sales}</p>
                <div className="flex justify-between items-center mt-1 text-xs">
                  <span className="text-muted-foreground">{b.orders} orders</span>
                  <span className={b.trend.startsWith("+") ? "text-success font-semibold" : "text-destructive font-semibold"}>{b.trend}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Alerts timeline */}
        <Card className="p-6 border-border/60 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold">Alerts & Activity</h3>
            <Badge variant="outline" className="text-xs">7 new</Badge>
          </div>
          <div className="space-y-4">
            {[
              { icon: AlertTriangle, color: "text-destructive bg-destructive/10", title: "Almarai Yogurt expires in 2 days", time: "5 min", branch: "Olaya" },
              { icon: ReceiptText, color: "text-success bg-success/10", title: "147 invoices synced to ZATCA", time: "12 min", branch: "All branches" },
              { icon: FileBox, color: "text-warning bg-warning/20", title: "Reorder needed: Sugar 1kg (8 left)", time: "1 hr", branch: "Khobar" },
              { icon: TerminalIcon, color: "text-primary bg-primary/10", title: "Terminal POS-04 went offline", time: "2 hr", branch: "Jeddah" },
              { icon: CalendarClock, color: "text-warning bg-warning/20", title: "Supplier PO #1240 due tomorrow", time: "4 hr", branch: "HQ" },
            ].map((a, i) => (
              <div key={i} className="flex gap-3">
                <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${a.color}`}><a.icon className="h-4 w-4" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">{a.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{a.branch} · {a.time} ago</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5 border-border/60 shadow-card">
          <div className="flex items-center gap-2 mb-3"><ShieldCheck className="h-4 w-4 text-success" /><h4 className="font-semibold text-sm">ZATCA Sync</h4></div>
          <p className="text-2xl font-bold">100%</p>
          <Progress value={100} className="h-1.5 mt-2" />
          <p className="text-xs text-muted-foreground mt-2">1,284 / 1,284 invoices synced</p>
        </Card>
        <Card className="p-5 border-border/60 shadow-card">
          <div className="flex items-center gap-2 mb-3"><Cpu className="h-4 w-4 text-primary" /><h4 className="font-semibold text-sm">Device Health</h4></div>
          <p className="text-2xl font-bold">94%</p>
          <Progress value={94} className="h-1.5 mt-2" />
          <p className="text-xs text-muted-foreground mt-2">38 / 41 devices healthy</p>
        </Card>
        <Card className="p-5 border-border/60 shadow-card">
          <div className="flex items-center gap-2 mb-3"><Smartphone className="h-4 w-4 text-primary" /><h4 className="font-semibold text-sm">Mobile POS</h4></div>
          <p className="text-2xl font-bold">7 active</p>
          <p className="text-xs text-muted-foreground mt-2">ر.س 4,210 from mobile today</p>
        </Card>
        <Card className="p-5 border-border/60 shadow-card">
          <div className="flex items-center gap-2 mb-3"><Activity className="h-4 w-4 text-primary" /><h4 className="font-semibold text-sm">Supplier Dues</h4></div>
          <p className="text-2xl font-bold">ر.س 28,400</p>
          <p className="text-xs text-muted-foreground mt-2">3 invoices due this week</p>
        </Card>
      </div>
    </PageShell>
  );
}