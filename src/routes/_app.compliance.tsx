import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { ShieldCheck, Ban, AlertTriangle, Lock } from "lucide-react";
import { MetricCard } from "@/components/metric-card";
import { useEffect, useState } from "react";
import { api, type TaxFeeRule } from "@/lib/api";
import { SARIcon } from "@/lib/currency";

export const Route = createFileRoute("/_app/compliance")({ component: Compliance });

function Compliance() {
  const [rules, setRules] = useState<TaxFeeRule[]>([]);

  useEffect(() => {
    api.getTaxRules().then(setRules).catch(() => {});
  }, []);

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
        <h3 className="font-semibold mb-4">Global toggles</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { title: "Auto-block expired items", desc: "Cashier cannot complete sale" },
            { title: "Warn 7 days before expiry", desc: "Soft warning to cashier" },
            { title: "Require manager PIN for refunds > SAR 100", desc: "Approval workflow" },
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
