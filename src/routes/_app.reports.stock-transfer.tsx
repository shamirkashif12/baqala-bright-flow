import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { DateRangeField } from "@/components/report-filters/date-range-field";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable, FilterField } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { api, type StockTransferReportRow, type ReportExportFormat, type Warehouse, type Product, type User } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { ArrowLeftRight, Boxes, CheckCircle, DollarSign, Eye, X, SlidersHorizontal, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/reports/stock-transfer")({ component: StockTransferReport });

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const TRANSFER_TYPES = ["supplier_to_warehouse", "warehouse_to_branch", "branch_to_warehouse", "branch_to_branch", "warehouse_to_warehouse"];
const STATUSES = ["draft", "pending_approval", "approved", "in_transit", "completed", "rejected", "cancelled"];

// The API returns one row per product line; group by transfer so the main table shows one row
// per transfer (with ordered/received totals) and the product/SKU/unit-cost breakdown moves into
// the detail drawer behind the eye icon instead of cluttering the table with a row per SKU.
interface StockTransferGroup {
  transferNumber: string; transferType: string;
  sourceBranch: string; destinationBranch: string; sendingWarehouse: string; receivingWarehouse: string;
  status: string;
  createdBy: string; approvedBy: string; receivedBy: string; createdAt: string; completedDate?: string;
  orderedQuantity: number; receivedQuantity: number; totalCost: number;
  items: StockTransferReportRow[];
}
function groupByTransfer(rows: StockTransferReportRow[]): StockTransferGroup[] {
  const groups = new Map<string, StockTransferGroup>();
  for (const r of rows) {
    let g = groups.get(r.transferNumber);
    if (!g) {
      g = {
        transferNumber: r.transferNumber, transferType: r.transferType,
        sourceBranch: r.sourceBranch, destinationBranch: r.destinationBranch,
        sendingWarehouse: r.sendingWarehouse, receivingWarehouse: r.receivingWarehouse,
        status: r.status, createdBy: r.createdBy, approvedBy: r.approvedBy,
        receivedBy: r.receivedBy, createdAt: r.createdAt, completedDate: r.completedDate,
        orderedQuantity: 0, receivedQuantity: 0, totalCost: 0, items: [],
      };
      groups.set(r.transferNumber, g);
    }
    g.orderedQuantity += r.orderedQuantity;
    g.receivedQuantity += r.receivedQuantity;
    g.totalCost += r.totalCost;
    g.items.push(r);
  }
  return [...groups.values()];
}

function StockTransferDetailDrawer({ group, onClose }: { group: StockTransferGroup | null; onClose: () => void }) {
  return (
    <Sheet open={!!group} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-[560px] overflow-y-auto">
        <SheetHeader className="pb-3">
          <SheetTitle className="text-base">{group?.transferNumber}</SheetTitle>
        </SheetHeader>
        {group && (
          <div className="mt-2 space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">Source Branch</span><p className="font-medium">{group.sourceBranch}</p></div>
              <div><span className="text-muted-foreground">Destination Branch</span><p className="font-medium">{group.destinationBranch}</p></div>
              <div><span className="text-muted-foreground">Sending Warehouse</span><p className="font-medium">{group.sendingWarehouse}</p></div>
              <div><span className="text-muted-foreground">Receiving Warehouse</span><p className="font-medium">{group.receivingWarehouse}</p></div>
              <div><span className="text-muted-foreground">Transfer Date & Time</span><p className="font-medium">{fmtDateTime(group.createdAt)}</p></div>
              <div><span className="text-muted-foreground">Completed</span><p className="font-medium">{group.completedDate ? fmtDateTime(group.completedDate) : "—"}</p></div>
              <div><span className="text-muted-foreground">Created By</span><p className="font-medium">{group.createdBy}</p></div>
              <div><span className="text-muted-foreground">Approved By</span><p className="font-medium">{group.approvedBy}</p></div>
              <div><span className="text-muted-foreground">Received By</span><p className="font-medium">{group.receivedBy}</p></div>
              <div><span className="text-muted-foreground">Status</span><p className="font-medium capitalize">{group.status.replace(/_/g, " ")}</p></div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Products ({group.items.length})</p>
              <div className="space-y-1.5">
                {group.items.map((it, idx) => (
                  <div key={idx} className="rounded-xl border border-border/40 px-3 py-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{it.productName}</span>
                      <span className="font-mono text-muted-foreground">{it.sku}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-muted-foreground">
                      <span>Ordered {it.orderedQuantity} · Received {it.receivedQuantity}</span>
                      <span>Unit <SARIcon />{fmtSAR(it.unitCost)}</span>
                      <span className="font-semibold text-foreground">Line <SARIcon />{fmtSAR(it.totalCost)}</span>
                    </div>
                    {it.notes && <p className="mt-1 text-muted-foreground">{it.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between border-t border-border/40 pt-2 font-bold text-base">
              <span>Total</span><span className="flex items-center gap-0.5"><SARIcon />{fmtSAR(group.totalCost)}</span>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function StockTransferReport() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [transferType, setTransferType] = useState("all");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [sourceBranchIds, setSourceBranchIds] = useState<string[]>([]);
  const [sourceWarehouseIds, setSourceWarehouseIds] = useState<string[]>([]);
  const [destBranchIds, setDestBranchIds] = useState<string[]>([]);
  const [destWarehouseIds, setDestWarehouseIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [createdByIds, setCreatedByIds] = useState<string[]>([]);
  const [approvedByIds, setApprovedByIds] = useState<string[]>([]);
  const [receivedByIds, setReceivedByIds] = useState<string[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [rows, setRows] = useState<StockTransferReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewTransfer, setViewTransfer] = useState<StockTransferGroup | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const { branches } = useBranch();

  useEffect(() => { api.getWarehouses().then(setWarehouses).catch(() => {}); }, []);
  useEffect(() => { api.getProducts().then(setProducts).catch(() => {}); }, []);
  useEffect(() => { api.getUsers().then(setUsers).catch(() => {}); }, []);

  const filterParams = {
    from, to,
    transferType: transferType !== "all" ? transferType : undefined,
    status: statuses.length ? statuses : undefined,
    sourceBranchId: sourceBranchIds.length ? sourceBranchIds : undefined,
    sourceWarehouseId: sourceWarehouseIds.length ? sourceWarehouseIds : undefined,
    destBranchId: destBranchIds.length ? destBranchIds : undefined,
    destWarehouseId: destWarehouseIds.length ? destWarehouseIds : undefined,
    productId: productIds.length ? productIds : undefined,
    createdBy: createdByIds.length ? createdByIds : undefined,
    approvedBy: approvedByIds.length ? approvedByIds : undefined,
    receivedBy: receivedByIds.length ? receivedByIds : undefined,
  };

  const load = useCallback(() => {
    setLoading(true);
    api.getStockTransferReport(filterParams)
      .then(setRows)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, transferType, statuses, sourceBranchIds, sourceWarehouseIds, destBranchIds, destWarehouseIds, productIds, createdByIds, approvedByIds, receivedByIds]);

  useEffect(() => { load(); }, [load]);

  const hasFilters = from !== firstOfMonthStr() || to !== todayStr() || transferType !== "all"
    || statuses.length > 0 || sourceBranchIds.length > 0 || sourceWarehouseIds.length > 0
    || destBranchIds.length > 0 || destWarehouseIds.length > 0
    || productIds.length > 0 || createdByIds.length > 0 || approvedByIds.length > 0 || receivedByIds.length > 0;
  const clearFilters = () => {
    setFrom(firstOfMonthStr()); setTo(todayStr()); setTransferType("all");
    setStatuses([]); setSourceBranchIds([]); setSourceWarehouseIds([]); setDestBranchIds([]); setDestWarehouseIds([]);
    setProductIds([]); setCreatedByIds([]); setApprovedByIds([]); setReceivedByIds([]);
  };

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportStockTransferReport({ ...filterParams, exportedBy: user?.id, format });
      downloadBlob(blob, `stock-transfer-report-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const totalCost = rows.reduce((s, r) => s + r.totalCost, 0);
  const groups = groupByTransfer(rows);
  const completedCount = groups.filter(g => g.status === "completed").length;
  const advancedFilterCount = (transferType !== "all" ? 1 : 0) + destBranchIds.length + destWarehouseIds.length
    + productIds.length + createdByIds.length + approvedByIds.length + receivedByIds.length;

  return (
    <PageShell title="Stock Transfer Report" subtitle="Full history of stock movement between warehouses and branches">
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="rounded-xl border border-border/60 bg-card p-3 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <DateRangeField from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
          <FilterField label="Status">
            <div className="w-36">
              <SearchableMultiSelect
                placeholder="All Statuses"
                options={STATUSES.map((s) => ({ id: s, label: s.replace(/_/g, " ") }))}
                selected={statuses}
                onChange={setStatuses}
              />
            </div>
          </FilterField>
          <FilterField label="Source Branch">
            <div className="w-40">
              <SearchableMultiSelect
                placeholder="Any Source Branch"
                options={branches.map((b) => ({ id: b.id, label: b.name }))}
                selected={sourceBranchIds}
                onChange={setSourceBranchIds}
              />
            </div>
          </FilterField>
          <FilterField label="Source Warehouse">
            <div className="w-44">
              <SearchableMultiSelect
                placeholder="Any Source Warehouse"
                options={warehouses.map((w) => ({ id: w.id, label: w.name }))}
                selected={sourceWarehouseIds}
                onChange={setSourceWarehouseIds}
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
          <FilterField label="Transfer Type">
            <Select value={transferType} onValueChange={setTransferType}>
              <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Transfer Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {TRANSFER_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Destination Branch">
            <div className="w-40">
              <SearchableMultiSelect
                placeholder="Any Destination Branch"
                options={branches.map((b) => ({ id: b.id, label: b.name }))}
                selected={destBranchIds}
                onChange={setDestBranchIds}
              />
            </div>
          </FilterField>
          <FilterField label="Destination Warehouse">
            <div className="w-44">
              <SearchableMultiSelect
                placeholder="Any Destination Warehouse"
                options={warehouses.map((w) => ({ id: w.id, label: w.name }))}
                selected={destWarehouseIds}
                onChange={setDestWarehouseIds}
              />
            </div>
          </FilterField>
          <FilterField label="Product">
            <div className="w-44">
              <SearchableMultiSelect
                placeholder="All Products"
                options={products.map((p) => ({ id: p.id, label: p.name }))}
                selected={productIds}
                onChange={setProductIds}
              />
            </div>
          </FilterField>
          <FilterField label="Created By">
            <div className="w-40">
              <SearchableMultiSelect
                placeholder="Created By: Anyone"
                options={users.map((u) => ({ id: u.id, label: u.fullName }))}
                selected={createdByIds}
                onChange={setCreatedByIds}
              />
            </div>
          </FilterField>
          <FilterField label="Approved By">
            <div className="w-40">
              <SearchableMultiSelect
                placeholder="Approved By: Anyone"
                options={users.map((u) => ({ id: u.id, label: u.fullName }))}
                selected={approvedByIds}
                onChange={setApprovedByIds}
              />
            </div>
          </FilterField>
          <FilterField label="Received By">
            <div className="w-40">
              <SearchableMultiSelect
                placeholder="Received By: Anyone"
                options={users.map((u) => ({ id: u.id, label: u.fullName }))}
                selected={receivedByIds}
                onChange={setReceivedByIds}
              />
            </div>
          </FilterField>
        </CollapsibleContent>
      </Collapsible>

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <MetricCard label="Total Transfers" value={String(groups.length)} icon={ArrowLeftRight} accent="primary" />
        <MetricCard label="Completed" value={String(completedCount)} icon={CheckCircle} accent="success" />
        <MetricCard label="Distinct Products" value={String(new Set(rows.map(r => r.productName)).size)} icon={Boxes} />
        <MetricCard label="Total Cost Moved" value={<><SARIcon />{fmtSAR(totalCost)}</>} icon={DollarSign} accent="warning" />
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "transferNumber", label: "Transfer Number" },
            { key: "transferType", label: "Type", className: "capitalize", render: (g: StockTransferGroup) => g.transferType.replace(/_/g, " ") },
            { key: "sourceBranch", label: "Source Branch" },
            { key: "destinationBranch", label: "Destination Branch" },
            { key: "sendingWarehouse", label: "Sending Warehouse" },
            { key: "receivingWarehouse", label: "Receiving Warehouse" },
            { key: "status", label: "Status", className: "capitalize", render: (g: StockTransferGroup) => g.status.replace(/_/g, " ") },
            { key: "createdBy", label: "Created By" },
            { key: "approvedBy", label: "Approved By" },
            { key: "receivedBy", label: "Received By" },
            { key: "orderedQuantity", label: "Quantity Ordered" },
            { key: "receivedQuantity", label: "Quantity Received" },
            { key: "totalCost", label: "Total Cost", render: (g: StockTransferGroup) => <span className="font-semibold"><SARIcon />{fmtSAR(g.totalCost)}</span> },
            { key: "createdAt", label: "Transfer Date & Time", render: (g: StockTransferGroup) => fmtDateTime(g.createdAt) },
            { key: "completedDate", label: "Completed Date & Time", render: (g: StockTransferGroup) => g.completedDate ? fmtDateTime(g.completedDate) : "—" },
            { key: "view", label: "Action", render: (g: StockTransferGroup) => (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewTransfer(g)}><Eye className="h-3.5 w-3.5" /></Button>
            ) },
          ]}
          rows={groups}
          emptyMessage="No stock transfers match the current filters."
        />
      )}
      <StockTransferDetailDrawer group={viewTransfer} onClose={() => setViewTransfer(null)} />
    </PageShell>
  );
}
