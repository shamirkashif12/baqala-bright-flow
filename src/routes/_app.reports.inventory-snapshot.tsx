import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable, StatusBadge } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { api, type InventorySnapshotReport, type InventorySnapshotRow, type ReportExportFormat } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Boxes, Package, PackageCheck, PackageX, AlertTriangle } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_app/reports/inventory-snapshot")({ component: InventorySnapshot });

function InventorySnapshot() {
  const { user, canViewModule } = useAuth();
  const { canExport } = usePermission("Reports");
  const canViewCost = canViewModule("Accounting & Finance");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [data, setData] = useState<InventorySnapshotReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.getInventorySnapshotReport({ branchId: branchId !== "all" ? branchId : undefined })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [branchId]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportInventorySnapshotReport({ branchId: branchId !== "all" ? branchId : undefined, exportedBy: user?.id, format });
      downloadBlob(blob, `inventory-snapshot-${new Date().toISOString().slice(0, 10)}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const branchValue = Object.values(
    (data?.rows ?? []).reduce<Record<string, { name: string; value: number }>>((acc, r) => {
      acc[r.branch] ??= { name: r.branch, value: 0 };
      acc[r.branch].value += r.stockCostValue;
      return acc;
    }, {})
  );

  return (
    <PageShell
      title="Inventory Reports"
      subtitle="Current stock snapshot, stock value and reserved quantity by branch"
    >
      <div className="flex flex-wrap items-center gap-2">
        {!lockedBranchId && (
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="All Branches" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {data?.snapshotAt && (
          <span className="text-xs text-muted-foreground">
            Snapshot as of {new Date(data.snapshotAt).toLocaleString("en-SA", { dateStyle: "medium", timeStyle: "short" })}
          </span>
        )}
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        {canViewCost && <MetricCard label="Total Stock Value" value={<><SARIcon />{fmt(kpis?.totalStockValue ?? 0)}</>} icon={Boxes} accent="primary" />}
        <MetricCard label="SKU Count" value={String(kpis?.skuCount ?? 0)} icon={Package} />
        <MetricCard label="Available Qty" value={String(kpis?.availableQty ?? 0)} icon={PackageCheck} accent="success" />
        <MetricCard label="Reserved Qty" value={String(kpis?.reservedQty ?? 0)} icon={Package} accent="warning" />
        <MetricCard label="Out of Stock SKUs" value={String(kpis?.outOfStockSkus ?? 0)} icon={PackageX} accent="destructive" />
        <MetricCard label="Negative Stock Exceptions" value={String(kpis?.negativeStockExceptions ?? 0)} icon={AlertTriangle} accent="destructive" />
      </div>

      {canViewCost && (
        <Card className="p-6 border-border/60 shadow-card">
          <h3 className="font-semibold mb-4">Stock Value by Branch</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={branchValue}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v: number) => fmtSAR(v)} />
              <Bar dataKey="value" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "sku", label: "SKU" },
            { key: "productName", label: "Product" },
            { key: "category", label: "Category" },
            { key: "branch", label: "Branch" },
            { key: "onHandQty", label: "On Hand Qty" },
            { key: "reservedQty", label: "Reserved Qty" },
            { key: "availableQty", label: "Available Qty" },
            { key: "reorderLevel", label: "Reorder Level" },
            ...(canViewCost
              ? [
                  { key: "costPrice", label: "Cost Price", render: (r: InventorySnapshotRow) => <><SARIcon />{fmt(r.costPrice)}</> },
                  { key: "stockCostValue", label: "Stock Cost Value", render: (r: InventorySnapshotRow) => <span className="font-semibold"><SARIcon />{fmt(r.stockCostValue)}</span> },
                ]
              : []),
            { key: "retailValue", label: "Retail Value", render: (r: InventorySnapshotRow) => <><SARIcon />{fmt(r.retailValue)}</> },
            { key: "lastMovementDate", label: "Last Movement", render: (r: InventorySnapshotRow) => new Date(r.lastMovementDate).toLocaleDateString("en-SA") },
            { key: "stockStatus", label: "Status", render: (r: InventorySnapshotRow) => <StatusBadge status={r.stockStatus} /> },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
