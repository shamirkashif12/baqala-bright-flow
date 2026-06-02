import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScanLine, Search, Wifi, WifiOff, Plus, Banknote, CreditCard, Wallet, Building2, Bell, ChevronRight, ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/_app/mobile-pos")({ component: MobilePos });

function Phone({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-[280px] h-[580px] rounded-[2.5rem] border-[10px] border-foreground/90 bg-background shadow-elegant overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-foreground/90 rounded-b-2xl z-10" />
        <div className="h-full overflow-y-auto">{children}</div>
      </div>
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}

function MobilePos() {
  return (
    <PageShell title="Mobile POS" subtitle="iOS / Android · designed for touch · offline-ready">
      <div className="flex flex-wrap justify-center gap-8 py-4">
        {/* Home */}
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

        {/* Cart */}
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

        {/* Scan */}
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
    </PageShell>
  );
}