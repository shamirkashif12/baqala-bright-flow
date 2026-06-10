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
      </Tabs>
    </PageShell>
  );
}
