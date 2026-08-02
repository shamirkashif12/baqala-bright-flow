import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable, FilterField } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { DateRangeField } from "@/components/report-filters/date-range-field";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { api, type StockMovementHistoryReport, type StockMovementHistoryRow, type ReportExportFormat } from "@/lib/api";
import { useReportFilterOptions } from "@/lib/use-report-filters";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowUpDown, Info, SlidersHorizontal, ChevronDown, X } from "lucide-react";

export const Route = createFileRoute("/_app/reports/stock-movement-history")({ component: StockMovementHistory });

const firstOfMonthStr = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const todayStr = () => new Date().toISOString().slice(0, 10);

// Mirrors ProductDrillDownDrawer's MOVEMENT_TYPE_LABELS — same ledger, same labels. Covers every
// literal movementType string actually written by StockMovementService.Record() call sites
// (adjustments are recorded as "adjustment_{AdjustmentType}", not the bare wastage-type name).
const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  manual_receive: "Manual Receive",
  purchase_receive: "PO Receive",
  transfer_out: "Transfer Out",
  transfer_in: "Transfer In",
  transfer_restore: "Transfer Restore",
  sale: "Sale",
  return_restock: "Customer Return Restock",
  adjustment_addition: "Adjustment (Addition)",
  adjustment_subtraction: "Adjustment (Subtraction)",
  adjustment_waste: "Waste",
  adjustment_damage: "Damage",
  adjustment_theft: "Theft",
  adjustment_expired: "Expiry Write-off",
  adjustment_other: "Other Adjustment",
  adjustment_return_to_supplier: "Return to Supplier",
  adjustment_reversal: "Adjustment Reversal",
  reconciliation_addition: "Stocktake Addition",
  reconciliation_subtraction: "Stocktake Subtraction",
  damage: "Damage (Recall)",
};
const MOVEMENT_TYPES = Object.keys(MOVEMENT_TYPE_LABELS).map((id) => ({ id, label: MOVEMENT_TYPE_LABELS[id] }));

