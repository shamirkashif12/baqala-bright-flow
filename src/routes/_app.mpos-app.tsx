import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Home, ShoppingCart, Receipt, Package, User, ChevronLeft, ChevronRight,
  ScanLine, Search, Bell, CreditCard, Wallet, GitBranch,
  Trash2, Plus, Minus, CheckCircle2, Bookmark, Cpu, AlertCircle, Hourglass,
  TrendingUp, BarChart3, ShieldCheck, LogOut, Smartphone, FileText,
  Banknote, Settings2, Cigarette, Undo2, Globe, Phone as PhoneIcon,
  Sparkles, Zap, Apple, Coffee, Milk, Pizza, ShoppingBag,
} from "lucide-react";
import mimonyLogo from "@/assets/mimony-logo.png.asset.json";

export const Route = createFileRoute("/_app/mpos-app")({ component: MposApp });

// -------- Mock data (mirrors the RN app's mockApi.ts) --------
type Role = "Admin" | "Manager" | "Cashier" | "Inventory Staff";
interface PUser { id: string; name: string; email: string; role: Role }
interface PBranch { id: string; name: string; city: string; code: string }
interface PProduct {
  id: string; name: string; sku: string; barcode: string; category: string;
  price: number; stock: number; daysLeft: number; expiry: "Fresh" | "Close" | "Expired";
}
interface PCart { p: PProduct; qty: number }
interface POrder { id: string; customer: string; total: number; status: string; pay: string; cashier: string; terminal: string; date: string }

const users: PUser[] = [
  { id: "U1", name: "Ayesha Nadeem", email: "ayesha@mart.sa", role: "Admin" },
  { id: "U2", name: "Ahmed Al Harbi", email: "ahmed@mart.sa", role: "Manager" },
  { id: "U3", name: "Sara Khan", email: "sara@mart.sa", role: "Cashier" },
  { id: "U4", name: "Omar Al Qahtani", email: "omar@mart.sa", role: "Cashier" },
];
const branches: PBranch[] = [
  { id: "B1", name: "Riyadh Central Bakala", city: "Riyadh", code: "RYD-01" },
  { id: "B2", name: "Jeddah Mart 02", city: "Jeddah", code: "JED-02" },
  { id: "B3", name: "Dammam Express Bakala", city: "Dammam", code: "DMM-03" },
  { id: "B4", name: "Makkah Neighborhood Mart", city: "Makkah", code: "MKK-04" },
];
const products: PProduct[] = [
  { id: "P1", name: "Almarai Milk 1L", sku: "ALM-MLK", barcode: "6281007012340", category: "Dairy", price: 7.5, stock: 48, daysLeft: 5, expiry: "Close" },
  { id: "P2", name: "Pepsi 330ml", sku: "PEP-330", barcode: "6223000110015", category: "Beverages", price: 2.5, stock: 120, daysLeft: 180, expiry: "Fresh" },
  { id: "P3", name: "Marlboro Red", sku: "MRB-RED", barcode: "5901234567890", category: "Tobacco", price: 28, stock: 30, daysLeft: 365, expiry: "Fresh" },
  { id: "P4", name: "Lays Classic 50g", sku: "LAYS-CLS", barcode: "6281063123451", category: "Snacks", price: 3, stock: 9, daysLeft: 60, expiry: "Fresh" },
  { id: "P5", name: "Nadec Juice 1L", sku: "NDC-JC", barcode: "6281007088884", category: "Beverages", price: 8, stock: 24, daysLeft: 2, expiry: "Close" },
  { id: "P6", name: "Water Bottle 500ml", sku: "WTR-500", barcode: "6281100000123", category: "Beverages", price: 1, stock: 300, daysLeft: 400, expiry: "Fresh" },
  { id: "P7", name: "Bread Pack", sku: "BRD-PK", barcode: "6281019999991", category: "Bakery", price: 5, stock: 4, daysLeft: -1, expiry: "Expired" },
  { id: "P8", name: "Dettol Handwash 200ml", sku: "DTL-HW", barcode: "5000158101234", category: "Household", price: 12, stock: 18, daysLeft: 540, expiry: "Fresh" },
];
const seedOrders: POrder[] = [
  { id: "ORD-10241", customer: "Khalid A.", total: 247.25, status: "completed", pay: "paid", cashier: "Sara Khan", terminal: "TML-RYD-001", date: "Today · 10:14" },
  { id: "ORD-10240", customer: "Walk-in", total: 73.6, status: "pending", pay: "unpaid", cashier: "Omar A.", terminal: "TML-RYD-002", date: "Today · 10:08" },
  { id: "ORD-10239", customer: "Sara G.", total: 473, status: "completed", pay: "paid", cashier: "Sara Khan", terminal: "MPOS-JED-001", date: "Yesterday · 17:21" },
  { id: "ORD-10238", customer: "Nora H.", total: 101.2, status: "refunded", pay: "refunded", cashier: "Omar A.", terminal: "MPOS-DMM-003", date: "Yesterday · 14:02" },
];
const terminals = [
  { id: "TML-RYD-001", branch: "Riyadh Central", type: "POS", status: "Active", emp: "Sara Khan", sync: "2m ago" },
  { id: "TML-RYD-002", branch: "Riyadh Central", type: "POS", status: "Syncing", emp: "Omar A.", sync: "now" },
  { id: "MPOS-JED-001", branch: "Jeddah Mart 02", type: "MPOS", status: "Active", emp: "Ahmed H.", sync: "1m ago" },
  { id: "MPOS-DMM-003", branch: "Dammam Express", type: "MPOS", status: "Offline", emp: "—", sync: "32m ago" },
  { id: "TML-MKK-001", branch: "Makkah Mart", type: "POS", status: "Idle", emp: "—", sync: "8m ago" },
];
const auditLogs = [
  { id: "L1", action: "Login", user: "Sara Khan", role: "Cashier", terminal: "TML-RYD-001", date: "Today · 08:01", status: "success" },
  { id: "L2", action: "Opening Cash Submitted", user: "Sara Khan", role: "Cashier", terminal: "TML-RYD-001", date: "Today · 08:05", status: "success" },
  { id: "L3", action: "Order Created (ORD-10241)", user: "Sara Khan", role: "Cashier", terminal: "TML-RYD-001", date: "Today · 10:14", status: "success" },
  { id: "L4", action: "Payment Completed", user: "Sara Khan", role: "Cashier", terminal: "TML-RYD-001", date: "Today · 10:14", status: "success" },
  { id: "L5", action: "Stock Updated (Lays Classic)", user: "Yousef I.", role: "Inventory", terminal: "—", date: "Today · 09:32", status: "warning" },
];

const sar = (n: number) => `ر.س ${n.toFixed(2)}`;

// -------- Phone frame (desktop preview) / full-bleed (mobile) --------
function Phone({ children, framed }: { children: React.ReactNode; framed: boolean }) {
  if (!framed) {
    return (
      <div className="fixed inset-0 z-30 flex flex-col bg-muted/30 overflow-hidden">
        {children}
      </div>
    );
  }
  return (
    <div className="mx-auto w-full max-w-[380px]">
      <div className="relative aspect-[9/19] w-full rounded-[2.5rem] border-[10px] border-foreground/90 bg-background shadow-elegant overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-foreground/90 rounded-b-2xl z-30" />
        <div className="absolute inset-0 flex flex-col bg-muted/30">{children}</div>
      </div>
    </div>
  );
}

