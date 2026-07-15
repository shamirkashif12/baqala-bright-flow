import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGate } from "@/components/role-gate";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { MetricCard, StatusDot } from "@/components/metric-card";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Activity, Users, Building2, ShieldCheck, Server, Cpu, HardDrive, Wifi,
  TrendingUp, AlertTriangle, ReceiptText, Sparkles, Zap, Search, Plus,
  ArrowUpRight, RefreshCw, Crown, Lock, Database, Globe, CircleCheck,
} from "lucide-react";
import heroBg from "@/assets/admin-hero.jpg";
import storePhoto from "@/assets/store-photo.jpg";
import ownerPhoto from "@/assets/owner-photo.jpg";
import { api, type AuditLog, type DashboardMetrics } from "@/lib/api";
import { SARIcon } from "@/lib/currency";

export const Route = createFileRoute("/_app/admin")({
  component: () => (
    <RoleGate allow={["tenant_admin"]}>
      <AdminHome />
    </RoleGate>
  ),
});

function useTicker(seed: number, min: number, max: number, intervalMs = 1800) {
  const [v, setV] = useState(seed);
  useEffect(() => {
    const id = setInterval(() => {
      setV((prev) => {
        const drift = (Math.random() - 0.4) * (max - min) * 0.04;
        const next = Math.max(min, Math.min(max, prev + drift));
        return next;
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [min, max, intervalMs]);
  return v;
}

function LiveBars() {
  const [bars, setBars] = useState<number[]>(() => Array.from({ length: 24 }, () => 30 + Math.random() * 70));
  useEffect(() => {
    const id = setInterval(() => {
      setBars((b) => [...b.slice(1), 20 + Math.random() * 80]);
    }, 1200);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-end gap-1 h-28">
      {bars.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-md bg-gradient-to-t from-primary/30 to-primary transition-all duration-700"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

function PulseDot() {
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full rounded-full bg-success/70 animate-ping" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
    </span>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return "just now";
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

function getInitials(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function AdminHome() {
  const apiRps = useTicker(312, 240, 480, 900);
  const uptime = useTicker(99.98, 99.9, 100, 4000);

  // null = still loading; [] = loaded and genuinely empty. Previously both states used the same
  // [] default, so an empty result read identically to "still fetching" and the "Loading
  // activity…"/"Loading operators…" placeholders never went away once a fetch actually resolved
  // empty.
  const [auditLogs, setAuditLogs] = useState<AuditLog[] | null>(null);
  const [dashboard, setDashboard] = useState<DashboardMetrics | null>(null);
  const [activeUsers, setActiveUsers] = useState<import("@/lib/api").User[] | null>(null);
  const [tenantCounts, setTenantCounts] = useState<{ branches: number; terminals: number; suppliers: number } | null>(null);

  useEffect(() => {
    api.getAuditLogs({ page: 1 }).then((res) => setAuditLogs(res.items)).catch(() => setAuditLogs([]));
    api.getDashboard().then(setDashboard).catch(() => {});
    api.getUsers({ status: "active" }).then(setActiveUsers).catch(() => setActiveUsers([]));
    Promise.all([api.getBranches(), api.getTerminals(), api.getSuppliers()])
      .then(([branches, terminals, suppliers]) =>
        setTenantCounts({ branches: branches.length, terminals: terminals.length, suppliers: suppliers.length }))
      .catch(() => {});
  }, []);

  const feed = useMemo(() => (auditLogs ?? []).slice(0, 6), [auditLogs]);

  const salesValue = dashboard?.sales.totalToday ?? 0;
  const ordersValue = dashboard?.orders.totalToday ?? 0;

  return (
    <PageShell title="Admin Portal" subtitle="Live operations · tenant control center">
      {/* Hero */}
      <Card className="relative overflow-hidden border-0 text-primary-foreground p-0 shadow-elegant">
        <img
          src={heroBg}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          width={1920}
          height={640}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary-deep/90 via-primary/70 to-transparent" />
        <div className="relative grid md:grid-cols-5 gap-6 p-6 md:p-10 items-center">
          <div className="md:col-span-3 space-y-4">
            <Badge className="bg-white/15 text-primary-foreground border-white/25 backdrop-blur gap-1.5">
              <Sparkles className="h-3 w-3" /> Mimony · Admin Console
            </Badge>
            <h2 className="text-3xl md:text-5xl font-bold leading-[1.05] tracking-tight">
              Run every baqala from <span className="italic text-white/95">one</span> elegant cockpit.
            </h2>
            <p className="text-primary-foreground/85 max-w-xl">
              Real-time visibility across {tenantCounts ? `${tenantCounts.branches} branch${tenantCounts.branches === 1 ? "" : "es"}, ${tenantCounts.terminals} terminal${tenantCounts.terminals === 1 ? "" : "s"}, ${tenantCounts.suppliers} supplier${tenantCounts.suppliers === 1 ? "" : "s"}` : "your branches, terminals and suppliers"} and the ZATCA gateway —
              built for owners who don't have time to babysit a POS.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Link to="/dashboard"><Button className="bg-white text-primary hover:bg-white/90 shadow-lg gap-2"><Zap className="h-4 w-4" />Open Live Dashboard</Button></Link>
              <Link to="/staff"><Button variant="outline" className="bg-white/10 border-white/30 text-primary-foreground hover:bg-white/20 gap-2"><Plus className="h-4 w-4" />Invite teammate</Button></Link>
              <Link to="/zatca"><Button variant="ghost" className="text-primary-foreground hover:bg-white/10 gap-2"><ShieldCheck className="h-4 w-4" />ZATCA log</Button></Link>
            </div>
          </div>
          <div className="md:col-span-2 hidden md:block">
            <div className="relative aspect-[4/5] rounded-3xl overflow-hidden border border-white/20 shadow-2xl">
              <img src={ownerPhoto} alt="Shop owner" className="h-full w-full object-cover" loading="lazy" width={1024} height={1024} />
              <div className="absolute bottom-3 left-3 right-3 rounded-2xl glass p-3 text-foreground">
                <div className="flex items-center gap-2">
                  <PulseDot />
                  <span className="text-xs font-semibold">Olaya HQ · Live</span>
                  <span className="text-xs text-muted-foreground ml-auto"><SARIcon />{Math.round(salesValue).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Live metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Live Sales" value={<><SARIcon />{Math.round(salesValue).toLocaleString()}</>}
          delta={dashboard ? `${dashboard.sales.totalTodayDeltaPct > 0 ? "+" : ""}${dashboard.sales.totalTodayDeltaPct}%` : undefined}
          trend={dashboard ? (dashboard.sales.totalTodayDeltaPct >= 0 ? "up" : "down") : undefined}
          hint="today" icon={TrendingUp} accent="primary" />
        <MetricCard label="Orders Today" value={ordersValue.toLocaleString()}
          delta={dashboard ? `${dashboard.orders.deliveredDeltaPct > 0 ? "+" : ""}${dashboard.orders.deliveredDeltaPct}%` : undefined}
          trend={dashboard ? (dashboard.orders.deliveredDeltaPct >= 0 ? "up" : "down") : undefined}
          hint="total" icon={ReceiptText} />
        <MetricCard label="API Throughput (simulated)" value={`${Math.round(apiRps)} rps`} delta="no live telemetry" trend="flat" icon={Activity} accent="success" />
        <MetricCard label="Platform Uptime (simulated)" value={`${uptime.toFixed(2)}%`} delta="no live telemetry" trend="up" icon={ShieldCheck} accent="success" />
      </div>

      {/* Middle row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Live throughput */}
        <Card className="lg:col-span-2 p-6 border-border/60 shadow-card">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">Live Transaction Throughput</h3>
                <PulseDot />
              </div>
              <p className="text-xs text-muted-foreground">Simulated — no real-time transaction feed is connected yet</p>
            </div>
            <Button variant="ghost" size="sm" className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" />Snapshot</Button>
          </div>
          <LiveBars />
          <div className="grid grid-cols-4 gap-3 mt-5 pt-5 border-t">
            {[
              { l: "Cleared", v: "1,141", c: "text-success" },
              { l: "Pending", v: "108", c: "text-warning-foreground" },
              { l: "Refunds", v: "12", c: "text-destructive" },
              { l: "Voids", v: "23", c: "text-muted-foreground" },
            ].map((s) => (
              <div key={s.l}>
                <p className="text-xs text-muted-foreground">{s.l}</p>
                <p className={`text-lg font-bold ${s.c}`}>{s.v}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Live activity feed */}
        <Card className="p-6 border-border/60 shadow-card overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">Live Activity</h3>
              <PulseDot />
            </div>
            <Badge variant="outline" className="text-xs">streaming</Badge>
          </div>
          <div className="space-y-3">
            {auditLogs === null ? (
              <p className="text-xs text-muted-foreground">Loading activity…</p>
            ) : feed.length === 0 ? (
              <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
            ) : (
              feed.map((log, i) => (
                <div
                  key={log.id}
                  className="flex gap-3 transition-all duration-500"
                  style={{ opacity: 1 - i * 0.08 }}
                >
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 bg-muted/60 text-muted-foreground">
                    <Activity className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight truncate">{log.action}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {log.entityType ?? "System"} · {formatRelativeTime(log.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Quick actions */}
      <Card className="p-6 border-border/60 shadow-card">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-semibold">Admin Quick Actions</h3>
            <p className="text-xs text-muted-foreground">Most-used controls across your tenant</p>
          </div>
          <div className="relative w-64 hidden md:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Jump to module…" className="pl-9 h-9 bg-muted/50" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { t: "Invite Staff", d: "Add cashiers, managers", to: "/staff", i: Users, c: "from-primary/15 to-primary/5" },
            { t: "New Branch", d: "Onboard a new location", to: "/branches", i: Building2, c: "from-[color:var(--brand-teal)]/20 to-transparent" },
            { t: "Provision Terminal", d: "Pair a POS device", to: "/terminals", i: Server, c: "from-warning/20 to-transparent" },
            { t: "ZATCA Settings", d: "Manage e-invoicing", to: "/compliance", i: ShieldCheck, c: "from-success/20 to-transparent" },
          ].map((q) => (
            <Link key={q.t} to={q.to}>
              <div className={`group relative rounded-2xl border border-border/60 p-4 hover:border-primary/40 hover:shadow-elegant transition-all overflow-hidden bg-gradient-to-br ${q.c}`}>
                <q.i className="h-5 w-5 text-primary" />
                <p className="font-semibold text-sm mt-3">{q.t}</p>
                <p className="text-xs text-muted-foreground">{q.d}</p>
                <ArrowUpRight className="absolute top-3 right-3 h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
              </div>
            </Link>
          ))}
        </div>
      </Card>

      {/* System health + active operators + photo */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-6 border-border/60 shadow-card">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold">System Health</h3>
          </div>
          <p className="text-xs text-muted-foreground -mt-2 mb-3">Simulated — no infrastructure monitoring is connected yet</p>
          {[
            { l: "API Gateway", v: 99, i: Globe },
            { l: "Database", v: 96, i: Database },
            { l: "Storage", v: 71, i: HardDrive },
            { l: "Network", v: 88, i: Wifi },
          ].map((s) => (
            <div key={s.l} className="mb-3 last:mb-0">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="flex items-center gap-1.5 font-medium"><s.i className="h-3.5 w-3.5 text-muted-foreground" />{s.l}</span>
                <span className="tabular-nums font-semibold">{s.v}%</span>
              </div>
              <Progress value={s.v} className="h-1.5" />
            </div>
          ))}
        </Card>

        <Card className="lg:col-span-2 p-6 border-border/60 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold">Active Operators</h3>
              <p className="text-xs text-muted-foreground">Signed in across all terminals right now</p>
            </div>
            <Badge className="bg-success/15 text-success border-0">
              {activeUsers && activeUsers.length > 0 ? `${activeUsers.length} online` : "—"}
            </Badge>
          </div>
          <div className="space-y-2.5">
            {activeUsers === null ? (
              <p className="text-xs text-muted-foreground">Loading operators…</p>
            ) : activeUsers.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active operators right now.</p>
            ) : (
              activeUsers.slice(0, 6).map((u) => (
                <div key={u.id} className="flex items-center gap-3 rounded-xl p-2.5 hover:bg-muted/60 transition-colors">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="gradient-primary text-primary-foreground text-xs font-bold">
                      {getInitials(u.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{u.fullName}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[u.roleName, u.branchName].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <StatusDot status="online" />
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      {/* Inspirational store image */}
      <Card className="relative overflow-hidden border-0 shadow-elegant">
        <img src={storePhoto} alt="Saudi mart aisle" className="h-64 w-full object-cover" loading="lazy" width={1280} height={800} />
        <div className="absolute inset-0 bg-gradient-to-t from-primary-deep/90 via-primary-deep/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8 text-primary-foreground">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest opacity-80">Vision 2030 ready</p>
              <h3 className="text-2xl md:text-3xl font-bold mt-1">Powering the next generation of Saudi retail.</h3>
            </div>
            <Link to="/reports"><Button className="bg-white text-primary hover:bg-white/90 gap-2">View tenant report <ArrowUpRight className="h-4 w-4" /></Button></Link>
          </div>
        </div>
      </Card>
    </PageShell>
  );
}
