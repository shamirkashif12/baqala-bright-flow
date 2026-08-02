import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable, FilterField } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { PerformanceTierBadge } from "@/components/report-filters/performance-tier-badge";
import { DateRangeField } from "@/components/report-filters/date-range-field";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { api, type ProductPerformanceReport as PerfData, type ProductPerformanceRow, type ProductPerformanceDetail, type StockMovement, type ReportExportFormat } from "@/lib/api";
import { useReportFilterOptions } from "@/lib/use-report-filters";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Sparkles, TrendingUp, Minus, TrendingDown, PackageX, Boxes, X, Eye, Info } from "lucide-react";

export const Route = createFileRoute("/_app/reports/inventory-aging-performance")({ component: InventoryAgingPerformance });

const firstOfMonthStr = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const todayStr = () => new Date().toISOString().slice(0, 10);

// Product Status is the catalog state of the SKU (Product.status) — distinct from the performance
// tier below, which this report derives. A discontinued SKU showing as Dead Stock is expected;
// an active one is the finding.
const PRODUCT_STATUSES = [
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "discontinued", label: "Discontinued" },
];
const CLASSIFICATIONS = [
  "Star Products", "High Performers", "Average Performers", "Slow Moving Products", "Dead Stock",
].map((c) => ({ id: c, label: c }));

const PRODUCT_STATUS_CLASS: Record<string, string> = {
  active: "bg-success/15 text-success",
  inactive: "bg-muted text-muted-foreground",
  discontinued: "bg-destructive/15 text-destructive",
};

// Mirrors batch-tracking.tsx's MOVEMENT_TYPE_LABELS — same ledger, same labels.
const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  manual_receive: "Manual Receive",
  purchase_receive: "PO Receive",
  transfer_out: "Transfer Out",
  transfer_in: "Transfer In",
  transfer_restore: "Transfer Restore",
  sale: "Sale",
  expired: "Expiry Write-off",
};

