import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, ScanBarcode, Pause, RotateCcw, Printer, MessageSquare, Plus, Minus, Trash2, CreditCard, Banknote, Wallet, Split, QrCode, LayoutGrid, List, Info, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/pos")({
  component: POS,
});

const categories = ["All", "Dairy", "Bakery", "Beverages", "Snacks", "Produce", "Meat", "Household", "Tobacco"];

type Prod = { name: string; price: number; sku: string; cat: string; emoji: string; stock: number; days: number; permissible: boolean };

const products: Prod[] = [
  { name: "Almarai Laban 1L", price: 6.5, sku: "1234567", cat: "Dairy", emoji: "🥛", stock: 240, days: 102, permissible: true },
  { name: "Nadec Milk 2L", price: 12, sku: "1234568", cat: "Dairy", emoji: "🥛", stock: 18, days: 16, permissible: true },
  { name: "Al Rabie Mango 1L", price: 7.75, sku: "1234569", cat: "Beverages", emoji: "🧃", stock: 64, days: 50, permissible: true },
  { name: "Lipton Tea 100 Bags", price: 18.5, sku: "1234570", cat: "Beverages", emoji: "🫖", stock: 92, days: 240, permissible: true },
  { name: "Pepsi 330ml Can", price: 2.5, sku: "1234571", cat: "Beverages", emoji: "🥤", stock: 412, days: 180, permissible: true },
  { name: "L'usine Croissant", price: 4, sku: "1234572", cat: "Bakery", emoji: "🥐", stock: 64, days: 3, permissible: true },
  { name: "Arabic Bread Tamees", price: 3, sku: "1234573", cat: "Bakery", emoji: "🫓", stock: 120, days: 1, permissible: true },
  { name: "Lay's Classic 75g", price: 3.5, sku: "1234574", cat: "Snacks", emoji: "🍟", stock: 6, days: -8, permissible: false },
  { name: "KitKat Chunky", price: 4.5, sku: "1234575", cat: "Snacks", emoji: "🍫", stock: 920, days: 280, permissible: true },
  { name: "Sadia Chicken 1kg", price: 28, sku: "1234576", cat: "Meat", emoji: "🍗", stock: 14, days: 6, permissible: true },
  { name: "Tomato 1kg", price: 5.25, sku: "1234577", cat: "Produce", emoji: "🍅", stock: 80, days: 4, permissible: true },
  { name: "Banana 1kg", price: 6, sku: "1234578", cat: "Produce", emoji: "🍌", stock: 70, days: 5, permissible: true },
];

function ExpiryChip({ days, permissible }: { days: number; permissible: boolean }) {
  if (!permissible) return <Badge className="bg-destructive text-destructive-foreground border-0 text-[10px]">Blocked</Badge>;
  if (days < 0) return <Badge className="bg-destructive text-destructive-foreground border-0 text-[10px]">Expired</Badge>;
  if (days <= 7) return <Badge className="bg-warning text-warning-foreground border-0 text-[10px]">{days}d left</Badge>;
  return <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-[10px]">Safe</Badge>;
}

const initialCart = [
  { name: "Almarai Laban 1L", qty: 2, price: 6.5 },
  { name: "Nadec Milk 2L", qty: 1, price: 12 },
  { name: "Sadia Chicken 1kg", qty: 1, price: 28 },
  { name: "Tomato 1kg", qty: 2, price: 5.25 },
];

