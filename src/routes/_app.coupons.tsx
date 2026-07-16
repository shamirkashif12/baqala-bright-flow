import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gift, Pencil, Power, Trash2, Plus, Tag, PercentCircle, TicketCheck, Zap, X, ChevronDown, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { api, type Coupon, type Discount, type Offer, type Product, type Branch, type Category } from "@/lib/api";
import { SARIcon } from "@/lib/currency";
import { usePermission } from "@/lib/use-permission";
import { localDateStr } from "@/lib/utils";

export const Route = createFileRoute("/_app/coupons")({ component: Coupons });

const today = localDateStr();
const nextMonthDate = new Date();
nextMonthDate.setDate(nextMonthDate.getDate() + 30);
const nextMonth = localDateStr(nextMonthDate);

// A coupon/discount/offer whose end date is already in the past is dead on arrival — the end
// date must be today or later, and can't be before its own start date. Used by all three forms
// below (Coupons, Discounts, Offers), which each carry the same start/end validity period.
function validityRangeError(startDate: string, endDate: string): string | null {
  if (endDate < today) return "End date cannot be in the past.";
  if (startDate && endDate < startDate) return "End date must be on or after the start date.";
  return null;
}

function FL({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function BranchMultiSelect({ branches, value, onChange }: {
  branches: Branch[]; value: string[]; onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  const label = value.length === 0 ? "All Branches"
    : value.length === 1 ? (branches.find(b => b.id === value[0])?.name ?? "1 branch")
    : `${value.length} branches selected`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-left flex items-center justify-between hover:bg-accent/40 transition-colors">
          <span className={value.length === 0 ? "text-muted-foreground" : ""}>{label}</span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-1 w-56">
        {branches.map(b => (
          <div key={b.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer select-none" onClick={() => toggle(b.id)}>
            <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${value.includes(b.id) ? "bg-primary border-primary" : "border-input"}`}>
              {value.includes(b.id) && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
            </div>
            <span className="text-sm">{b.name}</span>
          </div>
        ))}
        {value.length > 0 && (
          <div className="border-t border-border/50 mt-1 pt-1">
            <button type="button" className="w-full text-xs text-muted-foreground px-2 py-1 hover:bg-muted rounded text-left" onClick={() => onChange([])}>
              Clear selection
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Reused by the Discounts tab's "Exclude products" field (category/all/branch-scoped discounts
// carving out specific SKUs) — same interaction pattern as BranchMultiSelect above.
function ProductMultiSelect({ products, value, onChange }: {
  products: Product[]; value: string[]; onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id]);
  const label = value.length === 0 ? "No exclusions"
    : value.length === 1 ? (products.find(p => p.id === value[0])?.name ?? "1 product")
    : `${value.length} products excluded`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-left flex items-center justify-between hover:bg-accent/40 transition-colors">
          <span className={value.length === 0 ? "text-muted-foreground" : ""}>{label}</span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-1 w-64 max-h-64 overflow-y-auto">
        {products.map(p => (
          <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer select-none" onClick={() => toggle(p.id)}>
            <div className={`h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0 ${value.includes(p.id) ? "bg-primary border-primary" : "border-input"}`}>
              {value.includes(p.id) && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
            </div>
            <span className="text-sm truncate">{p.name} <span className="text-muted-foreground text-xs">— {p.sku}</span></span>
          </div>
        ))}
        {value.length > 0 && (
          <div className="border-t border-border/50 mt-1 pt-1">
            <button type="button" className="w-full text-xs text-muted-foreground px-2 py-1 hover:bg-muted rounded text-left" onClick={() => onChange([])}>
              Clear exclusions
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-green-500" : "bg-gray-400"}`} />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

const OFFER_TYPE_COLORS: Record<string, string> = {
  bogo: "bg-purple-100 text-purple-700",
  combo: "bg-blue-100 text-blue-700",
  buy_a_get_b: "bg-amber-100 text-amber-700",
  lucky_draw: "bg-pink-100 text-pink-700",
  product_offer: "bg-teal-100 text-teal-700",
};
const OFFER_TYPE_LABELS: Record<string, string> = {
  bogo: "BOGO",
  combo: "Combo",
  buy_a_get_b: "Buy A Get B",
  lucky_draw: "Lucky Draw",
  product_offer: "Product Offer",
};

function OfferTypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-bold ${OFFER_TYPE_COLORS[type] ?? "bg-gray-100 text-gray-600"}`}>
      {OFFER_TYPE_LABELS[type] ?? type}
    </span>
  );
}

// ─── Coupons Tab ─────────────────────────────────────────────────────────────

type CouponForm = { name: string; code: string; type: string; value: string; startDate: string; endDate: string; usageLimit: string; status: string; };
const emptyCoupon: CouponForm = { name: "", code: "", type: "percentage", value: "", startDate: today, endDate: nextMonth, usageLimit: "", status: "active" };

function CouponsTab() {
  const { canCreate, canEdit, canDelete } = usePermission("Coupons");
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editItem, setEditItem] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponForm>(emptyCoupon);
  const [saving, setSaving] = useState(false);

  const load = () => { setLoading(true); api.getCoupons().then(setCoupons).finally(() => setLoading(false)); };
  useEffect(load, []);

  const openCreate = () => { setEditItem(null); setForm(emptyCoupon); setSheetOpen(true); };
  const openEdit = (c: Coupon) => {
    setEditItem(c);
    setForm({ name: c.name, code: c.code, type: c.type, value: String(c.value), startDate: c.startDate?.slice(0, 10) ?? today, endDate: c.endDate?.slice(0, 10) ?? nextMonth, usageLimit: c.usageLimit != null ? String(c.usageLimit) : "", status: c.status });
    setSheetOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.code) { toast.error("Name and code are required"); return; }
    const rangeError = validityRangeError(form.startDate, form.endDate);
    if (rangeError) { toast.error(rangeError); return; }
    setSaving(true);
    try {
      const payload = { name: form.name, code: form.code.toUpperCase(), type: form.type, value: Number(form.value), startDate: form.startDate, endDate: form.endDate, usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined, status: form.status };
      editItem ? await api.updateCoupon(editItem.id, payload) : await api.createCoupon(payload);
      toast.success(editItem ? "Coupon updated" : "Coupon created");
      setSheetOpen(false); load();
    } catch { toast.error("Failed to save coupon"); } finally { setSaving(false); }
  };

  const handleDelete = async (c: Coupon) => {
    if (!confirm(`Delete coupon "${c.name}"?`)) return;
    await api.deleteCoupon(c.id); toast.success("Deleted"); load();
  };
  const toggleStatus = async (c: Coupon) => {
    await api.updateCoupon(c.id, { ...c, status: c.status === "active" ? "inactive" : "active" }); load();
  };

  const set = (k: keyof CouponForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value }));
  const setS = (k: keyof CouponForm) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  const active = coupons.filter(c => c.status === "active").length;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canCreate && (
          <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-10" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New Coupon
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Active Coupons" value={String(active)} icon={TicketCheck} accent="primary" />
        <MetricCard label="Total Coupons" value={String(coupons.length)} icon={Tag} accent="default" />
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Coupon</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Code</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Value</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Validity</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Usage</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {coupons.map(c => (
                  <tr key={c.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block font-mono text-xs font-bold px-2 py-0.5 rounded bg-violet-100 text-violet-700 tracking-widest">{c.code}</span>
                    </td>
                    <td className="px-4 py-3"><Badge variant="outline" className="text-xs capitalize">{c.type}</Badge></td>
                    <td className="px-4 py-3 font-semibold text-primary">{c.type === "percentage" ? `${c.value}%` : <><SARIcon />{c.value}</>}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.startDate ? new Date(c.startDate).toLocaleDateString("en-SA") : "—"}<br />
                      {c.endDate ? new Date(c.endDate).toLocaleDateString("en-SA") : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-sm">{c.usedCount ?? 0} / {c.usageLimit ?? "∞"}</td>
                    <td className="px-4 py-3">
                      <StatusDot active={c.status === "active"} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>}
                        {canEdit && <Button size="icon" variant="ghost" className={`h-7 w-7 ${c.status === "active" ? "text-destructive" : "text-success"}`} onClick={() => toggleStatus(c)}><Power className="h-3.5 w-3.5" /></Button>}
                        {canDelete && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(c)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {coupons.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">No coupons yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Sheet open={sheetOpen} onOpenChange={v => !v && setSheetOpen(false)}>
        <SheetContent>
          <SheetHeader><SheetTitle>{editItem ? "Edit Coupon" : "Create Coupon"}</SheetTitle></SheetHeader>
          <div className="mt-5 space-y-4 overflow-y-auto max-h-[calc(100vh-120px)] pr-1">
            <FL label="Coupon Name *"><Input value={form.name} onChange={set("name")} className="h-9" placeholder="Summer Sale 2026" /></FL>
            <FL label="Code *"><Input value={form.code} onChange={set("code")} className="h-9 font-mono uppercase" placeholder="SUMMER25" /></FL>
            <div className="grid grid-cols-2 gap-3">
              <FL label="Type">
                <Select value={form.type} onValueChange={setS("type")}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage %</SelectItem>
                    <SelectItem value="fixed">Fixed SAR</SelectItem>
                  </SelectContent>
                </Select>
              </FL>
              <FL label="Value"><Input type="number" value={form.value} onChange={set("value")} className="h-9" placeholder="25" /></FL>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FL label="Start Date"><Input type="date" value={form.startDate} onChange={set("startDate")} className="h-9" /></FL>
              <FL label="End Date"><Input type="date" value={form.endDate} onChange={set("endDate")} min={form.startDate || today} className="h-9" /></FL>
            </div>
            <FL label="Usage Limit (blank = unlimited)"><Input type="number" value={form.usageLimit} onChange={set("usageLimit")} className="h-9" placeholder="∞" /></FL>
            {editItem && (
              <FL label="Status">
                <Select value={form.status} onValueChange={setS("status")}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </FL>
            )}
            <Button className="w-full gradient-primary text-primary-foreground border-0 mt-2" onClick={handleSave} disabled={saving || !form.name || !form.code}>
              {saving ? "Saving…" : "Save Coupon"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Discounts Tab ────────────────────────────────────────────────────────────

type DiscountForm = {
  name: string; appliesTo: string; productId: string; categoryId: string; branchIds: string[];
  discountType: string; value: string; isActive: boolean; startDate: string; endDate: string;
  excludedProductIds: string[]; minCustomerTier: string; requiresCustomer: boolean;
};
const emptyDiscount: DiscountForm = {
  name: "", appliesTo: "all", productId: "", categoryId: "", branchIds: [],
  discountType: "percentage", value: "", isActive: true, startDate: today, endDate: nextMonth,
  excludedProductIds: [], minCustomerTier: "none", requiresCustomer: false,
};

// Customer groups are loyalty tiers (Customer.Tier). Ranked, not arbitrary labels — picking Silver
// means Silver *and above*, which is how the POS evaluates MinCustomerTier at checkout.
const CUSTOMER_TIERS = [
  { value: "standard", label: "Standard & above" },
  { value: "silver", label: "Silver & above" },
  { value: "gold", label: "Gold & above" },
  { value: "platinum", label: "Platinum only" },
];

function DiscountsTab() {
  const { canCreate, canEdit, canDelete } = usePermission("Coupons");
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editItem, setEditItem] = useState<Discount | null>(null);
  const [form, setForm] = useState<DiscountForm>(emptyDiscount);
  const [saving, setSaving] = useState(false);

  const load = () => { setLoading(true); api.getDiscounts().then(setDiscounts).finally(() => setLoading(false)); };
  useEffect(() => {
    load();
    api.getProducts().then(setProducts).catch(() => {});
    api.getCategories().then(setCategories).catch(() => {});
    api.getBranches().then(setBranches).catch(() => {});
  }, []);

  const openCreate = () => { setEditItem(null); setForm(emptyDiscount); setSheetOpen(true); };
  const openEdit = (d: Discount) => {
    setEditItem(d);
    let excludedProductIds: string[] = [];
    try { const parsed = d.excludedProductIdsJson ? JSON.parse(d.excludedProductIdsJson) : []; if (Array.isArray(parsed)) excludedProductIds = parsed; } catch { /* ignore */ }
    setForm({
      name: d.name, appliesTo: d.appliesTo, productId: d.productId ?? "", categoryId: d.categoryId ?? "",
      branchIds: d.branchId ? [d.branchId] : [], discountType: d.discountType, value: String(d.value),
      isActive: d.isActive, startDate: d.startDate?.slice(0, 10) ?? today, endDate: d.endDate?.slice(0, 10) ?? nextMonth,
      excludedProductIds,
      minCustomerTier: d.minCustomerTier ?? "none",
      requiresCustomer: d.requiresCustomer ?? false,
    });
    setSheetOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) { toast.error("Name is required"); return; }
    if (form.appliesTo === "category" && !form.categoryId) { toast.error("Select a category"); return; }
    const rangeError = validityRangeError(form.startDate, form.endDate);
    if (rangeError) { toast.error(rangeError); return; }
    setSaving(true);
    try {
      const base = {
        name: form.name, appliesTo: form.appliesTo,
        productId: form.appliesTo === "product" ? form.productId || undefined : undefined,
        categoryId: form.appliesTo === "category" ? form.categoryId || undefined : undefined,
        discountType: form.discountType, value: Number(form.value),
        isActive: form.isActive,
        startDate: form.startDate || undefined, endDate: form.endDate || undefined,
        excludedProductIds: form.excludedProductIds.length > 0 ? form.excludedProductIds : undefined,
        minCustomerTier: form.minCustomerTier !== "none" ? form.minCustomerTier : undefined,
        // A tier-gated discount is meaningless for an anonymous walk-in — there's no tier to check —
        // so targeting a customer group implies the cashier must attach a customer at checkout.
        requiresCustomer: form.minCustomerTier !== "none" ? true : form.requiresCustomer,
      };
      if (editItem) {
        const branchId = form.appliesTo === "branch" ? (form.branchIds[0] || undefined) : undefined;
        await api.updateDiscount(editItem.id, { ...base, branchId });
      } else {
        const targets = form.appliesTo === "branch" && form.branchIds.length > 0 ? form.branchIds : [undefined as string | undefined];
        for (const bid of targets) {
          await api.createDiscount({ ...base, branchId: bid });
        }
      }
      toast.success(editItem ? "Discount updated" : "Discount created");
      setSheetOpen(false); load();
    } catch { toast.error("Failed to save discount"); } finally { setSaving(false); }
  };

  const handleDelete = async (d: Discount) => {
    if (!confirm(`Delete discount "${d.name}"?`)) return;
    await api.deleteDiscount(d.id); toast.success("Deleted"); load();
  };

  const set = (k: keyof DiscountForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));
  const setS = (k: keyof DiscountForm) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  const active = discounts.filter(d => d.isActive).length;

  const appliesToLabel = (d: Discount) => {
    if (d.appliesTo === "product") return d.product?.name ?? "Specific product";
    if (d.appliesTo === "branch") return d.branch?.name ?? "Specific branch";
    if (d.appliesTo === "category") return categories.find(c => c.id === d.categoryId)?.name ?? "Specific category";
    return "All branches";
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canCreate && (
          <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-10" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New Discount
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Active Discounts" value={String(active)} icon={PercentCircle} accent="primary" />
        <MetricCard label="Total Discounts" value={String(discounts.length)} icon={PercentCircle} accent="default" />
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Discount</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Applies To</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Value</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {discounts.map((d, i) => (
                  <tr key={d.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{d.name}</p>
                      <p className="text-xs text-muted-foreground">D-{String(301 + i).padStart(3, "0")}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-sm">{appliesToLabel(d)}</td>
                    <td className="px-4 py-3 font-semibold text-primary">
                      {d.discountType === "percentage" ? `${d.value}%` : <><SARIcon />{d.value}</>}
                    </td>
                    <td className="px-4 py-3"><StatusDot active={d.isActive} /></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(d)}><Pencil className="h-3.5 w-3.5" /></Button>}
                        {canEdit && <Button size="icon" variant="ghost" className={`h-7 w-7 ${d.isActive ? "text-destructive" : "text-success"}`} onClick={async () => { await api.toggleDiscount(d.id); load(); }}><Power className="h-3.5 w-3.5" /></Button>}
                        {canDelete && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(d)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {discounts.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">No discounts yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Sheet open={sheetOpen} onOpenChange={v => !v && setSheetOpen(false)}>
        <SheetContent>
          <SheetHeader><SheetTitle>{editItem ? "Edit Discount" : "Create Discount"}</SheetTitle></SheetHeader>
          <div className="mt-5 space-y-4 overflow-y-auto max-h-[calc(100vh-120px)] pr-1">
            <FL label="Discount Name *"><Input value={form.name} onChange={set("name")} className="h-9" placeholder="Senior Citizen 5%" /></FL>
            <FL label="Applies To">
              <Select value={form.appliesTo} onValueChange={setS("appliesTo")}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  <SelectItem value="branch">Specific Branch</SelectItem>
                  <SelectItem value="product">Specific Product</SelectItem>
                  <SelectItem value="category">Specific Category</SelectItem>
                </SelectContent>
              </Select>
            </FL>

            {form.appliesTo === "product" && (
              <FL label="Product">
                <Select value={form.productId} onValueChange={setS("productId")}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>
                    {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} — {p.sku}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FL>
            )}
            {form.appliesTo === "category" && (
              <FL label="Category">
                <Select value={form.categoryId} onValueChange={setS("categoryId")}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FL>
            )}
            {form.appliesTo === "branch" && (
              <FL label="Branches (select one or more)">
                <BranchMultiSelect branches={branches} value={form.branchIds} onChange={ids => setForm(p => ({ ...p, branchIds: ids }))} />
              </FL>
            )}

            {(form.appliesTo === "all" || form.appliesTo === "branch" || form.appliesTo === "category") && (
              <FL label="Exclude specific products (optional)">
                <ProductMultiSelect products={products} value={form.excludedProductIds} onChange={ids => setForm(p => ({ ...p, excludedProductIds: ids }))} />
              </FL>
            )}

            <FL label="Customer group (loyalty tier)">
              <Select value={form.minCustomerTier} onValueChange={setS("minCustomerTier")}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Any customer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any customer</SelectItem>
                  {CUSTOMER_TIERS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">
                {form.minCustomerTier === "none"
                  ? "Applies to everyone, including walk-ins."
                  : "The cashier must attach a customer at checkout for this discount to apply."}
              </p>
            </FL>

            {form.minCustomerTier === "none" && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox" id="requiresCustomer" checked={form.requiresCustomer}
                  onChange={e => setForm(p => ({ ...p, requiresCustomer: e.target.checked }))}
                  className="h-4 w-4 accent-primary"
                />
                <label htmlFor="requiresCustomer" className="text-sm cursor-pointer">Require a registered customer</label>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <FL label="Discount Type">
                <Select value={form.discountType} onValueChange={setS("discountType")}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage %</SelectItem>
                    <SelectItem value="fixed">Fixed SAR</SelectItem>
                  </SelectContent>
                </Select>
              </FL>
              <FL label="Value"><Input type="number" value={form.value} onChange={set("value")} className="h-9" placeholder={form.discountType === "percentage" ? "10" : "5.00"} /></FL>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FL label="Start Date"><Input type="date" value={form.startDate} onChange={set("startDate")} className="h-9" /></FL>
              <FL label="End Date"><Input type="date" value={form.endDate} onChange={set("endDate")} min={form.startDate || today} className="h-9" /></FL>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isActive" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} className="h-4 w-4 accent-primary" />
              <label htmlFor="isActive" className="text-sm cursor-pointer">Active</label>
            </div>
            <Button className="w-full gradient-primary text-primary-foreground border-0 mt-2" onClick={handleSave} disabled={saving || !form.name}>
              {saving ? "Saving…" : "Save Discount"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Offers Tab ───────────────────────────────────────────────────────────────

// Combo product IDs are stored as JSON in itemsDescription: {"products":["id1","id2"]}
function parseComboIds(desc?: string | null): string[] {
  if (!desc) return [];
  try { const d = JSON.parse(desc); return Array.isArray(d.products) ? d.products : []; } catch { return []; }
}
function serializeComboIds(ids: string[]): string {
  return JSON.stringify({ products: ids });
}

type OfferForm = {
  name: string; offerType: string; branchIds: string[];
  triggerProductId: string; triggerBarcode: string; getProductId: string;
  triggerQuantity: string; getQuantity: string;
  offerPrice: string; discountPercentage: string;
  itemsDescription: string; minBasketAmount: string; winners: string;
  usageLimit: string; startDate: string; endDate: string; isActive: boolean;
};
const emptyOffer: OfferForm = {
  name: "", offerType: "bogo", branchIds: [],
  triggerProductId: "", triggerBarcode: "", getProductId: "",
  triggerQuantity: "1", getQuantity: "1",
  offerPrice: "", discountPercentage: "",
  itemsDescription: "", minBasketAmount: "", winners: "",
  usageLimit: "", startDate: today, endDate: nextMonth, isActive: true,
};

// Offer types keyed off a single trigger product — the only ones a barcode can narrow.
const TRIGGER_PRODUCT_OFFER_TYPES = ["bogo", "buy_a_get_b", "product_offer"];

function OffersTab() {
  const { canCreate, canEdit, canDelete } = usePermission("Coupons");
  const [offers, setOffers] = useState<Offer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editItem, setEditItem] = useState<Offer | null>(null);
  const [form, setForm] = useState<OfferForm>(emptyOffer);
  const [saving, setSaving] = useState(false);
  // Combo: list of selected product IDs
  const [comboIds, setComboIds] = useState<string[]>([]);
  const [comboPickId, setComboPickId] = useState("");

  const load = () => { setLoading(true); api.getOffers().then(setOffers).finally(() => setLoading(false)); };
  useEffect(() => {
    load();
    api.getProducts().then(setProducts).catch(() => {});
    api.getBranches().then(setBranches).catch(() => {});
  }, []);

  const openCreate = () => {
    setEditItem(null); setForm(emptyOffer); setComboIds([]); setComboPickId(""); setSheetOpen(true);
  };
  const openEdit = (o: Offer) => {
    setEditItem(o);
    setForm({
      name: o.name, offerType: o.offerType, branchIds: o.branchId ? [o.branchId] : [],
      triggerProductId: o.triggerProductId ?? "", triggerBarcode: o.triggerBarcode ?? "", getProductId: o.getProductId ?? "",
      triggerQuantity: String(o.triggerQuantity), getQuantity: String(o.getQuantity),
      offerPrice: o.offerPrice != null ? String(o.offerPrice) : "",
      discountPercentage: o.discountPercentage != null ? String(o.discountPercentage) : "",
      itemsDescription: o.itemsDescription ?? "",
      minBasketAmount: o.minBasketAmount != null ? String(o.minBasketAmount) : "",
      winners: o.winners != null ? String(o.winners) : "",
      usageLimit: o.usageLimit != null ? String(o.usageLimit) : "",
      startDate: o.startDate?.slice(0, 10) ?? today, endDate: o.endDate?.slice(0, 10) ?? nextMonth,
      isActive: o.isActive,
    });
    if (o.offerType === "combo") {
      setComboIds(parseComboIds(o.itemsDescription));
    } else {
      setComboIds([]);
    }
    setComboPickId("");
    setSheetOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) { toast.error("Offer name is required"); return; }
    if (form.offerType === "combo" && comboIds.length < 2) {
      toast.error("Combo requires at least 2 products"); return;
    }
    const rangeError = validityRangeError(form.startDate, form.endDate);
    if (rangeError) { toast.error(rangeError); return; }
    setSaving(true);
    try {
      const itemsDesc = form.offerType === "combo"
        ? serializeComboIds(comboIds)
        : form.itemsDescription || undefined;
      const base: Partial<Offer> = {
        name: form.name, offerType: form.offerType,
        triggerProductId: form.triggerProductId || undefined,
        triggerBarcode: form.triggerBarcode.trim() || undefined,
        getProductId: form.getProductId || undefined,
        triggerQuantity: Number(form.triggerQuantity) || 1,
        getQuantity: Number(form.getQuantity) || 1,
        offerPrice: form.offerPrice ? Number(form.offerPrice) : undefined,
        discountPercentage: form.discountPercentage ? Number(form.discountPercentage) : undefined,
        itemsDescription: itemsDesc,
        minBasketAmount: form.minBasketAmount ? Number(form.minBasketAmount) : undefined,
        winners: form.winners ? Number(form.winners) : undefined,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined,
        startDate: form.startDate, endDate: form.endDate, isActive: form.isActive,
      };
      if (editItem) {
        await api.updateOffer(editItem.id, { ...base, branchId: form.branchIds[0] || undefined });
      } else {
        const targets = form.branchIds.length > 0 ? form.branchIds : [undefined as string | undefined];
        for (const bid of targets) {
          await api.createOffer({ ...base, branchId: bid });
        }
      }
      toast.success(editItem ? "Offer updated" : "Offer created");
      setSheetOpen(false); load();
    } catch { toast.error("Failed to save offer"); } finally { setSaving(false); }
  };

  const handleDelete = async (o: Offer) => {
    if (!confirm(`Delete offer "${o.name}"?`)) return;
    await api.deleteOffer(o.id); toast.success("Deleted"); load();
  };

  const set = (k: keyof OfferForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));
  const setS = (k: keyof OfferForm) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  const triggerProductBarcode = products.find(p => p.id === form.triggerProductId)?.barcode ?? "";

  // Combo helpers
  const comboRetailTotal = comboIds.reduce((s, id) => {
    const p = products.find(x => x.id === id);
    return s + (p?.basePrice ?? 0);
  }, 0);
  const comboSaving = comboRetailTotal - (Number(form.offerPrice) || 0);
  const addComboProduct = () => {
    if (!comboPickId || comboIds.includes(comboPickId)) return;
    setComboIds(ids => [...ids, comboPickId]);
    setComboPickId("");
  };

  // Table display: for combo, parse product names
  const comboLabel = (o: Offer) => {
    const ids = parseComboIds(o.itemsDescription);
    if (!ids.length) return o.itemsDescription ?? "—";
    const names = ids.map(id => products.find(p => p.id === id)?.name ?? "…").join(" + ");
    return names.length > 40 ? names.slice(0, 40) + "…" : names;
  };

  const active = offers.filter(o => o.isActive).length;
  const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-SA", { day: "2-digit", month: "short", year: "2-digit" });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {canCreate && (
          <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-10" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New Offer
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Live Offers" value={String(active)} icon={Gift} accent="primary" />
        <MetricCard label="Total Offers" value={String(offers.length)} icon={Zap} accent="default" />
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Offer</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Items / Condition</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Bundle Price</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Branch</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">End</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {offers.map((o, i) => (
                  <tr key={o.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{o.name}</p>
                      <p className="text-xs text-muted-foreground">O-{String(401 + i).padStart(3, "0")}</p>
                    </td>
                    <td className="px-4 py-3"><OfferTypeBadge type={o.offerType} /></td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-[200px] truncate">
                      {o.offerType === "combo" ? comboLabel(o) : (o.itemsDescription || o.triggerProduct?.name || "—")}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-primary">
                      {o.offerPrice != null ? <><SARIcon />{o.offerPrice.toFixed(2)}</> : o.discountPercentage ? `${o.discountPercentage}% off` : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{o.branch?.name ?? "All"}</td>
                    <td className="px-4 py-3 text-xs">{fmtDate(o.endDate)}</td>
                    <td className="px-4 py-3"><StatusDot active={o.isActive} /></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(o)}><Pencil className="h-3.5 w-3.5" /></Button>}
                        {canEdit && <Button size="icon" variant="ghost" className={`h-7 w-7 ${o.isActive ? "text-destructive" : "text-success"}`} onClick={async () => { await api.toggleOffer(o.id); load(); }}><Power className="h-3.5 w-3.5" /></Button>}
                        {canDelete && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(o)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {offers.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">No offers yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Offer Create/Edit Sheet */}
      <Sheet open={sheetOpen} onOpenChange={v => !v && setSheetOpen(false)}>
        <SheetContent className="w-full sm:max-w-lg">
          <SheetHeader><SheetTitle>{editItem ? "Edit Offer" : "Create Offer"}</SheetTitle></SheetHeader>
          <div className="mt-5 space-y-4 overflow-y-auto max-h-[calc(100vh-120px)] pr-1">
            <FL label="Offer Name *"><Input value={form.name} onChange={set("name")} className="h-9" placeholder="Buy 1 Get 1 Free — Pepsi" /></FL>

            <FL label="Offer Type">
              <Select value={form.offerType} onValueChange={v => { setS("offerType")(v); setComboIds([]); setComboPickId(""); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bogo">BOGO — Buy N Get N Free</SelectItem>
                  <SelectItem value="combo">Combo — Bundle at Special Price</SelectItem>
                  <SelectItem value="buy_a_get_b">Buy A Get B — Buy Product A, Get B</SelectItem>
                  <SelectItem value="product_offer">Product Offer — Discount on Specific Product</SelectItem>
                  <SelectItem value="lucky_draw">Lucky Draw — Spend to Enter</SelectItem>
                </SelectContent>
              </Select>
            </FL>

            {/* ── BOGO ── */}
            {form.offerType === "bogo" && (
              <>
                <FL label="Product (Buy & Get)">
                  <Select value={form.triggerProductId} onValueChange={setS("triggerProductId")}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} — {p.sku}</SelectItem>)}</SelectContent>
                  </Select>
                </FL>
                <div className="grid grid-cols-2 gap-3">
                  <FL label="Buy Qty"><Input type="number" min="1" value={form.triggerQuantity} onChange={set("triggerQuantity")} className="h-9" /></FL>
                  <FL label="Get Qty (Free)"><Input type="number" min="1" value={form.getQuantity} onChange={set("getQuantity")} className="h-9" /></FL>
                </div>
              </>
            )}

            {/* ── COMBO — multi-product selector ── */}
            {form.offerType === "combo" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">Bundle Products (min 2) *</Label>
                  <div className="flex gap-2">
                    <Select value={comboPickId} onValueChange={setComboPickId}>
                      <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Pick a product to add…" /></SelectTrigger>
                      <SelectContent>
                        {products.filter(p => !comboIds.includes(p.id)).map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name} — <SARIcon />{p.basePrice.toFixed(2)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="sm" className="h-9 px-3" onClick={addComboProduct} disabled={!comboPickId}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Selected combo products */}
                  {comboIds.length > 0 && (
                    <div className="rounded-lg border border-border/60 divide-y divide-border/40 mt-1">
                      {comboIds.map(id => {
                        const p = products.find(x => x.id === id);
                        return (
                          <div key={id} className="flex items-center justify-between px-3 py-2 text-sm">
                            <div>
                              <span className="font-medium">{p?.name ?? "Unknown"}</span>
                              <span className="text-xs text-muted-foreground ml-2">{p?.sku}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="tabular-nums text-muted-foreground"><SARIcon />{(p?.basePrice ?? 0).toFixed(2)}</span>
                              <button onClick={() => setComboIds(ids => ids.filter(x => x !== id))} className="text-muted-foreground hover:text-destructive">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Price summary */}
                  {comboIds.length >= 2 && (
                    <div className="rounded-lg bg-muted/40 px-3 py-2 space-y-1 text-sm mt-1">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Total retail price ({comboIds.length} items)</span>
                        <span className="font-medium tabular-nums line-through"><SARIcon />{comboRetailTotal.toFixed(2)}</span>
                      </div>
                      {form.offerPrice && Number(form.offerPrice) > 0 && (
                        <>
                          <div className="flex justify-between">
                            <span className="font-semibold">Bundle offer price</span>
                            <span className="font-bold text-primary tabular-nums"><SARIcon />{Number(form.offerPrice).toFixed(2)}</span>
                          </div>
                          {comboSaving > 0 && (
                            <div className="flex justify-between text-success text-xs">
                              <span>Customer saves</span>
                              <span className="font-semibold tabular-nums"><SARIcon />{comboSaving.toFixed(2)} ({((comboSaving / comboRetailTotal) * 100).toFixed(0)}% off)</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                <FL label="Bundle Offer Price (SAR) *">
                  <Input type="number" step="0.01" value={form.offerPrice} onChange={set("offerPrice")} className="h-9"
                    placeholder={comboRetailTotal > 0 ? `Retail: SAR ${comboRetailTotal.toFixed(2)} — enter bundle price` : "e.g. 15.99"} />
                </FL>
              </>
            )}

            {/* ── Buy A Get B ── */}
            {form.offerType === "buy_a_get_b" && (
              <>
                <FL label="Trigger Product (Buy This)">
                  <Select value={form.triggerProductId} onValueChange={setS("triggerProductId")}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select product A" /></SelectTrigger>
                    <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} — <SARIcon />{p.basePrice.toFixed(2)}</SelectItem>)}</SelectContent>
                  </Select>
                </FL>
                <FL label="Get Product (Receive This)">
                  <Select value={form.getProductId} onValueChange={setS("getProductId")}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select product B" /></SelectTrigger>
                    <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} — <SARIcon />{p.basePrice.toFixed(2)}</SelectItem>)}</SelectContent>
                  </Select>
                </FL>
                {form.getProductId && (() => {
                  const gp = products.find(p => p.id === form.getProductId);
                  return gp ? (
                    <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm flex justify-between">
                      <span className="text-muted-foreground">Get product retail price</span>
                      <span className="font-semibold tabular-nums"><SARIcon />{gp.basePrice.toFixed(2)}</span>
                    </div>
                  ) : null;
                })()}
                <div className="grid grid-cols-2 gap-3">
                  <FL label="Buy Qty"><Input type="number" min="1" value={form.triggerQuantity} onChange={set("triggerQuantity")} className="h-9" /></FL>
                  <FL label="Get Qty"><Input type="number" min="1" value={form.getQuantity} onChange={set("getQuantity")} className="h-9" /></FL>
                </div>
                <FL label="Price customer pays for 'Get' product (0 = free)">
                  <Input type="number" step="0.01" min="0" value={form.offerPrice} onChange={set("offerPrice")} className="h-9" placeholder="0.00 = free" />
                </FL>
              </>
            )}

            {/* ── Product Offer ── */}
            {form.offerType === "product_offer" && (
              <>
                <FL label="Product">
                  <Select value={form.triggerProductId} onValueChange={setS("triggerProductId")}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} — <SARIcon />{p.basePrice.toFixed(2)}</SelectItem>)}</SelectContent>
                  </Select>
                </FL>
                {form.triggerProductId && (() => {
                  const tp = products.find(p => p.id === form.triggerProductId);
                  const discPct = Number(form.discountPercentage);
                  const offerPx = Number(form.offerPrice);
                  return tp ? (
                    <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm space-y-1">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Retail price</span>
                        <span className="line-through tabular-nums"><SARIcon />{tp.basePrice.toFixed(2)}</span>
                      </div>
                      {discPct > 0 && (
                        <div className="flex justify-between text-success">
                          <span>After {discPct}% discount</span>
                          <span className="font-semibold tabular-nums"><SARIcon />{(tp.basePrice * (1 - discPct / 100)).toFixed(2)}</span>
                        </div>
                      )}
                      {offerPx > 0 && (
                        <div className="flex justify-between text-success">
                          <span>Saving vs retail</span>
                          <span className="font-semibold tabular-nums"><SARIcon />{Math.max(0, tp.basePrice - offerPx).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  ) : null;
                })()}
                <div className="grid grid-cols-2 gap-3">
                  <FL label="Discount %">
                    <Input type="number" min="0" max="100" value={form.discountPercentage} onChange={set("discountPercentage")} className="h-9" placeholder="25" />
                  </FL>
                  <FL label="Fixed Offer Price (SAR)">
                    <Input type="number" step="0.01" value={form.offerPrice} onChange={set("offerPrice")} className="h-9" placeholder="or override price" />
                  </FL>
                </div>
              </>
            )}

            {/* ── Lucky Draw ── */}
            {form.offerType === "lucky_draw" && (
              <>
                <FL label="Min. Basket Amount (SAR)">
                  <Input type="number" step="0.01" value={form.minBasketAmount} onChange={set("minBasketAmount")} className="h-9" placeholder="200" />
                </FL>
                <FL label="Number of Winners">
                  <Input type="number" min="1" value={form.winners} onChange={set("winners")} className="h-9" placeholder="10" />
                </FL>
                <FL label="Description / Condition">
                  <Input value={form.itemsDescription} onChange={set("itemsDescription")} className="h-9" placeholder="e.g. Spend SAR 200 to enter" />
                </FL>
              </>
            )}

            {/* Barcode-specific targeting — only meaningful for the offer types that fire off a
                trigger product. Combo matches a set of products and Lucky Draw is basket-level, so
                neither has a single barcode to key on. */}
            {TRIGGER_PRODUCT_OFFER_TYPES.includes(form.offerType) && (
              <FL label="Barcode-specific (optional)">
                <div className="flex gap-1.5">
                  <Input
                    value={form.triggerBarcode}
                    onChange={set("triggerBarcode")}
                    className="h-9"
                    placeholder="Blank = any barcode for this product"
                  />
                  {triggerProductBarcode && form.triggerBarcode !== triggerProductBarcode && (
                    <Button
                      type="button" variant="outline" className="h-9 shrink-0 text-xs"
                      onClick={() => setForm(p => ({ ...p, triggerBarcode: triggerProductBarcode }))}
                    >
                      Use {triggerProductBarcode}
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {form.triggerBarcode
                    ? "Only this scanned barcode triggers the offer — other barcodes for the same product won't."
                    : "The offer fires for any barcode belonging to the selected product."}
                </p>
              </FL>
            )}

            {/* Common fields */}
            <FL label="Branches (blank = all branches)">
              <BranchMultiSelect branches={branches} value={form.branchIds} onChange={ids => setForm(p => ({ ...p, branchIds: ids }))} />
            </FL>
            <div className="grid grid-cols-2 gap-3">
              <FL label="Start Date"><Input type="date" value={form.startDate} onChange={set("startDate")} className="h-9" /></FL>
              <FL label="End Date"><Input type="date" value={form.endDate} onChange={set("endDate")} min={form.startDate || today} className="h-9" /></FL>
            </div>
            <FL label="Usage Limit (blank = unlimited)">
              <Input type="number" value={form.usageLimit} onChange={set("usageLimit")} className="h-9" placeholder="∞" />
            </FL>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="offerActive" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} className="h-4 w-4 accent-primary" />
              <label htmlFor="offerActive" className="text-sm cursor-pointer">Active</label>
            </div>
            <Button className="w-full gradient-primary text-primary-foreground border-0 mt-2" onClick={handleSave} disabled={saving || !form.name}>
              {saving ? "Saving…" : "Save Offer"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

function Coupons() {
  return (
    <PageShell title="Coupons, Discounts & Offers" subtitle="Promotional codes · discount rules · creative offer types">
      <Tabs defaultValue="coupons">
        <TabsList className="mb-4">
          <TabsTrigger value="coupons" className="gap-1.5"><Tag className="h-3.5 w-3.5" />Coupons</TabsTrigger>
          <TabsTrigger value="discounts" className="gap-1.5"><PercentCircle className="h-3.5 w-3.5" />Discounts</TabsTrigger>
          <TabsTrigger value="offers" className="gap-1.5"><Gift className="h-3.5 w-3.5" />Offers</TabsTrigger>
        </TabsList>
        <TabsContent value="coupons" className="mt-0"><CouponsTab /></TabsContent>
        <TabsContent value="discounts" className="mt-0"><DiscountsTab /></TabsContent>
        <TabsContent value="offers" className="mt-0"><OffersTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
