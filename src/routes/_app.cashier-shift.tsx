import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Clock, Wallet, Banknote, CreditCard, Smartphone, Undo2, LogIn, LogOut } from "lucide-react";

export const Route = createFileRoute("/_app/cashier-shift")({ component: Shift });

const sessions = [
  { cashier: "Fahad Al-Qahtani", terminal: "TML-RYD-001", branch: "Olaya", open: 500, cash: 4820, card: 2840, wallet: 760, refund: 180, withdraw: 400, expected: 8340, actual: 8330, diff: -10, txns: 142, scans: 1180, start: "07:55", end: "—", status: "active" },
  { cashier: "Mohammed Al-Harbi", terminal: "TML-RYD-002", branch: "Olaya", open: 500, cash: 3210, card: 1980, wallet: 540, refund: 90, withdraw: 200, expected: 5940, actual: 5945, diff: 5, txns: 128, scans: 980, start: "08:10", end: "—", status: "active" },
  { cashier: "Khalid Al-Otaibi", terminal: "TML-KHB-001", branch: "Khobar", open: 500, cash: 2810, card: 1420, wallet: 360, refund: 60, withdraw: 200, expected: 4830, actual: 4830, diff: 0, txns: 96, scans: 720, start: "07:00", end: "15:00", status: "closed" },
];

function Shift() {
  return (
    <PageShell title="Cashier Shift" subtitle="Check-in, check-out and shift totals">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active Shifts" value="9" icon={Clock} accent="primary" />
        <MetricCard label="Total Cash" value="ر.س 18,240" icon={Banknote} accent="success" />
        <MetricCard label="Total Card" value="ر.س 11,820" icon={CreditCard} />
        <MetricCard label="Total Wallet" value="ر.س 3,240" icon={Smartphone} />
      </div>

      <div className="flex flex-wrap gap-2 justify-end">
        <CheckInDialog />
        <CheckOutDialog />
      </div>

      <Card className="overflow-hidden border-border/60 shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-3 font-semibold">Cashier</th>
                <th className="px-3 py-3 font-semibold">Terminal</th>
                <th className="px-3 py-3 font-semibold">Open</th>
                <th className="px-3 py-3 font-semibold">Cash</th>
                <th className="px-3 py-3 font-semibold">Card</th>
                <th className="px-3 py-3 font-semibold">Wallet</th>
                <th className="px-3 py-3 font-semibold">Refund</th>
                <th className="px-3 py-3 font-semibold">Withdraw</th>
                <th className="px-3 py-3 font-semibold">Expected</th>
                <th className="px-3 py-3 font-semibold">Actual</th>
                <th className="px-3 py-3 font-semibold">Diff</th>
                <th className="px-3 py-3 font-semibold">Txns / Scans</th>
                <th className="px-3 py-3 font-semibold">Shift</th>
                <th className="px-3 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.cashier} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                  <td className="px-3 py-3 font-medium">{s.cashier}<p className="text-xs text-muted-foreground">{s.branch}</p></td>
                  <td className="px-3 py-3 text-xs">{s.terminal}</td>
                  <td className="px-3 py-3 tabular-nums">{s.open}</td>
                  <td className="px-3 py-3 tabular-nums">{s.cash}</td>
                  <td className="px-3 py-3 tabular-nums">{s.card}</td>
                  <td className="px-3 py-3 tabular-nums">{s.wallet}</td>
                  <td className="px-3 py-3 tabular-nums text-destructive">{s.refund}</td>
                  <td className="px-3 py-3 tabular-nums">{s.withdraw}</td>
                  <td className="px-3 py-3 tabular-nums font-semibold">{s.expected}</td>
                  <td className="px-3 py-3 tabular-nums font-semibold">{s.actual}</td>
                  <td className={`px-3 py-3 tabular-nums font-semibold ${s.diff < 0 ? "text-destructive" : s.diff > 0 ? "text-success" : ""}`}>{s.diff > 0 ? `+${s.diff}` : s.diff}</td>
                  <td className="px-3 py-3 text-xs">{s.txns} / {s.scans}</td>
                  <td className="px-3 py-3 text-xs">{s.start}–{s.end}</td>
                  <td className="px-3 py-3"><StatusBadge status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </PageShell>
  );
}

function CheckInDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow"><LogIn className="h-4 w-4" />Check In</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Cashier Check-In</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <F label="Cashier Name" placeholder="Fahad Al-Qahtani" />
          <div className="grid grid-cols-2 gap-3">
            <F label="Branch" placeholder="Olaya" />
            <F label="Terminal ID" placeholder="TML-RYD-001" />
          </div>
          <F label="Opening Amount (SAR)" placeholder="500.00" />
          <F label="Shift Start Time" placeholder="07:55" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="gradient-primary text-primary-foreground border-0" onClick={() => setOpen(false)}>Check In</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CheckOutDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-1.5"><LogOut className="h-4 w-4" />Check Out</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Cashier Check-Out</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Cashier Name" placeholder="Fahad Al-Qahtani" />
          <F label="Terminal ID" placeholder="TML-RYD-001" />
          <F label="Opening Amount" placeholder="500.00" />
          <F label="Cash Sales" placeholder="4820.00" />
          <F label="Card Sales" placeholder="2840.00" />
          <F label="Wallet Sales" placeholder="760.00" />
          <F label="Refund Amount" placeholder="180.00" />
          <F label="Withdrawal Amount" placeholder="400.00" />
          <F label="Expected Closing" placeholder="8340.00" />
          <F label="Actual Closing" placeholder="8330.00" />
          <F label="Difference" placeholder="-10.00" />
          <F label="Shift End Time" placeholder="15:30" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Notes</Label>
          <Textarea placeholder="Any notes about the shift…" rows={2} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="gradient-primary text-primary-foreground border-0" onClick={() => setOpen(false)}>Submit Closing</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, placeholder }: { label: string; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input className="h-9" placeholder={placeholder} />
    </div>
  );
}