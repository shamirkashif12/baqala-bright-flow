import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Wallet, ShoppingBag, Terminal as TerminalIcon, AlertTriangle, CalendarClock,
  Truck, Users, Clock3, PackageCheck, PackageX, Package, ArrowUpRight, ArrowDownRight,
  ArrowRight, Settings2, X, RotateCcw, TrendingUp, BarChart3, type LucideIcon,
} from "lucide-react";
import { FilterBar } from "@/components/filter-bar";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
});

type StatCardData = {
  label: string; value: string; desc: string; delta: string; trend: "up" | "down" | "flat";
  updated: string; icon: LucideIcon; href: string; action: string;
  accent?: "primary" | "success" | "warning" | "destructive";
};

const cards: StatCardData[] = [
  { label: "Pending Orders", value: "24", desc: "Orders awaiting confirmation", delta: "+8%", trend: "up", updated: "5 min ago", icon: Clock3, href: "/orders", action: "View orders", accent: "warning" },
  { label: "Processing Orders", value: "16", desc: "Currently being prepared", delta: "+3%", trend: "up", updated: "2 min ago", icon: ShoppingBag, href: "/orders", action: "Manage", accent: "primary" },
  { label: "Ready to Deliver", value: "12", desc: "Packed & waiting for pickup", delta: "-2%", trend: "down", updated: "1 min ago", icon: PackageCheck, href: "/orders", action: "Dispatch", accent: "primary" },
  { label: "Delivered Orders", value: "189", desc: "Completed deliveries today", delta: "+14%", trend: "up", updated: "just now", icon: Truck, href: "/orders", action: "History", accent: "success" },
  { label: "Today's Sales", value: "ر.س 48,920", desc: "Gross sales across 4 branches", delta: "+18%", trend: "up", updated: "live", icon: Wallet, href: "/sales", action: "Sales report", accent: "primary" },
  { label: "Today's Delivery", value: "ر.س 9,140", desc: "Delivery revenue collected", delta: "+22%", trend: "up", updated: "3 min ago", icon: Truck, href: "/orders", action: "Open", accent: "success" },
  { label: "Active Cashiers", value: "9 / 12", desc: "Checked-in this shift", delta: "+1", trend: "up", updated: "live", icon: Users, href: "/cashier-shift", action: "Shifts", accent: "primary" },
  { label: "Active Terminals", value: "11 / 12", desc: "Connected POS terminals", delta: "1 offline", trend: "down", updated: "30 sec ago", icon: TerminalIcon, href: "/terminals", action: "Terminals", accent: "warning" },
  { label: "Low Stock Items", value: "23", desc: "Need reorder soon", delta: "6 critical", trend: "down", updated: "10 min ago", icon: PackageX, href: "/inventory", action: "Restock", accent: "destructive" },
  { label: "Close to Expiry", value: "41", desc: "Expiring in next 7 days", delta: "+5", trend: "down", updated: "20 min ago", icon: CalendarClock, href: "/batches", action: "Review", accent: "warning" },
];

