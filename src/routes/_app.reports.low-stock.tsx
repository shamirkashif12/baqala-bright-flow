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
import { api, type LowStockReport, type LowStockRow, type ReportExportFormat } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Boxes, AlertTriangle, XCircle, DollarSign, Building2, Truck } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";

export const Route = createFileRoute("/_app/reports/low-stock")({ component: LowStock });

const URGENCY_COLORS: Record<string, string> = {
  critical: "var(--destructive)",
  low: "var(--warning)",
  ok: "var(--success)",
};

function LowStock() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [data, setData] = useState<LowStockReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.getLowStockReport({ branchId: branchId !== "all" ? branchId : undefined, onlyLowStock: true })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [branchId]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportLowStockReport({ branchId: branchId !== "all" ? branchId : undefined, onlyLowStock: true, exportedBy: user?.id, format });
      downloadBlob(blob, `low-stock-${new Date().toISOString().slice(0, 10)}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const urgencyCounts = ["critical", "low", "ok"].map((u) => ({
    urgency: u,
    count: (data?.rows ?? []).filter((r) => r.urgency === u).length,
  })).filter((u) => u.count > 0);

  return (
    <PageShell
      title="Low Stock Report"
      subtitle="Items below reorder thresholds, with recommended reorder quantities"
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
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
        <MetricCard label="Low Stock SKUs" value={String(kpis?.lowStockSkus ?? 0)} icon={Boxes} accent="warning" />
        <MetricCard label="Critical SKUs" value={String(kpis?.criticalSkus ?? 0)} icon={AlertTriangle} accent="destructive" />
        <MetricCard label="Out of Stock" value={String(kpis?.outOfStockSkus ?? 0)} icon={XCircle} accent="destructive" />
        <MetricCard label="Est. Reorder Value" value={<><SARIcon />{fmt(kpis?.estimatedReorderValue ?? 0)}</>} icon={DollarSign} accent="primary" />
        <MetricCard label="Affected Branches" value={String(kpis?.affectedBranches ?? 0)} icon={Building2} />
        <MetricCard label="Suppliers to Contact" value={String(kpis?.suppliersToContact ?? 0)} icon={Truck} />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Urgency Breakdown</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={urgencyCounts}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="urgency" fontSize={11} className="capitalize" />
            <YAxis fontSize={11} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {urgencyCounts.map((u) => <Cell key={u.urgency} fill={URGENCY_COLORS[u.urgency]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "sku", label: "SKU" },
            { key: "productName", label: "Product" },
            { key: "category", label: "Category" },
            { key: "branch", label: "Branch" },
            { key: "availableQty", label: "Available Qty" },
            { key: "reorderLevel", label: "Reorder Level" },
            { key: "recommendedReorderQty", label: "Recommended Qty" },
            { key: "preferredSupplier", label: "Preferred Supplier", render: (r: LowStockRow) => r.preferredSupplier ?? "—" },
            { key: "lastSoldDate", label: "Last Sold", render: (r: LowStockRow) => (r.lastSoldDate ? new Date(r.lastSoldDate).toLocaleDateString("en-SA") : "Never") },
            { key: "urgency", label: "Urgency", render: (r: LowStockRow) => <StatusBadge status={r.urgency} /> },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
