import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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

export const Route = createFileRoute("/_app/control-tower")({
  component: ControlTower,
});

/* ──────────────────────────── pseudo data ──────────────────────────── */

type Status = "active" | "syncing" | "offline" | "idle";
type DeviceType = "POS" | "Mobile POS";

type Employee = {
  id: string;
  name: string;
  role: string;
  loggedIn: boolean;
  loginTime?: string;
  logoutTime?: string;
  device: DeviceType;
  terminalId?: string;
  alert?: "none" | "no-logout" | "multi-session" | "device-switched";
};

type Terminal = {
  id: string;
  type: DeviceType;
  status: Status;
  lastSync: string;
  sessionMins: number;
  employeeId?: string;
  alert?: "unassigned-active" | "stale";
};

type Branch = {
  id: string;
  name: string;
  location: string;
  manager: string;
  terminals: Terminal[];
  employees: Employee[];
};

const BRANCHES: Branch[] = [
  {
    id: "ryd-central",
    name: "Riyadh Central Bakala",
    location: "Olaya, Riyadh",
    manager: "Abdullah Al-Faisal",
    employees: [
      { id: "E-101", name: "Fahad Al-Qahtani", role: "Cashier", loggedIn: true, loginTime: "07:55", device: "POS", terminalId: "TML-RYD-001" },
      { id: "E-102", name: "Mohammed Al-Harbi", role: "Cashier", loggedIn: true, loginTime: "08:10", device: "POS", terminalId: "TML-RYD-002" },
      { id: "E-103", name: "Saad Al-Shehri", role: "Senior Cashier", loggedIn: true, loginTime: "07:40", device: "Mobile POS", terminalId: "MPOS-RYD-001", alert: "multi-session" },
      { id: "E-104", name: "Yousef Al-Ghamdi", role: "Supervisor", loggedIn: false, logoutTime: "—", device: "POS", alert: "no-logout" },
    ],
    terminals: [
      { id: "TML-RYD-001", type: "POS", status: "active", lastSync: "12s ago", sessionMins: 184, employeeId: "E-101" },
      { id: "TML-RYD-002", type: "POS", status: "syncing", lastSync: "now", sessionMins: 142, employeeId: "E-102" },
      { id: "TML-RYD-003", type: "POS", status: "idle", lastSync: "6m ago", sessionMins: 0 },
      { id: "MPOS-RYD-001", type: "Mobile POS", status: "active", lastSync: "8s ago", sessionMins: 96, employeeId: "E-103" },
      { id: "MPOS-RYD-002", type: "Mobile POS", status: "offline", lastSync: "22m ago", sessionMins: 0, alert: "stale" },
    ],
  },
  {
    id: "jed-mart-02",
    name: "Jeddah Mart 02",
    location: "Al Hamra, Jeddah",
    manager: "Sultan Al-Dossari",
    employees: [
      { id: "E-201", name: "Sultan Al-Dossari", role: "Manager", loggedIn: true, loginTime: "09:00", device: "POS", terminalId: "TML-JED-001" },
      { id: "E-202", name: "Khalid Al-Otaibi", role: "Cashier", loggedIn: true, loginTime: "08:30", device: "POS", terminalId: "TML-JED-002" },
      { id: "E-203", name: "Nawaf Al-Mutairi", role: "Cashier", loggedIn: true, loginTime: "09:15", device: "Mobile POS", terminalId: "MPOS-JED-001" },
    ],
    terminals: [
      { id: "TML-JED-001", type: "POS", status: "active", lastSync: "4s ago", sessionMins: 132, employeeId: "E-201" },
      { id: "TML-JED-002", type: "POS", status: "active", lastSync: "11s ago", sessionMins: 168, employeeId: "E-202" },
      { id: "TML-JED-003", type: "POS", status: "syncing", lastSync: "now", sessionMins: 24, alert: "unassigned-active" },
      { id: "MPOS-JED-001", type: "Mobile POS", status: "active", lastSync: "5s ago", sessionMins: 78, employeeId: "E-203" },
    ],
  },
  {
    id: "dmm-express",
    name: "Dammam Express Bakala",
    location: "Al Shati, Dammam",
    manager: "Bandar Al-Anzi",
    employees: [
      { id: "E-301", name: "Bandar Al-Anzi", role: "Manager", loggedIn: true, loginTime: "10:15", device: "POS", terminalId: "TML-DMM-001" },
      { id: "E-302", name: "Turki Al-Rashid", role: "Cashier", loggedIn: true, loginTime: "10:20", device: "Mobile POS", terminalId: "MPOS-DMM-002" },
    ],
    terminals: [
      { id: "TML-DMM-001", type: "POS", status: "active", lastSync: "9s ago", sessionMins: 72, employeeId: "E-301" },
      { id: "TML-DMM-002", type: "POS", status: "offline", lastSync: "1h ago", sessionMins: 0, alert: "stale" },
      { id: "MPOS-DMM-002", type: "Mobile POS", status: "syncing", lastSync: "now", sessionMins: 36, employeeId: "E-302" },
    ],
  },
  {
    id: "mak-neighborhood",
    name: "Makkah Neighborhood Mart",
    location: "Al Aziziyah, Makkah",
    manager: "Rakan Al-Subaie",
    employees: [
      { id: "E-401", name: "Rakan Al-Subaie", role: "Manager", loggedIn: true, loginTime: "07:00", device: "POS", terminalId: "TML-MAK-001" },
      { id: "E-402", name: "Hassan Al-Zahrani", role: "Cashier", loggedIn: true, loginTime: "07:05", device: "POS", terminalId: "TML-MAK-002" },
      { id: "E-403", name: "Majed Al-Balawi", role: "Cashier", loggedIn: false, device: "Mobile POS" },
    ],
    terminals: [
      { id: "TML-MAK-001", type: "POS", status: "active", lastSync: "3s ago", sessionMins: 240, employeeId: "E-401" },
      { id: "TML-MAK-002", type: "POS", status: "active", lastSync: "6s ago", sessionMins: 235, employeeId: "E-402" },
      { id: "MPOS-MAK-001", type: "Mobile POS", status: "idle", lastSync: "11m ago", sessionMins: 0 },
    ],
  },
];

