import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { DateRangeField } from "@/components/report-filters/date-range-field";
import { StatusBadge } from "@/components/module-placeholder";
import { Eye, Pencil, X, Monitor, Activity, Plus, Wifi, CheckCircle2, AlertCircle, Clock, WifiOff, LogIn, LogOut, KeyRound, Copy, Lock } from "lucide-react";
import { toast } from "sonner";
import { api, excludeDisabledBranches, type Terminal, type Branch, type User, type CashierShift, type TenantPlanInfo } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermission } from "@/lib/use-permission";
import { usePlanFeature } from "@/lib/use-plan-feature";
import { LockedFeatureNotice } from "@/components/locked-feature-notice";
import { PENDING_TERMINAL_BRANCH_KEY } from "@/lib/utils";

export const Route = createFileRoute("/_app/terminals")({ component: Terminals });

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

function TerminalFormFields({ form, set, setS, branches, users, saving, onSave, limitBlocked }: {
  form: TerminalForm;
  set: (k: keyof TerminalForm) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  setS: (k: keyof TerminalForm) => (v: string) => void;
  branches: Branch[];
  users: User[];
  saving: boolean;
  onSave: () => void;
  // Set (to a user-facing message) when the selected branch has hit the plan's per-branch
  // terminal limit — disables Save instead of letting the user hit the backend's 403 blind.
  limitBlocked?: string;
}) {
  return (
    <div className="mt-4 space-y-4">
      <FieldRow label="Terminal Code"><Input value={form.terminalCode} onChange={set("terminalCode")} className="h-9 font-mono" placeholder="TML-RYD-001" /></FieldRow>
      <FieldRow label="Name"><Input value={form.name} onChange={set("name")} className="h-9" placeholder="Olaya Cashier 1" /></FieldRow>
      <FieldRow label="Branch">
        <Select value={form.branchId} onValueChange={setS("branchId")}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Select branch" /></SelectTrigger>
          <SelectContent>
            {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Assigned Cashier">
        <Select value={form.assignedCashierId ?? "none"} onValueChange={v => setS("assignedCashierId")(v === "none" ? "" : v)}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Unassigned" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Unassigned —</SelectItem>
            {users.map(u => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Status">
        <Select value={form.status} onValueChange={setS("status")}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      {limitBlocked && <p className="text-xs text-destructive">{limitBlocked}</p>}
      <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={onSave} disabled={saving || !!limitBlocked}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border/40 pb-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function KioskCredentialField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <Input readOnly value={value} className={`h-9 ${mono ? "font-mono text-xs" : "font-mono"}`} onFocus={e => e.target.select()} />
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9 shrink-0"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

type TerminalForm = { name: string; terminalCode: string; branchId: string; status: string; assignedCashierId: string; };
const emptyForm: TerminalForm = { name: "", terminalCode: "", branchId: "", status: "active", assignedCashierId: "" };

const KSA = { timeZone: "Asia/Riyadh" } as const;

// MySQL datetimes may arrive without "Z" (DateTimeKind.Unspecified from EF).
// Treat them as UTC so toLocaleString shows the correct KSA time (+3).
function toUtc(iso: string): Date {
  if (iso && !iso.endsWith("Z") && !/[+-]\d{2}:?\d{2}$/.test(iso)) {
    return new Date(iso + "Z");
  }
  return new Date(iso);
}

function fmtDT(iso: string) {
  return toUtc(iso).toLocaleString("en-SA", { ...KSA, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string) {
  return toUtc(iso).toLocaleDateString("en-SA", { ...KSA });
}

function relTime(iso: string | Date): string {
  const d = typeof iso === "string" ? toUtc(iso) : iso;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getEffectiveLastSync(t: Terminal, shifts: CashierShift[]): string | null {
  if (t.lastSync) return t.lastSync;
  const terminalShifts = shifts.filter(s => s.terminalId === t.id);
  if (terminalShifts.length === 0) return null;
  const dates = terminalShifts
    .flatMap(s => [s.openedAt, ...(s.closedAt ? [s.closedAt] : [])])
    .sort()
    .reverse();
  return dates[0] ?? null;
}

type SyncLogEntry = { time: string; event: string; detail: string; type: "success" | "info" | "warn" | "error" };

function buildSyncLog(t: Terminal, shifts: CashierShift[]): SyncLogEntry[] {
  const now = new Date();
  const lastSync = t.lastSync ? new Date(t.lastSync) : null;
  const entries: SyncLogEntry[] = [];

  const activeShift = shifts.find(s => s.status === "open") ?? null;
  const closedShifts = shifts
    .filter(s => s.status === "closed")
    .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());

  // Current terminal state entry (use shift openedAt to avoid "just now" flicker)
  if (t.status === "active" && activeShift) {
    const cashierName = activeShift.cashier?.fullName ?? t.assignedCashier?.fullName ?? "Unassigned";
    entries.push({ time: activeShift.openedAt, event: "Session Active", detail: `Cashier: ${cashierName}`, type: "success" });
    entries.push({ time: activeShift.openedAt, event: "Session Opened", detail: `${cashierName} checked in`, type: "info" });
    if (lastSync) {
      entries.push({ time: lastSync.toISOString(), event: "Sales Synced", detail: "Transactions uploaded to server", type: "success" });
    }
  } else if (t.status === "offline") {
    entries.push({ time: now.toISOString(), event: "Terminal Offline", detail: "No network connection detected", type: "error" });
    if (lastSync) {
      entries.push({ time: new Date(lastSync.getTime() + 2 * 60000).toISOString(), event: "Connection Lost", detail: "Network unreachable", type: "error" });
      entries.push({ time: lastSync.toISOString(), event: "Last Sync Before Offline", detail: "Final data sync completed", type: "warn" });
    }
  } else if (t.status === "syncing") {
    entries.push({ time: now.toISOString(), event: "Sync In Progress", detail: "Uploading pending transactions…", type: "info" });
    entries.push({ time: new Date(now.getTime() - 2 * 60000).toISOString(), event: "Sync Triggered", detail: "Auto-sync interval reached", type: "info" });
    if (lastSync) entries.push({ time: lastSync.toISOString(), event: "Previous Sync Completed", detail: "All transactions uploaded", type: "success" });
  } else if (!activeShift) {
    entries.push({ time: now.toISOString(), event: t.status === "active" ? "No Active Session" : "Terminal Inactive", detail: "Not currently in service", type: "warn" });
    if (lastSync) entries.push({ time: lastSync.toISOString(), event: "Final Sync", detail: "Last data upload", type: "info" });
  }

  // Historical closed shifts
  for (const shift of closedShifts) {
    const cashierName = shift.cashier?.fullName ?? "Cashier";
    if (shift.closedAt) {
      entries.push({ time: shift.closedAt, event: "Session Closed", detail: `${cashierName} checked out`, type: "warn" });
    }
    entries.push({ time: shift.openedAt, event: "Session Opened", detail: `${cashierName} checked in`, type: "info" });
  }

  return entries.sort((a, b) => b.time.localeCompare(a.time));
}

const LOG_ICON: Record<SyncLogEntry["type"], React.FC<{ className?: string }>> = {
  success: CheckCircle2,
  info: Clock,
  warn: AlertCircle,
  error: WifiOff,
};
const LOG_COLOR: Record<SyncLogEntry["type"], string> = {
  success: "text-success",
  info: "text-primary",
  warn: "text-warning-foreground",
  error: "text-destructive",
};

function Terminals() {
  const { user } = useAuth();
  const { canCreate, canEdit } = usePermission("Terminals");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;

  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [allTerminals, setAllTerminals] = useState<Terminal[]>([]); // unfiltered — for Session Logs dropdown
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  // allShifts: used only by the view-sheet sync log (needs full history per terminal)
  const [allShifts, setAllShifts] = useState<CashierShift[]>([]);
  // sessionLogs: session logs tab — fetched from BE with filters applied
  const [sessionLogs, setSessionLogs] = useState<CashierShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);
  const [syncLogFilter, setSyncLogFilter] = useState("all");
  const [mainTab, setMainTab] = useState("terminals");
  const [slTerminal, setSlTerminal] = useState<string[]>([]);
  const [slStatus, setSlStatus] = useState<string[]>([]);
  const [slDateFrom, setSlDateFrom] = useState("");
  const [slDateTo, setSlDateTo] = useState("");
  const [q, setQ] = useState("");
  const [br, setBr] = useState<string[]>(lockedBranchId ? [lockedBranchId] : []);
  const [st, setSt] = useState<string[]>([]);

  // Sync if user loads after mount
  useEffect(() => {
    if (lockedBranchId) setBr([lockedBranchId]);
  }, [lockedBranchId]);
  const [syncFrom, setSyncFrom] = useState("");
  const [syncTo, setSyncTo] = useState("");
  const [viewTerm, setViewTerm] = useState<Terminal | null>(null);
  const [editTerm, setEditTerm] = useState<Terminal | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<TerminalForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<Terminal | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const kioskUnlocked = usePlanFeature("self_service_kiosk");
  const [planInfo, setPlanInfo] = useState<TenantPlanInfo | null>(null);
  const [kioskTerm, setKioskTerm] = useState<Terminal | null>(null);
  const [kioskSecret, setKioskSecret] = useState<{ terminalCode: string; pairingSecret: string } | null>(null);
  const [kioskGenerating, setKioskGenerating] = useState(false);
  const [customSecretInput, setCustomSecretInput] = useState("");
  const [lockdownPin, setLockdownPin] = useState("");
  const [lockdownSaving, setLockdownSaving] = useState(false);

  // Load all terminals once (unfiltered) for the Session Logs dropdown
  useEffect(() => {
    api.getTerminals().then(setAllTerminals);
    api.getTenantPlan().then(setPlanInfo).catch(() => {});
  }, []);

  // Consume the Branches page's "add a terminal now?" handoff — set once, right after a branch
  // is created, and read only here so it never re-triggers on a later visit to this page.
  useEffect(() => {
    const pendingBranchId = sessionStorage.getItem(PENDING_TERMINAL_BRANCH_KEY);
    if (!pendingBranchId) return;
    sessionStorage.removeItem(PENDING_TERMINAL_BRANCH_KEY);
    setForm({ ...emptyForm, branchId: pendingBranchId });
    setCreateOpen(true);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    // .catch() per call so one failing endpoint doesn't wipe out the others' data —
    // Promise.all otherwise rejects the whole batch and skips every setState below,
    // which is exactly why a healthy /api/terminals response was rendering as
    // "No terminals found" whenever a sibling call (e.g. /api/users) failed.
    Promise.all([
      api.getTerminals({
        branchId: br.length ? br : undefined,
        status: st.length ? st : undefined,
      }).catch(() => []),
      api.getBranches().catch(() => []),
      api.getUsers().catch(() => []),
      // Cashiers only ever see their own shifts — feeds view-sheet sync log
      api.getShifts({ cashierId: user?.role === "cashier" ? user.id : undefined }).catch(() => []),
    ])
      .then(([t, b, u, s]) => { setTerminals(t); setBranches(excludeDisabledBranches(b)); setUsers(u); setAllShifts(s); })
      .finally(() => setLoading(false));
  }, [br, st, user]);
  useEffect(() => { load(); }, [load]);

  const reloadSessionLogs = useCallback(() => {
    setLogsLoading(true);
    return api.getShifts({
      cashierId:  user?.role === "cashier" ? user.id : undefined,
      terminalId: slTerminal.length ? slTerminal : undefined,
      status:     slStatus.length   ? slStatus   : undefined,
      dateFrom:   slDateFrom || undefined,
      dateTo:     slDateTo   || undefined,
    })
      .then(setSessionLogs)
      .finally(() => setLogsLoading(false));
  }, [slTerminal, slStatus, slDateFrom, slDateTo, user]);
  useEffect(() => { reloadSessionLogs(); }, [reloadSessionLogs]);

  const { canApprove: canForceCloseShifts } = usePermission("Cashier Shifts");
  const [forceCloseHours, setForceCloseHours] = useState("24");
  const [forceClosing, setForceClosing] = useState(false);

  const handleBulkForceClose = async () => {
    const hours = Number(forceCloseHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      toast.error("Enter a valid number of hours.");
      return;
    }
    if (!confirm(`Force-close every session open longer than ${hours}h? This cannot be undone.`)) return;
    setForceClosing(true);
    try {
      const res = await api.bulkForceCloseShifts(hours);
      toast.success(res.closedCount === 0 ? "No stale sessions found." : `Force-closed ${res.closedCount} session${res.closedCount !== 1 ? "s" : ""}.`);
      load();
      reloadSessionLogs();
    } catch (e: any) {
      toast.error(e?.message || "Failed to force-close sessions.");
    } finally {
      setForceClosing(false);
    }
  };

  const cashiers = users.filter(u => u.roleName?.toLowerCase().includes("cashier"));

  // Status filter applied on BE; search + sync-date filtering client-side
  const filtered = useMemo(() => terminals.filter(t => {
    if (q && !t.terminalCode?.toLowerCase().includes(q.toLowerCase()) && !t.name?.toLowerCase().includes(q.toLowerCase())) return false;
    if (syncFrom && (!t.lastSync || t.lastSync < syncFrom)) return false;
    if (syncTo && (!t.lastSync || t.lastSync > syncTo + "T23:59:59")) return false;
    return true;
  }), [terminals, q, syncFrom, syncTo]);

  const openEdit = (t: Terminal) => {
    setEditTerm(t);
    setForm({ name: t.name, terminalCode: t.terminalCode, branchId: t.branchId, status: t.status, assignedCashierId: t.assignedCashierId ?? "" });
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Terminal name is required."); return; }
    if (!form.branchId) { toast.error("Branch is required."); return; }
    setSaving(true);
    try {
      if (editTerm) {
        await api.updateTerminal(editTerm.id, form);
        setEditTerm(null);
      } else {
        await api.createTerminal(form);
        setCreateOpen(false);
      }
      load();
      // Keep the unfiltered per-branch counts (used for the plan terminal-limit check) in sync —
      // `load()` above only refreshes the filtered `terminals` list, not `allTerminals`.
      api.getTerminals().then(setAllTerminals);
    } catch (e: any) { console.error(e); toast.error(e?.message || "Failed to save terminal."); } finally { setSaving(false); }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    setDeactivating(true);
    try {
      await api.updateTerminalStatus(deactivateTarget.id, "inactive");
      setDeactivateTarget(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to deactivate terminal.");
    } finally {
      setDeactivating(false);
    }
  };

  const handleGenerateKioskCode = async () => {
    if (!kioskTerm) return;
    const trimmed = customSecretInput.trim();
    if (trimmed && trimmed.length < 6) { toast.error("Custom pairing secret must be at least 6 characters."); return; }
    setKioskGenerating(true);
    try {
      const res = await api.generateKioskPairingCode(kioskTerm.id, trimmed || undefined);
      setKioskSecret(res);
      setCustomSecretInput("");
      load();
    } catch (e: any) { console.error(e); toast.error(e?.message || "Failed to generate kiosk pairing code."); } finally { setKioskGenerating(false); }
  };

  const handleSetLockdownPin = async () => {
    if (!kioskTerm || lockdownPin.length < 4) return;
    setLockdownSaving(true);
    try {
      const res = await api.setKioskLockdownPin(kioskTerm.id, lockdownPin);
      setKioskTerm(prev => (prev ? { ...prev, kioskLockdownPinSetAt: res.setAt, kioskLockdownPinLength: res.length } : prev));
      setLockdownPin("");
      toast.success("Lockdown PIN saved.");
      load();
    } catch (e: any) { toast.error(e?.message || "Failed to save lockdown PIN."); } finally { setLockdownSaving(false); }
  };

  const handleClearLockdownPin = async () => {
    if (!kioskTerm) return;
    if (!confirm("Remove the kiosk lockdown PIN? The fullscreen-lockdown shortcut will do nothing on this kiosk until a new PIN is set.")) return;
    setLockdownSaving(true);
    try {
      await api.clearKioskLockdownPin(kioskTerm.id);
      setKioskTerm(prev => (prev ? { ...prev, kioskLockdownPinSetAt: undefined, kioskLockdownPinLength: undefined } : prev));
      load();
    } catch (e: any) { toast.error(e?.message || "Failed to clear lockdown PIN."); } finally { setLockdownSaving(false); }
  };

  const set = (k: keyof TerminalForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));
  const setS = (k: keyof TerminalForm) => (v: string) =>
    setForm(p => ({ ...p, [k]: v }));

  const openShiftCount = allShifts.filter(s => s.status === "open").length;  // from unfiltered allShifts for badge accuracy

  const maxTerminalsPerBranch = planInfo?.plan.limits.maxTerminalsPerBranch ?? null;
  const terminalCountByBranch = useMemo(() => {
    const counts: Record<string, number> = {};
    allTerminals.forEach(t => { counts[t.branchId] = (counts[t.branchId] ?? 0) + 1; });
    return counts;
  }, [allTerminals]);
  // Branch-scoped users only ever create in their own branch, so the top button can be disabled
  // up front. A tenant_admin picks the branch inside the dialog, so their check happens there
  // instead (limitBlocked below, evaluated against whatever branch is currently selected in the form).
  const lockedBranchAtLimit = !!lockedBranchId && maxTerminalsPerBranch !== null
    && (terminalCountByBranch[lockedBranchId] ?? 0) >= maxTerminalsPerBranch;
  const selectedBranchName = branches.find(b => b.id === form.branchId)?.name;
  const createLimitBlocked = (!editTerm && !!form.branchId && maxTerminalsPerBranch !== null
    && (terminalCountByBranch[form.branchId] ?? 0) >= maxTerminalsPerBranch)
    ? `Terminal limit reached (${maxTerminalsPerBranch}) for ${selectedBranchName ?? "this branch"} under your plan. Upgrade to add more.`
    : undefined;

  // Terminals tab filters
  const hasTerminalFilters = !!q || (!lockedBranchId && br.length > 0) || st.length > 0 || !!syncFrom || !!syncTo;
  const clearTerminalFilters = () => {
    setQ(""); if (!lockedBranchId) setBr([]); setSt([]); setSyncFrom(""); setSyncTo("");
  };

  // Session Logs tab filters
  const hasSessionLogFilters = slTerminal.length > 0 || slStatus.length > 0 || !!slDateFrom || !!slDateTo;
  const clearSessionLogFilters = () => {
    setSlTerminal([]); setSlStatus([]); setSlDateFrom(""); setSlDateTo("");
  };

  return (
    <PageShell title="Terminals" subtitle="POS terminal registry, sessions and sync status">
      <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-4">
        {/* ── Tab bar + per-tab actions ── */}
        <div className="flex flex-wrap items-center gap-2">
          <TabsList>
            <TabsTrigger value="terminals">Terminals</TabsTrigger>
            <TabsTrigger value="session-logs">
              Session Logs
            </TabsTrigger>
          </TabsList>
          <div className="flex-1" />
          {mainTab === "terminals" && canCreate && (
            <Button
              size="sm"
              className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9"
              onClick={() => { setForm(emptyForm); setCreateOpen(true); }}
              disabled={lockedBranchAtLimit}
              title={lockedBranchAtLimit ? `Terminal limit reached (${maxTerminalsPerBranch}) for your branch under your plan. Upgrade to add more.` : undefined}
            >
              <Plus className="h-4 w-4" /> Add Terminal
            </Button>
          )}
        </div>

        {/* ── TERMINALS TAB ── */}
        <TabsContent value="terminals" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search code or name…" className="h-9 w-48 flex-shrink-0" />
            {!lockedBranchId && (
              <div className="w-40">
                <SearchableMultiSelect
                  placeholder="All Branches"
                  options={branches.map(b => ({ id: b.id, label: b.name }))}
                  selected={br}
                  onChange={setBr}
                />
              </div>
            )}
            <div className="w-36">
              <SearchableMultiSelect
                placeholder="All Statuses"
                options={[
                  { id: "active", label: "Active" },
                  { id: "inactive", label: "Inactive" },
                  { id: "maintenance", label: "Maintenance" },
                  { id: "syncing", label: "Syncing" },
                ]}
                selected={st}
                onChange={setSt}
              />
            </div>
            <DateRangeField from={syncFrom} to={syncTo} onFromChange={setSyncFrom} onToChange={setSyncTo} />
            {hasTerminalFilters && (
              <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-xs" onClick={clearTerminalFilters}>
                <X className="h-3.5 w-3.5" /> Clear Filters
              </Button>
            )}
          </div>

          {loading ? (
            <div className="text-muted-foreground text-sm">Loading…</div>
          ) : (
            <Card className="overflow-hidden border-border/60 shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border/60 text-start text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-3 font-semibold">Code</th>
                      <th className="px-3 py-3 font-semibold">Name</th>
                      <th className="px-3 py-3 font-semibold">Branch</th>
                      <th className="px-3 py-3 font-semibold">Cashier</th>
                      <th className="px-3 py-3 font-semibold">Network</th>
                      <th className="px-3 py-3 font-semibold">Session</th>
                      <th className="px-3 py-3 font-semibold">Last Sync</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t) => (
                      <tr key={t.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                        <td className="px-3 py-3 font-mono text-xs font-bold">
                          <div className="flex items-center gap-1">
                            {t.terminalCode}
                            {t.pairingSecretSetAt && (
                              <span title={`Self-checkout kiosk paired ${fmtDT(t.pairingSecretSetAt)}`}>
                                <KeyRound className="h-3 w-3 text-success" />
                              </span>
                            )}
                            {t.kioskLockdownPinSetAt && (
                              <span title={`Kiosk fullscreen-lockdown PIN set ${fmtDT(t.kioskLockdownPinSetAt)}`}>
                                <Lock className="h-3 w-3 text-primary" />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 font-medium">{t.name}</td>
                        <td className="px-3 py-3 text-xs">{t.branch?.name ?? "—"}</td>
                        <td className="px-3 py-3 text-xs">
                          {(() => {
                            const openShift = allShifts.find(s => s.terminalId === t.id && s.status === "open");
                            const name = openShift?.cashier?.fullName ?? t.assignedCashier?.fullName ?? "Unassigned";
                            return openShift
                              ? <span>{name} <span className="text-[10px] text-success">(on shift)</span></span>
                              : name;
                          })()}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <span className="flex items-center gap-1 text-primary"><Wifi className="h-3.5 w-3.5" />Wi-Fi</span>
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {allShifts.some(s => s.terminalId === t.id && s.status === "open")
                            ? <span className="inline-flex items-center gap-1 rounded-full bg-success/15 text-success px-2 py-0.5 text-[10px] font-semibold"><Activity className="h-3 w-3" />Session Open</span>
                            : <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-semibold">No Session</span>}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {(() => {
                            const eff = getEffectiveLastSync(t, allShifts);
                            if (!eff) return <span className="text-muted-foreground italic">Never synced</span>;
                            const d = new Date(eff);
                            return (
                              <span title={d.toLocaleString("en-SA", KSA)} className="cursor-default">
                                <span className="font-medium">{relTime(d)}</span>
                                <span className="text-muted-foreground ml-1">· {fmtDate(d.toISOString())}</span>
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-3"><StatusBadge status={t.status} /></td>
                        <td className="px-3 py-3">
                          <div className="flex gap-1 justify-end">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewTerm(t)}><Eye className="h-3.5 w-3.5" /></Button>
                            {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>}
                            {canEdit && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" title="Self-checkout kiosk pairing" onClick={() => { setKioskTerm(t); setKioskSecret(null); setLockdownPin(""); }}>
                                <KeyRound className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canEdit && t.status === "active" && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Deactivate" onClick={() => setDeactivateTarget(t)}><X className="h-3.5 w-3.5" /></Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={9} className="text-center py-10 text-muted-foreground text-sm">No terminals found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ── SESSION LOGS TAB ── */}
        <TabsContent value="session-logs" className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-52">
              <SearchableMultiSelect
                placeholder="All Terminals"
                options={allTerminals.map(t => ({ id: t.id, label: `${t.terminalCode} — ${t.name}` }))}
                selected={slTerminal}
                onChange={setSlTerminal}
              />
            </div>
            <div className="w-36">
              <SearchableMultiSelect
                placeholder="All Sessions"
                options={[
                  { id: "open", label: "Open" },
                  { id: "closed", label: "Closed" },
                ]}
                selected={slStatus}
                onChange={setSlStatus}
              />
            </div>
            <DateRangeField from={slDateFrom} to={slDateTo} onFromChange={setSlDateFrom} onToChange={setSlDateTo} />
            {hasSessionLogFilters && (
              <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-xs" onClick={clearSessionLogFilters}>
                <X className="h-3.5 w-3.5" /> Clear Filters
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">{sessionLogs.length} session{sessionLogs.length !== 1 ? "s" : ""}</span>
          </div>

          {canForceCloseShifts && (
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Force close sessions open longer than</span>
              <Input
                type="number"
                min="1"
                value={forceCloseHours}
                onChange={e => setForceCloseHours(e.target.value)}
                className="h-8 w-20"
              />
              <span className="text-xs text-muted-foreground">hours</span>
              <Button size="sm" variant="destructive" className="h-8 ml-1" disabled={forceClosing} onClick={handleBulkForceClose}>
                {forceClosing ? "Closing…" : "Force Close"}
              </Button>
            </div>
          )}

          {logsLoading ? (
            <div className="text-muted-foreground text-sm">Loading…</div>
          ) : (
            <Card className="overflow-hidden border-border/60 shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border/60 text-start text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-3 font-semibold">Terminal</th>
                      <th className="px-3 py-3 font-semibold">Branch</th>
                      <th className="px-3 py-3 font-semibold">Cashier</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold">Opened At</th>
                      <th className="px-3 py-3 font-semibold">Closed At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionLogs.map(s => {
                      const term = allTerminals.find(t => t.id === s.terminalId);
                      return (
                        <tr key={s.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                          <td className="px-3 py-3">
                            <div className="font-mono text-xs font-bold text-primary">{s.terminal?.terminalCode ?? term?.terminalCode ?? "—"}</div>
                            <div className="text-[10px] text-muted-foreground">{s.terminal?.name ?? term?.name ?? ""}</div>
                          </td>
                          <td className="px-3 py-3 text-xs">{term?.branch?.name ?? "—"}</td>
                          <td className="px-3 py-3">
                            {s.cashier ? (
                              <div className="flex items-center gap-1.5">
                                <div className="h-6 w-6 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-[9px] font-bold flex-shrink-0">
                                  {s.cashier.fullName.split(" ").map(p => p[0]).slice(0, 2).join("")}
                                </div>
                                <span className="text-xs font-medium">{s.cashier.fullName}</span>
                              </div>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-3">
                            {s.status === "open" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 text-success border border-success/30 px-2 py-0.5 text-[10px] font-semibold">
                                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> Open
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground border border-border px-2 py-0.5 text-[10px] font-semibold">
                                Closed
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-xs tabular-nums">
                            <div className="flex items-center gap-1 text-success">
                              <LogIn className="h-3 w-3 flex-shrink-0" />
                              {fmtDT(s.openedAt)}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-xs tabular-nums">
                            {s.closedAt ? (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <LogOut className="h-3 w-3 flex-shrink-0" />
                                {fmtDT(s.closedAt)}
                              </div>
                            ) : <span className="text-muted-foreground italic">Active</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {sessionLogs.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">No sessions found. Check in a cashier to see data here.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* View sheet */}
      <Sheet open={!!viewTerm} onOpenChange={v => !v && setViewTerm(null)}>
        <SheetContent className="w-[440px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-primary" />
              {viewTerm?.terminalCode} — {viewTerm?.name}
            </SheetTitle>
          </SheetHeader>
          {viewTerm && (() => {
            const viewTermShifts = allShifts.filter(s => s.terminalId === viewTerm.id);
            const viewShift = viewTermShifts.find(s => s.status === "open") ?? null;
            const allLogEntries = buildSyncLog(viewTerm, viewTermShifts);
            const logEntries = syncLogFilter === "all" ? allLogEntries : allLogEntries.filter(e => e.type === syncLogFilter);
            return (
            <Tabs defaultValue="info" className="mt-4">
              <TabsList>
                <TabsTrigger value="info">Info</TabsTrigger>
                <TabsTrigger value="session">Session</TabsTrigger>
                <TabsTrigger value="synclog">Sync Log</TabsTrigger>
              </TabsList>
              <TabsContent value="info" className="mt-4 space-y-3">
                <Row label="Code" value={viewTerm.terminalCode} />
                <Row label="Name" value={viewTerm.name} />
                <Row label="Branch" value={viewTerm.branch?.name ?? "—"} />
                <Row label="Assigned Cashier" value={viewTerm.assignedCashier?.fullName ?? "Unassigned"} />
                <Row label="Active Shift Cashier" value={viewShift?.cashier?.fullName ?? "—"} />
                <Row label="Status" value={viewTerm.status} />
                <Row label="Last Sync" value={(() => {
                  const eff = getEffectiveLastSync(viewTerm, allShifts.filter(s => s.terminalId === viewTerm.id));
                  return eff ? `${relTime(eff)} · ${toUtc(eff).toLocaleString("en-SA", KSA)}` : "Never synced";
                })()} />
                {viewTerm.uptimeMinutes != null && <Row label="Uptime" value={`${Math.floor(viewTerm.uptimeMinutes / 60)}h ${viewTerm.uptimeMinutes % 60}m`} />}
              </TabsContent>
              <TabsContent value="session" className="mt-4">
                <div className="rounded-xl border border-border/60 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Activity className={`h-4 w-4 ${viewShift ? "text-success" : "text-muted-foreground"}`} />
                    {viewShift ? "Session Active" : "No Active Session"}
                  </div>
                  <p className="text-xs text-muted-foreground">Cashier: {viewShift?.cashier?.fullName ?? viewTerm.assignedCashier?.fullName ?? "—"}</p>
                  {viewShift && (
                    <p className="text-xs text-muted-foreground">
                      Opened: {toUtc(viewShift.openedAt).toLocaleString("en-SA", KSA)}
                    </p>
                  )}
                </div>
              </TabsContent>
              <TabsContent value="synclog" className="mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Select value={syncLogFilter} onValueChange={setSyncLogFilter}>
                    <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Events</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="warn">Warning</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-[11px] text-muted-foreground">{logEntries.length} event{logEntries.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="space-y-1">
                  {logEntries.map((entry, i) => {
                    const Icon = LOG_ICON[entry.type];
                    return (
                      <div key={i} className="flex items-start gap-3 py-2.5 border-b border-border/30 last:border-0">
                        <div className="flex-shrink-0 mt-0.5">
                          <Icon className={`h-3.5 w-3.5 ${LOG_COLOR[entry.type]}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-semibold ${LOG_COLOR[entry.type]}`}>{entry.event}</p>
                          <p className="text-[11px] text-muted-foreground">{entry.detail}</p>
                        </div>
                        <div className="flex-shrink-0 text-end">
                          <p className="text-[10px] text-muted-foreground tabular-nums">{relTime(entry.time)}</p>
                          <p className="text-[10px] text-muted-foreground/60">{toUtc(entry.time).toLocaleTimeString("en-SA", { ...KSA, hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
            </Tabs>
          );
          })()}
        </SheetContent>
      </Sheet>

      {/* Edit sheet */}
      <Sheet open={!!editTerm} onOpenChange={v => !v && setEditTerm(null)}>
        <SheetContent>
          <SheetHeader><SheetTitle>Edit Terminal</SheetTitle></SheetHeader>
          <TerminalFormFields form={form} set={set} setS={setS} branches={branches} users={cashiers} saving={saving} onSave={handleSave} />
        </SheetContent>
      </Sheet>

      {/* Create sheet */}
      <Sheet open={createOpen} onOpenChange={v => !v && setCreateOpen(false)}>
        <SheetContent>
          <SheetHeader><SheetTitle>Add Terminal</SheetTitle></SheetHeader>
          <TerminalFormFields form={form} set={set} setS={setS} branches={branches} users={cashiers} saving={saving} onSave={handleSave} limitBlocked={createLimitBlocked} />
        </SheetContent>
      </Sheet>

      {/* Self-checkout kiosk pairing sheet */}
      <Sheet open={!!kioskTerm} onOpenChange={v => { if (!v) { setKioskTerm(null); setKioskSecret(null); setCustomSecretInput(""); setLockdownPin(""); } }}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Self-Checkout Pairing — {kioskTerm?.terminalCode}
            </SheetTitle>
          </SheetHeader>
          {!kioskUnlocked ? (
            <div className="mt-4"><LockedFeatureNotice feature="Self-Service Kiosk" /></div>
          ) : <>
          <div className="mt-4 space-y-4">
            {!kioskSecret && (
              <p className="text-sm text-muted-foreground">
                {kioskTerm?.pairingSecretSetAt
                  ? `This terminal was last paired ${fmtDT(kioskTerm.pairingSecretSetAt)}. Generating a new code invalidates that one — the kiosk will need to be re-paired.`
                  : "Generate a one-time terminal code and pairing secret, then enter both into the kiosk's setup screen."}
              </p>
            )}
            {kioskSecret ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/20 px-3 py-2.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  This secret is shown once and can't be retrieved again — enter it into the kiosk now, or generate a new one later if it's lost.
                </div>
                <KioskCredentialField label="Terminal Code" value={kioskSecret.terminalCode} />
                <KioskCredentialField label="Pairing Secret" value={kioskSecret.pairingSecret} mono />
                <Button variant="outline" className="w-full" onClick={() => setKioskTerm(null)}>Done</Button>
              </div>
            ) : (
              <div className="space-y-2">
                <FieldRow label="Custom secret (optional)">
                  <Input
                    value={customSecretInput}
                    onChange={e => setCustomSecretInput(e.target.value)}
                    placeholder="Leave blank to generate a random secret"
                    className="h-9 font-mono"
                  />
                </FieldRow>
                <p className="text-xs text-muted-foreground">
                  Set your own easy-to-type secret (min 6 characters), or leave this blank for a random one.
                </p>
                <Button className="w-full gradient-primary text-primary-foreground border-0" disabled={kioskGenerating} onClick={handleGenerateKioskCode}>
                  {kioskGenerating
                    ? "Generating…"
                    : customSecretInput.trim()
                      ? "Set Custom Secret"
                      : kioskTerm?.pairingSecretSetAt ? "Regenerate Pairing Code" : "Generate Pairing Code"}
                </Button>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-border/60 space-y-3">
            <div>
              <p className="text-sm font-semibold flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-primary" /> Fullscreen Lockdown PIN</p>
              <p className="text-xs text-muted-foreground mt-1">
                {kioskTerm?.kioskLockdownPinSetAt
                  ? `${kioskTerm.kioskLockdownPinLength ?? "?"}-digit PIN set ${fmtDT(kioskTerm.kioskLockdownPinSetAt)}. Staff enter this on the kiosk (via its hidden shortcut) to enter or exit fullscreen lockdown.`
                  : "Not configured yet — the kiosk's fullscreen-lockdown shortcut won't do anything until a PIN is set here."}
              </p>
            </div>
            <div className="flex gap-1.5">
              <Input
                value={lockdownPin}
                onChange={e => setLockdownPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="4-6 digit PIN"
                inputMode="numeric"
                className="h-9 font-mono flex-1"
              />
              <Button size="sm" className="h-9 shrink-0" disabled={lockdownSaving || lockdownPin.length < 4} onClick={handleSetLockdownPin}>
                {lockdownSaving ? "Saving…" : kioskTerm?.kioskLockdownPinSetAt ? "Update" : "Set PIN"}
              </Button>
            </div>
            {kioskTerm?.kioskLockdownPinSetAt && (
              <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive" disabled={lockdownSaving} onClick={handleClearLockdownPin}>
                Remove PIN (disables lockdown)
              </Button>
            )}
          </div>
          </>}
        </SheetContent>
      </Sheet>

      <Dialog open={!!deactivateTarget} onOpenChange={v => !v && setDeactivateTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Deactivate Terminal</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mt-1">
            Deactivate terminal <span className="font-semibold text-foreground">{deactivateTarget?.name}</span>?
          </p>
          <div className="flex gap-2 pt-3">
            <Button variant="outline" className="flex-1" onClick={() => setDeactivateTarget(null)} disabled={deactivating}>Cancel</Button>
            <Button variant="destructive" className="flex-1" onClick={handleDeactivate} disabled={deactivating}>
              {deactivating ? "Deactivating…" : "Deactivate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