function POS() {
  const [cart, setCart] = useState(initialCart);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [holds, setHolds] = useState<{ id: string; items: typeof initialCart; total: number; at: string }[]>([
    { id: "HOLD-014", items: [{ name: "Lipton Tea 100 Bags", qty: 1, price: 18.5 }, { name: "Pepsi 330ml Can", qty: 6, price: 2.5 }], total: 33.5, at: "09:42" },
    { id: "HOLD-015", items: [{ name: "Sadia Chicken 1kg", qty: 2, price: 28 }], total: 56, at: "10:08" },
  ]);
  const [orderOpen, setOrderOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);

  const subtotal = cart.reduce((s, i) => s + i.qty * i.price, 0);
  const discount = 5;
  const vat = (subtotal - discount) * 0.15;
  const total = subtotal - discount + vat;

  const updateQty = (name: string, d: number) => setCart(c => c.map(i => i.name === name ? { ...i, qty: Math.max(1, i.qty + d) } : i));
  const remove = (name: string) => setCart(c => c.filter(i => i.name !== name));
  const hold = () => {
    if (!cart.length) return;
    setHolds(h => [{ id: `HOLD-${String(16 + h.length).padStart(3, "0")}`, items: cart, total, at: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) }, ...h]);
    setCart([]);
  };
  const reopen = (id: string) => {
    const h = holds.find(x => x.id === id);
    if (!h) return;
    setCart(h.items);
    setHolds(hs => hs.filter(x => x.id !== id));
    setHoldOpen(false);
  };

  return (
    <PageShell title="POS Checkout" subtitle="Terminal POS-01 · Cashier: Fahad · Shift open">
      <div className="grid lg:grid-cols-[1fr_420px] gap-4 -mt-2">
        {/* Catalog */}
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search product, SKU or scan barcode…" className="pl-9 h-12 text-base bg-card shadow-card" />
            </div>
            <Button size="lg" className="h-12 gap-2 gradient-primary text-primary-foreground border-0 shadow-glow">
              <ScanBarcode className="h-5 w-5" /> Scan
            </Button>
            <div className="flex items-center bg-card rounded-lg border border-border h-12 px-1">
              <Button variant={view === "grid" ? "default" : "ghost"} size="sm" className={view === "grid" ? "gradient-primary text-primary-foreground border-0 h-10" : "h-10"} onClick={() => setView("grid")}>
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button variant={view === "list" ? "default" : "ghost"} size="sm" className={view === "list" ? "gradient-primary text-primary-foreground border-0 h-10" : "h-10"} onClick={() => setView("list")}>
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((c, i) => (
              <Button key={c} variant={i === 0 ? "default" : "outline"} size="sm" className={`shrink-0 ${i === 0 ? "gradient-primary text-primary-foreground border-0" : ""}`}>{c}</Button>
            ))}
          </div>
          {view === "grid" ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {products.map((p) => (
                <Card key={p.sku} className={cn(
                  "p-3 border-border/60 cursor-pointer hover:border-primary/60 hover:shadow-elegant hover:-translate-y-0.5 transition-all relative",
                  !p.permissible && "opacity-60",
                )}>
                  <div className="absolute top-2 right-2"><ExpiryChip days={p.days} permissible={p.permissible} /></div>
                  <div className="aspect-square rounded-xl bg-gradient-to-br from-accent to-muted flex items-center justify-center text-5xl mb-3">{p.emoji}</div>
                  <p className="text-sm font-semibold leading-tight line-clamp-2 min-h-[2.5rem]">{p.name}</p>
                  <p className="text-[10px] text-muted-foreground">Stock {p.stock}</p>
                  <div className="flex justify-between items-center mt-2">
                    <Badge variant="outline" className="text-[10px]">{p.cat}</Badge>
                    <span className="font-bold text-primary">ر.س {p.price.toFixed(2)}</span>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-border/60 shadow-card overflow-hidden">
              {products.map((p) => (
                <div key={p.sku} className={cn("flex items-center gap-3 p-3 border-b last:border-0 hover:bg-muted/40 cursor-pointer", !p.permissible && "opacity-60")}>
                  <div className="h-10 w-10 rounded-lg bg-accent flex items-center justify-center text-xl">{p.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.sku} · {p.cat} · Stock {p.stock}</p>
                  </div>
                  <ExpiryChip days={p.days} permissible={p.permissible} />
                  <span className="font-bold text-primary tabular-nums w-20 text-right">ر.س {p.price.toFixed(2)}</span>
                </div>
              ))}
            </Card>
          )}
        </div>

        {/* Cart panel */}
        <Card className="border-border/60 shadow-elegant flex flex-col h-[calc(100vh-180px)] sticky top-20">
          <div className="p-4 border-b border-border/60 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Order #INV-20260602-0142</h3>
              <p className="text-xs text-muted-foreground">{cart.length} items · Walk-in · TML-RYD-001 · Fahad</p>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOrderOpen(true)} title="Order details"><Info className="h-3.5 w-3.5" /></Button>
              <Badge className="gradient-primary text-primary-foreground border-0">Live</Badge>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {cart.length === 0 && (
              <div className="text-center py-10 text-sm text-muted-foreground">Cart is empty. Scan a product to start.</div>
            )}
            {cart.map((item) => (
              <div key={item.name} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/40">
                <div className="h-12 w-12 rounded-lg bg-accent flex items-center justify-center text-2xl shrink-0">🛒</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">ر.س {item.price.toFixed(2)} each</p>
                </div>
                <div className="flex items-center gap-1 bg-muted rounded-lg">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQty(item.name, -1)}><Minus className="h-3 w-3" /></Button>
                  <span className="w-6 text-center text-sm font-semibold">{item.qty}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQty(item.name, 1)}><Plus className="h-3 w-3" /></Button>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(item.name)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-border/60 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">ر.س {subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Discount</span><span className="tabular-nums text-success">- ر.س {discount.toFixed(2)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">VAT (15%)</span><span className="tabular-nums">ر.س {vat.toFixed(2)}</span></div>
            <div className="flex justify-between items-baseline pt-2 border-t border-dashed border-border">
              <span className="font-semibold">Total</span>
              <span className="text-2xl font-bold text-primary tabular-nums">ر.س {total.toFixed(2)}</span>
            </div>
            <div className="grid grid-cols-4 gap-2 pt-2">
              <Button variant="outline" size="sm" className="flex-col h-14 gap-1 text-xs" onClick={() => setPayOpen(true)}><Banknote className="h-4 w-4" />Cash</Button>
              <Button variant="outline" size="sm" className="flex-col h-14 gap-1 text-xs" onClick={() => setPayOpen(true)}><CreditCard className="h-4 w-4" />Card</Button>
              <Button variant="outline" size="sm" className="flex-col h-14 gap-1 text-xs" onClick={() => setPayOpen(true)}><Wallet className="h-4 w-4" />Wallet</Button>
              <Button variant="outline" size="sm" className="flex-col h-14 gap-1 text-xs" onClick={() => setPayOpen(true)}><Split className="h-4 w-4" />Split</Button>
            </div>
            <Button className="w-full h-12 text-base gradient-primary text-primary-foreground border-0 shadow-glow" onClick={() => setPayOpen(true)}>
              Charge ر.س {total.toFixed(2)}
            </Button>
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={hold}><Pause className="h-3 w-3" />Hold</Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 relative" onClick={() => setHoldOpen(true)}>
                <RotateCcw className="h-3 w-3" />Held
                {holds.length > 0 && <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">{holds.length}</span>}
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => setInvOpen(true)}><Printer className="h-3 w-3" />Print</Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1"><MessageSquare className="h-3 w-3" />Send</Button>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-success/10 text-success text-xs">
              <QrCode className="h-4 w-4" /> ZATCA QR will be embedded on receipt
            </div>
          </div>
        </Card>
      </div>

      {/* Order details dialog */}
      <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Order #INV-20260602-0142</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <Row k="Customer" v="Walk-in" />
            <Row k="Cashier" v="Fahad Al-Qahtani" />
            <Row k="Terminal" v="TML-RYD-001" />
            <Row k="Branch" v="Olaya — Riyadh HQ" />
            <Row k="Payment Method" v="Pending" />
            <Row k="Order Status" v="In progress" />
            <Row k="Created" v="2026-06-02 10:14" />
            <Row k="Invoice #" v="INV-20260602-0142" />
            <div className="pt-2 border-t">
              {cart.map(i => (
                <div key={i.name} className="flex justify-between text-xs py-1"><span>{i.qty} × {i.name}</span><span className="tabular-nums">ر.س {(i.qty * i.price).toFixed(2)}</span></div>
              ))}
            </div>
          </div>
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setInvOpen(true)}>Print Invoice</Button>
            <Button variant="outline" size="sm">Apply Discount</Button>
            <Button variant="outline" size="sm">Apply Coupon</Button>
            <Button variant="outline" size="sm" onClick={hold}>Hold</Button>
            <Button className="gradient-primary text-primary-foreground border-0" onClick={() => { setOrderOpen(false); setPayOpen(true); }}>Complete Order</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} total={total} onDone={() => { setPayOpen(false); setInvOpen(true); }} />

      {/* Held orders dialog */}
      <Dialog open={holdOpen} onOpenChange={setHoldOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Held Orders ({holds.length})</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {holds.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No held orders</p>}
            {holds.map(h => (
              <div key={h.id} className="p-3 rounded-xl border border-border/60 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{h.id}</p>
                  <p className="text-xs text-muted-foreground truncate">{h.items.length} items · held at {h.at}</p>
                </div>
                <p className="text-sm font-bold tabular-nums">ر.س {h.total.toFixed(2)}</p>
                <div className="flex gap-1">
                  <Button size="sm" className="gradient-primary text-primary-foreground border-0" onClick={() => reopen(h.id)}>Reopen</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setHolds(hs => hs.filter(x => x.id !== h.id))}>Cancel</Button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCart([]); setHoldOpen(false); }}>New Order</Button>
            <Button variant="outline" onClick={() => setHoldOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice preview */}
      <Dialog open={invOpen} onOpenChange={setInvOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invoice Preview</DialogTitle></DialogHeader>
          <div className="rounded-xl bg-muted/40 p-5 font-mono text-xs space-y-2">
            <div className="text-center">
              <p className="font-bold text-sm">MI Money — Olaya Branch</p>
              <p>VAT 300123456700003</p>
              <p>INV-20260602-0142 · 2026-06-02 10:14</p>
            </div>
            <div className="border-t border-dashed border-border pt-2">
              {cart.map(i => (
                <div key={i.name} className="flex justify-between"><span>{i.qty} × {i.name}</span><span>{(i.qty * i.price).toFixed(2)}</span></div>
              ))}
            </div>
            <div className="border-t border-dashed border-border pt-2 space-y-0.5">
              <div className="flex justify-between"><span>Subtotal</span><span>{subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>VAT 15%</span><span>{vat.toFixed(2)}</span></div>
              <div className="flex justify-between font-bold"><span>Total</span><span>SAR {total.toFixed(2)}</span></div>
            </div>
            <div className="text-center pt-2">
              <div className="inline-block bg-foreground/10 p-3 rounded"><QrCode className="h-12 w-12" /></div>
              <p className="mt-1">ZATCA Phase 2 QR</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvOpen(false)}>Close</Button>
            <Button className="gradient-primary text-primary-foreground border-0"><Printer className="h-4 w-4 mr-1" />Print</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>;
}

function PaymentDialog({ open, onOpenChange, total, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; total: number; onDone: () => void }) {
  const [tab, setTab] = useState("cash");
  const [received, setReceived] = useState(total.toFixed(2));
  const [status, setStatus] = useState<"idle" | "waiting" | "success" | "failed">("idle");
  const change = Math.max(0, parseFloat(received || "0") - total);

  const charge = () => {
    setStatus("waiting");
    setTimeout(() => { setStatus("success"); setTimeout(onDone, 700); }, 1200);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setStatus("idle"); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Take Payment — ر.س {total.toFixed(2)}</DialogTitle></DialogHeader>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="cash"><Banknote className="h-3.5 w-3.5 mr-1" />Cash</TabsTrigger>
            <TabsTrigger value="card"><CreditCard className="h-3.5 w-3.5 mr-1" />Card</TabsTrigger>
            <TabsTrigger value="wallet"><Wallet className="h-3.5 w-3.5 mr-1" />Wallet</TabsTrigger>
            <TabsTrigger value="split"><Split className="h-3.5 w-3.5 mr-1" />Split</TabsTrigger>
          </TabsList>
          <TabsContent value="cash" className="space-y-3 mt-4">
            <div className="space-y-1"><Label className="text-xs">Amount Received</Label><Input className="h-11 text-lg font-bold" value={received} onChange={(e) => setReceived(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-2">
              {[50, 100, 200, 500].map(d => <Button key={d} variant="outline" onClick={() => setReceived(String(d))}>ر.س {d}</Button>)}
            </div>
            <div className="rounded-lg bg-muted/40 p-3 flex justify-between">
              <span className="text-sm text-muted-foreground">Change</span>
              <span className="font-bold text-lg text-success tabular-nums">ر.س {change.toFixed(2)}</span>
            </div>
          </TabsContent>
          <TabsContent value="card" className="space-y-3 mt-4">
            <CardMachineStatus status={status} />
            <div className="rounded-lg bg-muted/40 p-3 text-sm">Card machine: <strong>Geidea GD-4892-RYD</strong></div>
          </TabsContent>
          <TabsContent value="wallet" className="space-y-3 mt-4">
            <CardMachineStatus status={status} />
            <div className="grid grid-cols-3 gap-2">
              {["STC Pay", "Apple Pay", "mada Pay"].map(w => <Button key={w} variant="outline" size="sm">{w}</Button>)}
            </div>
          </TabsContent>
          <TabsContent value="split" className="space-y-2 mt-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><Label className="text-[10px]">Cash</Label><Input className="h-9" defaultValue="20.00" /></div>
              <div className="space-y-1"><Label className="text-[10px]">Card</Label><Input className="h-9" defaultValue="40.00" /></div>
              <div className="space-y-1"><Label className="text-[10px]">Wallet</Label><Input className="h-9" defaultValue={(total - 60).toFixed(2)} /></div>
            </div>
            <p className="text-xs text-muted-foreground">Sum must equal ر.س {total.toFixed(2)}</p>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="gradient-primary text-primary-foreground border-0" disabled={status === "waiting"} onClick={charge}>
            {status === "waiting" ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Processing…</> : "Confirm Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CardMachineStatus({ status }: { status: "idle" | "waiting" | "success" | "failed" }) {
  const map = {
    idle: { c: "bg-success/15 text-success", l: "Connected · Ready" },
    waiting: { c: "bg-warning/20 text-warning-foreground", l: "Waiting for payment…" },
    success: { c: "bg-success/15 text-success", l: "Payment Approved" },
    failed: { c: "bg-destructive/15 text-destructive", l: "Payment Failed" },
  }[status];
  return (
    <div className={`rounded-xl p-4 flex items-center gap-3 ${map.c}`}>
      {status === "success" ? <CheckCircle2 className="h-5 w-5" /> : status === "waiting" ? <Loader2 className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" />}
      <span className="font-semibold">{map.l}</span>
    </div>
  );
}