// Mirrors PurchaseOrderDetailDrawer/AuditDetailDrawer — one product's aggregate row can't show
// per-transaction detail itself (that's the point of an aggregate), so drill-down is a second,
// on-demand fetch scoped to the clicked product rather than embedding every sale in the list payload.
function ProductDrillDownDrawer({ productId, from, to, onClose }: { productId: string | null; from: string; to: string; onClose: () => void }) {
  const [detail, setDetail] = useState<ProductPerformanceDetail | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productId) { setDetail(null); setMovements([]); return; }
    setLoading(true);
    Promise.all([
      api.getProductPerformanceDetail(productId, { from, to }),
      api.getStockMovements({ productId, from, to, limit: 50 }),
    ])
      .then(([d, m]) => { setDetail(d); setMovements(m); })
      .catch(() => toast.error("Failed to load product detail"))
      .finally(() => setLoading(false));
  }, [productId, from, to]);

  return (
    <Sheet open={!!productId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[560px] overflow-y-auto">
        {loading ? (
          <div className="text-muted-foreground text-sm py-4">Loading…</div>
        ) : detail && (
          <>
            <SheetHeader className="pb-4 border-b border-border/60">
              <SheetTitle className="text-base">{detail.productName}</SheetTitle>
              <p className="text-xs text-muted-foreground font-mono">{detail.sku}</p>
            </SheetHeader>
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Recent Sales ({detail.recentSales.length})
              </p>
              {detail.recentSales.length === 0 ? (
                <p className="text-xs text-muted-foreground">No sales in the selected date range.</p>
              ) : (
                <div className="space-y-1.5">
                  {detail.recentSales.map((s, idx) => (
                    <div key={idx} className="rounded-xl border border-border/40 px-3 py-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{new Date(s.date).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        <span className="font-semibold"><SARIcon />{fmtSAR(s.netAmount)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-muted-foreground">
                        <span>{s.branch}</span>
                        <span>Sold by {s.employee}</span>
                        <span>Qty {s.quantity}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Current Batches ({detail.batches.length})
              </p>
              {detail.batches.length === 0 ? (
                <p className="text-xs text-muted-foreground">No stock on hand.</p>
              ) : (
                <div className="space-y-1.5">
                  {detail.batches.map((b, idx) => (
                    <div key={idx} className="rounded-xl border border-border/40 px-3 py-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{b.location}</span>
                        <span className="font-semibold">{b.remainingQuantity} remaining</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-muted-foreground">
                        {b.supplier && <span>Supplier: {b.supplier}</span>}
                        {b.batchNumber && <span className="font-mono">{b.batchNumber}</span>}
                        <span>Received {new Date(b.receivedDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
                        {b.expiryDate && <span>Expires {new Date(b.expiryDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Stock Movement History ({movements.length})
              </p>
              {movements.length === 0 ? (
                <p className="text-xs text-muted-foreground">No recorded movements in the selected date range.</p>
              ) : (
                <div className="space-y-1.5">
                  {movements.map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded-xl border border-border/40 px-3 py-2.5 text-xs">
                      <div>
                        <p className="font-medium">{MOVEMENT_TYPE_LABELS[m.movementType] ?? m.movementType}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground">
                          <span>{new Date(m.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          <span>{m.branch?.name ?? m.warehouse?.name ?? "—"}</span>
                          {m.referenceNumber && <span>{m.referenceNumber}</span>}
                          {m.createdByUser && <span>By {m.createdByUser.fullName}</span>}
                        </div>
                      </div>
                      <span className={m.quantity < 0 ? "text-destructive font-semibold" : "text-success font-semibold"}>
                        {m.quantity > 0 ? "+" : ""}{m.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function InventoryAgingPerformance() {
  const { user, canViewModule } = useAuth();
  const { canExport } = usePermission("Reports");
  const canViewCost = canViewModule("Accounting & Finance");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [branchIds, setBranchIds] = useState<string[]>(lockedBranchId ? [lockedBranchId] : []);
  const [warehouseIds, setWarehouseIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [productStatuses, setProductStatuses] = useState<string[]>([]);
  const [classifications, setClassifications] = useState<string[]>([]);
  const [data, setData] = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [drillDownProductId, setDrillDownProductId] = useState<string | null>(null);

  const scopedBranchId = branchIds.length === 1 ? branchIds[0] : undefined;
  const scopedCategoryId = categoryIds.length === 1 ? categoryIds[0] : undefined;
  const { categories, products, warehouses, suppliers, employees } = useReportFilterOptions(scopedBranchId, scopedCategoryId);

  useEffect(() => {
    setProductIds((prev) => prev.filter((id) => products.some((p) => p.id === id)));
  }, [products]);

  const filters = useMemo(() => ({
    branchId: branchIds.length ? branchIds : undefined,
    warehouseId: warehouseIds.length ? warehouseIds : undefined,
    categoryId: categoryIds.length ? categoryIds : undefined,
    productId: productIds.length ? productIds : undefined,
    supplierId: supplierIds.length ? supplierIds : undefined,
    employeeId: employeeIds.length ? employeeIds : undefined,
    productStatus: productStatuses.length ? productStatuses : undefined,
    classification: classifications.length ? classifications : undefined,
  }), [branchIds, warehouseIds, categoryIds, productIds, supplierIds, employeeIds, productStatuses, classifications]);

  const load = useCallback(() => {
    setLoading(true);
    api.getProductPerformanceReport({ from, to, ...filters })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, filters]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportProductPerformanceReport({ from, to, ...filters, exportedBy: user?.id, format });
      downloadBlob(blob, `inventory-aging-performance-${todayStr()}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const hasFilters = from !== firstOfMonthStr() || to !== todayStr() || branchIds.length !== (lockedBranchId ? 1 : 0)
    || warehouseIds.length > 0 || categoryIds.length > 0 || productIds.length > 0 || supplierIds.length > 0 || employeeIds.length > 0
    || productStatuses.length > 0 || classifications.length > 0;
  const clearFilters = () => {
    setFrom(firstOfMonthStr()); setTo(todayStr()); setBranchIds(lockedBranchId ? [lockedBranchId] : []);
    setWarehouseIds([]); setCategoryIds([]); setProductIds([]); setSupplierIds([]); setEmployeeIds([]);
    setProductStatuses([]); setClassifications([]);
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);

  return (
    <PageShell
      title="Product Performance & Classification"
      subtitle="Star Products, High/Average/Slow performers and Dead Stock — ranked by sales velocity, turnover, days since last sale and profitability"
    >
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground -mt-2">
        <Info className="h-3.5 w-3.5" />
        Looking for batch age or days-since-last-movement instead? See{" "}
        <Link to="/reports/inventory-dashboard" className="underline underline-offset-2 hover:text-foreground">Inventory Aging</Link>.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <DateRangeField from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        {!lockedBranchId && (
          <FilterField label="Branch">
            <div className="w-44">
              <SearchableMultiSelect
                placeholder="All Branches"
                options={branches.map((b) => ({ id: b.id, label: b.name }))}
                selected={branchIds}
                onChange={setBranchIds}
              />
            </div>
          </FilterField>
        )}
        {!lockedBranchId && (
          <FilterField label="Warehouse">
            <div className="w-44">
              <SearchableMultiSelect
                placeholder="All Warehouses"
                options={warehouses.map((w) => ({ id: w.id, label: w.name }))}
                selected={warehouseIds}
                onChange={setWarehouseIds}
              />
            </div>
          </FilterField>
        )}
        <FilterField label="Category">
          <div className="w-40">
            <SearchableMultiSelect
              placeholder="All Categories"
              options={categories.map((c) => ({ id: c.id, label: c.name }))}
              selected={categoryIds}
              onChange={setCategoryIds}
            />
          </div>
        </FilterField>
        <FilterField label="Product">
          <div className="w-52">
            <SearchableMultiSelect
              placeholder="All Products"
              options={products.map((p) => ({ id: p.id, label: p.name }))}
              selected={productIds}
              onChange={setProductIds}
            />
          </div>
        </FilterField>
        <FilterField label="Supplier">
          <div className="w-44">
            <SearchableMultiSelect
              placeholder="All Suppliers"
              options={suppliers.map((s) => ({ id: s.id, label: s.name }))}
              selected={supplierIds}
              onChange={setSupplierIds}
            />
          </div>
        </FilterField>
        <FilterField label="Employee">
          <div className="w-44">
            <SearchableMultiSelect
              placeholder="All Employees"
              options={employees.map((e) => ({ id: e.id, label: e.fullName }))}
              selected={employeeIds}
              onChange={setEmployeeIds}
            />
          </div>
        </FilterField>
        <FilterField label="Product Status">
          <div className="w-44">
            <SearchableMultiSelect
              placeholder="All Product Statuses"
              options={PRODUCT_STATUSES}
              selected={productStatuses}
              onChange={setProductStatuses}
            />
          </div>
        </FilterField>
        <FilterField label="Classification">
          <div className="w-48">
            <SearchableMultiSelect
              placeholder="All Classifications"
              options={CLASSIFICATIONS}
              selected={classifications}
              onChange={setClassifications}
            />
          </div>
        </FilterField>
        {hasFilters && (
          <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" /> Clear Filters
          </Button>
        )}
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <MetricCard label="Products Analyzed" value={String(kpis?.productCount ?? 0)} icon={Boxes} accent="primary" />
        <MetricCard label="Star Products" value={String(kpis?.starCount ?? 0)} icon={Sparkles} accent="success" />
        <MetricCard label="High Performers" value={String(kpis?.highPerformerCount ?? 0)} icon={TrendingUp} />
        <MetricCard label="Average Performers" value={String(kpis?.averagePerformerCount ?? 0)} icon={Minus} />
        <MetricCard label="Slow Moving" value={String(kpis?.slowMovingCount ?? 0)} icon={TrendingDown} accent="warning" />
        <MetricCard label="Dead Stock" value={String(kpis?.deadStockCount ?? 0)} icon={PackageX} accent="destructive" />
      </div>

      {canViewCost && (
        <div className="grid gap-4 md:grid-cols-2">
          <MetricCard label="Total Sales Value" value={<><SARIcon />{fmt(kpis?.totalSalesValue ?? 0)}</>} icon={TrendingUp} accent="success" />
          <MetricCard label="Dead Stock Value" value={<><SARIcon />{fmt(kpis?.deadStockValue ?? 0)}</>} icon={PackageX} accent="destructive" />
        </div>
      )}

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "sku", label: "SKU" },
            { key: "productName", label: "Product" },
            { key: "category", label: "Category" },
            {
              key: "productStatus", label: "Product Status",
              render: (r: ProductPerformanceRow) => (
                <Badge variant="outline" className={`text-[10px] border-0 capitalize ${PRODUCT_STATUS_CLASS[r.productStatus] ?? "bg-muted text-muted-foreground"}`}>
                  {r.productStatus}
                </Badge>
              ),
            },
            { key: "unitsSold", label: "Units Sold" },
            { key: "salesValue", label: "Sales Value", render: (r: ProductPerformanceRow) => <><SARIcon />{fmt(r.salesValue)}</> },
            ...(canViewCost
              ? [
                  { key: "grossProfit", label: "Gross Profit", render: (r: ProductPerformanceRow) => <><SARIcon />{fmt(r.grossProfit)}</> },
                  { key: "marginPct", label: "Margin %", render: (r: ProductPerformanceRow) => (r.marginPct != null ? `${r.marginPct}%` : "N/A") },
                ]
              : []),
            { key: "currentStockQty", label: "Current Stock" },
            ...(canViewCost
              ? [{ key: "currentStockValue", label: "Stock Value", render: (r: ProductPerformanceRow) => <><SARIcon />{fmt(r.currentStockValue)}</> }]
              : []),
            { key: "daysInStock", label: "Days In Stock", render: (r: ProductPerformanceRow) => r.daysInStock ?? "—" },
            { key: "daysSinceLastSale", label: "Days Since Last Sale", render: (r: ProductPerformanceRow) => r.daysSinceLastSale ?? "Never" },
            { key: "turnoverRatio", label: "Turnover", render: (r: ProductPerformanceRow) => r.turnoverRatio.toFixed(2) },
            { key: "classification", label: "Classification", render: (r: ProductPerformanceRow) => <PerformanceTierBadge tier={r.classification} /> },
            { key: "action", label: "Action", render: (r: ProductPerformanceRow) => (
              <Button size="icon" variant="ghost" className="h-7 w-7" title="View sales & batch detail" onClick={() => setDrillDownProductId(r.productId)}>
                <Eye className="h-3.5 w-3.5" />
              </Button>
            ) },
          ]}
          rows={data?.rows ?? []}
        />
      )}
      <ProductDrillDownDrawer productId={drillDownProductId} from={from} to={to} onClose={() => setDrillDownProductId(null)} />
    </PageShell>
  );
}
