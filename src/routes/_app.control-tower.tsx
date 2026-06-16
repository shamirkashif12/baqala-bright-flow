import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect, type ReactElement } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import { useCustomizableCards } from "@/hooks/use-customizable-cards";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Building2,
  Terminal as TerminalIcon,
  Users,
  Smartphone,
  ScanBarcode,
  Activity,
  WifiOff,
  CircleDot,
  RefreshCw,
  AlertTriangle,
  Search,
  ArrowRight,
  Zap,
  LogIn,
  LogOut,
  Wrench,
  Eye,
  Radio,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { api, type Branch, type Terminal, type User } from "@/lib/api";

export const Route = createFileRoute("/_app/control-tower")({
  component: ControlTower,
});

/* ──────────────────────────── helpers ──────────────────────────── */

type TerminalStatus = "active" | "syncing" | "offline" | "idle" | string;

const STATUS_META: Record<string, { label: string; dot: string; chip: string; ring: string }> = {
  active: {
    label: "Active",
    dot: "bg-success",
    chip: "bg-success/15 text-success border-success/30",
    ring: "ring-success/40",
  },
  syncing: {
    label: "Syncing",
    dot: "bg-primary",
    chip: "bg-primary/15 text-primary border-primary/30",
    ring: "ring-primary/40",
  },
  offline: {
    label: "Offline",
    dot: "bg-destructive",
    chip: "bg-destructive/15 text-destructive border-destructive/30",
    ring: "ring-destructive/40",
  },
  idle: {
    label: "Idle",
    dot: "bg-muted-foreground",
    chip: "bg-muted text-muted-foreground border-border",
    ring: "ring-border",
  },
};

function getStatusMeta(status: string) {
  return STATUS_META[status] ?? STATUS_META["idle"];
}

