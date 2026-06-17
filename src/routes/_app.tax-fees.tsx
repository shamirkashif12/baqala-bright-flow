import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import { DataTable, StatusBadge } from "@/components/module-placeholder";
import { ShieldCheck, Cigarette, Receipt, Calculator, Plus } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type TaxFeeRule } from "@/lib/api";

export const Route = createFileRoute("/_app/tax-fees")({ component: TaxFees });

type FeeForm = { ruleName: string; ruleType: string; vatPercentage: string; customFeeAmount: string; excisePercentage: string; applicableTo: string; isTobacco: boolean; status: string; };
const emptyFeeForm: FeeForm = { ruleName: "", ruleType: "custom_fee", vatPercentage: "15", customFeeAmount: "0", excisePercentage: "0", applicableTo: "all_orders", isTobacco: false, status: "active" };

function TaxFees() {
  const [rules, setRules] = useState<TaxFeeRule[]>([]);
  const [zatca, setZatca] = useState(true);
  const [phase2, setPhase2] = useState(true);
  const [feeDialogOpen, setFeeDialogOpen] = useState(false);
  const [editRule, setEditRule] = useState<TaxFeeRule | null>(null);
  const [form, setForm] = useState<FeeForm>(emptyFeeForm);
  const [saving, setSaving] = useState(false);

  const load = () => api.getTaxRules().then(setRules);
  useEffect(() => { load(); }, []);

  const customFees = rules.filter(r => r.ruleType === "custom_fee");
  const tobaccoRules = rules.filter(r => r.isTobacco);
  const activeCustomFees = customFees.filter(r => r.status === "active").length;

  const openCreate = () => { setEditRule(null); setForm(emptyFeeForm); setFeeDialogOpen(true); };
  const openEdit = (r: TaxFeeRule) => {
    setEditRule(r);
    setForm({ ruleName: r.ruleName, ruleType: r.ruleType, vatPercentage: String(r.vatPercentage), customFeeAmount: String(r.customFeeAmount), excisePercentage: String(r.excisePercentage), applicableTo: r.applicableTo, isTobacco: r.isTobacco, status: r.status });
    setFeeDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ruleName: form.ruleName, ruleType: form.ruleType, vatPercentage: Number(form.vatPercentage), customFeeAmount: Number(form.customFeeAmount), excisePercentage: Number(form.excisePercentage), applicableTo: form.applicableTo, isTobacco: form.isTobacco, status: form.status, effectiveDate: new Date().toISOString().slice(0, 10) };
      if (editRule) {
        await api.updateTaxRule(editRule.id, payload);
      } else {
        await api.createTaxRule(payload);
      }
      setFeeDialogOpen(false);
      load();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const set = (k: keyof FeeForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));
  const setS = (k: keyof FeeForm) => (v: string) =>
    setForm(p => ({ ...p, [k]: v }));

  return (
    <PageShell title="Tax, Fees & Tobacco" subtitle="ZATCA-2 enablement, custom fees and tobacco excise">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="ZATCA Status" value={zatca ? "Enabled" : "Disabled"} icon={ShieldCheck} accent={zatca ? "success" : "warning"} />
        <MetricCard label="Active Custom Fees" value={String(activeCustomFees)} icon={Receipt} accent="primary" />
        <MetricCard label="Tobacco Rules" value={String(tobaccoRules.length)} icon={Cigarette} accent="warning" />
        <MetricCard label="Total Rules" value={String(rules.length)} icon={Calculator} accent="primary" />
      </div>

      <Card className="p-5 border-primary/30 bg-primary/5 shadow-card">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2"><Calculator className="h-4 w-4 text-primary" />Fee calculation preview</h3>
            <p className="text-xs text-muted-foreground">Live preview of price + VAT + tobacco excise + custom fees</p>
          </div>
          <Link to="/tax-reports" className="text-xs text-primary font-semibold hover:underline">Open tax & fee reports →</Link>
        </div>
        <div className="grid sm:grid-cols-5 gap-2 text-sm">
          {[
            { l: "Product Price", v: "ر.س 20.00" },
            { l: "VAT 15%", v: "ر.س 3.00" },
            { l: "Tobacco Tax", v: "ر.س 20.00" },
            { l: "Custom Fee", v: "ر.س 2.00" },
            { l: "Total Payable", v: "ر.س 45.00", strong: true },
          ].map(r => (
            <div key={r.l} className={`rounded-xl border bg-background p-3 ${r.strong ? "border-primary/40 ring-1 ring-primary/30" : "border-border/60"}`}>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{r.l}</p>
              <p className={`mt-1 ${r.strong ? "text-lg font-bold text-primary" : "font-semibold"}`}>{r.v}</p>
            </div>
          ))}
        </div>
      </Card>

      <Tabs defaultValue="zatca">
        <TabsList>
          <TabsTrigger value="zatca">ZATCA 2</TabsTrigger>
          <TabsTrigger value="fees">Custom Fees</TabsTrigger>
          <TabsTrigger value="tobacco">Tobacco Tax</TabsTrigger>
        </TabsList>

        <TabsContent value="zatca" className="space-y-3 mt-4">
          <Card className="p-6 border-success/30 bg-success/5 shadow-card">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-success/15 text-success flex items-center justify-center">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2"><h3 className="font-semibold">ZATCA e-Invoicing</h3><Badge className="bg-success text-success-foreground border-0">Live</Badge></div>
                  <p className="text-sm text-muted-foreground">Applied automatically on every billing &amp; order</p>
                </div>
              </div>
              <Switch checked={zatca} onCheckedChange={setZatca} />
            </div>
          </Card>
          <div className="grid gap-3 md:grid-cols-2">
            <Card className="p-5 space-y-3">
              <h4 className="font-semibold text-sm">Invoice Settings</h4>
              <p className="text-xs text-muted-foreground">Basic VAT invoice & receipt generation for POS, returns and supplier ops.</p>
              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3"><span className="text-sm">Auto-attach QR to every invoice</span><Switch defaultChecked checked={phase2} onCheckedChange={setPhase2} /></div>
              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3"><span className="text-sm">Print bilingual (AR/EN) receipts</span><Switch defaultChecked /></div>
            </Card>
            <Card className="p-5 space-y-3">
              <h4 className="font-semibold text-sm">Credentials</h4>
              <div className="space-y-1"><Label className="text-xs">VAT Registration No.</Label><Input className="h-9" defaultValue="300012345600003" /></div>
              <div className="space-y-1"><Label className="text-xs">CR Number</Label><Input className="h-9" defaultValue="1010123456" /></div>
              <div className="space-y-1"><Label className="text-xs">CSID Certificate</Label><Input className="h-9" defaultValue="•••••••• valid until Sep 2027" /></div>
              <Button size="sm" variant="outline">Re-onboard with ZATCA</Button>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="fees" className="space-y-3 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Custom fees are added at checkout and printed on the invoice.</p>
            <Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow" onClick={openCreate}>
              <Plus className="h-4 w-4" /> New Fee
            </Button>
          </div>
          <DataTable
            columns={[
              { key: "ruleName", label: "Fee Name", render: (r: TaxFeeRule) => <span className="font-semibold">{r.ruleName}</span> },
              { key: "ruleType", label: "Type", render: (r: TaxFeeRule) => r.ruleType.replace(/_/g, " ") },
              { key: "customFeeAmount", label: "Fixed Fee", render: (r: TaxFeeRule) => r.customFeeAmount > 0 ? `ر.س ${r.customFeeAmount}` : "—" },
              { key: "vatPercentage", label: "VAT %", render: (r: TaxFeeRule) => r.vatPercentage > 0 ? `${r.vatPercentage}%` : "—" },
              { key: "applicableTo", label: "Applies to", render: (r: TaxFeeRule) => r.applicableTo.replace(/_/g, " ") },
              { key: "status", label: "Status", render: (r: TaxFeeRule) => <StatusBadge status={r.status} /> },
              { key: "actions", label: "", render: (r: TaxFeeRule) => <Button size="sm" variant="ghost" className="h-7" onClick={() => openEdit(r)}>Edit</Button> },
            ]}
            rows={customFees}
          />
        </TabsContent>

        <TabsContent value="tobacco" className="space-y-3 mt-4">
          <Card className="p-5 border-warning/30 bg-warning/5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Cigarette className="h-6 w-6 text-warning-foreground" />
                <div>
                  <h4 className="font-semibold">Excise Tax Rule (KSA)</h4>
                  <p className="text-xs text-muted-foreground">Tobacco products: 100% excise + 15% VAT on (base + excise)</p>
                </div>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="mt-4 rounded-xl bg-card border border-border/60 p-3 text-xs font-mono">
              final_price = (base × (1 + excise%)) × (1 + vat%)
            </div>
          </Card>
          <DataTable
            columns={[
              { key: "ruleName", label: "Rule", render: (r: TaxFeeRule) => <span className="font-semibold">{r.ruleName}</span> },
              { key: "excisePercentage", label: "Excise %", render: (r: TaxFeeRule) => `${r.excisePercentage}%` },
              { key: "vatPercentage", label: "VAT %", render: (r: TaxFeeRule) => `${r.vatPercentage}%` },
              { key: "status", label: "Status", render: (r: TaxFeeRule) => <StatusBadge status={r.status} /> },
            ]}
            rows={tobaccoRules}
          />
        </TabsContent>
      </Tabs>

      {/* Create / Edit fee dialog */}
      <Dialog open={feeDialogOpen} onOpenChange={v => !v && setFeeDialogOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editRule ? "Edit Fee Rule" : "Add Custom Fee"}</DialogTitle>
            <DialogDescription>Applied automatically at checkout.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1"><Label className="text-xs">Fee name</Label><Input value={form.ruleName} onChange={set("ruleName")} className="h-9" placeholder="e.g. Service fee" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Rule Type</Label>
                <Select value={form.ruleType} onValueChange={setS("ruleType")}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom_fee">Custom Fee</SelectItem>
                    <SelectItem value="vat">VAT</SelectItem>
                    <SelectItem value="excise">Excise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={setS("status")}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1"><Label className="text-xs">Fixed Fee (SAR)</Label><Input type="number" value={form.customFeeAmount} onChange={set("customFeeAmount")} className="h-9" /></div>
              <div className="space-y-1"><Label className="text-xs">VAT %</Label><Input type="number" value={form.vatPercentage} onChange={set("vatPercentage")} className="h-9" /></div>
              <div className="space-y-1"><Label className="text-xs">Excise %</Label><Input type="number" value={form.excisePercentage} onChange={set("excisePercentage")} className="h-9" /></div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Applies to</Label>
              <Select value={form.applicableTo} onValueChange={setS("applicableTo")}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_orders">Every order</SelectItem>
                  <SelectItem value="card_payments">Card payments</SelectItem>
                  <SelectItem value="delivery_orders">Delivery orders</SelectItem>
                  <SelectItem value="tobacco_products">Tobacco products</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeeDialogOpen(false)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground border-0" onClick={handleSave} disabled={saving || !form.ruleName}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
