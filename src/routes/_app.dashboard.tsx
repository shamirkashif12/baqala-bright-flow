import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Wallet, ShoppingBag, Terminal as TerminalIcon, CalendarClock,
  Truck, Users, Clock3, PackageCheck, PackageX, Package, ArrowUpRight, ArrowDownRight,
  ArrowRight, Settings2, X, RotateCcw, TrendingUp, BarChart3, type LucideIcon,
  Undo2, Cigarette, LayoutDashboard, Timer, Warehouse,
} from "lucide-react";

export const Route = createFileRoute("/_app/dashboard")({ component: Dashboard });

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
  const iconBg = { primary: "bg-primary/10 text-primary", success: "bg-success/15 text-success", warning: "bg-warning/20 text-warning-foreground", destructive: "bg-destructive/15 text-destructive" }[accent];
  return (
    <Card className={cn("relative p-5 border-border/60 shadow-card hover:shadow-elegant transition-shadow flex flex-col gap-3", editing && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background animate-fade-in")}>
      {editing && (
        <button onClick={onRemove} className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md hover:scale-110 transition-transform" aria-label="Remove card">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="flex items-start justify-between">
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", iconBg)}><c.icon className="h-5 w-5" /></div>
        <span className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold", c.trend === "up" && "bg-success/15 text-success", c.trend === "down" && "bg-destructive/15 text-destructive", c.trend === "flat" && "bg-muted text-muted-foreground")}>
          {c.trend === "up" && <ArrowUpRight className="h-3 w-3" />}{c.trend === "down" && <ArrowDownRight className="h-3 w-3" />}{c.delta}
        </span>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{c.label}</p>
        <p className="text-2xl md:text-3xl font-bold tracking-tight mt-1">{c.value}</p>
        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{c.desc}</p>
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
        <span className="text-muted-foreground">Updated {c.updated}</span>
        <Link to={c.href} className="text-primary font-semibold hover:underline inline-flex items-center gap-0.5">{c.action} <ArrowRight className="h-3 w-3" /></Link>
      </div>
    </Card>
  );
}

function AlertCard({ tone, icon: Icon, label, value, hint, href }: { tone: "primary" | "success" | "warning" | "destructive"; icon: LucideIcon; label: string; value: string; hint: string; href: string }) {
  const toneMap = {
    primary: "bg-primary/5 border-primary/30 text-primary",
    success: "bg-success/10 border-success/30 text-success",
    warning: "bg-warning/15 border-warning/40 text-warning-foreground",
    destructive: "bg-destructive/10 border-destructive/30 text-destructive",
  }[tone];
  return (
    <Link to={href}>
      <Card className={cn("p-4 border-2 hover:shadow-elegant transition-all flex items-center gap-3", toneMap)}>
        <div className="h-11 w-11 rounded-xl bg-background/70 flex items-center justify-center shrink-0"><Icon className="h-5 w-5" /></div>
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

const periods = ["Daily", "Weekly", "Monthly", "Custom"] as const;
const dayOptions = ["Any day", "Today", "Yesterday", "Custom date"];
const branchOptions = ["All Branches", "Olaya — Riyadh", "Khobar — Eastern", "Jeddah — Western", "Madinah — Western"];
const STORAGE_KEY = "baqala_dashboard_visible_cards";

function Dashboard() {
  const [period, setPeriod] = useState<(typeof periods)[number]>("Daily");
  const [day, setDay] = useState("Any day");
  const [branch, setBranch] = useState("All Branches");
  const allLabels = cards.map((c) => c.label);
  const [visible, setVisible] = useState<string[]>(allLabels);
  const [editing, setEditing] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) { const parsed = JSON.parse(raw) as string[]; setVisible(parsed.filter((l) => allLabels.includes(l))); }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = (next: string[]) => {
    setVisible(next);
    if (typeof window !== "undefined") { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ } }
  };
  const toggleCard = (label: string) => persist(visible.includes(label) ? visible.filter((l) => l !== label) : [...visible, label]);
  const removeCard = (label: string) => persist(visible.filter((l) => l !== label));
  const resetCards = () => persist(allLabels);
  const visibleCards = cards.filter((c) => visible.includes(c.label));

  return (
    <PageShell title="Dashboard" subtitle={`Live snapshot · ${branch} · ${period}${day !== "Any day" ? ` · ${day}` : ""}`}>
      {/* Unified filter row */}
      <Card className="p-3 border-border/60 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={day} onValueChange={setDay}>
            <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>{dayOptions.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
          </Select>
          {day === "Custom date" && <input type="date" className="h-9 px-3 rounded-md border border-input bg-background text-sm" />}
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>{branchOptions.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
          </Select>
          <div className="flex flex-wrap gap-1.5">
            {periods.map((f) => (
              <Button key={f} size="sm" variant={period === f ? "default" : "outline"} className={cn("h-9", period === f && "gradient-primary text-primary-foreground border-0 shadow-glow")} onClick={() => setPeriod(f)}>{f}</Button>
            ))}
          </div>
          {period === "Custom" && (
            <div className="flex items-center gap-1">
              <input type="date" className="h-9 px-2 rounded-md border border-input bg-background text-sm" />
              <span className="text-xs text-muted-foreground">to</span>
              <input type="date" className="h-9 px-2 rounded-md border border-input bg-background text-sm" />
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="text-xs hidden sm:inline-flex">Tuesday · June 2, 2026</Badge>
            <Button size="sm" variant={editing ? "default" : "outline"} className={cn("gap-1.5 h-9", editing && "gradient-primary text-primary-foreground border-0 shadow-glow")} onClick={() => setEditing((v) => !v)}>
              <Settings2 className="h-3.5 w-3.5" />{editing ? "Done" : "Customize Dashboard"}
            </Button>
            <Dialog open={customizeOpen} onOpenChange={setCustomizeOpen}>
              <DialogTrigger asChild><Button size="sm" variant="outline" className="gap-1.5 h-9">Add / Remove</Button></DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Customize Dashboard Cards</DialogTitle>
                  <DialogDescription>Choose which KPI cards to show. {visible.length} of {allLabels.length} selected.</DialogDescription>
                </DialogHeader>
                <div className="max-h-[55vh] overflow-y-auto -mx-2 px-2 space-y-1.5">
                  {cards.map((c) => {
                    const checked = visible.includes(c.label);
                    return (
                      <label key={c.label} className={cn("flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors", checked ? "border-primary/40 bg-primary/5" : "border-border/60 hover:bg-muted/40")}>
                        <Checkbox checked={checked} onCheckedChange={() => toggleCard(c.label)} />
                        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", { primary: "bg-primary/10 text-primary", success: "bg-success/15 text-success", warning: "bg-warning/20 text-warning-foreground", destructive: "bg-destructive/15 text-destructive" }[c.accent ?? "primary"])}>
                          <c.icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0"><p className="text-sm font-semibold truncate">{c.label}</p><p className="text-xs text-muted-foreground truncate">{c.desc}</p></div>
                      </label>
                    );
                  })}
                </div>
                <DialogFooter className="gap-2 sm:gap-2">
                  <Button variant="outline" onClick={resetCards} className="gap-1.5"><RotateCcw className="h-3.5 w-3.5" /> Reset</Button>
                  <Button onClick={() => setCustomizeOpen(false)} className="gradient-primary text-primary-foreground border-0">Done</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </Card>

      {/* Alert cards row */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <AlertCard tone="warning" icon={CalendarClock} label="Near Expiry Items" value="41" hint="Next 7 days · review now" href="/batches" />
        <AlertCard tone="destructive" icon={PackageX} label="Low Stock Items" value="23" hint="6 critical · reorder" href="/inventory" />
        <AlertCard tone="primary" icon={Timer} label="Active Shift Timer" value="04h 38m" hint="Fahad · TML-RYD-001 · since 07:55" href="/cashier-shift" />
        <AlertCard tone="warning" icon={Warehouse} label="Pending Warehouse Approvals" value="7" hint="3 high priority transfers" href="/warehouses" />
      </div>

      {visibleCards.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {visibleCards.map((c) => (<StatCard key={c.label} c={c} editing={editing} onRemove={() => removeCard(c.label)} />))}
        </div>
      ) : (
        <Card className="p-8 border-dashed border-border/60 text-center space-y-2">
          <p className="text-sm font-semibold">No KPI cards visible</p>
          <p className="text-xs text-muted-foreground">Click "Add / Remove" to choose cards.</p>
          <Button size="sm" variant="outline" onClick={() => setCustomizeOpen(true)}>Add cards</Button>
        </Card>
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="overview" className="gap-1.5"><LayoutDashboard className="h-4 w-4" />Overview</TabsTrigger>
          <TabsTrigger value="orders" className="gap-1.5"><ShoppingBag className="h-4 w-4" />Orders</TabsTrigger>
          <TabsTrigger value="inventory" className="gap-1.5"><Package className="h-4 w-4" />Inventory</TabsTrigger>
          <TabsTrigger value="cashiers" className="gap-1.5"><Users className="h-4 w-4" />Cashiers</TabsTrigger>
          <TabsTrigger value="terminals" className="gap-1.5"><TerminalIcon className="h-4 w-4" />Terminals</TabsTrigger>
          <TabsTrigger value="returns" className="gap-1.5"><Undo2 className="h-4 w-4" />Returns</TabsTrigger>
          <TabsTrigger value="tax" className="gap-1.5"><Cigarette className="h-4 w-4" />Tax & Fees</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Widget title="Order Status Summary" link={{ to: "/orders", label: "All orders" }}>
              {[{ l: "Pending", v: 24, c: "bg-warning" }, { l: "Processing", v: 16, c: "bg-primary" }, { l: "Ready", v: 12, c: "bg-primary" }, { l: "Delivered", v: 189, c: "bg-success" }, { l: "Cancelled", v: 3, c: "bg-destructive" }].map((s) => (
                <div key={s.l} className="flex items-center gap-3">
                  <span className={cn("h-2 w-2 rounded-full", s.c)} />
                  <span className="text-sm flex-1">{s.l}</span>
                  <span className="text-sm font-bold tabular-nums">{s.v}</span>
                </div>
              ))}
            </Widget>
            <Widget title="Today's Delivery" link={{ to: "/orders", label: "Deliveries" }}>
              <div className="grid grid-cols-2 gap-3">
                <Mini label="Dispatched" value="48" /><Mini label="In Transit" value="12" />
                <Mini label="Delivered" value="36" /><Mini label="Failed" value="2" tone="destructive" />
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
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2 p-5 border-border/60 shadow-card space-y-3">
              <div className="flex items-center justify-between">
                <div><h3 className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" />Sales Trend · 14 days</h3><p className="text-xs text-muted-foreground">All branches · gross sales</p></div>
                <Badge variant="outline" className="bg-success/15 text-success border-success/30 gap-1"><TrendingUp className="h-3 w-3" />+18% WoW</Badge>
              </div>
              <BiSparkline data={[12,18,16,22,28,24,30,26,34,32,40,38,44,48]} />
            </Card>
            <Card className="p-5 border-border/60 shadow-card space-y-3">
              <h3 className="text-sm font-semibold">Payment Mix</h3>
              {[{ m: "Cash", v: 58, c: "bg-primary" }, { m: "Card", v: 28, c: "bg-success" }, { m: "Wallet", v: 11, c: "bg-warning" }, { m: "Transfer", v: 3, c: "bg-muted-foreground" }].map(p => (
                <div key={p.m}><div className="flex justify-between text-xs mb-1"><span>{p.m}</span><span className="font-semibold">{p.v}%</span></div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden"><div className={cn("h-full", p.c)} style={{ width: `${p.v}%` }} /></div>
                </div>
              ))}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          <Widget title="Order Status Today">
            {[["Pending",24],["Processing",16],["Ready",12],["Delivered",189],["Cancelled",3]].map(([l,v]) => (
              <div key={l as string} className="flex justify-between text-sm"><span>{l}</span><span className="font-bold">{v}</span></div>
            ))}
          </Widget>
        </TabsContent>
        <TabsContent value="inventory" className="mt-4">
          <Widget title="Inventory health">
            <Mini label="Total SKUs" value="2,148" />
            <Mini label="Low Stock" value="23" tone="warning" />
            <Mini label="Expiring" value="41" tone="warning" />
            <Mini label="Out of Stock" value="7" tone="destructive" />
          </Widget>
        </TabsContent>
        <TabsContent value="cashiers" className="mt-4">
          <Widget title="Top cashiers">
            {[{n:"Fahad Al-Qahtani",s:"ر.س 8,420"},{n:"Mohammed Al-Harbi",s:"ر.س 7,180"},{n:"Khalid Al-Otaibi",s:"ر.س 5,310"}].map(r => (
              <div key={r.n} className="flex justify-between text-sm"><span>{r.n}</span><span className="font-semibold">{r.s}</span></div>
            ))}
          </Widget>
        </TabsContent>
        <TabsContent value="terminals" className="mt-4">
          <Widget title="Terminal status">
            <Mini label="Online" value="11" tone="success" />
            <Mini label="Offline" value="1" tone="destructive" />
            <Mini label="Syncing" value="2" />
          </Widget>
        </TabsContent>
        <TabsContent value="returns" className="mt-4">
          <Widget title="Returns & refunds">
            <Mini label="Returns Today" value="8" />
            <Mini label="Refunded" value="ر.س 410" />
            <Mini label="Pending Approval" value="3" tone="warning" />
          </Widget>
        </TabsContent>
        <TabsContent value="tax" className="mt-4">
          <Widget title="Tax & Fees collected (MTD)">
            <Mini label="VAT" value="ر.س 26,180" />
            <Mini label="Tobacco Excise" value="ر.س 18,420" />
            <Mini label="Custom Fees" value="ر.س 4,240" />
          </Widget>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function Widget({ title, link, children }: { title: string; link?: { to: string; label: string }; children: React.ReactNode }) {
  return (
    <Card className="p-5 border-border/60 shadow-card space-y-3">
      <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{title}</h3>
        {link && <Link to={link.to} className="text-xs text-primary font-semibold hover:underline inline-flex items-center gap-0.5">{link.label}<ArrowRight className="h-3 w-3" /></Link>}
      </div>
      <div className="space-y-2.5">{children}</div>
    </Card>
  );
}
function Mini({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "warning" | "destructive" }) {
  const map = { default: "bg-muted/40 text-foreground", success: "bg-success/15 text-success", warning: "bg-warning/15 text-warning-foreground", destructive: "bg-destructive/15 text-destructive" };
  return <div className={cn("rounded-xl p-3", map[tone])}><p className="text-[10px] uppercase tracking-wider font-semibold opacity-70">{label}</p><p className="text-lg font-bold mt-0.5">{value}</p></div>;
}
function BiSparkline({ data }: { data: number[] }) {
  const max = Math.max(...data); const min = Math.min(...data);
  const w = 100, h = 40;
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d - min) / (max - min || 1)) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-24" preserveAspectRatio="none">
      <defs><linearGradient id="grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.4" /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" /></linearGradient></defs>
      <polyline fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" points={pts} />
      <polygon fill="url(#grad)" points={`0,${h} ${pts} ${w},${h}`} />
    </svg>
  );
}
