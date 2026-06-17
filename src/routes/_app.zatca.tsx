import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/metric-card";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { ShieldCheck, RefreshCw, FileWarning, QrCode } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/zatca")({ component: Zatca });

const invoices = [
  { inv: "INV-20260602-0142", time: "14:32", branch: "Olaya", total: "ر.س 56.00", vat: "ر.س 7.30", type: "Simplified", status: "synced" },
  { inv: "INV-20260602-0141", time: "14:28", branch: "Olaya", total: "ر.س 18.50", vat: "ر.س 2.41", type: "Simplified", status: "synced" },
  { inv: "INV-20260602-0140", time: "14:21", branch: "Khobar", total: "ر.س 142.30", vat: "ر.س 18.56", type: "Tax Invoice", status: "synced" },
  { inv: "CN-20260602-0011", time: "13:50", branch: "Jeddah", total: "- ر.س 12.00", vat: "- ر.س 1.57", type: "Credit Note", status: "synced" },
  { inv: "INV-20260602-0136", time: "14:02", branch: "Olaya", total: "ر.س 78.20", vat: "ر.س 10.20", type: "Simplified", status: "pending" },
];

function Zatca() {
  return (
    <PageShell title="ZATCA Invoices" subtitle="VAT invoices · live sync · Arabic + English">
      <Card className="p-6 border-success/30 bg-success/5 shadow-card">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-success/15 text-success flex items-center justify-center">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2"><h3 className="font-semibold">ZATCA — Connected</h3><Badge className="bg-success text-success-foreground border-0">Live</Badge></div>
            <p className="text-sm text-muted-foreground mt-0.5">Last successful clearance: 2 minutes ago · Certificate valid until Sep 2027</p>
          </div>
          <Button variant="outline" className="gap-2"><RefreshCw className="h-4 w-4" /> Force sync</Button>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Cleared Today" value="1,278" icon={ShieldCheck} accent="success" />
        <MetricCard label="Pending Queue" value="6" icon={RefreshCw} accent="warning" />
        <MetricCard label="Errors" value="0" trend="up" icon={FileWarning} />
        <MetricCard label="QR Verified" value="100%" icon={QrCode} accent="primary" />
      </div>

      <Toolbar placeholder="Search invoice / CR / VAT…" primaryLabel="New Invoice" />
      <DataTable
        columns={[
          { key: "inv", label: "Invoice", render: (r) => <span className="font-mono font-semibold">{r.inv}</span> },
          { key: "time", label: "Time" },
          { key: "branch", label: "Branch" },
          { key: "type", label: "Type" },
          { key: "vat", label: "VAT" },
          { key: "total", label: "Total", render: (r) => <span className="font-semibold">{r.total}</span> },
          { key: "status", label: "Sync", render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rows={invoices}
      />
    </PageShell>
  );
}