import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { ShieldCheck, Ban, AlertTriangle, Lock } from "lucide-react";
import { MetricCard } from "@/components/metric-card";

export const Route = createFileRoute("/_app/compliance")({ component: Compliance });

const rules = [
  { sku: "1234599", name: "Energy Drink XL", rule: "Age-restricted (18+)", scope: "All branches", role: "Cashier+", status: "active" },
  { sku: "1234600", name: "Razor Blades", rule: "Age-restricted (15+)", scope: "All branches", role: "Cashier+", status: "active" },
  { sku: "1234601", name: "Expired SKUs (auto)", rule: "Block sale", scope: "All branches", role: "—", status: "active" },
  { sku: "1234602", name: "Imported Cheese (recall)", rule: "Recall · do not sell", scope: "Olaya, Khobar", role: "—", status: "blocked" },
  { sku: "1234603", name: "Promo SKU PROMO-22", rule: "Olaya only", scope: "Olaya", role: "Cashier+", status: "active" },
];

function Compliance() {
  return (
    <PageShell title="Compliance — Permissible Items" subtitle="Rules that the POS enforces in real time">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active Rules" value="38" icon={ShieldCheck} accent="primary" />
        <MetricCard label="Blocked SKUs" value="14" icon={Ban} accent="destructive" />
        <MetricCard label="Triggered Today" value="6" icon={AlertTriangle} accent="warning" />
        <MetricCard label="Restricted by Role" value="9" icon={Lock} />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Global toggles</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { title: "Auto-block expired items", desc: "Cashier cannot complete sale" },
            { title: "Warn 7 days before expiry", desc: "Soft warning to cashier" },
            { title: "Require manager PIN for refunds > ر.س 100", desc: "Approval workflow" },
            { title: "Restrict alcohol-like SKUs", desc: "Always blocked in KSA" },
          ].map((t) => (
            <div key={t.title} className="flex items-center justify-between gap-4 rounded-xl border border-border/60 p-3.5">
              <div><p className="font-medium text-sm">{t.title}</p><p className="text-xs text-muted-foreground">{t.desc}</p></div>
              <Switch defaultChecked />
            </div>
          ))}
        </div>
      </Card>

      <Toolbar placeholder="Search SKU / rule…" primaryLabel="Add Rule" />
      <DataTable
        columns={[
          { key: "sku", label: "SKU", render: (r) => <span className="font-mono">{r.sku}</span> },
          { key: "name", label: "Product / Rule name" },
          { key: "rule", label: "Rule" },
          { key: "scope", label: "Scope" },
          { key: "role", label: "Allowed role" },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rows={rules}
      />
    </PageShell>
  );
}