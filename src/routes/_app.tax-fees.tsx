import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { PageShell } from "@/components/app-topbar";
import { MetricCard } from "@/components/metric-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShieldCheck, Cigarette, Calculator, Link as LinkIcon, Truck } from "lucide-react";
import { toast } from "sonner";
import { api, type TaxFeeRule, type Product, type ZatcaSettings } from "@/lib/api";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { BranchFilter } from "@/components/branch-filter";
import { SARIcon } from "@/lib/currency";
import { LoadErrorBanner } from "@/components/load-error-banner";

export const Route = createFileRoute("/_app/tax-fees")({ component: TaxFees });

const defaultZatcaSettings: ZatcaSettings = { branchId: "", phase2Enabled: false, environment: "sandbox" };

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// KSA tobacco excise formula: min(minimumExcise) OR excisePct% of base, whichever is higher —
// both configurable via the tobacco_excise TaxFeeRule row (see the "Tobacco Tax" tab below),
// not hardcoded. Defaults (25, 100) only apply if no rule row exists at all.
function tobaccoFee(base: number, minimumExcise = 25, excisePct = 100): number {
  return Math.max(minimumExcise, base * excisePct / 100);
}
function tobaccoTotal(base: number, minimumExcise = 25, excisePct = 100): { fee: number; subtotal: number; vat: number; total: number } {
  const fee = tobaccoFee(base, minimumExcise, excisePct);
  const sub = base + fee;
  const vat = sub * 0.15;
  return { fee, subtotal: sub, vat: parseFloat(vat.toFixed(2)), total: parseFloat((sub + vat).toFixed(2)) };
}

