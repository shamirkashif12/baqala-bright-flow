import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useRef, useEffect } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Search, ScanBarcode, Pause, RotateCcw, Printer, MessageSquare, Plus, Minus, Trash2, CreditCard, Banknote, Wallet, Split, QrCode, Info, CheckCircle2, Loader2, ShoppingCart } from "lucide-react";

export const Route = createFileRoute("/_app/pos")({
  component: POS,
});

type Prod = { name: string; price: number; sku: string; cat: string; stock: number; days: number; permissible: boolean };

const products: Prod[] = [
  { name: "Almarai Laban 1L", price: 6.5, sku: "1234567", cat: "Dairy", stock: 240, days: 102, permissible: true },
  { name: "Nadec Milk 2L", price: 12, sku: "1234568", cat: "Dairy", stock: 18, days: 16, permissible: true },
  { name: "Al Rabie Mango 1L", price: 7.75, sku: "1234569", cat: "Beverages", stock: 64, days: 50, permissible: true },
  { name: "Lipton Tea 100 Bags", price: 18.5, sku: "1234570", cat: "Beverages", stock: 92, days: 240, permissible: true },
  { name: "Pepsi 330ml Can", price: 2.5, sku: "1234571", cat: "Beverages", stock: 412, days: 180, permissible: true },
  { name: "L'usine Croissant", price: 4, sku: "1234572", cat: "Bakery", stock: 64, days: 3, permissible: true },
  { name: "Arabic Bread Tamees", price: 3, sku: "1234573", cat: "Bakery", stock: 120, days: 1, permissible: true },
  { name: "Lay's Classic 75g", price: 3.5, sku: "1234574", cat: "Snacks", stock: 6, days: -8, permissible: false },
  { name: "KitKat Chunky", price: 4.5, sku: "1234575", cat: "Snacks", stock: 920, days: 280, permissible: true },
  { name: "Sadia Chicken 1kg", price: 28, sku: "1234576", cat: "Meat", stock: 14, days: 6, permissible: true },
  { name: "Tomato 1kg", price: 5.25, sku: "1234577", cat: "Produce", stock: 80, days: 4, permissible: true },
  { name: "Banana 1kg", price: 6, sku: "1234578", cat: "Produce", stock: 70, days: 5, permissible: true },
];

function ExpiryChip({ days, permissible }: { days: number; permissible: boolean }) {
  if (!permissible) return <Badge className="bg-destructive text-destructive-foreground border-0 text-[10px]">Blocked</Badge>;
  if (days < 0) return <Badge className="bg-destructive text-destructive-foreground border-0 text-[10px]">Expired</Badge>;
  if (days <= 7) return <Badge className="bg-warning text-warning-foreground border-0 text-[10px]">{days}d left</Badge>;
  return <Badge variant="outline" className="bg-success/10 text-success border-success/30 text-[10px]">Safe</Badge>;
}

type CartItem = { name: string; sku: string; qty: number; price: number };
const initialCart: CartItem[] = [];

