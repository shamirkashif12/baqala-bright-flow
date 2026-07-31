import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { ShieldCheck, Ban, AlertTriangle, Lock, Loader2 } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { api, type TaxFeeRule, type PosSettingsRecord } from "@/lib/api";
import { SARIcon } from "@/lib/currency";
import { useBranch } from "@/lib/branch-context";
import { BranchFilter } from "@/components/branch-filter";
import { useAuth } from "@/lib/auth";
import { usePermission } from "@/lib/use-permission";
import { toast } from "sonner";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { exportRowsAsCsv } from "@/lib/csv-export";
import { useCompanyHeader } from "@/lib/use-company-header";
import { localDateStr } from "@/lib/utils";

export const Route = createFileRoute("/_app/compliance")({ component: Compliance });

interface Toggles {
  blockExpiredItems: boolean;
  warnNearExpiry: boolean;
  requireManagerApprovalForRefund: boolean;
  blockNonpermissibleItems: boolean;
}

const TOGGLE_DEFAULTS: Toggles = {
  blockExpiredItems: true,
  warnNearExpiry: true,
  requireManagerApprovalForRefund: true,
  blockNonpermissibleItems: true,
};

// "Add Rule" creates the same kind of custom-fee rule as Service Charges (_app.service-charges.tsx)
// — the only TaxFeeRule type the app lets a user define; VAT/tobacco-excise rows are fixed system
// rules edited on Tax, Fees & Tobacco, not created here.
type RuleForm = { ruleName: string; feeType: "fixed" | "percent"; value: string; applicableTo: string; status: string };
const emptyRuleForm: RuleForm = { ruleName: "", feeType: "fixed", value: "0.00", applicableTo: "all_products", status: "active" };

