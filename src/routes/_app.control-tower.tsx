import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef, useCallback, type ReactElement, type ReactNode } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MetricCard } from "@/components/metric-card";
import { useCustomizableCards } from "@/hooks/use-customizable-cards";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2, Users, ScanBarcode, Activity,
  WifiOff, RefreshCw, AlertTriangle, Search, ArrowRight, Zap,
  LogIn, LogOut, Eye, Radio, Sparkles, ShieldCheck, Loader2,
  Clock, CheckCircle2, XCircle, ToggleLeft, ToggleRight, UserCheck,
} from "lucide-react";
import { api, type Branch, type Terminal, type User, type CashierShift } from "@/lib/api";
import { SARIcon } from "@/lib/currency";
import { useBranch } from "@/lib/branch-context";

export const Route = createFileRoute("/_app/control-tower")({ component: ControlTower });

// ─── Status meta ──────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; dot: string; chip: string; ring: string  }> = {
  active:  { label: "Active",  dot: "bg-success",          chip: "bg-success/15 text-success border-success/30",         ring: "ring-success/40" },
  syncing: { label: "Syncing", dot: "bg-primary",          chip: "bg-primary/15 text-primary border-primary/30",         ring: "ring-primary/40" },
  offline: { label: "Offline", dot: "bg-destructive",      chip: "bg-destructive/15 text-destructive border-destructive/30", ring: "ring-destructive/40" },
  idle:    { label: "Idle",    dot: "bg-muted-foreground", chip: "bg-muted text-muted-foreground border-border",          ring: "ring-border" },
};

function getStatusMeta(s: string) { return STATUS_META[s] ?? STATUS_META["idle"]; }

