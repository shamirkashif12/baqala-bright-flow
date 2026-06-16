import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/metric-card";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { ShieldCheck, RefreshCw, FileWarning, QrCode } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, type ZatcaInvoice } from "@/lib/api";

export const Route = createFileRoute("/_app/zatca")({ component: Zatca });

function Zatca() {
  const [invoices, setInvoices] = useState<ZatcaInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getZatcaInvoices()
      .then(setInvoices)
      .finally(() => setLoading(false));
  }, []);

  const pending = invoices.filter(i => i.zatcaStatus === "pending").length;
  const cleared = invoices.filter(i => i.zatcaStatus === "cleared" || i.zatcaStatus === "synced").length;
  const errors = invoices.filter(i => i.zatcaStatus === "failed" || i.zatcaStatus === "error").length;
  const fmt = (n: number) => `ر.س ${n.toLocaleString("en-SA", { minimumFractionDigits: 2 })}`;

  return (
    <PageShell title="ZATCA Invoices" subtitle="Phase 2 e-invoicing · live sync · Arabic + English">
      <Card className="p-6 border-success/30 bg-success/5 shadow-card">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-success/15 text-success flex items-center justify-center">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">ZATCA Phase 2 — Connected</h3>
              <Badge className="bg-success text-success-foreground border-0">Live</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">Last successful clearance: 2 minutes ago · Certificate valid until Sep 2027</p>
          </div>
          <Button variant="outline" className="gap-2"><RefreshCw className="h-4 w-4" /> Force sync</Button>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Cleared" value={String(cleared)} icon={ShieldCheck} accent="success" />
        <MetricCard label="Pending Queue" value={String(pending)} icon={RefreshCw} accent="warning" />
        <MetricCard label="Errors" value={String(errors)} icon={FileWarning} accent={errors > 0 ? "destructive" : undefined} />
        <MetricCard label="Total Invoices" value={String(invoices.length)} icon={QrCode} accent="primary" />
      </div>

      <Toolbar placeholder="Search invoice / branch / buyer…" primaryLabel="New Invoice" />

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <DataTable
          columns={[
            { key: "invoiceNumber", label: "Invoice", render: (r: ZatcaInvoice) => <span className="font-mono font-semibold text-xs">{r.invoiceNumber}</span> },
            { key: "issueDate", label: "Date", render: (r: ZatcaInvoice) => new Date(r.issueDate).toLocaleDateString("en-SA") },
            { key: "branch", label: "Branch", render: (r: ZatcaInvoice) => r.branch?.name ?? "—" },
            { key: "invoiceType", label: "Type", render: (r: ZatcaInvoice) => r.invoiceType.replace(/_/g, " ") },
            { key: "taxAmount", label: "VAT", render: (r: ZatcaInvoice) => fmt(r.taxAmount) },
            { key: "totalAmount", label: "Total", render: (r: ZatcaInvoice) => <span className="font-semibold">{fmt(r.totalAmount)}</span> },
            { key: "zatcaStatus", label: "Sync", render: (r: ZatcaInvoice) => <StatusBadge status={r.zatcaStatus} /> },
          ]}
          rows={invoices}
        />
      )}
    </PageShell>
  );
}
