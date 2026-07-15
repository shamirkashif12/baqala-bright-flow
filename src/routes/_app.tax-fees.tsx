import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useState, useMemo } from "react";
import { PageShell } from "@/components/app-topbar";
import { MetricCard } from "@/components/metric-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Cigarette, Receipt, Calculator, Plus, Link as LinkIcon, Pencil } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { api, type TaxFeeRule, type Product, type ZatcaSettings } from "@/lib/api";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { BranchFilter } from "@/components/branch-filter";
import { SARIcon, fmtSAR } from "@/lib/currency";

export const Route = createFileRoute("/_app/tax-fees")({ component: TaxFees });

type FeeForm = {
  ruleName: string;
  feeType: "fixed" | "percent";
  value: string;
  applicableTo: string;
  status: string;
};
const emptyFeeForm: FeeForm = { ruleName: "", feeType: "fixed", value: "0.00", applicableTo: "all_products", status: "active" };
const defaultZatcaSettings: ZatcaSettings = { branchId: "", phase2Enabled: false, environment: "sandbox" };

// KSA tobacco excise formula: minimum 25 SAR rule
function tobaccoFee(base: number): number {
  return base <= 25 ? 25 : base;
}
function tobaccoTotal(base: number): { fee: number; subtotal: number; vat: number; total: number } {
  const fee = tobaccoFee(base);
  const sub = base + fee;
  const vat = sub * 0.15;
  return { fee, subtotal: sub, vat: parseFloat(vat.toFixed(2)), total: parseFloat((sub + vat).toFixed(2)) };
}

function applicableToLabel(v: string): string {
  if (v === "all_products" || v === "all_orders") return "Per order";
  if (v === "card_payments") return "Card payments";
  if (v === "delivery_orders") return "Delivery orders";
  if (v === "per_bag") return "Per bag";
  return v;
}

function feeTypeDisplay(r: TaxFeeRule): { type: string; value: React.ReactNode } {
  if (r.customFeeAmount > 0) return { type: "Fixed", value: <><SARIcon />{r.customFeeAmount.toFixed(2)}</> };
  if (r.excisePercentage > 0) return { type: "Percent", value: `${r.excisePercentage}%` };
  if (r.vatPercentage > 0) return { type: "Percent", value: `${r.vatPercentage}%` };
  return { type: "—", value: "—" };
}

