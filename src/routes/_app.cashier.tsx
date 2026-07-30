import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth";
import {
  LogIn, ScanBarcode, Pause, ShoppingBag, Undo2, LogOut,
  Clock, Loader2, CheckCircle2, AlertCircle, RefreshCw, Settings2, Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api, type CashierShift, type Order } from "@/lib/api";
import { useBranch } from "@/lib/branch-context";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { cn, getPosBranchId } from "@/lib/utils";

export const Route = createFileRoute("/_app/cashier")({ component: CashierWorkspace });

// ─── Customizable cards (hero stats + shift summary) ──────────────────────────
// Same "which KPI cards to show" pattern as _app.dashboard.tsx's CustomizeDialog/STORAGE_KEY —
// this workspace's cards were hardcoded with no way to hide any of them at all.
type CardDef = { id: string; label: string; icon: LucideIcon };
const CARD_DEFS: CardDef[] = [
  { id: "today_orders", label: "Today's Orders", icon: ShoppingBag },
  { id: "today_revenue", label: "Today's Revenue", icon: Wallet },
  { id: "cash_drawer", label: "Cash in Drawer", icon: Wallet },
  { id: "opening_amount", label: "Opening Amount", icon: Wallet },
  { id: "cash_sales", label: "Cash Sales", icon: Wallet },
  { id: "card_sales", label: "Card Sales", icon: Wallet },
  { id: "wallet_sales", label: "Wallet Sales", icon: Wallet },
];
const ALL_CARD_IDS = CARD_DEFS.map(c => c.id);
const CARD_STORAGE_KEY = "cashier_workspace_visible_cards";

