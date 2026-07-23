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
import { api, type SupplierReturnsReportRow, type SupplierReturnsReportItem, type ReportExportFormat, type Supplier, type Warehouse } from "@/lib/api";
import { useBranch } from "@/lib/branch-context";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { PackageSearch, Truck, RotateCcw, DollarSign } from "lucide-react";

export const Route = createFileRoute("/_app/reports/supplier-returns")({ component: SupplierReturnsReport });

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const RETURN_REASONS = ["expired", "damaged", "quality_issue", "overstock", "other"];

// Reason/quantity/notes are captured per line item — flatten to one row per item so every field
// is a plain column instead of being hidden behind a per-return detail drawer.
interface SupplierReturnLineRow extends SupplierReturnsReportItem {
  returnNumber: string; returnDate: string; supplierName: string; warehouseName: string;
  returnedBy: string; approvedBy: string; status: string;
}
function flattenReturnItems(rows: SupplierReturnsReportRow[]): SupplierReturnLineRow[] {
  return rows.flatMap((r) =>
    r.items.map((it) => ({
      ...it,
      returnNumber: r.returnNumber, returnDate: r.returnDate, supplierName: r.supplierName,
      warehouseName: r.warehouseName, returnedBy: r.returnedBy, approvedBy: r.approvedBy, status: r.status,
    }))
  );
}

function SupplierReturnsReport() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  const [warehouseIds, setWarehouseIds] = useState<string[]>([]);
  const [branchIds, setBranchIds] = useState<string[]>(lockedBranchId ? [lockedBranchId] : []);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [reason, setReason] = useState("all");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [rows, setRows] = useState<SupplierReturnsReportRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.getSuppliers().then(setSuppliers).catch(() => {}); }, []);
  useEffect(() => { api.getWarehouses().then(setWarehouses).catch(() => {}); }, []);

  const filterParams = {
    from, to,
    supplierId: supplierIds.length ? supplierIds : undefined,
    warehouseId: warehouseIds.length ? warehouseIds : undefined,
    branchId: branchIds.length ? branchIds : undefined,
    status: statuses.length ? statuses : undefined,
    reason: reason !== "all" ? reason : undefined,
  };

  const load = useCallback(() => {
    setLoading(true);
    api.getSupplierReturnsReport(filterParams)
      .then(setRows)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, supplierIds, warehouseIds, branchIds, statuses, reason]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportSupplierReturnsReport({ ...filterParams, exportedBy: user?.id, format });
      downloadBlob(blob, `supplier-returns-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const totalValue = rows.reduce((s, r) => s + r.totalValue, 0);
  const totalQty = rows.reduce((s, r) => s + r.items.reduce((s2, i) => s2 + i.returnedQuantity, 0), 0);
  const supplierCount = new Set(rows.map(r => r.supplierName)).size;
  const lineRows = flattenReturnItems(rows);

  return (
    <PageShell title="Supplier Returns Report" subtitle="Full transaction detail for stock returned to suppliers">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        </div>
        <div className="w-48">
          <SearchableMultiSelect
            placeholder="All Suppliers"
            options={suppliers.map((s) => ({ id: s.id, label: s.name }))}
            selected={supplierIds}
            onChange={setSupplierIds}
          />
        </div>
        <div className="w-44">
          <SearchableMultiSelect
            placeholder="All Warehouses"
            options={warehouses.map((w) => ({ id: w.id, label: w.name }))}
            selected={warehouseIds}
            onChange={setWarehouseIds}
          />
        </div>
        {!lockedBranchId && (
          <div className="w-40">
            <SearchableMultiSelect
              placeholder="All Branches"
              options={branches.map((b) => ({ id: b.id, label: b.name }))}
              selected={branchIds}
              onChange={setBranchIds}
            />
          </div>
        )}
        <div className="w-36">
          <SearchableMultiSelect
            placeholder="All Statuses"
            options={["draft", "pending_approval", "approved", "in_transit", "completed", "rejected", "cancelled"].map((s) => ({ id: s, label: s.replace(/_/g, " ") }))}
            selected={statuses}
            onChange={setStatuses}
          />
        </div>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Reason" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Reasons</SelectItem>
            {RETURN_REASONS.map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Returns" value={String(rows.length)} icon={PackageSearch} accent="primary" />
        <MetricCard label="Suppliers Involved" value={String(supplierCount)} icon={Truck} />
        <MetricCard label="Total Returned Qty" value={String(totalQty)} icon={RotateCcw} accent="warning" />
        <MetricCard label="Total Return Value" value={<><SARIcon />{fmtSAR(totalValue)}</>} icon={DollarSign} accent="destructive" />
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "returnNumber", label: "Return Number" },
            { key: "returnDate", label: "Return Date", render: (r: SupplierReturnLineRow) => new Date(r.returnDate).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) },
            { key: "supplierName", label: "Supplier" },
            { key: "warehouseName", label: "Warehouse" },
            { key: "productName", label: "Product" },
            { key: "sku", label: "SKU", className: "font-mono text-xs" },
            { key: "returnedQuantity", label: "Return Quantity" },
            { key: "reason", label: "Return Reason", className: "capitalize", render: (r: SupplierReturnLineRow) => r.reason.replace(/_/g, " ") },
            { key: "notes", label: "Notes", render: (r: SupplierReturnLineRow) => (
              <span className="line-clamp-2 max-w-[220px] text-xs text-muted-foreground">{r.notes || "—"}</span>
            ) },
            { key: "unitCost", label: "Unit Cost", render: (r: SupplierReturnLineRow) => <span><SARIcon />{fmtSAR(r.unitCost)}</span> },
            { key: "totalValue", label: "Line Value", render: (r: SupplierReturnLineRow) => <span className="font-semibold"><SARIcon />{fmtSAR(r.totalValue)}</span> },
            { key: "returnedBy", label: "Returned By" },
            { key: "approvedBy", label: "Approved By" },
            { key: "status", label: "Status", className: "capitalize", render: (r: SupplierReturnLineRow) => r.status.replace(/_/g, " ") },
          ]}
          rows={lineRows}
          emptyMessage="No supplier returns match the current filters."
        />
      )}
    </PageShell>
  );
}