function TaxFees() {
  const { canCreate, canEdit } = usePermission("Tax & Fees");
  const { canEdit: canEditZatca } = usePermission("Compliance");
  const { user, canViewModule } = useAuth();
  const { branches } = useBranch();
  // Only the ZATCA tab below is branch-scoped (Custom Fees/Tobacco Tax apply tenant-wide).
  const isAdmin = user?.role === "tenant_admin";
  const lockedBranchId = !isAdmin ? (user?.branchId ?? null) : null;
  const [branchId, setBranchId] = useState(lockedBranchId ?? "");
  useEffect(() => {
    if (lockedBranchId) setBranchId(lockedBranchId);
  }, [lockedBranchId]);
  useEffect(() => {
    if (!branchId && branches.length) {
      setBranchId(branches.find((b) => b.status === "active")?.id ?? branches[0].id);
    }
  }, [branches, branchId]);
  const branch = branches.find((b) => b.id === branchId) ?? null;
  const [rules, setRules] = useState<TaxFeeRule[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());
  const [zatca, setZatca] = useState<ZatcaSettings>(defaultZatcaSettings);
  const [zatcaSaving, setZatcaSaving] = useState(false);
  const [credSaving, setCredSaving] = useState(false);
  const [feeDialogOpen, setFeeDialogOpen] = useState(false);
  const [editRule, setEditRule] = useState<TaxFeeRule | null>(null);
  const [form, setForm] = useState<FeeForm>(emptyFeeForm);
  const [saving, setSaving] = useState(false);

  const load = () => api.getTaxRules().then(setRules);

  useEffect(() => {
    load();
    api.getProducts().then(setProducts).catch(() => {});
    api.getStock().then(stocks => {
      const map = new Map<string, number>();
      stocks.forEach(s => map.set(s.productId, Math.max(0, s.quantity - (s.reservedQuantity ?? 0))));
      setStockMap(map);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!branchId) return;
    api.getZatcaSettings(branchId)
      .then(data => setZatca({ ...defaultZatcaSettings, ...data }))
      .catch(() => setZatca({ ...defaultZatcaSettings, branchId }));
  }, [branchId]);

  const customFees = rules.filter(r => r.ruleType === "custom_fee");
  const tobaccoRule = rules.find(r => r.ruleType === "tobacco_excise");
  const tobaccoProducts = useMemo(
    () => products.filter(p => p.isTobacco === true),
    [products]
  );
  const activeCustomFeesCount = rules.filter(r => r.ruleType === "custom_fee" && r.status === "active").length;

  const openCreate = () => { setEditRule(null); setForm({ ...emptyFeeForm, status: "active" }); setFeeDialogOpen(true); };
  const openEdit = (r: TaxFeeRule) => {
    setEditRule(r);
    const ft: "fixed" | "percent" = r.customFeeAmount > 0 ? "fixed" : "percent";
    const val = r.customFeeAmount > 0
      ? String(r.customFeeAmount)
      : r.excisePercentage > 0 ? String(r.excisePercentage) : String(r.vatPercentage);
    setForm({ ruleName: r.ruleName, feeType: ft, value: val, applicableTo: r.applicableTo, status: r.status });
    setFeeDialogOpen(true);
  };

  const toggleStatus = async (r: TaxFeeRule) => {
    const newStatus = r.status === "active" ? "inactive" : "active";
    try {
      await api.updateTaxRule(r.id, { ...r, status: newStatus });
      toast.success(`Fee ${newStatus === "active" ? "activated" : "deactivated"}`);
      load();
    } catch { toast.error("Failed to update status"); }
  };

  const toggleZatcaEnabled = async (v: boolean) => {
    if (!branchId || !canEditZatca) return;
    const previous = zatca;
    const next = { ...zatca, phase2Enabled: v };
    setZatca(next);
    setZatcaSaving(true);
    try {
      const updated = await api.updateZatcaSettings(branchId, next);
      setZatca(updated);
      toast.success(v ? "ZATCA e-Invoicing enabled" : "ZATCA e-Invoicing disabled");
    } catch {
      setZatca(previous);
      toast.error("Failed to update ZATCA e-Invoicing status");
    } finally {
      setZatcaSaving(false);
    }
  };

  const saveZatcaCredentials = async () => {
    if (!branchId || !canEditZatca) return;
    setCredSaving(true);
    try {
      const updated = await api.updateZatcaSettings(branchId, { vatRegistrationNumber: zatca.vatRegistrationNumber });
      setZatca(updated);
      toast.success("ZATCA credentials saved");
    } catch {
      toast.error("Failed to save ZATCA credentials");
    } finally {
      setCredSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ruleName: form.ruleName,
        ruleType: "custom_fee",
        customFeeAmount: form.feeType === "fixed" ? Number(form.value) : 0,
        excisePercentage: form.feeType === "percent" ? Number(form.value) : 0,
        vatPercentage: 0,
        applicableTo: form.applicableTo,
        isTobacco: false,
        status: form.status,
        effectiveDate: new Date().toISOString().slice(0, 10),
      };
      if (editRule) {
        await api.updateTaxRule(editRule.id, payload);
        toast.success("Fee updated");
      } else {
        await api.createTaxRule(payload);
        toast.success("Fee created");
      }
      setFeeDialogOpen(false);
      load();
    } catch (e) {
      toast.error("Failed to save fee");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const setField = (k: keyof FeeForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));
  const setSelect = (k: keyof FeeForm) => (v: string) =>
    setForm(p => ({ ...p, [k]: v }));

  return (
    <PageShell title="Tax, Fees & Tobacco" subtitle="ZATCA-2 enablement, custom fees and tobacco excise">
      {/* ─── Metric cards ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="ZATCA Status" value={zatca.phase2Enabled ? "Enabled" : "Disabled"} icon={ShieldCheck} accent={zatca.phase2Enabled ? "success" : "warning"} />
        <MetricCard label="Active Custom Fees" value={String(activeCustomFeesCount)} icon={Receipt} accent="primary" />
        <MetricCard label="Tobacco SKUs" value={String(tobaccoProducts.length)} icon={Cigarette} accent="warning" />
        <MetricCard label="Excise Collected (MO)" value={<><SARIcon />18,420</>} icon={Calculator} accent="primary" />
      </div>

      {/* ─── Fee calculation preview ───────────────────────────────────────── */}
      <Card className="p-5 border-primary/30 bg-primary/5 shadow-card">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" />
              Fee calculation preview
            </h3>
            <p className="text-xs text-muted-foreground">Live preview of price + VAT + tobacco excise + custom fees</p>
          </div>
          {canViewModule("Compliance") && (
            <Link to="/zatca-settings" className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
              <LinkIcon className="h-3 w-3" /> Open ZATCA settings →
            </Link>
          )}
        </div>
        <div className="grid sm:grid-cols-5 gap-2 text-sm">
          {(() => {
            const basePrice = 20;
            const customFee = 2;
            const { fee, vat, total } = tobaccoTotal(basePrice);
            return [
              { l: "Product Price", v: <><SARIcon />{basePrice.toFixed(2)}</> },
              { l: "VAT 15%", v: <><SARIcon />{vat.toFixed(2)}</> },
              { l: "Tobacco Tax", v: <><SARIcon />{fee.toFixed(2)}</> },
              { l: "Custom Fee", v: <><SARIcon />{customFee.toFixed(2)}</> },
              { l: "Total Payable", v: <><SARIcon />{(total + customFee).toFixed(2)}</>, strong: true },
            ];
          })().map(r => (
            <div
              key={r.l}
              className={`rounded-xl border bg-background p-3 ${r.strong ? "border-primary/40 ring-1 ring-primary/30" : "border-border/60"}`}
            >
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{r.l}</p>
              <p className={`mt-1 ${r.strong ? "text-lg font-bold text-primary" : "font-semibold"}`}>{r.v}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ─── Tabs ─────────────────────────────────────────────────────────── */}
      <Tabs defaultValue="zatca">
        <TabsList>
          <TabsTrigger value="zatca">ZATCA 2</TabsTrigger>
          <TabsTrigger value="fees">Custom Fees</TabsTrigger>
          <TabsTrigger value="tobacco">Tobacco Tax</TabsTrigger>
        </TabsList>

        {/* ── ZATCA 2 ── */}
        <TabsContent value="zatca" className="space-y-3 mt-4">
          <div className="flex justify-end">
            <BranchFilter branches={branches} value={branchId} onChange={setBranchId} locked={!!lockedBranchId} />
          </div>
          <Card className="p-6 border-success/30 bg-success/5 shadow-card">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-success/15 text-success flex items-center justify-center">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">ZATCA e-Invoicing</h3>
                    <Badge className={zatca.phase2Enabled ? "bg-success text-success-foreground border-0" : "bg-warning text-warning-foreground border-0"}>
                      {zatca.phase2Enabled ? "Live" : "Disabled"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Applied automatically on every billing &amp; order</p>
                </div>
              </div>
              <Switch
                checked={zatca.phase2Enabled}
                onCheckedChange={toggleZatcaEnabled}
                disabled={zatcaSaving || !canEditZatca || !branch}
              />
            </div>
          </Card>

          <div className="grid gap-3 md:grid-cols-2">
            <Card className="p-5 space-y-3">
              <h4 className="font-semibold text-sm">Invoice Settings</h4>
              <p className="text-xs text-muted-foreground">
                Basic VAT invoice &amp; receipt generation for POS, returns and supplier ops.
              </p>
              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
                <span className="text-sm">Auto-attach QR to every invoice</span>
                <Switch defaultChecked disabled={!canEditZatca} />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
                <span className="text-sm">Print bilingual (AR/EN) receipts</span>
                <Switch defaultChecked disabled={!canEditZatca} />
              </div>
            </Card>
            <Card className="p-5 space-y-3">
              <h4 className="font-semibold text-sm">Credentials</h4>
              <div className="space-y-1">
                <Label className="text-xs">VAT Registration No.</Label>
                <Input
                  className="h-9"
                  value={zatca.vatRegistrationNumber ?? ""}
                  onChange={e => setZatca(p => ({ ...p, vatRegistrationNumber: e.target.value }))}
                  placeholder="300012345600003"
                  disabled={!canEditZatca}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">CR Number</Label>
                <Input className="h-9" value={branch?.commercialRegistration ?? ""} disabled title="Edit on the Branches page" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">CSID Certificate</Label>
                <Input
                  className="h-9"
                  value={
                    zatca.hasProductionCsid ? "Production CSID issued"
                      : zatca.hasComplianceCsid ? "Compliance CSID issued (sandbox)"
                      : zatca.hasCsr ? "CSR generated — awaiting OTP"
                      : "Not issued yet"
                  }
                  disabled
                  title="Managed via the ZATCA onboarding flow"
                />
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={saveZatcaCredentials}
                  disabled={credSaving || !canEditZatca || !branch}
                >
                  {credSaving ? "Saving…" : "Save credentials"}
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link to="/zatca-settings">Re-onboard with ZATCA</Link>
                </Button>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* ── Custom Fees ── */}
        <TabsContent value="fees" className="space-y-3 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Custom fees are added at checkout and printed on the invoice.
            </p>
            {canCreate && (
              <Button
                size="sm"
                className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow"
                onClick={openCreate}
              >
                <Plus className="h-4 w-4" /> New Fee
              </Button>
            )}
          </div>

          {customFees.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">
              <Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No custom fees yet. Click "+ New Fee" to add one.</p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/40">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">ID</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Fee Name</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Type</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Value</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Applies To</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Branches</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Status</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {customFees.map((r, idx) => {
                      const { type, value } = feeTypeDisplay(r);
                      return (
                        <tr key={r.id} className="hover:bg-muted/30">
                          <td className="px-4 py-2.5 text-muted-foreground tabular-nums text-xs">
                            FEE-{String(idx + 1).padStart(3, "0")}
                          </td>
                          <td className="px-4 py-2.5 font-semibold">{r.ruleName}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{type}</td>
                          <td className="px-4 py-2.5 tabular-nums">{value}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{applicableToLabel(r.applicableTo)}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">All</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={r.status === "active"}
                                onCheckedChange={canEdit ? () => toggleStatus(r) : undefined}
                                disabled={!canEdit}
                              />
                              <span className={`text-xs font-medium ${r.status === "active" ? "text-success" : "text-muted-foreground"}`}>
                                {r.status === "active" ? "Active" : "Inactive"}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            {canEdit && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => openEdit(r)}
                                title="Edit fee"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ── Tobacco Tax ── */}
        <TabsContent value="tobacco" className="space-y-3 mt-4">
          {/* Excise rule card */}
          <Card className="p-5 border-warning/30 bg-warning/5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Cigarette className="h-6 w-6 text-warning-foreground" />
                <div>
                  <h4 className="font-semibold">Excise Tax Rule (KSA)</h4>
                  <p className="text-xs text-muted-foreground">
                    Tobacco products: minimum 25 SAR excise + 15% VAT on (base + excise)
                  </p>
                </div>
              </div>
              <Switch
                checked={tobaccoRule?.status === "active"}
                disabled={!tobaccoRule}
                onCheckedChange={() => tobaccoRule && toggleStatus(tobaccoRule)}
              />
            </div>

            {/* Formula card */}
            <div className="mt-4 rounded-xl bg-card border border-border/60 p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                KSA Tobacco Excise — Minimum 25 SAR rule
              </p>
              <div className="font-mono text-xs space-y-0.5 text-foreground">
                <p><span className="text-muted-foreground">if</span> base_price &le; 25 SAR:</p>
                <p className="pl-4">tobacco_fee = <span className="text-warning-foreground font-semibold">25</span>  <span className="text-muted-foreground">(minimum charge)</span></p>
                <p><span className="text-muted-foreground">else:</span></p>
                <p className="pl-4">tobacco_fee = <span className="text-warning-foreground font-semibold">base_price</span>  <span className="text-muted-foreground">(100% of base)</span></p>
                <p className="pt-1">subtotal = base_price + tobacco_fee</p>
                <p>vat      = subtotal × 15%</p>
                <p>final    = subtotal + vat</p>
              </div>

              {/* Examples */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                {[
                  { base: 20, label: "Example 1 (base=20)" },
                  { base: 40, label: "Example 2 (base=40)" },
                ].map(({ base, label }) => {
                  const { fee, subtotal, vat, total } = tobaccoTotal(base);
                  return (
                    <div key={base} className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs space-y-1">
                      <p className="font-semibold text-muted-foreground">{label}</p>
                      <div className="flex justify-between"><span>Base</span><span className="tabular-nums"><SARIcon />{base.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span>Excise fee</span><span className="tabular-nums text-warning-foreground"><SARIcon />{fee.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums"><SARIcon />{subtotal.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span>VAT 15%</span><span className="tabular-nums"><SARIcon />{vat.toFixed(2)}</span></div>
                      <div className="flex justify-between font-semibold border-t border-border/60 pt-1 mt-1">
                        <span>Total</span><span className="tabular-nums text-primary"><SARIcon />{total.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* Tobacco products table */}
          {tobaccoProducts.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">
              <Cigarette className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No tobacco products yet. Flag products as "Tobacco / Excise" when adding them in Inventory.</p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/40">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">SKU</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Product</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Base</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Excise</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">VAT</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Selling Price</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground text-xs">Stock</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {tobaccoProducts.map(p => {
                      const { fee, subtotal: sub, vat, total } = tobaccoTotal(p.basePrice);
                      const stock = stockMap.get(p.id);
                      return (
                        <tr key={p.id} className="hover:bg-muted/30">
                          <td className="px-4 py-2.5 text-muted-foreground text-xs tabular-nums">{p.sku}</td>
                          <td className="px-4 py-2.5 font-medium">{p.name}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums"><SARIcon />{p.basePrice.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-warning-foreground"><SARIcon />{fee.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums"><SARIcon />{vat.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-primary"><SARIcon />{total.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-right">
                            {stock === undefined ? (
                              <span className="text-muted-foreground">—</span>
                            ) : (
                              <span className={`text-xs font-medium ${stock <= 0 ? "text-destructive" : stock <= 5 ? "text-warning-foreground" : "text-success"}`}>
                                {stock}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ─── Add / Edit custom fee dialog ─────────────────────────────────── */}
      <Dialog open={feeDialogOpen} onOpenChange={v => !v && setFeeDialogOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editRule ? "Edit custom fee" : "Add custom fee"}</DialogTitle>
            <DialogDescription>Applied automatically on billing &amp; order checkout.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Fee name</Label>
              <Input
                value={form.ruleName}
                onChange={setField("ruleName")}
                className="h-9"
                placeholder="e.g. Service fee"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={form.feeType} onValueChange={v => setForm(p => ({ ...p, feeType: v as "fixed" | "percent" }))}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed (SAR)</SelectItem>
                    <SelectItem value="percent">Percent (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Value</Label>
                <Input
                  type="number"
                  step={0.01}
                  value={form.value}
                  onChange={setField("value")}
                  className="h-9"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Applies to</Label>
              <Select value={form.applicableTo} onValueChange={setSelect("applicableTo")}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_products">Every order</SelectItem>
                  <SelectItem value="per_bag">Per bag</SelectItem>
                  <SelectItem value="card_payments">Card payments</SelectItem>
                  <SelectItem value="delivery_orders">Delivery orders</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Fee is applied at checkout when active</p>
              </div>
              <Switch
                checked={form.status === "active"}
                onCheckedChange={v => setForm(p => ({ ...p, status: v ? "active" : "inactive" }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="w-full gradient-primary text-primary-foreground border-0"
              onClick={handleSave}
              disabled={saving || !form.ruleName}
            >
              {saving ? "Saving…" : "Save fee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
