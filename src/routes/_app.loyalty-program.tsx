import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { PageShell } from "@/components/app-topbar";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Loader2, Gift, Copy, Check, Printer, Pencil } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { api, type LoyaltyProgram } from "@/lib/api";
import { SARIcon } from "@/lib/currency";
import { usePermission } from "@/lib/use-permission";
import { useBranch } from "@/lib/branch-context";
import { fileToCompressedDataUrl } from "@/lib/image";

export const Route = createFileRoute("/_app/loyalty-program")({ component: LoyaltyProgramPage });

const DEFAULT_SCOPE = "default";

function FormField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

type FormShape = {
  programName: string; description: string; logoUrl: string; brandColor: string;
  pointsPerCurrencyUnit: string; redemptionValuePerPoint: string;
  minPointsToRedeem: string; maxRedeemPctOfOrder: string; neverExpires: boolean; pointsExpiryDays: string;
  silverThreshold: string; goldThreshold: string; platinumThreshold: string;
  silverEarnMultiplier: string; goldEarnMultiplier: string; platinumEarnMultiplier: string;
  isActive: boolean;
};

function toForm(p: LoyaltyProgram | null): FormShape {
  return {
    programName: p?.programName ?? "Loyalty Rewards",
    description: p?.description ?? "",
    logoUrl: p?.logoUrl ?? "",
    brandColor: p?.brandColor ?? "#7c3aed",
    pointsPerCurrencyUnit: String(p?.pointsPerCurrencyUnit ?? 1),
    redemptionValuePerPoint: String(p?.redemptionValuePerPoint ?? 0.01),
    minPointsToRedeem: String(p?.minPointsToRedeem ?? 100),
    maxRedeemPctOfOrder: p?.maxRedeemPctOfOrder != null ? String(p.maxRedeemPctOfOrder) : "50",
    neverExpires: p ? p.pointsExpiryDays == null : false,
    pointsExpiryDays: p?.pointsExpiryDays != null ? String(p.pointsExpiryDays) : "365",
    silverThreshold: String(p?.silverThreshold ?? 1000),
    goldThreshold: String(p?.goldThreshold ?? 5000),
    platinumThreshold: String(p?.platinumThreshold ?? 10000),
    silverEarnMultiplier: String(p?.silverEarnMultiplier ?? 1),
    goldEarnMultiplier: String(p?.goldEarnMultiplier ?? 1),
    platinumEarnMultiplier: String(p?.platinumEarnMultiplier ?? 1),
    isActive: p?.isActive ?? true,
  };
}

