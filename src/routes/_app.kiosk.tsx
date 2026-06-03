import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/kiosk")({
  beforeLoad: () => {
    throw redirect({ to: "/mobile-pos", search: { tab: "kiosk" } as any });
  },
});

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

function Kiosk() {
  return (
    <PageShell title="Self-Checkout Kiosk" subtitle="Full-screen · large touch targets · Arabic & English">
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {/* Welcome */}
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

        {/* Scan */}
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

        {/* Cart */}
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

        {/* Thank you */}
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
            <Button variant="ghost" size="sm" className="gap-2 text-xs"><Bell className="h-3.5 w-3.5" /> Need help? Call staff</Button>
          </div>
        </Screen>
      </div>
    </PageShell>
  );
}