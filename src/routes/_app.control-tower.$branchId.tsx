import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import { BRANCHES } from "./_app.control-tower";
import {
  ArrowLeft,
  Building2,
  Users,
  Terminal as TerminalIcon,
  ScanBarcode,
  Smartphone,
  Activity,
  RefreshCw,
  CheckCircle2,
  LogIn,
  LogOut,
  Zap,
  WifiOff,
} from "lucide-react";

export const Route = createFileRoute("/_app/control-tower/$branchId")({
  component: BranchDetail,
  notFoundComponent: () => (
    <PageShell title="Branch not found"><p className="text-sm text-muted-foreground">No branch with that ID.</p></PageShell>
  ),
});

const STATUS_CHIP: Record<string, string> = {
  active: "bg-success/15 text-success border-success/30",
  syncing: "bg-primary/15 text-primary border-primary/30",
  offline: "bg-destructive/15 text-destructive border-destructive/30",
  idle: "bg-muted text-muted-foreground border-border",
};

const STATUS_DOT: Record<string, string> = {
  active: "bg-success",
  syncing: "bg-primary",
  offline: "bg-destructive",
  idle: "bg-muted-foreground",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_CHIP[status]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]} ${status === "active" || status === "syncing" ? "animate-pulse" : ""}`} />
      {status}
    </span>
  );
}

function BranchDetail() {
  const { branchId } = Route.useParams();
  const branch = BRANCHES.find((b) => b.id === branchId);
  if (!branch) throw notFound();

  const loggedIn = branch.employees.filter((e) => e.loggedIn).length;
  const posCount = branch.terminals.filter((t) => t.type === "POS").length;
  const mposCount = branch.terminals.filter((t) => t.type === "Mobile POS").length;
  const active = branch.terminals.filter((t) => t.status === "active").length;
  const offline = branch.terminals.filter((t) => t.status === "offline").length;

  const timeline = [
    { time: "10:42", icon: RefreshCw, text: "Sync completed on TML-RYD-001", tone: "primary" },
    { time: "10:30", icon: LogIn, text: "Fahad Al-Qahtani logged in to TML-RYD-001", tone: "success" },
    { time: "10:18", icon: Activity, text: "Terminal TML-RYD-002 activated", tone: "success" },
    { time: "09:55", icon: WifiOff, text: "MPOS-RYD-002 went offline", tone: "destructive" },
    { time: "09:30", icon: LogOut, text: "Session ended for E-104 (no logout)", tone: "warning" },
    { time: "09:15", icon: CheckCircle2, text: "Daily start checklist completed", tone: "success" },
  ];

  const toneClass: Record<string, string> = {
    primary: "bg-primary/15 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    destructive: "bg-destructive/15 text-destructive",
  };

  return (
    <PageShell
      title={branch.name}
      subtitle={`${branch.location} · Manager: ${branch.manager}`}
      actions={
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link to="/control-tower"><ArrowLeft className="h-3.5 w-3.5" /> Back to Control Tower</Link>
        </Button>
      }
    >
      {/* Header summary */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-6">
        <MetricCard label="Terminals" value={String(branch.terminals.length)} icon={TerminalIcon} accent="primary" />
        <MetricCard label="Active" value={String(active)} icon={Activity} accent="success" />
        <MetricCard label="Offline" value={String(offline)} icon={WifiOff} accent="destructive" />
        <MetricCard label="Employees Logged In" value={`${loggedIn} / ${branch.employees.length}`} icon={Users} accent="primary" />
        <MetricCard label="POS Devices" value={String(posCount)} icon={ScanBarcode} />
        <MetricCard label="Mobile POS" value={String(mposCount)} icon={Smartphone} />
      </div>

      {/* Terminals + Employees */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5 border-border/60 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm flex items-center gap-2"><TerminalIcon className="h-4 w-4 text-primary" /> Terminals</h3>
            <Badge variant="outline" className="text-[10px]">{branch.terminals.length} total</Badge>
          </div>
          <div className="space-y-2.5">
            {branch.terminals.map((t) => {
              const emp = branch.employees.find((e) => e.id === t.employeeId);
              return (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 hover:bg-muted/30 transition-colors">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${t.type === "POS" ? "bg-primary/10 text-primary" : "bg-accent/40 text-foreground"}`}>
                    {t.type === "POS" ? <ScanBarcode className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums">{t.id}</span>
                      <StatusPill status={t.status} />
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {emp ? `${emp.name} · ${emp.role}` : "Unassigned"} · Sync {t.lastSync}
                    </div>
                  </div>
                  <div className="text-right text-[11px] tabular-nums text-muted-foreground">
                    {t.sessionMins > 0 ? `${Math.floor(t.sessionMins / 60)}h ${t.sessionMins % 60}m` : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5 border-border/60 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Employees</h3>
            <Badge variant="outline" className="text-[10px]">{loggedIn} active</Badge>
          </div>
          <div className="space-y-2.5">
            {branch.employees.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3">
                <div className="h-9 w-9 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                  {e.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{e.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {e.role} · {e.device}{e.terminalId ? ` · ${e.terminalId}` : ""}
                  </div>
                </div>
                {e.alert === "no-logout" ? (
                  <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive text-[10px]">No logout</Badge>
                ) : e.alert === "multi-session" ? (
                  <Badge variant="outline" className="border-warning/40 bg-warning/15 text-warning-foreground text-[10px] gap-1"><Zap className="h-3 w-3" />Multi</Badge>
                ) : e.loggedIn ? (
                  <Badge variant="outline" className="border-success/30 bg-success/10 text-success text-[10px] gap-1"><LogIn className="h-3 w-3" />{e.loginTime}</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] gap-1"><LogOut className="h-3 w-3" />Off</Badge>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Device allocation + Timeline */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1 p-5 border-border/60 shadow-card">
          <h3 className="font-bold text-sm mb-4 flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Device Allocation</h3>
          <div className="space-y-3">
            <AllocRow label="Total POS" value={posCount} max={posCount + mposCount} />
            <AllocRow label="Total Mobile POS" value={mposCount} max={posCount + mposCount} />
            <AllocRow label="Devices In Use" value={active} max={branch.terminals.length} tone="success" />
            <AllocRow label="Devices Offline" value={offline} max={branch.terminals.length} tone="destructive" />
          </div>
        </Card>

        <Card className="lg:col-span-2 p-5 border-border/60 shadow-card">
          <h3 className="font-bold text-sm mb-4 flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Activity Timeline</h3>
          <div className="relative pl-6">
            <div className="absolute left-2 top-0 bottom-0 w-px bg-border" />
            <div className="space-y-3">
              {timeline.map((t, i) => (
                <div key={i} className="relative flex items-start gap-3">
                  <div className={`absolute -left-[18px] h-4 w-4 rounded-full flex items-center justify-center ${toneClass[t.tone]}`}>
                    <t.icon className="h-2.5 w-2.5" />
                  </div>
                  <div className="ml-2 flex-1 flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2">
                    <span className="text-xs">{t.text}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">{t.time}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}

function AllocRow({ label, value, max, tone }: { label: string; value: number; max: number; tone?: "success" | "destructive" }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  const barColor = tone === "destructive" ? "bg-destructive" : tone === "success" ? "bg-success" : "bg-primary";
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{value} / {max}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}