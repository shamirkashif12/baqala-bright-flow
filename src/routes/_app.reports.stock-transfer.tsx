import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Input } from "@/components/ui/input";
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
import { ArrowLeftRight, Boxes, CheckCircle, DollarSign } from "lucide-react";

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
  const completedCount = rows.filter(r => r.status === "completed").length;

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
        <MetricCard label="Total Transfer Lines" value={String(rows.length)} icon={ArrowLeftRight} accent="primary" />
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
            { key: "transferType", label: "Type", className: "capitalize", render: (r: StockTransferReportRow) => r.transferType.replace(/_/g, " ") },
            { key: "sourceLocation", label: "Source" },
            { key: "destinationLocation", label: "Destination" },
            { key: "status", label: "Status", className: "capitalize", render: (r: StockTransferReportRow) => r.status.replace(/_/g, " ") },
            { key: "createdBy", label: "Created By" },
            { key: "approvedBy", label: "Approved By" },
            { key: "receivedBy", label: "Received By" },
            { key: "productName", label: "Product" },
            { key: "sku", label: "SKU" },
            { key: "quantity", label: "Quantity" },
            { key: "unitCost", label: "Unit Cost", render: (r: StockTransferReportRow) => <><SARIcon />{fmtSAR(r.unitCost)}</> },
            { key: "totalCost", label: "Total Cost", render: (r: StockTransferReportRow) => <span className="font-semibold"><SARIcon />{fmtSAR(r.totalCost)}</span> },
            { key: "createdAt", label: "Created At", render: (r: StockTransferReportRow) => new Date(r.createdAt).toLocaleDateString("en-SA") },
            { key: "completedDate", label: "Completed At", render: (r: StockTransferReportRow) => r.completedDate ? new Date(r.completedDate).toLocaleDateString("en-SA") : "—" },
            { key: "notes", label: "Notes", className: "max-w-[200px] truncate", render: (r: StockTransferReportRow) => r.notes ?? "—" },
          ]}
          rows={rows}
          emptyMessage="No stock transfers match the current filters."
        />
      )}
    </PageShell>
  );
}