function StatCard({ c, editing, onRemove }: { c: StatCardData; editing?: boolean; onRemove?: () => void }) {
  const accent = c.accent ?? "primary";
  const iconBg = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    destructive: "bg-destructive/15 text-destructive",
  }[accent];
  return (
    <Card className={cn(
      "relative p-5 border-border/60 shadow-card hover:shadow-elegant transition-shadow flex flex-col gap-3",
      editing && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background animate-fade-in",
    )}>
      {editing && (
        <button
          onClick={onRemove}
          className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md hover:scale-110 transition-transform"
          aria-label="Remove card"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="flex items-start justify-between">
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", iconBg)}>
          <c.icon className="h-5 w-5" />
        </div>
        <span className={cn(
          "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold",
          c.trend === "up" && "bg-success/15 text-success",
          c.trend === "down" && "bg-destructive/15 text-destructive",
          c.trend === "flat" && "bg-muted text-muted-foreground",
        )}>
          {c.trend === "up" && <ArrowUpRight className="h-3 w-3" />}
          {c.trend === "down" && <ArrowDownRight className="h-3 w-3" />}
          {c.delta}
        </span>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{c.label}</p>
        <p className="text-2xl md:text-3xl font-bold tracking-tight mt-1">{c.value}</p>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{c.desc}</p>
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
        <span className="text-muted-foreground">Updated {c.updated}</span>
        <Link to={c.href} className="text-primary font-semibold hover:underline inline-flex items-center gap-0.5">
          {c.action} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </Card>
  );
}

const filters = ["Daily", "Weekly", "Monthly", "Custom"] as const;
const STORAGE_KEY = "baqala_dashboard_visible_cards";

function Dashboard() {
  const [filter, setFilter] = useState<(typeof filters)[number]>("Daily");
  const allLabels = cards.map((c) => c.label);
  const [visible, setVisible] = useState<string[]>(allLabels);
  const [editing, setEditing] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // Load persisted selection
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        setVisible(parsed.filter((l) => allLabels.includes(l)));
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = (next: string[]) => {
    setVisible(next);
    if (typeof window !== "undefined") {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    }
  };

  const toggleCard = (label: string) => {
    persist(visible.includes(label) ? visible.filter((l) => l !== label) : [...visible, label]);
  };
  const removeCard = (label: string) => persist(visible.filter((l) => l !== label));
  const resetCards = () => persist(allLabels);

  const visibleCards = cards.filter((c) => visible.includes(c.label));

  return (
    <PageShell title="Dashboard" subtitle="Live snapshot across 4 branches">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 -mt-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mr-1">Range</span>
        {filters.map((f) => (
          <Button
            key={f}
            size="sm"
            variant={filter === f ? "default" : "outline"}
            className={filter === f ? "gradient-primary text-primary-foreground border-0 shadow-glow" : ""}
            onClick={() => setFilter(f)}
          >
            {f}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="text-xs hidden sm:inline-flex">Tuesday · June 2, 2026</Badge>
          <Button
            size="sm"
            variant={editing ? "default" : "outline"}
            className={cn("gap-1.5", editing && "gradient-primary text-primary-foreground border-0 shadow-glow")}
            onClick={() => setEditing((v) => !v)}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {editing ? "Done" : "Customize"}
          </Button>
          <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">
                Add / Remove
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Customize Dashboard Cards</DialogTitle>
                <DialogDescription>
                  Choose which KPI cards to show on your dashboard. {visible.length} of {allLabels.length} selected.
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[55vh] overflow-y-auto -mx-2 px-2 space-y-1.5">
                {cards.map((c) => {
                  const checked = visible.includes(c.label);
                  return (
                    <label
                      key={c.label}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors",
                        checked ? "border-primary/40 bg-primary/5" : "border-border/60 hover:bg-muted/40",
                      )}
                    >
                      <Checkbox checked={checked} onCheckedChange={() => toggleCard(c.label)} />
                      <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                        {
                          primary: "bg-primary/10 text-primary",
                          success: "bg-success/15 text-success",
                          warning: "bg-warning/20 text-warning-foreground",
                          destructive: "bg-destructive/15 text-destructive",
                        }[c.accent ?? "primary"])}>
                        <c.icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{c.label}</p>
                        <p className="text-xs text-muted-foreground truncate">{c.desc}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
              <DialogFooter className="gap-2 sm:gap-2">
                <Button variant="outline" onClick={resetCards} className="gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </Button>
                <Button onClick={() => setCustomizeOpen(false)} className="gradient-primary text-primary-foreground border-0">
                  Done
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Universal filter bar */}
      <FilterBar placeholder="Search by item, SKU, branch, cashier…" />

      {/* Stat cards */}
      {visibleCards.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {visibleCards.map((c) => (
            <StatCard key={c.label} c={c} editing={editing} onRemove={() => removeCard(c.label)} />
          ))}
        </div>
      ) : (
        <Card className="p-8 border-dashed border-border/60 text-center space-y-2">
          <p className="text-sm font-semibold">No KPI cards visible</p>
          <p className="text-xs text-muted-foreground">Click "Add / Remove" above to choose cards to display.</p>
          <Button size="sm" variant="outline" onClick={() => setCustomizeOpen(true)}>Add cards</Button>
        </Card>
      )}

      {/* Widgets row 1 */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Widget title="Order Status Summary" link={{ to: "/orders", label: "All orders" }}>
          {[
            { l: "Pending", v: 24, c: "bg-warning" },
            { l: "Processing", v: 16, c: "bg-primary" },
            { l: "Ready", v: 12, c: "bg-primary" },
            { l: "Delivered", v: 189, c: "bg-success" },
            { l: "Cancelled", v: 3, c: "bg-destructive" },
          ].map((s) => (
            <div key={s.l} className="flex items-center gap-3">
              <span className={cn("h-2 w-2 rounded-full", s.c)} />
              <span className="text-sm flex-1">{s.l}</span>
              <span className="text-sm font-bold tabular-nums">{s.v}</span>
            </div>
          ))}
        </Widget>

        <Widget title="Today's Delivery" link={{ to: "/orders", label: "Deliveries" }}>
          <div className="grid grid-cols-2 gap-3">
            <Mini label="Dispatched" value="48" />
            <Mini label="In Transit" value="12" />
            <Mini label="Delivered" value="36" />
            <Mini label="Failed" value="2" tone="destructive" />
          </div>
          <div className="pt-2">
            <p className="text-xs text-muted-foreground mb-1.5">Delivery success</p>
            <Progress value={94} className="h-1.5" />
            <p className="text-xs text-muted-foreground mt-1">94% on-time delivery rate</p>
          </div>
        </Widget>

        <Widget title="BI Summary" link={{ to: "/bi", label: "Open BI" }}>
          <Mini label="Revenue (week)" value="ر.س 312,480" />
          <Mini label="Gross Profit" value="ر.س 86,210" tone="success" />
          <Mini label="Avg Basket" value="ر.س 38.10" />
          <Mini label="Refund Rate" value="1.8%" tone="warning" />
        </Widget>
      </div>

      {/* Business Intelligence (merged from /bi) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-5 border-border/60 shadow-card space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" />Sales Trend · 14 days</h3>
              <p className="text-xs text-muted-foreground">All branches · gross sales</p>
            </div>
            <Badge variant="outline" className="bg-success/15 text-success border-success/30 gap-1"><TrendingUp className="h-3 w-3" />+18% WoW</Badge>
          </div>
          <BiSparkline data={[12,18,16,22,28,24,30,26,34,32,40,38,44,48]} />
        </Card>
        <Card className="p-5 border-border/60 shadow-card space-y-3">
          <h3 className="text-sm font-semibold">Payment Mix</h3>
          {[
            { m: "Cash", v: 58, c: "bg-primary" },
            { m: "Card", v: 28, c: "bg-success" },
            { m: "Wallet", v: 11, c: "bg-warning" },
            { m: "Transfer", v: 3, c: "bg-muted-foreground" },
          ].map(p => (
            <div key={p.m}>
              <div className="flex justify-between text-xs mb-1"><span>{p.m}</span><span className="font-semibold">{p.v}%</span></div>
              <div className="h-2 rounded-full bg-muted overflow-hidden"><div className={cn("h-full", p.c)} style={{ width: `${p.v}%` }} /></div>
            </div>
          ))}
          <Link to="/bi" className="text-xs text-primary font-semibold inline-flex items-center gap-0.5 pt-1">Open full BI <ArrowRight className="h-3 w-3" /></Link>
        </Card>
      </div>

      {/* Performance widgets row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Widget title="Cashier Performance" link={{ to: "/kpi", label: "KPI" }}>
          {[
            { n: "Fahad Al-Qahtani", t: "TML-RYD-001", o: 142, s: "ر.س 8,420" },
            { n: "Mohammed Al-Harbi", t: "TML-RYD-002", o: 128, s: "ر.س 7,180" },
            { n: "Khalid Al-Otaibi", t: "TML-KHB-001", o: 96, s: "ر.س 5,310" },
            { n: "Sultan Al-Dossari", t: "TML-JED-001", o: 88, s: "ر.س 4,920" },
          ].map((r) => (
            <div key={r.n} className="flex items-center justify-between text-sm">
              <div className="min-w-0">
                <p className="font-medium truncate">{r.n}</p>
                <p className="text-xs text-muted-foreground">{r.t}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{r.s}</p>
                <p className="text-xs text-muted-foreground">{r.o} orders</p>
              </div>
            </div>
          ))}
        </Widget>

        <Widget title="Terminal Performance" link={{ to: "/terminals", label: "Terminals" }}>
          {[
            { t: "TML-RYD-001 · Olaya", st: "online", o: 412, util: 92 },
            { t: "TML-RYD-002 · Olaya", st: "online", o: 287, util: 78 },
            { t: "TML-KHB-001 · Khobar", st: "online", o: 318, util: 80 },
            { t: "TML-JED-001 · Jeddah", st: "offline", o: 0, util: 0 },
          ].map((t) => (
            <div key={t.t} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-medium truncate">{t.t}</span>
                <span className={cn("text-xs font-semibold", t.st === "online" ? "text-success" : "text-destructive")}>
                  {t.st} · {t.o} orders
                </span>
              </div>
              <Progress value={t.util} className="h-1.5" />
            </div>
          ))}
        </Widget>
      </div>

      {/* Alerts row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Widget title="Low Stock Alerts" link={{ to: "/inventory", label: "Inventory" }}>
          {[
            { n: "Sugar 1kg Al Osra", q: 8, b: "Khobar" },
            { n: "Nadec Milk 2L", q: 18, b: "Olaya" },
            { n: "Sadia Chicken 1kg", q: 14, b: "Madinah" },
            { n: "Lay's Classic 75g", q: 6, b: "Jeddah" },
          ].map((p) => (
            <div key={p.n} className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center">
                <Package className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.n}</p>
                <p className="text-xs text-muted-foreground">{p.b}</p>
              </div>
              <Badge variant="outline" className="text-destructive border-destructive/30 bg-destructive/10">{p.q} left</Badge>
            </div>
          ))}
        </Widget>

        <Widget title="Close to Expiry Alerts" link={{ to: "/batches", label: "Batches" }}>
          {[
            { n: "Almarai Yogurt 170g", d: 2, b: "Olaya" },
            { n: "L'usine Croissant", d: 3, b: "Jeddah" },
            { n: "Al Marai Cheese Slices", d: 5, b: "Olaya" },
            { n: "Arabic Bread Tamees", d: 1, b: "Khobar" },
          ].map((p) => (
            <div key={p.n} className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-warning/20 text-warning-foreground flex items-center justify-center">
                <CalendarClock className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.n}</p>
                <p className="text-xs text-muted-foreground">{p.b}</p>
              </div>
              <Badge variant="outline" className="text-warning-foreground border-warning/40 bg-warning/20">{p.d}d left</Badge>
            </div>
          ))}
        </Widget>
      </div>
    </PageShell>
  );
}

function Widget({ title, children, link }: { title: string; children: React.ReactNode; link?: { to: string; label: string } }) {
  return (
    <Card className="p-5 border-border/60 shadow-card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">{title}</h3>
        {link && (
          <Link to={link.to} className="text-xs text-primary font-semibold hover:underline inline-flex items-center gap-0.5">
            {link.label} <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      <div className="space-y-2.5">{children}</div>
    </Card>
  );
}

function Mini({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "success" | "warning" | "destructive" }) {
  const colors = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning-foreground",
    destructive: "text-destructive",
  }[tone];
  return (
    <div className="rounded-xl bg-muted/40 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className={cn("text-lg font-bold mt-0.5", colors)}>{value}</p>
    </div>
  );
}

function BiSparkline({ data }: { data: number[] }) {
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) => `${(i/(data.length-1))*100},${100-((v-min)/(max-min||1))*100}`).join(" ");
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-28">
      <defs>
        <linearGradient id="bi-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
          <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,100 ${pts} 100,100`} fill="url(#bi-grad)" />
      <polyline points={pts} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}