function POS() {
  const [cart, setCart] = useState<CartItem[]>(initialCart);
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [flashSku, setFlashSku] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [holds, setHolds] = useState<{ id: string; items: CartItem[]; total: number; at: string }[]>([
    { id: "HOLD-014", items: [{ name: "Lipton Tea 100 Bags", sku: "1234570", qty: 1, price: 18.5 }, { name: "Pepsi 330ml Can", sku: "1234571", qty: 6, price: 2.5 }], total: 33.5, at: "09:42" },
    { id: "HOLD-015", items: [{ name: "Sadia Chicken 1kg", sku: "1234576", qty: 2, price: 28 }], total: 56, at: "10:08" },
  ]);
  const [orderOpen, setOrderOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);

  const subtotal = cart.reduce((s, i) => s + i.qty * i.price, 0);
  const discount = subtotal > 0 ? 5 : 0;
  const vat = Math.max(0, (subtotal - discount)) * 0.15;
  const total = subtotal - discount + vat;

  const updateQty = (sku: string, d: number) => setCart(c => c.map(i => i.sku === sku ? { ...i, qty: Math.max(1, i.qty + d) } : i));
  const remove = (sku: string) => setCart(c => c.filter(i => i.sku !== sku));
  const addToCart = (p: Prod) => {
    if (!p.permissible) return;
    setCart(c => {
      const ex = c.find(i => i.sku === p.sku);
      if (ex) return c.map(i => i.sku === p.sku ? { ...i, qty: i.qty + 1 } : i);
      return [...c, { name: p.name, sku: p.sku, qty: 1, price: p.price }];
    });
    setFlashSku(p.sku);
    setTimeout(() => setFlashSku(null), 600);
    setQuery("");
    setShowResults(false);
    searchRef.current?.focus();
  };
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products.filter(p => p.name.toLowerCase().includes(q) || p.sku.includes(q)).slice(0, 6);
  }, [query]);
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const exact = products.find(p => p.sku === query.trim());
      if (exact) { addToCart(exact); return; }
      if (matches[0]) addToCart(matches[0]);
    }
    if (e.key === "Escape") setShowResults(false);
  };
  // Keep focus on the search bar so a barcode scanner just types into it
  useEffect(() => { searchRef.current?.focus(); }, []);
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
        {/* Scan / Search column */}
        <div className="space-y-4">
          <Card className="p-4 border-border/60 shadow-card">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="h-5 w-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
                  onFocus={() => setShowResults(true)}
                  onBlur={() => setTimeout(() => setShowResults(false), 150)}
                  onKeyDown={onKey}
                  placeholder="Scan barcode or search product name / SKU…"
                  className="pl-10 h-14 text-base bg-background shadow-none border-border/70"
                  autoFocus
                />
              </div>
              <Button size="lg" className="h-14 gap-2 gradient-primary text-primary-foreground border-0 shadow-glow" onClick={() => searchRef.current?.focus()}>
                <ScanBarcode className="h-5 w-5" /> Scan
              </Button>
            </div>
            {showResults && matches.length > 0 && (
              <div className="mt-2 rounded-lg border border-border/70 bg-card overflow-hidden">
                {matches.map((p) => (
                  <button
                    key={p.sku}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); addToCart(p); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60 border-b last:border-0 border-border/40"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">SKU {p.sku} · {p.cat} · Stock {p.stock}</p>
                    </div>
                    <ExpiryChip days={p.days} permissible={p.permissible} />
                    <span className="font-bold text-primary tabular-nums w-20 text-right">ر.س {p.price.toFixed(2)}</span>
                  </button>
                ))}
              </div>
            )}
            {showResults && query && matches.length === 0 && (
              <p className="mt-2 text-sm text-muted-foreground px-1">No product matches "{query}"</p>
            )}
            <p className="text-[11px] text-muted-foreground mt-2 px-1">Tip: just scan — items drop straight into the order. Press Enter to add the first match.</p>
          </Card>

          {/* Scanned items list */}
          <Card className="border-border/60 shadow-card">
            <div className="flex items-center justify-between p-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Scanned Items</p>
                <Badge variant="outline" className="text-[10px]">{cart.reduce((s, i) => s + i.qty, 0)} units</Badge>
              </div>
              {cart.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => setCart([])}>Clear all</Button>
              )}
            </div>
            {cart.length === 0 ? (
              <div className="text-center py-14 px-6">
                <ScanBarcode className="h-10 w-10 mx-auto text-muted-foreground/50" />
                <p className="text-sm font-medium mt-3">Ready to scan</p>
                <p className="text-xs text-muted-foreground mt-1">Scan a barcode or type to search. Items will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {cart.map((item, idx) => (
                  <div
                    key={item.sku}
                    className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${flashSku === item.sku ? "bg-primary/10" : "hover:bg-muted/30"}`}
                  >
                    <span className="text-xs text-muted-foreground tabular-nums w-6 text-right">{idx + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-[11px] text-muted-foreground">SKU {item.sku} · ر.س {item.price.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-1 bg-muted rounded-lg">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQty(item.sku, -1)}><Minus className="h-3 w-3" /></Button>
                      <span className="w-6 text-center text-sm font-semibold tabular-nums">{item.qty}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQty(item.sku, 1)}><Plus className="h-3 w-3" /></Button>
                    </div>
                    <span className="text-sm font-semibold tabular-nums w-20 text-right">ر.س {(item.qty * item.price).toFixed(2)}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(item.sku)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Checkout summary panel */}
        <Card className="border-border/60 shadow-elegant flex flex-col lg:h-[calc(100vh-180px)] lg:sticky lg:top-20">
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
          <div className="flex-1 overflow-y-auto p-4 text-sm text-muted-foreground">
            {cart.length === 0 ? (
              <p className="text-center pt-6">Scan or search a product to start a sale.</p>
            ) : (
              <ul className="space-y-1">
                {cart.map(i => (
                  <li key={i.sku} className="flex justify-between"><span className="truncate pr-2">{i.qty} × {i.name}</span><span className="tabular-nums text-foreground">ر.س {(i.qty * i.price).toFixed(2)}</span></li>
                ))}
              </ul>
            )}
          </div>
          <div className="p-4 border-t border-border/60 space-y-2">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">ر.س {subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Discount</span><span className="tabular-nums text-success">- ر.س {discount.toFixed(2)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">VAT (15%)</span><span className="tabular-nums">ر.س {vat.toFixed(2)}</span></div>
            <div className="flex justify-between items-baseline pt-2 border-t border-dashed border-border">
              <span className="font-semibold">Total</span>
              <span className="text-2xl font-bold text-primary tabular-nums">ر.س {total.toFixed(2)}</span>
            </div>
            <Button className="w-full h-12 text-base gradient-primary text-primary-foreground border-0 shadow-glow mt-2" disabled={cart.length === 0} onClick={() => setPayOpen(true)}>
              Charge ر.س {total.toFixed(2)}
            </Button>
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={hold} disabled={cart.length === 0}><Pause className="h-3 w-3" />Hold</Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 relative" onClick={() => setHoldOpen(true)}>
                <RotateCcw className="h-3 w-3" />Held
                {holds.length > 0 && <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">{holds.length}</span>}
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => setInvOpen(true)} disabled={cart.length === 0}><Printer className="h-3 w-3" />Print</Button>
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
                <div key={i.sku} className="flex justify-between text-xs py-1"><span>{i.qty} × {i.name}</span><span className="tabular-nums">ر.س {(i.qty * i.price).toFixed(2)}</span></div>
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
      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} total={total} onDone={() => { setPayOpen(false); setInvOpen(true); setCart([]); }} />

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
                <div key={i.sku} className="flex justify-between"><span>{i.qty} × {i.name}</span><span>{(i.qty * i.price).toFixed(2)}</span></div>
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
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setStatus("idle"); }}>
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