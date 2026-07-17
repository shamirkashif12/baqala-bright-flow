import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ModuleGate } from "@/components/role-gate";
import { PageShell } from "@/components/app-topbar";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, type PosSettingsRecord } from "@/lib/api";
import { useBranch } from "@/lib/branch-context";
import { BranchFilter } from "@/components/branch-filter";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/pos-settings")({
  component: () => (
    <ModuleGate module="Settings">
      <PosSettings />
    </ModuleGate>
  ),
});

type S = Omit<PosSettingsRecord, "id" | "branchId">;

const DEFAULTS: S = {
  requireShiftOpen: true,
  requireOpeningCashCount: true,
  autoLockIdle: true,
  allowCustomerViewPaidShifts: false,
  allowTerminalSwitching: true,
  preserveHeldOrders: true,
  offlineModeEnabled: false,
  autoPrintReceipt: true,
  sendSmsInvoice: false,
  cashierCanDiscount: true,
  cashierCanCoupon: true,
  cashierCanRefund: false,
  cashierCanHoldOrder: true,
  cashierCanEditOrder: false,
  requireReasonForVoid: true,
  requireManagerApprovalForRefund: true,
  allowNegativeStock: false,
  beepOnScan: true,
  warnNearExpiry: true,
  allowNearExpirySale: true,
  blockExpiredItems: true,
  blockNonpermissibleItems: true,
};

function Row({
  title, desc, checked, onChange,
}: {
  title: string; desc?: string;
  checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border/60 hover:border-primary/40 transition-colors">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input className="h-9" defaultValue={value} />
    </div>
  );
}

