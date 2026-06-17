import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/role-gate";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Building2, Languages, Bell, ShieldCheck, Receipt, CreditCard, Database, KeyRound } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  component: () => (
    <RoleGate allow={["tenant_admin", "branch_manager"]}>
      <Settings />
    </RoleGate>
  ),
});

const sections = [
  { icon: Building2, title: "Business Profile", desc: "Legal name, CR, logo, contact" },
  { icon: Receipt, title: "Tax & ZATCA", desc: "VAT registration, e-invoice settings" },
  { icon: CreditCard, title: "Payment Methods", desc: "Mada, Visa, Apple Pay, STC Pay, Cash" },
  { icon: Languages, title: "Language & Currency", desc: "Arabic / English · SAR" },
  { icon: Bell, title: "Notifications", desc: "Email, SMS, WhatsApp alerts" },
  { icon: Database, title: "Backup & Sync", desc: "Cloud backup schedule and recovery" },
  { icon: ShieldCheck, title: "Security", desc: "Password rules, session timeout, IP allowlist" },
  { icon: KeyRound, title: "Two-Factor Auth", desc: "TOTP, SMS OTP for admin actions" },
];

function Settings() {
  return (
    <PageShell title="Settings" subtitle="Business · tax · operations · security">
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="p-3 border-border/60 shadow-card h-fit">
          <div className="space-y-1">
            {sections.map((s, i) => (
              <button key={s.title} className={`w-full text-left flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${i === 0 ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}>
                <s.icon className="h-4 w-4 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">{s.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{s.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </Card>
        <div className="space-y-4">
          <Card className="p-6 border-border/60 shadow-card">
            <h3 className="font-semibold text-lg">Business Profile</h3>
            <p className="text-sm text-muted-foreground">Used on every invoice, receipt and ZATCA submission.</p>
            <div className="grid sm:grid-cols-2 gap-4 mt-6">
              <div><Label>Business name (English)</Label><Input defaultValue="Baqala Al Faisal Trading Co." className="mt-1.5" /></div>
              <div><Label>اسم النشاط (Arabic)</Label><Input defaultValue="مؤسسة بقالة الفيصل التجارية" className="mt-1.5" dir="rtl" /></div>
              <div><Label>Commercial Registration (CR)</Label><Input defaultValue="1010123456" className="mt-1.5" /></div>
              <div><Label>VAT Number</Label><Input defaultValue="300012345600003" className="mt-1.5" /></div>
              <div><Label>Phone</Label><Input defaultValue="+966 11 234 5678" className="mt-1.5" /></div>
              <div><Label>Email</Label><Input defaultValue="ops@baqala-faisal.sa" className="mt-1.5" /></div>
            </div>
          </Card>
          <Card className="p-6 border-border/60 shadow-card">
            <h3 className="font-semibold text-lg">Preferences</h3>
            <div className="mt-4 space-y-3">
              {[
                { title: "Arabic receipt by default", desc: "Print Arabic receipt; English as secondary", on: true },
                { title: "Auto-block expired items at POS", desc: "Cashier cannot scan expired SKU", on: true },
                { title: "Send invoice via WhatsApp", desc: "Customer receives ZATCA QR by WhatsApp", on: true },
                { title: "Two-factor for admin actions", desc: "Require OTP for refunds, voids, price changes", on: false },
              ].map((p) => (
                <div key={p.title} className="flex items-center justify-between gap-4 rounded-xl border border-border/60 p-3.5">
                  <div><p className="font-medium text-sm">{p.title}</p><p className="text-xs text-muted-foreground">{p.desc}</p></div>
                  <Switch defaultChecked={p.on} />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline">Cancel</Button>
              <Button className="gradient-primary text-primary-foreground border-0 shadow-glow">Save changes</Button>
            </div>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}