// -------- Header inside phone --------
function PHeader({ title, subtitle, onBack, right }: { title: string; subtitle?: string; onBack?: () => void; right?: React.ReactNode }) {
  return (
    <div className="gradient-primary text-primary-foreground px-4 pt-9 pb-4 rounded-b-3xl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button onClick={onBack} className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0">
            <p className="text-base font-bold truncate">{title}</p>
            {subtitle && <p className="text-[11px] opacity-80 truncate">{subtitle}</p>}
          </div>
        </div>
        {right}
      </div>
    </div>
  );
}

function Badge2({ label }: { label: string }) {
  const k = label.toLowerCase();
  const map: Record<string, string> = {
    active: "bg-success/15 text-success", success: "bg-success/15 text-success",
    paid: "bg-success/15 text-success", completed: "bg-success/15 text-success",
    fresh: "bg-success/15 text-success",
    syncing: "bg-primary/15 text-primary",
    pending: "bg-warning/15 text-warning", unpaid: "bg-warning/15 text-warning",
    warning: "bg-warning/15 text-warning", close: "bg-warning/15 text-warning", held: "bg-warning/15 text-warning",
    offline: "bg-destructive/15 text-destructive", error: "bg-destructive/15 text-destructive",
    expired: "bg-destructive/15 text-destructive", refunded: "bg-destructive/15 text-destructive",
    idle: "bg-muted text-muted-foreground",
  };
  return <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${map[k] ?? "bg-primary/15 text-primary"}`}>{label}</span>;
}

// -------- Bottom tabs --------
type Tab = "Dashboard" | "POS" | "Orders" | "Inventory" | "Profile";
function BottomTabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const items: { k: Tab; icon: React.ComponentType<any> }[] = [
    { k: "Dashboard", icon: Home }, { k: "POS", icon: ShoppingCart }, { k: "Orders", icon: Receipt },
    { k: "Inventory", icon: Package }, { k: "Profile", icon: User },
  ];
  return (
    <div className="border-t bg-background flex">
      {items.map(({ k, icon: I }) => {
        const active = tab === k;
        return (
          <button key={k} onClick={() => onChange(k)} className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 ${active ? "text-primary" : "text-muted-foreground"}`}>
            <I className="h-5 w-5" />
            <span className="text-[10px] font-bold">{k}</span>
          </button>
        );
      })}
    </div>
  );
}

// -------- App state model --------
type Screen =
  | { name: "Login" }
  | { name: "BranchSelect" }
  | { name: "TerminalSelect" }
  | { name: "Main"; tab: Tab }
  | { name: "OpeningCash" }
  | { name: "ClosingReport" }
  | { name: "Cart" }
  | { name: "Payment" }
  | { name: "HeldOrders" }
  | { name: "Invoice"; order: POrder & { items: PCart[]; subtotal: number; tax: number; method: string; invoice: string } }
  | { name: "OrderDetails"; order: POrder }
  | { name: "ItemDetails"; product: PProduct }
  | { name: "TerminalOverview" }
  | { name: "TerminalDetails"; t: typeof terminals[number] }
  | { name: "Reports" }
  | { name: "Audit" }
  | { name: "Returns" };

