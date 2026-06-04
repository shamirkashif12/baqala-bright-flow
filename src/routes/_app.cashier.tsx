import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { LogIn, ScanBarcode, Pause, ShoppingBag, Undo2, LogOut, Clock, type LucideIcon } from "lucide-react";

export const Route = createFileRoute("/_app/cashier")({ component: CashierWorkspace });

const tiles: { icon: LucideIcon; title: string; desc: string; href: string; accent: string }[] = [
  { icon: LogIn, title: "Check In", desc: "Open shift and start selling", href: "/cashier-shift", accent: "bg-primary/10 text-primary" },
  { icon: ScanBarcode, title: "POS Checkout", desc: "Scan and charge customers", href: "/pos", accent: "bg-primary text-primary-foreground" },
  { icon: Pause, title: "Held Orders", desc: "Reopen orders on hold", href: "/pos", accent: "bg-warning/20 text-warning-foreground" },
  { icon: ShoppingBag, title: "My Orders", desc: "Today's orders you processed", href: "/orders", accent: "bg-success/15 text-success" },
  { icon: Undo2, title: "Refund Request", desc: "Send refund to manager", href: "/refunds", accent: "bg-destructive/10 text-destructive" },
  { icon: LogOut, title: "Check Out", desc: "Close shift and settle cash", href: "/cashier-shift", accent: "bg-muted text-foreground" },
];

function CashierWorkspace() {
  const { user } = useAuth();
  return (
    <PageShell title="Cashier Workspace" subtitle="Focused tools for the active shift">
      <Card className="p-6 border-border/60 shadow-card gradient-primary text-primary-foreground">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Badge className="bg-white/15 text-primary-foreground border-white/20 backdrop-blur"><Clock className="h-3 w-3 mr-1" />Shift active · since 07:55</Badge>
            <h2 className="text-2xl font-bold mt-2">السلام عليكم, {user?.name?.split(" ")[0] ?? "Cashier"}</h2>
            <p className="text-primary-foreground/80 text-sm mt-1">Terminal TML-RYD-001 · {user?.branch ?? "Olaya Branch"}</p>
          </div>
          <div className="flex gap-2">
            <div className="rounded-xl bg-white/15 backdrop-blur border border-white/20 px-4 py-2">
              <p className="text-[10px] uppercase opacity-80">Orders</p>
              <p className="text-xl font-bold">142</p>
            </div>
            <div className="rounded-xl bg-white/15 backdrop-blur border border-white/20 px-4 py-2">
              <p className="text-[10px] uppercase opacity-80">Cash in Drawer</p>
              <p className="text-xl font-bold">ر.س 5,320</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.title} to={t.href} className="block">
            <Card className="p-5 border-border/60 shadow-card hover:shadow-elegant hover:-translate-y-0.5 transition-all h-full">
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${t.accent}`}>
                <t.icon className="h-6 w-6" />
              </div>
              <p className="font-semibold mt-3">{t.title}</p>
              <p className="text-sm text-muted-foreground">{t.desc}</p>
              <Button variant="ghost" size="sm" className="mt-2 -ml-3 text-primary">Open →</Button>
            </Card>
          </Link>
        ))}
      </div>
    </PageShell>
  );
}