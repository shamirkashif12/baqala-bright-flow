import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ModuleGate } from "@/components/role-gate";
import { PageShell } from "@/components/app-topbar";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api, type PaymentIntegrationRecord } from "@/lib/api";
import { useBranch } from "@/lib/branch-context";
import { BranchFilter } from "@/components/branch-filter";
import { useAuth } from "@/lib/auth";
import { usePermission } from "@/lib/use-permission";
import { PAYMENT_PROVIDERS, type PaymentProviderDef } from "@/lib/payment-integrations";

export const Route = createFileRoute("/_app/payments")({
  component: () => (
    <ModuleGate module="Settings">
      <PaymentsPage />
    </ModuleGate>
  ),
});

const CATEGORIES = Array.from(new Set(PAYMENT_PROVIDERS.map((p) => p.category)));

function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-4 border-border/60 shadow-card">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </Card>
  );
}

/** Real brand logo on a neutral tile when the provider has one; otherwise a colored initials tile. */
function ProviderLogo({ provider, size = 44 }: { provider: PaymentProviderDef; size?: number }) {
  if (provider.logo) {
    return (
      <div
        className="rounded-xl border border-border/60 bg-white flex items-center justify-center shrink-0 overflow-hidden p-2"
        style={{ height: size, width: size }}
      >
        <img
          src={provider.logo}
          alt={`${provider.name} logo`}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    );
  }
  return (
    <div
      className={`rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${provider.colorClass}`}
      style={{ height: size, width: size }}
    >
      {provider.initials}
    </div>
  );
}

function ProviderCard({
  provider,
  record,
  onOpen,
}: {
  provider: PaymentProviderDef;
  record: PaymentIntegrationRecord | undefined;
  onOpen: () => void;
}) {
  const connected = record?.isEnabled ?? false;
  return (
    <Card className="p-5 border-border/60 shadow-card flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <ProviderLogo provider={provider} />
        <Badge
          variant="outline"
          className={
            connected
              ? "bg-success/10 text-success border-success/30 gap-1"
              : "text-muted-foreground gap-1"
          }
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-success" : "bg-muted-foreground"}`}
          />
          {connected ? "Connected" : "Not Connected"}
        </Badge>
      </div>
      <p className="font-semibold mt-3">{provider.name}</p>
      <p className="text-xs text-muted-foreground">{provider.category}</p>
      <p className="text-sm text-muted-foreground mt-3 flex-1">{provider.description}</p>
      <div className="mt-4 pt-4 border-t border-border/60 flex items-center justify-between">
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          {provider.priority}
        </Badge>
        <Button variant="link" size="sm" className="h-auto p-0" onClick={onOpen}>
          {connected ? "Manage" : "Enable"}
        </Button>
      </div>
    </Card>
  );
}

