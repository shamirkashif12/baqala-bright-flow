import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { ModuleGate } from "@/components/role-gate";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Loader2, Building2, Languages, Bell, ShieldCheck,
  Receipt, CreditCard, Database, KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { api, type ZatcaSettings } from "@/lib/api";
import { useBranch } from "@/lib/branch-context";

export const Route = createFileRoute("/_app/settings")({
  component: () => (
    <ModuleGate module="Settings">
      <Settings />
    </ModuleGate>
  ),
});

const NAV = [
  { icon: Building2,  title: "Business Profile",     desc: "Legal name, CR, logo, contact" },
  { icon: Receipt,    title: "Tax & ZATCA",           desc: "VAT registration, e-invoice settings" },
  { icon: CreditCard, title: "Payment Methods",       desc: "Mada, Visa, Apple Pay, STC Pay, Cash" },
  { icon: Languages,  title: "Language & Currency",   desc: "Arabic / English · SAR" },
  { icon: Bell,       title: "Notifications",         desc: "Email, SMS, WhatsApp alerts" },
  { icon: Database,   title: "Backup & Sync",         desc: "Cloud backup schedule and recovery" },
  { icon: ShieldCheck, title: "Security",             desc: "Password rules, session timeout, IP allowlist" },
  { icon: KeyRound,   title: "Two-Factor Auth",       desc: "TOTP, SMS OTP for admin actions" },
];

// ── helper: read a bool from the key-value store ──────────────────────────────
function kbool(kv: Record<string, string | null>, key: string, def: boolean): boolean {
  const v = kv[key];
  if (v === null || v === undefined) return def;
  return v === "1" || v === "true";
}
function kstr(kv: Record<string, string | null>, key: string, def: string): string {
  return kv[key] ?? def;
}
function b(val: boolean): string { return val ? "1" : "0"; }

