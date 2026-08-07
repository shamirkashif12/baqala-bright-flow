import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { PageShell } from "@/components/app-topbar";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { DateRangeField } from "@/components/report-filters/date-range-field";
import {
  Plus, Search, Star, Phone, Mail, ShoppingBag, TrendingUp,
  ChevronRight, Loader2, ArrowUpCircle, ArrowDownCircle, Gift, X, Clock, RefreshCcw,
} from "lucide-react";
import { api, type Customer, type CustomerTier, type LoyaltyTransaction, type LoyaltyProgram, type Order } from "@/lib/api";
import { TierSingleSelect } from "@/components/tier-multi-select";
import { StatusBadge } from "@/components/module-placeholder";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { usePermission } from "@/lib/use-permission";
import { isValidContactPersonName, sanitizeNameInput, CONTACT_PERSON_MAX_LENGTH } from "@/lib/validation";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/customers")({ component: Customers });

// ─── Tier config ──────────────────────────────────────────────────────────────
// Colors/labels are fixed, but the spend thresholds (min/next) are NOT — they come from the
// business-wide default Loyalty Program (configured on /loyalty-program), the same single rule
// used everywhere tier is computed server-side, so this display never disagrees with reality.
// The numbers below are only the fallback shown before that config loads.
type TierMeta = { key: string; label: string; min: number; next: number | null; color: string; bar: string };
const TIER_META_BASE: Omit<TierMeta, "min" | "next">[] = [
  { key: "standard", label: "Standard", color: "bg-muted text-muted-foreground" /*                */, bar: "bg-gray-400" },
  { key: "silver",   label: "Silver",   color: "bg-slate-100 text-slate-600 dark:bg-slate-800" /*   */, bar: "bg-slate-400" },
  { key: "gold",     label: "Gold",     color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30", bar: "bg-yellow-400" },
  { key: "platinum", label: "Platinum", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30", bar: "bg-purple-500" },
];

function buildTiers(program: LoyaltyProgram | null): TierMeta[] {
  const silver = program?.silverThreshold ?? 1000;
  const gold = program?.goldThreshold ?? 5000;
  const platinum = program?.platinumThreshold ?? 10000;
  const mins = [0, silver, gold, platinum];
  const nexts: (number | null)[] = [silver, gold, platinum, null];
  return TIER_META_BASE.map((t, i) => ({ ...t, min: mins[i], next: nexts[i] }));
}

function tierFor(spend: number, tiers: TierMeta[]) {
  return [...tiers].reverse().find(t => spend >= t.min) ?? tiers[0];
}

function TierBadge({ tier, tiers }: { tier: string; tiers: TierMeta[] }) {
  const t = tiers.find(t => t.key === tier) ?? tiers[0];
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${t.color}`}>
      {t.label}
    </span>
  );
}

function TierProgress({ spend, tiers }: { spend: number; tiers: TierMeta[] }) {
  const current = tierFor(spend, tiers);
  const next = tiers.find(t => t.min === current.next);
  if (!next) return <p className="text-xs text-purple-600 font-medium">Maximum tier reached 🎉</p>;
  const pct = Math.min(100, ((spend - current.min) / (current.next! - current.min)) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className="capitalize">{current.label}</span>
        <span className="capitalize">{next.label} at <SARIcon />{next.min.toLocaleString()}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${current.bar}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        <SARIcon />{(next.min - spend).toLocaleString("en-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} more to reach {next.label}
      </p>
    </div>
  );
}

// ─── Customer detail drawer ───────────────────────────────────────────────────
function CustomerDetail({ customer, tiers, onEdit }: { customer: Customer; tiers: TierMeta[]; onEdit: () => void }) {
  const { canEdit } = usePermission("Customers");
  const [history, setHistory] = useState<LoyaltyTransaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [program, setProgram] = useState<LoyaltyProgram | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);

  useEffect(() => {
    setLoadingHistory(true);
    api.getCustomerLoyalty(customer.id)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
  }, [customer.id]);

  useEffect(() => {
    setLoadingOrders(true);
    api.getOrders({ customerId: customer.id })
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoadingOrders(false));
  }, [customer.id]);

  useEffect(() => {
    setProgram(null);
    if (!customer.preferredBranchId) return;
    api.getEffectiveLoyaltyProgram(customer.preferredBranchId).then(setProgram).catch(() => setProgram(null));
  }, [customer.preferredBranchId]);

  const redemptionRate = program?.redemptionValuePerPoint ?? 0.01; // falls back to the legacy /100 display

  const txIcon = (type: string) => {
    if (type === "earn") return <ArrowUpCircle className="h-4 w-4 text-green-500 shrink-0" />;
    if (type === "redeem") return <ArrowDownCircle className="h-4 w-4 text-red-500 shrink-0" />;
    if (type === "expire") return <Clock className="h-4 w-4 text-muted-foreground shrink-0" />;
    if (type === "adjust") return <RefreshCcw className="h-4 w-4 text-blue-500 shrink-0" />;
    return <Gift className="h-4 w-4 text-purple-500 shrink-0" />; // welcome | birthday
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="font-bold text-lg">{customer.fullName}</p>
          <p className="text-xs text-muted-foreground font-mono">{customer.customerCode}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <TierBadge tier={customer.tier} tiers={tiers} />
          <Badge variant="outline" className={customer.status === "active" ? "text-green-600 border-green-400/40 text-xs" : "text-xs"}>
            {customer.status}
          </Badge>
        </div>
      </div>

      {/* Contact */}
      <div className="space-y-1.5 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Phone className="h-3.5 w-3.5" /><span>{customer.phone}</span>
        </div>
        {customer.email && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="h-3.5 w-3.5" /><span>{customer.email}</span>
          </div>
        )}
        {customer.createdAt && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Gift className="h-3.5 w-3.5" />
            <span>Member since {new Date(customer.createdAt).toLocaleDateString("en-SA", { year: "numeric", month: "short", day: "numeric" })}</span>
          </div>
        )}
      </div>

      <Separator />

      {/* Loyalty balance */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Loyalty Points</p>
            <p className="text-3xl font-bold tracking-tight text-primary tabular-nums mt-1">
              <Star className="h-5 w-5 inline mr-1 text-yellow-500 mb-0.5" />
              {customer.loyaltyBalance.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              ≈ <SARIcon />{(customer.loyaltyBalance * redemptionRate).toFixed(2)} discount value
            </p>
          </div>
          <div className="text-end">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Total Spend</p>
            <p className="text-3xl font-bold tracking-tight tabular-nums mt-1">
              <SARIcon />{customer.totalSpend.toLocaleString("en-SA", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
        <TierProgress spend={customer.totalSpend} tiers={tiers} />
      </div>

      <Separator />

      {/* Loyalty history */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Points History
        </p>
        {loadingHistory ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground italic text-center py-4">
            No transactions yet. Points are earned automatically on each purchase.
          </p>
        ) : (
          <div className="space-y-2">
            {history.map(tx => (
              <div key={tx.id} className="flex items-center gap-3 text-sm bg-muted/30 rounded-lg px-3 py-2.5">
                {txIcon(tx.transactionType)}
                <div className="flex-1 min-w-0">
                  <p className="font-medium capitalize truncate">{tx.description ?? tx.transactionType}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(tx.createdAt).toLocaleDateString("en-SA", { dateStyle: "medium" })}
                    {" · "}Balance after: {tx.balanceAfter.toLocaleString()} pts
                  </p>
                </div>
                <div className="text-end">
                  <span className={`font-bold tabular-nums text-sm block ${tx.points > 0 ? "text-green-600" : "text-red-500"}`}>
                    {tx.points > 0 ? "+" : ""}{tx.points} pts
                  </span>
                  {tx.monetaryValue != null && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      <SARIcon />{tx.monetaryValue.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* Order history */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Orders ({orders.length})
        </p>
        {loadingOrders ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : orders.length === 0 ? (
          <p className="text-sm text-muted-foreground italic text-center py-4">
            No orders yet for this customer.
          </p>
        ) : (
          <div className="space-y-2">
            {orders.map(o => (
              <div key={o.id} className="flex items-center gap-3 text-sm bg-muted/30 rounded-lg px-3 py-2.5">
                <ShoppingBag className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-mono font-medium text-xs truncate">{o.orderNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(o.createdAt).toLocaleDateString("en-SA", { dateStyle: "medium" })}
                    {o.branch?.name ? ` · ${o.branch.name}` : ""}
                  </p>
                </div>
                <div className="text-end">
                  <span className="font-bold tabular-nums text-sm block"><SARIcon />{fmtSAR(o.totalAmount)}</span>
                  <StatusBadge status={o.orderStatus} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      {canEdit && (
        <Button variant="outline" className="w-full gap-2" onClick={onEdit}>
          Edit Customer Profile
        </Button>
      )}
    </div>
  );
}

// ─── Edit / Create form ───────────────────────────────────────────────────────
// Kept in sync with the backend's format check in CustomersController (E.164 international or
// bare Saudi mobile — matches what this business actually has on file: local numbers entered
// without a country code, and foreign customers' numbers entered in full E.164 form).
const PHONE_RE = /^(\+[1-9]\d{7,14}|05\d{8})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_INPUT_MAX_LENGTH = 16; // "+" plus up to 15 digits (E.164 max)

// Digits only, plus a single leading "+" for international numbers — filters out letters and
// other characters as-typed instead of only catching them in the error message afterward.
function sanitizeCustomerPhone(value: string): string {
  return (value[0] === "+" ? "+" : "") + value.replace(/\D/g, "").slice(0, PHONE_INPUT_MAX_LENGTH - 1);
}

type CustomerForm = { fullName: string; phone: string; email: string; tier: string; status: string };
const emptyForm: CustomerForm = { fullName: "", phone: "", email: "", tier: "standard", status: "active" };

function CFormField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

function CustomerForm({ editing, onSaved, onCancel }: {
  editing: Customer | null; onSaved: () => void; onCancel: () => void;
}) {
  const [form, setForm] = useState<CustomerForm>(
    editing
      ? { fullName: editing.fullName, phone: editing.phone, email: editing.email ?? "", tier: editing.tier, status: editing.status }
      : emptyForm
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!form.fullName.trim() || !form.phone.trim() || !form.email.trim()) {
      setError("Full name, phone and email are required.");
      return;
    }
    if (!isValidContactPersonName(form.fullName)) {
      setError("Enter a valid full name (letters only).");
      return;
    }
    if (!PHONE_RE.test(form.phone.trim())) {
      setError("Enter a valid phone number, e.g. +966501234567 or 0501234567.");
      return;
    }
    if (!EMAIL_RE.test(form.email.trim())) {
      setError("Enter a valid email address, e.g. name@example.com.");
      return;
    }
    setSaving(true); setError(null);
    try {
      if (editing) {
        await api.updateCustomer(editing.id, { fullName: form.fullName.trim(), phone: form.phone.trim(), email: form.email.trim(), tier: form.tier, status: form.status });
      } else {
        await api.createCustomer({ fullName: form.fullName.trim(), phone: form.phone.trim(), email: form.email.trim(), tier: form.tier, status: form.status, customerCode: `CUST-${Date.now().toString().slice(-6)}` });
      }
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4 mt-4">
      <CFormField label="Full Name *">
        <Input value={form.fullName} onChange={e => setForm(p => ({ ...p, fullName: sanitizeNameInput(e.target.value) }))} placeholder="Ahmed Al Mansouri" className="h-9" maxLength={CONTACT_PERSON_MAX_LENGTH} />
      </CFormField>
      <CFormField label="Phone * (with country code)">
        <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: sanitizeCustomerPhone(e.target.value) }))} placeholder="+966501234567" className="h-9" maxLength={PHONE_INPUT_MAX_LENGTH} inputMode="tel" />
      </CFormField>
      <CFormField label="Email *">
        <Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="ahmed@example.com" type="email" className="h-9" />
      </CFormField>
      <div className="grid grid-cols-2 gap-3">
        <CFormField label="Tier">
          <TierSingleSelect value={form.tier as CustomerTier} onChange={v => setForm(p => ({ ...p, tier: v }))} />
        </CFormField>
        <CFormField label="Status">
          <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </CFormField>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button className="flex-1 gradient-primary text-primary-foreground border-0" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : editing ? "Update" : "Add Customer"}
        </Button>
        <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ─── Duplicate customer cleanup ────────────────────────────────────────────────
function DuplicateGroupCard({ group, onChanged }: {
  group: { name: string; customers: Customer[] }; onChanged: () => void;
}) {
  const [primaryId, setPrimaryId] = useState(group.customers[0].id);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const merge = async () => {
    setMerging(true); setError(null);
    try {
      await api.mergeCustomers(primaryId, group.customers.filter(c => c.id !== primaryId).map(c => c.id));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to merge.");
      setMerging(false);
    }
  };

  return (
    <div className="rounded-lg border border-border/60 p-3 space-y-2">
      <p className="text-sm font-semibold">
        {group.name} <span className="text-xs text-muted-foreground font-normal">({group.customers.length} records)</span>
      </p>
      <div className="space-y-1.5">
        {group.customers.map(c => (
          <label key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs cursor-pointer">
            <input type="radio" name={`primary-${group.name}`} checked={primaryId === c.id} onChange={() => setPrimaryId(c.id)} />
            <span className="font-mono text-muted-foreground">{c.customerCode}</span>
            <span>{c.phone}</span>
            {c.email && <span className="text-muted-foreground">{c.email}</span>}
            <span className="text-muted-foreground"><SARIcon />{c.totalSpend.toLocaleString()} spent</span>
            {primaryId === c.id && <Badge variant="outline" className="text-[10px] border-green-400/40 text-green-600">Keep this one</Badge>}
          </label>
        ))}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={merge} disabled={merging}>
        {merging ? "Merging…" : "Merge into selected"}
      </Button>
    </div>
  );
}

function FlaggedCustomerRow({ customer, onChanged }: { customer: Customer; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    if (!confirm(`Delete "${customer.fullName || customer.phone}"? This can't be undone.`)) return;
    setBusy(true); setError(null);
    try {
      await api.deleteCustomer(customer.id);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete.");
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 p-2.5 text-xs">
      <div className="min-w-0">
        <p className="font-medium truncate">{customer.fullName.trim() || <span className="italic text-muted-foreground">No name</span>}</p>
        <p className="text-muted-foreground truncate">{customer.phone}{customer.email ? ` · ${customer.email}` : ""}</p>
        {error && <p className="text-destructive mt-1">{error}</p>}
      </div>
      <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/30 shrink-0" onClick={remove} disabled={busy}>
        {busy ? "Deleting…" : "Delete"}
      </Button>
    </div>
  );
}

function DuplicatesPanel({ onClose }: { onClose: () => void }) {
  const [groups, setGroups] = useState<{ name: string; customers: Customer[] }[]>([]);
  const [flagged, setFlagged] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.getCustomerDuplicates()
      .then(r => { setGroups(r.groups); setFlagged(r.flagged); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Scanning for duplicates…
      </div>
    );
  }

  return (
    <div className="space-y-6 mt-2">
      {groups.length === 0 && flagged.length === 0 && (
        <p className="text-sm text-muted-foreground italic text-center py-8">No duplicate or low-quality customer records found.</p>
      )}
      {groups.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Duplicate name matches ({groups.length})
          </p>
          <div className="space-y-2">
            {groups.map(g => <DuplicateGroupCard key={g.name} group={g} onChanged={load} />)}
          </div>
        </div>
      )}
      {flagged.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Low-quality records ({flagged.length})
          </p>
          <p className="text-xs text-muted-foreground">Missing/near-empty name or an invalid phone number.</p>
          <div className="space-y-2">
            {flagged.map(c => <FlaggedCustomerRow key={c.id} customer={c} onChanged={load} />)}
          </div>
        </div>
      )}
      <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
function Customers() {
  const { canCreate, canDelete } = usePermission("Customers");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [editTarget, setEditTarget] = useState<Customer | null | "new">(null);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [tierProgram, setTierProgram] = useState<LoyaltyProgram | null>(null);
  const tiers = buildTiers(tierProgram);

  useEffect(() => {
    // Tier thresholds are business-wide (the default, branch-less program) — fetched once here
    // rather than per-customer, since every customer's tier badge/progress uses the same rule.
    api.getLoyaltyPrograms().then(list => setTierProgram(list.find(p => !p.branchId) ?? null)).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    api.getCustomers({
      tier: tierFilter !== "all" ? tierFilter : undefined,
      search: q || undefined,
    }).then(cs => { setCustomers(cs); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [tierFilter, q]);

  useEffect(() => { load(); }, [load]);

  // Client-side date filtering only (BE doesn't support createdAt filter yet)
  const filtered = customers.filter(c => {
    const mdf = !dateFrom || (!!c.createdAt && c.createdAt >= dateFrom);
    const mdt = !dateTo || (!!c.createdAt && c.createdAt <= dateTo + "T23:59:59");
    return mdf && mdt;
  });

  const totalSpend = filtered.reduce((s, c) => s + c.totalSpend, 0);
  const totalLoyalty = filtered.reduce((s, c) => s + c.loyaltyBalance, 0);
  const platinum = filtered.filter(c => c.tier === "platinum").length;

  const hasFilters = !!(q || tierFilter !== "all" || dateFrom || dateTo);
  const clearFilters = () => {
    setQ(""); setTierFilter("all"); setDateFrom(""); setDateTo("");
  };

  const handleSaved = () => {
    setEditTarget(null);
    setSelected(null);
    load();
  };

  const closeDuplicates = () => {
    setDuplicatesOpen(false);
    load();
  };

  return (
    <PageShell title="Customers" subtitle="Loyalty tiers, spend tracking and customer profiles">
      {loadError && <LoadErrorBanner onRetry={load} />}
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Customers", value: filtered.length, icon: <ShoppingBag className="h-4 w-4" />, onClick: () => setTierFilter("all"), active: tierFilter === "all" },
          { label: "Total Spend", value: <><SARIcon />{totalSpend.toLocaleString("en-SA", { maximumFractionDigits: 0 })}</>, icon: <TrendingUp className="h-4 w-4" /> },
          { label: "Loyalty Points", value: totalLoyalty.toLocaleString(), icon: <Star className="h-4 w-4" /> },
          { label: "Platinum Members", value: platinum, icon: <Star className="h-4 w-4 text-purple-500" />, onClick: () => setTierFilter(v => v === "platinum" ? "all" : "platinum"), active: tierFilter === "platinum" },
        ].map(s => (
          <Card
            key={s.label}
            onClick={s.onClick}
            className={cn(
              "p-4 border-border/60 shadow-card",
              s.onClick && "cursor-pointer transition-all hover:ring-2 hover:ring-primary/30",
              s.active && "ring-2 ring-primary",
            )}
          >
            <div className="flex items-center gap-2 text-muted-foreground mb-1">{s.icon}<span className="text-[11px] font-medium uppercase tracking-wide">{s.label}</span></div>
            <p className="text-2xl md:text-3xl font-bold tracking-tight tabular-nums">{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, phone, code…" className="h-9 w-64 pl-8" />
        </div>
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Tier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tiers</SelectItem>
            {TIER_META_BASE.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <DateRangeField from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} prefixLabel="Joined:" className="h-9 w-36" />
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-xs" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" /> Clear Filters
          </Button>
        )}
        <div className="flex-1" />
        {canDelete && (
          <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={() => setDuplicatesOpen(true)}>
            Merge Duplicates
          </Button>
        )}
        {canCreate && (
          <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9" onClick={() => setEditTarget("new")}>
            <Plus className="h-4 w-4" /> Add Customer
          </Button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading customers…
        </div>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-start text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Contact</th>
                  <th className="px-4 py-3 font-semibold">Tier</th>
                  <th className="px-4 py-3 font-semibold">Loyalty Pts</th>
                  <th className="px-4 py-3 font-semibold">Total Spend</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0 cursor-pointer transition-colors" onClick={() => setSelected(c)}>
                    <td className="px-4 py-3">
                      <p className="font-semibold">{c.fullName}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">{c.customerCode}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-xs"><Phone className="h-3 w-3 text-muted-foreground" />{c.phone}</div>
                      {c.email && <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5"><Mail className="h-3 w-3" />{c.email}</div>}
                    </td>
                    <td className="px-4 py-3"><TierBadge tier={c.tier} tiers={tiers} /></td>
                    <td className="px-4 py-3 tabular-nums font-medium">
                      <Star className="h-3 w-3 inline mr-1 text-yellow-500" />{c.loyaltyBalance.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 tabular-nums font-semibold">
                      <SARIcon />{c.totalSpend.toLocaleString("en-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={c.status === "active" ? "text-green-600 border-green-400/40 text-xs" : "text-xs"}>{c.status}</Badge>
                    </td>
                    <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-muted-foreground" /></td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">No customers found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Customer detail drawer */}
      <Sheet open={!!selected && !editTarget} onOpenChange={v => !v && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2"><Star className="h-4 w-4 text-yellow-500" /> Customer Profile</SheetTitle>
          </SheetHeader>
          {selected && (
            <CustomerDetail
              customer={selected}
              tiers={tiers}
              onEdit={() => setEditTarget(selected)}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Create / Edit drawer */}
      <Sheet open={!!editTarget} onOpenChange={v => !v && setEditTarget(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editTarget === "new" ? "Add Customer" : "Edit Customer"}</SheetTitle>
          </SheetHeader>
          <CustomerForm
            editing={editTarget === "new" ? null : editTarget}
            onSaved={handleSaved}
            onCancel={() => setEditTarget(null)}
          />
        </SheetContent>
      </Sheet>

      {/* Merge duplicates drawer — refresh the main list on ANY close path (X button, Escape,
          overlay click, or the panel's own Close button), not just the in-panel button, since
          merges/deletes done inside can change what this list shows. */}
      <Sheet
        open={duplicatesOpen}
        onOpenChange={v => { if (v) setDuplicatesOpen(true); else closeDuplicates(); }}
      >
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Merge Duplicate Customers</SheetTitle>
          </SheetHeader>
          {duplicatesOpen && <DuplicatesPanel onClose={closeDuplicates} />}
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
