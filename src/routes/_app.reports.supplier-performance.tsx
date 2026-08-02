import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable, FilterField, StatusBadge } from "@/components/module-placeholder";
import { DateRangeField } from "@/components/report-filters/date-range-field";
import { ReportExportButton } from "@/components/report-export-button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { api, type SupplierPerformanceReport as SupplierPerformanceData, type SupplierPerformanceRow, type ReportExportFormat, type Supplier, type Product, type User, type Warehouse } from "@/lib/api";
import { useBranch } from "@/lib/branch-context";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Gauge, Clock, Wallet, DollarSign, X, SlidersHorizontal, ChevronDown } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/reports/supplier-performance")({ component: SupplierPerformance });

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function SupplierPerformance() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  const [branchIds, setBranchIds] = useState<string[]>(lockedBranchId ? [lockedBranchId] : []);
  const [warehouseIds, setWarehouseIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [createdByIds, setCreatedByIds] = useState<string[]>([]);
  const [approvedByIds, setApprovedByIds] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [data, setData] = useState<SupplierPerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => { api.getSuppliers().then(setSuppliers).catch(() => {}); }, []);
  useEffect(() => { api.getProducts().then(setProducts).catch(() => {}); }, []);
  useEffect(() => { api.getWarehouses().then(setWarehouses).catch(() => {}); }, []);
  useEffect(() => {
    api.getUsers({ branchId: branchIds.length === 1 ? branchIds[0] : undefined }).then(setUsers).catch(() => {});
  }, [branchIds]);

  const load = useCallback(() => {
    setLoading(true);
    api.getSupplierPerformanceReport({
      from, to, supplierId: supplierIds.length ? supplierIds : undefined,
      branchId: branchIds.length ? branchIds : undefined, warehouseId: warehouseIds.length ? warehouseIds : undefined,
      productId: productIds.length ? productIds : undefined,
      createdBy: createdByIds.length ? createdByIds : undefined, approvedBy: approvedByIds.length ? approvedByIds : undefined,
    })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, supplierIds, branchIds, warehouseIds, productIds, createdByIds, approvedByIds]);

  useEffect(() => { load(); }, [load]);

  const hasFilters = from !== firstOfMonthStr() || to !== todayStr() || supplierIds.length > 0
    || (!lockedBranchId && branchIds.length > 0) || warehouseIds.length > 0 || productIds.length > 0
    || createdByIds.length > 0 || approvedByIds.length > 0;
  const clearFilters = () => {
    setFrom(firstOfMonthStr()); setTo(todayStr()); setSupplierIds([]);
    if (!lockedBranchId) setBranchIds([]);
    setWarehouseIds([]);
    setProductIds([]); setCreatedByIds([]); setApprovedByIds([]);
  };

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportSupplierPerformanceReport({
        from, to, supplierId: supplierIds.length ? supplierIds : undefined,
        branchId: branchIds.length ? branchIds : undefined, warehouseId: warehouseIds.length ? warehouseIds : undefined,
        productId: productIds.length ? productIds : undefined,
        createdBy: createdByIds.length ? createdByIds : undefined, approvedBy: approvedByIds.length ? approvedByIds : undefined,
        exportedBy: user?.id, format,
      });
      downloadBlob(blob, `supplier-performance-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const advancedFilterCount = productIds.length + createdByIds.length + approvedByIds.length;
  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const isLowFillRate = (r: SupplierPerformanceRow) => r.fillRatePct < 80;
  const chartData = (data?.rows ?? []).slice(0, 10).map((r) => ({ name: r.supplierName, fillRate: r.fillRatePct }));

  return (
    <PageShell title="Supplier Performance" subtitle="Lead time, fill rate, purchase value and dues">
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="rounded-xl border border-border/60 bg-card p-3 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex items-center gap-1">
            <DateRangeField from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
          </div>
          <FilterField label="Supplier">
            <div className="w-48">
              <SearchableMultiSelect
                placeholder="All Suppliers"
                options={suppliers.map((s) => ({ id: s.id, label: s.name }))}
                selected={supplierIds}
                onChange={setSupplierIds}
              />
            </div>
          </FilterField>
          {!lockedBranchId && (
            <FilterField label="Branch">
              <div className="w-40">
                <SearchableMultiSelect
                  placeholder="All Branches"
                  options={branches.map((b) => ({ id: b.id, label: b.name }))}
                  selected={branchIds}
                  onChange={setBranchIds}
                />
              </div>
            </FilterField>
          )}
          <FilterField label="Warehouse">
            <div className="w-40">
              <SearchableMultiSelect
                placeholder="All Warehouses"
                options={warehouses.map((w) => ({ id: w.id, label: w.name }))}
                selected={warehouseIds}
                onChange={setWarehouseIds}
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
          <FilterField label="Created By">
            <SearchableMultiSelect
              placeholder="Created By: Anyone"
              options={users.map((u) => ({ id: u.id, label: u.fullName }))}
              selected={createdByIds}
              onChange={setCreatedByIds}
            />
          </FilterField>
          <FilterField label="Approved By">
            <SearchableMultiSelect
              placeholder="Approved By: Anyone"
              options={users.map((u) => ({ id: u.id, label: u.fullName }))}
              selected={approvedByIds}
              onChange={setApprovedByIds}
            />
          </FilterField>
        </CollapsibleContent>
      </Collapsible>

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <MetricCard label="Best Fill Rate %" value={`${kpis?.bestFillRatePct ?? 0}%`} icon={Gauge} accent="success" />
        <MetricCard label="Avg Lead Time (days)" value={String(kpis?.averageLeadTimeDays ?? 0)} icon={Clock} />
        <MetricCard label="Total Purchase Value" value={<><SARIcon />{fmt(kpis?.totalPurchaseValue ?? 0)}</>} icon={Wallet} accent="primary" />
        <MetricCard label="Outstanding Dues" value={<><SARIcon />{fmt(kpis?.outstandingDues ?? 0)}</>} icon={DollarSign} accent="destructive" />
        <MetricCard label="RTS Value" value={<><SARIcon />{fmt(kpis?.rtsValue ?? 0)}</>} icon={DollarSign} accent="warning" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Fill Rate by Supplier</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" fontSize={11} />
            <YAxis fontSize={11} unit="%" />
            <Tooltip formatter={(v: number) => `${v}%`} />
            <Bar dataKey="fillRate" radius={[4, 4, 0, 0]}>
              {chartData.map((d) => <Cell key={d.name} fill={d.fillRate < 80 ? "var(--destructive)" : "var(--success)"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "supplierId", label: "Supplier ID" },
            { key: "supplierName", label: "Supplier Name" },
            { key: "supplierStatus", label: "Status", render: (r: SupplierPerformanceRow) => <StatusBadge status={r.supplierStatus} /> },
            { key: "poCount", label: "PO Count" },
            { key: "orderedQty", label: "Ordered Qty" },
            { key: "receivedQty", label: "Received Qty" },
            { key: "fillRatePct", label: "Fill Rate %", render: (r: SupplierPerformanceRow) => <span className={cn(isLowFillRate(r) && "text-destructive font-semibold")}>{r.fillRatePct}%</span> },
            { key: "averageLeadTimeDays", label: "Avg Lead Time (days)" },
            { key: "lateDeliveries", label: "Late Deliveries" },
            { key: "purchaseValue", label: "Purchase Value", render: (r: SupplierPerformanceRow) => <span className="font-semibold"><SARIcon />{fmt(r.purchaseValue)}</span> },
            { key: "outstandingDues", label: "Outstanding Dues", render: (r: SupplierPerformanceRow) => <><SARIcon />{fmt(r.outstandingDues)}</> },
            { key: "supplierReturnsQty", label: "Supplier Returns Qty" },
            { key: "rtsValue", label: "RTS Value", render: (r: SupplierPerformanceRow) => <><SARIcon />{fmt(r.rtsValue)}</> },
            { key: "lastPoDate", label: "Last PO Date", render: (r: SupplierPerformanceRow) => new Date(r.lastPoDate).toLocaleDateString("en-SA") },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