function Settings() {
  const { selectedBranch } = useBranch();
  const [activeSection, setActiveSection] = useState("Business Profile");

  // ── Key-value store (tenant_settings) ────────────────────────────────────
  const [kv, setKv] = useState<Record<string, string | null>>({});
  const [kvLoading, setKvLoading] = useState(false);

  const loadKv = useCallback(() => {
    if (!selectedBranch?.id) return;
    setKvLoading(true);
    api.getTenantSettings(selectedBranch.id)
      .then(setKv)
      .catch(() => {})
      .finally(() => setKvLoading(false));
  }, [selectedBranch?.id]);

  useEffect(() => { loadKv(); }, [loadKv]);

  async function saveKv(patch: Record<string, string | null>, successMsg: string) {
    if (!selectedBranch?.id) return;
    const merged = { ...patch };
    try {
      await api.updateTenantSettings(selectedBranch.id, merged);
      setKv(prev => ({ ...prev, ...merged }));
      toast.success(successMsg);
    } catch {
      toast.error("Failed to save settings — please try again.");
    }
  }

  // ── Business Profile (Branch API) ─────────────────────────────────────────
  const [biz, setBiz] = useState({ nameEn: "", nameAr: "", cr: "", vat: "", phone: "", email: "" });
  const [bizSaving, setBizSaving] = useState(false);

  useEffect(() => {
    if (!selectedBranch) return;
    setBiz({
      nameEn: selectedBranch.name ?? "",
      nameAr: selectedBranch.nameAr ?? "",
      cr: selectedBranch.commercialRegistration ?? "",
      vat: "",
      phone: selectedBranch.contactNumber ?? "",
      email: selectedBranch.email ?? "",
    });
  }, [selectedBranch]);

  async function saveBiz() {
    if (!selectedBranch?.id) return;
    setBizSaving(true);
    try {
      await api.updateBranch(selectedBranch.id, {
        name: biz.nameEn,
        nameAr: biz.nameAr,
        contactNumber: biz.phone,
        commercialRegistration: biz.cr,
        email: biz.email,
      });
      toast.success("Business profile saved", { description: "Branch details updated." });
    } catch {
      toast.error("Failed to save business profile");
    } finally {
      setBizSaving(false);
    }
  }

  // ── ZATCA (Compliance API) ────────────────────────────────────────────────
  const [zatca, setZatca] = useState({ vatRegistrationNumber: "", sellerName: "", environment: "sandbox", phase2Enabled: false });
  const [zatcaLoading, setZatcaLoading] = useState(false);
  const [zatcaSaving, setZatcaSaving] = useState(false);

  useEffect(() => {
    if (!selectedBranch?.id || activeSection !== "Tax & ZATCA") return;
    setZatcaLoading(true);
    api.getZatcaSettings(selectedBranch.id)
      .then((data: ZatcaSettings) => setZatca({
        vatRegistrationNumber: data.vatRegistrationNumber ?? "",
        sellerName: data.sellerName ?? "",
        environment: data.environment ?? "sandbox",
        phase2Enabled: data.phase2Enabled ?? false,
      }))
      .catch(() => {})
      .finally(() => setZatcaLoading(false));
  }, [selectedBranch?.id, activeSection]);

  async function saveZatca() {
    if (!selectedBranch?.id) return;
    setZatcaSaving(true);
    try {
      await api.updateZatcaSettings(selectedBranch.id, zatca);
      toast.success("ZATCA settings saved");
    } catch {
      toast.error("Failed to save ZATCA settings");
    } finally {
      setZatcaSaving(false);
    }
  }

  // ── reusable components ───────────────────────────────────────────────────
  function ToggleRow({ label, desc, kvKey, defaultVal = true }: { label: string; desc?: string; kvKey: string; defaultVal?: boolean }) {
    const checked = kbool(kv, kvKey, defaultVal);
    return (
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 p-3.5">
        <div>
          <p className="font-medium text-sm">{label}</p>
          {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
        </div>
        <Switch
          checked={checked}
          onCheckedChange={v => setKv(prev => ({ ...prev, [kvKey]: b(v) }))}
          disabled={kvLoading}
        />
      </div>
    );
  }

  return (
    <PageShell title="Settings" subtitle="Business · tax · operations · security">
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">

        {/* Sidebar */}
        <Card className="p-3 border-border/60 shadow-card h-fit">
          <div className="space-y-1">
            {NAV.map((s) => (
              <button
                key={s.title}
                onClick={() => setActiveSection(s.title)}
                className={`w-full text-left flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                  activeSection === s.title ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground"
                }`}
              >
                <s.icon className="h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">{s.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{s.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Panels */}
        <div className="space-y-4">

          {/* ── Business Profile ── */}
          {activeSection === "Business Profile" && (
            <>
              <Card className="p-6 border-border/60 shadow-card">
                <h3 className="font-semibold text-lg">Business Profile</h3>
                <p className="text-sm text-muted-foreground">Used on every invoice, receipt and ZATCA submission.</p>
                <div className="grid sm:grid-cols-2 gap-4 mt-6">
                  <div><Label>Business name (English)</Label>
                    <Input value={biz.nameEn} onChange={e => setBiz(p => ({ ...p, nameEn: e.target.value }))} className="mt-1.5" /></div>
                  <div><Label>اسم النشاط (Arabic)</Label>
                    <Input value={biz.nameAr} onChange={e => setBiz(p => ({ ...p, nameAr: e.target.value }))} className="mt-1.5" dir="rtl" /></div>
                  <div><Label>Commercial Registration (CR)</Label>
                    <Input value={biz.cr} onChange={e => setBiz(p => ({ ...p, cr: e.target.value }))} className="mt-1.5" /></div>
                  <div><Label>VAT Number</Label>
                    <Input value={biz.vat} onChange={e => setBiz(p => ({ ...p, vat: e.target.value }))} className="mt-1.5" /></div>
                  <div><Label>Phone</Label>
                    <Input value={biz.phone} onChange={e => setBiz(p => ({ ...p, phone: e.target.value }))} className="mt-1.5" /></div>
                  <div><Label>Email</Label>
                    <Input value={biz.email} onChange={e => setBiz(p => ({ ...p, email: e.target.value }))} className="mt-1.5" /></div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <Button variant="outline" onClick={() => {}}>Cancel</Button>
                  <Button className="gradient-primary text-primary-foreground border-0 shadow-glow" onClick={saveBiz} disabled={bizSaving}>
                    {bizSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : "Save changes"}
                  </Button>
                </div>
              </Card>

              <Card className="p-6 border-border/60 shadow-card">
                <h3 className="font-semibold text-lg">Preferences</h3>
                <div className="mt-4 space-y-3">
                  <ToggleRow kvKey="pref.arabicReceipt"  label="Arabic receipt by default"      desc="Print Arabic receipt; English as secondary"            defaultVal={true} />
                  <ToggleRow kvKey="pref.blockExpired"   label="Auto-block expired items at POS" desc="Cashier cannot scan expired SKU"                         defaultVal={true} />
                  <ToggleRow kvKey="pref.whatsappInvoice" label="Send invoice via WhatsApp"     desc="Customer receives ZATCA QR by WhatsApp"                 defaultVal={true} />
                  <ToggleRow kvKey="pref.twoFactor"      label="Two-factor for admin actions"   desc="Require OTP for refunds, voids, price changes"          defaultVal={false} />
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <Button variant="outline" onClick={loadKv}>Cancel</Button>
                  <Button className="gradient-primary text-primary-foreground border-0 shadow-glow"
                    onClick={() => saveKv({
                      "pref.arabicReceipt":   kv["pref.arabicReceipt"]   ?? "1",
                      "pref.blockExpired":    kv["pref.blockExpired"]    ?? "1",
                      "pref.whatsappInvoice": kv["pref.whatsappInvoice"] ?? "1",
                      "pref.twoFactor":       kv["pref.twoFactor"]       ?? "0",
                    }, "Preferences saved")}>
                    Save changes
                  </Button>
                </div>
              </Card>
            </>
          )}

          {/* ── Tax & ZATCA ── */}
          {activeSection === "Tax & ZATCA" && (
            <Card className="p-6 border-border/60 shadow-card">
              <h3 className="font-semibold text-lg">Tax & ZATCA</h3>
              <p className="text-sm text-muted-foreground mt-1">e-Invoice phase 2 settings for ZATCA compliance.</p>
              {zatcaLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-6">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading ZATCA settings…
                </div>
              ) : (
                <>
                  <div className="grid sm:grid-cols-2 gap-4 mt-6">
                    <div><Label>VAT Registration Number</Label>
                      <Input value={zatca.vatRegistrationNumber} onChange={e => setZatca(p => ({ ...p, vatRegistrationNumber: e.target.value }))} placeholder="300012345600003" className="mt-1.5" /></div>
                    <div><Label>Seller Name (as registered with ZATCA)</Label>
                      <Input value={zatca.sellerName} onChange={e => setZatca(p => ({ ...p, sellerName: e.target.value }))} placeholder="Baqala Al Faisal Trading Co." className="mt-1.5" /></div>
                    <div><Label>Environment</Label>
                      <select value={zatca.environment} onChange={e => setZatca(p => ({ ...p, environment: e.target.value }))}
                        className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                        <option value="sandbox">Sandbox (testing)</option>
                        <option value="production">Production</option>
                      </select></div>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 p-3.5 mt-4">
                    <div>
                      <p className="font-medium text-sm">Phase 2 e-Invoicing enabled</p>
                      <p className="text-xs text-muted-foreground">Cryptographic stamp + QR on every invoice</p>
                    </div>
                    <Switch checked={zatca.phase2Enabled} onCheckedChange={v => setZatca(p => ({ ...p, phase2Enabled: v }))} />
                  </div>
                  <div className="flex justify-end gap-2 mt-6">
                    <Button variant="outline" onClick={() => {}}>Cancel</Button>
                    <Button className="gradient-primary text-primary-foreground border-0 shadow-glow" onClick={saveZatca} disabled={zatcaSaving}>
                      {zatcaSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</> : "Save ZATCA settings"}
                    </Button>
                  </div>
                </>
              )}
            </Card>
          )}

          {/* ── Payment Methods ── */}
          {activeSection === "Payment Methods" && (
            <Card className="p-6 border-border/60 shadow-card">
              <h3 className="font-semibold text-lg">Payment Methods</h3>
              <p className="text-sm text-muted-foreground mt-1">Enable or disable tender options for cashiers.</p>
              <div className="mt-4 space-y-3">
                <ToggleRow kvKey="payment.cash"         label="Cash"                  defaultVal={true} />
                <ToggleRow kvKey="payment.mada"         label="Mada (debit card)"     defaultVal={true} />
                <ToggleRow kvKey="payment.visa"         label="Visa / Mastercard"     defaultVal={true} />
                <ToggleRow kvKey="payment.applePay"     label="Apple Pay"             defaultVal={true} />
                <ToggleRow kvKey="payment.stcPay"       label="STC Pay"               defaultVal={true} />
                <ToggleRow kvKey="payment.bankTransfer" label="Bank Transfer"         defaultVal={false} />
              </div>
              <div className="flex justify-end mt-6">
                <Button className="gradient-primary text-primary-foreground border-0 shadow-glow"
                  onClick={() => saveKv({
                    "payment.cash":         kv["payment.cash"]         ?? "1",
                    "payment.mada":         kv["payment.mada"]         ?? "1",
                    "payment.visa":         kv["payment.visa"]         ?? "1",
                    "payment.applePay":     kv["payment.applePay"]     ?? "1",
                    "payment.stcPay":       kv["payment.stcPay"]       ?? "1",
                    "payment.bankTransfer": kv["payment.bankTransfer"] ?? "0",
                  }, "Payment methods saved")}>
                  Save changes
                </Button>
              </div>
            </Card>
          )}

          {/* ── Language & Currency ── */}
          {activeSection === "Language & Currency" && (
            <Card className="p-6 border-border/60 shadow-card">
              <h3 className="font-semibold text-lg">Language & Currency</h3>
              <div className="grid sm:grid-cols-2 gap-4 mt-6">
                <div><Label>Interface Language</Label>
                  <select value={kstr(kv, "lang.interface", "english")} onChange={e => setKv(p => ({ ...p, "lang.interface": e.target.value }))}
                    className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                    <option value="english">English</option>
                    <option value="arabic">Arabic</option>
                  </select></div>
                <div><Label>Currency</Label>
                  <Input value="SAR — Saudi Riyal" className="mt-1.5" readOnly /></div>
                <div><Label>Date Format</Label>
                  <select value={kstr(kv, "lang.dateFormat", "DD/MM/YYYY")} onChange={e => setKv(p => ({ ...p, "lang.dateFormat": e.target.value }))}
                    className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                    <option>DD/MM/YYYY</option>
                    <option>MM/DD/YYYY</option>
                    <option>YYYY-MM-DD</option>
                  </select></div>
                <div><Label>Time Format</Label>
                  <select value={kstr(kv, "lang.timeFormat", "12h")} onChange={e => setKv(p => ({ ...p, "lang.timeFormat": e.target.value }))}
                    className="mt-1.5 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                    <option value="12h">12-hour (AM/PM)</option>
                    <option value="24h">24-hour</option>
                  </select></div>
              </div>
              <div className="flex justify-end mt-6">
                <Button className="gradient-primary text-primary-foreground border-0 shadow-glow"
                  onClick={() => saveKv({
                    "lang.interface":  kv["lang.interface"]  ?? "english",
                    "lang.dateFormat": kv["lang.dateFormat"] ?? "DD/MM/YYYY",
                    "lang.timeFormat": kv["lang.timeFormat"] ?? "12h",
                  }, "Language settings saved")}>
                  Save changes
                </Button>
              </div>
            </Card>
          )}

          {/* ── Notifications ── */}
          {activeSection === "Notifications" && (
            <Card className="p-6 border-border/60 shadow-card">
              <h3 className="font-semibold text-lg">Notifications</h3>
              <div className="mt-4 space-y-3">
                <ToggleRow kvKey="notif.lowStock"     label="Low stock alerts by email"       desc="Sent when any SKU falls below reorder level"             defaultVal={true} />
                <ToggleRow kvKey="notif.dailySummary" label="Daily sales summary via WhatsApp" desc="End-of-day report to branch manager"                   defaultVal={true} />
                <ToggleRow kvKey="notif.shiftSms"     label="Shift open/close SMS"             desc="Manager receives SMS when cashier opens or closes a shift" defaultVal={true} />
                <ToggleRow kvKey="notif.refundAlert"  label="Refund approval requests"         desc="Push notification to manager on refund requests"         defaultVal={true} />
                <ToggleRow kvKey="notif.zatcaAlert"   label="Failed ZATCA submission alert"    desc="Email alert when e-invoice submission fails"             defaultVal={true} />
              </div>
              <div className="flex justify-end mt-6">
                <Button className="gradient-primary text-primary-foreground border-0 shadow-glow"
                  onClick={() => saveKv({
                    "notif.lowStock":     kv["notif.lowStock"]     ?? "1",
                    "notif.dailySummary": kv["notif.dailySummary"] ?? "1",
                    "notif.shiftSms":     kv["notif.shiftSms"]     ?? "1",
                    "notif.refundAlert":  kv["notif.refundAlert"]  ?? "1",
                    "notif.zatcaAlert":   kv["notif.zatcaAlert"]   ?? "1",
                  }, "Notification settings saved")}>
                  Save changes
                </Button>
              </div>
            </Card>
          )}

          {/* ── Backup & Sync ── */}
          {activeSection === "Backup & Sync" && (
            <Card className="p-6 border-border/60 shadow-card">
              <h3 className="font-semibold text-lg">Backup & Sync</h3>
              <p className="text-sm text-muted-foreground mt-1">Data is synced to the cloud every 15 minutes.</p>
              <div className="mt-4 space-y-3">
                <ToggleRow kvKey="backup.autoCloud"    label="Automatic cloud backup"    desc="Sales, inventory, and shifts backed up every hour"  defaultVal={true} />
                <ToggleRow kvKey="backup.exportOnClose" label="Export backup on shift close" desc="CSV snapshot emailed to owner on shift close"  defaultVal={false} />
              </div>
              <div className="flex justify-end mt-6">
                <Button className="gradient-primary text-primary-foreground border-0 shadow-glow"
                  onClick={() => saveKv({
                    "backup.autoCloud":    kv["backup.autoCloud"]    ?? "1",
                    "backup.exportOnClose": kv["backup.exportOnClose"] ?? "0",
                  }, "Backup settings saved")}>
                  Save changes
                </Button>
              </div>
            </Card>
          )}

          {/* ── Security ── */}
          {activeSection === "Security" && (
            <Card className="p-6 border-border/60 shadow-card">
              <h3 className="font-semibold text-lg">Security</h3>
              <div className="grid sm:grid-cols-2 gap-4 mt-6">
                <div><Label>Session timeout (minutes)</Label>
                  <Input type="number" value={kstr(kv, "security.sessionTimeout", "30")}
                    onChange={e => setKv(p => ({ ...p, "security.sessionTimeout": e.target.value }))} className="mt-1.5" /></div>
                <div><Label>Min password length</Label>
                  <Input type="number" value={kstr(kv, "security.minPassword", "8")}
                    onChange={e => setKv(p => ({ ...p, "security.minPassword": e.target.value }))} className="mt-1.5" /></div>
                <div className="sm:col-span-2"><Label>IP allowlist (comma-separated, leave blank for any)</Label>
                  <Input value={kstr(kv, "security.ipAllowlist", "")} placeholder="e.g. 192.168.1.0/24, 10.0.0.1"
                    onChange={e => setKv(p => ({ ...p, "security.ipAllowlist": e.target.value }))} className="mt-1.5" /></div>
              </div>
              <div className="flex justify-end mt-6">
                <Button className="gradient-primary text-primary-foreground border-0 shadow-glow"
                  onClick={() => saveKv({
                    "security.sessionTimeout": kv["security.sessionTimeout"] ?? "30",
                    "security.minPassword":    kv["security.minPassword"]    ?? "8",
                    "security.ipAllowlist":    kv["security.ipAllowlist"]    ?? "",
                  }, "Security settings saved")}>
                  Save changes
                </Button>
              </div>
            </Card>
          )}

          {/* ── Two-Factor Auth ── */}
          {activeSection === "Two-Factor Auth" && (
            <Card className="p-6 border-border/60 shadow-card">
              <h3 className="font-semibold text-lg">Two-Factor Auth</h3>
              <div className="mt-4 space-y-3">
                <ToggleRow kvKey="twofa.requireAdmin" label="Require 2FA for admin login"          desc="All tenant admin accounts must have 2FA enabled"          defaultVal={true} />
                <ToggleRow kvKey="twofa.smsOtp"       label="SMS OTP for refunds & voids"          desc="Manager receives OTP before approving high-value actions"  defaultVal={false} />
                <ToggleRow kvKey="twofa.totp"         label="TOTP app (Google Authenticator / Authy)" desc="Time-based OTP as alternative to SMS"                 defaultVal={true} />
              </div>
              <div className="flex justify-end mt-6">
                <Button className="gradient-primary text-primary-foreground border-0 shadow-glow"
                  onClick={() => saveKv({
                    "twofa.requireAdmin": kv["twofa.requireAdmin"] ?? "1",
                    "twofa.smsOtp":       kv["twofa.smsOtp"]       ?? "0",
                    "twofa.totp":         kv["twofa.totp"]         ?? "1",
                  }, "2FA settings saved")}>
                  Save changes
                </Button>
              </div>
            </Card>
          )}

        </div>
      </div>
    </PageShell>
  );
}
