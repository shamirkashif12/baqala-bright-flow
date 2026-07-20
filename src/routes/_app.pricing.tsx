import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Loader2, Trash2, Pencil, Power, Tag, Boxes } from "lucide-react";
import {
  api,
  type Branch, type Product, type ProductPriceList, type PriceListPayload,
  type PriceType, type CustomerTier,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermission } from "@/lib/use-permission";
import { SARIcon } from "@/lib/currency";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/pricing")({ component: Pricing });

const PRICE_TYPES: PriceType[] = ["standard", "online", "aggregator", "wholesale"];
const TIERS: CustomerTier[] = ["standard", "silver", "gold", "platinum"];

// Mirrors PriceResolutionService.SourceOf — the same precedence, spelled for a human. Kept in sync
// by eye; the server is the authority and the Effective price column below shows what it decided.
function scopeLabel(r: ProductPriceList, branches: Branch[]) {
  const bits: string[] = [];
  bits.push(r.branchId ? branches.find(b => b.id === r.branchId)?.name ?? "Branch" : "All branches");
  if (r.minCustomerTier) bits.push(`${r.minCustomerTier}+`);
  return bits.join(" · ");
}

function windowLabel(r: ProductPriceList) {
  const from = new Date(r.effectiveFrom);
  const now = new Date();
  const to = r.effectiveTo ? new Date(r.effectiveTo) : null;
  if (from > now) return { text: `From ${from.toISOString().slice(0, 10)}`, tone: "scheduled" as const };
  if (to && to <= now) return { text: `Ended ${to.toISOString().slice(0, 10)}`, tone: "expired" as const };
  if (to) return { text: `Until ${to.toISOString().slice(0, 10)}`, tone: "active" as const };
  return { text: "Always", tone: "active" as const };
}

// ─── Rule editor ──────────────────────────────────────────────────────────────