function StockMovementHistory() {
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
  const [movementTypes, setMovementTypes] = useState<string[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [data, setData] = useState<StockMovementHistoryReport | null>(null);
  const [loading, setLoading] = useState(true);

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
    movementType: movementTypes.length ? movementTypes : undefined,
  }), [branchIds, warehouseIds, categoryIds, productIds, supplierIds, employeeIds, movementTypes]);

  const load = useCallback(() => {
    setLoading(true);
    api.getStockMovementHistoryReport({ from, to, ...filters })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, filters]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportStockMovementHistoryReport({ from, to, ...filters, exportedBy: user?.id, format });
      downloadBlob(blob, `stock-movement-history-${todayStr()}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const hasFilters = from !== firstOfMonthStr() || to !== todayStr() || branchIds.length !== (lockedBranchId ? 1 : 0)
    || warehouseIds.length > 0 || categoryIds.length > 0 || productIds.length > 0 || supplierIds.length > 0
    || employeeIds.length > 0 || movementTypes.length > 0;
  const clearFilters = () => {
    setFrom(firstOfMonthStr()); setTo(todayStr()); setBranchIds(lockedBranchId ? [lockedBranchId] : []);
    setWarehouseIds([]); setCategoryIds([]); setProductIds([]); setSupplierIds([]); setEmployeeIds([]);
    setMovementTypes([]);
  };

  const advancedFilterCount = productIds.length + supplierIds.length + employeeIds.length + movementTypes.length;

  const kpis = data?.kpis;

  return (
    <PageShell
      title="Stock Movement History"
      subtitle="Full audit trail of every stock-affecting transaction — receives, sales, transfers, adjustments and write-offs"
    >
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground -mt-2">
        <Info className="h-3.5 w-3.5" />
        This is the full ledger across every product. For one product's own history alongside its
        sales and batches, use the drill-down (Eye icon) on{" "}
        <Link to="/reports/inventory-dashboard" className="underline underline-offset-2 hover:text-foreground">Inventory Aging</Link>
        {" "}or{" "}
        <Link to="/reports/inventory-aging-performance" className="underline underline-offset-2 hover:text-foreground">Product Performance</Link>.
      </p>
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="rounded-xl border border-border/60 bg-card p-3 space-y-3">
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

          <CollapsibleTrigger asChild>
            <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Advanced
              {advancedFilterCount > 0 && (
                <Badge variant="secondary" className="h-4 min-w-4 rounded-full px-1 text-[10px] leading-none">{advancedFilterCount}</Badge>
              )}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", advancedOpen && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
          {hasFilters && (
            <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" /> Clear Filters
            </Button>
          )}
          <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
        </div>

        <CollapsibleContent className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(180px,1fr))] pt-3 border-t border-border/50">
          <FilterField label="Product">
            <SearchableMultiSelect
              placeholder="All Products"
              options={products.map((p) => ({ id: p.id, label: p.name }))}
              selected={productIds}
              onChange={setProductIds}
            />
          </FilterField>
          <FilterField label="Supplier">
            <SearchableMultiSelect
              placeholder="All Suppliers"
              options={suppliers.map((s) => ({ id: s.id, label: s.name }))}
              selected={supplierIds}
              onChange={setSupplierIds}
            />
          </FilterField>
          <FilterField label="Employee">
            <SearchableMultiSelect
              placeholder="All Employees"
              options={employees.map((e) => ({ id: e.id, label: e.fullName }))}
              selected={employeeIds}
              onChange={setEmployeeIds}
            />
          </FilterField>
          <FilterField label="Movement Type">
            <SearchableMultiSelect
              placeholder="All Movement Types"
              options={MOVEMENT_TYPES}
              selected={movementTypes}
              onChange={setMovementTypes}
            />
          </FilterField>
        </CollapsibleContent>
      </Collapsible>

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <MetricCard label="Total Movements" value={String(kpis?.totalMovements ?? 0)} icon={ArrowUpDown} accent="primary" />
        <MetricCard label="Inbound Qty" value={String(kpis?.inboundQty ?? 0)} icon={ArrowUpDown} accent="success" />
        <MetricCard label="Outbound Qty" value={String(kpis?.outboundQty ?? 0)} icon={ArrowUpDown} accent="warning" />
        {canViewCost && (
          <MetricCard label="Net Value Moved" value={<><SARIcon />{fmtSAR(kpis?.netValue ?? 0)}</>} icon={ArrowUpDown} />
        )}
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            {
              key: "createdAt", label: "Date/Time",
              render: (r: StockMovementHistoryRow) => new Date(r.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
            },
            { key: "sku", label: "SKU" },
            { key: "productName", label: "Product" },
            { key: "category", label: "Category" },
            { key: "location", label: "Location" },
            {
              key: "locationType", label: "Type",
              render: (r: StockMovementHistoryRow) => (
                <Badge variant={r.locationType === "warehouse" ? "secondary" : "outline"} className="text-[10px] capitalize">{r.locationType}</Badge>
              ),
            },
            {
              key: "movementType", label: "Movement Type",
              render: (r: StockMovementHistoryRow) => <Badge variant="outline" className="text-[10px]">{MOVEMENT_TYPE_LABELS[r.movementType] ?? r.movementType}</Badge>,
            },
            {
              key: "quantity", label: "Quantity",
              render: (r: StockMovementHistoryRow) => (
                <span className={r.quantity < 0 ? "text-destructive font-semibold" : "text-success font-semibold"}>
                  {r.quantity > 0 ? "+" : ""}{r.quantity}
                </span>
              ),
            },
            { key: "quantityBefore", label: "Qty Before", render: (r: StockMovementHistoryRow) => r.quantityBefore ?? "—" },
            { key: "quantityAfter", label: "Qty After", render: (r: StockMovementHistoryRow) => r.quantityAfter ?? "—" },
            ...(canViewCost
              ? [{ key: "value", label: "Value", render: (r: StockMovementHistoryRow) => <><SARIcon />{fmtSAR(r.value)}</> }]
              : []),
            { key: "supplier", label: "Supplier", render: (r: StockMovementHistoryRow) => r.supplier ?? "—" },
            { key: "batchNumber", label: "Batch #", render: (r: StockMovementHistoryRow) => r.batchNumber ?? "—" },
            { key: "referenceNumber", label: "Reference", render: (r: StockMovementHistoryRow) => r.referenceNumber ?? "—" },
            { key: "createdBy", label: "Created By", render: (r: StockMovementHistoryRow) => r.createdBy ?? "—" },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