/* ──────────────────────────── helpers ──────────────────────────── */

const STATUS_META: Record<Status, { label: string; dot: string; chip: string; ring: string }> = {
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

function StatusPill({ status }: { status: Status }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${m.chip}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${m.dot} ${status === "active" || status === "syncing" ? "animate-pulse" : ""}`} />
      {m.label}
    </span>
  );
}

function branchHealth(b: Branch): "Fully Operational" | "Partially Active" | "Attention Required" | "Offline Issue" {
  const off = b.terminals.filter((t) => t.status === "offline").length;
  const total = b.terminals.length;
  if (off === 0) return "Fully Operational";
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
  const [deviceFilter, setDeviceFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const totals = useMemo(() => {
    const terms = BRANCHES.flatMap((b) => b.terminals);
    const emps = BRANCHES.flatMap((b) => b.employees);
    return {
      branches: BRANCHES.length,
      active: terms.filter((t) => t.status === "active").length,
      syncing: terms.filter((t) => t.status === "syncing").length,
      offline: terms.filter((t) => t.status === "offline").length,
      idle: terms.filter((t) => t.status === "idle").length,
      loggedIn: emps.filter((e) => e.loggedIn).length,
      pos: terms.filter((t) => t.type === "POS" && t.status !== "offline" && t.status !== "idle").length,
      mpos: terms.filter((t) => t.type === "Mobile POS" && t.status !== "offline" && t.status !== "idle").length,
    };
  }, []);

  const ALL_CARDS = [
    "Branches", "Active Terminals", "Syncing", "Offline",
    "Idle", "Employees Logged In", "POS In Use", "Mobile POS In Use",
  ];
  const cards = useCustomizableCards("baqala_control_tower_cards", ALL_CARDS);

  const cardMap: Record<string, JSX.Element> = {
    "Branches": <MetricCard label="Branches" value={String(totals.branches)} icon={Building2} accent="primary" hint="all KSA" editing={cards.editing} onRemove={() => cards.remove("Branches")} />,
    "Active Terminals": <MetricCard label="Active Terminals" value={String(totals.active)} icon={Activity} accent="success" delta="+3" trend="up" editing={cards.editing} onRemove={() => cards.remove("Active Terminals")} />,
    "Syncing": <MetricCard label="Syncing" value={String(totals.syncing)} icon={RefreshCw} accent="primary" hint="live sync" editing={cards.editing} onRemove={() => cards.remove("Syncing")} />,
    "Offline": <MetricCard label="Offline" value={String(totals.offline)} icon={WifiOff} accent="destructive" delta="−1" trend="down" editing={cards.editing} onRemove={() => cards.remove("Offline")} />,
    "Idle": <MetricCard label="Idle" value={String(totals.idle)} icon={CircleDot} hint="no activity" editing={cards.editing} onRemove={() => cards.remove("Idle")} />,
    "Employees Logged In": <MetricCard label="Employees Logged In" value={String(totals.loggedIn)} icon={Users} accent="primary" editing={cards.editing} onRemove={() => cards.remove("Employees Logged In")} />,
    "POS In Use": <MetricCard label="POS In Use" value={String(totals.pos)} icon={ScanBarcode} accent="success" editing={cards.editing} onRemove={() => cards.remove("POS In Use")} />,
    "Mobile POS In Use": <MetricCard label="Mobile POS In Use" value={String(totals.mpos)} icon={Smartphone} accent="success" editing={cards.editing} onRemove={() => cards.remove("Mobile POS In Use")} />,
  };

  const filteredBranches = useMemo(() => {
    return BRANCHES.filter((b) => branchFilter === "all" || b.id === branchFilter);
  }, [branchFilter]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return BRANCHES.flatMap((b) =>
      b.employees.map((e) => ({ ...e, branch: b.name, branchId: b.id })),
    ).filter((e) => {
      if (branchFilter !== "all" && e.branchId !== branchFilter) return false;
      if (deviceFilter !== "all" && e.device !== deviceFilter) return false;
      if (statusFilter === "logged-in" && !e.loggedIn) return false;
      if (statusFilter === "logged-out" && e.loggedIn) return false;
      if (q && !`${e.name} ${e.id} ${e.role}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [branchFilter, deviceFilter, statusFilter, search]);

  const filteredTerminals = useMemo(() => {
    return BRANCHES.flatMap((b) =>
      b.terminals.map((t) => ({ ...t, branch: b.name, branchId: b.id, emp: b.employees.find((e) => e.id === t.employeeId) })),
    ).filter((t) => {
      if (branchFilter !== "all" && t.branchId !== branchFilter) return false;
      if (deviceFilter !== "all" && t.type !== deviceFilter) return false;
      if (statusFilter !== "all" && statusFilter !== "logged-in" && statusFilter !== "logged-out" && t.status !== statusFilter) return false;
      return true;
    });
  }, [branchFilter, deviceFilter, statusFilter]);

  return (
    <PageShell
      title="Operations Visibility Center"
      subtitle="Live branch · terminal · workforce control tower"
      actions={
        <div className="flex items-center gap-2">
          {cards.Controls}
          <span className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse" /> Live · updated 4s ago
          </span>
          <Button variant="outline" size="sm" className="gap-1.5"><RefreshCw className="h-3.5 w-3.5" />Refresh</Button>
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
              <p className="text-sm text-white/80 mt-0.5">{totals.branches} branches · {totals.active + totals.syncing} live terminals · {totals.loggedIn} employees on shift</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <HeroPill icon={ShieldCheck} label="Uptime" value="99.8%" />
            <HeroPill icon={Activity} label="Active" value={String(totals.active)} />
            <HeroPill icon={WifiOff} label="Offline" value={String(totals.offline)} tone="danger" />
            <HeroPill icon={Users} label="On Shift" value={String(totals.loggedIn)} />
          </div>
        </div>
      </div>

      {/* Top summary cards (customizable) */}
      {cards.visible.length === 0 ? (
        <Card className="p-8 text-center border-dashed border-border/60">
          <p className="text-sm text-muted-foreground">No KPI cards visible. Click <span className="font-semibold">Add / Remove</span> to add some back.</p>
        </Card>
      ) : (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
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
              placeholder="Search employee, terminal, branch…"
              className="pl-9 h-9 bg-muted/40 border-transparent focus-visible:bg-card"
            />
          </div>
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue placeholder="Branch" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {BRANCHES.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
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
              <SelectItem value="logged-in">Logged In</SelectItem>
              <SelectItem value="logged-out">Logged Out</SelectItem>
            </SelectContent>
          </Select>
          <Select value={deviceFilter} onValueChange={setDeviceFilter}>
            <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Device" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Devices</SelectItem>
              <SelectItem value="POS">POS</SelectItem>
              <SelectItem value="Mobile POS">Mobile POS</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="map">Live Map</TabsTrigger>
          <TabsTrigger value="branches">Branches</TabsTrigger>
          <TabsTrigger value="terminals">Terminals</TabsTrigger>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        {/* ── MAP ── */}
        <TabsContent value="map" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredBranches.map((b) => <BranchDiagram key={b.id} branch={b} />)}
          </div>
          <MiniInsights />
        </TabsContent>

        {/* ── BRANCHES ── */}
        <TabsContent value="branches">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredBranches.map((b) => <BranchCard key={b.id} branch={b} />)}
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
                    <th className="px-4 py-3 font-semibold">Type</th>
                    <th className="px-4 py-3 font-semibold">Current Employee</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Last Sync</th>
                    <th className="px-4 py-3 font-semibold">Session</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTerminals.map((t) => (
                    <tr key={t.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                      <td className="px-4 py-3 font-semibold tabular-nums">{t.id}</td>
                      <td className="px-4 py-3 text-muted-foreground">{t.branch}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="gap-1 font-normal">
                          {t.type === "POS" ? <ScanBarcode className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
                          {t.type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {t.emp ? (
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-[10px] font-bold">
                              {t.emp.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                            </div>
                            <div className="leading-tight">
                              <div className="font-medium text-xs">{t.emp.name}</div>
                              <div className="text-[10px] text-muted-foreground">{t.emp.role}</div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">— unassigned —</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><StatusPill status={t.status} /></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">{t.lastSync}</td>
                      <td className="px-4 py-3 text-xs tabular-nums">{t.sessionMins > 0 ? `${Math.floor(t.sessionMins / 60)}h ${t.sessionMins % 60}m` : "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="ghost" className="h-7 px-2"><Eye className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2"><RefreshCw className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2"><Wrench className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ── EMPLOYEES ── */}
        <TabsContent value="employees">
          <Card className="overflow-hidden border-border/60 shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-semibold">Employee</th>
                    <th className="px-4 py-3 font-semibold">Branch</th>
                    <th className="px-4 py-3 font-semibold">Device</th>
                    <th className="px-4 py-3 font-semibold">Terminal</th>
                    <th className="px-4 py-3 font-semibold">Login</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.map((e) => (
                    <tr key={e.id + e.branchId} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                            {e.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                          </div>
                          <div>
                            <div className="font-medium text-xs">{e.name}</div>
                            <div className="text-[10px] text-muted-foreground">{e.id} · {e.role}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{e.branch}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="gap-1 font-normal">
                          {e.device === "POS" ? <ScanBarcode className="h-3 w-3" /> : <Smartphone className="h-3 w-3" />}
                          {e.device}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums">{e.terminalId ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">{e.loginTime ?? "—"}</td>
                      <td className="px-4 py-3">
                        {e.alert === "no-logout" ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                            <AlertTriangle className="h-3 w-3" /> Action Required
                          </span>
                        ) : e.alert === "multi-session" ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning-foreground">
                            <Zap className="h-3 w-3" /> Multiple Sessions
                          </span>
                        ) : e.loggedIn ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                            <LogIn className="h-3 w-3" /> Active Session
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            <LogOut className="h-3 w-3" /> Signed Off
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ── ALERTS ── */}
        <TabsContent value="alerts">
          <AlertsPanel />
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

function BranchDiagram({ branch }: { branch: Branch }) {
  const health = branchHealth(branch);
  const loggedIn = branch.employees.filter((e) => e.loggedIn).length;
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
            <p className="text-[11px] text-muted-foreground">{branch.location} · {branch.manager}</p>
          </div>
        </div>
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <Link to="/control-tower/$branchId" params={{ branchId: branch.id }}>
            View <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>

      <div className="relative p-5">
        {/* mini stats */}
        <div className="grid grid-cols-4 gap-2 mb-5">
          <MiniStat label="Terminals" value={branch.terminals.length} />
          <MiniStat label="Working" value={loggedIn} />
          <MiniStat label="POS" value={branch.terminals.filter((t) => t.type === "POS").length} />
          <MiniStat label="MPOS" value={branch.terminals.filter((t) => t.type === "Mobile POS").length} />
        </div>

        {/* connection diagram */}
        <div className="relative">
          <div className="space-y-3">
            {branch.terminals.map((t) => {
              const emp = branch.employees.find((e) => e.id === t.employeeId);
              const meta = STATUS_META[t.status];
              return (
                <div key={t.id} className="relative flex items-center gap-3">
                  {/* terminal node */}
                  <div className={`relative flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2 min-w-[170px] ring-1 ${meta.ring}`}>
                    {(t.status === "active" || t.status === "syncing") && (
                      <span className={`absolute -inset-px rounded-xl ${meta.dot} opacity-10 animate-pulse pointer-events-none`} />
                    )}
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${t.type === "POS" ? "bg-primary/10 text-primary" : "bg-accent/40 text-foreground"}`}>
                      {t.type === "POS" ? <ScanBarcode className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                    </div>
                    <div className="leading-tight">
                      <div className="text-xs font-semibold tabular-nums">{t.id}</div>
                      <StatusPill status={t.status} />
                    </div>
                  </div>

                  {/* connector */}
                  <div className="flex-1 relative h-px">
                    <div className="absolute inset-0 border-t border-dashed border-border" />
                    {(t.status === "active" || t.status === "syncing") && (
                      <span
                        className={`absolute top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full ${meta.dot} shadow-[0_0_8px_currentColor] animate-[ping_1.6s_ease-in-out_infinite]`}
                        style={{ left: "30%" }}
                      />
                    )}
                  </div>

                  {/* employee node */}
                  {emp ? (
                    <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 min-w-[180px]">
                      <div className="h-8 w-8 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-[10px] font-bold">
                        {emp.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                      </div>
                      <div className="leading-tight min-w-0">
                        <div className="text-xs font-semibold truncate">{emp.name}</div>
                        <div className="text-[10px] text-muted-foreground">{emp.role} · {emp.loginTime ?? "—"}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-xl border border-dashed border-warning/40 bg-warning/5 px-3 py-2 min-w-[180px]">
                      <AlertTriangle className="h-4 w-4 text-warning-foreground" />
                      <div className="text-[11px] text-warning-foreground font-medium">
                        {t.status === "active" ? "Unassigned Active" : "No employee"}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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

function BranchCard({ branch }: { branch: Branch }) {
  const health = branchHealth(branch);
  const loggedIn = branch.employees.filter((e) => e.loggedIn).length;
  const active = branch.terminals.filter((t) => t.status === "active").length;
  const offline = branch.terminals.filter((t) => t.status === "offline").length;
  return (
    <Card className="p-5 border-border/60 shadow-card hover:shadow-elegant transition-all">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl gradient-primary text-primary-foreground flex items-center justify-center"><Building2 className="h-5 w-5" /></div>
          <div>
            <h3 className="font-bold text-sm">{branch.name}</h3>
            <p className="text-[11px] text-muted-foreground">{branch.id} · {branch.location}</p>
          </div>
        </div>
        <span className={healthChip(health)}>{health}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <Row label="Manager" value={branch.manager} />
        <Row label="Employees" value={`${loggedIn} / ${branch.employees.length}`} />
        <Row label="Active Terminals" value={`${active} / ${branch.terminals.length}`} />
        <Row label="Offline" value={String(offline)} tone={offline > 0 ? "warn" : undefined} />
        <Row label="POS" value={String(branch.terminals.filter((t) => t.type === "POS").length)} />
        <Row label="Mobile POS" value={String(branch.terminals.filter((t) => t.type === "Mobile POS").length)} />
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Button asChild size="sm" variant="outline" className="h-8">
          <Link to="/control-tower/$branchId" params={{ branchId: branch.id }}>View Details</Link>
        </Button>
        <Button size="sm" variant="ghost" className="h-8">Terminals</Button>
        <Button size="sm" variant="ghost" className="h-8">Employees</Button>
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

function MiniInsights() {
  const insights = [
    { label: "Employees on TML-RYD-001", value: "1", icon: Users },
    { label: "Riyadh Active Employees", value: "3", icon: Users },
    { label: "Jeddah Active Terminals", value: "3", icon: TerminalIcon },
    { label: "Mobile POS in Use Today", value: "3", icon: Smartphone },
    { label: "Branches Fully Operational", value: "2 / 4", icon: Building2 },
    { label: "Unassigned Active Terminals", value: "1", icon: AlertTriangle },
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

function AlertsPanel() {
  const alerts = [
    { type: "Unassigned Active Terminal", terminal: "TML-JED-003", branch: "Jeddah Mart 02", level: "warn", icon: AlertTriangle },
    { type: "Employee Not Logged Out", terminal: "—", branch: "Riyadh Central Bakala", emp: "Yousef Al-Ghamdi", level: "danger", icon: LogOut },
    { type: "Device Offline During Active Shift", terminal: "TML-DMM-002", branch: "Dammam Express Bakala", level: "danger", icon: WifiOff },
    { type: "Multiple Active Sessions", terminal: "MPOS-RYD-001", branch: "Riyadh Central Bakala", emp: "Saad Al-Shehri", level: "warn", icon: Zap },
    { type: "Sync Pending", terminal: "MPOS-DMM-002", branch: "Dammam Express Bakala", level: "info", icon: RefreshCw },
    { type: "Terminal Inactive Too Long", terminal: "TML-RYD-003", branch: "Riyadh Central Bakala", level: "info", icon: CircleDot },
  ];
  const toneMap: Record<string, string> = {
    danger: "border-destructive/30 bg-destructive/5 text-destructive",
    warn: "border-warning/40 bg-warning/10 text-warning-foreground",
    info: "border-primary/30 bg-primary/5 text-primary",
  };
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {alerts.map((a, i) => (
        <div key={i} className={`rounded-2xl border p-4 ${toneMap[a.level]}`}>
          <div className="flex items-center gap-2 font-semibold text-sm">
            <a.icon className="h-4 w-4" /> {a.type}
          </div>
          <div className="mt-2 text-xs text-foreground/80 space-y-0.5">
            <div><span className="text-muted-foreground">Branch:</span> {a.branch}</div>
            {a.terminal !== "—" && <div><span className="text-muted-foreground">Terminal:</span> <span className="tabular-nums">{a.terminal}</span></div>}
            {a.emp && <div><span className="text-muted-foreground">Employee:</span> {a.emp}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export { BRANCHES };