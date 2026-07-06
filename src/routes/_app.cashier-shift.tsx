import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { MetricCard } from "@/components/metric-card";
import {
  Clock, Banknote, CreditCard, Smartphone, LogIn, LogOut,
  RefreshCw, CheckCircle2, XCircle, Loader2, UserCheck,
} from "lucide-react";
import { api, type CashierShift, type User, type Branch, type Terminal } from "@/lib/api";
import { useAuth, type AuthUser } from "@/lib/auth";
import { SARIcon, fmtSAR } from "@/lib/currency";

export const Route = createFileRoute("/_app/cashier-shift")({ component: Shift });

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) => fmtSAR(n);

function elapsed(openedAt: string) {
  const diff = Math.floor((Date.now() - new Date(openedAt).getTime()) / 1000);
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── Main page ────────────────────────────────────────────────────────────────
function Shift() {
  const { user } = useAuth();
  const isCashier = user?.role === "cashier";
  // Non-admins locked to their branch; cashiers additionally locked to their own shifts
  const effectiveBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? undefined) : undefined;
  const effectiveCashierId = isCashier ? (user?.id ?? undefined) : undefined;

  const [shifts, setShifts] = useState<CashierShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutShift, setCheckoutShift] = useState<CashierShift | null>(null);

  const refetch = useCallback(() => {
    setLoading(true);
    api.getShifts({ branchId: effectiveBranchId, cashierId: effectiveCashierId })
      .then(s => setShifts(s))
      .finally(() => setLoading(false));
  }, [effectiveBranchId, effectiveCashierId]);

  useEffect(() => { refetch(); }, [refetch]);

  const approveVariance = (id: string) => {
    api.approveVariance(id).then(refetch).catch(() => {});
  };

  const activeShifts = shifts.filter(s => s.status === "open");
  // Cashier sees only their own active shift in the banner; managers see all
  const bannerShifts = isCashier
    ? activeShifts.filter(s => s.cashierId === user?.id)
    : activeShifts;
  const totalCash = shifts.reduce((a, s) => a + s.cashSales, 0);
  const totalCard = shifts.reduce((a, s) => a + s.cardSales, 0);
  const totalDigital = shifts.reduce((a, s) => a + s.digitalSales, 0);

  return (
    <PageShell title="Cashier Shift" subtitle="Check-in, check-out and shift totals">
      {/* Active shifts banner */}
      {bannerShifts.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bannerShifts.map(s => (
            <Card key={s.id} className="p-4 border-2 border-success/40 bg-success/5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-xl bg-success/15 text-success flex items-center justify-center flex-shrink-0">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{s.cashier?.fullName ?? "Cashier"}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.terminal?.terminalCode ?? "—"} · {new Date(s.openedAt).toLocaleTimeString("en-SA", { hour: "2-digit", minute: "2-digit" })} · {elapsed(s.openedAt)}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">Cash Sales: {fmt(s.cashSales)}</p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-destructive border-destructive/30 hover:bg-destructive/10 flex-shrink-0"
                onClick={() => setCheckoutShift(s)}
              >
                <LogOut className="h-3.5 w-3.5" />
                Check Out
              </Button>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-5 border-2 border-muted bg-muted/30">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-muted text-muted-foreground flex items-center justify-center">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider font-bold text-muted-foreground">No Active Shift</p>
                <p className="text-lg font-bold text-muted-foreground">
                  {isCashier ? "You have no active shift. Check in to begin." : "Check in a cashier to begin"}
                </p>
              </div>
            </div>
            <CheckInDialog onSuccess={refetch} currentUser={user} />
          </div>
        </Card>
      )}

      {/* Global action bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {activeShifts.length} open shift{activeShifts.length !== 1 ? "s" : ""} · {shifts.length} total today
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />Refresh
          </Button>
          <CheckInDialog onSuccess={refetch} currentUser={user} />
          <CheckOutDialog onSuccess={refetch} activeShifts={bannerShifts} preSelected={null} onClose={() => {}} currentUser={user} />
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active Shifts" value={String(activeShifts.length)} icon={Clock} accent="primary" />
        <MetricCard label="Total Cash" value={<><SARIcon />{" "}{fmt(totalCash)}</>} icon={Banknote} accent="success" />
        <MetricCard label="Total Card" value={<><SARIcon />{" "}{fmt(totalCard)}</>} icon={CreditCard} />
        <MetricCard label="Total Wallet" value={<><SARIcon />{" "}{fmt(totalDigital)}</>} icon={Smartphone} />
      </div>

      {/* Shifts table */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />Loading shifts…
        </div>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Cashier</th>
                  <th className="px-4 py-3 font-semibold">Terminal</th>
                  <th className="px-4 py-3 font-semibold">Opening</th>
                  <th className="px-4 py-3 font-semibold">Cash</th>
                  <th className="px-4 py-3 font-semibold">Card</th>
                  <th className="px-4 py-3 font-semibold">Wallet</th>
                  <th className="px-4 py-3 font-semibold">Total</th>
                  <th className="px-4 py-3 font-semibold">Variance</th>
                  <th className="px-4 py-3 font-semibold">Opened</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map(s => {
                  const isOpen = s.status === "open";
                  const varVal = s.variance ?? 0;
                  const flagged = !isOpen && s.requiresApproval;
                  return (
                    <tr key={s.id} className="border-b border-border/40 hover:bg-muted/20 last:border-0">
                      <td className="px-4 py-3 font-medium">{s.cashier?.fullName ?? s.cashierId.slice(0, 8)}</td>
                      <td className="px-4 py-3 text-xs font-mono">{s.terminal?.terminalCode ?? "—"}</td>
                      <td className="px-4 py-3 tabular-nums">{s.openingAmount.toFixed(2)}</td>
                      <td className="px-4 py-3 tabular-nums">{s.cashSales.toFixed(2)}</td>
                      <td className="px-4 py-3 tabular-nums">{s.cardSales.toFixed(2)}</td>
                      <td className="px-4 py-3 tabular-nums">{s.digitalSales.toFixed(2)}</td>
                      <td className="px-4 py-3 tabular-nums font-semibold">{s.totalSales.toFixed(2)}</td>
                      <td className={`px-4 py-3 tabular-nums font-semibold ${flagged ? "text-destructive" : varVal === 0 ? "text-success" : ""}`}>
                        {s.variance != null ? (varVal > 0 ? `+${varVal.toFixed(2)}` : varVal.toFixed(2)) : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(s.openedAt).toLocaleTimeString("en-SA", { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-3">
                        {isOpen ? (
                          <Badge className="bg-success/15 text-success border-success/30 gap-1 text-[11px]">
                            <CheckCircle2 className="h-3 w-3" />Open
                          </Badge>
                        ) : flagged ? (
                          <Badge className="bg-destructive/15 text-destructive border-destructive/30 gap-1 text-[11px]">
                            <XCircle className="h-3 w-3" />Needs Review
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground gap-1 text-[11px]">
                            <XCircle className="h-3 w-3" />Closed
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isOpen && (!isCashier || s.cashierId === user?.id) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => setCheckoutShift(s)}
                          >
                            <LogOut className="h-3 w-3" />Check Out
                          </Button>
                        ) : flagged && !isCashier ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 h-7 text-xs"
                            onClick={() => approveVariance(s.id)}
                          >
                            <CheckCircle2 className="h-3 w-3" />Approve
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {shifts.length === 0 && (
                  <tr>
                    <td colSpan={11} className="text-center py-12 text-muted-foreground text-sm">
                      No shifts found. Use Check In to start a shift.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Inline checkout dialog triggered from row */}
      {checkoutShift && (
        <CheckOutDialog
          onSuccess={() => { setCheckoutShift(null); refetch(); }}
          activeShifts={bannerShifts}
          preSelected={checkoutShift.id}
          onClose={() => setCheckoutShift(null)}
          currentUser={user}
          autoOpen
        />
      )}
    </PageShell>
  );
}

// ─── Check In dialog ──────────────────────────────────────────────────────────
function CheckInDialog({ onSuccess, currentUser }: { onSuccess: () => void; currentUser: AuthUser | null }) {
  const isCashierUser = currentUser?.role === "cashier";

  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  // Pre-fill and lock fields when the logged-in user is a cashier
  const [cashierId, setCashierId] = useState(isCashierUser ? (currentUser?.id ?? "") : "");
  const [branchId, setBranchId] = useState(isCashierUser ? (currentUser?.branchId ?? "") : "");
  const [terminalId, setTerminalId] = useState("");
  const [openingAmount, setOpeningAmount] = useState("500");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [occupiedTerminalIds, setOccupiedTerminalIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    if (isCashierUser) {
      // Cashier only needs terminals for their own branch
      api.getTerminals({ branchId: currentUser?.branchId ?? undefined })
        .then(t => setTerminals(t))
        .catch(() => {});
    } else {
      Promise.all([api.getUsers(), api.getBranches(), api.getTerminals()])
        .then(([u, b, t]) => {
          // Only Cashier-role accounts can hold a shift — no other role appears here.
          setUsers(u.filter(u => u.status === "active" && u.roleName === "Cashier"));
          setBranches(b.filter(b => b.status === "active"));
          setTerminals(t);
        })
        .catch(() => {});
    }
  }, [open, isCashierUser, currentUser?.branchId]);

  // A terminal already bound to an open shift can't be picked by another cashier.
  useEffect(() => {
    if (!open || !branchId) { setOccupiedTerminalIds(new Set()); return; }
    api.getActiveShifts(branchId)
      .then(shifts => setOccupiedTerminalIds(new Set(shifts.map(s => s.terminalId).filter((id): id is string => !!id))))
      .catch(() => {});
  }, [open, branchId]);

  const branchTerminals = terminals.filter(t => t.branchId === branchId && !occupiedTerminalIds.has(t.id));

  const handleSubmit = async () => {
    if (!cashierId || !branchId) { setError("Cashier and branch are required."); return; }
    if (!terminalId) { setError("Terminal is required — pick the till you're checking into."); return; }
    setSubmitting(true); setError(null);
    try {
      await api.openShift({ cashierId, branchId, terminalId, openingAmount: parseFloat(openingAmount) || 0 });
      setOpen(false);
      if (!isCashierUser) { setCashierId(""); setBranchId(""); }
      setTerminalId(""); setOpeningAmount("500");
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to open shift.");
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow">
          <LogIn className="h-4 w-4" />Check In
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Cashier Check-In</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Cashier</Label>
            {isCashierUser ? (
              <Input className="h-9 bg-muted" value={currentUser?.name ?? "Me"} disabled />
            ) : (
              <Select value={cashierId} onValueChange={setCashierId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select cashier" /></SelectTrigger>
                <SelectContent>{users.map(u => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Branch</Label>
              {isCashierUser ? (
                <Input className="h-9 bg-muted" value={currentUser?.branch ?? "My Branch"} disabled />
              ) : (
                <Select value={branchId} onValueChange={v => { setBranchId(v); setTerminalId(""); }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Branch" /></SelectTrigger>
                  <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Terminal *</Label>
              <Select value={terminalId} onValueChange={setTerminalId} disabled={!branchId}>
                <SelectTrigger className="h-9"><SelectValue placeholder={branchTerminals.length === 0 ? "No free terminals" : "Select"} /></SelectTrigger>
                <SelectContent>{branchTerminals.map(t => <SelectItem key={t.id} value={t.id}>{t.terminalCode} — {t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Opening Amount (SAR)</Label>
            <Input className="h-9 text-lg font-mono" type="number" min="0" step="0.01" value={openingAmount} onChange={e => setOpeningAmount(e.target.value)} placeholder="500.00" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={submitting} className="gradient-primary text-primary-foreground border-0" onClick={handleSubmit}>
            {submitting ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Opening…</> : "Check In"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Check Out dialog ─────────────────────────────────────────────────────────
// Live client-side preview only — the server re-checks against the live
// Rules Engine "Cash variance > SAR 200" threshold and is authoritative.
const VARIANCE_REVIEW_THRESHOLD = 200;

function CheckOutDialog({
  onSuccess, activeShifts, preSelected, onClose, currentUser, autoOpen = false,
}: {
  onSuccess: () => void;
  activeShifts: CashierShift[];
  preSelected: string | null;
  onClose: () => void;
  currentUser: AuthUser | null;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [shiftId, setShiftId] = useState(preSelected ?? "");
  const [closingAmount, setClosingAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync if preSelected changes (row click)
  useEffect(() => {
    if (preSelected) { setShiftId(preSelected); setOpen(true); }
  }, [preSelected]);

  const selectedShift = activeShifts.find(s => s.id === shiftId);
  const expected = selectedShift ? selectedShift.openingAmount + selectedShift.cashSales : 0;
  const variance = closingAmount ? parseFloat(closingAmount) - expected : null;
  const isManagerOverride = !!selectedShift && !!currentUser && selectedShift.cashierId !== currentUser.id;

  const handleClose = () => { setOpen(false); onClose(); };

  const handleSubmit = async () => {
    if (!shiftId || !closingAmount) { setError("Select a shift and enter closing amount."); return; }
    if (isManagerOverride && !reason.trim()) { setError("A reason is required to close another cashier's shift."); return; }
    setSubmitting(true); setError(null);
    try {
      await api.closeShift(shiftId, { closingAmount: parseFloat(closingAmount), notes: notes || undefined, reason: reason || undefined });
      setShiftId(""); setClosingAmount(""); setNotes(""); setReason("");
      setOpen(false);
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to close shift.");
    } finally { setSubmitting(false); }
  };

  // Standalone trigger button version (when not pre-opened from a row)
  if (!autoOpen) {
    return (
      <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) onClose(); }}>
        <DialogTrigger asChild>
          <Button variant="outline" className="gap-1.5">
            <LogOut className="h-4 w-4" />Check Out
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <CheckOutForm
            activeShifts={activeShifts} shiftId={shiftId} setShiftId={setShiftId}
            selectedShift={selectedShift} expected={expected} variance={variance}
            closingAmount={closingAmount} setClosingAmount={setClosingAmount}
            notes={notes} setNotes={setNotes} reason={reason} setReason={setReason}
            isManagerOverride={isManagerOverride} error={error}
            submitting={submitting} onClose={handleClose} onSubmit={handleSubmit}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <CheckOutForm
          activeShifts={activeShifts} shiftId={shiftId} setShiftId={setShiftId}
          selectedShift={selectedShift} expected={expected} variance={variance}
          closingAmount={closingAmount} setClosingAmount={setClosingAmount}
          notes={notes} setNotes={setNotes} reason={reason} setReason={setReason}
          isManagerOverride={isManagerOverride} error={error}
          submitting={submitting} onClose={handleClose} onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}

function CheckOutForm({
  activeShifts, shiftId, setShiftId, selectedShift, expected, variance,
  closingAmount, setClosingAmount, notes, setNotes, reason, setReason,
  isManagerOverride, error, submitting, onClose, onSubmit,
}: {
  activeShifts: CashierShift[];
  shiftId: string; setShiftId: (v: string) => void;
  selectedShift?: CashierShift;
  expected: number;
  variance: number | null;
  closingAmount: string; setClosingAmount: (v: string) => void;
  notes: string; setNotes: (v: string) => void;
  reason: string; setReason: (v: string) => void;
  isManagerOverride: boolean;
  error: string | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const flagged = variance !== null && Math.abs(variance) > VARIANCE_REVIEW_THRESHOLD;
  return (
    <>
      <DialogHeader><DialogTitle>Cashier Check-Out</DialogTitle></DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1">
          <Label className="text-xs">Select Shift to Close</Label>
          <Select value={shiftId} onValueChange={setShiftId}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder={activeShifts.length === 0 ? "No open shifts" : "Select shift"} />
            </SelectTrigger>
            <SelectContent>
              {activeShifts.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  {s.cashier?.fullName ?? "Cashier"} — {s.terminal?.terminalCode ?? "No terminal"} · since {new Date(s.openedAt).toLocaleTimeString("en-SA", { hour: "2-digit", minute: "2-digit" })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedShift && (
          <div className="grid grid-cols-2 gap-2">
            <Info label="Opening" value={fmt(selectedShift.openingAmount)} />
            <Info label="Cash Sales" value={fmt(selectedShift.cashSales)} />
            <Info label="Card Sales" value={fmt(selectedShift.cardSales)} />
            <Info label="Expected Cash" value={fmt(expected)} tone="primary" />
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs">Actual Closing Amount (SAR)</Label>
          <Input className="h-10 text-lg font-mono" type="number" min="0" step="0.01"
            value={closingAmount} onChange={e => setClosingAmount(e.target.value)} placeholder="0.00" />
        </div>

        {variance !== null && (
          <Info
            label={flagged ? "Cash Variance — exceeds review threshold" : "Cash Variance"}
            value={variance === 0 ? "0.00 — Perfect" : `${variance > 0 ? "+" : ""}${fmt(variance)}`}
            tone={flagged ? "destructive" : variance === 0 ? "success" : "primary"}
          />
        )}
        {flagged && (
          <p className="text-xs text-destructive font-medium">
            This variance exceeds SAR {VARIANCE_REVIEW_THRESHOLD} and will be flagged for manager review before it can be cleared.
          </p>
        )}

        {isManagerOverride && (
          <div className="space-y-1">
            <Label className="text-xs">Reason for closing on this cashier's behalf *</Label>
            <Textarea placeholder="e.g. cashier left sick, end-of-day handover…" rows={2} value={reason} onChange={e => setReason(e.target.value)} />
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs">Notes (optional)</Label>
          <Textarea placeholder="Any notes about the shift…" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={submitting || activeShifts.length === 0} className="gradient-primary text-primary-foreground border-0" onClick={onSubmit}>
          {submitting ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Closing…</> : "Submit Closing"}
        </Button>
      </DialogFooter>
    </>
  );
}

// ─── Info cell ────────────────────────────────────────────────────────────────
function Info({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "primary" | "success" | "destructive" }) {
  const cls = {
    default: "bg-muted/40 text-foreground",
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    destructive: "bg-destructive/15 text-destructive",
  }[tone];
  return (
    <div className={`rounded-xl p-3 ${cls}`}>
      <p className="text-[10px] uppercase font-semibold opacity-70">{label}</p>
      <p className="font-bold tabular-nums">{value}</p>
    </div>
  );
}
