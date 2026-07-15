import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
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
  useEffect(() => {
    if (!branchId && branches.length) {
      setBranchId(branches.find((b) => b.status === "active")?.id ?? branches[0].id);
    }
  }, [branches, branchId]);
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

  useEffect(() => {
    api.getTaxRules().then(setRules).catch(() => {});
  }, []);

  useEffect(() => {
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
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [branchId]);

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

  return (
    <PageShell title="Compliance — Permissible Items" subtitle="Rules that the POS enforces in real time">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

      <Toolbar placeholder="Search SKU / rule…" primaryLabel={canCreateComplianceRule ? "Add Rule" : undefined} />
      <DataTable
        columns={[
          { key: "ruleName", label: "Rule Name" },
          { key: "ruleType", label: "Rule Type" },
          { key: "vatPercentage", label: "VAT %", render: (r: TaxFeeRule) => <span>{r.vatPercentage}%</span> },
          { key: "customFeeAmount", label: "Custom Fee", render: (r: TaxFeeRule) => <span><SARIcon />{r.customFeeAmount}</span> },
          { key: "applicableTo", label: "Applicable To" },
          { key: "status", label: "Status", render: (r: TaxFeeRule) => <StatusBadge status={r.status} /> },
        ]}
        rows={rules}
      />
    </PageShell>
  );
}
