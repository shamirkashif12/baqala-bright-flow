import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { api, type StockTransferReportRow, type ReportExportFormat, type Warehouse, type Product, type User } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { ArrowLeftRight, Boxes, CheckCircle, DollarSign, Eye } from "lucide-react";

export const Route = createFileRoute("/_app/reports/stock-transfer")({ component: StockTransferReport });

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const TRANSFER_TYPES = ["supplier_to_warehouse", "warehouse_to_branch", "branch_to_warehouse", "branch_to_branch", "warehouse_to_warehouse"];
const STATUSES = ["draft", "pending_approval", "approved", "in_transit", "completed", "rejected", "cancelled"];

// The API returns one row per product line; group by transfer so the main table shows one row
// per transfer (with ordered/received totals) and the product/SKU/unit-cost breakdown moves into
// the detail drawer behind the eye icon instead of cluttering the table with a row per SKU.
interface StockTransferGroup {
  transferNumber: string; transferType: string; sourceLocation: string; destinationLocation: string; status: string;
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
        transferNumber: r.transferNumber, transferType: r.transferType, sourceLocation: r.sourceLocation,
        destinationLocation: r.destinationLocation, status: r.status, createdBy: r.createdBy, approvedBy: r.approvedBy,
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
              <div><span className="text-muted-foreground">Source</span><p className="font-medium">{group.sourceLocation}</p></div>
              <div><span className="text-muted-foreground">Destination</span><p className="font-medium">{group.destinationLocation}</p></div>
              <div><span className="text-muted-foreground">Created By</span><p className="font-medium">{group.createdBy}</p></div>
              <div><span className="text-muted-foreground">Approved By</span><p className="font-medium">{group.approvedBy}</p></div>
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
  const [sourceWarehouseIds, setSourceWarehouseIds] = useState<string[]>([]);
  const [destWarehouseIds, setDestWarehouseIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [createdByIds, setCreatedByIds] = useState<string[]>([]);
  const [approvedByIds, setApprovedByIds] = useState<string[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [rows, setRows] = useState<StockTransferReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewTransfer, setViewTransfer] = useState<StockTransferGroup | null>(null);

  useEffect(() => { api.getWarehouses().then(setWarehouses).catch(() => {}); }, []);
  useEffect(() => { api.getProducts().then(setProducts).catch(() => {}); }, []);
  useEffect(() => { api.getUsers().then(setUsers).catch(() => {}); }, []);

  const filterParams = {
    from, to,
    transferType: transferType !== "all" ? transferType : undefined,
    status: statuses.length ? statuses : undefined,
    sourceWarehouseId: sourceWarehouseIds.length ? sourceWarehouseIds : undefined,
    destWarehouseId: destWarehouseIds.length ? destWarehouseIds : undefined,
    productId: productIds.length ? productIds : undefined,
    createdBy: createdByIds.length ? createdByIds : undefined,
    approvedBy: approvedByIds.length ? approvedByIds : undefined,
  };

  const load = useCallback(() => {
    setLoading(true);
    api.getStockTransferReport(filterParams)
      .then(setRows)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, transferType, statuses, sourceWarehouseIds, destWarehouseIds, productIds, createdByIds, approvedByIds]);

  useEffect(() => { load(); }, [load]);

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

  return (
    <PageShell title="Stock Transfer Report" subtitle="Full history of stock movement between warehouses and branches">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        </div>
        <Select value={transferType} onValueChange={setTransferType}>
          <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Transfer Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {TRANSFER_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="w-36">
          <SearchableMultiSelect
            placeholder="All Statuses"
            options={STATUSES.map((s) => ({ id: s, label: s.replace(/_/g, " ") }))}
            selected={statuses}
            onChange={setStatuses}
          />
        </div>
        <div className="w-44">
          <SearchableMultiSelect
            placeholder="Any Source Warehouse"
            options={warehouses.map((w) => ({ id: w.id, label: w.name }))}
            selected={sourceWarehouseIds}
            onChange={setSourceWarehouseIds}
          />
        </div>
        <div className="w-44">
          <SearchableMultiSelect
            placeholder="Any Destination Warehouse"
            options={warehouses.map((w) => ({ id: w.id, label: w.name }))}
            selected={destWarehouseIds}
            onChange={setDestWarehouseIds}
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
        <div className="w-40">
          <SearchableMultiSelect
            placeholder="Created By: Anyone"
            options={users.map((u) => ({ id: u.id, label: u.fullName }))}
            selected={createdByIds}
            onChange={setCreatedByIds}
          />
        </div>
        <div className="w-40">
          <SearchableMultiSelect
            placeholder="Approved By: Anyone"
            options={users.map((u) => ({ id: u.id, label: u.fullName }))}
            selected={approvedByIds}
            onChange={setApprovedByIds}
          />
        </div>
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
            { key: "sourceLocation", label: "Source" },
            { key: "destinationLocation", label: "Destination" },
            { key: "status", label: "Status", className: "capitalize", render: (g: StockTransferGroup) => g.status.replace(/_/g, " ") },
            { key: "createdBy", label: "Created By" },
            { key: "approvedBy", label: "Approved By" },
            { key: "receivedBy", label: "Received By" },
            { key: "orderedQuantity", label: "Quantity Ordered" },
            { key: "receivedQuantity", label: "Quantity Received" },
            { key: "totalCost", label: "Total Cost", render: (g: StockTransferGroup) => <span className="font-semibold"><SARIcon />{fmtSAR(g.totalCost)}</span> },
            { key: "createdAt", label: "Created At", render: (g: StockTransferGroup) => new Date(g.createdAt).toLocaleDateString("en-SA") },
            { key: "completedDate", label: "Completed At", render: (g: StockTransferGroup) => g.completedDate ? new Date(g.completedDate).toLocaleDateString("en-SA") : "—" },
            { key: "view", label: "", render: (g: StockTransferGroup) => (
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
