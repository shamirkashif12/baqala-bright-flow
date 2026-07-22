import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { cn } from "@/lib/utils";
import { api, type DashboardMetrics, type CashierShift, type Branch, type InventoryStock, type Terminal, type InventoryDashboardReport, type InventoryMoverRow } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { MetricCard } from "@/components/metric-card";
import { useAuth } from "@/lib/auth";
import {
  Wallet, ShoppingBag, Terminal as TerminalIcon, CalendarClock,
  Truck, Users, Clock3, PackageCheck, PackageX, Package, ArrowRight,
  LayoutDashboard, Timer, Warehouse, Undo2, Cigarette, Settings2,
  TrendingUp, TrendingDown, Boxes, AlertTriangle, ShoppingCart, Ban, RefreshCw, type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({ component: Dashboard });

const firstOfMonthStr = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const todayStr = () => new Date().toISOString().slice(0, 10);

const PERIOD_MAP: Record<string, string> = { Daily: "today", Weekly: "week", Monthly: "month" };
const periods = ["Daily", "Weekly", "Monthly", "Custom"] as const;
const STORAGE_KEY = "dashboard_visible_cards";

type StatCardDef = {
  id: string;
  label: string;
  value: string;
  desc: string;
  icon: LucideIcon;
  href: string;
  action: string;
  accent?: "primary" | "success" | "warning" | "destructive";
  change?: number;
};

function shiftDuration(openedAt: string): string {
  const ms = Date.now() - new Date(openedAt).getTime();
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
}

const ALL_CARD_IDS = [
  "pending_orders", "processing_orders", "ready_to_deliver", "delivered_orders",
  "todays_sales", "active_cashiers", "active_terminals",
  "low_stock", "near_expiry",
];

// Trend badges show a REAL % change vs the equivalent prior period (computed
// server-side in DashboardController.GetMetrics), not a fabricated number.
// Cards for live snapshots (open shifts right now, terminal status, current
// stock levels) intentionally have no `change` — there's no historical
// snapshot series to compare those against, so no badge is more honest than
// inventing one.
function buildCards(data: DashboardMetrics): StatCardDef[] {
  const offlineTerminals = data.terminals.total - data.terminals.active;
  return [
    {
      id: "pending_orders",
      label: "Pending Orders", value: String(data.orders.pending),
      desc: "Orders awaiting confirmation",
      icon: Clock3, href: "/orders", action: "View orders", accent: "warning",
      change: data.orders.pendingDeltaPct,
    },
    {
      id: "processing_orders",
      label: "Processing Orders", value: String(data.orders.processing),
      desc: "Currently being prepared",
      icon: ShoppingBag, href: "/orders", action: "Manage", accent: "primary",
      change: data.orders.processingDeltaPct,
    },
    {
      id: "ready_to_deliver",
      label: "Ready to Deliver", value: String(data.orders.readyToDeliver),
      desc: "Packed & waiting for pickup",
      icon: PackageCheck, href: "/orders", action: "Dispatch", accent: "primary",
      change: data.orders.readyToDeliverDeltaPct,
    },
    {
      id: "delivered_orders",
      label: "Delivered Orders", value: String(data.orders.delivered),
      desc: "Completed deliveries today",
      icon: Truck, href: "/orders", action: "History", accent: "success",
      change: data.orders.deliveredDeltaPct,
    },
    {
      id: "todays_sales",
      label: "Today's Sales",
      value: fmtSAR(data.sales.totalToday),
      desc: `Gross sales across ${data.branchPerformance?.length ?? 1} branches`,
      icon: Wallet, href: "/sales", action: "Sales report", accent: "primary",
      change: data.sales.totalTodayDeltaPct,
    },
    {
      id: "active_cashiers",
      label: "Active Cashiers",
      value: `${data.shifts.active} / ${data.shifts.totalCashiers}`,
      desc: "Checked-in this shift",
      icon: Users, href: "/cashier-shift", action: "Shifts", accent: "primary",
    },
    {
      id: "active_terminals",
      label: "Active Terminals",
      value: `${data.terminals.active} / ${data.terminals.total}`,
      desc: offlineTerminals > 0 ? `${offlineTerminals} offline` : "All terminals online",
      icon: TerminalIcon, href: "/terminals", action: "Terminals",
      accent: offlineTerminals > 0 ? "warning" : "primary",
    },
    {
      id: "low_stock",
      label: "Low Stock Items", value: String(data.inventory.lowStockCount),
      desc: `${data.inventory.outOfStockCount} out of stock`,
      icon: PackageX, href: "/inventory", action: "Restock", accent: "destructive",
    },
    {
      id: "near_expiry",
      label: "Close to Expiry", value: String(data.inventory.expiringCount),
      desc: "Expiring in next 7 days",
      icon: CalendarClock, href: "/batches", action: "Review", accent: "warning",
    },
  ];
}

function StatCard({ c }: { c: StatCardDef }) {
  const accent = c.accent ?? "primary";
  const CardIcon = c.icon;
  const iconBg = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    destructive: "bg-destructive/15 text-destructive",
  }[accent];
  const hasChange = c.change !== undefined;
  const positive = (c.change ?? 0) >= 0;

  return (
    <Card className="relative p-5 border-border/60 shadow-card hover:shadow-elegant transition-shadow flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", iconBg)}>
          <CardIcon className="h-5 w-5" />
        </div>
        {hasChange && (
          <span className={cn(
            "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold",
            positive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
          )}>
            {positive ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
            {positive ? "+" : ""}{c.change}%
          </span>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{c.label}</p>
        <p className="text-2xl md:text-3xl font-bold tracking-tight mt-1">{c.value}</p>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{c.desc}</p>
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
        <span className="text-muted-foreground">Updated live</span>
        <Link to={c.href as any} className="text-primary font-semibold hover:underline inline-flex items-center gap-0.5">
          {c.action} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </Card>
  );
}

function AlertCard({ tone, icon: Icon, label, value, hint, href }: {
  tone: "primary" | "success" | "warning" | "destructive";
  icon: LucideIcon; label: string; value: string; hint: string; href: string;
}) {
  const toneMap = {
    primary: "bg-primary/5 border-primary/30 text-primary",
    success: "bg-success/10 border-success/30 text-success",
    warning: "bg-warning/15 border-warning/40 text-warning-foreground",
    destructive: "bg-destructive/10 border-destructive/30 text-destructive",
  }[tone];
  return (
    <Link to={href as any}>
      <Card className={cn("p-4 border-2 hover:shadow-elegant transition-all flex items-center gap-3", toneMap)}>
        <div className="h-11 w-11 rounded-xl bg-background/70 flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider font-bold opacity-80">{label}</p>
          <p className="text-xl font-bold tabular-nums leading-tight">{value}</p>
          <p className="text-xs opacity-75 truncate">{hint}</p>
        </div>
        <ArrowRight className="h-4 w-4 opacity-50" />
      </Card>
    </Link>
  );
}

// ─── Customize Dialog ─────────────────────────────────────────────────────────
function CustomizeDialog({
  open, onClose, allCards, visible, onChange,
}: {
  open: boolean; onClose: () => void;
  allCards: StatCardDef[];
  visible: Set<string>;
  onChange: (ids: Set<string>) => void;
}) {
  const [local, setLocal] = useState<Set<string>>(new Set(visible));

  useEffect(() => { if (open) setLocal(new Set(visible)); }, [open]);

  const toggle = (id: string) =>
    setLocal(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Customize Dashboard Cards</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Choose which KPI cards to show. {local.size} of {allCards.length} selected.
          </p>
        </DialogHeader>
        <div className="space-y-2 max-h-[55vh] overflow-y-auto py-1 pr-1">
          {allCards.map(c => {
            const CardIcon = c.icon;
            const checked = local.has(c.id);
            return (
              <div
                key={c.id}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors",
                  checked ? "border-primary/40 bg-primary/5" : "border-border/40 hover:bg-muted/40"
                )}
                onClick={() => toggle(c.id)}
              >
                <Checkbox checked={checked} onCheckedChange={() => toggle(c.id)} className="shrink-0" />
                <div className="h-8 w-8 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                  <CardIcon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 pt-2 border-t border-border/60">
          <Button variant="outline" className="gap-1.5" onClick={() => setLocal(new Set(ALL_CARD_IDS))}>
            Reset
          </Button>
          <Button className="flex-1 gradient-primary text-primary-foreground border-0" onClick={() => { onChange(local); onClose(); }}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
function Dashboard() {
  const { user, canViewModule } = useAuth();
  // Only tenant_admin sees cross-branch data and has the branch selector
  const isAdmin = user?.role === "tenant_admin";
  // For non-admins, lock to their assigned branch
  const lockedBranchId = !isAdmin ? (user?.branchId ?? null) : null;

  // Dashboard tiles/tabs surface data owned by other modules (cashier PII + shift SAR
  // totals, terminal-cashier assignments, return/refund detail) — gate each behind the
  // same RolePermissions matrix the dedicated /cashier-shift, /terminals, /returns routes
  // already enforce, so a role denied those modules doesn't get them for free here.
  const canViewShifts = canViewModule("Cashier Shifts");
  const canViewTerminals = canViewModule("Terminals");
  const canViewReturns = canViewModule("Returns");
  const canViewWarehouses = canViewModule("Warehouses");
  const canViewInventory = canViewModule("Inventory");
  const canViewCost = canViewModule("Accounting & Finance");

  const [period, setPeriod] = useState<(typeof periods)[number]>("Daily");
  // Non-admin users locked to their assigned branch; admins start with "all"
  const [branch, setBranch] = useState(lockedBranchId ?? "all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [dashData, setDashData] = useState<DashboardMetrics | null>(null);
  const [activeShifts, setActiveShifts] = useState<CashierShift[]>([]);
  const [warehousePending, setWarehousePending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const [inventoryItems, setInventoryItems] = useState<InventoryStock[]>([]);
  const [invReport, setInvReport] = useState<InventoryDashboardReport | null>(null);
  const [inventoryTabLoading, setInventoryTabLoading] = useState(false);
  const [inventoryTabLoaded, setInventoryTabLoaded] = useState(false);

  const [terminalItems, setTerminalItems] = useState<Terminal[]>([]);
  const [terminalTabLoading, setTerminalTabLoading] = useState(false);
  const [terminalTabLoaded, setTerminalTabLoaded] = useState(false);

  const [visibleCards, setVisibleCards] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return new Set(JSON.parse(saved));
    } catch { /* ignore */ }
    return new Set(ALL_CARD_IDS);
  });

  const saveVisible = (ids: Set<string>) => {
    setVisibleCards(ids);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  };

  // Sync branch when user loads after mount (auth hydration timing)
  useEffect(() => {
    if (lockedBranchId) setBranch(lockedBranchId);
  }, [lockedBranchId]);

  useEffect(() => {
    // Only admins need the full branch list for the selector
    if (isAdmin) api.getBranches("active").then(setBranches).catch(() => {});
  }, [isAdmin]);

  const loadDashboard = () => {
    setLoading(true);
    const apiPeriod = PERIOD_MAP[period] ?? "today";
    const branchId = branch !== "all" ? branch : undefined;
    // allSettled, not all: a permission-gated sibling call failing (shifts/warehouse) must not
    // wipe out the core dashboard metrics that DID load — surface it via loadError instead.
    Promise.allSettled([
      api.getDashboard({ period: apiPeriod, branchId }),
      canViewShifts ? api.getActiveShifts(branchId) : Promise.resolve([]),
      canViewWarehouses ? api.getWarehouseRequests({ approvalStatus: ["pending"] }) : Promise.resolve([]),
    ])
      .then(([dashR, shiftsR, warehouseR]) => {
        if (dashR.status === "fulfilled") setDashData(dashR.value);
        if (shiftsR.status === "fulfilled") setActiveShifts(shiftsR.value);
        if (warehouseR.status === "fulfilled") setWarehousePending(warehouseR.value.length);
        setLoadError([dashR, shiftsR, warehouseR].some(r => r.status === "rejected"));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, branch, canViewShifts, canViewWarehouses]);

  // Reset lazy-loaded tab data when branch/period filter changes
  useEffect(() => {
    setInventoryTabLoaded(false);
    setTerminalTabLoaded(false);
  }, [branch, period]);

  // Lazy load low-stock items + the inventory KPI/mover report when inventory tab is first opened
  useEffect(() => {
    if (activeTab !== "inventory" || inventoryTabLoaded || !canViewInventory) return;
    setInventoryTabLoading(true);
    const branchId = branch !== "all" ? branch : undefined;
    Promise.all([
      api.getStock({ branchId, lowStock: true }),
      api.getInventoryDashboardReport({ from: firstOfMonthStr(), to: todayStr(), branchId: branchId ? [branchId] : undefined }),
    ])
      .then(([items, report]) => { setInventoryItems(items); setInvReport(report); setInventoryTabLoaded(true); })
      .catch(() => {})
      .finally(() => setInventoryTabLoading(false));
  }, [activeTab, inventoryTabLoaded, branch, canViewInventory]);

  // Lazy load terminals when terminals tab is first opened
  useEffect(() => {
    if (activeTab !== "terminals" || terminalTabLoaded || !canViewTerminals) return;
    setTerminalTabLoading(true);
    api.getTerminals({ branchId: branch !== "all" ? [branch] : undefined })
      .then(items => { setTerminalItems(items); setTerminalTabLoaded(true); })
      .catch(() => {})
      .finally(() => setTerminalTabLoading(false));
  }, [activeTab, terminalTabLoaded, branch, canViewTerminals]);

  // If the active tab is one this role can't view (e.g. deep-linked or set before
  // permissions loaded), fall back to Overview instead of leaving a blank pane.
  useEffect(() => {
    if (activeTab === "terminals" && !canViewTerminals) setActiveTab("overview");
    if (activeTab === "cashiers" && !canViewShifts) setActiveTab("overview");
    if (activeTab === "returns" && !canViewReturns) setActiveTab("overview");
  }, [activeTab, canViewTerminals, canViewShifts, canViewReturns]);

  // Cards whose numbers belong to another module's data are dropped entirely for roles
  // without that module — from the grid AND the Customize dialog.
  const cardPermission: Record<string, boolean> = {
    active_cashiers: canViewShifts,
    active_terminals: canViewTerminals,
  };
  const allCards = (dashData ? buildCards(dashData) : []).filter(c => cardPermission[c.id] ?? true);
  const statCards = allCards.filter(c => visibleCards.has(c.id));
  const payBreakdown = dashData?.sales.paymentBreakdown ?? [];
  const cashierPerf = dashData?.cashierPerformance ?? [];

  const firstShift = activeShifts[0];
  const shiftTimerValue = firstShift ? shiftDuration(firstShift.openedAt) : "—";
  const shiftHint = firstShift
    ? `${firstShift.cashier?.fullName ?? "Cashier"} · ${firstShift.terminal?.terminalCode ?? "—"} · since ${new Date(firstShift.openedAt).toLocaleTimeString("en-SA", { hour: "2-digit", minute: "2-digit" })}`
    : "No active shifts";

  const selectedBranchName = branches.find(b => b.id === branch)?.name ?? "All Branches";

  const invKpis = invReport?.kpis;
  // Turnover and movers are ledger-derived; flag when the ledger doesn't span the whole period.
  const invPartialLedger = !!invReport?.dataWindow && !invReport.dataWindow.coversFullPeriod;

  return (
    <PageShell title="Dashboard" subtitle={`Live snapshot · ${selectedBranchName} · ${period}`}>
      {loadError && <LoadErrorBanner onRetry={loadDashboard} />}
      {/* Filter bar */}
      <Card className="p-3 border-border/60 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin ? (
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="outline" className="h-9 px-3 text-xs font-medium">
              {user?.branch?.split(" — ").at(-1) ?? "My Branch"}
            </Badge>
          )}

          <div className="flex flex-wrap gap-1">
            {periods.map((f) => (
              <Button key={f} size="sm" variant={period === f ? "default" : "outline"}
                className={cn("h-9", period === f && "gradient-primary text-primary-foreground border-0 shadow-glow")}
                onClick={() => setPeriod(f)}>{f}</Button>
            ))}
          </div>

          {period === "Custom" && (
            <div className="flex items-center gap-1">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-9 px-2 rounded-md border border-input bg-background text-sm" />
              <span className="text-xs text-muted-foreground">to</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-9 px-2 rounded-md border border-input bg-background text-sm" />
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="text-xs hidden sm:inline-flex">
              {new Date().toLocaleDateString("en-SA", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </Badge>
            <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs" onClick={() => setCustomizeOpen(true)}>
              <Settings2 className="h-3.5 w-3.5" /> Customize Dashboard
            </Button>
          </div>
        </div>
      </Card>

      {/* Alert cards row */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[84px] rounded-xl" />)
        ) : (
          <>
            <AlertCard tone="warning" icon={CalendarClock} label="Near Expiry Items"
              value={String(dashData?.inventory.expiringCount ?? 0)}
              hint="Next 7 days · review now" href="/batches" />
            <AlertCard tone="destructive" icon={PackageX} label="Low Stock Items"
              value={String(dashData?.inventory.lowStockCount ?? 0)}
              hint={`${dashData?.inventory.outOfStockCount ?? 0} critical · reorder`} href="/inventory" />
            {canViewShifts && <AlertCard tone="primary" icon={Timer} label="Active Shift Timer"
              value={shiftTimerValue} hint={shiftHint} href="/cashier-shift" />}
            {canViewWarehouses && <AlertCard tone="warning" icon={Warehouse} label="Pending Warehouse Approvals"
              value={String(warehousePending)}
              hint={warehousePending > 0 ? `${warehousePending > 3 ? warehousePending : ""} high priority transfers` : "No pending approvals"} href="/warehouses" />}
          </>
        )}
      </div>

      {/* KPI stat cards */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
        </div>
      ) : statCards.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {statCards.map((c) => <StatCard key={c.id} c={c} />)}
        </div>
      ) : (
        <Card className="p-8 border-border/60 text-center text-muted-foreground text-sm">
          No cards selected. <button className="text-primary underline ml-1" onClick={() => setCustomizeOpen(true)}>Customize Dashboard</button>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview" className="gap-1.5"><LayoutDashboard className="h-4 w-4" />Overview</TabsTrigger>
          <TabsTrigger value="orders" className="gap-1.5"><ShoppingBag className="h-4 w-4" />Orders</TabsTrigger>
          <TabsTrigger value="inventory" className="gap-1.5"><Package className="h-4 w-4" />Inventory</TabsTrigger>
          {canViewShifts && <TabsTrigger value="cashiers" className="gap-1.5"><Users className="h-4 w-4" />Cashiers</TabsTrigger>}
          {canViewTerminals && <TabsTrigger value="terminals" className="gap-1.5"><TerminalIcon className="h-4 w-4" />Terminals</TabsTrigger>}
          {canViewReturns && <TabsTrigger value="returns" className="gap-1.5"><Undo2 className="h-4 w-4" />Returns</TabsTrigger>}
          <TabsTrigger value="tax" className="gap-1.5"><Cigarette className="h-4 w-4" />Tax & Fees</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Widget title="Order Status Summary" link={{ to: "/orders", label: "All orders" }}>
              {loading ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />) : (
                [
                  { l: "Pending", v: dashData?.orders.pending ?? 0, c: "bg-warning" },
                  { l: "Processing", v: dashData?.orders.processing ?? 0, c: "bg-primary" },
                  { l: "Ready", v: dashData?.orders.readyToDeliver ?? 0, c: "bg-primary" },
                  { l: "Delivered", v: dashData?.orders.delivered ?? 0, c: "bg-success" },
                  { l: "Cancelled", v: dashData?.orders.cancelled ?? 0, c: "bg-destructive" },
                ].map((s) => (
                  <div key={s.l} className="flex items-center gap-3">
                    <span className={cn("h-2 w-2 rounded-full shrink-0", s.c)} />
                    <span className="text-sm flex-1">{s.l}</span>
                    <span className="text-sm font-bold tabular-nums">{s.v}</span>
                  </div>
                ))
              )}
            </Widget>

            <Widget title="Today's Delivery" link={{ to: "/orders", label: "Deliveries" }}>
              {loading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />) : (
                <div className="grid grid-cols-3 gap-3">
                  <Mini label="Dispatched" value={String(dashData?.orders.delivered ?? 0)} />
                  <Mini label="In Transit" value={String(Math.floor((dashData?.orders.readyToDeliver ?? 0) * 0.75))} />
                  <Mini label="Delivered" value={String(dashData?.orders.delivered ?? 0)} tone="success" />
                </div>
              )}
            </Widget>

            <Widget title="BI Summary" link={{ to: "/bi", label: "Open BI" }}>
              {loading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />) : (
                <div className="grid grid-cols-2 gap-3">
                  <Mini label="Revenue (Week)" value={fmtSAR((dashData?.sales.totalToday ?? 0) * 7, 0)} />
                  <Mini label="Gross Profit" value={fmtSAR((dashData?.sales.totalToday ?? 0) * 0.3, 0)} tone="success" />
                  {canViewReturns && <Mini label="Refunded" value={fmtSAR(dashData?.returns.refundedAmount ?? 0, 0)} tone="warning" />}
                  <Mini label="Out of Stock" value={String(dashData?.inventory.outOfStockCount ?? 0)} tone={dashData?.inventory.outOfStockCount ? "destructive" : "default"} />
                </div>
              )}
            </Widget>
          </div>

          <Card className="p-5 border-border/60 shadow-card space-y-3">
            <h3 className="text-sm font-semibold">Payment Mix</h3>
            {loading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />) :
              payBreakdown.length > 0 ? payBreakdown.map(p => (
                <div key={p.method}>
                  <div className="flex justify-between text-xs mb-1">
                    <span>{p.method}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground"><SARIcon />{p.amount.toLocaleString("en-SA", { minimumFractionDigits: 2 })}</span>
                      <span className="font-semibold w-10 text-right">{p.pct.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${Math.min(p.pct, 100)}%` }} />
                  </div>
                </div>
              )) : <p className="text-xs text-muted-foreground">No payment data available.</p>
            }
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          <Widget title="Order Status Today" link={{ to: "/orders", label: "Open Orders" }}>
            {loading ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />) : (
              [
                ["Pending", dashData?.orders.pending ?? 0],
                ["Processing", dashData?.orders.processing ?? 0],
                ["Ready to Deliver", dashData?.orders.readyToDeliver ?? 0],
                ["Delivered", dashData?.orders.delivered ?? 0],
                ["Cancelled", dashData?.orders.cancelled ?? 0],
              ].map(([l, v]) => (
                <div key={l as string} className="flex justify-between text-sm py-0.5">
                  <span className="text-muted-foreground">{l}</span>
                  <span className="font-bold tabular-nums">{v}</span>
                </div>
              ))
            )}
          </Widget>
        </TabsContent>

        <TabsContent value="inventory" className="mt-4 space-y-4">
          <Widget title="Inventory Health" link={{ to: "/inventory", label: "Open Inventory" }}>
            {inventoryTabLoading ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
              </div>
            ) : (
              // All ten FRD §2.6 KPIs. Stock Value and Wastage Value are finance-gated — a role
              // without Accounting & Finance sees the counts, not the money.
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {canViewCost && <MetricCard label="Current Stock Value" value={<><SARIcon />{fmtSAR(invKpis?.totalStockValue ?? 0)}</>} icon={Boxes} accent="primary" />}
                <MetricCard label="Available Stock Qty" value={String(invKpis?.availableStockQty ?? 0)} icon={PackageCheck} accent="success" />
                <MetricCard label="Low Stock Products" value={String(invKpis?.lowStockProducts ?? 0)} icon={AlertTriangle} accent="warning" />
                <MetricCard label="Out of Stock Products" value={String(invKpis?.outOfStockProducts ?? 0)} icon={PackageX} accent="destructive" />
                <MetricCard label="Negative Inventory Items" value={String(invKpis?.negativeInventoryItems ?? 0)} icon={AlertTriangle} accent="destructive" />
                <MetricCard label="Pending Purchase Orders" value={String(invKpis?.pendingPurchaseOrders ?? 0)} icon={ShoppingCart} accent="warning" />
                {canViewCost && <MetricCard label="Wastage Value" value={<><SARIcon />{fmtSAR(invKpis?.wastageValue ?? 0)}</>} icon={Ban} accent="destructive" />}
                <MetricCard
                  label="Inventory Turnover"
                  value={`${invKpis?.inventoryTurnover ?? 0}×`}
                  icon={RefreshCw}
                  hint={invPartialLedger ? "Partial ledger data" : undefined}
                />
              </div>
            )}
          </Widget>
          <div className="grid gap-4 lg:grid-cols-2">
            <InvMoverCard title="Top Moving Products" rows={invReport?.topMoving ?? []} loading={inventoryTabLoading} canViewCost={canViewCost} emptyHint={invPartialLedger} />
            <InvMoverCard title="Slow Moving Products" rows={invReport?.slowMoving ?? []} loading={inventoryTabLoading} canViewCost={canViewCost} emptyHint={invPartialLedger} />
          </div>
          {inventoryTabLoading ? (
            <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-xl" />)}</div>
          ) : inventoryItems.length > 0 ? (
            <Card className="overflow-hidden border-border/60 shadow-card">
              <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Low Stock Items</h3>
                <span className="text-xs text-muted-foreground">{inventoryItems.length} items need restocking</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2 font-semibold">Product</th>
                      <th className="px-3 py-2 font-semibold">Category</th>
                      <th className="px-3 py-2 font-semibold">Branch</th>
                      <th className="px-3 py-2 font-semibold text-right">Qty</th>
                      <th className="px-3 py-2 font-semibold text-right">Reorder Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryItems.slice(0, 15).map(item => (
                      <tr key={item.id} className="border-t border-border/40 hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{item.product?.name ?? "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{item.product?.category?.name ?? "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{item.branch?.name ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-destructive">{item.quantity}</td>
                        <td className="px-3 py-2 text-right text-xs text-muted-foreground">{item.reorderLevel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : inventoryTabLoaded ? (
            <Card className="p-6 border-border/60 text-center text-muted-foreground text-sm">
              No low-stock items — inventory looks healthy!
            </Card>
          ) : null}
        </TabsContent>

        {canViewShifts && <TabsContent value="cashiers" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Mini label="Active Cashiers" value={loading ? "…" : String(dashData?.shifts.active ?? 0)} tone="success" />
            <Mini label="Total Cashiers" value={loading ? "…" : String(dashData?.shifts.totalCashiers ?? 0)} />
            <Mini label="Open Shifts" value={loading ? "…" : String(activeShifts.length)} tone={activeShifts.length > 0 ? "success" : "default"} />
          </div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-xl" />)}</div>
          ) : activeShifts.length > 0 ? (
            <Card className="overflow-hidden border-border/60 shadow-card">
              <div className="px-4 py-3 border-b border-border/60">
                <h3 className="text-sm font-semibold">Active Shifts</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2 font-semibold">Cashier</th>
                      <th className="px-3 py-2 font-semibold">Terminal</th>
                      <th className="px-3 py-2 font-semibold">Branch</th>
                      <th className="px-3 py-2 font-semibold">Opened At</th>
                      <th className="px-3 py-2 font-semibold">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeShifts.map(s => (
                      <tr key={s.id} className="border-t border-border/40 hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{s.cashier?.fullName ?? "—"}</td>
                        <td className="px-3 py-2 text-xs font-mono">{s.terminal?.terminalCode ?? "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{branches.find(b => b.id === s.branchId)?.name ?? "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(s.openedAt).toLocaleTimeString("en-SA", { hour: "2-digit", minute: "2-digit" })}</td>
                        <td className="px-3 py-2 text-xs font-mono">{shiftDuration(s.openedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <Card className="p-6 border-border/60 text-center text-muted-foreground text-sm">
              No active shifts right now.
            </Card>
          )}
          {!loading && cashierPerf.length > 0 && (
            <Widget title="Cashier Performance (Today)" link={{ to: "/cashier-shift", label: "View All" }}>
              {cashierPerf.map((c) => (
                <div key={c.name} className="flex items-center justify-between text-sm py-0.5">
                  <span className="truncate max-w-[160px]">{c.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn("text-xs", c.status === "active" ? "text-success border-success/30" : "text-muted-foreground")}>
                      {c.status}
                    </Badge>
                    <span className="font-semibold tabular-nums text-xs"><SARIcon />{c.sales.toLocaleString("en-SA", { maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              ))}
            </Widget>
          )}
        </TabsContent>}

        {canViewTerminals && <TabsContent value="terminals" className="mt-4 space-y-4">
          {loading ? (
            <div className="grid grid-cols-3 gap-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              <Mini label="Online" value={String(dashData?.terminals.active ?? 0)} tone="success" />
              <Mini label="Offline" value={String((dashData?.terminals.total ?? 0) - (dashData?.terminals.active ?? 0))}
                tone={(dashData?.terminals.total ?? 0) - (dashData?.terminals.active ?? 0) > 0 ? "destructive" : "default"} />
              <Mini label="Total" value={String(dashData?.terminals.total ?? 0)} />
            </div>
          )}
          {terminalTabLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-xl" />)}</div>
          ) : terminalItems.length > 0 ? (
            <Card className="overflow-hidden border-border/60 shadow-card">
              <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Terminal Registry</h3>
                <span className="text-xs text-muted-foreground">{terminalItems.length} terminals</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2 font-semibold">Code</th>
                      <th className="px-3 py-2 font-semibold">Name</th>
                      <th className="px-3 py-2 font-semibold">Branch</th>
                      <th className="px-3 py-2 font-semibold">Cashier</th>
                      <th className="px-3 py-2 font-semibold">Last Sync</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {terminalItems.map(t => (
                      <tr key={t.id} className="border-t border-border/40 hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono font-bold text-xs">{t.terminalCode}</td>
                        <td className="px-3 py-2 font-medium">{t.name}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{t.branch?.name ?? "—"}</td>
                        <td className="px-3 py-2 text-xs">{t.assignedCashier?.fullName ?? "Unassigned"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{t.lastSync ? new Date(t.lastSync).toLocaleString("en-SA", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td className="px-3 py-2">
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            t.status === "active" ? "bg-success/15 text-success" :
                            t.status === "maintenance" ? "bg-warning/20 text-warning-foreground" :
                            "bg-muted text-muted-foreground"
                          )}>{t.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : terminalTabLoaded ? (
            <Card className="p-6 border-border/60 text-center text-muted-foreground text-sm">
              No terminals found.
            </Card>
          ) : null}
        </TabsContent>}

        {canViewReturns && <TabsContent value="returns" className="mt-4">
          <Widget title="Returns & Refunds" link={{ to: "/returns", label: "All Returns" }}>
            {loading ? Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />) : (
              <div className="grid grid-cols-2 gap-3">
                <Mini label="Returns Today" value={String(dashData?.returns.count ?? 0)} />
                <Mini label="Total Refunded" value={fmtSAR(dashData?.returns.refundedAmount ?? 0)} tone="warning" />
              </div>
            )}
          </Widget>
        </TabsContent>}

        <TabsContent value="tax" className="mt-4">
          <Widget title="Tax & Fees">
            <p className="text-xs text-muted-foreground">Detailed tax breakdown is available in the Tax Reports section.</p>
            <Link to={"/tax-reports" as any} className="text-xs text-primary font-semibold hover:underline inline-flex items-center gap-0.5 mt-1">
              Open Tax Reports <ArrowRight className="h-3 w-3" />
            </Link>
          </Widget>
        </TabsContent>
      </Tabs>

      <CustomizeDialog
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        allCards={allCards.length > 0 ? allCards : ALL_CARD_IDS.filter(id => cardPermission[id] ?? true).map(id => ({ id, label: id, desc: "", icon: Package, href: "/", action: "", value: "" }))}
        visible={visibleCards}
        onChange={saveVisible}
      />
    </PageShell>
  );
}

function Widget({ title, link, children }: { title: string; link?: { to: string; label: string }; children: React.ReactNode }) {
  return (
    <Card className="p-5 border-border/60 shadow-card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        {link && (
          <Link to={link.to as any} className="text-xs text-primary font-semibold hover:underline inline-flex items-center gap-0.5">
            {link.label}<ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      <div className="space-y-2.5">{children}</div>
    </Card>
  );
}

function InvMoverCard({ title, rows, loading, canViewCost, emptyHint }: {
  title: string; rows: InventoryMoverRow[]; loading: boolean; canViewCost: boolean; emptyHint: boolean;
}) {
  return (
    <Card className="p-5 border-border/60 shadow-card space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        // Distinguish "nothing sold" from "nothing recorded" — with an empty ledger the second is
        // the real reason, and showing a bare "no data" would imply the first.
        <p className="text-sm text-muted-foreground">
          {emptyHint
            ? "No sales movements recorded in this period yet, so products cannot be ranked."
            : "No product movement in this period."}
        </p>
      ) : (
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-3 py-2">Product</th>
                <th className="text-left px-2 py-2">SKU</th>
                <th className="text-right px-2 py-2">Units Moved</th>
                {canViewCost && <th className="text-right px-2 py-2">COGS</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productId} className="border-t border-border/40">
                  <td className="px-3 py-2">{r.productName}</td>
                  <td className="px-2 py-2 font-mono text-[11px] text-muted-foreground">{r.sku}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-medium">{r.unitsMoved}</td>
                  {canViewCost && <td className="px-2 py-2 text-right tabular-nums"><SARIcon />{fmtSAR(r.cogsValue)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Mini({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "warning" | "destructive" }) {
  const map = {
    default: "bg-muted/40 text-foreground",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning-foreground",
    destructive: "bg-destructive/15 text-destructive",
  };
  return (
    <div className={cn("rounded-xl p-3", map[tone])}>
      <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70">{label}</p>
      <p className="text-lg font-bold mt-0.5">{value}</p>
    </div>
  );
}
