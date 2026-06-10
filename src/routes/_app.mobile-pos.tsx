import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ScanLine, Search, WifiOff, Plus, Banknote, CreditCard, Wallet, Building2,
  Bell, ChevronRight, ShoppingBag, Trash2, CheckCircle2, QrCode, X, Smartphone, Monitor,
  Package, BarChart3, History as HistoryIcon, ClipboardCheck, AlertTriangle, TrendingUp,
  Undo2, CalendarClock,
} from "lucide-react";
import { BaqalaLogo } from "@/components/baqala-logo";
import { MetricCard } from "@/components/metric-card";
import { FilterBar } from "@/components/filter-bar";
import { DataTable, StatusBadge } from "@/components/module-placeholder";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_app/mobile-pos")({ component: Unified });

function Phone({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-[260px] sm:w-[280px] h-[560px] sm:h-[580px] rounded-[2.5rem] border-[10px] border-foreground/90 bg-background shadow-elegant overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-foreground/90 rounded-b-2xl z-10" />
        <div className="h-full overflow-y-auto">{children}</div>
      </div>
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}

function Screen({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-3">
      <Card className="w-full aspect-[3/4] rounded-3xl border-4 border-foreground/80 bg-background overflow-hidden shadow-elegant relative">
        <div className="absolute inset-0 flex flex-col">{children}</div>
      </Card>
      <p className="text-sm font-semibold text-center text-muted-foreground">{label}</p>
    </div>
  );
}

function Unified() {
  const [tab, setTab] = useState("mobile");
  return (
    <PageShell
      title="Mobile POS & Self-Checkout Kiosk"
      subtitle="Unified workspace · designed for on-the-go cashiers and self-service customers"
    >
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto mb-6">
          <TabsTrigger value="mobile" className="gap-2"><Smartphone className="h-4 w-4" />Mobile POS</TabsTrigger>
          <TabsTrigger value="kiosk" className="gap-2"><Monitor className="h-4 w-4" />Self-Checkout</TabsTrigger>
          <TabsTrigger value="items" className="gap-2"><Package className="h-4 w-4" />Items</TabsTrigger>
          <TabsTrigger value="reports" className="gap-2"><BarChart3 className="h-4 w-4" />Reports</TabsTrigger>
          <TabsTrigger value="dayend" className="gap-2"><ClipboardCheck className="h-4 w-4" />Day-End</TabsTrigger>
          <TabsTrigger value="audit" className="gap-2"><HistoryIcon className="h-4 w-4" />Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="mobile" className="mt-0">
          <div className="flex flex-wrap justify-center gap-6 sm:gap-8 py-2">
            <Phone label="Home — Today">
              <div className="px-4 pt-10 pb-4 gradient-primary text-primary-foreground">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs opacity-80">Olaya Branch · Mobile-02</p>
                    <p className="text-lg font-bold">Hi Fahad 👋</p>
                  </div>
                  <Bell className="h-5 w-5" />
                </div>
                <div className="mt-4 rounded-2xl bg-white/15 backdrop-blur p-4 border border-white/20">
                  <p className="text-xs opacity-80">Sales today</p>
                  <p className="text-3xl font-bold mt-1">ر.س 4,820</p>
                  <div className="flex justify-between text-xs mt-3 opacity-90"><span>87 orders</span><span>↑ 14% vs yesterday</span></div>
                </div>
              </div>
              <div className="p-4 space-y-3">
                <Button className="w-full h-14 text-base gradient-primary text-primary-foreground border-0 shadow-glow gap-2"><ScanLine className="h-5 w-5" /> New Sale</Button>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { i: ScanLine, l: "Scan" },
                    { i: Search, l: "Search" },
                    { i: ShoppingBag, l: "Cart" },
                    { i: Building2, l: "Branch" },
                  ].map((q) => (
                    <Card key={q.l} className="p-3 border-border/60 flex flex-col items-center gap-1.5 cursor-pointer hover:border-primary/40"><q.i className="h-5 w-5 text-primary" /><span className="text-xs font-medium">{q.l}</span></Card>
                  ))}
                </div>
                <Card className="p-3 border-warning/30 bg-warning/10 flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-warning/30 flex items-center justify-center">⚠️</div>
                  <div className="flex-1"><p className="text-xs font-semibold">6 items low stock</p><p className="text-[10px] text-muted-foreground">Tap to review</p></div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Card>
                <Card className="p-3 border-border/60 flex items-center gap-2.5">
                  <WifiOff className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1"><p className="text-xs font-semibold">Online · synced</p><p className="text-[10px] text-muted-foreground">Last sync 1 min ago</p></div>
                </Card>
              </div>
            </Phone>

            <Phone label="Cart & Checkout">
              <div className="px-4 pt-10 pb-3 border-b border-border flex items-center justify-between">
                <p className="font-semibold">Order · 3 items</p>
                <Badge variant="outline" className="text-[10px]">Walk-in</Badge>
              </div>
              <div className="p-3 space-y-2">
                {[
                  { n: "Almarai Laban 1L", q: 2, p: "13.00", e: "🥛" },
                  { n: "Nadec Milk 2L", q: 1, p: "12.00", e: "🥛" },
                  { n: "Sadia Chicken 1kg", q: 1, p: "28.00", e: "🍗" },
                ].map((i) => (
                  <Card key={i.n} className="p-2.5 border-border/60 flex items-center gap-2.5">
                    <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center text-xl">{i.e}</div>
                    <div className="flex-1 min-w-0"><p className="text-xs font-semibold truncate">{i.n}</p><p className="text-[10px] text-muted-foreground">×{i.q} · ر.س {i.p}</p></div>
                    <Plus className="h-4 w-4 text-primary" />
                  </Card>
                ))}
              </div>
              <div className="px-4 py-3 bg-muted/50 mt-2 space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>ر.س 53.00</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">VAT 15%</span><span>ر.س 7.95</span></div>
                <div className="flex justify-between font-bold text-base pt-1 border-t border-dashed"><span>Total</span><span className="text-primary">ر.س 60.95</span></div>
              </div>
              <div className="p-3 grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" className="flex-col h-14 gap-1 text-[10px]"><Banknote className="h-4 w-4" />Cash</Button>
                <Button variant="outline" size="sm" className="flex-col h-14 gap-1 text-[10px]"><CreditCard className="h-4 w-4" />Card</Button>
                <Button variant="outline" size="sm" className="flex-col h-14 gap-1 text-[10px]"><Wallet className="h-4 w-4" />Wallet</Button>
              </div>
              <div className="px-3 pb-3">
                <Button className="w-full h-12 gradient-primary text-primary-foreground border-0 shadow-glow">Charge ر.س 60.95</Button>
              </div>
            </Phone>

            <Phone label="Scan Barcode">
              <div className="h-full bg-foreground/95 text-primary-foreground relative">
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-6">
                  <div className="relative w-56 h-56 rounded-3xl border-2 border-primary-glow/80">
                    <div className="absolute -top-1 left-0 w-10 h-10 border-t-4 border-l-4 border-primary-glow rounded-tl-3xl" />
                    <div className="absolute -top-1 right-0 w-10 h-10 border-t-4 border-r-4 border-primary-glow rounded-tr-3xl" />
                    <div className="absolute -bottom-1 left-0 w-10 h-10 border-b-4 border-l-4 border-primary-glow rounded-bl-3xl" />
                    <div className="absolute -bottom-1 right-0 w-10 h-10 border-b-4 border-r-4 border-primary-glow rounded-br-3xl" />
                    <div className="absolute left-2 right-2 top-1/2 h-0.5 bg-primary-glow shadow-glow" />
                  </div>
                  <p className="text-sm opacity-80">Align barcode within the frame</p>
                  <Button variant="secondary" size="sm" className="bg-white/15 backdrop-blur border border-white/30 text-white hover:bg-white/25">Enter manually</Button>
                </div>
              </div>
            </Phone>
          </div>
        </TabsContent>

        <TabsContent value="kiosk" className="mt-0">
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <Screen label="Welcome">
              <div className="flex-1 gradient-primary flex flex-col items-center justify-center text-primary-foreground text-center p-8 gap-6">
                <BaqalaLogo showText={false} />
                <div>
                  <h2 className="text-3xl font-bold">Welcome</h2>
                  <p className="text-xl opacity-90 mt-1" dir="rtl">أهلاً بك</p>
                </div>
                <p className="opacity-80 text-sm">Tap to start your self-checkout</p>
                <Button size="lg" className="bg-white text-primary hover:bg-white/90 h-16 w-48 text-lg font-bold rounded-2xl shadow-elegant">Start</Button>
                <div className="flex gap-2 mt-2">
                  <Badge className="bg-white/20 border-white/30 text-white backdrop-blur">EN</Badge>
                  <Badge className="bg-white/20 border-white/30 text-white backdrop-blur">العربية</Badge>
                </div>
              </div>
            </Screen>

            <Screen label="Scan items">
              <div className="p-5 flex items-center justify-between border-b">
                <p className="font-bold text-lg">Scan items</p>
                <Button variant="ghost" size="icon"><X className="h-5 w-5" /></Button>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center bg-muted/40 p-6 gap-5">
                <div className="h-32 w-32 rounded-3xl gradient-primary flex items-center justify-center shadow-glow">
                  <ScanLine className="h-16 w-16 text-primary-foreground" />
                </div>
                <p className="text-xl font-semibold text-center">Place product under the scanner</p>
                <p className="text-sm text-muted-foreground text-center" dir="rtl">ضع المنتج أمام الماسح</p>
              </div>
              <div className="p-4 border-t flex gap-3">
                <Button variant="outline" className="flex-1 h-14 text-base">Search</Button>
                <Button className="flex-1 h-14 text-base gradient-primary text-primary-foreground border-0">View Cart (4)</Button>
              </div>
            </Screen>

            <Screen label="Cart & coupon">
              <div className="p-4 border-b flex items-center justify-between"><p className="font-bold">Your cart</p><Badge className="gradient-primary text-primary-foreground border-0">4 items</Badge></div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {[
                  { n: "Almarai Laban 1L", q: 2, p: 13, e: "🥛" },
                  { n: "Nadec Milk 2L", q: 1, p: 12, e: "🥛" },
                  { n: "Lay's Classic", q: 2, p: 7, e: "🍟" },
                  { n: "Banana 1kg", q: 1, p: 6, e: "🍌" },
                ].map((i) => (
                  <Card key={i.n} className="p-2.5 border-border/60 flex items-center gap-2.5">
                    <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center text-xl">{i.e}</div>
                    <div className="flex-1 min-w-0"><p className="text-xs font-semibold truncate">{i.n}</p><p className="text-[10px] text-muted-foreground">×{i.q}</p></div>
                    <span className="text-sm font-bold">ر.س {i.p}</span>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Card>
                ))}
              </div>
              <div className="p-3 bg-muted/40 border-t space-y-2">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span>ر.س 38.00</span></div>
                <div className="flex justify-between text-sm"><span className="text-success">Coupon WELCOME10</span><span className="text-success">-ر.س 3.80</span></div>
                <div className="flex justify-between font-bold text-lg border-t border-dashed pt-2"><span>Total</span><span className="text-primary">ر.س 39.36</span></div>
                <Button className="w-full h-12 gradient-primary text-primary-foreground border-0 shadow-glow">Pay now</Button>
              </div>
            </Screen>

            <Screen label="Receipt & thank you">
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-4">
                <div className="h-20 w-20 rounded-full bg-success/15 flex items-center justify-center"><CheckCircle2 className="h-10 w-10 text-success" /></div>
                <div>
                  <h2 className="text-2xl font-bold">Thank you!</h2>
                  <p className="text-muted-foreground mt-1" dir="rtl">شكراً لتسوقك معنا</p>
                </div>
                <div className="w-full rounded-2xl border border-border/60 p-4">
                  <div className="aspect-square w-32 mx-auto bg-foreground/95 rounded-xl flex items-center justify-center">
                    <QrCode className="h-20 w-20 text-background" />
                  </div>
                  <p className="text-xs text-center text-muted-foreground mt-2 font-mono">INV-20260602-0142</p>
                  <p className="text-center text-xs font-semibold mt-1">ر.س 39.36 · ZATCA verified</p>
                </div>
                <div className="flex gap-2 w-full">
                  <Button variant="outline" className="flex-1">Email</Button>
                  <Button variant="outline" className="flex-1">SMS</Button>
                  <Button variant="outline" className="flex-1">Print</Button>
                </div>
              </div>
            </Screen>
          </div>
        </TabsContent>

        <TabsContent value="items" className="mt-0 space-y-4">
          <FilterBar placeholder="Search items by name, SKU, barcode…" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Items on Device" value="2,148" icon={Package} accent="primary" />
            <MetricCard label="Low Stock" value="14" icon={AlertTriangle} accent="warning" />
            <MetricCard label="Close to Expiry" value="8" icon={CalendarClock} accent="warning" />
            <MetricCard label="Out of Stock" value="3" icon={Package} accent="destructive" />
          </div>
          <DataTable
            columns={[
              { key: "sku", label: "SKU", render: r => <span className="font-mono text-xs">{r.sku}</span> },
              { key: "name", label: "Item", render: r => <span className="font-semibold">{r.name}</span> },
              { key: "cat", label: "Category" },
              { key: "qty", label: "Stock", render: r => <span className="font-semibold tabular-nums">{r.qty}</span> },
              { key: "price", label: "Price" },
              { key: "expiry", label: "Expiry" },
              { key: "status", label: "Status", render: r => <StatusBadge status={r.status} /> },
            ]}
            rows={[
              { sku: "MLK-001", name: "Almarai Laban 1L", cat: "Dairy", qty: 142, price: "ر.س 6.50", expiry: "12d", status: "in stock" },
              { sku: "MLK-002", name: "Nadec Milk 2L", cat: "Dairy", qty: 18, price: "ر.س 12.00", expiry: "5d", status: "low" },
              { sku: "CHK-001", name: "Sadia Chicken 1kg", cat: "Meat", qty: 24, price: "ر.س 28.00", expiry: "3d", status: "near expiry" },
              { sku: "SNK-001", name: "Lay's Classic 75g", cat: "Snacks", qty: 6, price: "ر.س 7.00", expiry: "60d", status: "low" },
              { sku: "BVG-001", name: "Pepsi 330ml ×6", cat: "Beverages", qty: 0, price: "ر.س 15.00", expiry: "90d", status: "out of stock" },
            ]}
          />
        </TabsContent>

        <TabsContent value="reports" className="mt-0 space-y-4">
          <FilterBar placeholder="Search reports by name…" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Sales (Today)" value="ر.س 4,820" icon={TrendingUp} accent="primary" delta="+14%" trend="up" />
            <MetricCard label="Orders" value="87" icon={ShoppingBag} />
            <MetricCard label="Avg Basket" value="ر.س 55.40" icon={Wallet} accent="success" />
            <MetricCard label="Returns" value="3" icon={Undo2} accent="warning" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5 border-border/60 shadow-card space-y-3">
              <h3 className="text-sm font-semibold">Top Items (Today)</h3>
              {[
                { n: "Almarai Laban 1L", u: 42, pct: 90 },
                { n: "Lay's Classic 75g", u: 28, pct: 60 },
                { n: "Pepsi 330ml", u: 22, pct: 48 },
                { n: "Sadia Chicken 1kg", u: 14, pct: 32 },
              ].map(p => (
                <div key={p.n}>
                  <div className="flex justify-between text-xs mb-1"><span>{p.n}</span><span className="font-semibold">{p.u} sold</span></div>
                  <Progress value={p.pct} className="h-1.5" />
                </div>
              ))}
            </Card>
            <Card className="p-5 border-border/60 shadow-card space-y-3">
              <h3 className="text-sm font-semibold">Payment Mix (Today)</h3>
              {[
                { m: "Cash", v: 62 }, { m: "Card", v: 26 }, { m: "Wallet", v: 12 },
              ].map(p => (
                <div key={p.m}>
                  <div className="flex justify-between text-xs mb-1"><span>{p.m}</span><span className="font-semibold">{p.v}%</span></div>
                  <Progress value={p.v} className="h-1.5" />
                </div>
              ))}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="dayend" className="mt-0 space-y-4">
          <Card className="p-6 border-primary/30 bg-primary/5 shadow-card">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                  <ClipboardCheck className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold">Day-End Closing Report</h3>
                  <p className="text-sm text-muted-foreground">Fahad Al-Qahtani · Olaya · Mobile-02 · Shift opened 08:00</p>
                </div>
              </div>
              <Button className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5">
                <ClipboardCheck className="h-4 w-4" /> Close shift & print
              </Button>
            </div>
          </Card>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Opening Cash" value="ر.س 500" icon={Wallet} />
            <MetricCard label="Expected Cash" value="ر.س 3,488" icon={Banknote} accent="primary" />
            <MetricCard label="Counted Cash" value="ر.س 3,480" icon={Banknote} accent="success" />
            <MetricCard label="Difference" value="-ر.س 8.00" icon={AlertTriangle} accent="warning" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5 border-border/60 shadow-card">
              <h3 className="text-sm font-semibold mb-3">Sales by tender</h3>
              <div className="space-y-2 text-sm">
                {[
                  { k: "Cash", v: "ر.س 2,988" },
                  { k: "Card (Mada)", v: "ر.س 1,212" },
                  { k: "Wallet (STC/Apple)", v: "ر.س 558" },
                  { k: "Bank Transfer", v: "ر.س 62" },
                ].map(r => (
                  <div key={r.k} className="flex justify-between py-2 border-b border-border/40 last:border-0">
                    <span className="text-muted-foreground">{r.k}</span>
                    <span className="font-semibold tabular-nums">{r.v}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-5 border-border/60 shadow-card">
              <h3 className="text-sm font-semibold mb-3">Shift summary</h3>
              <div className="space-y-2 text-sm">
                {[
                  { k: "Orders completed", v: "87" },
                  { k: "Items scanned", v: "342" },
                  { k: "Refunds issued", v: "3 · ر.س 64.00" },
                  { k: "Discounts given", v: "ر.س 142" },
                  { k: "Cash withdrawal", v: "ر.س 200" },
                  { k: "Held orders", v: "1" },
                ].map(r => (
                  <div key={r.k} className="flex justify-between py-2 border-b border-border/40 last:border-0">
                    <span className="text-muted-foreground">{r.k}</span>
                    <span className="font-semibold tabular-nums">{r.v}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="audit" className="mt-0 space-y-4">
          <FilterBar placeholder="Search by action, user…" />
          <Card className="p-0 border-border/60 shadow-card overflow-hidden">
            <ul className="divide-y divide-border/40">
              {[
                { t: "14:42", a: "Refund issued", d: "Sadia Chicken 1kg · ر.س 28.00", c: "warning" },
                { t: "14:32", a: "Sale completed", d: "INV-20260602-0142 · ر.س 60.95", c: "info" },
                { t: "14:18", a: "Discount applied", d: "10% manager override · INV-...0140", c: "warning" },
                { t: "13:42", a: "Shift opened", d: "Opening cash ر.س 500", c: "info" },
                { t: "13:38", a: "Item voided", d: "Lay's Classic 75g ×2", c: "warning" },
                { t: "12:50", a: "Card timeout", d: "Retry succeeded after 8s", c: "warning" },
              ].map((l, i) => (
                <li key={i} className="flex items-start gap-3 p-3.5 hover:bg-muted/30">
                  <span className={`h-2.5 w-2.5 rounded-full mt-1.5 shrink-0 ${l.c === "warning" ? "bg-warning" : "bg-primary"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold">{l.a}</p>
                      <span className="text-xs text-muted-foreground tabular-nums">{l.t}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{l.d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
