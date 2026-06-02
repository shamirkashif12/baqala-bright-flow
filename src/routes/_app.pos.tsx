import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, ScanBarcode, Pause, RotateCcw, Printer, MessageSquare, Plus, Minus, Trash2, CreditCard, Banknote, Wallet, Split, QrCode } from "lucide-react";

export const Route = createFileRoute("/_app/pos")({
  component: POS,
});

const categories = ["All", "Dairy", "Bakery", "Beverages", "Snacks", "Produce", "Meat", "Household", "Tobacco"];
const products = [
  { name: "Almarai Laban 1L", price: 6.5, sku: "1234567", cat: "Dairy", emoji: "🥛" },
  { name: "Nadec Milk 2L", price: 12, sku: "1234568", cat: "Dairy", emoji: "🥛" },
  { name: "Al Rabie Mango 1L", price: 7.75, sku: "1234569", cat: "Beverages", emoji: "🧃" },
  { name: "Lipton Tea 100 Bags", price: 18.5, sku: "1234570", cat: "Beverages", emoji: "🫖" },
  { name: "Pepsi 330ml Can", price: 2.5, sku: "1234571", cat: "Beverages", emoji: "🥤" },
  { name: "L'usine Croissant", price: 4, sku: "1234572", cat: "Bakery", emoji: "🥐" },
  { name: "Arabic Bread Tamees", price: 3, sku: "1234573", cat: "Bakery", emoji: "🫓" },
  { name: "Lay's Classic 75g", price: 3.5, sku: "1234574", cat: "Snacks", emoji: "🍟" },
  { name: "KitKat Chunky", price: 4.5, sku: "1234575", cat: "Snacks", emoji: "🍫" },
  { name: "Sadia Chicken 1kg", price: 28, sku: "1234576", cat: "Meat", emoji: "🍗" },
  { name: "Tomato 1kg", price: 5.25, sku: "1234577", cat: "Produce", emoji: "🍅" },
  { name: "Banana 1kg", price: 6, sku: "1234578", cat: "Produce", emoji: "🍌" },
];

const cart = [
  { name: "Almarai Laban 1L", qty: 2, price: 6.5 },
  { name: "Nadec Milk 2L", qty: 1, price: 12 },
  { name: "Sadia Chicken 1kg", qty: 1, price: 28 },
  { name: "Tomato 1kg", qty: 2, price: 5.25 },
];

function POS() {
  const subtotal = cart.reduce((s, i) => s + i.qty * i.price, 0);
  const discount = 5;
  const vat = (subtotal - discount) * 0.15;
  const total = subtotal - discount + vat;
  return (
    <PageShell title="POS Checkout" subtitle="Terminal POS-01 · Cashier: Fahad · Shift open">
      <div className="grid lg:grid-cols-[1fr_420px] gap-4 -mt-2">
        {/* Catalog */}
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search product or scan barcode…" className="pl-9 h-12 text-base bg-card shadow-card" />
            </div>
            <Button size="lg" className="h-12 gap-2 gradient-primary text-primary-foreground border-0 shadow-glow">
              <ScanBarcode className="h-5 w-5" /> Scan
            </Button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((c, i) => (
              <Button key={c} variant={i === 0 ? "default" : "outline"} size="sm" className={`shrink-0 ${i === 0 ? "gradient-primary text-primary-foreground border-0" : ""}`}>{c}</Button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {products.map((p) => (
              <Card key={p.sku} className="p-4 border-border/60 cursor-pointer hover:border-primary/60 hover:shadow-elegant hover:-translate-y-0.5 transition-all">
                <div className="aspect-square rounded-xl bg-gradient-to-br from-accent to-muted flex items-center justify-center text-5xl mb-3">{p.emoji}</div>
                <p className="text-sm font-semibold leading-tight line-clamp-2 min-h-[2.5rem]">{p.name}</p>
                <div className="flex justify-between items-center mt-2">
                  <Badge variant="outline" className="text-[10px]">{p.cat}</Badge>
                  <span className="font-bold text-primary">ر.س {p.price.toFixed(2)}</span>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Cart panel */}
        <Card className="border-border/60 shadow-elegant flex flex-col h-[calc(100vh-180px)] sticky top-20">
          <div className="p-4 border-b border-border/60 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Order #INV-20260602-0142</h3>
              <p className="text-xs text-muted-foreground">4 items · Walk-in customer</p>
            </div>
            <Badge className="gradient-primary text-primary-foreground border-0">Live</Badge>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {cart.map((item) => (
              <div key={item.name} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/40">
                <div className="h-12 w-12 rounded-lg bg-accent flex items-center justify-center text-2xl shrink-0">🛒</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">ر.س {item.price.toFixed(2)} each</p>
                </div>
                <div className="flex items-center gap-1 bg-muted rounded-lg">
                  <Button variant="ghost" size="icon" className="h-7 w-7"><Minus className="h-3 w-3" /></Button>
                  <span className="w-6 text-center text-sm font-semibold">{item.qty}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7"><Plus className="h-3 w-3" /></Button>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
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
              <Button variant="outline" size="sm" className="flex-col h-14 gap-1 text-xs"><Banknote className="h-4 w-4" />Cash</Button>
              <Button variant="outline" size="sm" className="flex-col h-14 gap-1 text-xs"><CreditCard className="h-4 w-4" />Card</Button>
              <Button variant="outline" size="sm" className="flex-col h-14 gap-1 text-xs"><Wallet className="h-4 w-4" />Wallet</Button>
              <Button variant="outline" size="sm" className="flex-col h-14 gap-1 text-xs"><Split className="h-4 w-4" />Split</Button>
            </div>
            <Button className="w-full h-12 text-base gradient-primary text-primary-foreground border-0 shadow-glow">
              Charge ر.س {total.toFixed(2)}
            </Button>
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1"><Pause className="h-3 w-3" />Hold</Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1"><RotateCcw className="h-3 w-3" />Refund</Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1"><Printer className="h-3 w-3" />Print</Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1"><MessageSquare className="h-3 w-3" />Send</Button>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-success/10 text-success text-xs">
              <QrCode className="h-4 w-4" /> ZATCA QR will be embedded on receipt
            </div>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}