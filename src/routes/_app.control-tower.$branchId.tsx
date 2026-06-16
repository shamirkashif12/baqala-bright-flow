import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import { api, type Branch, type Terminal, type User } from "@/lib/api";
import {
  ArrowLeft,
  Building2,
  Users,
  Terminal as TerminalIcon,
  ScanBarcode,
  Smartphone,
  Activity,
  WifiOff,
  Loader2,
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
  session_open: "bg-success/15 text-success border-success/30",
  session_closed: "bg-muted text-muted-foreground border-border",
};

const STATUS_DOT: Record<string, string> = {
  active: "bg-success",
  syncing: "bg-primary",
  offline: "bg-destructive",
  idle: "bg-muted-foreground",
  session_open: "bg-success",
  session_closed: "bg-muted-foreground",
};

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_CHIP[status] ?? STATUS_CHIP["idle"]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status] ?? STATUS_DOT["idle"]} ${status === "active" || status === "syncing" ? "animate-pulse" : ""}`} />
      {status}
    </span>
  );
}

function BranchDetail() {
  const { branchId } = Route.useParams();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getBranches(),
      api.getTerminals(branchId),
      api.getUsers({ branchId }),
    ])
      .then(([branches, terms, staff]) => {
        const found = branches.find((b) => b.id === branchId);
        if (!found) throw notFound();
        setBranch(found);
        setTerminals(terms);
        setUsers(staff);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [branchId]);

  if (loading) {
    return (
      <PageShell title="Loading…">
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading branch details…</div>
      </PageShell>
    );
  }

  if (!branch) {
    return (
      <PageShell title="Branch not found">
        <p className="text-sm text-muted-foreground">No branch with that ID.</p>
      </PageShell>
    );
  }

  const active = terminals.filter((t) => t.status === "active" || t.status === "session_open").length;
  const offline = terminals.filter((t) => t.status === "offline").length;
  const activeUsers = users.filter((u) => u.status === "active").length;

  return (
    <PageShell
      title={branch.name}
      subtitle={`${branch.city ?? branch.address ?? "—"} · ${branch.branchCode}`}
      actions={
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link to="/control-tower"><ArrowLeft className="h-3.5 w-3.5" /> Back to Control Tower</Link>
        </Button>
      }
    >
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-5">
        <MetricCard label="Terminals" value={String(terminals.length)} icon={TerminalIcon} accent="primary" />
        <MetricCard label="Active" value={String(active)} icon={Activity} accent="success" />
        <MetricCard label="Offline" value={String(offline)} icon={WifiOff} accent="destructive" />
        <MetricCard label="Staff" value={`${activeUsers} / ${users.length}`} icon={Users} accent="primary" />
        <MetricCard label="Branch Code" value={branch.branchCode} icon={Building2} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5 border-border/60 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm flex items-center gap-2"><TerminalIcon className="h-4 w-4 text-primary" /> Terminals</h3>
            <Badge variant="outline" className="text-[10px]">{terminals.length} total</Badge>
          </div>
          {terminals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No terminals assigned to this branch</p>
          ) : (
            <div className="space-y-2.5">
              {terminals.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3 hover:bg-muted/30 transition-colors">
                  <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
                    <ScanBarcode className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums">{t.terminalCode}</span>
                      <StatusPill status={t.status} />
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {t.assignedCashier ? t.assignedCashier.fullName : "Unassigned"} · Sync {t.lastSync ? new Date(t.lastSync).toLocaleTimeString("en-SA", { hour: "2-digit", minute: "2-digit" }) : "—"}
                    </div>
                  </div>
                  <div className="text-right text-[11px] tabular-nums text-muted-foreground">
                    {t.uptimeMinutes ? `${Math.floor(t.uptimeMinutes / 60)}h ${t.uptimeMinutes % 60}m` : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5 border-border/60 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-sm flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Staff</h3>
            <Badge variant="outline" className="text-[10px]">{activeUsers} active</Badge>
          </div>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No staff assigned to this branch</p>
          ) : (
            <div className="space-y-2.5">
              {users.map((u) => (
                <div key={u.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3">
                  <div className="h-9 w-9 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                    {u.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{u.fullName}</div>
                    <div className="text-[11px] text-muted-foreground">{u.roleName ?? "Staff"}</div>
                  </div>
                  <Badge
                    variant="outline"
                    className={u.status === "active" ? "border-success/30 bg-success/10 text-success text-[10px]" : "text-[10px]"}
                  >
                    {u.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5 border-border/60 shadow-card">
        <h3 className="font-bold text-sm mb-4 flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Device Allocation</h3>
        <div className="grid sm:grid-cols-2 gap-3 max-w-md">
          <AllocRow label="Devices In Use" value={active} max={terminals.length} tone="success" />
          <AllocRow label="Devices Offline" value={offline} max={terminals.length} tone="destructive" />
        </div>
      </Card>
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
