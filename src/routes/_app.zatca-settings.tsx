import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGate } from "@/components/role-gate";
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
import {
  ShieldCheck, FileText, Building2, Receipt, RefreshCw, CheckCircle2,
  AlertTriangle, Activity, QrCode, FileWarning, Loader2, KeyRound,
} from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { api, type ZatcaSettings } from "@/lib/api";
import { useBranch } from "@/lib/branch-context";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/zatca-settings")({
  component: () => (
    <RoleGate allow={["tenant_admin"]}>
      <ZatcaSettings />
    </RoleGate>
  ),
});

const integrationLogs = [
  { id: "ZTC-LOG-9821", invoice: "INV-20260602-0142", type: "Simplified", branch: "Olaya", attempt: 1, time: "Today 14:42", status: "connected" },
  { id: "ZTC-LOG-9820", invoice: "INV-20260602-0141", type: "Credit Note", branch: "Khobar", attempt: 1, time: "Today 14:31", status: "connected" },
  { id: "ZTC-LOG-9819", invoice: "INV-20260602-0138", type: "Simplified", branch: "Jeddah", attempt: 2, time: "Today 13:18", status: "pending" },
  { id: "ZTC-LOG-9818", invoice: "INV-20260602-0135", type: "Refund", branch: "Olaya", attempt: 1, time: "Today 12:55", status: "connected" },
  { id: "ZTC-LOG-9817", invoice: "INV-20260602-0133", type: "Debit Note", branch: "Madinah", attempt: 3, time: "Today 11:09", status: "retry required" },
];

const errorLogs = [
  { id: "ERR-441", invoice: "INV-20260602-0102", code: "VR-451", reason: "Buyer VAT not provided for B2B invoice", branch: "Khobar", time: "Today 10:12", status: "failed" },
  { id: "ERR-440", invoice: "INV-20260602-0099", code: "VR-220", reason: "Signature certificate expired", branch: "Olaya", time: "Today 09:58", status: "failed" },
  { id: "ERR-439", invoice: "INV-20260601-3331", code: "VR-118", reason: "Invalid invoice timestamp format", branch: "Jeddah", time: "Yesterday", status: "retry required" },
];

function onboardingLabel(status?: string) {
  switch (status) {
    case "csr_generated": return "CSR generated";
    case "compliance_csid_obtained": return "Compliance CSID";
    case "production_ready": return "Production ready";
    default: return "Not started";
  }
}

const defaultZatca: ZatcaSettings = {
  branchId: "", vatRegistrationNumber: "", sellerName: "",
  streetName: "", buildingNumber: "", citySubdivisionName: "", postalZone: "",
  phase2Enabled: false, environment: "sandbox", onboardingStatus: "not_started",
};