function PosSettings() {
  const { user } = useAuth();
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

  const [s, setS] = useState<S>(DEFAULTS);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  function loadSettings() {
    if (!branchId) return;
    setLoading(true);
    api.getPosSettings(branchId)
      .then((data: PosSettingsRecord) => {
        setS({
          requireShiftOpen:               data.requireShiftOpen              ?? DEFAULTS.requireShiftOpen,
          requireOpeningCashCount:        data.requireOpeningCashCount       ?? DEFAULTS.requireOpeningCashCount,
          autoLockIdle:                   data.autoLockIdle                  ?? DEFAULTS.autoLockIdle,
          allowCustomerViewPaidShifts:    data.allowCustomerViewPaidShifts   ?? DEFAULTS.allowCustomerViewPaidShifts,
          allowTerminalSwitching:         data.allowTerminalSwitching        ?? DEFAULTS.allowTerminalSwitching,
          preserveHeldOrders:             data.preserveHeldOrders            ?? DEFAULTS.preserveHeldOrders,
          offlineModeEnabled:             data.offlineModeEnabled            ?? DEFAULTS.offlineModeEnabled,
          autoPrintReceipt:               data.autoPrintReceipt              ?? DEFAULTS.autoPrintReceipt,
          sendSmsInvoice:                 data.sendSmsInvoice                ?? DEFAULTS.sendSmsInvoice,
          cashierCanDiscount:             data.cashierCanDiscount            ?? DEFAULTS.cashierCanDiscount,
          cashierCanCoupon:               data.cashierCanCoupon              ?? DEFAULTS.cashierCanCoupon,
          cashierCanRefund:               data.cashierCanRefund              ?? DEFAULTS.cashierCanRefund,
          cashierCanHoldOrder:            data.cashierCanHoldOrder           ?? DEFAULTS.cashierCanHoldOrder,
          cashierCanEditOrder:            data.cashierCanEditOrder           ?? DEFAULTS.cashierCanEditOrder,
          requireReasonForVoid:           data.requireReasonForVoid          ?? DEFAULTS.requireReasonForVoid,
          requireManagerApprovalForRefund: data.requireManagerApprovalForRefund ?? DEFAULTS.requireManagerApprovalForRefund,
          allowNegativeStock:             data.allowNegativeStock            ?? DEFAULTS.allowNegativeStock,
          beepOnScan:                     data.beepOnScan                    ?? DEFAULTS.beepOnScan,
          warnNearExpiry:                 data.warnNearExpiry                ?? DEFAULTS.warnNearExpiry,
          allowNearExpirySale:            data.allowNearExpirySale           ?? DEFAULTS.allowNearExpirySale,
          blockExpiredItems:              data.blockExpiredItems             ?? DEFAULTS.blockExpiredItems,
          blockNonpermissibleItems:       data.blockNonpermissibleItems      ?? DEFAULTS.blockNonpermissibleItems,
        });
        setLoadError(false);
        setLoading(false);
      })
      .catch(() => {
        // Do NOT fall back to DEFAULTS here — that would let a subsequent Save silently
        // overwrite this branch's real saved settings. Leave `s` and `loading` untouched
        // (Save stays disabled while loading=true) until Retry succeeds.
        setLoadError(true);
      });
  }

  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  function t(key: keyof S) {
    return (v: boolean) => setS(prev => ({ ...prev, [key]: v }));
  }

  async function handleSave() {
    if (!branchId) return;
    setSaving(true);
    try {
      await api.updatePosSettings(branchId, { ...s, branchId });
      toast.success("POS settings saved", { description: "All changes applied to this branch." });
    } catch {
      toast.error("Failed to save POS settings", { description: "Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell
      title="POS Settings"
      subtitle="Configure cashier, terminal, payments, printing and permissions"
      actions={<BranchFilter branches={branches} value={branchId} onChange={setBranchId} locked={!!lockedBranchId} />}
    >
      {loadError && (
        <LoadErrorBanner
          onRetry={loadSettings}
          message="Failed to load this branch's POS settings — showing may be stale or unavailable. Saving is disabled until this loads successfully."
        />
      )}

      {loading && !loadError && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading settings…
        </div>
      )}

      <Tabs defaultValue="cashier">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="cashier">Cashier</TabsTrigger>
          <TabsTrigger value="terminal">Terminal</TabsTrigger>
          <TabsTrigger value="payment">Payments</TabsTrigger>
          <TabsTrigger value="invoice">Invoice</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="scan">Scan & Expiry</TabsTrigger>
          <TabsTrigger value="card">Card Machine</TabsTrigger>
          <TabsTrigger value="printer">Printer</TabsTrigger>
        </TabsList>

        {/* ── Cashier ── */}
        <TabsContent value="cashier" className="space-y-3 mt-4">
          <Row title="Require shift open before any sale"
            desc="Cashier must open a shift before the POS accepts transactions"
            checked={s.requireShiftOpen} onChange={t("requireShiftOpen")} />
          <Row title="Require opening cash count"
            desc="Cashier must enter drawer float when opening a shift"
            checked={s.requireOpeningCashCount} onChange={t("requireOpeningCashCount")} />
          <Row title="Auto-lock after idle 5 minutes"
            desc="Requires PIN to unlock when cashier walks away"
            checked={s.autoLockIdle} onChange={t("autoLockIdle")} />
          <Row title="Allow cashier to view past shifts"
            desc="Cashier can see their own historical shift reports"
            checked={s.allowCustomerViewPaidShifts} onChange={t("allowCustomerViewPaidShifts")} />
        </TabsContent>

        {/* ── Terminal ── */}
        <TabsContent value="terminal" className="space-y-3 mt-4">
          <Card className="p-4 grid sm:grid-cols-2 gap-3">
            <Field label="Terminal Name Prefix" value="TML-RYD-" />
            <Field label="Default Branch" value="Olaya" />
            <Field label="Currency" value="SAR" />
            <Field label="Receipt Width (mm)" value="80" />
          </Card>
          <Row title="Allow terminal switching for cashier"
            desc="Cashier can log into any terminal within the branch"
            checked={s.allowTerminalSwitching} onChange={t("allowTerminalSwitching")} />
          <Row title="Preserve held orders across terminal switch"
            desc="Held orders remain accessible when cashier switches terminals"
            checked={s.preserveHeldOrders} onChange={t("preserveHeldOrders")} />
          <Row title="Offline mode (POS works without internet)"
            desc="Transactions queue locally and sync when back online"
            checked={s.offlineModeEnabled} onChange={t("offlineModeEnabled")} />
        </TabsContent>

        {/* ── Payments (non-DB — payment methods managed separately) ── */}
        <TabsContent value="payment" className="space-y-3 mt-4">
          {["Cash", "Card", "Wallet (STC Pay / Apple Pay)", "Bank Transfer", "Split Payment", "Other"].map(p => (
            <div key={p} className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border/60 hover:border-primary/40 transition-colors">
              <div>
                <p className="text-sm font-medium">{p}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Enable {p} as a tender option</p>
              </div>
              <Switch defaultChecked />
            </div>
          ))}
        </TabsContent>

        {/* ── Invoice ── */}
        <TabsContent value="invoice" className="space-y-3 mt-4">
          <Card className="p-4 grid sm:grid-cols-2 gap-3">
            <Field label="Invoice Prefix" value="INV-" />
            <Field label="Footer Message" value="شكراً لزيارتكم — Thank you for shopping" />
            <Field label="VAT %" value="15" />
            <Field label="ZATCA QR Position" value="Bottom Center" />
          </Card>
          <Row title="Auto-print invoice after charge"
            checked={s.autoPrintReceipt} onChange={t("autoPrintReceipt")} />
          <Row title="Send invoice by SMS"
            desc="Customer receives a link to the digital invoice via SMS"
            checked={s.sendSmsInvoice} onChange={t("sendSmsInvoice")} />
        </TabsContent>

        {/* ── Permissions ── */}
        <TabsContent value="permissions" className="space-y-3 mt-4">
          <Row title="Cashier can apply discount"
            checked={s.cashierCanDiscount} onChange={t("cashierCanDiscount")} />
          <Row title="Cashier can apply coupon"
            checked={s.cashierCanCoupon} onChange={t("cashierCanCoupon")} />
          <Row title="Cashier can process refund"
            desc="Without this, refunds always require a manager"
            checked={s.cashierCanRefund} onChange={t("cashierCanRefund")} />
          <Row title="Cashier can hold orders"
            checked={s.cashierCanHoldOrder} onChange={t("cashierCanHoldOrder")} />
          <Row title="Cashier can edit completed orders"
            checked={s.cashierCanEditOrder} onChange={t("cashierCanEditOrder")} />
          <Row title="Require reason for void"
            desc="Cashier must enter a reason when voiding a transaction"
            checked={s.requireReasonForVoid} onChange={t("requireReasonForVoid")} />
          <Row title="Manager approval required for all refunds"
            desc="Manager must approve via PIN before any refund completes"
            checked={s.requireManagerApprovalForRefund} onChange={t("requireManagerApprovalForRefund")} />
          <Row title="Allow negative stock"
            desc="Transactions can proceed even when inventory is at zero or below"
            checked={s.allowNegativeStock} onChange={t("allowNegativeStock")} />
        </TabsContent>

        {/* ── Scan & Expiry ── */}
        <TabsContent value="scan" className="space-y-3 mt-4">
          <Row title="Beep on successful scan"
            desc="Audible confirmation when a barcode is scanned"
            checked={s.beepOnScan} onChange={t("beepOnScan")} />
          <Row title="Warn cashier on close-to-expiry items"
            desc="Show a warning for items expiring within 7 days"
            checked={s.warnNearExpiry} onChange={t("warnNearExpiry")} />
          <Row title="Allow sale of close-to-expiry with confirmation"
            desc="Cashier must confirm before scanning a near-expiry item"
            checked={s.allowNearExpirySale} onChange={t("allowNearExpirySale")} />
          <Row title="Block sale of expired items"
            desc="POS rejects scan of any item past its expiry date"
            checked={s.blockExpiredItems} onChange={t("blockExpiredItems")} />
          <Row title="Block non-permissible items (KSA compliance)"
            desc="Prevent scanning of products restricted under Saudi regulations"
            checked={s.blockNonpermissibleItems} onChange={t("blockNonpermissibleItems")} />
        </TabsContent>

        {/* ── Card Machine (non-DB config) ── */}
        <TabsContent value="card" className="space-y-3 mt-4">
          <Card className="p-4 grid sm:grid-cols-2 gap-3">
            <Field label="Card Machine Vendor" value="Geidea" />
            <Field label="Terminal Pairing Code" value="GD-4892-RYD" />
            <Field label="Connection" value="Bluetooth" />
            <Field label="Timeout (sec)" value="45" />
          </Card>
          <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border/60 hover:border-primary/40 transition-colors">
            <div>
              <p className="text-sm font-medium">Auto-send amount to card machine</p>
            </div>
            <Switch defaultChecked />
          </div>
        </TabsContent>

        {/* ── Printer (non-DB config) ── */}
        <TabsContent value="printer" className="space-y-3 mt-4">
          <Card className="p-4 grid sm:grid-cols-2 gap-3">
            <Field label="Printer Brand" value="Epson TM-T20III" />
            <Field label="Connection" value="USB" />
            <Field label="Paper Width" value="80mm" />
            <Field label="Cash Drawer Pulse" value="Pin 2" />
          </Card>
          <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border/60 hover:border-primary/40 transition-colors">
            <div>
              <p className="text-sm font-medium">Open cash drawer after cash sale</p>
            </div>
            <Switch defaultChecked />
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button
          className="gradient-primary text-primary-foreground border-0"
          onClick={handleSave}
          disabled={saving || loading}
        >
          {saving ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>
          ) : "Save Settings"}
        </Button>
      </div>
    </PageShell>
  );
}