function Compliance() {
  const { user } = useAuth();
  const { branches } = useBranch();
  // Toggles apply to one branch server-side (same POS-settings row as _app.pos-settings.tsx).
  const isAdmin = user?.role === "tenant_admin";
  const lockedBranchId = !isAdmin ? (user?.branchId ?? null) : null;
  const [branchId, setBranchId] = useState(lockedBranchId ?? "");
  useEffect(() => {
    if (lockedBranchId) setBranchId(lockedBranchId);
  }, [lockedBranchId]);
  // Remember the admin's chosen branch across reloads — otherwise this always snaps back to the
  // first active branch on load, showing that branch's own (usually all-default) toggle values,
  // which reads as "my save didn't stick" when really a different branch's settings are on screen.
  useEffect(() => {
    if (lockedBranchId || branchId || !branches.length) return;
    const stored = localStorage.getItem("compliance:branchId");
    const storedIsValid = stored && branches.some((b) => b.id === stored);
    setBranchId(storedIsValid ? stored! : (branches.find((b) => b.status === "active")?.id ?? branches[0].id));
  }, [branches, branchId, lockedBranchId]);
  useEffect(() => {
    if (branchId && !lockedBranchId) localStorage.setItem("compliance:branchId", branchId);
  }, [branchId, lockedBranchId]);
  // Toggles are persisted through SettingsController (RequirePermission("Settings", Edit)),
  // so both that AND Compliance:Edit are required — otherwise a role with Settings:Edit
  // for /pos-settings (e.g. Branch Manager) would also get editable controls here, even
  // though Branch Manager is view-only on Compliance.
  const { canEdit: canEditSettings } = usePermission("Settings");
  const { canEdit: canEditCompliance, canCreate: canCreateComplianceRule } = usePermission("Compliance");
  const canEditToggles = canEditSettings && canEditCompliance;
  const [rules, setRules] = useState<TaxFeeRule[]>([]);
  const [toggles, setToggles] = useState<Toggles>(TOGGLE_DEFAULTS);
  const [settingsId, setSettingsId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rulesLoadError, setRulesLoadError] = useState(false);
  const [togglesLoadError, setTogglesLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState<RuleForm>(emptyRuleForm);
  const [savingRule, setSavingRule] = useState(false);
  const companyHeader = useCompanyHeader();

  const loadRules = useCallback(() => {
    api.getTaxRules()
      .then(rules => { setRules(rules); setRulesLoadError(false); })
      .catch(() => setRulesLoadError(true));
  }, []);

  useEffect(() => { loadRules(); }, [loadRules]);

  const loadToggles = useCallback(() => {
    if (!branchId) return;
    setLoading(true);
    api.getPosSettings(branchId)
      .then((data: PosSettingsRecord) => {
        setSettingsId(data.id);
        setToggles({
          blockExpiredItems:               data.blockExpiredItems              ?? TOGGLE_DEFAULTS.blockExpiredItems,
          warnNearExpiry:                  data.warnNearExpiry                 ?? TOGGLE_DEFAULTS.warnNearExpiry,
          requireManagerApprovalForRefund: data.requireManagerApprovalForRefund ?? TOGGLE_DEFAULTS.requireManagerApprovalForRefund,
          blockNonpermissibleItems:        data.blockNonpermissibleItems        ?? TOGGLE_DEFAULTS.blockNonpermissibleItems,
        });
        setTogglesLoadError(false);
      })
      .catch(() => setTogglesLoadError(true))
      .finally(() => setLoading(false));
  }, [branchId]);

  useEffect(() => { loadToggles(); }, [loadToggles]);

  function toggle(key: keyof Toggles) {
    return (v: boolean) => setToggles(prev => ({ ...prev, [key]: v }));
  }

  async function saveToggles() {
    if (!branchId || !canEditToggles) return;
    setSaving(true);
    try {
      await api.updatePosSettings(branchId, { ...toggles, branchId });
      toast.success("Compliance settings saved", { description: "Global toggles updated for this branch." });
    } catch {
      toast.error("Failed to save compliance settings");
    } finally {
      setSaving(false);
    }
  }

  const activeCount = rules.filter((r) => r.status === "active").length;
  const inactiveCount = rules.filter((r) => r.status === "inactive").length;
  const ruleStatuses = useMemo(() => [...new Set(rules.map(r => r.status))], [rules]);

  const filteredRules = useMemo(() => rules.filter(r => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q
      || r.ruleName?.toLowerCase().includes(q)
      || r.ruleType?.toLowerCase().includes(q)
      || r.applicableTo?.toLowerCase().includes(q);
    const matchesStatus = statusFilter.length === 0 || statusFilter.includes(r.status);
    return matchesSearch && matchesStatus;
  }), [rules, search, statusFilter]);

  function toggleStatusFilter(status: string) {
    setStatusFilter(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
  }

  function handleExport() {
    exportRowsAsCsv(
      ["Rule Name", "Rule Type", "VAT %", "Custom Fee", "Applicable To", "Status"],
      filteredRules.map(r => [r.ruleName, r.ruleType, r.vatPercentage, r.customFeeAmount, r.applicableTo, r.status]),
      `compliance-rules-${localDateStr(new Date())}.csv`,
      companyHeader
    );
  }

  function openCreateRule() {
    setRuleForm(emptyRuleForm);
    setRuleDialogOpen(true);
  }

  async function handleSaveRule() {
    setSavingRule(true);
    try {
      await api.createTaxRule({
        ruleName: ruleForm.ruleName,
        ruleType: "custom_fee",
        customFeeAmount: ruleForm.feeType === "fixed" ? Number(ruleForm.value) : 0,
        excisePercentage: ruleForm.feeType === "percent" ? Number(ruleForm.value) : 0,
        vatPercentage: 0,
        applicableTo: ruleForm.applicableTo,
        isTobacco: false,
        status: ruleForm.status,
        effectiveDate: localDateStr(),
      });
      toast.success("Rule created");
      setRuleDialogOpen(false);
      loadRules();
    } catch {
      toast.error("Failed to create rule");
    } finally {
      setSavingRule(false);
    }
  }

  return (
    <PageShell title="Compliance — Permissible Items" subtitle="Rules that the POS enforces in real time">
      {rulesLoadError && <LoadErrorBanner onRetry={loadRules} />}
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <MetricCard label="Active Rules" value={String(activeCount)} icon={ShieldCheck} accent="primary" />
        <MetricCard label="Blocked SKUs" value={String(inactiveCount)} icon={Ban} accent="destructive" />
        <MetricCard label="Triggered Today" value="—" icon={AlertTriangle} accent="warning" />
        <MetricCard label="Restricted by Role" value="—" icon={Lock} />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h3 className="font-semibold">Global toggles</h3>
          <div className="flex items-center gap-2">
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <BranchFilter branches={branches} value={branchId} onChange={setBranchId} locked={!!lockedBranchId} />
          </div>
        </div>
        {togglesLoadError && <div className="mb-4"><LoadErrorBanner onRetry={loadToggles} /></div>}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 p-3.5">
            <div>
              <p className="font-medium text-sm">Auto-block expired items</p>
              <p className="text-xs text-muted-foreground">Cashier cannot complete sale with expired SKU</p>
            </div>
            <Switch
              checked={toggles.blockExpiredItems}
              onCheckedChange={toggle("blockExpiredItems")}
              disabled={loading || !canEditToggles}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 p-3.5">
            <div>
              <p className="font-medium text-sm">Warn 7 days before expiry</p>
              <p className="text-xs text-muted-foreground">Soft warning shown to cashier</p>
            </div>
            <Switch
              checked={toggles.warnNearExpiry}
              onCheckedChange={toggle("warnNearExpiry")}
              disabled={loading || !canEditToggles}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 p-3.5">
            <div>
              <p className="font-medium text-sm">Require manager PIN for refunds</p>
              <p className="text-xs text-muted-foreground">Approval workflow for all refunds</p>
            </div>
            <Switch
              checked={toggles.requireManagerApprovalForRefund}
              onCheckedChange={toggle("requireManagerApprovalForRefund")}
              disabled={loading || !canEditToggles}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 p-3.5">
            <div>
              <p className="font-medium text-sm">Restrict non-permissible items (KSA)</p>
              <p className="text-xs text-muted-foreground">Always blocked per Saudi regulations</p>
            </div>
            <Switch
              checked={toggles.blockNonpermissibleItems}
              onCheckedChange={toggle("blockNonpermissibleItems")}
              disabled={loading || !canEditToggles}
            />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <Button
            className="gradient-primary text-primary-foreground border-0"
            onClick={saveToggles}
            disabled={saving || loading || !canEditToggles}
          >
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : "Save toggles"}
          </Button>
        </div>
      </Card>

      <Toolbar
        placeholder="Search SKU / rule…"
        primaryLabel={canCreateComplianceRule ? "Add Rule" : undefined}
        onPrimaryClick={openCreateRule}
        value={search}
        onChange={e => setSearch(e.target.value)}
        onFilterClick={() => setShowFilters(v => !v)}
        filtersActive={statusFilter.length > 0}
        onExport={handleExport}
      />
      {showFilters && ruleStatuses.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 -mt-2">
          <span className="text-xs text-muted-foreground">Status:</span>
          {ruleStatuses.map(s => (
            <button
              key={s}
              onClick={() => toggleStatusFilter(s)}
              className={`text-xs px-2.5 py-1 rounded-full border capitalize transition-colors ${
                statusFilter.includes(s) ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {s}
            </button>
          ))}
          {statusFilter.length > 0 && (
            <button onClick={() => setStatusFilter([])} className="text-xs text-primary hover:underline ml-1">Clear</button>
          )}
        </div>
      )}
      <DataTable
        columns={[
          { key: "ruleName", label: "Rule Name" },
          { key: "ruleType", label: "Rule Type" },
          { key: "vatPercentage", label: "VAT %", render: (r: TaxFeeRule) => <span>{r.vatPercentage}%</span> },
          { key: "customFeeAmount", label: "Custom Fee", render: (r: TaxFeeRule) => <span><SARIcon />{r.customFeeAmount}</span> },
          { key: "applicableTo", label: "Applicable To" },
          { key: "status", label: "Status", render: (r: TaxFeeRule) => <StatusBadge status={r.status} /> },
        ]}
        rows={filteredRules}
      />

      <Dialog open={ruleDialogOpen} onOpenChange={v => !v && setRuleDialogOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Rule</DialogTitle>
            <DialogDescription>Applied automatically on billing &amp; order checkout.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Rule name</Label>
              <Input
                value={ruleForm.ruleName}
                onChange={e => setRuleForm(p => ({ ...p, ruleName: e.target.value }))}
                className="h-9"
                placeholder="e.g. Delivery Service Fee"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={ruleForm.feeType} onValueChange={v => setRuleForm(p => ({ ...p, feeType: v as "fixed" | "percent" }))}>
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
                  value={ruleForm.value}
                  onChange={e => setRuleForm(p => ({ ...p, value: e.target.value }))}
                  className="h-9"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Applies to</Label>
              <Select value={ruleForm.applicableTo} onValueChange={v => setRuleForm(p => ({ ...p, applicableTo: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_products">Every order</SelectItem>
                  <SelectItem value="card_payments">Card payments only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Active</p>
                <p className="text-xs text-muted-foreground">Rule is enforced at checkout when active</p>
              </div>
              <Switch
                checked={ruleForm.status === "active"}
                onCheckedChange={v => setRuleForm(p => ({ ...p, status: v ? "active" : "inactive" }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="w-full gradient-primary text-primary-foreground border-0"
              onClick={handleSaveRule}
              disabled={savingRule || !ruleForm.ruleName}
            >
              {savingRule ? "Saving…" : "Save rule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
