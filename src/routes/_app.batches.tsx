import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { CalendarClock, ShieldAlert, PackageCheck, Ban } from "lucide-react";

export const Route = createFileRoute("/_app/batches")({ component: Batches });

const batches = [
  { product: "Almarai Laban 1L", batch: "B-2026-04-A1", lot: "L-771", supplier: "Almarai", received: "12 May 26", expiry: "08 Jun 26", qty: "120 / 240", branch: "Olaya", status: "near expiry" },
  { product: "Nadec Milk 2L", batch: "B-2026-03-N2", lot: "L-882", supplier: "Nadec", received: "01 May 26", expiry: "22 Jun 26", qty: "60 / 180", branch: "Khobar", status: "safe" },
  { product: "L'usine Croissant", batch: "B-2026-05-L1", lot: "L-101", supplier: "L'usine", received: "28 May 26", expiry: "03 Jun 26", qty: "12 / 90", branch: "Jeddah", status: "near expiry" },
  { product: "Sadia Chicken 1kg", batch: "B-2026-02-S3", lot: "L-440", supplier: "Sadia", received: "10 Apr 26", expiry: "10 Apr 27", qty: "84 / 300", branch: "Madinah", status: "safe" },
  { product: "Arabic Bread", batch: "B-2026-05-AB", lot: "L-998", supplier: "L'usine", received: "30 May 26", expiry: "01 Jun 26", qty: "0 / 60", branch: "Olaya", status: "expired" },
];

function Batches() {
  return (
    <PageShell title="Batches & Expiry" subtitle="FIFO / FEFO tracking · auto-block expired items">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active Batches" value="486" icon={PackageCheck} accent="primary" />
        <MetricCard label="Near Expiry (7d)" value="41" icon={CalendarClock} accent="warning" />
        <MetricCard label="Expired" value="12" icon={Ban} accent="destructive" />
        <MetricCard label="Recall Flags" value="2" icon={ShieldAlert} accent="destructive" />
      </div>
      <Toolbar placeholder="Search batch / lot / product…" primaryLabel="Receive Batch" />
      <DataTable
        columns={[
          { key: "product", label: "Product" },
          { key: "batch", label: "Batch / Lot", render: (r) => <div><p className="text-sm font-mono">{r.batch}</p><p className="text-xs text-muted-foreground font-mono">{r.lot}</p></div> },
          { key: "supplier", label: "Supplier" },
          { key: "received", label: "Received" },
          { key: "expiry", label: "Expiry" },
          { key: "qty", label: "Qty (rem / recv)" },
          { key: "branch", label: "Branch" },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rows={batches}
      />
    </PageShell>
  );
}