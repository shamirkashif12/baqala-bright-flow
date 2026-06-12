import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { MetricCard } from "@/components/metric-card";
import { Clock, Wallet, Banknote, CreditCard, Smartphone, LogIn, LogOut, Timer } from "lucide-react";

export const Route = createFileRoute("/_app/cashier-shift")({ component: Shift });

function Shift() {
  const [checkedIn, setCheckedIn] = useState(true);
  const [opening, setOpening] = useState("500.00");
  const [closing, setClosing] = useState("");
  const [startTime] = useState("07:55");
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!checkedIn) return;
    const start = new Date(); start.setHours(7, 55, 0, 0);
    const tick = () => setSeconds(Math.floor((Date.now() - start.getTime()) / 1000));
    tick(); const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [checkedIn]);

  const hh = String(Math.floor(seconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const cash = 4820, card = 2840, wallet = 760, expected = +opening + cash;
  const variance = closing ? (+closing - expected) : 0;

  return (
    <PageShell title="Cashier Shift" subtitle="Your active shift · cash drawer · sales summary">
      {/* Live timer banner */}
      <Card className={`p-5 border-2 ${checkedIn ? "border-success/40 bg-success/5" : "border-muted bg-muted/30"}`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className={`h-14 w-14 rounded-2xl flex items-center justify-center ${checkedIn ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}><Timer className="h-7 w-7" /></div>
            <div>
              <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">{checkedIn ? "Active Shift" : "Not Checked In"}</p>
              <p className="text-3xl md:text-4xl font-bold tabular-nums tracking-tight">{checkedIn ? `${hh}:${mm}:${ss}` : "--:--:--"}</p>
              {checkedIn && <p className="text-xs text-muted-foreground">Fahad Al-Qahtani · TML-RYD-001 · since {startTime}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            {!checkedIn ? (
              <CheckInDialog onCheckIn={(amt) => { setOpening(amt); setCheckedIn(true); }} />
            ) : (
              <CheckOutDialog opening={opening} expected={expected} cash={cash} card={card} wallet={wallet} closing={closing} setClosing={setClosing} onCheckOut={() => setCheckedIn(false)} />
            )}
          </div>
        </div>
      </Card>

      {/* Cashier-only metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Opening Cash" value={`ر.س ${opening}`} icon={Banknote} accent="primary" />
        <MetricCard label="Cash Sales" value={`ر.س ${cash.toFixed(2)}`} icon={Banknote} accent="success" />
        <MetricCard label="Card Sales" value={`ر.س ${card.toFixed(2)}`} icon={CreditCard} />
        <MetricCard label="Wallet / Digital" value={`ر.س ${wallet.toFixed(2)}`} icon={Smartphone} />
      </div>

      {/* Shift summary */}
      <Card className="p-5 border-border/60 shadow-card">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Clock className="h-4 w-4 text-primary" />Shift Summary</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <SummaryRow label="Shift start" value={startTime} />
          <SummaryRow label="Shift end" value={checkedIn ? "—" : "15:30"} />
          <SummaryRow label="Duration" value={`${hh}h ${mm}m`} />
          <SummaryRow label="Total transactions" value="142" />
          <SummaryRow label="Opening amount" value={`ر.س ${opening}`} />
          <SummaryRow label="Closing amount" value={closing ? `ر.س ${closing}` : "—"} />
          <SummaryRow label="Expected closing" value={`ر.س ${expected.toFixed(2)}`} />
          <SummaryRow label="Cash variance" value={variance === 0 ? "ر.س 0.00" : `${variance > 0 ? "+" : ""}ر.س ${variance.toFixed(2)}`} tone={variance === 0 ? "default" : variance < 0 ? "destructive" : "success"} />
        </div>
      </Card>

      <Card className="p-4 border-dashed border-border/60 text-xs text-muted-foreground">
        Cashiers only see their own shift data. Staff attendance is now in a separate module under Admin → Staff & Roles.
      </Card>
    </PageShell>
  );
}

function SummaryRow({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "success" | "destructive" }) {
  const toneCls = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "";
  return (
    <div className="rounded-xl border border-border/60 p-3 bg-card">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold mt-1 tabular-nums ${toneCls}`}>{value}</p>
    </div>
  );
}

function CheckInDialog({ onCheckIn }: { onCheckIn: (amt: string) => void }) {
  const [open, setOpen] = useState(false);
  const [amt, setAmt] = useState("500.00");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow h-11 px-6"><LogIn className="h-4 w-4" />Check In</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Cashier Check-In</DialogTitle></DialogHeader>
        <div className="space-y-1"><Label className="text-xs">Opening amount (SAR)</Label><Input type="number" step="0.01" value={amt} onChange={e => setAmt(e.target.value)} className="h-10 text-lg" autoFocus /></div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground border-0" onClick={() => { onCheckIn(amt); setOpen(false); }}>Start shift</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CheckOutDialog({ opening, expected, cash, card, wallet, closing, setClosing, onCheckOut }: { opening: string; expected: number; cash: number; card: number; wallet: number; closing: string; setClosing: (v: string) => void; onCheckOut: () => void }) {
  const [open, setOpen] = useState(false);
  const variance = closing ? (+closing - expected) : 0;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline" className="gap-1.5 h-11 px-6"><LogOut className="h-4 w-4" />Check Out</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Cashier Check-Out</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Info label="Opening" value={`ر.س ${opening}`} />
            <Info label="Cash sales" value={`ر.س ${cash.toFixed(2)}`} />
            <Info label="Card sales" value={`ر.س ${card.toFixed(2)}`} />
            <Info label="Wallet" value={`ر.س ${wallet.toFixed(2)}`} />
            <Info label="Expected cash" value={`ر.س ${expected.toFixed(2)}`} tone="primary" />
            <Info label="Variance" value={variance === 0 ? "ر.س 0.00" : `${variance > 0 ? "+" : ""}ر.س ${variance.toFixed(2)}`} tone={variance < 0 ? "destructive" : variance > 0 ? "success" : "primary"} />
          </div>
          <div className="space-y-1"><Label className="text-xs">Closing amount (counted cash, SAR)</Label><Input type="number" step="0.01" value={closing} onChange={e => setClosing(e.target.value)} className="h-10 text-lg" autoFocus /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button className="gradient-primary text-primary-foreground border-0" onClick={() => { onCheckOut(); setOpen(false); }}>Close shift</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function Info({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "primary" | "success" | "destructive" }) {
  const map = { default: "bg-muted/40", primary: "bg-primary/10 text-primary", success: "bg-success/15 text-success", destructive: "bg-destructive/15 text-destructive" };
  return <div className={`rounded-xl p-3 ${map[tone]}`}><p className="text-[10px] uppercase font-semibold opacity-70">{label}</p><p className="font-bold">{value}</p></div>;
}