function ProviderSetup({
  provider,
  record,
  branchId,
  canEdit,
  onBack,
  onSaved,
}: {
  provider: PaymentProviderDef;
  record: PaymentIntegrationRecord | undefined;
  branchId: string;
  canEdit: boolean;
  onBack: () => void;
  onSaved: (updated: PaymentIntegrationRecord) => void;
}) {
  const [isEnabled, setIsEnabled] = useState(record?.isEnabled ?? false);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of provider.fields) {
      initial[field.key] = record?.config?.[field.key] ?? field.default ?? "";
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);

  function setField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const missingRequired = provider.fields.some((f) => f.required && !values[f.key]?.trim());

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await api.savePaymentIntegration(branchId, provider.key, {
        isEnabled,
        config: values,
      });
      toast.success(`${provider.name} settings saved`, {
        description: isEnabled ? "Integration is now enabled for this branch." : "Changes saved.",
      });
      onSaved(updated);
    } catch (e) {
      toast.error(`Failed to save ${provider.name} settings`, {
        description: e instanceof Error ? e.message : "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 -ml-2 text-muted-foreground"
        onClick={onBack}
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Payments
      </Button>

      <Card className="p-6 border-border/60 shadow-card">
        <div className="flex items-start justify-between gap-4 pb-5 mb-5 border-b border-border/60">
          <div className="flex items-center gap-3">
            <ProviderLogo provider={provider} />
            <div>
              <h3 className="text-base font-semibold">{provider.name} Setup</h3>
              <p className="text-xs text-muted-foreground">
                Configure your {provider.name} connection to enable integration
              </p>
            </div>
          </div>
          {canEdit && (
            <Button
              size="sm"
              className="gradient-primary text-primary-foreground border-0"
              disabled={saving || missingRequired}
              onClick={handleSave}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          )}
        </div>

        {provider.setupNote && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/40 text-xs text-muted-foreground mb-5">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <p>{provider.setupNote}</p>
          </div>
        )}

        <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border/60 mb-5">
          <div>
            <p className="text-sm font-medium">Enable {provider.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {provider.enableDescription ??
                "Turn this on once your credentials below are correct — cashiers can only use it while enabled."}
            </p>
          </div>
          <Switch checked={isEnabled} onCheckedChange={setIsEnabled} disabled={!canEdit} />
        </div>

        <div className="space-y-5">
          {provider.fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label className="text-sm font-semibold">
                {field.label}
                {field.required && <span className="text-destructive ml-0.5">*</span>}
              </Label>
              {field.type === "select" ? (
                <Select
                  value={values[field.key] || field.default}
                  onValueChange={(v) => setField(field.key, v)}
                  disabled={!canEdit}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options?.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="h-10"
                  type={field.type === "password" ? "password" : "text"}
                  placeholder={field.placeholder}
                  value={values[field.key] ?? ""}
                  onChange={(e) => setField(field.key, e.target.value)}
                  disabled={!canEdit}
                />
              )}
              {field.helperText && (
                <p className="text-xs text-muted-foreground">{field.helperText}</p>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function PaymentsPage() {
  const { user } = useAuth();
  const { branches } = useBranch();
  const { canEdit } = usePermission("Settings");
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

  const [records, setRecords] = useState<PaymentIntegrationRecord[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [openProvider, setOpenProvider] = useState<PaymentProviderDef | null>(null);

  function load() {
    if (!branchId) return;
    setLoadError(false);
    api
      .getPaymentIntegrations(branchId)
      .then(setRecords)
      .catch(() => setLoadError(true));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  const recordByProvider = useMemo(() => {
    const map = new Map<string, PaymentIntegrationRecord>();
    (records ?? []).forEach((r) => map.set(r.provider, r));
    return map;
  }, [records]);

  const connectedCount = (records ?? []).filter((r) => r.isEnabled).length;

  const filtered = PAYMENT_PROVIDERS.filter((p) => {
    if (category !== "All" && p.category !== category) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <PageShell
      title="Payments"
      subtitle="Connect and manage third-party integrations for your store"
      actions={
        !openProvider ? (
          <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-1.5">
            <Label className="text-xs text-muted-foreground shrink-0">Branch</Label>
            <BranchFilter
              branches={branches}
              value={branchId}
              onChange={setBranchId}
              locked={!!lockedBranchId}
              className="h-8 border-0 bg-transparent px-1 w-auto"
            />
          </div>
        ) : undefined
      }
    >
      {loadError && (
        <LoadErrorBanner
          onRetry={load}
          message="Failed to load payment integrations for this branch."
        />
      )}

      {openProvider ? (
        <ProviderSetup
          provider={openProvider}
          record={recordByProvider.get(openProvider.key)}
          branchId={branchId}
          canEdit={canEdit}
          onBack={() => setOpenProvider(null)}
          onSaved={(updated) => {
            setRecords((prev) => {
              const others = (prev ?? []).filter((r) => r.provider !== updated.provider);
              return [...others, updated];
            });
            setOpenProvider(null);
          }}
        />
      ) : (
        <>
          <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
            <StatTile
              label="Connected"
              value={
                records === null ? <Loader2 className="h-5 w-5 animate-spin" /> : connectedCount
              }
            />
            <StatTile label="Total Integrations" value={PAYMENT_PROVIDERS.length} />
            <StatTile label="Categories" value={CATEGORIES.length} />
          </div>

          <Card className="p-3 border-border/60 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search payment integrations…"
                  className="pl-9 h-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  key="All"
                  size="sm"
                  variant={category === "All" ? "default" : "outline"}
                  className="h-8 rounded-full text-xs"
                  onClick={() => setCategory("All")}
                >
                  All
                </Button>
                {CATEGORIES.map((c) => (
                  <Button
                    key={c}
                    size="sm"
                    variant={category === c ? "default" : "outline"}
                    className="h-8 rounded-full text-xs"
                    onClick={() => setCategory(c)}
                  >
                    {c}
                  </Button>
                ))}
              </div>
            </div>
          </Card>

          {filtered.length === 0 ? (
            <Card className="p-10 text-center text-sm text-muted-foreground border-border/60">
              No payment integrations match your search.
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((provider) => (
                <ProviderCard
                  key={provider.key}
                  provider={provider}
                  record={recordByProvider.get(provider.key)}
                  onOpen={() => setOpenProvider(provider)}
                />
              ))}
            </div>
          )}

          <Card className="p-4 border-border/60 shadow-card flex items-start gap-3 bg-muted/30">
            <ShieldCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              Credentials are stored per branch and masked after saving — API keys and secrets are
              never shown again in full once entered.
            </p>
          </Card>
        </>
      )}
    </PageShell>
  );
}
