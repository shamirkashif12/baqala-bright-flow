import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable, StatusBadge, FilterField } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { DateRangeField } from "@/components/report-filters/date-range-field";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { api, type StockReconciliationReport as ReconData, type StockReconciliationRow, type ReportExportFormat } from "@/lib/api";
import { useReportFilterOptions } from "@/lib/use-report-filters";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ClipboardCheck, ListChecks, Scale, Target, TrendingDown, X, SlidersHorizontal, ChevronDown } from "lucide-react";

export const Route = createFileRoute("/_app/reports/stock-reconciliation")({ component: StockReconciliation });

// The FRD's names for the three count intents, mapped from the stored values.
const COUNT_TYPE_LABELS: Record<string, string> = {
  review: "Stock Review",
  audit: "Stock Audit",
  reconciliation: "Reconciliation",
};

const STATUS_OPTIONS = [
  { id: "draft", label: "In progress" },
  { id: "pending_review", label: "Pending Review" },
  { id: "pending_approval", label: "Pending Approval" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "cancelled", label: "Cancelled" },
];

const firstOfMonthStr = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const todayStr = () => new Date().toISOString().slice(0, 10);

function StockReconciliation() {
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
  const [countedByIds, setCountedByIds] = useState<string[]>([]);
  const [countType, setCountType] = useState("all");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [varianceOnly, setVarianceOnly] = useState(false);
  const [data, setData] = useState<ReconData | null>(null);
  const [loading, setLoading] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const scopedBranchId = branchIds.length === 1 ? branchIds[0] : undefined;
  const scopedCategoryId = categoryIds.length === 1 ? categoryIds[0] : undefined;
  const { categories, products, employees, warehouses } = useReportFilterOptions(scopedBranchId, scopedCategoryId);

  // Drop selections the current product list no longer offers, so the table can't silently empty
  // while a stale name is still shown in the picker.
  useEffect(() => {
    setProductIds((prev) => prev.filter((id) => products.some((p) => p.id === id)));
  }, [products]);

  const filters = useMemo(() => ({
    branchId: branchIds.length ? branchIds : undefined,
    warehouseId: warehouseIds.length ? warehouseIds : undefined,
    categoryId: categoryIds.length ? categoryIds : undefined,
    productId: productIds.length ? productIds : undefined,
    countedBy: countedByIds.length ? countedByIds : undefined,
    countType: countType !== "all" ? countType : undefined,
    status: statuses.length ? statuses : undefined,
    varianceOnly: varianceOnly || undefined,
  }), [branchIds, warehouseIds, categoryIds, productIds, countedByIds, countType, statuses, varianceOnly]);

  const load = useCallback(() => {
    setLoading(true);
    api.getStockReconciliationReport({ from, to, ...filters })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, filters]);

  useEffect(() => { load(); }, [load]);

  const hasFilters = from !== firstOfMonthStr() || to !== todayStr()
    || (!lockedBranchId && branchIds.length > 0) || (!lockedBranchId && warehouseIds.length > 0)
    || categoryIds.length > 0 || productIds.length > 0 || countedByIds.length > 0
    || countType !== "all" || statuses.length > 0 || varianceOnly;
  const clearFilters = () => {
    setFrom(firstOfMonthStr()); setTo(todayStr());
    if (!lockedBranchId) { setBranchIds([]); setWarehouseIds([]); }
    setCategoryIds([]); setProductIds([]); setCountedByIds([]);
    setCountType("all"); setStatuses([]); setVarianceOnly(false);
  };
  const advancedFilterCount = categoryIds.length + productIds.length + countedByIds.length
    + (countType !== "all" ? 1 : 0) + (varianceOnly ? 1 : 0);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportStockReconciliationReport({ from, to, ...filters, exportedBy: user?.id, format });
      downloadBlob(blob, `stock-reconciliation-${todayStr()}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const num = (n?: number | null) => (n == null ? "—" : String(n));

  return (
    <PageShell
      title="Stocktaking Report (Inventory Audit / Stock Count)"
      subtitle="Stock review, audit and reconciliation — system vs counted quantity by count session"
    >
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
          {/* Warehouse stock-takes are reviewed/approved by tenant_admin only (no warehouse-scoped
              role exists yet), so this filter is only meaningful for the same admin view as Branch. */}
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
          <FilterField label="Status">
            <div className="w-44">
              <SearchableMultiSelect
                placeholder="All Statuses"
                options={STATUS_OPTIONS}
                selected={statuses}
                onChange={setStatuses}
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
          <FilterField label="Category">
            <SearchableMultiSelect
              placeholder="All Categories"
              options={categories.map((c) => ({ id: c.id, label: c.name }))}
              selected={categoryIds}
              onChange={setCategoryIds}
            />
          </FilterField>
          <FilterField label="Product">
            <SearchableMultiSelect
              placeholder="All Products"
              options={products.map((p) => ({ id: p.id, label: p.name }))}
              selected={productIds}
              onChange={setProductIds}
            />
          </FilterField>
          {/* Matches either end of a session — whoever started the count or performed/signed it off. */}
          <FilterField label="Employee">
            <SearchableMultiSelect
              placeholder="All Employees"
              options={employees.map((u) => ({ id: u.id, label: u.fullName }))}
              selected={countedByIds}
              onChange={setCountedByIds}
            />
          </FilterField>
          {/* The FRD's three named filters — Stock Review / Stock Audit / Inventory Reconciliation.
              They all describe a StockCount session; count_type is what tells them apart. Kept
              single-select — it's a fixed 3-value intent field, not a location/entity list. */}
          <FilterField label="Count Type">
            <Select value={countType} onValueChange={setCountType}>
              <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Count Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Count Types</SelectItem>
                <SelectItem value="review">Stock Review</SelectItem>
                <SelectItem value="audit">Stock Audit</SelectItem>
                <SelectItem value="reconciliation">Inventory Reconciliation</SelectItem>
              </SelectContent>
            </Select>
          </FilterField>
          <label className="flex items-center gap-1.5 text-sm px-2">
            <Checkbox checked={varianceOnly} onCheckedChange={(v) => setVarianceOnly(v === true)} />
            Variance only
          </label>
        </CollapsibleContent>
      </Collapsible>

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <MetricCard label="Count Sessions" value={String(kpis?.sessionCount ?? 0)} icon={ClipboardCheck} accent="primary" />
        <MetricCard label="Items Counted" value={String(kpis?.itemsCounted ?? 0)} icon={ListChecks} />
        <MetricCard label="Items With Variance" value={String(kpis?.itemsWithVariance ?? 0)} icon={Scale} accent="warning" />
        <MetricCard label="Count Accuracy" value={`${kpis?.accuracyPct ?? 0}%`} icon={Target} accent="success" />
        <MetricCard label="Awaiting Sign-off" value={String((kpis?.pendingReviewCount ?? 0) + (kpis?.pendingApprovalCount ?? 0))} icon={ClipboardCheck} accent="warning" />
        {canViewCost && (
          <MetricCard
            label="Net Variance Value"
            value={<><SARIcon />{fmt(kpis?.netVarianceValue ?? 0)}</>}
            icon={TrendingDown}
            accent={(kpis?.netVarianceValue ?? 0) < 0 ? "destructive" : "success"}
          />
        )}
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "countId", label: "Count ID", render: (r: StockReconciliationRow) => <span className="font-mono text-[11px]">{r.countId}</span> },
            {
              key: "countType",
              label: "Count Type",
              // Null means the session predates count_type — "Unspecified", not a guess at which
              // of the three it was.
              render: (r: StockReconciliationRow) => r.countType
                ? <Badge variant="outline" className="text-[10px] capitalize">{COUNT_TYPE_LABELS[r.countType]}</Badge>
                : <span className="text-muted-foreground text-xs">Unspecified</span>,
            },
            {
              key: "startedAt",
              label: "Started",
              render: (r: StockReconciliationRow) =>
                new Date(r.startedAt).toLocaleString("en-SA", { dateStyle: "short", timeStyle: "short" }),
            },
            {
              key: "location",
              label: "Branch / Warehouse",
              render: (r: StockReconciliationRow) => r.branch ?? (r.warehouse ? `${r.warehouse} (Warehouse)` : "—"),
            },
            { key: "sku", label: "SKU" },
            { key: "productName", label: "Product" },
            { key: "category", label: "Category" },
            { key: "systemQty", label: "System Qty" },
            // A pending line has no counted quantity yet; a dash distinguishes that from a
            // genuine count of zero.
            { key: "countedQty", label: "Counted Qty", render: (r: StockReconciliationRow) => num(r.countedQty) },
            {
              key: "variance",
              label: "Variance",
              render: (r: StockReconciliationRow) =>
                r.variance == null ? <span className="text-muted-foreground">—</span> : (
                  <span className={r.variance < 0 ? "text-destructive font-semibold" : r.variance > 0 ? "text-success font-semibold" : "text-muted-foreground"}>
                    {r.variance > 0 ? "+" : ""}{r.variance}
                  </span>
                ),
            },
            ...(canViewCost
              ? [{
                  key: "varianceValue",
                  label: "Variance Value",
                  render: (r: StockReconciliationRow) => <><SARIcon />{fmt(r.varianceValue)}</>,
                }]
              : []),
            { key: "startedBy", label: "Started By" },
            { key: "performedBy", label: "Performed By", render: (r: StockReconciliationRow) => r.performedBy ?? "—" },
            { key: "reviewedBy", label: "Reviewed By", render: (r: StockReconciliationRow) => r.reviewedBy ?? "—" },
            { key: "approvedBy", label: "Approved By", render: (r: StockReconciliationRow) => r.approvedBy ?? "—" },
            {
              key: "status",
              label: "Reconciliation Status",
              render: (r: StockReconciliationRow) => <StatusBadge status={r.status.replace(/_/g, " ")} />,
            },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