// This page only covers VAT and tobacco excise — the two real KSA taxes. Business-configured
// surcharges (delivery fee, card surcharge) live on their own "Service Charges" page now,
// since they aren't a tax and were previously confusing shown alongside these as if they were.
function TaxFees() {
  const { canEdit: canEditZatca } = usePermission("Compliance");
  const { user, canViewModule } = useAuth();
  const { branches } = useBranch();
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
  const [loadError, setLoadError] = useState(false);
  const [exciseThisMonth, setExciseThisMonth] = useState<number | null>(null);

  const load = () => api.getTaxRules()
    .then(rules => { setRules(rules); setLoadError(false); })
    .catch(() => setLoadError(true));

  useEffect(() => {
    load();
    api.getProducts().then(setProducts).catch(() => {});
    api.getStock().then(stocks => {
      const map = new Map<string, number>();
      stocks.forEach(s => map.set(s.productId, Math.max(0, s.quantity - (s.reservedQuantity ?? 0))));
      setStockMap(map);
    }).catch(() => {});
    // Real figure for the "Excise Collected (MO)" tile — this was previously a hardcoded
    // static number, not computed from any actual data.
    api.getTobaccoExciseReport({ from: firstOfMonthStr(), to: todayStr() })
      .then(r => setExciseThisMonth(r.kpis.exciseTaxAmount))
      .catch(() => setExciseThisMonth(null));
  }, []);

  useEffect(() => {
    if (!branchId) return;
    api.getZatcaSettings(branchId)
      .then(data => setZatca({ ...defaultZatcaSettings, ...data }))
      .catch(() => setZatca({ ...defaultZatcaSettings, branchId }));
  }, [branchId]);

  const tobaccoRule = rules.find(r => r.ruleType === "tobacco_excise");
  const tobaccoProducts = useMemo(
    () => products.filter(p => p.isTobacco === true),
    [products]
  );

  const toggleStatus = async (r: TaxFeeRule) => {
    const newStatus = r.status === "active" ? "inactive" : "active";
    try {
      await api.updateTaxRule(r.id, { ...r, status: newStatus });
      toast.success(`Rule ${newStatus === "active" ? "activated" : "deactivated"}`);
      load();
    } catch { toast.error("Failed to update status"); }
  };

  const saveTobaccoRule = async (r: TaxFeeRule) => {
    try {
      await api.updateTaxRule(r.id, r);
      toast.success("Tobacco excise rate updated");
      load();
    } catch { toast.error("Failed to update tobacco excise rate"); }
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

  return (
    <PageShell title="Tax, Fees & Tobacco" subtitle="VAT and tobacco excise — the two taxes KSA actually recognizes. For delivery fees/surcharges, see Service Charges.">
      {loadError && <LoadErrorBanner onRetry={load} />}
      {/* ─── Metric cards ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="ZATCA Status" value={zatca.phase2Enabled ? "Enabled" : "Disabled"} icon={ShieldCheck} accent={zatca.phase2Enabled ? "success" : "warning"} />
        <MetricCard label="Tobacco SKUs" value={String(tobaccoProducts.length)} icon={Cigarette} accent="warning" />
        <MetricCard
          label="Excise Collected (MO)"
          value={exciseThisMonth == null ? "—" : <><SARIcon />{exciseThisMonth.toLocaleString(undefined, { maximumFractionDigits: 2 })}</>}
          icon={Calculator} accent="primary"
        />
      </div>

      <Card className="p-3 border-border/60 bg-muted/20 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">Looking for delivery fees, card surcharges or other business charges? Those moved to their own page.</p>
        <Button size="sm" variant="outline" asChild className="gap-1.5">
          <Link to="/service-charges"><Truck className="h-3.5 w-3.5" /> Open Service Charges</Link>
        </Button>
      </Card>

      {/* ─── Fee calculation preview ───────────────────────────────────────── */}
      <Card className="p-5 border-primary/30 bg-primary/5 shadow-card">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Calculator className="h-4 w-4 text-primary" />
              Fee calculation preview
            </h3>
            <p className="text-xs text-muted-foreground">Live preview of price + VAT + tobacco excise</p>
          </div>
          {canViewModule("Compliance") && (
            <Link to="/zatca-settings" className="text-xs text-primary font-semibold hover:underline flex items-center gap-1">
              <LinkIcon className="h-3 w-3" /> Open ZATCA settings →
            </Link>
          )}
        </div>
        <div className="grid sm:grid-cols-3 gap-2 text-sm">
          {(() => {
            const basePrice = 20;
            const { fee, vat, total } = tobaccoTotal(basePrice, tobaccoRule?.minimumExciseAmount, tobaccoRule?.excisePercentage);
            return [
              { l: "Product Price", v: <><SARIcon />{basePrice.toFixed(2)}</> },
              { l: "VAT 15% + Tobacco Tax", v: <><SARIcon />{(vat + fee).toFixed(2)}</> },
              { l: "Total Payable", v: <><SARIcon />{total.toFixed(2)}</>, strong: true },
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
                    Tobacco products: minimum <SARIcon />{tobaccoRule?.minimumExciseAmount ?? 25} excise or {tobaccoRule?.excisePercentage ?? 100}% of base price (whichever is higher) + 15% VAT on (base + excise)
                  </p>
                </div>
              </div>
              <Switch
                checked={tobaccoRule?.status === "active"}
                disabled={!tobaccoRule}
                onCheckedChange={() => tobaccoRule && toggleStatus(tobaccoRule)}
              />
            </div>

            {/* Configurable rate/minimum — previously hardcoded at 25 SAR / 100% in three places
                across this codebase (here, POS checkout, and the order-edit recompute); now a
                single source of truth on the tobacco_excise rule itself. */}
            {tobaccoRule && (
              <div className="mt-4 grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Minimum excise (SAR)</Label>
                  <Input
                    type="number" min={0} step="0.01" className="h-9"
                    value={tobaccoRule.minimumExciseAmount}
                    onChange={e => setRules(rs => rs.map(r => r.id === tobaccoRule.id ? { ...r, minimumExciseAmount: Number(e.target.value) || 0 } : r))}
                    onBlur={() => saveTobaccoRule(tobaccoRule)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Excise % of base price</Label>
                  <Input
                    type="number" min={0} max={100} step="0.01" className="h-9"
                    value={tobaccoRule.excisePercentage}
                    onChange={e => setRules(rs => rs.map(r => r.id === tobaccoRule.id ? { ...r, excisePercentage: Number(e.target.value) || 0 } : r))}
                    onBlur={() => saveTobaccoRule(tobaccoRule)}
                  />
                </div>
              </div>
            )}

            {/* Formula card */}
            <div className="mt-4 rounded-xl bg-card border border-border/60 p-4 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                KSA Tobacco Excise Formula
              </p>
              <div className="font-mono text-xs space-y-0.5 text-foreground">
                <p><span className="text-muted-foreground">if</span> base_price × {tobaccoRule?.excisePercentage ?? 100}% &le; {tobaccoRule?.minimumExciseAmount ?? 25} SAR:</p>
                <p className="pl-4">tobacco_fee = <span className="text-warning-foreground font-semibold">{tobaccoRule?.minimumExciseAmount ?? 25}</span>  <span className="text-muted-foreground">(minimum charge)</span></p>
                <p><span className="text-muted-foreground">else:</span></p>
                <p className="pl-4">tobacco_fee = <span className="text-warning-foreground font-semibold">base_price × {tobaccoRule?.excisePercentage ?? 100}%</span></p>
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
                  const { fee, subtotal, vat, total } = tobaccoTotal(base, tobaccoRule?.minimumExciseAmount, tobaccoRule?.excisePercentage);
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
                      const { fee, subtotal: sub, vat, total } = tobaccoTotal(p.basePrice, tobaccoRule?.minimumExciseAmount, tobaccoRule?.excisePercentage);
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
    </PageShell>
  );
}
