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
import {
  Plus, Search, Star, Phone, Mail, ShoppingBag, TrendingUp,
  ChevronRight, Loader2, ArrowUpCircle, ArrowDownCircle, Gift, X,
} from "lucide-react";
import { api, type Customer, type LoyaltyTransaction } from "@/lib/api";
import { SARIcon } from "@/lib/currency";
import { usePermission } from "@/lib/use-permission";

export const Route = createFileRoute("/_app/customers")({ component: Customers });

// ─── Tier config ──────────────────────────────────────────────────────────────
const TIERS = [
  { key: "standard", label: "Standard", min: 0,     next: 1000,  color: "bg-muted text-muted-foreground",                          bar: "bg-gray-400" },
  { key: "silver",   label: "Silver",   min: 1000,  next: 5000,  color: "bg-slate-100 text-slate-600 dark:bg-slate-800",           bar: "bg-slate-400" },
  { key: "gold",     label: "Gold",     min: 5000,  next: 10000, color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30",     bar: "bg-yellow-400" },
  { key: "platinum", label: "Platinum", min: 10000, next: null,  color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30",     bar: "bg-purple-500" },
];

function tierFor(spend: number) {
  return [...TIERS].reverse().find(t => spend >= t.min) ?? TIERS[0];
}

function TierBadge({ tier }: { tier: string }) {
  const t = TIERS.find(t => t.key === tier) ?? TIERS[0];
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${t.color}`}>
      {t.label}
    </span>
  );
}

function TierProgress({ spend }: { spend: number }) {
  const current = tierFor(spend);
  const next = TIERS.find(t => t.min === current.next);
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
function CustomerDetail({ customer, onEdit }: { customer: Customer; onEdit: () => void }) {
  const { canEdit } = usePermission("Customers");
  const [history, setHistory] = useState<LoyaltyTransaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    setLoadingHistory(true);
    api.getCustomerLoyalty(customer.id)
      .then(setHistory)
      .catch(() => setHistory([]))
      .finally(() => setLoadingHistory(false));
  }, [customer.id]);

  const txIcon = (type: string) => {
    if (type === "earn") return <ArrowUpCircle className="h-4 w-4 text-green-500 shrink-0" />;
    if (type === "redeem") return <ArrowDownCircle className="h-4 w-4 text-red-500 shrink-0" />;
    return <Gift className="h-4 w-4 text-purple-500 shrink-0" />;
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
          <TierBadge tier={customer.tier} />
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
            <p className="text-xs text-muted-foreground">Loyalty Points</p>
            <p className="text-3xl font-bold text-primary tabular-nums">
              <Star className="h-5 w-5 inline mr-1 text-yellow-500 mb-0.5" />
              {customer.loyaltyBalance.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              ≈ <SARIcon />{(customer.loyaltyBalance / 100).toFixed(2)} discount value
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Total Spend</p>
            <p className="text-lg font-bold tabular-nums">
              <SARIcon />{customer.totalSpend.toLocaleString("en-SA", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
        <TierProgress spend={customer.totalSpend} />
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
                <span className={`font-bold tabular-nums text-sm ${tx.points > 0 ? "text-green-600" : "text-red-500"}`}>
                  {tx.points > 0 ? "+" : ""}{tx.points} pts
                </span>
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
        <Input value={form.fullName} onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))} placeholder="Ahmed Al Mansouri" className="h-9" />
      </CFormField>
      <CFormField label="Phone * (with country code)">
        <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+966501234567" className="h-9" />
      </CFormField>
      <CFormField label="Email *">
        <Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="ahmed@example.com" type="email" className="h-9" />
      </CFormField>
      <div className="grid grid-cols-2 gap-3">
        <CFormField label="Tier">
          <Select value={form.tier} onValueChange={v => setForm(p => ({ ...p, tier: v }))}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIERS.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
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

// ─── Main page ────────────────────────────────────────────────────────────────
function Customers() {
  const { canCreate } = usePermission("Customers");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [editTarget, setEditTarget] = useState<Customer | null | "new">(null);

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

  const handleSaved = () => {
    setEditTarget(null);
    setSelected(null);
    load();
  };

  return (
    <PageShell title="Customers" subtitle="Loyalty tiers, spend tracking and customer profiles">
      {loadError && <LoadErrorBanner onRetry={load} />}
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Customers", value: filtered.length, icon: <ShoppingBag className="h-4 w-4" /> },
          { label: "Total Spend", value: <><SARIcon />{totalSpend.toLocaleString("en-SA", { maximumFractionDigits: 0 })}</>, icon: <TrendingUp className="h-4 w-4" /> },
          { label: "Loyalty Points", value: totalLoyalty.toLocaleString(), icon: <Star className="h-4 w-4" /> },
          { label: "Platinum Members", value: platinum, icon: <Star className="h-4 w-4 text-purple-500" /> },
        ].map(s => (
          <Card key={s.label} className="p-4 border-border/60 shadow-card">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">{s.icon}<span className="text-xs">{s.label}</span></div>
            <p className="text-xl font-bold tabular-nums">{s.value}</p>
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
            {TIERS.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Joined:</span>
          <Input type="date" className="h-9 w-36" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" className="h-9 w-36" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" onClick={() => { setDateFrom(""); setDateTo(""); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="flex-1" />
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
                <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
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
                    <td className="px-4 py-3"><TierBadge tier={c.tier} /></td>
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
    </PageShell>
  );
}