function StatusPill({ status }: { status: string }) {
  const m = getStatusMeta(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${m.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot} ${(status === "active" || status === "syncing") ? "animate-pulse" : ""}`} />
      {m.label}
    </span>
  );
}

function branchHealth(branchId: string, terminals: Terminal[]): "Fully Operational" | "Partially Active" | "Attention Required" | "Offline Issue" {
  const bt = terminals.filter(t => t.branchId === branchId);
  const off = bt.filter(t => t.status === "offline").length;
  if (bt.length === 0 || off === 0) return "Fully Operational";
  if (off === bt.length) return "Offline Issue";
  if (off >= Math.ceil(bt.length / 2)) return "Attention Required";
  return "Partially Active";
}

function healthChip(h: ReturnType<typeof branchHealth>) {
  const map: Record<string, string> = {
    "Fully Operational": "bg-success/15 text-success border-success/30",
    "Partially Active":  "bg-yellow-100 text-yellow-700 border-yellow-300",
    "Attention Required":"bg-yellow-100 text-yellow-700 border-yellow-300",
    "Offline Issue":     "bg-destructive/15 text-destructive border-destructive/30",
  };
  return `inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${map[h]}`;
}

function elapsed(openedAt: string) {
  const s = Math.floor((Date.now() - new Date(openedAt).getTime()) / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── Main page ────────────────────────────────────────────────────────────────
function ControlTower() {
  const { selectedBranch: globalSelectedBranch } = useBranch();
  const [tab, setTab] = useState("map");
  const [branchFilter, setBranchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [branches, setBranches]   = useState<Branch[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [users, setUsers]         = useState<User[]>([]);
  const [shifts, setShifts]       = useState<CashierShift[]>([]);
  const [loading, setLoading]     = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAll = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    Promise.all([api.getBranches(), api.getTerminals(), api.getUsers(), api.getShifts()])
      .then(([b, t, u, s]) => {
        setBranches(b); setTerminals(t); setUsers(u); setShifts(s);
        setLastRefresh(new Date());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadAll();
    intervalRef.current = setInterval(() => loadAll(true), 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadAll]);

  const handleTerminalStatusToggle = useCallback(async (t: Terminal) => {
    const next = t.status === "active" ? "offline" : "active";
    await api.updateTerminalStatus(t.id, next);
    loadAll(true);
  }, [loadAll]);

  const activeShifts = shifts.filter(s => s.status === "open");
  const onlineCashierIds = new Set(activeShifts.map(s => s.cashierId));

  const totals = useMemo(() => ({
    activeBranches:   branches.filter(b => b.status === "active").length,
    activeTerminals:  terminals.filter(t => t.status === "active").length,
    staffOnShift:     activeShifts.length,
    alerts:           terminals.filter(t => t.status === "offline").length,
  }), [branches, terminals, activeShifts]);

  const ALL_CARDS = ["Active Branches", "Active Terminals", "Staff on Shift", "Alerts"];
  const cards = useCustomizableCards("baqala_control_tower_cards", ALL_CARDS);

  const cardMap: Record<string, ReactElement> = {
    "Active Branches":  <MetricCard label="Active Branches"  value={String(totals.activeBranches)}  icon={Building2}  accent="primary"     editing={cards.editing} onRemove={() => cards.remove("Active Branches")} />,
    "Active Terminals": <MetricCard label="Active Terminals" value={String(totals.activeTerminals)} icon={Activity}   accent="success"     editing={cards.editing} onRemove={() => cards.remove("Active Terminals")} />,
    "Staff on Shift":   <MetricCard label="Staff on Shift"   value={String(totals.staffOnShift)}    icon={UserCheck}  accent="primary"     editing={cards.editing} onRemove={() => cards.remove("Staff on Shift")} />,
    "Alerts":           <MetricCard label="Alerts"           value={String(totals.alerts)}          icon={WifiOff}    accent="destructive" editing={cards.editing} onRemove={() => cards.remove("Alerts")} />,
  };

  const filteredBranches = useMemo(() => branches.filter(b => {
    if (branchFilter !== "all" && b.id !== branchFilter) return false;
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (q && !`${b.name} ${b.branchCode} ${b.city ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  }), [branches, branchFilter, statusFilter, search]);

  const filteredTerminals = useMemo(() => terminals.filter(t => {
    if (branchFilter !== "all" && t.branchId !== branchFilter) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    const q = search.trim().toLowerCase();
    if (q && !`${t.terminalCode} ${t.name} ${t.assignedCashier?.fullName ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  }), [terminals, branchFilter, statusFilter, search]);

  const filteredUsers = useMemo(() => users.filter(u => {
    if (branchFilter !== "all" && u.branchId !== branchFilter) return false;
    if (statusFilter === "active" && !onlineCashierIds.has(u.id)) return false;
    if (statusFilter === "inactive" && u.status !== "inactive") return false;
    const q = search.trim().toLowerCase();
    if (q && !`${u.fullName} ${u.email} ${u.roleName ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  }), [users, branchFilter, statusFilter, onlineCashierIds, search]);

  if (loading) return (
    <PageShell title="Operations Visibility Center" subtitle="Live branch · terminal · workforce control tower">
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading live data…
      </div>
    </PageShell>
  );

  return (
    <PageShell
      title="Operations Visibility Center"
      subtitle="Live branch · terminal · workforce control tower"
      actions={
        <div className="flex items-center gap-2">
          {cards.Controls}
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {lastRefresh.toLocaleTimeString("en-SA", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" /> Live
          </span>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => loadAll()}>
            <RefreshCw className="h-3.5 w-3.5" />Refresh
          </Button>
        </div>
      }
    >
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-3xl border border-border/60 gradient-primary text-primary-foreground p-6 md:p-7 shadow-elegant">
        <div className="absolute inset-0 opacity-[0.15] pointer-events-none"
          style={{ backgroundImage: "radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)", backgroundSize: "22px 22px" }} />
        <div className="absolute -top-10 -right-10 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
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
              <p className="text-sm text-white/80 mt-0.5">
                {branches.length} branches · {totals.activeTerminals} live terminals · {totals.staffOnShift} staff on shift
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <HeroPill icon={ShieldCheck} label="Branches"  value={String(totals.activeBranches)} />
            <HeroPill icon={Activity}    label="Active"    value={String(totals.activeTerminals)} />
            <HeroPill icon={WifiOff}     label="Offline"   value={String(totals.alerts)} tone="danger" />
            <HeroPill icon={UserCheck}   label="On Shift"  value={String(totals.staffOnShift)} />
          </div>
        </div>
      </div>

      {/* KPI cards */}
      {cards.visible.length === 0 ? (
        <Card className="p-8 text-center border-dashed border-border/60">
          <p className="text-sm text-muted-foreground">No KPI cards visible. Click <span className="font-semibold">Add / Remove</span> to add some back.</p>
        </Card>
      ) : (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {ALL_CARDS.filter(cards.isVisible).map(label => <div key={label}>{cardMap[label]}</div>)}
        </div>
      )}

      {/* Active shifts mini-row */}
      {activeShifts.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Active Shifts:</span>
          {activeShifts.map(s => (
            <div key={s.id} className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
              {s.cashier?.fullName ?? "Cashier"}
              {s.terminal ? ` · ${s.terminal.terminalCode}` : ""}
              <span className="text-success/70">· {elapsed(s.openedAt)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <Card className="p-3 border-border/60 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search user, terminal, branch…"
              className="pl-9 h-9 bg-muted/40 border-transparent focus-visible:bg-card" />
          </div>
          {tab !== "map" && (
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Branch" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
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
          <TabsTrigger value="terminals">
            Terminals
            {totals.alerts > 0 && (
              <span className="ml-1.5 h-4 min-w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                {totals.alerts}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="staff">
            Staff
            <span className="ml-1.5 h-4 min-w-4 rounded-full bg-success text-white text-[10px] font-bold flex items-center justify-center px-1">
              {totals.staffOnShift}
            </span>
          </TabsTrigger>
          <TabsTrigger value="alerts">
            Alerts
            {totals.alerts > 0 && (
              <span className="ml-1.5 h-4 min-w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
                {totals.alerts}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="branches">Branches</TabsTrigger>
        </TabsList>

        {/* ── MAP ── */}
        <TabsContent value="map" className="space-y-6">
          {!globalSelectedBranch ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/10 py-16 gap-3">
              <Building2 className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground font-medium">Select a branch from the header to view its live map</p>
            </div>
          ) : (() => {
            const mapBranch = branches.find(b => b.id === globalSelectedBranch.id) ?? null;
            if (!mapBranch) return null;
            const mapTerminals = terminals.filter(t => t.branchId === mapBranch.id);
            const mapShifts = activeShifts.filter(s => s.branchId === mapBranch.id);
            return (
              <div className="space-y-4">
                {/* Branch header */}
                <div className="flex items-center gap-3 px-1">
                  <div className="h-9 w-9 rounded-xl gradient-primary text-primary-foreground flex items-center justify-center shadow-glow flex-shrink-0">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm">{mapBranch.name}</h3>
                    <p className="text-[11px] text-muted-foreground">{mapBranch.city ?? "—"} · {mapBranch.branchCode} · {mapTerminals.length} terminal{mapTerminals.length !== 1 ? "s" : ""}</p>
                  </div>
                  <span className={healthChip(branchHealth(mapBranch.id, terminals))}>{branchHealth(mapBranch.id, terminals)}</span>
                </div>
                {/* Terminal cards — 3 per row */}
                {mapTerminals.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic px-1">No terminals for this branch.</p>
                ) : (
                  <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {mapTerminals.map((t, idx) => {
                      const meta = getStatusMeta(t.status);
                      const shift = mapShifts.find(s => s.terminalId === t.id);
                      const cashier = shift?.cashier ?? t.assignedCashier;
                      const isOffline = t.status === "offline";
                      const noCashier = !cashier;
                      return (
                        <Card key={t.id} className="border-border/60 shadow-card overflow-hidden">
                          {/* ── Issue banner at top ── */}
                          {isOffline && (
                            <div className="flex items-center gap-2 bg-destructive/10 border-b border-destructive/20 px-3 py-2">
                              <WifiOff className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                              <span className="text-[11px] font-semibold text-destructive">Terminal Offline — No connection</span>
                            </div>
                          )}
                          {!isOffline && noCashier && (
                            <div className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/10 border-b border-yellow-200 dark:border-yellow-800 px-3 py-2">
                              <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 flex-shrink-0" />
                              <span className="text-[11px] font-semibold text-yellow-700 dark:text-yellow-400">No cashier assigned</span>
                            </div>
                          )}
                          <div className="p-4 space-y-3">
                            {/* Terminal row */}
                            <div className={`relative flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2 ring-1 ${meta.ring}`}>
                              {(t.status === "active" || t.status === "syncing") && (
                                <span className={`absolute -inset-px rounded-xl ${meta.dot} opacity-10 animate-pulse pointer-events-none`} />
                              )}
                              <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-primary/10 text-primary flex-shrink-0">
                                <ScanBarcode className="h-4 w-4" />
                              </div>
                              <div className="leading-tight min-w-0 flex-1">
                                <div className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-0.5">Terminal {idx + 1}</div>
                                <div className="text-xs font-semibold tabular-nums">{t.terminalCode}</div>
                                <div className="text-[10px] text-muted-foreground truncate">{t.name}</div>
                              </div>
                              <StatusPill status={t.status} />
                            </div>
                            {/* Dashed connector */}
                            <div className="relative h-px">
                              <div className="absolute inset-0 border-t border-dashed border-border" />
                              {(t.status === "active" || t.status === "syncing") && (
                                <span className={`absolute top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full ${meta.dot} shadow-[0_0_8px_currentColor] animate-[ping_1.6s_ease-in-out_infinite]`}
                                  style={{ left: "40%" }} />
                              )}
                            </div>
                            {/* Cashier row */}
                            {cashier ? (
                              <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
                                <div className="relative flex-shrink-0">
                                  <div className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-[10px] font-bold">
                                    {cashier.fullName.split(" ").map((p: string) => p[0]).slice(0, 2).join("")}
                                  </div>
                                  {shift && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success border-2 border-card" />}
                                </div>
                                <div className="leading-tight min-w-0 flex-1">
                                  <div className="text-xs font-semibold truncate">{cashier.fullName}</div>
                                  <div className="text-[10px] text-muted-foreground">
                                    {shift ? `On shift · ${elapsed(shift.openedAt)}` : "Assigned"}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="h-[52px] rounded-xl border border-dashed border-border/40 bg-muted/10" />
                            )}
                            {/* View button */}
                            <div className="flex justify-end pt-0.5">
                              <button disabled className={buttonVariants({ variant: "outline", size: "sm" }) + " gap-1 h-7 text-xs opacity-40 cursor-not-allowed"}>
                                View <ArrowRight className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
          <MiniInsights branches={branches} terminals={terminals} activeShifts={activeShifts} />
        </TabsContent>

        {/* ── BRANCHES ── */}
        <TabsContent value="branches">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredBranches.map(b => (
              <BranchCard key={b.id} branch={b}
                terminals={terminals.filter(t => t.branchId === b.id)}
                users={users.filter(u => u.branchId === b.id)}
                activeShifts={activeShifts.filter(s => s.branchId === b.id)}
              />
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
                    <th className="px-4 py-3 font-semibold">Assigned Cashier</th>
                    <th className="px-4 py-3 font-semibold">Active Shift</th>
                    <th className="px-4 py-3 font-semibold">Uptime</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTerminals.map(t => {
                    const shift = activeShifts.find(s => s.terminalId === t.id);
                    return (
                      <tr key={t.id} className="border-b border-border/40 hover:bg-muted/20 last:border-0">
                        <td className="px-4 py-3 font-semibold font-mono text-primary">{t.terminalCode}</td>
                        <td className="px-4 py-3">
                          <Link
                            to="/control-tower/$branchId" params={{ branchId: t.branchId }}
                            className="text-xs text-primary hover:underline font-medium"
                          >
                            {t.branch?.name ?? branches.find(b => b.id === t.branchId)?.name ?? "—"}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          {t.assignedCashier ? (
                            <div className="flex items-center gap-2">
                              <div className="h-7 w-7 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-[10px] font-bold">
                                {t.assignedCashier.fullName.split(" ").map(p => p[0]).slice(0, 2).join("")}
                              </div>
                              <div className="text-xs font-medium">{t.assignedCashier.fullName}</div>
                            </div>
                          ) : (
                            <Link to="/cashier-shift" className="text-xs text-yellow-600 hover:underline italic flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Assign cashier
                            </Link>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {shift ? (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                                <span className="text-xs text-success font-medium">{shift.cashier?.fullName ?? "Cashier"}</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground tabular-nums">
                                {new Date(shift.openedAt).toLocaleTimeString("en-SA", { hour: "2-digit", minute: "2-digit" })} · {elapsed(shift.openedAt)}
                              </div>
                            </div>
                          ) : (
                            <Link to="/cashier-shift" className="text-xs text-muted-foreground hover:text-primary">No active shift</Link>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                          {t.uptimeMinutes ? `${Math.floor(t.uptimeMinutes / 60)}h ${t.uptimeMinutes % 60}m` : "—"}
                        </td>
                        <td className="px-4 py-3"><StatusPill status={t.status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Link to="/control-tower/$branchId" params={{ branchId: t.branchId }}
                              className={buttonVariants({ variant: "ghost", size: "sm" }) + " h-7 px-2"}
                              title="View branch detail">
                              <Eye className="h-3.5 w-3.5" />
                            </Link>
                            <Link to="/cashier-shift"
                              className={buttonVariants({ variant: "ghost", size: "sm" }) + " h-7 px-2"}
                              title="Manage shifts">
                              <UserCheck className="h-3.5 w-3.5" />
                            </Link>
                            <Button
                              size="sm" variant="ghost" className="h-7 px-2"
                              title={t.status === "active" ? "Set Offline" : "Set Active"}
                              onClick={() => handleTerminalStatusToggle(t)}
                            >
                              {t.status === "active"
                                ? <ToggleRight className="h-3.5 w-3.5 text-success" />
                                : <ToggleLeft className="h-3.5 w-3.5 text-muted-foreground" />}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredTerminals.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">No terminals found.</td></tr>
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
                    <th className="px-4 py-3 font-semibold">Current Shift</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map(u => {
                    const shift = activeShifts.find(s => s.cashierId === u.id);
                    const isOnShift = !!shift;
                    return (
                      <tr key={u.id} className="border-b border-border/40 hover:bg-muted/20 last:border-0">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="relative">
                              <div className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                                {u.fullName.split(" ").map(p => p[0]).slice(0, 2).join("")}
                              </div>
                              {isOnShift && (
                                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-success border-2 border-card" />
                              )}
                            </div>
                            <div>
                              <div className="font-medium text-xs">{u.fullName}</div>
                              <div className="text-[10px] text-muted-foreground">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {u.branchId ? (
                            <Link
                              to="/control-tower/$branchId" params={{ branchId: u.branchId }}
                              className="text-primary hover:underline font-medium"
                            >
                              {u.branchName ?? branches.find(b => b.id === u.branchId)?.name ?? "—"}
                            </Link>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs">{u.roleName ?? "—"}</td>
                        <td className="px-4 py-3">
                          {shift ? (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5 text-xs text-success font-medium">
                                <Clock className="h-3 w-3" />
                                Since {new Date(shift.openedAt).toLocaleTimeString("en-SA", { hour: "2-digit", minute: "2-digit" })} · {elapsed(shift.openedAt)}
                              </div>
                              {shift.terminal && (
                                <div className="text-[10px] text-muted-foreground">{shift.terminal.terminalCode}</div>
                              )}
                              <div className="text-[10px] text-muted-foreground tabular-nums">
                                Cash: <SARIcon />{(shift.openingAmount + shift.cashSales).toFixed(2)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {isOnShift ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                              <CheckCircle2 className="h-3 w-3" /> On Shift
                            </span>
                          ) : u.status === "active" ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              <LogOut className="h-3 w-3" /> Checked Out
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              <XCircle className="h-3 w-3" /> Inactive
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isOnShift ? (
                              <>
                                <Link to="/cashier-shift"
                                  className={buttonVariants({ variant: "ghost", size: "sm" }) + " h-7 px-2 text-[11px] gap-1 text-success"}
                                  title="View shift">
                                  <Clock className="h-3 w-3" />
                                  {shift?.terminal?.terminalCode ?? "Shift"}
                                </Link>
                                <Link to="/cashier-shift"
                                  className={buttonVariants({ variant: "outline", size: "sm" }) + " h-7 px-2 text-[11px] gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"}
                                  title="Check out this cashier">
                                  <LogOut className="h-3 w-3" />Check Out
                                </Link>
                              </>
                            ) : u.status === "active" ? (
                              <Link to="/cashier-shift"
                                className={buttonVariants({ variant: "outline", size: "sm" }) + " h-7 px-2 text-[11px] gap-1"}
                                title="Check in this cashier">
                                <LogIn className="h-3 w-3" />Check In
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredUsers.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No staff found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ── ALERTS ── */}
        <TabsContent value="alerts">
          <AlertsPanel terminals={terminals} branches={branches} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

// ─── Hero pill ────────────────────────────────────────────────────────────────
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

// ─── Branch diagram (live map) ─────────────────────────────────────────────────
function BranchDiagram({ branch, terminals, users, activeShifts }: {
  branch: Branch; terminals: Terminal[]; users: User[]; activeShifts: CashierShift[];
}) {
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
        <button disabled className={buttonVariants({ variant: "outline", size: "sm" }) + " gap-1.5 opacity-40 cursor-not-allowed"}>
          View <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="relative p-5">
        <div className="grid grid-cols-3 gap-2 mb-5">
          <MiniStat label="Terminals" value={terminals.length} />
          <MiniStat label="Active" value={terminals.filter(t => t.status === "active").length} />
          <MiniStat label="On Shift" value={activeShifts.length} />
        </div>
        <div className="space-y-3">
          {terminals.map(t => {
            const meta = getStatusMeta(t.status);
            const shift = activeShifts.find(s => s.terminalId === t.id);
            const cashier = shift?.cashier ?? t.assignedCashier;
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
                    <span className={`absolute top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full ${meta.dot} shadow-[0_0_8px_currentColor] animate-[ping_1.6s_ease-in-out_infinite]`}
                      style={{ left: "30%" }} />
                  )}
                </div>
                {cashier ? (
                  <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 min-w-[180px]">
                    <div className="relative">
                      <div className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-[10px] font-bold">
                        {cashier.fullName.split(" ").map(p => p[0]).slice(0, 2).join("")}
                      </div>
                      {shift && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success border-2 border-card" />}
                    </div>
                    <div className="leading-tight min-w-0">
                      <div className="text-xs font-semibold truncate">{cashier.fullName}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {shift ? `On shift · ${elapsed(shift.openedAt)}` : "Assigned"}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl border border-dashed border-yellow-300 bg-yellow-50 dark:bg-yellow-900/10 px-3 py-2 min-w-[180px]">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <div className="text-[11px] text-yellow-700 dark:text-yellow-400 font-medium">No cashier</div>
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

// ─── Branch cards ─────────────────────────────────────────────────────────────
function BranchCard({ branch, terminals, users, activeShifts }: {
  branch: Branch; terminals: Terminal[]; users: User[]; activeShifts: CashierShift[];
}) {
  const health = branchHealth(branch.id, terminals);
  const active = terminals.filter(t => t.status === "active").length;
  const offline = terminals.filter(t => t.status === "offline").length;
  return (
    <Card className="p-5 border-border/60 shadow-card hover:shadow-elegant transition-all">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl gradient-primary text-primary-foreground flex items-center justify-center">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm">{branch.name}</h3>
            <p className="text-[11px] text-muted-foreground">{branch.branchCode} · {branch.city ?? "—"}</p>
          </div>
        </div>
        <span className={healthChip(health)}>{health}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <StatRow label="Status" value={branch.status} />
        <StatRow label="Staff" value={String(users.length)} />
        <StatRow label="Active Terminals" value={`${active} / ${terminals.length}`} />
        <StatRow label="On Shift" value={String(activeShifts.length)} />
        <StatRow label="Offline" value={String(offline)} tone={offline > 0 ? "warn" : undefined} />
        <StatRow label="Cash in Drawers" value={<><SARIcon />{activeShifts.reduce((a, s) => a + s.openingAmount + s.cashSales, 0).toFixed(0)}</>} />
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Link to="/control-tower/$branchId" params={{ branchId: branch.id }}
          className={buttonVariants({ variant: "outline", size: "sm" })}>
          View Details
        </Link>
        <Link to="/cashier-shift"
          className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Shifts
        </Link>
        <Link to="/orders"
          className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Orders
        </Link>
      </div>
    </Card>
  );
}

function StatRow({ label, value, tone }: { label: string; value: ReactNode; tone?: "warn" }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/30 px-2.5 py-1.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={`font-semibold tabular-nums text-xs ${tone === "warn" ? "text-destructive" : ""}`}>{value}</span>
    </div>
  );
}

// ─── Mini insights ────────────────────────────────────────────────────────────
function MiniInsights({ branches, terminals, activeShifts }: { branches: Branch[]; terminals: Terminal[]; activeShifts: CashierShift[] }) {
  const fullyOp = branches.filter(b => {
    const bt = terminals.filter(t => t.branchId === b.id);
    return bt.length === 0 || bt.every(t => t.status !== "offline");
  }).length;

  const insights = [
    { label: "Total Branches",    value: String(branches.length),                                        icon: Building2 },
    { label: "Total Terminals",   value: String(terminals.length),                                       icon: Activity },
    { label: "Offline Terminals", value: String(terminals.filter(t => t.status === "offline").length),  icon: WifiOff },
    { label: "Shifts Open",       value: String(activeShifts.length),                                    icon: Clock },
    { label: "Cash in Drawers",   value: <><SARIcon />{activeShifts.reduce((a, s) => a + s.openingAmount + s.cashSales, 0).toFixed(0)}</>, icon: Zap },
    { label: "Fully Operational", value: `${fullyOp} / ${branches.length}`,                              icon: ShieldCheck },
  ];
  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
      {insights.map(i => (
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

// ─── Alerts panel ─────────────────────────────────────────────────────────────
function AlertsPanel({ terminals, branches }: { terminals: Terminal[]; branches: Branch[] }) {
  const offline     = terminals.filter(t => t.status === "offline");
  const unassigned  = terminals.filter(t => t.status === "active" && !t.assignedCashierId);

  if (offline.length === 0 && unassigned.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 rounded-2xl border border-success/30 bg-success/5 text-success text-sm font-medium gap-2">
        <ShieldCheck className="h-5 w-5" /> No active alerts — all systems nominal.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {offline.map(t => (
        <div key={t.id} className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-center gap-2 font-semibold text-sm text-destructive">
            <WifiOff className="h-4 w-4" /> Terminal Offline
          </div>
          <div className="mt-2 text-xs text-foreground/80 space-y-0.5">
            <div><span className="text-muted-foreground">Terminal:</span> <span className="tabular-nums font-mono">{t.terminalCode}</span></div>
            <div><span className="text-muted-foreground">Branch:</span> {t.branch?.name ?? branches.find(b => b.id === t.branchId)?.name ?? "—"}</div>
            <div><span className="text-muted-foreground">Name:</span> {t.name}</div>
          </div>
          <Link to="/control-tower/$branchId" params={{ branchId: t.branchId }}
            className={buttonVariants({ variant: "outline", size: "sm" }) + " mt-3 h-7 text-xs"}>
            View Branch <ArrowRight className="h-3 w-3 ml-1" />
          </Link>
        </div>
      ))}
      {unassigned.map(t => (
        <div key={t.id} className="rounded-2xl border border-yellow-300 bg-yellow-50 dark:bg-yellow-900/10 p-4">
          <div className="flex items-center gap-2 font-semibold text-sm text-yellow-700 dark:text-yellow-400">
            <AlertTriangle className="h-4 w-4" /> Unassigned Active Terminal
          </div>
          <div className="mt-2 text-xs text-foreground/80 space-y-0.5">
            <div><span className="text-muted-foreground">Terminal:</span> <span className="tabular-nums font-mono">{t.terminalCode}</span></div>
            <div><span className="text-muted-foreground">Branch:</span> {t.branch?.name ?? branches.find(b => b.id === t.branchId)?.name ?? "—"}</div>
          </div>
          <Link to="/cashier-shift"
            className={buttonVariants({ variant: "outline", size: "sm" }) + " mt-3 h-7 text-xs"}>
            Assign via Check-In <ArrowRight className="h-3 w-3 ml-1" />
          </Link>
        </div>
      ))}
    </div>
  );
}