function ProgramEditForm({ editing, branchId, onSaved, onCancel }: {
  editing: LoyaltyProgram | null; branchId: string | null; onSaved: () => void; onCancel: () => void;
}) {
  const [form, setForm] = useState<FormShape>(toForm(editing));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof FormShape>(k: K, v: FormShape[K]) => setForm(p => ({ ...p, [k]: v }));

  const handleLogoUpload = async (file: File) => {
    try { set("logoUrl", await fileToCompressedDataUrl(file, 300, 0.8)); }
    catch { setError("Failed to read image."); }
  };

  const handleSave = async () => {
    if (!form.programName.trim()) { setError("Program name is required."); return; }
    const payload: Partial<LoyaltyProgram> = {
      branchId: branchId ?? undefined,
      programName: form.programName.trim(),
      description: form.description.trim() || undefined,
      logoUrl: form.logoUrl || undefined,
      brandColor: form.brandColor,
      pointsPerCurrencyUnit: Number(form.pointsPerCurrencyUnit) || 0,
      redemptionValuePerPoint: Number(form.redemptionValuePerPoint) || 0,
      minPointsToRedeem: Number(form.minPointsToRedeem) || 0,
      // Explicit null, not undefined — undefined gets dropped from the JSON body entirely, which
      // makes the server's model binder silently fall back to its non-null default (50 / 365)
      // instead of actually clearing the cap/expiry. See LoyaltyProgram's comment in api.ts.
      maxRedeemPctOfOrder: form.maxRedeemPctOfOrder.trim() === "" ? null : Number(form.maxRedeemPctOfOrder),
      pointsExpiryDays: form.neverExpires ? null : Number(form.pointsExpiryDays) || 365,
      silverThreshold: Number(form.silverThreshold) || 0,
      goldThreshold: Number(form.goldThreshold) || 0,
      platinumThreshold: Number(form.platinumThreshold) || 0,
      silverEarnMultiplier: Number(form.silverEarnMultiplier) || 1,
      goldEarnMultiplier: Number(form.goldEarnMultiplier) || 1,
      platinumEarnMultiplier: Number(form.platinumEarnMultiplier) || 1,
      isActive: form.isActive,
    };
    setSaving(true); setError(null);
    try {
      if (editing) await api.updateLoyaltyProgram(editing.id, payload);
      else await api.createLoyaltyProgram(payload);
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4 mt-4">
      <FormField label="Program Name *">
        <Input value={form.programName} onChange={e => set("programName", e.target.value)} className="h-9" />
      </FormField>
      <FormField label="Description" hint="Shown to customers on the public loyalty page.">
        <Input value={form.description} onChange={e => set("description", e.target.value)} className="h-9" placeholder="Earn points on every purchase and redeem for savings." />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Logo">
          <div className="flex items-center gap-2">
            {form.logoUrl && <img src={form.logoUrl} alt="Logo" className="h-9 w-9 rounded object-cover border border-border/60" />}
            <Input type="file" accept="image/*" className="h-9 text-xs" onChange={e => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
          </div>
        </FormField>
        <FormField label="Brand Color">
          <div className="flex items-center gap-2">
            <input type="color" value={form.brandColor} onChange={e => set("brandColor", e.target.value)} className="h-9 w-10 rounded border border-border/60 cursor-pointer" />
            <Input value={form.brandColor} onChange={e => set("brandColor", e.target.value)} className="h-9" />
          </div>
        </FormField>
      </div>

      <Separator />
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Earning</p>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Points per SAR spent">
          <Input type="number" step="0.01" value={form.pointsPerCurrencyUnit} onChange={e => set("pointsPerCurrencyUnit", e.target.value)} className="h-9" />
        </FormField>
        <FormField label="Points expire after (days)" hint="Leave off for never-expiring points.">
          <div className="flex items-center gap-2">
            <Input type="number" value={form.pointsExpiryDays} disabled={form.neverExpires} onChange={e => set("pointsExpiryDays", e.target.value)} className="h-9" />
            <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
              <input type="checkbox" checked={form.neverExpires} onChange={e => set("neverExpires", e.target.checked)} /> Never
            </label>
          </div>
        </FormField>
      </div>

      <Separator />
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Redemption</p>
      <div className="grid grid-cols-3 gap-3">
        <FormField label="SAR per point">
          <Input type="number" step="0.001" value={form.redemptionValuePerPoint} onChange={e => set("redemptionValuePerPoint", e.target.value)} className="h-9" />
        </FormField>
        <FormField label="Min points to redeem">
          <Input type="number" value={form.minPointsToRedeem} onChange={e => set("minPointsToRedeem", e.target.value)} className="h-9" />
        </FormField>
        <FormField label="Max % of order">
          <Input type="number" value={form.maxRedeemPctOfOrder} onChange={e => set("maxRedeemPctOfOrder", e.target.value)} className="h-9" />
        </FormField>
      </div>

      <Separator />
      {branchId === null ? (
        <>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tiers — spend threshold &amp; earn multiplier</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Applies business-wide — every branch uses these same thresholds, so a customer's tier doesn't change depending on which branch they shop at.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Silver at (SAR)">
              <Input type="number" value={form.silverThreshold} onChange={e => set("silverThreshold", e.target.value)} className="h-9" />
            </FormField>
            <FormField label="Gold at (SAR)">
              <Input type="number" value={form.goldThreshold} onChange={e => set("goldThreshold", e.target.value)} className="h-9" />
            </FormField>
            <FormField label="Platinum at (SAR)">
              <Input type="number" value={form.platinumThreshold} onChange={e => set("platinumThreshold", e.target.value)} className="h-9" />
            </FormField>
            <FormField label="Silver multiplier">
              <Input type="number" step="0.1" value={form.silverEarnMultiplier} onChange={e => set("silverEarnMultiplier", e.target.value)} className="h-9" />
            </FormField>
            <FormField label="Gold multiplier">
              <Input type="number" step="0.1" value={form.goldEarnMultiplier} onChange={e => set("goldEarnMultiplier", e.target.value)} className="h-9" />
            </FormField>
            <FormField label="Platinum multiplier">
              <Input type="number" step="0.1" value={form.platinumEarnMultiplier} onChange={e => set("platinumEarnMultiplier", e.target.value)} className="h-9" />
            </FormField>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Tier thresholds &amp; multipliers are configured once on the <strong>Default (All Branches)</strong> program and apply everywhere — this branch's earn rate and redemption settings above are the only things that can differ here.
        </p>
      )}

      <FormField label="Status">
        <Select value={form.isActive ? "active" : "inactive"} onValueChange={v => set("isActive", v === "active")}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button className="flex-1 gradient-primary text-primary-foreground border-0" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : editing ? "Update Program" : "Create Program"}
        </Button>
        <Button variant="outline" className="flex-1" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function PublicLinkPanel({ branchId }: { branchId: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/loyalty/${branchId}`;

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card className="p-4 border-border/60 shadow-card space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Public Loyalty Page</p>
      <div className="flex items-start gap-4">
        <div className="bg-white p-2 rounded-lg border border-border/60 print:shadow-none">
          <QRCodeSVG value={url} size={112} level="M" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-xs text-muted-foreground">
            Share this link or QR code with customers — they can check their points balance and redeem value without signing in.
          </p>
          <div className="flex items-center gap-2">
            <Input value={url} readOnly className="h-8 text-xs font-mono" />
            <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={copy}>
              {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
            <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function LoyaltyProgramPage() {
  const { canCreate, canEdit } = usePermission("Loyalty Program");
  const { branches } = useBranch();
  const [programs, setPrograms] = useState<LoyaltyProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [scope, setScope] = useState<string>(DEFAULT_SCOPE);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.getLoyaltyPrograms()
      .then(list => { setPrograms(list); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const current = useMemo(
    () => programs.find(p => (scope === DEFAULT_SCOPE ? !p.branchId : p.branchId === scope)) ?? null,
    [programs, scope]
  );

  const canEditCurrent = current ? canEdit : canCreate;
  const branchName = scope === DEFAULT_SCOPE ? "Default (All Branches)" : branches.find(b => b.id === scope)?.name ?? "";

  return (
    <PageShell title="Loyalty Program" subtitle="Configure branch loyalty rewards, earning & redemption rules">
      {loadError && <LoadErrorBanner onRetry={load} />}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger className="h-9 w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_SCOPE}>Default (All Branches)</SelectItem>
            {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {canEditCurrent && (
          <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> {current ? "Edit" : "Create Override"}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading loyalty configuration…
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="p-5 border-border/60 shadow-card space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {current?.logoUrl
                  ? <img src={current.logoUrl} alt="" className="h-8 w-8 rounded object-cover" />
                  : <Gift className="h-5 w-5" style={{ color: current?.brandColor ?? "#7c3aed" }} />}
                <div>
                  <p className="font-semibold">{current?.programName ?? "Not configured — falls back to default"}</p>
                  <p className="text-xs text-muted-foreground">{branchName}</p>
                </div>
              </div>
              {current && (
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${current.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30" : "bg-muted text-muted-foreground"}`}>
                  {current.isActive ? "Active" : "Inactive"}
                </span>
              )}
            </div>

            {current ? (
              <>
                <Separator />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Earn rate</p>
                    <p className="font-semibold tabular-nums">{current.pointsPerCurrencyUnit} pt / <SARIcon />1</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Redemption value</p>
                    <p className="font-semibold tabular-nums"><SARIcon />{current.redemptionValuePerPoint} / pt</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Min to redeem</p>
                    <p className="font-semibold tabular-nums">{current.minPointsToRedeem} pts</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Max per order</p>
                    <p className="font-semibold tabular-nums">{current.maxRedeemPctOfOrder != null ? `${current.maxRedeemPctOfOrder}%` : "No cap"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Points expiry</p>
                    <p className="font-semibold tabular-nums">{current.pointsExpiryDays != null ? `${current.pointsExpiryDays} days` : "Never"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Silver / Gold / Platinum</p>
                    <p className="font-semibold tabular-nums"><SARIcon />{current.silverThreshold} / <SARIcon />{current.goldThreshold} / <SARIcon />{current.platinumThreshold}</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                This scope has no override — it inherits the default program's rates and branding.
              </p>
            )}
          </Card>

          {scope !== DEFAULT_SCOPE && <PublicLinkPanel branchId={scope} />}
        </div>
      )}

      <Sheet open={editing} onOpenChange={setEditing}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{current ? "Edit Loyalty Program" : "Create Loyalty Program Override"}</SheetTitle>
          </SheetHeader>
          <ProgramEditForm
            editing={current}
            branchId={scope === DEFAULT_SCOPE ? null : scope}
            onSaved={() => { setEditing(false); load(); }}
            onCancel={() => setEditing(false)}
          />
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