function StatusPill({ status }: { status: string }) {
  const m = getStatusMeta(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${m.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot} ${status === "active" || status === "syncing" ? "animate-pulse" : ""}`} />
      {m.label ?? status}
    </span>
  );
}

function branchHealth(branchId: string, terminals: Terminal[]): "Fully Operational" | "Partially Active" | "Attention Required" | "Offline Issue" {
  const bt = terminals.filter((t) => t.branchId === branchId);
  const off = bt.filter((t) => t.status === "offline").length;
  const total = bt.length;
  if (total === 0 || off === 0) return "Fully Operational";
  if (off === total) return "Offline Issue";
  if (off >= Math.ceil(total / 2)) return "Attention Required";
  return "Partially Active";
}

function healthChip(h: ReturnType<typeof branchHealth>) {
  const map: Record<string, string> = {
    "Fully Operational": "bg-success/15 text-success border-success/30",
    "Partially Active": "bg-warning/20 text-warning-foreground border-warning/40",
    "Attention Required": "bg-warning/20 text-warning-foreground border-warning/40",
    "Offline Issue": "bg-destructive/15 text-destructive border-destructive/30",
  };
  return `inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${map[h]}`;
}

/* ──────────────────────────── page ──────────────────────────── */

function ControlTower() {
  const [tab, setTab] = useState("map");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [branches, setBranches] = useState<Branch[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.getBranches(), api.getTerminals(), api.getUsers()])
      .then(([b, t, u]) => {
        setBranches(b);
        setTerminals(t);
        setUsers(u);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totals = useMemo(() => ({
    activeBranches: branches.filter((b) => b.status === "active").length,
    activeTerminals: terminals.filter((t) => t.status === "active").length,
    staffOnline: users.filter((u) => u.status === "active").length,
    alerts: terminals.filter((t) => t.status === "offline").length,
  }), [branches, terminals, users]);

  const ALL_CARDS = ["Active Branches", "Active Terminals", "Staff Online", "Alerts"];
  const cards = useCustomizableCards("baqala_control_tower_cards", ALL_CARDS);

  const cardMap: Record<string, ReactElement> = {
    "Active Branches": <MetricCard label="Active Branches" value={String(totals.activeBranches)} icon={Building2} accent="primary" hint="all KSA" editing={cards.editing} onRemove={() => cards.remove("Active Branches")} />,
    "Active Terminals": <MetricCard label="Active Terminals" value={String(totals.activeTerminals)} icon={Activity} accent="success" editing={cards.editing} onRemove={() => cards.remove("Active Terminals")} />,
    "Staff Online": <MetricCard label="Staff Online" value={String(totals.staffOnline)} icon={Users} accent="primary" editing={cards.editing} onRemove={() => cards.remove("Staff Online")} />,
    "Alerts": <MetricCard label="Alerts" value={String(totals.alerts)} icon={WifiOff} accent="destructive" editing={cards.editing} onRemove={() => cards.remove("Alerts")} />,
  };

  const filteredBranches = useMemo(() => {
    return branches.filter((b) => branchFilter === "all" || b.id === branchFilter);
  }, [branches, branchFilter]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (branchFilter !== "all" && u.branchId !== branchFilter) return false;
      if (statusFilter === "active" && u.status !== "active") return false;
      if (statusFilter === "inactive" && u.status !== "inactive") return false;
      if (q && !`${u.fullName} ${u.email} ${u.roleName ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [users, branchFilter, statusFilter, search]);

  const filteredTerminals = useMemo(() => {
    return terminals.filter((t) => {
      if (branchFilter !== "all" && t.branchId !== branchFilter) return false;
      if (statusFilter !== "all" && statusFilter !== "active" && statusFilter !== "inactive" && t.status !== statusFilter) return false;
      return true;
    });
  }, [terminals, branchFilter, statusFilter]);

  if (loading) {
    return (
      <PageShell title="Operations Visibility Center" subtitle="Live branch · terminal · workforce control tower">
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <RefreshCw className="h-6 w-6 animate-spin mr-2" /> Loading live data…
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Operations Visibility Center"
      subtitle="Live branch · terminal · workforce control tower"
      actions={
        <div className="flex items-center gap-2">
          {cards.Controls}
          <span className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" /> Live
          </span>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {
            setLoading(true);
            Promise.all([api.getBranches(), api.getTerminals(), api.getUsers()])
              .then(([b, t, u]) => { setBranches(b); setTerminals(t); setUsers(u); })
              .catch(() => {})
              .finally(() => setLoading(false));
          }}>
            <RefreshCw className="h-3.5 w-3.5" />Refresh
          </Button>
        </div>
      }
    >
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-3xl border border-border/60 gradient-primary text-primary-foreground p-6 md:p-7 shadow-elegant">
        <div className="absolute inset-0 opacity-[0.15] pointer-events-none"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)", backgroundSize: "22px 22px" }} />
        <div className="absolute -top-10 -right-10 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 left-1/3 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center ring-1 ring-white/30">
              <Radio className="h-7 w-7 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
                <Sparkles className="h-3.5 w-3.5" /> Live Control Tower
              </div>
              <h2 className="mt-1 text-2xl md:text-3xl font-bold tracking-tight">All systems in view</h2>
              <p className="text-sm text-white/80 mt-0.5">{branches.length} branches · {totals.activeTerminals} live terminals · {totals.staffOnline} staff online</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <HeroPill icon={ShieldCheck} label="Branches" value={String(totals.activeBranches)} />
            <HeroPill icon={Activity} label="Active" value={String(totals.activeTerminals)} />
            <HeroPill icon={WifiOff} label="Offline" value={String(totals.alerts)} tone="danger" />
            <HeroPill icon={Users} label="Online" value={String(totals.staffOnline)} />
          </div>
        </div>
      </div>

      {/* Top summary cards (customizable) */}
      {cards.visible.length === 0 ? (
        <Card className="p-8 text-center border-dashed border-border/60">
          <p className="text-sm text-muted-foreground">No KPI cards visible. Click <span className="font-semibold">Add / Remove</span> to add some back.</p>
        </Card>
      ) : (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {ALL_CARDS.filter(cards.isVisible).map((label) => (
            <div key={label}>{cardMap[label]}</div>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card className="p-3 border-border/60 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search user, terminal, branch…"
              className="pl-9 h-9 bg-muted/40 border-transparent focus-visible:bg-card"
            />
          </div>
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Branch" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="syncing">Syncing</SelectItem>
              <SelectItem value="offline">Offline</SelectItem>
              <SelectItem value="idle">Idle</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="map">Live Map</TabsTrigger>
          <TabsTrigger value="branches">Branches</TabsTrigger>
          <TabsTrigger value="terminals">Terminals</TabsTrigger>
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        {/* ── MAP ── */}
        <TabsContent value="map" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredBranches.map((b) => (
              <BranchDiagram key={b.id} branch={b} terminals={terminals.filter((t) => t.branchId === b.id)} users={users.filter((u) => u.branchId === b.id)} />
            ))}
          </div>
          <MiniInsights branches={branches} terminals={terminals} users={users} />
        </TabsContent>

        {/* ── BRANCHES ── */}
        <TabsContent value="branches">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredBranches.map((b) => (
              <BranchCard key={b.id} branch={b} terminals={terminals.filter((t) => t.branchId === b.id)} users={users.filter((u) => u.branchId === b.id)} />
            ))}
          </div>
        </TabsContent>

        {/* ── TERMINALS ── */}
        <TabsContent value="terminals">
          <Card className="overflow-hidden border-border/60 shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Terminal</th>
                    <th className="px-4 py-3 font-semibold">Branch</th>
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Assigned Cashier</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Last Sync</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTerminals.map((t) => (
                    <tr key={t.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                      <td className="px-4 py-3 font-semibold tabular-nums">{t.terminalCode}</td>
                      <td className="px-4 py-3 text-muted-foreground">{t.branch?.name ?? branches.find((b) => b.id === t.branchId)?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-xs">{t.name}</td>
                      <td className="px-4 py-3">
                        {t.assignedCashier ? (
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-[10px] font-bold">
                              {t.assignedCashier.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                            </div>
                            <span className="text-xs font-medium">{t.assignedCashier.fullName}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">— unassigned —</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><StatusPill status={t.status} /></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">{t.lastSync ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-7 px-2"><Eye className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2"><RefreshCw className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2"><Wrench className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredTerminals.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">No terminals found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ── STAFF ── */}
        <TabsContent value="staff">
          <Card className="overflow-hidden border-border/60 shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">User</th>
                    <th className="px-4 py-3 font-semibold">Branch</th>
                    <th className="px-4 py-3 font-semibold">Role</th>
                    <th className="px-4 py-3 font-semibold">Last Login</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                            {u.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                          </div>
                          <div>
                            <div className="font-medium text-xs">{u.fullName}</div>
                            <div className="text-[10px] text-muted-foreground">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{u.branchName ?? branches.find((b) => b.id === u.branchId)?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-xs">{u.roleName ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">{u.lastLogin ? new Date(u.lastLogin).toLocaleString() : "—"}</td>
                      <td className="px-4 py-3">
                        {u.status === "active" ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                            <LogIn className="h-3 w-3" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            <LogOut className="h-3 w-3" /> Inactive
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No staff found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ── ALERTS ── */}
        <TabsContent value="alerts">
          <AlertsPanel terminals={terminals} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function HeroPill({ icon: Icon, label, value, tone }: { icon: typeof Radio; label: string; value: string; tone?: "danger" }) {
  return (
    <div className={`flex items-center gap-2.5 rounded-xl px-3 py-2 backdrop-blur ring-1 ${tone === "danger" ? "bg-destructive/30 ring-destructive/50" : "bg-white/15 ring-white/30"}`}>
      <Icon className="h-4 w-4" />
      <div className="leading-tight">
        <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
        <div className="text-sm font-bold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

/* ──────────────────────────── branch diagram ──────────────────────────── */

function BranchDiagram({ branch, terminals, users }: { branch: Branch; terminals: Terminal[]; users: User[] }) {
  const health = branchHealth(branch.id, terminals);
  return (
    <Card className="relative overflow-hidden border-border/60 shadow-card hover:shadow-elegant transition-all">
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/5" />
      <div className="relative p-5 border-b border-border/60 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl gradient-primary text-primary-foreground flex items-center justify-center shadow-glow">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm">{branch.name}</h3>
              <span className={healthChip(health)}>{health}</span>
            </div>
            <p className="text-[11px] text-muted-foreground">{branch.city ?? "—"} · {branch.branchCode}</p>
          </div>
        </div>
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link to="/control-tower/$branchId" params={{ branchId: branch.id }}>
            View <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      <div className="relative p-5">
        <div className="grid grid-cols-3 gap-2 mb-5">
          <MiniStat label="Terminals" value={terminals.length} />
          <MiniStat label="Active" value={terminals.filter((t) => t.status === "active").length} />
          <MiniStat label="Staff" value={users.length} />
        </div>

        <div className="space-y-3">
          {terminals.map((t) => {
            const meta = getStatusMeta(t.status);
            return (
              <div key={t.id} className="relative flex items-center gap-3">
                <div className={`relative flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2 min-w-[170px] ring-1 ${meta.ring}`}>
                  {(t.status === "active" || t.status === "syncing") && (
                    <span className={`absolute -inset-px rounded-xl ${meta.dot} opacity-10 animate-pulse pointer-events-none`} />
                  )}
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
                    <ScanBarcode className="h-4 w-4" />
                  </div>
                  <div className="leading-tight">
                    <div className="text-xs font-semibold tabular-nums">{t.terminalCode}</div>
                    <StatusPill status={t.status} />
                  </div>
                </div>

                <div className="flex-1 relative h-px">
                  <div className="absolute inset-0 border-t border-dashed border-border" />
                  {(t.status === "active" || t.status === "syncing") && (
                    <span
                      className={`absolute top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full ${meta.dot} shadow-[0_0_8px_currentColor] animate-[ping_1.6s_ease-in-out_infinite]`}
                      style={{ left: "30%" }}
                    />
                  )}
                </div>

                {t.assignedCashier ? (
                  <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 min-w-[180px]">
                    <div className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-[10px] font-bold">
                      {t.assignedCashier.fullName.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                    </div>
                    <div className="leading-tight min-w-0">
                      <div className="text-xs font-semibold truncate">{t.assignedCashier.fullName}</div>
                      <div className="text-[10px] text-muted-foreground">{t.name}</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl border border-dashed border-warning/40 bg-warning/5 px-3 py-2 min-w-[180px]">
                    <AlertTriangle className="h-4 w-4 text-warning-foreground" />
                    <div className="text-[11px] text-warning-foreground font-medium">
                      {t.status === "active" ? "Unassigned Active" : "No cashier"}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {terminals.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No terminals for this branch.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/30 px-2.5 py-2 text-center">
      <div className="text-lg font-bold tabular-nums leading-none">{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

/* ──────────────────────────── branch cards ──────────────────────────── */

function BranchCard({ branch, terminals, users }: { branch: Branch; terminals: Terminal[]; users: User[] }) {
  const health = branchHealth(branch.id, terminals);
  const active = terminals.filter((t) => t.status === "active").length;
  const offline = terminals.filter((t) => t.status === "offline").length;
  return (
    <Card className="p-5 border-border/60 shadow-card hover:shadow-elegant transition-all">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl gradient-primary text-primary-foreground flex items-center justify-center"><Building2 className="h-5 w-5" /></div>
          <div>
            <h3 className="font-bold text-sm">{branch.name}</h3>
            <p className="text-[11px] text-muted-foreground">{branch.branchCode} · {branch.city ?? "—"}</p>
          </div>
        </div>
        <span className={healthChip(health)}>{health}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <Row label="Status" value={branch.status} />
        <Row label="Staff" value={String(users.length)} />
        <Row label="Active Terminals" value={`${active} / ${terminals.length}`} />
        <Row label="Offline" value={String(offline)} tone={offline > 0 ? "warn" : undefined} />
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Button asChild size="sm" variant="outline" className="h-8">
          <Link to="/control-tower/$branchId" params={{ branchId: branch.id }}>View Details</Link>
        </Button>
        <Button size="sm" variant="ghost" className="h-8">Terminals</Button>
        <Button size="sm" variant="ghost" className="h-8">Staff</Button>
      </div>
    </Card>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/30 px-2.5 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`font-semibold tabular-nums ${tone === "warn" ? "text-destructive" : ""}`}>{value}</span>
    </div>
  );
}

/* ──────────────────────────── mini insights & alerts ──────────────────────────── */

function MiniInsights({ branches, terminals, users }: { branches: Branch[]; terminals: Terminal[]; users: User[] }) {
  const fullyOp = branches.filter((b) => {
    const bt = terminals.filter((t) => t.branchId === b.id);
    return bt.length === 0 || bt.every((t) => t.status !== "offline");
  }).length;

  const insights = [
    { label: "Total Branches", value: String(branches.length), icon: Building2 },
    { label: "Active Terminals", value: String(terminals.filter((t) => t.status === "active").length), icon: Activity },
    { label: "Offline Terminals", value: String(terminals.filter((t) => t.status === "offline").length), icon: WifiOff },
    { label: "Total Staff", value: String(users.length), icon: Users },
    { label: "Staff Online", value: String(users.filter((u) => u.status === "active").length), icon: LogIn },
    { label: "Fully Operational", value: `${fullyOp} / ${branches.length}`, icon: Building2 },
  ];
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
      {insights.map((i) => (
        <div key={i.label} className="rounded-2xl border border-border/60 bg-card p-3 shadow-card">
          <div className="flex items-center gap-2 text-muted-foreground text-[10px] uppercase tracking-wider">
            <i.icon className="h-3.5 w-3.5" /> {i.label}
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums">{i.value}</div>
        </div>
      ))}
    </div>
  );
}

function AlertsPanel({ terminals }: { terminals: Terminal[] }) {
  const offlineTerminals = terminals.filter((t) => t.status === "offline");
  const unassignedActive = terminals.filter((t) => t.status === "active" && !t.assignedCashierId);

  const toneMap: Record<string, string> = {
    danger: "border-destructive/30 bg-destructive/5 text-destructive",
    warn: "border-warning/40 bg-warning/10 text-warning-foreground",
  };

  if (offlineTerminals.length === 0 && unassignedActive.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 rounded-2xl border border-success/30 bg-success/5 text-success text-sm font-medium gap-2">
        <ShieldCheck className="h-5 w-5" /> No active alerts — all systems nominal.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {offlineTerminals.map((t) => (
        <div key={t.id} className={`rounded-2xl border p-4 ${toneMap["danger"]}`}>
          <div className="flex items-center gap-2 font-semibold text-sm">
            <WifiOff className="h-4 w-4" /> Terminal Offline
          </div>
          <div className="mt-2 text-xs text-foreground/80 space-y-0.5">
            <div><span className="text-muted-foreground">Terminal:</span> <span className="tabular-nums">{t.terminalCode}</span></div>
            <div><span className="text-muted-foreground">Name:</span> {t.name}</div>
            {t.lastSync && <div><span className="text-muted-foreground">Last Sync:</span> {t.lastSync}</div>}
          </div>
        </div>
      ))}
      {unassignedActive.map((t) => (
        <div key={t.id} className={`rounded-2xl border p-4 ${toneMap["warn"]}`}>
          <div className="flex items-center gap-2 font-semibold text-sm">
            <AlertTriangle className="h-4 w-4" /> Unassigned Active Terminal
          </div>
          <div className="mt-2 text-xs text-foreground/80 space-y-0.5">
            <div><span className="text-muted-foreground">Terminal:</span> <span className="tabular-nums">{t.terminalCode}</span></div>
            <div><span className="text-muted-foreground">Name:</span> {t.name}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
