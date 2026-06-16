import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Truck, FileText, AlertCircle, Star } from "lucide-react";
import { api, type Supplier } from "@/lib/api";

export const Route = createFileRoute("/_app/suppliers")({ component: Suppliers });

function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSuppliers()
      .then(setSuppliers)
      .finally(() => setLoading(false));
  }, []);

  const active = suppliers.filter((s) => s.status === "active").length;

  return (
    <PageShell title="Suppliers" subtitle="Manage vendors, POs and dues">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active Suppliers" value={String(active)} icon={Truck} accent="primary" />
        <MetricCard label="Total Suppliers" value={String(suppliers.length)} icon={FileText} />
        <MetricCard label="Overdue Dues" value="—" trend="down" icon={AlertCircle} accent="destructive" />
        <MetricCard label="Avg Rating" value="—" icon={Star} accent="warning" />
      </div>
      <Toolbar placeholder="Search suppliers…" primaryLabel="New Supplier" />
      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <DataTable
          columns={[
            { key: "name", label: "Supplier", render: (r: Supplier) => (
              <div>
                <p className="font-semibold text-sm">{r.name}</p>
                <p className="text-xs text-muted-foreground">{r.supplierCode}</p>
              </div>
            )},
            { key: "contact", label: "Contact", render: (r: Supplier) => (
              <div>
                <p className="text-sm">{r.contactPerson ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{r.contactNumber ?? "—"}</p>
              </div>
            )},
            { key: "supplyType", label: "Type", render: (r: Supplier) => (
              <span className="capitalize">{r.supplyType.replace(/_/g, " ")}</span>
            )},
            { key: "status", label: "Status", render: (r: Supplier) => <StatusBadge status={r.status} /> },
          ]}
          rows={suppliers}
        />
      )}
    </PageShell>
  );
}
