import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { MetricCard } from "@/components/metric-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Receipt, Plus, Pencil, Truck } from "lucide-react";
import { toast } from "sonner";
import { api, type TaxFeeRule } from "@/lib/api";
import { usePermission } from "@/lib/use-permission";
import { localDateStr } from "@/lib/utils";
import { SARIcon } from "@/lib/currency";
import { LoadErrorBanner } from "@/components/load-error-banner";

export const Route = createFileRoute("/_app/service-charges")({ component: ServiceCharges });

// Business-configured surcharges (delivery fee, card-payment surcharge) — NOT a Saudi tax.
// Moved out of Tax & Fees, which now covers only VAT and tobacco excise (the two real KSA taxes),
// so these don't get presented as if they were one. See _app.tax-fees.tsx.
type FeeForm = {
  ruleName: string;
  feeType: "fixed" | "percent";
  value: string;
  applicableTo: string;
  status: string;
};
const emptyFeeForm: FeeForm = { ruleName: "", feeType: "fixed", value: "0.00", applicableTo: "all_products", status: "active" };

// Checkout (_app.pos.tsx's allOrderFees) only ever honors "all_products"/"all_orders" — the
// other applicableTo values used to be offered here but silently never charged at checkout.
// Kept in the label map for any existing rule rows created with one of them (so they still
// display sensibly), but no longer offered when creating/editing a rule below.
function applicableToLabel(v: string): string {
  if (v === "all_products" || v === "all_orders") return "Per order";
  if (v === "card_payments") return "Card payments (not applied at checkout)";
  if (v === "delivery_orders") return "Delivery orders (not applied at checkout)";
  if (v === "per_bag") return "Per bag (not applied at checkout)";
  return v;
}

function feeTypeDisplay(r: TaxFeeRule): { type: string; value: React.ReactNode } {
  if (r.customFeeAmount > 0) return { type: "Fixed", value: <><SARIcon />{r.customFeeAmount.toFixed(2)}</> };
  if (r.excisePercentage > 0) return { type: "Percent", value: `${r.excisePercentage}%` };
  return { type: "—", value: "—" };
}

function ServiceCharges() {
  const { canCreate, canEdit } = usePermission("Tax & Fees");
  const [rules, setRules] = useState<TaxFeeRule[]>([]);
  const [feeDialogOpen, setFeeDialogOpen] = useState(false);
  const [editRule, setEditRule] = useState<TaxFeeRule | null>(null);
  const [form, setForm] = useState<FeeForm>(emptyFeeForm);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = () => api.getTaxRules()
    .then(rules => { setRules(rules); setLoadError(false); })
    .catch(() => setLoadError(true));

  useEffect(() => { load(); }, []);

  const charges = rules.filter(r => r.ruleType === "custom_fee");
  const activeChargesCount = charges.filter(r => r.status === "active").length;

  const openCreate = () => { setEditRule(null); setForm({ ...emptyFeeForm, status: "active" }); setFeeDialogOpen(true); };
  const openEdit = (r: TaxFeeRule) => {
    setEditRule(r);
    const ft: "fixed" | "percent" = r.customFeeAmount > 0 ? "fixed" : "percent";
    const val = r.customFeeAmount > 0 ? String(r.customFeeAmount) : String(r.excisePercentage);
    setForm({ ruleName: r.ruleName, feeType: ft, value: val, applicableTo: r.applicableTo, status: r.status });
    setFeeDialogOpen(true);
  };

  const toggleStatus = async (r: TaxFeeRule) => {
    const newStatus = r.status === "active" ? "inactive" : "active";
    try {
      await api.updateTaxRule(r.id, { ...r, status: newStatus });
      toast.success(`Charge ${newStatus === "active" ? "activated" : "deactivated"}`);
      load();
    } catch { toast.error("Failed to update status"); }
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
        effectiveDate: localDateStr(),
      };
      if (editRule) {
        await api.updateTaxRule(editRule.id, payload);
        toast.success("Service charge updated");
      } else {
        await api.createTaxRule(payload);
        toast.success("Service charge created");
      }
      setFeeDialogOpen(false);
      load();
    } catch (e) {
      toast.error("Failed to save service charge");
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const setField = (k: keyof FeeForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <PageShell title="Service Charges" subtitle="Business-configured surcharges (delivery fee, card surcharge) — not a tax. See Tax, Fees & Tobacco for VAT and tobacco excise.">
      {loadError && <LoadErrorBanner onRetry={load} />}
      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard label="Active Service Charges" value={String(activeChargesCount)} icon={Truck} accent="primary" />
        <MetricCard label="Total Configured" value={String(charges.length)} icon={Receipt} />
      </div>

      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Service charges are added at checkout and printed on the invoice.
        </p>
        {canCreate && (
          <Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New Charge
          </Button>
        )}
      </div>

      {charges.length === 0 ? (
        <Card className="p-10 text-center text-muted-foreground">
          <Receipt className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">No service charges yet. Click "+ New Charge" to add one.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/40">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">ID</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Charge Name</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Type</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Value</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Applies To</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {charges.map((r, idx) => {
                  const { type, value } = feeTypeDisplay(r);
                  return (
                    <tr key={r.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-muted-foreground tabular-nums text-xs">
                        SVC-{String(idx + 1).padStart(3, "0")}
                      </td>
                      <td className="px-4 py-2.5 font-semibold">{r.ruleName}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{type}</td>
                      <td className="px-4 py-2.5 tabular-nums">{value}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{applicableToLabel(r.applicableTo)}</td>
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
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)} title="Edit charge">
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

      <Dialog open={feeDialogOpen} onOpenChange={v => !v && setFeeDialogOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editRule ? "Edit service charge" : "Add service charge"}</DialogTitle>
            <DialogDescription>Applied automatically on billing &amp; order checkout.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Charge name</Label>
              <Input value={form.ruleName} onChange={setField("ruleName")} className="h-9" placeholder="e.g. Delivery Service Fee" />
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
                <Input type="number" step={0.01} value={form.value} onChange={setField("value")} className="h-9" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Applies to</Label>
              {/* Only "Every order" is actually honored at checkout (_app.pos.tsx) — other scopes
                  (per-bag, card payments, delivery orders) used to be offered here but were
                  silently never charged, so they're not offered for new/edited rules anymore. */}
              <Select value={form.applicableTo} onValueChange={() => {}} disabled>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_products">Every order</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Charge is applied at checkout when active</p>
              </div>
              <Switch checked={form.status === "active"} onCheckedChange={v => setForm(p => ({ ...p, status: v ? "active" : "inactive" }))} />
            </div>
          </div>
          <DialogFooter>
            <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={handleSave} disabled={saving || !form.ruleName}>
              {saving ? "Saving…" : "Save charge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
