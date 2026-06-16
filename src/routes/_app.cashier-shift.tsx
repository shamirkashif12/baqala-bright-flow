import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Clock, Banknote, CreditCard, Smartphone, LogIn, LogOut, Timer } from "lucide-react";
import { api, type CashierShift, type User, type Branch, type Terminal } from "@/lib/api";

export const Route = createFileRoute("/_app/cashier-shift")({ component: Shift });

function Shift() {
  const [shifts, setShifts] = useState<CashierShift[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = () => {
    setLoading(true);
    api.getShifts()
      .then(setShifts)
      .finally(() => setLoading(false));
  };

  useEffect(() => { refetch(); }, []);

  const activeShifts = shifts.filter(s => s.status === "open");
  const firstActive = activeShifts[0];
  const totalCash = shifts.reduce((acc, s) => acc + s.cashSales, 0);
  const totalCard = shifts.reduce((acc, s) => acc + s.cardSales, 0);
  const totalDigital = shifts.reduce((acc, s) => acc + s.digitalSales, 0);
  const fmt = (n: number) => `ر.س ${n.toLocaleString("en-SA", { minimumFractionDigits: 2 })}`;

  return (
    <PageShell title="Cashier Shift" subtitle="Check-in, check-out and shift totals">
      {/* Live banner for first active shift */}
      <Card className={`p-5 border-2 ${firstActive ? "border-success/40 bg-success/5" : "border-muted bg-muted/30"}`}>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className={`h-14 w-14 rounded-2xl flex items-center justify-center ${firstActive ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
              <Timer className="h-7 w-7" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">
                {firstActive ? "Active Shift" : "No Active Shift"}
              </p>
              {firstActive ? (
                <>
                  <p className="text-xl font-bold tabular-nums">{firstActive.cashier?.fullName ?? "Cashier"}</p>
                  <p className="text-xs text-muted-foreground">
                    {firstActive.terminal?.terminalCode ?? "—"} · since{" "}
                    {new Date(firstActive.openedAt).toLocaleTimeString("en-SA", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </>
              ) : (
                <p className="text-lg font-bold text-muted-foreground">--:--:--</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <CheckInDialog onSuccess={refetch} />
            <CheckOutDialog onSuccess={refetch} activeShifts={activeShifts} />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active Shifts" value={String(activeShifts.length)} icon={Clock} accent="primary" />
        <MetricCard label="Total Cash" value={fmt(totalCash)} icon={Banknote} accent="success" />
        <MetricCard label="Total Card" value={fmt(totalCard)} icon={CreditCard} />
        <MetricCard label="Total Wallet" value={fmt(totalDigital)} icon={Smartphone} />
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 font-semibold">Cashier</th>
                  <th className="px-3 py-3 font-semibold">Terminal</th>
                  <th className="px-3 py-3 font-semibold">Opening</th>
                  <th className="px-3 py-3 font-semibold">Cash</th>
                  <th className="px-3 py-3 font-semibold">Card</th>
                  <th className="px-3 py-3 font-semibold">Wallet</th>
                  <th className="px-3 py-3 font-semibold">Total</th>
                  <th className="px-3 py-3 font-semibold">Variance</th>
                  <th className="px-3 py-3 font-semibold">Opened</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((s) => (
                  <tr key={s.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-3 py-3 font-medium">{s.cashier?.fullName ?? s.cashierId.slice(0, 8)}</td>
                    <td className="px-3 py-3 text-xs font-mono">{s.terminal?.terminalCode ?? "—"}</td>
                    <td className="px-3 py-3 tabular-nums">{s.openingAmount.toFixed(2)}</td>
                    <td className="px-3 py-3 tabular-nums">{s.cashSales.toFixed(2)}</td>
                    <td className="px-3 py-3 tabular-nums">{s.cardSales.toFixed(2)}</td>
                    <td className="px-3 py-3 tabular-nums">{s.digitalSales.toFixed(2)}</td>
                    <td className="px-3 py-3 tabular-nums font-semibold">{s.totalSales.toFixed(2)}</td>
                    <td className={`px-3 py-3 tabular-nums font-semibold ${(s.variance ?? 0) < 0 ? "text-destructive" : (s.variance ?? 0) > 0 ? "text-success" : ""}`}>
                      {s.variance != null ? (s.variance > 0 ? `+${s.variance.toFixed(2)}` : s.variance.toFixed(2)) : "—"}
                    </td>
                    <td className="px-3 py-3 text-xs">{new Date(s.openedAt).toLocaleTimeString("en-SA", { hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-3 py-3"><StatusBadge status={s.status} /></td>
                  </tr>
                ))}
                {shifts.length === 0 && (
                  <tr><td colSpan={10} className="text-center py-10 text-muted-foreground text-sm">No shifts found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </PageShell>
  );
}

function CheckInDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [cashierId, setCashierId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [terminalId, setTerminalId] = useState("");
  const [openingAmount, setOpeningAmount] = useState("500");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    Promise.all([api.getUsers(), api.getBranches(), api.getTerminals()])
      .then(([u, b, t]) => {
        setUsers(u.filter(u => u.status === "active"));
        setBranches(b.filter(b => b.status === "active"));
        setTerminals(t);
      })
      .catch(() => {});
  }, [open]);

  const branchTerminals = terminals.filter(t => t.branchId === branchId);

  const handleSubmit = async () => {
    if (!cashierId || !branchId) { setError("Cashier and branch are required."); return; }
    setSubmitting(true);
    setError(null);
    try {
      await api.openShift({ cashierId, branchId, terminalId: terminalId || undefined, openingAmount: parseFloat(openingAmount) || 0 });
      setOpen(false);
      setCashierId(""); setBranchId(""); setTerminalId(""); setOpeningAmount("500");
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to open shift.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow h-11 px-6"><LogIn className="h-4 w-4" />Check In</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Cashier Check-In</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Cashier</Label>
            <Select value={cashierId} onValueChange={setCashierId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select cashier" /></SelectTrigger>
              <SelectContent>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Branch</Label>
              <Select value={branchId} onValueChange={v => { setBranchId(v); setTerminalId(""); }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Terminal (optional)</Label>
              <Select value={terminalId} onValueChange={setTerminalId} disabled={!branchId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select terminal" /></SelectTrigger>
                <SelectContent>{branchTerminals.map(t => <SelectItem key={t.id} value={t.id}>{t.terminalCode} — {t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Opening Amount (SAR)</Label>
            <Input className="h-9 text-lg" type="number" min="0" step="0.01" value={openingAmount} onChange={e => setOpeningAmount(e.target.value)} placeholder="500.00" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={submitting} className="gradient-primary text-primary-foreground border-0" onClick={handleSubmit}>
            {submitting ? "Opening…" : "Check In"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CheckOutDialog({ onSuccess, activeShifts }: { onSuccess: () => void; activeShifts: CashierShift[] }) {
  const [open, setOpen] = useState(false);
  const [shiftId, setShiftId] = useState("");
  const [closingAmount, setClosingAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedShift = activeShifts.find(s => s.id === shiftId);
  const expected = selectedShift ? selectedShift.openingAmount + selectedShift.cashSales : 0;
  const variance = closingAmount ? (parseFloat(closingAmount) - expected) : 0;

  const handleSubmit = async () => {
    if (!shiftId || !closingAmount) { setError("Select a shift and enter closing amount."); return; }
    setSubmitting(true);
    setError(null);
    try {
      await api.closeShift(shiftId, { closingAmount: parseFloat(closingAmount), notes: notes || undefined });
      setOpen(false);
      setShiftId(""); setClosingAmount(""); setNotes("");
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to close shift.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-1.5 h-11 px-6"><LogOut className="h-4 w-4" />Check Out</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Cashier Check-Out</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Active Shift</Label>
            <Select value={shiftId} onValueChange={setShiftId}>
              <SelectTrigger className="h-9"><SelectValue placeholder={activeShifts.length === 0 ? "No open shifts" : "Select shift to close"} /></SelectTrigger>
              <SelectContent>
                {activeShifts.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.cashier?.fullName ?? s.cashierId.slice(0, 8)} — {s.terminal?.terminalCode ?? "No terminal"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedShift && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Info label="Opening" value={`ر.س ${selectedShift.openingAmount.toFixed(2)}`} />
              <Info label="Cash sales" value={`ر.س ${selectedShift.cashSales.toFixed(2)}`} />
              <Info label="Card sales" value={`ر.س ${selectedShift.cardSales.toFixed(2)}`} />
              <Info label="Expected cash" value={`ر.س ${expected.toFixed(2)}`} tone="primary" />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Actual Closing Amount (SAR)</Label>
            <Input className="h-9 text-lg" type="number" min="0" step="0.01" value={closingAmount} onChange={e => setClosingAmount(e.target.value)} placeholder="8330.00" />
          </div>
          {closingAmount && (
            <Info
              label="Cash variance"
              value={variance === 0 ? "ر.س 0.00" : `${variance > 0 ? "+" : ""}ر.س ${variance.toFixed(2)}`}
              tone={variance < 0 ? "destructive" : variance > 0 ? "success" : "primary"}
            />
          )}
          <div className="space-y-1">
            <Label className="text-xs">Notes</Label>
            <Textarea placeholder="Any notes about the shift…" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={submitting || activeShifts.length === 0} className="gradient-primary text-primary-foreground border-0" onClick={handleSubmit}>
            {submitting ? "Closing…" : "Submit Closing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "primary" | "success" | "destructive" }) {
  const map = { default: "bg-muted/40", primary: "bg-primary/10 text-primary", success: "bg-success/15 text-success", destructive: "bg-destructive/15 text-destructive" };
  return <div className={`rounded-xl p-3 ${map[tone]}`}><p className="text-[10px] uppercase font-semibold opacity-70">{label}</p><p className="font-bold">{value}</p></div>;
}
