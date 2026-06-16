import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import { DataTable, StatusBadge } from "@/components/module-placeholder";
import { Warehouse, ArrowLeftRight, Clock, CheckCircle2, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, type WarehouseRequest, type WarehouseRequestItem } from "@/lib/api";

export const Route = createFileRoute("/_app/warehouses")({ component: Warehouses });

function Warehouses() {
  const [requests, setRequests] = useState<WarehouseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<WarehouseRequest | null>(null);

  useEffect(() => {
    api.getWarehouseRequests()
      .then(setRequests)
      .finally(() => setLoading(false));
  }, []);

  const pending = requests.filter(r => r.approvalStatus === "pending").length;
  const inTransit = requests.filter(r => r.deliveryStatus === "in_transit").length;
  const approved = requests.filter(r => r.approvalStatus === "approved").length;

  return (
    <PageShell title="Warehouse Transfers" subtitle="Inter-branch stock transfer requests">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Requests" value={String(requests.length)} icon={Warehouse} accent="primary" />
        <MetricCard label="Pending Approval" value={String(pending)} icon={Clock} accent="warning" />
        <MetricCard label="In Transit" value={String(inTransit)} icon={ArrowLeftRight} accent="primary" />
        <MetricCard label="Approved" value={String(approved)} icon={CheckCircle2} accent="success" />
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <DataTable
          columns={[
            { key: "requestNumber", label: "Request #", render: (r: WarehouseRequest) => <span className="font-mono text-xs font-semibold">{r.requestNumber}</span> },
            { key: "sourceBranch", label: "From", render: (r: WarehouseRequest) => r.sourceBranch?.name ?? <span className="text-muted-foreground">—</span> },
            { key: "destinationBranch", label: "To", render: (r: WarehouseRequest) => r.destinationBranch?.name ?? <span className="text-muted-foreground">—</span> },
            { key: "supplier", label: "Supplier", render: (r: WarehouseRequest) => r.supplier?.name ?? <span className="text-muted-foreground">—</span> },
            { key: "approvalStatus", label: "Approval", render: (r: WarehouseRequest) => <StatusBadge status={r.approvalStatus} /> },
            { key: "deliveryStatus", label: "Delivery", render: (r: WarehouseRequest) => <StatusBadge status={r.deliveryStatus} /> },
            { key: "createdAt", label: "Date", render: (r: WarehouseRequest) => new Date(r.createdAt).toLocaleDateString("en-SA") },
            { key: "_a", label: "", render: (r: WarehouseRequest) => (
              <Button size="sm" variant="outline" className="gap-1.5 h-7" onClick={() => setActive(r)}>
                <Eye className="h-3.5 w-3.5" /> View
              </Button>
            )},
          ]}
          rows={requests}
        />
      )}

      <Dialog open={!!active} onOpenChange={(v) => !v && setActive(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Transfer Request — {active?.requestNumber}</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {active?.sourceBranch?.name ?? "External"} → {active?.destinationBranch?.name}
              {active?.supplier ? ` · Supplier: ${active.supplier.name}` : ""}
            </p>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3 mb-2">
            <Stat label="Approval" value={active?.approvalStatus ?? "—"} />
            <Stat label="Delivery" value={active?.deliveryStatus ?? "—"} />
            <Stat label="Items" value={String(active?.items?.length ?? 0)} />
          </div>
          {active?.notes && (
            <p className="text-sm text-muted-foreground rounded-xl bg-muted/40 p-3">{active.notes}</p>
          )}
          {active?.items && active.items.length > 0 && (
            <div className="overflow-x-auto rounded-lg border mt-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Requested</th>
                    <th className="px-3 py-2">Approved</th>
                  </tr>
                </thead>
                <tbody>
                  {active.items.map((item: WarehouseRequestItem) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="px-3 py-2.5">
                        <p className="font-medium">{item.product?.name ?? item.productId}</p>
                        {item.product?.sku && <p className="text-xs text-muted-foreground">{item.product.sku}</p>}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums font-semibold">{item.requestedQuantity}</td>
                      <td className="px-3 py-2.5 tabular-nums">
                        {item.approvedQuantity != null
                          ? <Badge variant="outline" className="bg-success/10 text-success border-success/30">{item.approvedQuantity}</Badge>
                          : <span className="text-muted-foreground text-xs">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl p-3 bg-muted/40">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
      <p className="text-base font-bold mt-1 capitalize">{value.replace(/_/g, " ")}</p>
    </div>
  );
}