function MposApp() {
  const isMobile = useIsMobile();
  const [user, setUser] = useState<PUser | null>(null);
  const [branch, setBranch] = useState<PBranch | null>(null);
  const [terminal, setTerminal] = useState<string>("TML-RYD-001");
  const [opening, setOpening] = useState<number | null>(null);
  const [cart, setCart] = useState<PCart[]>([]);
  const [held, setHeld] = useState<PCart[][]>([]);
  const [orders, setOrders] = useState<POrder[]>(seedOrders);
  const [stack, setStack] = useState<Screen[]>([{ name: "Login" }]);
  const [lang, setLang] = useState<"EN" | "AR">("EN");
  const [toast, setToast] = useState<string | null>(null);
  const notify = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 1800); };

  const screen = stack[stack.length - 1];
  const push = (s: Screen) => setStack(p => [...p, s]);
  const replace = (s: Screen) => setStack([s]);
  const back = () => setStack(p => p.length > 1 ? p.slice(0, -1) : p);
  const goTab = (tab: Tab) => setStack([{ name: "Main", tab }]);

  // POS helpers
  const addToCart = (p: PProduct) => {
    if (p.expiry === "Expired") { notify("Expired — cannot be sold"); return; }
    if (!opening) { notify("Submit Opening Cash first"); push({ name: "OpeningCash" }); return; }
    if (p.expiry === "Close") notify(`Warning: ${p.name} close to expiry`);
    setCart(c => {
      const ex = c.find(x => x.p.id === p.id);
      return ex ? c.map(x => x.p.id === p.id ? { ...x, qty: x.qty + 1 } : x) : [...c, { p, qty: 1 }];
    });
  };
  const updateQty = (id: string, d: number) => setCart(c => c.map(x => x.p.id === id ? { ...x, qty: Math.max(1, x.qty + d) } : x));
  const removeItem = (id: string) => setCart(c => c.filter(x => x.p.id !== id));
  const cartSubtotal = cart.reduce((s, x) => s + x.p.price * x.qty, 0);
  const cartTobacco = +cart.filter(x => x.p.category === "Tobacco").reduce((s, x) => s + x.p.price * x.qty * 0.5, 0).toFixed(2);
  const cartTax = +(cartSubtotal * 0.15).toFixed(2);
  const cartTotal = +(cartSubtotal + cartTax + cartTobacco).toFixed(2);

  const finalizeOrder = (method: string) => {
    const ord: POrder = {
      id: `ORD-${Math.floor(Math.random()*90000+10000)}`,
      customer: "Walk-in", total: cartTotal, status: "completed", pay: "paid",
      cashier: user?.name ?? "—", terminal, date: "Today · just now",
    };
    setOrders(o => [ord, ...o]);
    const invOrder = { ...ord, items: cart, subtotal: cartSubtotal, tax: cartTax, tobacco: cartTobacco, method, invoice: `INV-${Date.now()}` } as any;
    setCart([]);
    notify("Payment approved · invoice ready");
    push({ name: "Invoice", order: invOrder });
  };

  const reset = () => { setUser(null); setBranch(null); setOpening(null); setCart([]); setHeld([]); replace({ name: "Login" }); };

  // -------- Screens --------
  const renderScreen = () => {
    if (screen.name === "Login") return <LoginScreen lang={lang} setLang={setLang} onLogin={(u) => { setUser(u); replace({ name: "BranchSelect" }); notify(`Welcome, ${u.name.split(" ")[0]}`); }} />;
    if (screen.name === "BranchSelect") return <BranchSelectScreen user={user!} onPick={(b) => { setBranch(b); replace({ name: "TerminalSelect" }); }} />;
    if (screen.name === "TerminalSelect") return <TerminalSelectScreen terminal={terminal} setTerminal={setTerminal} onDone={() => { replace({ name: "Main", tab: "Dashboard" }); notify("Terminal ready"); }} onBack={back} />;
    if (screen.name === "OpeningCash") return <OpeningCashScreen user={user!} branch={branch!} terminal={terminal} setTerminal={setTerminal} onSubmit={(amt: number) => { setOpening(amt); back(); notify("Shift started · POS active"); }} onBack={back} />;
    if (screen.name === "ClosingReport") return <ClosingReportScreen opening={opening ?? 0} orders={orders} onClose={() => { setOpening(null); back(); notify("Closing submitted · pending review"); }} onBack={back} user={user!} branch={branch!} terminal={terminal} />;
    if (screen.name === "Cart") return <CartScreen cart={cart} onQty={updateQty} onRemove={removeItem} subtotal={cartSubtotal} tax={cartTax} tobacco={cartTobacco} total={cartTotal} onHold={() => { if (cart.length) { setHeld(h => [cart, ...h]); setCart([]); back(); notify("Order held"); } }} onPay={() => push({ name: "Payment" })} onBack={back} />;
    if (screen.name === "Payment") return <PaymentScreen total={cartTotal} subtotal={cartSubtotal} tax={cartTax} tobacco={cartTobacco} onApprove={finalizeOrder} onBack={back} />;
    if (screen.name === "HeldOrders") return <HeldOrdersScreen held={held} onResume={(idx: number) => { setCart(held[idx]); setHeld(h => h.filter((_, i) => i !== idx)); push({ name: "Cart" }); notify("Held order resumed"); }} onBack={back} />;
    if (screen.name === "Invoice") return <InvoiceScreen order={screen.order} onDone={() => goTab("POS")} onBack={back} />;
    if (screen.name === "OrderDetails") return <OrderDetailsScreen o={screen.order} onBack={back} />;
    if (screen.name === "ItemDetails") return <ItemDetailsScreen p={screen.product} onBack={back} />;
    if (screen.name === "TerminalOverview") return <TerminalOverviewScreen onOpen={(t: typeof terminals[number]) => push({ name: "TerminalDetails", t })} onBack={back} />;
    if (screen.name === "TerminalDetails") return <TerminalDetailsScreen t={screen.t} onBack={back} />;
    if (screen.name === "Reports") return <ReportsScreen orders={orders} onBack={back} />;
    if (screen.name === "Audit") return <AuditScreen onBack={back} />;
    if (screen.name === "Returns") return <ReturnsScreen orders={orders} onBack={back} onSubmit={() => { notify("Return submitted for approval"); back(); }} />;
    // Main tabs
    if (screen.name === "Main") {
      const body =
        screen.tab === "Dashboard" ? <DashboardScreen user={user!} branch={branch!} terminal={terminal} opening={opening} orders={orders} onAction={(s: Screen) => push(s)} /> :
        screen.tab === "POS" ? <POSScreen onAdd={addToCart} cartCount={cart.length} cartTotal={cartTotal} onCart={() => push({ name: "Cart" })} onHeld={() => push({ name: "HeldOrders" })} heldCount={held.length} /> :
        screen.tab === "Orders" ? <OrdersScreen orders={orders} onOpen={(o: POrder) => push({ name: "OrderDetails", order: o })} /> :
        screen.tab === "Inventory" ? <InventoryScreen onOpen={(p: PProduct) => push({ name: "ItemDetails", product: p })} /> :
        <ProfileScreen user={user!} branch={branch!} terminal={terminal} opening={opening} onLogout={reset} onNav={(s: Screen) => push(s)} />;
      return (
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto">{body}</div>
          <BottomTabs tab={screen.tab} onChange={goTab} />
        </div>
      );
    }
    return null;
  };

  // Sample state chips
  const stateText = `${user?.name ?? "Not signed in"}${branch ? " · " + branch.code : ""}${opening != null ? " · Shift Active" : ""}`;

  if (isMobile) {
    return (
      <Phone framed={false}>
        {renderScreen()}
        {toast && (
          <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-50 bg-foreground text-background text-xs font-bold px-4 py-2 rounded-full shadow-elegant animate-fade-in">
            {toast}
          </div>
        )}
      </Phone>
    );
  }

  return (
    <PageShell title="MPOS App Preview" subtitle="Interactive cashier-side mobile app · purple/white theme">
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="flex justify-center">
          <Phone framed>
            {renderScreen()}
            {toast && (
              <div className="absolute left-1/2 -translate-x-1/2 bottom-24 z-40 bg-foreground text-background text-[11px] font-bold px-3 py-2 rounded-full shadow-elegant animate-fade-in">
                {toast}
              </div>
            )}
          </Phone>
        </div>
        <div className="space-y-4">
          <Card className="p-4 border-border/60 shadow-card space-y-3">
            <div className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-primary" /><h3 className="font-bold text-sm">App state</h3></div>
            <p className="text-xs text-muted-foreground">{stateText}</p>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-[10px]">Screen: {screen.name}</Badge>
              {cart.length > 0 && <Badge className="text-[10px] gradient-primary text-primary-foreground border-0">{cart.length} in cart</Badge>}
              {held.length > 0 && <Badge variant="secondary" className="text-[10px]">{held.length} held</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button size="sm" variant="outline" onClick={() => goTab("Dashboard")} disabled={!user || !branch}>Dashboard</Button>
              <Button size="sm" variant="outline" onClick={() => goTab("POS")} disabled={!user || !branch}>POS</Button>
              <Button size="sm" variant="outline" onClick={() => push({ name: "OpeningCash" })} disabled={!user || !branch}>Opening Cash</Button>
              <Button size="sm" variant="outline" onClick={() => push({ name: "ClosingReport" })} disabled={!user || !branch || opening == null}>Closing</Button>
              <Button size="sm" variant="outline" onClick={() => push({ name: "Reports" })} disabled={!user || !branch}>Reports</Button>
              <Button size="sm" variant="outline" onClick={() => push({ name: "Audit" })} disabled={!user || !branch}>Audit</Button>
              <Button size="sm" variant="outline" onClick={() => push({ name: "TerminalOverview" })} disabled={!user || !branch}>Terminals</Button>
              <Button size="sm" variant="outline" onClick={() => push({ name: "Returns" })} disabled={!user || !branch}>Returns</Button>
            </div>
            <Button size="sm" variant="destructive" className="w-full" onClick={reset}>Reset session</Button>
          </Card>
          <Card className="p-4 border-border/60 shadow-card text-xs space-y-2">
            <h3 className="font-bold text-sm">Demo accounts</h3>
            {users.map(u => (
              <button key={u.id} onClick={() => { setUser(u); replace({ name: "BranchSelect" }); }} className="w-full flex items-center justify-between rounded-lg border border-border/50 px-2 py-1.5 hover:border-primary/50">
                <span className="font-semibold text-foreground">{u.name}</span>
                <span className="text-muted-foreground">{u.role}</span>
              </button>
            ))}
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

// ===================== Individual screens =====================

function LoginScreen({ onLogin, lang, setLang }: { onLogin: (u: PUser) => void; lang: "EN" | "AR"; setLang: (l: "EN" | "AR") => void }) {
  const [mode, setMode] = useState<"email" | "phone">("email");
  return (
    <div className="flex-1 flex flex-col">
      <div className="gradient-primary text-primary-foreground px-6 pt-12 pb-10 text-center">
        <div className="flex justify-end mb-2">
          <button onClick={() => setLang(lang === "EN" ? "AR" : "EN")} className="flex items-center gap-1 bg-white/15 rounded-full px-2.5 py-1 text-[10px] font-bold">
            <Globe className="h-3 w-3" /> {lang === "EN" ? "English" : "العربية"}
          </button>
        </div>
        <div className="mx-auto h-16 w-16 rounded-2xl bg-white flex items-center justify-center mb-3">
          <Smartphone className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-black tracking-wide">{lang === "EN" ? "BAQALA MPOS" : "بقالة MPOS"}</h1>
        <p className="opacity-80 text-xs mt-1">{lang === "EN" ? "Saudi Baqala POS" : "نقاط بيع بقالة"}</p>
      </div>
      <div className="flex-1 bg-muted/30 rounded-t-3xl -mt-4 p-4 space-y-3 overflow-y-auto">
        <Card className="p-4 space-y-2 border-border/60">
          <p className="text-sm font-bold mb-1">{lang === "EN" ? "Sign in" : "تسجيل الدخول"}</p>
          <div className="flex gap-1">
            <button onClick={() => setMode("email")} className={`flex-1 text-[10px] font-bold py-1 rounded-md border ${mode === "email" ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>Email</button>
            <button onClick={() => setMode("phone")} className={`flex-1 text-[10px] font-bold py-1 rounded-md border ${mode === "phone" ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>Phone</button>
          </div>
          {mode === "email"
            ? <Input placeholder="name@mart.sa" className="h-9" defaultValue="sara@mart.sa" />
            : <Input placeholder="+966 55 300 9003" className="h-9" defaultValue="+966 55 300 9003" />}
          <Input type="password" placeholder="••••••" className="h-9" defaultValue="demo" />
          <Button className="w-full gradient-primary text-primary-foreground border-0 h-9" onClick={() => onLogin(users[2])}>Login</Button>
        </Card>
        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mt-2">Demo accounts</p>
        {users.map(u => (
          <button key={u.id} onClick={() => onLogin(u)} className="w-full">
            <Card className="p-2.5 flex items-center gap-2.5 border-border/60 hover:border-primary/50">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black">{u.name[0]}</div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-xs font-bold truncate">{u.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{u.role}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

function BranchSelectScreen({ user, onPick }: { user: PUser; onPick: (b: PBranch) => void }) {
  return (
    <div className="flex-1 flex flex-col">
      <PHeader title={`Welcome, ${user.name.split(" ")[0]}`} subtitle="Select your branch" />
      <div className="p-3 space-y-2 overflow-y-auto flex-1">
        {branches.map(b => (
          <button key={b.id} onClick={() => onPick(b)} className="w-full">
            <Card className="p-3 flex items-center gap-3 border-border/60 hover:border-primary/50">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center"><Home className="h-5 w-5 text-primary" /></div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold">{b.name}</p>
                <p className="text-[10px] text-muted-foreground">{b.city} · {b.code}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

function TerminalSelectScreen({ terminal, setTerminal, onDone, onBack }: { terminal: string; setTerminal: (t: string) => void; onDone: () => void; onBack: () => void }) {
  return (
    <div className="flex-1 flex flex-col">
      <PHeader title="Select Terminal" subtitle="Pick your MPOS device" onBack={onBack} />
      <div className="p-3 space-y-2 overflow-y-auto flex-1">
        {terminals.map(t => {
          const selected = terminal === t.id;
          const live = t.status === "Active" || t.status === "Syncing";
          return (
            <button key={t.id} onClick={() => setTerminal(t.id)} className="w-full text-left">
              <Card className={`p-3 border ${selected ? "border-primary ring-2 ring-primary/30" : "border-border/60"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative">
                      <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center"><Cpu className="h-4 w-4 text-primary" /></div>
                      {live && <span className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ${t.status === "Active" ? "bg-success" : "bg-primary"} animate-pulse`} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">{t.id}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{t.branch} · {t.type}</p>
                    </div>
                  </div>
                  <Badge2 label={t.status} />
                </div>
              </Card>
            </button>
          );
        })}
      </div>
      <div className="border-t bg-background p-3">
        <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={onDone}>Continue with {terminal}</Button>
      </div>
    </div>
  );
}

function StatTile({ label, value, icon: I, accent = "primary", sub }: { label: string; value: string | number; icon: React.ComponentType<any>; accent?: "primary" | "success" | "warning" | "destructive"; sub?: string }) {
  const m: Record<string, string> = { primary: "text-primary bg-primary/10", success: "text-success bg-success/10", warning: "text-warning bg-warning/10", destructive: "text-destructive bg-destructive/10" };
  return (
    <Card className="p-3 border-border/60 flex-1 min-w-0">
      <div className={`h-8 w-8 rounded-lg ${m[accent]} flex items-center justify-center mb-1.5`}><I className="h-4 w-4" /></div>
      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wide">{label}</p>
      <p className="text-lg font-black mt-0.5 truncate">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </Card>
  );
}

function DashboardScreen({ user, branch, terminal, opening, orders, onAction }: any) {
  const completed = orders.filter((o: POrder) => o.status === "completed");
  const sales = completed.reduce((s: number, o: POrder) => s + o.total, 0);
  const pending = orders.filter((o: POrder) => o.status === "pending").length;
  const lowStock = products.filter(p => p.stock <= 10).length;
  const closeExp = products.filter(p => p.expiry !== "Fresh").length;

  const actions = [
    { l: "Start POS", i: ScanLine, s: { name: "Main", tab: "POS" as Tab } as Screen },
    { l: "Opening Cash", i: Banknote, s: { name: "OpeningCash" } as Screen },
    { l: "Closing Report", i: FileText, s: { name: "ClosingReport" } as Screen },
    { l: "Orders", i: Receipt, s: { name: "Main", tab: "Orders" as Tab } as Screen },
    { l: "Inventory", i: Package, s: { name: "Main", tab: "Inventory" as Tab } as Screen },
    { l: "Terminals", i: Cpu, s: { name: "TerminalOverview" } as Screen },
    { l: "Reports", i: BarChart3, s: { name: "Reports" } as Screen },
    { l: "Audit", i: ShieldCheck, s: { name: "Audit" } as Screen },
  ];

  return (
    <div className="flex flex-col">
      <PHeader title={`Hi, ${user.name.split(" ")[0]}`} subtitle={`${branch.name} · ${user.role}`} right={<Bell className="h-5 w-5" />} />
      <div className="p-3 space-y-3">
        <div className="flex gap-2">
          <StatTile label="Today's Sales" value={sar(sales)} icon={TrendingUp} accent="success" />
          <StatTile label="Orders" value={orders.length} icon={Receipt} />
        </div>
        <div className="flex gap-2">
          <StatTile label="Pending" value={pending} icon={Hourglass} accent="warning" />
          <StatTile label="Completed" value={completed.length} icon={CheckCircle2} accent="success" />
        </div>
        <div className="flex gap-2">
          <StatTile label="Opening Cash" value={opening != null ? sar(opening) : "—"} icon={Banknote} />
          <StatTile label="Terminal" value={terminal} icon={Cpu} />
        </div>
        <div className="flex gap-2">
          <StatTile label="Low Stock" value={lowStock} icon={AlertCircle} accent="destructive" />
          <StatTile label="Close Expiry" value={closeExp} icon={Hourglass} accent="warning" />
        </div>
        <p className="text-xs font-bold mt-2">Quick Actions</p>
        <div className="grid grid-cols-4 gap-2">
          {actions.map(a => (
            <button key={a.l} onClick={() => onAction(a.s)} className="aspect-square flex flex-col items-center justify-center gap-1 rounded-xl border border-border/60 bg-card p-1.5 active:opacity-70">
              <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><a.i className="h-3.5 w-3.5" /></div>
              <span className="text-[9px] font-bold text-center leading-tight">{a.l}</span>
            </button>
          ))}
        </div>
        {user.role === "Cashier" ? (
          <Card className="p-3 border-border/60 space-y-1.5">
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Shift status</span><Badge2 label={opening != null ? "Active" : "Idle"} /></div>
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">Opening cash</span><span className="font-bold">{opening != null ? sar(opening) : "—"}</span></div>
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">My sales</span><span className="font-bold">{sar(sales)}</span></div>
          </Card>
        ) : (
          <div className="flex gap-2">
            <StatTile label="Active TML" value={terminals.filter(t => t.status === "Active").length} icon={Cpu} accent="success" />
            <StatTile label="Offline" value={terminals.filter(t => t.status === "Offline").length} icon={AlertCircle} accent="destructive" />
          </div>
        )}
      </div>
    </div>
  );
}

function OpeningCashScreen({ user, branch, terminal, setTerminal, onSubmit, onBack }: any) {
  const [amount, setAmount] = useState("500");
  const [notes, setNotes] = useState("");
  return (
    <div className="flex-1 flex flex-col">
      <PHeader title="Opening Cash" subtitle="Record starting float" onBack={onBack} />
      <div className="p-3 overflow-y-auto">
        <Card className="p-3 space-y-2 border-border/60">
          <Row k="Cashier" v={user.name} />
          <Row k="Branch" v={branch.name} />
          <p className="text-[10px] text-muted-foreground font-bold uppercase mt-1">Terminal</p>
          <div className="flex flex-wrap gap-1">
            {terminals.map(t => (
              <button key={t.id} onClick={() => setTerminal(t.id)} className={`text-[10px] font-bold px-2 py-1 rounded-full border ${terminal === t.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-foreground"}`}>{t.id}</button>
            ))}
          </div>
          <Field label="Opening cash (SAR)" value={amount} onChange={setAmount} />
          <Field label="Notes" value={notes} onChange={setNotes} />
          <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={() => { const n = parseFloat(amount); if (n > 0) onSubmit(n); }}>Start Shift</Button>
        </Card>
      </div>
    </div>
  );
}

function ClosingReportScreen({ opening, orders, onClose, onBack, user, branch, terminal }: any) {
  const cash = orders.filter((o: POrder) => o.pay === "paid").reduce((s: number, o: POrder) => s + o.total, 0) / 2;
  const card = cash * 0.7;
  const wallet = cash * 0.3;
  const refunds = orders.filter((o: POrder) => o.status === "refunded").reduce((s: number, o: POrder) => s + o.total, 0);
  const [actual, setActual] = useState("");
  const expected = opening + cash - refunds;
  const diff = (parseFloat(actual || "0") || 0) - expected;
  return (
    <div className="flex-1 flex flex-col">
      <PHeader title="Closing Report" subtitle="Day-end" onBack={onBack} />
      <div className="p-3 space-y-3 overflow-y-auto">
        <Card className="p-3 border-border/60 space-y-1.5">
          <Row k="Cashier" v={user.name} />
          <Row k="Branch" v={branch.name} />
          <Row k="Terminal" v={terminal} />
        </Card>
        <Card className="p-3 border-border/60 space-y-1.5">
          <Row k="Opening cash" v={sar(opening)} />
          <Row k="Cash sales" v={sar(cash)} />
          <Row k="Card sales" v={sar(card)} />
          <Row k="Wallet sales" v={sar(wallet)} />
          <Row k="Refunds" v={sar(refunds)} />
          <Row k="Expected closing" v={sar(expected)} highlight />
          <Field label="Actual closing (SAR)" value={actual} onChange={setActual} />
          <Row k="Difference" v={sar(diff)} highlight />
          <div className="flex justify-end pt-1"><Badge2 label="pending" /></div>
          <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={onClose}>Submit Closing</Button>
          <Button variant="outline" className="w-full" onClick={() => alert("Mock: printed / shared")}>Print / Share</Button>
        </Card>
      </div>
    </div>
  );
}

function POSScreen({ onAdd, cartCount, cartTotal, onCart, onHeld, heldCount }: any) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const cats = useMemo(() => ["All", ...Array.from(new Set(products.map(p => p.category)))], []);
  const list = products.filter(p => (cat === "All" || p.category === cat) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="flex-1 flex flex-col">
      <PHeader title="POS" subtitle="Scan or tap" right={
        <button onClick={onHeld} className="relative h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
          <Bookmark className="h-4 w-4" />
          {heldCount > 0 && <span className="absolute -top-1 -right-1 bg-warning text-[9px] font-black rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center">{heldCount}</span>}
        </button>
      } />
      <div className="p-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="h-9 pl-8 pr-9" placeholder="Search or scan…" value={q} onChange={e => setQ(e.target.value)} />
          <button onClick={() => alert("Mock scanner")} className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
            <ScanLine className="h-4 w-4 text-primary" />
          </button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1">
          {cats.map(c => (
            <button key={c} onClick={() => setCat(c)} className={`text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap border ${cat === c ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}>{c}</button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-24">
        <div className="grid grid-cols-2 gap-2">
          {list.map(p => (
            <button key={p.id} onClick={() => onAdd(p)} className="text-left">
              <Card className="p-2 border-border/60">
                <div className="h-14 rounded-md bg-primary/10 flex items-center justify-center mb-1"><Package className="h-5 w-5 text-primary" /></div>
                <p className="text-[11px] font-bold leading-tight truncate">{p.name}</p>
                <p className="text-[9px] text-muted-foreground">{p.category}</p>
                <p className="text-sm font-black text-primary mt-0.5">{sar(p.price)}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className={`text-[9px] font-bold ${p.stock <= 10 ? "text-destructive" : "text-muted-foreground"}`}>Stock: {p.stock}</span>
                  <Badge2 label={p.expiry} />
                </div>
              </Card>
            </button>
          ))}
        </div>
      </div>
      {cartCount > 0 && (
        <div className="absolute left-3 right-3 bottom-16 gradient-primary text-primary-foreground rounded-2xl p-3 flex items-center gap-3 shadow-glow">
          <div className="flex-1">
            <p className="text-[10px] font-bold opacity-90">{cartCount} items</p>
            <p className="text-base font-black">{sar(cartTotal)}</p>
          </div>
          <Button size="sm" className="bg-white text-primary hover:bg-white/90" onClick={onCart}>View Cart</Button>
        </div>
      )}
    </div>
  );
}

function CartScreen({ cart, onQty, onRemove, subtotal, tax, tobacco, total, onHold, onPay, onBack }: any) {
  return (
    <div className="flex-1 flex flex-col">
      <PHeader title="Cart" subtitle={`${cart.length} items`} onBack={onBack} />
      <div className="flex-1 overflow-y-auto p-3 space-y-2 pb-2">
        {cart.length === 0 && <p className="text-center text-xs text-muted-foreground py-10">Cart is empty</p>}
        {cart.map((c: PCart) => (
          <Card key={c.p.id} className="p-2.5 border-border/60">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate">{c.p.name}</p>
                <p className="text-[10px] text-muted-foreground">{sar(c.p.price)} · {c.p.category}</p>
              </div>
              <button onClick={() => onRemove(c.p.id)}><Trash2 className="h-4 w-4 text-destructive" /></button>
            </div>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-1">
                <button onClick={() => onQty(c.p.id, -1)} className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center"><Minus className="h-3 w-3" /></button>
                <span className="w-7 text-center text-xs font-bold">{c.qty}</span>
                <button onClick={() => onQty(c.p.id, 1)} className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center"><Plus className="h-3 w-3" /></button>
              </div>
              <span className="text-sm font-black">{sar(c.p.price * c.qty)}</span>
            </div>
          </Card>
        ))}
      </div>
      <div className="border-t bg-background p-3 space-y-1.5">
        <Row k="Subtotal" v={sar(subtotal)} />
        <Row k="VAT 15%" v={sar(tax)} />
        {tobacco > 0 && <Row k="Tobacco tax" v={sar(tobacco)} />}
        <Row k="Total" v={sar(total)} highlight />
        <div className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1" onClick={onHold} disabled={!cart.length}>Hold</Button>
          <Button className="flex-[2] gradient-primary text-primary-foreground border-0" onClick={onPay} disabled={!cart.length}>Payment</Button>
        </div>
      </div>
    </div>
  );
}

function PaymentScreen({ total, subtotal, tax, tobacco, onApprove, onBack }: any) {
  const [method, setMethod] = useState<"Cash" | "Card" | "Wallet" | "Split">("Cash");
  const [received, setReceived] = useState("");
  const change = Math.max(0, (parseFloat(received || "0") || 0) - total);
  const methods: { k: typeof method; i: React.ComponentType<any> }[] = [
    { k: "Cash", i: Banknote }, { k: "Card", i: CreditCard }, { k: "Wallet", i: Wallet }, { k: "Split", i: GitBranch },
  ];
  return (
    <div className="flex-1 flex flex-col">
      <PHeader title="Payment" subtitle={sar(total)} onBack={onBack} />
      <div className="p-3 space-y-3 overflow-y-auto">
        <Card className="p-3 border-border/60">
          <p className="text-xs font-bold mb-2">Payment Method</p>
          <div className="grid grid-cols-2 gap-2">
            {methods.map(({ k, i: I }) => {
              const active = method === k;
              return (
                <button key={k} onClick={() => setMethod(k)} className={`flex flex-col items-center gap-1 py-3 rounded-xl border ${active ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}>
                  <I className="h-5 w-5" />
                  <span className="text-xs font-bold">{k}</span>
                </button>
              );
            })}
          </div>
        </Card>
        {method === "Cash" && (
          <Card className="p-3 border-border/60 space-y-2">
            <Field label="Amount received" value={received} onChange={setReceived} />
            <Row k="Change" v={sar(change)} highlight />
          </Card>
        )}
        {method === "Card" && (
          <Card className="p-3 border-border/60 flex items-center justify-between">
            <span className="text-xs">Card machine</span><Badge2 label="active" />
          </Card>
        )}
        <Card className="p-3 border-border/60 space-y-1.5">
          <Row k="Subtotal" v={sar(subtotal)} />
          <Row k="VAT 15%" v={sar(tax)} />
          {tobacco > 0 && <Row k="Tobacco tax" v={sar(tobacco)} />}
          <Row k="Total" v={sar(total)} highlight />
        </Card>
        <Button className="w-full gradient-primary text-primary-foreground border-0 h-11" onClick={() => onApprove(method)}>Approve Payment</Button>
      </div>
    </div>
  );
}

function InvoiceScreen({ order, onDone, onBack }: any) {
  return (
    <div className="flex-1 flex flex-col">
      <PHeader title="Invoice" subtitle={order.invoice} onBack={onBack} />
      <div className="flex-1 overflow-y-auto p-3">
        <Card className="p-4 border-border/60">
          <p className="text-center text-xl font-black text-primary">MART ECR</p>
          <p className="text-center text-[10px] text-muted-foreground">Tax Invoice · ZATCA verified</p>
          <div className="my-2 border-t border-dashed" />
          <Row k="Invoice" v={order.invoice} />
          <Row k="Order" v={order.id} />
          <Row k="Cashier" v={order.cashier} />
          <Row k="Terminal" v={order.terminal} />
          <div className="my-2 border-t border-dashed" />
          {order.items.map((it: PCart) => (
            <div key={it.p.id} className="flex justify-between text-xs py-1">
              <span>{it.p.name} × {it.qty}</span><span className="font-bold">{sar(it.p.price * it.qty)}</span>
            </div>
          ))}
          <div className="my-2 border-t border-dashed" />
          <Row k="Subtotal" v={sar(order.subtotal)} />
          <Row k="VAT 15%" v={sar(order.tax)} />
          {order.tobacco > 0 && <Row k="Tobacco tax" v={sar(order.tobacco)} />}
          <Row k="Total" v={sar(order.total)} highlight />
          <Row k="Payment" v={order.method} />
        </Card>
      </div>
      <div className="border-t bg-background p-3 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => alert("Mock printed")}>Print</Button>
        <Button variant="outline" className="flex-1" onClick={() => alert("Mock shared")}>Share</Button>
        <Button className="flex-1 gradient-primary text-primary-foreground border-0" onClick={onDone}>Done</Button>
      </div>
    </div>
  );
}

function HeldOrdersScreen({ held, onResume, onBack }: any) {
  return (
    <div className="flex-1 flex flex-col">
      <PHeader title="Held Orders" subtitle={`${held.length} on hold`} onBack={onBack} />
      <div className="p-3 space-y-2 overflow-y-auto">
        {held.length === 0 && <p className="text-center text-xs text-muted-foreground py-10">No held orders</p>}
        {held.map((h: PCart[], i: number) => {
          const total = h.reduce((s, x) => s + x.p.price * x.qty, 0) * 1.15;
          return (
            <button key={i} className="w-full text-left" onClick={() => onResume(i)}>
              <Card className="p-3 border-border/60">
                <div className="flex justify-between"><span className="text-xs font-black text-primary">HLD-{1000 + i}</span><Badge2 label="held" /></div>
                <p className="text-xs font-bold mt-1">Walk-in</p>
                <p className="text-sm font-black">{sar(total)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{h.length} items · tap to resume</p>
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function OrdersScreen({ orders, onOpen }: any) {
  const [q, setQ] = useState(""); const [st, setSt] = useState("All");
  const list = orders.filter((o: POrder) => (st === "All" || o.status === st) && (!q || `${o.id} ${o.customer}`.toLowerCase().includes(q.toLowerCase())));
  const statuses = ["All", "pending", "completed", "refunded"];
  return (
    <div className="flex flex-col">
      <PHeader title="Orders" subtitle={`${list.length} found`} />
      <div className="p-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="h-9 pl-8" placeholder="Order id or customer" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {statuses.map(s => (
            <button key={s} onClick={() => setSt(s)} className={`text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap border capitalize ${st === s ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}>{s}</button>
          ))}
        </div>
        {list.map((o: POrder) => (
          <button key={o.id} className="w-full text-left" onClick={() => onOpen(o)}>
            <Card className="p-3 border-border/60">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-primary">{o.id}</span>
                <Badge2 label={o.status} />
              </div>
              <p className="text-xs font-bold mt-1">{o.customer}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm font-black">{sar(o.total)}</span>
                <Badge2 label={o.pay} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">{o.cashier} · {o.terminal} · {o.date}</p>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

function OrderDetailsScreen({ o, onBack }: any) {
  return (
    <div className="flex-1 flex flex-col">
      <PHeader title={o.id} subtitle={o.customer} onBack={onBack} />
      <div className="p-3 space-y-3 overflow-y-auto">
        <Card className="p-3 border-border/60 space-y-1.5">
          <div className="flex justify-between"><span className="text-xs font-bold">Summary</span><Badge2 label={o.status} /></div>
          <Row k="Customer" v={o.customer} /><Row k="Cashier" v={o.cashier} />
          <Row k="Terminal" v={o.terminal} /><Row k="Date" v={o.date} />
        </Card>
        <Card className="p-3 border-border/60 space-y-1.5">
          <p className="text-xs font-bold">Payment</p>
          <Row k="Status" v={o.pay} /><Row k="Total" v={sar(o.total)} highlight />
        </Card>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => alert("Mock print")}>Print</Button>
          <Button variant="outline" className="flex-1" onClick={() => alert("Mock share")}>Share</Button>
          <Button variant="destructive" className="flex-1" onClick={() => alert("Refund requested")}>Refund</Button>
        </div>
      </div>
    </div>
  );
}

function InventoryScreen({ onOpen }: any) {
  const [q, setQ] = useState(""); const [ef, setEf] = useState("All");
  const exps = ["All", "Fresh", "Close", "Expired"];
  const list = products.filter(p => (!q || p.name.toLowerCase().includes(q.toLowerCase())) && (ef === "All" || p.expiry === ef));
  return (
    <div className="flex flex-col">
      <PHeader title="Inventory" subtitle={`${list.length} items`} />
      <div className="p-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="h-9 pl-8" placeholder="Search items" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {exps.map(e => (
            <button key={e} onClick={() => setEf(e)} className={`text-[10px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap border ${ef === e ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}>{e}</button>
          ))}
        </div>
        {list.map(p => (
          <button key={p.id} className="w-full text-left" onClick={() => onOpen(p)}>
            <Card className="p-3 border-border/60">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">{p.sku} · {p.category}</p>
                </div>
                <Badge2 label={p.expiry} />
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs">Stock: <span className={`font-black ${p.stock <= 10 ? "text-destructive" : ""}`}>{p.stock}</span></span>
                <span className="text-sm font-black text-primary">{sar(p.price)}</span>
              </div>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

function ItemDetailsScreen({ p, onBack }: any) {
  return (
    <div className="flex-1 flex flex-col">
      <PHeader title={p.name} subtitle={p.sku} onBack={onBack} />
      <div className="p-3 space-y-3 overflow-y-auto">
        <Card className="p-3 border-border/60 space-y-1.5">
          <div className="flex justify-between"><span className="text-xs font-bold">{p.name}</span><Badge2 label={p.expiry} /></div>
          <Row k="SKU" v={p.sku} /><Row k="Barcode" v={p.barcode} /><Row k="Category" v={p.category} />
          <Row k="Days left" v={String(p.daysLeft)} />
        </Card>
        <Card className="p-3 border-border/60 space-y-1.5">
          <p className="text-xs font-bold">Stock & Pricing</p>
          <Row k="Stock" v={String(p.stock)} />
          <Row k="Selling price" v={sar(p.price)} highlight />
          <Row k="Purchase price" v={sar(p.price * 0.7)} />
        </Card>
        <Card className="p-3 border-border/60 space-y-1.5">
          <p className="text-xs font-bold">Stock Movements</p>
          {[{t:"Sale", q:-2, w:"Sara K · Today"},{t:"Restock", q:20, w:"Warehouse · Yesterday"},{t:"Adjustment", q:-1, w:"Omar A · 2d"}].map((m, i) => (
            <div key={i} className="flex justify-between text-xs py-1 border-b border-border/40 last:border-b-0">
              <div><p className="font-bold">{m.t}</p><p className="text-[9px] text-muted-foreground">{m.w}</p></div>
              <span className={`font-black ${m.q > 0 ? "text-success" : "text-destructive"}`}>{m.q > 0 ? `+${m.q}` : m.q}</span>
            </div>
          ))}
        </Card>
        <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={() => alert("Adjustment requested")}>Request Stock Adjustment</Button>
      </div>
    </div>
  );
}

function TerminalOverviewScreen({ onOpen, onBack }: any) {
  return (
    <div className="flex-1 flex flex-col">
      <PHeader title="Terminals" subtitle="Bird-eye view" onBack={onBack} />
      <div className="p-3 space-y-3 overflow-y-auto">
        <div className="flex gap-2">
          <StatTile label="Total" value={terminals.length} icon={Cpu} />
          <StatTile label="Active" value={terminals.filter(t => t.status === "Active").length} icon={CheckCircle2} accent="success" />
        </div>
        <div className="flex gap-2">
          <StatTile label="Syncing" value={terminals.filter(t => t.status === "Syncing").length} icon={Cpu} />
          <StatTile label="Offline" value={terminals.filter(t => t.status === "Offline").length} icon={AlertCircle} accent="destructive" />
        </div>
        {terminals.map(t => (
          <button key={t.id} className="w-full text-left" onClick={() => onOpen(t)}>
            <Card className="p-3 border-border/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="relative">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center"><Cpu className="h-4 w-4 text-primary" /></div>
                    {(t.status === "Active" || t.status === "Syncing") && (
                      <span className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${t.status === "Active" ? "bg-success" : "bg-primary"} animate-pulse`} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">{t.id}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{t.branch} · {t.type}</p>
                  </div>
                </div>
                <Badge2 label={t.status} />
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                <span>Emp: {t.emp}</span><span>Sync {t.sync}</span>
              </div>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}

function TerminalDetailsScreen({ t, onBack }: any) {
  return (
    <div className="flex-1 flex flex-col">
      <PHeader title={t.id} subtitle={t.branch} onBack={onBack} />
      <div className="p-3 space-y-3 overflow-y-auto">
        <Card className="p-3 border-border/60 space-y-1.5">
          <div className="flex justify-between"><span className="text-xs font-bold">{t.id}</span><Badge2 label={t.status} /></div>
          <Row k="Branch" v={t.branch} /><Row k="Type" v={t.type} />
          <Row k="Current employee" v={t.emp} /><Row k="Last sync" v={t.sync} />
        </Card>
        <Card className="p-3 border-border/60 space-y-1.5">
          <p className="text-xs font-bold">Shift</p>
          <Row k="Opening cash" v={sar(500)} /><Row k="Orders processed" v="42" />
          <Row k="Total sales" v={sar(3210.5)} highlight />
        </Card>
        <Card className="p-3 border-border/60 space-y-1">
          <p className="text-xs font-bold">Device Logs</p>
          {["Ping OK", "Sync complete", "Card reader connected", "App updated to v2.4.1"].map(l => (
            <p key={l} className="text-[10px] text-muted-foreground">• {l}</p>
          ))}
        </Card>
      </div>
    </div>
  );
}

function ReportsScreen({ orders, onBack }: any) {
  const [active, setActive] = useState("sales");
  const completed = orders.filter((o: POrder) => o.status === "completed");
  const sales = completed.reduce((s: number, o: POrder) => s + o.total, 0);
  const tiles = [
    { k: "sales", l: "Sales", i: TrendingUp },
    { k: "orders", l: "Orders", i: Receipt },
    { k: "inv", l: "Inventory", i: Package },
    { k: "low", l: "Low Stock", i: AlertCircle },
    { k: "exp", l: "Expiry", i: Hourglass },
    { k: "term", l: "Terminals", i: Cpu },
  ];
  return (
    <div className="flex-1 flex flex-col">
      <PHeader title="Reports" subtitle="Filter, view, export" onBack={onBack} />
      <div className="p-3 space-y-3 overflow-y-auto">
        <div className="grid grid-cols-3 gap-2">
          {tiles.map(t => (
            <button key={t.k} onClick={() => setActive(t.k)} className={`flex flex-col items-center gap-1 p-2 rounded-xl border ${active === t.k ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}>
              <t.i className="h-4 w-4" />
              <span className="text-[10px] font-bold">{t.l}</span>
            </button>
          ))}
        </div>
        <Card className="p-3 border-border/60 space-y-1.5">
          {active === "sales" && (<><Row k="Completed" v={String(completed.length)} /><Row k="Gross sales" v={sar(sales)} highlight />
            <div className="flex items-end gap-1 h-16 mt-2">{[12,18,9,24,14,21,17].map((v,i) => <div key={i} className="flex-1 bg-primary rounded-sm" style={{ height: `${(v/24)*100}%`, opacity: 0.4 + i*0.08 }} />)}</div></>)}
          {active === "orders" && ["completed","pending","refunded"].map(s => <Row key={s} k={s} v={String(orders.filter((o:POrder)=>o.status===s).length)} />)}
          {active === "inv" && <><Row k="Total items" v={String(products.length)} /><Row k="In stock" v={String(products.filter(p=>p.stock>10).length)} /></>}
          {active === "low" && products.filter(p=>p.stock<=10).map(p=><Row key={p.id} k={p.name} v={String(p.stock)} />)}
          {active === "exp" && products.filter(p=>p.expiry!=="Fresh").map(p=><Row key={p.id} k={p.name} v={`${p.daysLeft}d`} />)}
          {active === "term" && terminals.map(t=><Row key={t.id} k={t.id} v={t.status} />)}
        </Card>
      </div>
    </div>
  );
}

function AuditScreen({ onBack }: any) {
  return (
    <div className="flex-1 flex flex-col">
      <PHeader title="Audit Logs" subtitle={`${auditLogs.length} entries`} onBack={onBack} />
      <div className="p-3 space-y-2 overflow-y-auto">
        {auditLogs.map(l => (
          <Card key={l.id} className="p-3 border-border/60">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold truncate">{l.action}</p>
              <Badge2 label={l.status} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{l.user} · {l.role}</p>
            <p className="text-[10px] text-muted-foreground">{l.terminal} · {l.date}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ReturnsScreen({ orders, onBack, onSubmit }: any) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selected, setSelected] = useState<POrder | null>(null);
  const [reason, setReason] = useState("Damaged item");
  const [qty, setQty] = useState("1");
  const reasons = ["Damaged item", "Expired item", "Wrong item", "Customer changed mind", "Price issue", "Duplicate billing"];
  return (
    <div className="flex-1 flex flex-col">
      <PHeader title="Customer Returns" subtitle={`Step ${step} of 3`} onBack={onBack} />
      <div className="p-3 space-y-3 overflow-y-auto">
        {step === 1 && (
          <>
            <p className="text-xs font-bold">1. Pick the order</p>
            {orders.slice(0, 6).map((o: POrder) => (
              <button key={o.id} className="w-full text-left" onClick={() => { setSelected(o); setStep(2); }}>
                <Card className="p-3 border-border/60 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-primary">{o.id}</p>
                    <p className="text-[10px] text-muted-foreground">{o.customer} · {o.date}</p>
                  </div>
                  <span className="text-sm font-black">{sar(o.total)}</span>
                </Card>
              </button>
            ))}
          </>
        )}
        {step === 2 && selected && (
          <>
            <p className="text-xs font-bold">2. Items in {selected.id}</p>
            {products.slice(0, 3).map(p => (
              <button key={p.id} className="w-full text-left" onClick={() => setStep(3)}>
                <Card className="p-3 border-border/60 flex items-center justify-between">
                  <div className="min-w-0"><p className="text-xs font-bold truncate">{p.name}</p><p className="text-[10px] text-muted-foreground">{p.sku}</p></div>
                  <span className="text-xs font-black text-primary">{sar(p.price)}</span>
                </Card>
              </button>
            ))}
          </>
        )}
        {step === 3 && (
          <Card className="p-3 border-border/60 space-y-2">
            <p className="text-xs font-bold">3. Reason & refund</p>
            <Field label="Quantity" value={qty} onChange={setQty} />
            <p className="text-[10px] text-muted-foreground font-bold uppercase">Reason</p>
            <div className="flex flex-wrap gap-1">
              {reasons.map(r => (
                <button key={r} onClick={() => setReason(r)} className={`text-[10px] font-bold px-2 py-1 rounded-full border ${reason === r ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>{r}</button>
              ))}
            </div>
            <Row k="Refund method" v="Original (Cash)" />
            <Row k="Refund amount" v={sar(15.5 * (parseFloat(qty) || 1))} highlight />
            <div className="flex justify-end pt-1"><Badge2 label="pending" /></div>
            <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={onSubmit}><Undo2 className="h-4 w-4 mr-1" />Submit Return</Button>
          </Card>
        )}
      </div>
    </div>
  );
}

function ProfileScreen({ user, branch, terminal, opening, onLogout, onNav }: any) {
  const links: { l: string; i: React.ComponentType<any>; s: Screen }[] = [
    { l: "Opening Cash", i: Banknote, s: { name: "OpeningCash" } },
    { l: "Closing Report", i: FileText, s: { name: "ClosingReport" } },
    { l: "Held Orders", i: Bookmark, s: { name: "HeldOrders" } },
    { l: "Terminals", i: Cpu, s: { name: "TerminalOverview" } },
    { l: "Reports", i: BarChart3, s: { name: "Reports" } },
    { l: "Audit Logs", i: ShieldCheck, s: { name: "Audit" } },
  ];
  return (
    <div className="flex flex-col">
      <PHeader title="Profile" subtitle={user.role} />
      <div className="p-3 space-y-3">
        <Card className="p-3 border-border/60 flex items-center gap-3">
          <div className="h-12 w-12 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-black text-lg">{user.name[0]}</div>
          <div>
            <p className="text-sm font-black">{user.name}</p>
            <p className="text-[10px] text-muted-foreground">{user.email} · {user.role}</p>
          </div>
        </Card>
        <Card className="p-3 border-border/60 space-y-1.5">
          <Row k="Branch" v={branch.name} /><Row k="Terminal" v={terminal} />
          <Row k="Shift" v={opening != null ? "Active" : "Idle"} />
          <Row k="Opening cash" v={opening != null ? sar(opening) : "—"} />
        </Card>
        {links.map(({ l, i: I, s }) => (
          <button key={l} className="w-full text-left" onClick={() => onNav(s)}>
            <Card className="p-3 border-border/60 flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center"><I className="h-4 w-4 text-primary" /></div>
              <span className="flex-1 text-xs font-bold">{l}</span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Card>
          </button>
        ))}
        <Button variant="destructive" className="w-full" onClick={onLogout}><LogOut className="h-4 w-4 mr-1" />Logout</Button>
      </div>
    </div>
  );
}

// -------- Tiny atoms --------
function Row({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between text-xs py-0.5">
      <span className="text-muted-foreground capitalize">{k}</span>
      <span className={highlight ? "font-black text-primary" : "font-bold"}>{v}</span>
    </div>
  );
}
function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] text-muted-foreground font-bold uppercase">{label}</p>
      <Input className="h-9" value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}