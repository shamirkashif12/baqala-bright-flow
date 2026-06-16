import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { CalendarClock, ShieldAlert, PackageCheck, Ban } from "lucide-react";
import { api, type InventoryBatch } from "@/lib/api";

export const Route = createFileRoute("/_app/batches")({ component: Batches });

function Batches() {
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getBatches()
      .then(setBatches)
      .finally(() => setLoading(false));
  }, []);

  const nearExpiry = batches.filter(b => b.status === "near_expiry").length;
  const expired = batches.filter(b => b.status === "expired").length;
  const active = batches.filter(b => b.status === "active").length;

  return (
    <PageShell title="Batches & Expiry" subtitle="FIFO / FEFO tracking · auto-block expired items">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active Batches" value={String(active)} icon={PackageCheck} accent="primary" />
        <MetricCard label="Near Expiry" value={String(nearExpiry)} icon={CalendarClock} accent="warning" />
        <MetricCard label="Expired" value={String(expired)} icon={Ban} accent="destructive" />
        <MetricCard label="Recall Flags" value="—" icon={ShieldAlert} accent="destructive" />
      </div>
      <Toolbar placeholder="Search batch / lot / product…" primaryLabel="Receive Batch" />
      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <DataTable
          columns={[
            { key: "product", label: "Product", render: (r: InventoryBatch) => (
              <div>
                <p className="text-sm font-semibold">{r.product?.name ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{r.product?.sku ?? "—"}</p>
              </div>
            )},
            { key: "batchNumber", label: "Batch #", render: (r: InventoryBatch) => <span className="font-mono text-sm">{r.batchNumber}</span> },
            { key: "supplier", label: "Supplier", render: (r: InventoryBatch) => r.supplier?.name ?? "—" },
            { key: "receivedDate", label: "Received", render: (r: InventoryBatch) => new Date(r.receivedDate).toLocaleDateString("en-SA") },
            { key: "expiryDate", label: "Expiry", render: (r: InventoryBatch) => r.expiryDate ? new Date(r.expiryDate).toLocaleDateString("en-SA") : "—" },
            { key: "qty", label: "Qty (rem / recv)", render: (r: InventoryBatch) => `${r.remainingQuantity} / ${r.quantity}` },
            { key: "status", label: "Status", render: (r: InventoryBatch) => <StatusBadge status={r.status.replace(/_/g, " ")} /> },
          ]}
          rows={batches}
        />
      )}
    </PageShell>
  );
}