function CustomizeCardsDialog({ open, onClose, visible, onChange }: {
  open: boolean; onClose: () => void;
  visible: Set<string>; onChange: (ids: Set<string>) => void;
}) {
  const [local, setLocal] = useState<Set<string>>(new Set(visible));
  useEffect(() => { if (open) setLocal(new Set(visible)); }, [open, visible]);

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
          <DialogTitle>Customize Cards</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Choose which cards to show. {local.size} of {CARD_DEFS.length} selected.
          </p>
        </DialogHeader>
        <div className="space-y-2 max-h-[55vh] overflow-y-auto py-1 pr-1">
          {CARD_DEFS.map(c => {
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
                <p className="text-sm font-medium">{c.label}</p>
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function elapsed(openedAt: string) {
  const diff = Math.floor((Date.now() - new Date(openedAt).getTime()) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtMoney(n: number) {
  return fmtSAR(n);
}

// ─── Tile definitions (dynamic, built from runtime data) ─────────────────────
interface Tile {
  icon: LucideIcon;
  title: string;
  desc: string;
  href: string;
  accent: string;
  badge?: string | number;
  disabled?: boolean;
  disabledReason?: string;
}

function buildTiles(shift: CashierShift | null, todayOrders: Order[], heldCount: number): Tile[] {
  const hasShift = !!shift;
  return [
    {
      icon: LogIn,
      title: hasShift ? "Shift Active" : "Check In",
      desc: hasShift
        ? `Since ${new Date(shift!.openedAt).toLocaleTimeString("en-SA", { hour: "2-digit", minute: "2-digit" })} · ${elapsed(shift!.openedAt)}`
        : "Open shift and start selling",
      href: "/cashier-shift",
      accent: hasShift ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-primary/10 text-primary",
    },
    {
      icon: ScanBarcode,
      title: "POS Checkout",
      desc: "Scan and charge customers",
      href: "/pos",
      accent: "bg-primary text-primary-foreground",
      disabled: !hasShift,
      disabledReason: "Open a shift first",
    },
    {
      icon: Pause,
      title: "Held Orders",
      desc: heldCount > 0 ? `${heldCount} order${heldCount > 1 ? "s" : ""} waiting` : "No orders on hold",
      href: "/held-orders",
      accent: heldCount > 0 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30" : "bg-muted text-muted-foreground",
      badge: heldCount > 0 ? heldCount : undefined,
    },
    {
      icon: ShoppingBag,
      title: "My Orders",
      desc: todayOrders.length > 0 ? `${todayOrders.length} order${todayOrders.length > 1 ? "s" : ""} today` : "No orders yet today",
      href: "/orders",
      accent: "bg-success/15 text-success",
      badge: todayOrders.length > 0 ? todayOrders.length : undefined,
    },
    {
      icon: Undo2,
      title: "Refund Request",
      desc: "Process customer returns",
      href: "/refunds",
      accent: "bg-destructive/10 text-destructive",
    },
    {
      icon: LogOut,
      title: "Check Out",
      desc: hasShift ? "Close shift and settle cash" : "No active shift to close",
      href: "/cashier-shift",
      accent: "bg-muted text-foreground",
      disabled: !hasShift,
      disabledReason: "No open shift",
    },
  ];
}

// ─── Page ─────────────────────────────────────────────────────────────────────
function CashierWorkspace() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { branches } = useBranch();

  const [visibleCards, setVisibleCards] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(CARD_STORAGE_KEY);
      if (saved) return new Set(JSON.parse(saved) as string[]);
    } catch { /* ignore malformed storage */ }
    return new Set(ALL_CARD_IDS);
  });
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const saveVisibleCards = (ids: Set<string>) => {
    setVisibleCards(ids);
    localStorage.setItem(CARD_STORAGE_KEY, JSON.stringify([...ids]));
  };

  const [shift, setShift] = useState<CashierShift | null>(null);
  const [todayOrders, setTodayOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  // Must resolve to the exact same branch POS itself is keying `pos_holds_${branchId}` under —
  // previously derived from the cashier's own shift instead, which disagreed with POS's own
  // count whenever an admin's manually-picked branch differed from their shift (see Held Orders).
  const heldBranchId = getPosBranchId(user);
  const heldCount = (() => {
    if (!heldBranchId) return 0;
    try { return (JSON.parse(sessionStorage.getItem(`pos_holds_${heldBranchId}`) ?? "[]") as unknown[]).length; }
    catch { return 0; }
  })();

  const branchIdFilter = user?.role !== "tenant_admin" ? (user?.branchId ?? undefined) : undefined;

  const load = useCallback(() => {
    setLoading(true);
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    Promise.all([
      api.getActiveShifts(),
      api.getOrders({ from: todayStart.toISOString(), branchId: branchIdFilter ? [branchIdFilter] : undefined }),
    ])
      .then(([shifts, orders]) => {
        setShift(shifts[0] ?? null);
        setTodayOrders(orders);
      })
      .catch(() => toast.error("Failed to load cashier workspace data."))
      .finally(() => setLoading(false));
  }, [branchIdFilter]);

  useEffect(() => { load(); }, [load]);

  // Update elapsed time every minute
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  void tick; // just to trigger re-render

  const tiles = buildTiles(shift, todayOrders, heldCount);

  // The active shift's own branch — not the fixed `user.branch` profile claim — so this matches
  // whatever branch POS Checkout is actually operating the shift under. Without this, an admin
  // covering a different branch (shift.branchId != user.branchId) saw two different "active
  // branch" values on the two screens for the same session.
  const activeBranchName = shift
    ? (branches.find(b => b.id === shift.branchId)?.name ?? user?.branch ?? "Olaya Branch")
    : (user?.branch ?? "Olaya Branch");

  const cashInDrawer = shift
    ? shift.openingAmount + shift.cashSales
    : 0;

  const todayRevenue = todayOrders.reduce((s, o) => s + o.totalAmount, 0);

  return (
    <PageShell title="Cashier Workspace" subtitle="Focused tools for the active shift">
      {/* Hero shift banner */}
      <Card className="p-6 border-border/60 shadow-card gradient-primary text-primary-foreground">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin opacity-60" />
            ) : shift ? (
              <Badge className="bg-white/15 text-primary-foreground border-white/20 backdrop-blur gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Shift active · since {new Date(shift.openedAt).toLocaleTimeString("en-SA", { hour: "2-digit", minute: "2-digit" })}
                {" · "}{elapsed(shift.openedAt)}
              </Badge>
            ) : (
              <Badge className="bg-white/15 text-primary-foreground border-white/20 backdrop-blur gap-1">
                <AlertCircle className="h-3 w-3" />
                No active shift — check in to start
              </Badge>
            )}
            <h2 className="text-2xl font-bold mt-2">
              السلام عليكم, {user?.name?.split(" ")[0] ?? "Cashier"}
            </h2>
            <p className="text-primary-foreground/80 text-sm mt-1">
              {shift?.terminal?.terminalCode ? `${shift.terminal.terminalCode} · ` : ""}
              {activeBranchName}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { id: "today_orders", label: "Today's Orders", value: todayOrders.length },
              { id: "today_revenue", label: "Today's Revenue", value: <><SARIcon />{fmtMoney(todayRevenue)}</> },
              { id: "cash_drawer", label: "Cash in Drawer", value: shift ? <><SARIcon />{fmtMoney(cashInDrawer)}</> : "—" },
            ].filter(stat => visibleCards.has(stat.id)).map(stat => (
              <div key={stat.label} className="rounded-xl bg-white/15 backdrop-blur border border-white/20 px-4 py-2 min-w-[100px]">
                <p className="text-[10px] uppercase opacity-80">{stat.label}</p>
                <p className="text-lg font-bold tabular-nums">{stat.value}</p>
              </div>
            ))}
            <button
              onClick={() => setCustomizeOpen(true)}
              className="rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-2 transition-colors"
              title="Customize cards"
            >
              <Settings2 className="h-4 w-4" />
            </button>
            <button
              onClick={load}
              className="rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 px-3 py-2 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Card>

      {/* Shift summary (when active) */}
      {shift && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { id: "opening_amount", label: "Opening Amount", value: <><SARIcon />{fmtMoney(shift.openingAmount)}</> },
            { id: "cash_sales", label: "Cash Sales", value: <><SARIcon />{fmtMoney(shift.cashSales)}</> },
            { id: "card_sales", label: "Card Sales", value: <><SARIcon />{fmtMoney(shift.cardSales)}</> },
            { id: "wallet_sales", label: "Wallet Sales", value: <><SARIcon />{fmtMoney(shift.digitalSales)}</> },
          ].filter(m => visibleCards.has(m.id)).map(m => (
            <Card key={m.label} className="px-4 py-3 border-border/60 shadow-card">
              <p className="text-xs text-muted-foreground">{m.label}</p>
              <p className="text-base font-bold tabular-nums mt-0.5">{m.value}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Action tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => {
          const inner = (
            <Card className={`p-5 border-border/60 shadow-card h-full transition-all relative
              ${t.disabled
                ? "opacity-50 cursor-not-allowed"
                : "hover:shadow-elegant hover:-translate-y-0.5 cursor-pointer"
              }`}
            >
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${t.accent}`}>
                <t.icon className="h-6 w-6" />
              </div>
              {t.badge !== undefined && (
                <span className="absolute top-4 right-4 min-w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1">
                  {t.badge}
                </span>
              )}
              <p className="font-semibold mt-3">{t.title}</p>
              <p className="text-sm text-muted-foreground">{t.desc}</p>
              {t.disabled
                ? <p className="text-xs text-muted-foreground mt-2 italic">{t.disabledReason}</p>
                : <Button variant="ghost" size="sm" className="mt-2 -ml-3 text-primary">Open →</Button>
              }
            </Card>
          );

          return t.disabled ? (
            <div key={t.title}>{inner}</div>
          ) : (
            <div key={t.title} onClick={() => navigate({ to: t.href })} className="block">
              {inner}
            </div>
          );
        })}
      </div>

      {/* Quick stats — today's orders table */}
      {todayOrders.length > 0 && (
        <Card className="overflow-hidden border-border/60 shadow-card">
          <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
            <p className="font-semibold text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" /> Today's Orders
            </p>
            <Link to="/orders" className="text-xs text-primary hover:underline">View all →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2 font-semibold">Order #</th>
                  <th className="px-4 py-2 font-semibold">Customer</th>
                  <th className="px-4 py-2 font-semibold">Total</th>
                  <th className="px-4 py-2 font-semibold">Payment</th>
                  <th className="px-4 py-2 font-semibold">Time</th>
                </tr>
              </thead>
              <tbody>
                {todayOrders.slice(0, 8).map(o => (
                  <tr key={o.id} className="border-t border-border/30 hover:bg-muted/20">
                    <td className="px-4 py-2 font-mono text-xs font-bold text-primary">{o.orderNumber}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{o.customer?.fullName ?? "Walk-in"}</td>
                    <td className="px-4 py-2 font-semibold tabular-nums"><SARIcon />{o.totalAmount.toFixed(2)}</td>
                    <td className="px-4 py-2">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                        o.paymentStatus === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                      }`}>{o.paymentStatus}</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {new Date(o.createdAt).toLocaleTimeString("en-SA", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <CustomizeCardsDialog
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        visible={visibleCards}
        onChange={saveVisibleCards}
      />
    </PageShell>
  );
}
