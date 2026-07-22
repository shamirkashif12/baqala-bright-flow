import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable, StatusBadge } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { api, type InventorySnapshotReport, type InventorySnapshotRow, type InventorySnapshotScope, type ReportExportFormat } from "@/lib/api";
import { useReportFilterOptions } from "@/lib/use-report-filters";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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

  const [branchIds, setBranchIds] = useState<string[]>(lockedBranchId ? [lockedBranchId] : []);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [warehouseIds, setWarehouseIds] = useState<string[]>([]);
  const [locationType, setLocationType] = useState("all");
  const [isTobacco, setIsTobacco] = useState(false);
  const [data, setData] = useState<InventorySnapshotReport | null>(null);
  const [loading, setLoading] = useState(true);
  // Which pools this user may see. Null until loaded — the filter bar renders nothing
  // pool-specific until the server has answered, rather than flashing controls it may revoke.
  const [scope, setScope] = useState<InventorySnapshotScope | null>(null);

  const scopedBranchId = branchIds.length === 1 ? branchIds[0] : undefined;
  const scopedCategoryId = categoryIds.length === 1 ? categoryIds[0] : undefined;
  const { categories, products } = useReportFilterOptions(scopedBranchId, scopedCategoryId);

  useEffect(() => {
    api.getInventorySnapshotScope().then(setScope).catch(() => {});
  }, []);

  useEffect(() => {
    setProductIds((prev) => prev.filter((id) => products.some((p) => p.id === id)));
  }, [products]);

  const filters = useMemo(() => ({
    branchId: branchIds.length ? branchIds : undefined,
    categoryId: categoryIds.length ? categoryIds : undefined,
    productId: productIds.length ? productIds : undefined,
    warehouseId: warehouseIds.length ? warehouseIds : undefined,
    locationType: locationType !== "all" ? locationType : undefined,
    isTobacco: isTobacco || undefined,
  }), [branchIds, categoryIds, productIds, warehouseIds, locationType, isTobacco]);

  // Only meaningful when both pools are visible; a single-pool user has nothing to switch between.
  const showLocationType = !!scope?.canFilterBranch && !!scope?.canFilterWarehouse;

  const load = useCallback(() => {
    setLoading(true);
    api.getInventorySnapshotReport(filters)
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportInventorySnapshotReport({ ...filters, exportedBy: user?.id, format });
      downloadBlob(blob, `inventory-snapshot-${new Date().toISOString().slice(0, 10)}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  // Keyed by locationId, not name — two locations can share a display name, and merging them
  // would silently overstate one bar. The label still shows the name.
  const locationValue = Object.values(
    (data?.rows ?? []).reduce<Record<string, { name: string; value: number }>>((acc, r) => {
      acc[r.locationId] ??= { name: r.location, value: 0 };
      acc[r.locationId].value += r.stockCostValue;
      return acc;
    }, {})
  );

  return (
    <PageShell
      title="Inventory Reports"
      subtitle="Current stock snapshot, stock value and reserved quantity across branches and warehouses"
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* Branch and Warehouse are shown per the caller's stock pool, resolved server-side: a
            branch user (e.g. cashier) sees no warehouse control because they hold no warehouse
            stock, and a warehouse user sees no branch control for the mirror reason. */}
        {!lockedBranchId && scope?.canFilterBranch && (
          <div className="w-44">
            <SearchableMultiSelect
              placeholder="All Branches"
              options={branches.map((b) => ({ id: b.id, label: b.name }))}
              selected={branchIds}
              onChange={setBranchIds}
            />
          </div>
        )}
        {scope?.canFilterWarehouse && (
          <div className="w-44">
            <SearchableMultiSelect
              placeholder="All Warehouses"
              options={scope.warehouses.map((w) => ({ id: w.id, label: w.name }))}
              selected={warehouseIds}
              onChange={setWarehouseIds}
            />
          </div>
        )}
        {showLocationType && (
          <Select value={locationType} onValueChange={setLocationType}>
            <SelectTrigger className="h-9 w-40"><SelectValue placeholder="All Locations" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Branches & Warehouses</SelectItem>
              <SelectItem value="branch">Branches only</SelectItem>
              <SelectItem value="warehouse">Warehouses only</SelectItem>
            </SelectContent>
          </Select>
        )}
        <div className="w-40">
          <SearchableMultiSelect
            placeholder="All Categories"
            options={categories.map((c) => ({ id: c.id, label: c.name }))}
            selected={categoryIds}
            onChange={setCategoryIds}
          />
        </div>
        <div className="w-44">
          <SearchableMultiSelect
            placeholder="All Products"
            options={products.map((p) => ({ id: p.id, label: p.name }))}
            selected={productIds}
            onChange={setProductIds}
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm px-2">
          <Checkbox checked={isTobacco} onCheckedChange={(v) => setIsTobacco(v === true)} />
          Tobacco only
        </label>
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
          <h3 className="font-semibold mb-4">Stock Value by Location</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={locationValue}>
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
            { key: "location", label: "Location" },
            {
              key: "locationType",
              label: "Type",
              render: (r: InventorySnapshotRow) => (
                <Badge variant={r.locationType === "warehouse" ? "secondary" : "outline"} className="text-[10px] capitalize">
                  {r.locationType}
                </Badge>
              ),
            },
            { key: "isTobacco", label: "Tobacco", render: (r: InventorySnapshotRow) => (r.isTobacco ? <Badge variant="outline" className="text-[10px]">Tobacco</Badge> : "—") },
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