function ZatcaSettings() {
  const { selectedBranch } = useBranch();
  const [zatca, setZatca] = useState<ZatcaSettings>(defaultZatca);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const enabled = zatca.phase2Enabled;

  const [otp, setOtp] = useState("");
  const [csr, setCsr] = useState<string | null>(null);
  const [csrBusy, setCsrBusy] = useState(false);
  const [otpBusy, setOtpBusy] = useState(false);
  const [prodBusy, setProdBusy] = useState(false);
  const [complianceTests, setComplianceTests] = useState<{ documentType: string; passed: boolean; apiStatus?: string }[]>([]);

  function loadSettings() {
    if (!selectedBranch?.id) return;
    setLoading(true);
    api.getZatcaSettings(selectedBranch.id)
      .then((data) => setZatca({ ...defaultZatca, ...data }))
      .catch(() => setZatca({ ...defaultZatca, branchId: selectedBranch.id }))
      .finally(() => setLoading(false));
  }

  useEffect(loadSettings, [selectedBranch?.id]);

  async function saveZatca() {
    if (!selectedBranch?.id) return;
    setSaving(true);
    try {
      const updated = await api.updateZatcaSettings(selectedBranch.id, zatca);
      setZatca(updated);
      toast.success("ZATCA settings saved");
    } catch {
      toast.error("Failed to save ZATCA settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateCsr() {
    if (!selectedBranch?.id) return;
    setCsrBusy(true);
    try {
      const result = await api.generateZatcaCsr(selectedBranch.id);
      setCsr(result.csr);
      toast.success("CSR generated — paste it into the ZATCA Fatoora portal to get an OTP");
      loadSettings();
    } catch {
      toast.error("Failed to generate CSR");
    } finally {
      setCsrBusy(false);
    }
  }

  async function handleComplianceCsid() {
    if (!selectedBranch?.id || !otp) return;
    setOtpBusy(true);
    try {
      const result = await api.getZatcaComplianceCsid(selectedBranch.id, otp);
      if (result.success) {
        toast.success("Compliance CSID obtained");
        setOtp("");
        loadSettings();
      } else {
        toast.error(result.error ?? "Failed to obtain compliance CSID");
      }
    } catch {
      toast.error("Failed to obtain compliance CSID");
    } finally {
      setOtpBusy(false);
    }
  }

  async function handleProductionCsid() {
    if (!selectedBranch?.id) return;
    setProdBusy(true);
    try {
      const result = await api.getZatcaProductionCsid(selectedBranch.id);
      setComplianceTests(result.complianceTests ?? []);
      if (result.success) {
        toast.success("Production CSID obtained — ZATCA onboarding complete");
        loadSettings();
      } else {
        toast.error(result.error ?? "Compliance tests failed — see results below");
      }
    } catch {
      toast.error("Failed to run onboarding to production");
    } finally {
      setProdBusy(false);
    }
  }

  return (
    <PageShell
      title="ZATCA Phase 2 — Billing & Orders"
      subtitle="Company billing info, invoice rules, credit/debit/refund notes and integration health"
    >
      {/* Health row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Phase 2 Status" value={enabled ? "Enabled" : "Disabled"} icon={ShieldCheck} accent={enabled ? "success" : "warning"} />
        <MetricCard label="Onboarding" value={onboardingLabel(zatca.onboardingStatus)} icon={KeyRound} accent={zatca.onboardingStatus === "production_ready" ? "success" : "warning"} />
        <MetricCard label="Environment" value={zatca.environment === "production" ? "Production" : "Sandbox"} icon={Activity} accent={zatca.environment === "production" ? "success" : "warning"} />
        <MetricCard label="EGS Serial" value={zatca.egsSerial ? "Assigned" : "Not generated"} icon={QrCode} accent={zatca.egsSerial ? "success" : "warning"} />
      </div>

      <Tabs defaultValue="company">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="company" className="gap-1.5"><Building2 className="h-4 w-4" />Company Billing</TabsTrigger>
          <TabsTrigger value="invoice" className="gap-1.5"><Receipt className="h-4 w-4" />Invoice Config</TabsTrigger>
          <TabsTrigger value="orders" className="gap-1.5"><FileText className="h-4 w-4" />Order Billing</TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5"><FileText className="h-4 w-4" />Credit / Debit</TabsTrigger>
          <TabsTrigger value="refund" className="gap-1.5"><Receipt className="h-4 w-4" />Refund Invoice</TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5"><Activity className="h-4 w-4" />Integration Logs</TabsTrigger>
          <TabsTrigger value="errors" className="gap-1.5"><AlertTriangle className="h-4 w-4" />Error Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="mt-4 space-y-4">
          <Card className="p-6 border-success/30 bg-success/5 shadow-card">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4 min-w-0">
                <div className="h-12 w-12 rounded-xl bg-success/15 text-success flex items-center justify-center shrink-0"><ShieldCheck className="h-6 w-6" /></div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold truncate">ZATCA Phase 2 — {selectedBranch?.name ?? "Select a branch"}</h3>
                    <Badge className={zatca.onboardingStatus === "production_ready" ? "bg-success text-success-foreground border-0" : "bg-warning text-warning-foreground border-0"}>
                      {onboardingLabel(zatca.onboardingStatus)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">Applied automatically on every billing & order issued from POS / MPOS / Web</p>
                </div>
              </div>
              <Switch checked={enabled} onCheckedChange={v => setZatca(p => ({ ...p, phase2Enabled: v }))} />
            </div>
          </Card>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading ZATCA settings…</div>
          ) : !selectedBranch ? (
            <p className="text-sm text-muted-foreground">Select a branch to configure ZATCA.</p>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="p-5 space-y-3">
                  <h4 className="font-semibold text-sm">Company information</h4>
                  <div className="space-y-1"><Label className="text-xs">Seller name (as registered with ZATCA)</Label>
                    <Input className="h-9" value={zatca.sellerName ?? ""} onChange={e => setZatca(p => ({ ...p, sellerName: e.target.value }))} placeholder={selectedBranch.name} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-xs">VAT Number</Label>
                      <Input className="h-9" value={zatca.vatRegistrationNumber ?? ""} onChange={e => setZatca(p => ({ ...p, vatRegistrationNumber: e.target.value }))} placeholder="300012345600003" /></div>
                    <div className="space-y-1"><Label className="text-xs">CR Number (branch)</Label>
                      <Input className="h-9" value={selectedBranch.commercialRegistration ?? ""} disabled title="Edit on the Branches page" /></div>
                  </div>
                  <div className="space-y-1"><Label className="text-xs">Environment</Label>
                    <select value={zatca.environment} onChange={e => setZatca(p => ({ ...p, environment: e.target.value }))}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                      <option value="sandbox">Sandbox (developer portal)</option>
                      <option value="simulation">Simulation</option>
                      <option value="production">Production</option>
                    </select></div>
                  <div className="flex justify-end">
                    <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow" onClick={saveZatca} disabled={saving}>
                      {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : "Save company info"}
                    </Button>
                  </div>
                </Card>
                <Card className="p-5 space-y-3">
                  <h4 className="font-semibold text-sm">Registered address</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-xs">Street name</Label>
                      <Input className="h-9" value={zatca.streetName ?? ""} onChange={e => setZatca(p => ({ ...p, streetName: e.target.value }))} /></div>
                    <div className="space-y-1"><Label className="text-xs">Building number</Label>
                      <Input className="h-9" value={zatca.buildingNumber ?? ""} onChange={e => setZatca(p => ({ ...p, buildingNumber: e.target.value }))} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1"><Label className="text-xs">City subdivision (district)</Label>
                      <Input className="h-9" value={zatca.citySubdivisionName ?? ""} onChange={e => setZatca(p => ({ ...p, citySubdivisionName: e.target.value }))} /></div>
                    <div className="space-y-1"><Label className="text-xs">Postal zone</Label>
                      <Input className="h-9" value={zatca.postalZone ?? ""} onChange={e => setZatca(p => ({ ...p, postalZone: e.target.value }))} /></div>
                  </div>
                  <div className="space-y-1"><Label className="text-xs">City</Label>
                    <Input className="h-9" value={selectedBranch.city ?? ""} disabled title="Edit on the Branches page" /></div>
                  <div className="flex justify-end">
                    <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow" onClick={saveZatca} disabled={saving}>
                      {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : "Save address"}
                    </Button>
                  </div>
                </Card>
              </div>

              <Card className="p-5 space-y-4">
                <div className="flex items-center gap-2"><KeyRound className="h-4 w-4" /><h4 className="font-semibold text-sm">ZATCA onboarding</h4></div>
                <p className="text-xs text-muted-foreground">Complete these three steps once per branch to start submitting real invoices to ZATCA.</p>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-border/60 p-3.5 space-y-2">
                    <div className="flex items-center justify-between"><span className="text-sm font-medium">1. Generate CSR</span>{zatca.hasCsr && <CheckCircle2 className="h-4 w-4 text-success" />}</div>
                    <p className="text-xs text-muted-foreground">Creates a signing key and certificate request for this branch.</p>
                    <Button size="sm" variant="outline" className="w-full" onClick={handleGenerateCsr} disabled={csrBusy}>
                      {csrBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : zatca.hasCsr ? "Regenerate CSR" : "Generate CSR"}
                    </Button>
                    {csr && (
                      <div className="space-y-1">
                        <Label className="text-[11px]">Paste this CSR into the ZATCA Fatoora portal to get an OTP</Label>
                        <textarea readOnly value={csr} className="w-full h-20 text-[10px] font-mono rounded-md border border-input p-2 bg-muted/40" onFocus={e => e.target.select()} />
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-border/60 p-3.5 space-y-2">
                    <div className="flex items-center justify-between"><span className="text-sm font-medium">2. Compliance CSID</span>{zatca.hasComplianceCsid && <CheckCircle2 className="h-4 w-4 text-success" />}</div>
                    <p className="text-xs text-muted-foreground">Enter the OTP ZATCA gave you for the CSR above.</p>
                    <Input className="h-9" placeholder="OTP from Fatoora portal" value={otp} onChange={e => setOtp(e.target.value)} disabled={!zatca.hasCsr} />
                    <Button size="sm" variant="outline" className="w-full" onClick={handleComplianceCsid} disabled={otpBusy || !otp || !zatca.hasCsr}>
                      {otpBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Get Compliance CSID"}
                    </Button>
                  </div>

                  <div className="rounded-xl border border-border/60 p-3.5 space-y-2">
                    <div className="flex items-center justify-between"><span className="text-sm font-medium">3. Go to Production</span>{zatca.hasProductionCsid && <CheckCircle2 className="h-4 w-4 text-success" />}</div>
                    <p className="text-xs text-muted-foreground">Runs the 6 required compliance checks, then requests the Production CSID.</p>
                    <Button size="sm" variant="outline" className="w-full" onClick={handleProductionCsid} disabled={prodBusy || !zatca.hasComplianceCsid}>
                      {prodBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Run Compliance Tests & Get Production CSID"}
                    </Button>
                  </div>
                </div>

                {complianceTests.length > 0 && (
                  <DataTable
                    columns={[
                      { key: "documentType", label: "Document" },
                      { key: "apiStatus", label: "ZATCA status", render: r => <span className="font-mono text-xs">{r.apiStatus ?? "—"}</span> },
                      { key: "passed", label: "Result", render: r => <StatusBadge status={r.passed ? "passed" : "failed"} /> },
                    ]}
                    rows={complianceTests}
                  />
                )}
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="invoice" className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Card className="p-5 space-y-3">
              <h4 className="font-semibold text-sm">Invoice types enabled</h4>
              {["Simplified Tax Invoice", "Standard Tax Invoice", "Credit Note", "Debit Note", "Refund Invoice"].map((t, i) => (
                <div key={t} className="flex items-center justify-between rounded-xl border border-border/60 p-3"><span className="text-sm">{t}</span><Switch defaultChecked={i < 4} /></div>
              ))}
            </Card>
            <Card className="p-5 space-y-3">
              <h4 className="font-semibold text-sm">Invoice numbering sequence</h4>
              <div className="space-y-1"><Label className="text-xs">Prefix</Label><Input className="h-9" defaultValue="INV-" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-xs">Pattern</Label><Input className="h-9" defaultValue="YYYYMMDD-####" /></div>
                <div className="space-y-1"><Label className="text-xs">Next number</Label><Input className="h-9" defaultValue="0143" /></div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3"><span className="text-sm">Reset numbering daily</span><Switch defaultChecked /></div>
              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3"><span className="text-sm">Auto-attach QR to every invoice</span><Switch defaultChecked /></div>
            </Card>
          </div>
          <Card className="p-5 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h4 className="font-semibold text-sm">Invoice QR preview</h4>
              <Badge variant="outline" className="bg-success/10 text-success border-success/30">Compliant TLV</Badge>
            </div>
            <div className="flex flex-wrap gap-4 items-center">
              <div className="h-32 w-32 rounded-2xl bg-foreground/95 flex items-center justify-center"><QrCode className="h-20 w-20 text-background" /></div>
              <div className="text-xs space-y-1 font-mono text-muted-foreground min-w-0">
                <div>seller: Baqala Mart Trading Co.</div>
                <div>vat: 300012345600003</div>
                <div>timestamp: 2026-06-02T14:42:01Z</div>
                <div>total: 60.95 SAR · vat: 7.95 SAR</div>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="mt-4 space-y-3">
          <Card className="p-5 space-y-3">
            <h4 className="font-semibold text-sm">Order → Invoice mapping</h4>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs">When to issue invoice</Label>
                <Select defaultValue="on_pay"><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on_pay">On payment</SelectItem>
                    <SelectItem value="on_confirm">On order confirmation</SelectItem>
                    <SelectItem value="on_dispatch">On dispatch</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label className="text-xs">Failure behaviour</Label>
                <Select defaultValue="queue"><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="queue">Queue offline & retry</SelectItem>
                    <SelectItem value="block">Block the sale</SelectItem>
                    <SelectItem value="warn">Warn cashier & continue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {["Auto-issue for online orders", "Send invoice over WhatsApp", "Send invoice over email", "Include branch logo"].map((t, i) => (
              <div key={t} className="flex items-center justify-between rounded-xl border border-border/60 p-3"><span className="text-sm">{t}</span><Switch defaultChecked={i !== 3} /></div>
            ))}
          </Card>
          <Card className="p-5 space-y-3">
            <h4 className="font-semibold text-sm">Offline invoice queue</h4>
            <DataTable
              columns={[
                { key: "id", label: "Order", render: r => <span className="font-mono text-xs">{r.id}</span> },
                { key: "branch", label: "Branch" },
                { key: "amt", label: "Amount" },
                { key: "queued", label: "Queued since" },
                { key: "status", label: "Status", render: r => <StatusBadge status={r.status} /> },
                { key: "_a", label: "", render: () => <Button size="sm" variant="outline" className="h-7 gap-1"><RefreshCw className="h-3 w-3" />Retry</Button> },
              ]}
              rows={[
                { id: "ORD-9912", branch: "Khobar", amt: "SAR 142.50", queued: "12 min", status: "pending" },
                { id: "ORD-9908", branch: "Jeddah", amt: "SAR 92.00", queued: "44 min", status: "pending" },
                { id: "ORD-9904", branch: "Madinah", amt: "SAR 318.40", queued: "1h 8m", status: "retry required" },
              ]}
            />
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Card className="p-5 space-y-3">
              <h4 className="font-semibold text-sm">Credit note rules</h4>
              <div className="space-y-1"><Label className="text-xs">Default reason</Label>
                <Select defaultValue="return"><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="return">Customer return</SelectItem>
                    <SelectItem value="discount">Post-sale discount</SelectItem>
                    <SelectItem value="error">Billing error</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3"><span className="text-sm">Require manager approval</span><Switch defaultChecked /></div>
              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3"><span className="text-sm">Auto link to original invoice</span><Switch defaultChecked /></div>
            </Card>
            <Card className="p-5 space-y-3">
              <h4 className="font-semibold text-sm">Debit note rules</h4>
              <div className="space-y-1"><Label className="text-xs">Default reason</Label>
                <Select defaultValue="under"><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="under">Under-billing correction</SelectItem>
                    <SelectItem value="extra">Additional service charge</SelectItem>
                    <SelectItem value="tax">Tax recalculation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3"><span className="text-sm">Require manager approval</span><Switch defaultChecked /></div>
              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3"><span className="text-sm">Notify customer automatically</span><Switch /></div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="refund" className="mt-4 space-y-3">
          <Card className="p-5 space-y-3">
            <h4 className="font-semibold text-sm">Refund invoice settings</h4>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs">Refund invoice prefix</Label><Input className="h-9" defaultValue="REF-" /></div>
              <div className="space-y-1"><Label className="text-xs">Maximum refund window</Label><Input className="h-9" defaultValue="14 days" /></div>
            </div>
            {["Reverse VAT on refund","Reverse tobacco excise on refund","Reverse custom fees on refund","Print refund receipt automatically"].map((t)=>(
              <div key={t} className="flex items-center justify-between rounded-xl border border-border/60 p-3"><span className="text-sm">{t}</span><Switch defaultChecked /></div>
            ))}
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-4 space-y-3">
          <FilterBar placeholder="Search by invoice, branch, status…" />
          <DataTable
            columns={[
              { key: "id", label: "Log ID", render: r => <span className="font-mono text-xs">{r.id}</span> },
              { key: "invoice", label: "Invoice", render: r => <span className="font-mono text-xs">{r.invoice}</span> },
              { key: "type", label: "Type" },
              { key: "branch", label: "Branch" },
              { key: "attempt", label: "Attempt", render: r => <span className="tabular-nums">×{r.attempt}</span> },
              { key: "time", label: "Time" },
              { key: "status", label: "Status", render: r => <StatusBadge status={r.status} /> },
              { key: "_a", label: "", render: r => r.status !== "connected" ? <Button size="sm" variant="outline" className="h-7 gap-1"><RefreshCw className="h-3 w-3" />Retry</Button> : <CheckCircle2 className="h-4 w-4 text-success" /> },
            ]}
            rows={integrationLogs}
          />
        </TabsContent>

        <TabsContent value="errors" className="mt-4 space-y-3">
          <FilterBar placeholder="Search by invoice, error code…" />
          <DataTable
            columns={[
              { key: "id", label: "Error ID", render: r => <span className="font-mono text-xs">{r.id}</span> },
              { key: "invoice", label: "Invoice", render: r => <span className="font-mono text-xs">{r.invoice}</span> },
              { key: "code", label: "Code", render: r => <Badge variant="outline" className="font-mono text-xs">{r.code}</Badge> },
              { key: "reason", label: "Reason" },
              { key: "branch", label: "Branch" },
              { key: "time", label: "Time" },
              { key: "status", label: "Status", render: r => <StatusBadge status={r.status} /> },
              { key: "_a", label: "", render: () => <Button size="sm" variant="outline" className="h-7 gap-1"><RefreshCw className="h-3 w-3" />Retry submission</Button> },
            ]}
            rows={errorLogs}
          />
        </TabsContent>
      </Tabs>

      <Card className="p-4 border-border/60 shadow-card text-xs flex items-center justify-between flex-wrap gap-2">
        <span className="text-muted-foreground">Last successful sync to ZATCA Fatoora · <span className="font-semibold text-foreground">Today 14:42:08 · 142 invoices cleared</span></span>
        <Link to="/zatca" className="text-primary font-semibold hover:underline">Open ZATCA invoice history →</Link>
      </Card>
    </PageShell>
  );
}