function RuleDialog({ open, rule, products, branches, onClose, onDone }: {
  open: boolean;
  rule: ProductPriceList | null;   // null = create
  products: Product[];
  branches: Branch[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    productId: "", branchId: "", priceType: "standard" as PriceType, price: "",
    effectiveFrom: "", effectiveTo: "", minCustomerTier: "" as "" | CustomerTier,
    unitType: "unit" as "unit" | "pack", packSize: "", packBarcode: "", label: "", priority: "0",
  });

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(rule ? {
      productId: rule.productId,
      branchId: rule.branchId ?? "",
      priceType: rule.priceType,
      price: String(rule.price),
      effectiveFrom: rule.effectiveFrom ? rule.effectiveFrom.slice(0, 10) : "",
      effectiveTo: rule.effectiveTo ? rule.effectiveTo.slice(0, 10) : "",
      minCustomerTier: rule.minCustomerTier ?? "",
      unitType: rule.unitType,
      packSize: rule.packSize != null ? String(rule.packSize) : "",
      packBarcode: rule.packBarcode ?? "",
      label: rule.label ?? "",
      priority: String(rule.priority),
    } : {
      productId: "", branchId: "", priceType: "standard", price: "",
      effectiveFrom: "", effectiveTo: "", minCustomerTier: "",
      unitType: "unit", packSize: "", packBarcode: "", label: "", priority: "0",
    });
  }, [open, rule]);

  const isPack = form.unitType === "pack";
  const derivedUnitPrice = isPack && Number(form.packSize) > 0 && form.price !== ""
    ? Number(form.price) / Number(form.packSize)
    : null;

  const save = async () => {
    if (!form.productId) return setError("Select a product.");
    if (form.price === "" || Number(form.price) < 0 || Number.isNaN(Number(form.price)))
      return setError("Enter a valid price.");
    if (isPack && (!form.packSize || Number(form.packSize) <= 0))
      return setError("A pack needs a pack size greater than zero.");
    if (form.effectiveFrom && form.effectiveTo && form.effectiveTo <= form.effectiveFrom)
      return setError("'Until' must be after 'From'.");

    const payload: PriceListPayload = {
      id: rule?.id,
      productId: form.productId,
      branchId: form.branchId || undefined,
      priceType: form.priceType,
      price: Number(form.price),
      effectiveFrom: form.effectiveFrom ? new Date(form.effectiveFrom).toISOString() : undefined,
      effectiveTo: form.effectiveTo ? new Date(form.effectiveTo).toISOString() : undefined,
      minCustomerTier: form.minCustomerTier || undefined,
      unitType: form.unitType,
      packSize: isPack ? Number(form.packSize) : undefined,
      packBarcode: isPack && form.packBarcode ? form.packBarcode : undefined,
      label: form.label || undefined,
      priority: Number(form.priority) || 0,
    };

    setSaving(true); setError("");
    try {
      if (rule) await api.updatePriceList(rule.id, payload);
      else await api.createPriceList(payload);
      toast.success(rule ? "Price rule updated" : "Price rule created");
      onDone(); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save the price rule.");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{rule ? "Edit price rule" : "New price rule"}</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs">Product *</Label>
            <Select value={form.productId} onValueChange={v => setForm(p => ({ ...p, productId: v }))} disabled={!!rule}>
              <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select product" /></SelectTrigger>
              <SelectContent>
                {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} · {p.sku}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Pack pricing moved to the product form (Inventory → Add/Edit Product → "Sold as"): a pack
              is now its own product sold as one unit. This page manages only extra UNIT prices —
              per branch, per customer tier, and scheduled. */}
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            The price this product sells at for the scope below. To sell something as a pack of items,
            set "Sold as → Pack" on the product itself.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Branch</Label>
              <Select value={form.branchId || "all"} onValueChange={v => setForm(p => ({ ...p, branchId: v === "all" ? "" : v }))}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Price list</Label>
              <Select value={form.priceType} onValueChange={v => setForm(p => ({ ...p, priceType: v as PriceType }))}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRICE_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">{isPack ? "Pack price (SAR) *" : "Unit price (SAR) *"}</Label>
              <Input type="number" step="0.01" min={0} className="h-9 mt-1" placeholder="0.00"
                value={form.price} onChange={e => { setForm(p => ({ ...p, price: e.target.value })); setError(""); }} />
            </div>
            {isPack && (
              <div>
                <Label className="text-xs">Units per pack *</Label>
                <Input type="number" step="1" min={1} className="h-9 mt-1" placeholder="12"
                  value={form.packSize} onChange={e => { setForm(p => ({ ...p, packSize: e.target.value })); setError(""); }} />
              </div>
            )}
          </div>
          {derivedUnitPrice !== null && (
            <p className="text-[11px] text-muted-foreground -mt-1.5">
              Works out to <SARIcon />{derivedUnitPrice.toFixed(4)} per unit.
            </p>
          )}

          {isPack && (
            <>
              <div>
                <Label className="text-xs">Pack barcode</Label>
                <Input className="h-9 mt-1 font-mono" placeholder="Case / outer barcode"
                  value={form.packBarcode} onChange={e => { setForm(p => ({ ...p, packBarcode: e.target.value })); setError(""); }} />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Scanning this at the till adds a whole pack. Must not clash with any product barcode.
                </p>
              </div>
              <div>
                <Label className="text-xs">Label</Label>
                <Input className="h-9 mt-1" placeholder="Case of 12"
                  value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} />
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Valid from</Label>
              <Input type="date" className="h-9 mt-1" value={form.effectiveFrom}
                onChange={e => { setForm(p => ({ ...p, effectiveFrom: e.target.value })); setError(""); }} />
            </div>
            <div>
              <Label className="text-xs">Until</Label>
              <Input type="date" className="h-9 mt-1" value={form.effectiveTo}
                onChange={e => { setForm(p => ({ ...p, effectiveTo: e.target.value })); setError(""); }} />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground -mt-1.5">
            Blank = starts now, never expires. Two rules with abutting windows express "this price until
            Friday, then that one".
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Customer tier</Label>
              <Select value={form.minCustomerTier || "all"}
                onValueChange={v => setForm(p => ({ ...p, minCustomerTier: v === "all" ? "" : (v as CustomerTier) }))}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All customers</SelectItem>
                  {TIERS.map(t => <SelectItem key={t} value={t} className="capitalize">{t} and above</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Priority</Label>
              <Input type="number" className="h-9 mt-1" value={form.priority}
                onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground -mt-1.5">
            A tier-gated price never applies to an anonymous walk-in. Priority only breaks ties between
            equally specific rules — higher wins.
          </p>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {rule ? "Save changes" : "Create rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function Pricing() {
  const { user } = useAuth();
  const perms = usePermission("Inventory");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;

  const [rules, setRules] = useState<ProductPriceList[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [unitTypeFilter, setUnitTypeFilter] = useState<"all" | "unit" | "pack">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductPriceList | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setRules(await api.getPriceLists({
        branchId: lockedBranchId ?? (branchFilter !== "all" ? branchFilter : undefined),
        unitType: unitTypeFilter !== "all" ? unitTypeFilter : undefined,
      }));
    } catch { setRules([]); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    api.getProducts({ status: "active" }).then(setProducts).catch(() => {});
    api.getBranches().then(setBranches).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [branchFilter, unitTypeFilter, lockedBranchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async (r: ProductPriceList) => {
    setBusyId(r.id);
    try { await api.togglePriceList(r.id); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed to toggle the rule"); }
    finally { setBusyId(null); }
  };

  const remove = async (r: ProductPriceList) => {
    setBusyId(r.id);
    try { await api.deletePriceList(r.id); toast.success("Price rule deleted"); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed to delete the rule"); }
    finally { setBusyId(null); }
  };

  const q = search.toLowerCase();
  const filtered = useMemo(() => rules.filter(r => {
    if (!q) return true;
    const p = r.product ?? products.find(x => x.id === r.productId);
    return p?.name?.toLowerCase().includes(q) || p?.sku?.toLowerCase().includes(q) || r.label?.toLowerCase().includes(q);
  }), [rules, q, products]);

  const productOf = (r: ProductPriceList) => r.product ?? products.find(x => x.id === r.productId);

  return (
    <PageShell
      title="Pricing"
      subtitle="Extra prices per branch, customer tier & schedule · products with no rule sell at their base price"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search product / SKU / label…" className="h-9 bg-card flex-1 min-w-[200px] max-w-sm"
          value={search} onChange={e => setSearch(e.target.value)} />
        {!lockedBranchId && (
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={unitTypeFilter} onValueChange={v => setUnitTypeFilter(v as typeof unitTypeFilter)}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Units + packs</SelectItem>
            <SelectItem value="unit">Unit prices</SelectItem>
            <SelectItem value="pack">Pack prices</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {perms.canCreate && (
          <Button size="sm" className="h-9 gap-1.5" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> New price rule
          </Button>
        )}
      </div>

      <Card className="border-border/60 shadow-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                {rules.length === 0
                  ? "No price rules yet — every product sells at its base price."
                  : "No rules match your search."}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Kind</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Scope</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Window</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Base</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Price</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const p = productOf(r);
                    const w = windowLabel(r);
                    const busy = busyId === r.id;
                    const perUnit = r.unitType === "pack" && r.packSize ? r.price / r.packSize : r.price;
                    return (
                      <tr key={r.id} className={`border-t hover:bg-muted/20 transition-colors ${r.isActive ? "" : "opacity-50"}`}>
                        <td className="px-4 py-3">
                          <p className="font-semibold">{p?.name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">{p?.sku ?? r.productId.slice(0, 8)}</p>
                        </td>
                        <td className="px-4 py-3">
                          {r.unitType === "pack" ? (
                            <div>
                              <Badge variant="secondary" className="text-[10px]">
                                {r.label || `Pack of ${r.packSize}`}
                              </Badge>
                              <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{r.packBarcode ?? ""}</p>
                            </div>
                          ) : (
                            <span className="text-xs capitalize text-muted-foreground">{r.priceType}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">{scopeLabel(r, branches)}</td>
                        <td className="px-4 py-3 text-xs">
                          <span className={
                            w.tone === "scheduled" ? "text-primary font-medium"
                              : w.tone === "expired" ? "text-muted-foreground line-through"
                                : "text-muted-foreground"
                          }>{w.text}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
                          {p ? <><SARIcon />{p.basePrice.toFixed(2)}</> : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">
                          <SARIcon />{r.price.toFixed(2)}
                          {r.unitType === "pack" && (
                            <p className="text-[10px] font-normal text-muted-foreground">
                              <SARIcon />{perUnit.toFixed(3)}/unit
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {perms.canEdit && (
                              <>
                                <Button variant="ghost" size="icon" className="h-7 w-7" disabled={busy}
                                  title={r.isActive ? "Deactivate" : "Activate"} onClick={() => toggle(r)}>
                                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit"
                                  onClick={() => { setEditing(r); setDialogOpen(true); }}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            {perms.canDelete && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" disabled={busy}
                                title="Delete" onClick={() => remove(r)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>

      <RuleDialog open={dialogOpen} rule={editing} products={products} branches={branches}
        onClose={() => { setDialogOpen(false); setEditing(null); }} onDone={load} />
    </PageShell>
  );
}
