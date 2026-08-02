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
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { api, type SupplierReturnsReportRow, type SupplierReturnsReportItem, type ReportExportFormat, type Supplier, type Warehouse, type User } from "@/lib/api";
import { useBranch } from "@/lib/branch-context";
import { useReportFilterOptions } from "@/lib/use-report-filters";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { PackageSearch, Truck, RotateCcw, DollarSign, Eye, X } from "lucide-react";

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
const STATUSES = ["draft", "pending_approval", "approved", "in_transit", "completed", "rejected", "cancelled"];

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_approval: "bg-warning/15 text-warning-foreground",
  approved: "bg-primary/15 text-primary",
  in_transit: "bg-primary/15 text-primary",
  completed: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
  cancelled: "bg-destructive/15 text-destructive",
};

const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

// Reason/quantity/notes are captured per line item — flattening gives one row per returned
// product, which is what a product-level audit wants. The per-return view (with a detail drawer)
// mirrors the Purchase Report instead. Both are offered because they answer different questions.
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

// Mirrors PurchaseOrderDetailDrawer — the full list of returned products behind one RTS document,
// with requested/approved/received quantities so a partially-accepted return reads correctly.
function SupplierReturnDetailDrawer({ rts, onClose }: { rts: SupplierReturnsReportRow | null; onClose: () => void }) {
  return (
    <Sheet open={!!rts} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[560px] overflow-y-auto">
        {rts && (
          <>
            <SheetHeader className="pb-4 border-b border-border/60">
              <SheetTitle className="text-base font-mono">{rts.returnNumber}</SheetTitle>
              <p className="text-xs text-muted-foreground">{rts.supplierName} · {rts.warehouseName}</p>
            </SheetHeader>
            <div className="mt-4 space-y-3">
              {([
                ["Return Date", fmtDateTime(rts.returnDate)],
                ["Status", rts.status.replace(/_/g, " ")],
                ["Return Reason", (rts.returnReason ?? "—").replace(/_/g, " ")],
                ["Created By", rts.returnedBy],
                ["Approved By", rts.approvedBy],
                ["Total Quantity", String(rts.totalQuantity)],
                ["Total Value", `SAR ${rts.totalValue.toLocaleString()}`],
                ["Notes", rts.notes || "—"],
              ] as [string, string][]).map(([l, v]) => (
                <div key={l} className="flex justify-between border-b border-border/40 pb-2 text-sm">
                  <span className="text-muted-foreground">{l}</span>
                  <span className="font-medium capitalize text-right max-w-[60%] break-words">{v}</span>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Returned Products ({rts.items.length})</p>
              <div className="space-y-1.5">
                {rts.items.map((it, idx) => (
                  <div key={idx} className="rounded-xl border border-border/40 px-3 py-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{it.productName}</span>
                      <span className="font-mono text-muted-foreground">{it.sku}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-muted-foreground">
                      <span>Requested {it.requestedQuantity}</span>
                      <span>Approved {it.approvedQuantity ?? "—"}</span>
                      <span>Received {it.receivedQuantity ?? "—"}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-muted-foreground">
                      <span className="capitalize">{it.reason.replace(/_/g, " ")}</span>
                      <span>Unit <SARIcon />{fmtSAR(it.unitCost)}</span>
                      <span className="font-semibold text-foreground">Line <SARIcon />{fmtSAR(it.totalValue)}</span>
                    </div>
                    {it.notes && <p className="mt-1 text-[11px] text-muted-foreground">{it.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
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
  const [productIds, setProductIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [returnedByIds, setReturnedByIds] = useState<string[]>([]);
  const [approvedByIds, setApprovedByIds] = useState<string[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [view, setView] = useState<"returns" | "lines">("returns");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [rows, setRows] = useState<SupplierReturnsReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewRts, setViewRts] = useState<SupplierReturnsReportRow | null>(null);

  const { products, categories } = useReportFilterOptions(
    branchIds.length === 1 ? branchIds[0] : undefined,
    categoryIds.length === 1 ? categoryIds[0] : undefined,
  );

  useEffect(() => { api.getSuppliers().then(setSuppliers).catch(() => {}); }, []);
  useEffect(() => { api.getWarehouses().then(setWarehouses).catch(() => {}); }, []);
  useEffect(() => { api.getUsers().then(setUsers).catch(() => {}); }, []);

  const filterParams = {
    from, to,
    supplierId: supplierIds.length ? supplierIds : undefined,
    warehouseId: warehouseIds.length ? warehouseIds : undefined,
    branchId: branchIds.length ? branchIds : undefined,
    status: statuses.length ? statuses : undefined,
    productId: productIds.length ? productIds : undefined,
    categoryId: categoryIds.length ? categoryIds : undefined,
    returnedBy: returnedByIds.length ? returnedByIds : undefined,
    approvedBy: approvedByIds.length ? approvedByIds : undefined,
    reason: reasons.length ? reasons : undefined,
  };

  const load = useCallback(() => {
    setLoading(true);
    api.getSupplierReturnsReport(filterParams)
      .then(setRows)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, supplierIds, warehouseIds, branchIds, statuses, productIds, categoryIds, returnedByIds, approvedByIds, reasons]);

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
  const totalQty = rows.reduce((s, r) => s + r.totalQuantity, 0);
  const supplierCount = new Set(rows.map(r => r.supplierName)).size;
  const lineRows = flattenReturnItems(rows);

  const hasFilters = from !== firstOfMonthStr() || to !== todayStr() || supplierIds.length > 0 || warehouseIds.length > 0
    || branchIds.length > (lockedBranchId ? 1 : 0) || statuses.length > 0 || productIds.length > 0 || categoryIds.length > 0
    || returnedByIds.length > 0 || approvedByIds.length > 0 || reasons.length > 0;
  const clearFilters = () => {
    setFrom(firstOfMonthStr()); setTo(todayStr());
    setSupplierIds([]); setWarehouseIds([]); setBranchIds(lockedBranchId ? [lockedBranchId] : []);
    setStatuses([]); setProductIds([]); setCategoryIds([]); setReturnedByIds([]); setApprovedByIds([]); setReasons([]);
  };

  return (
    <PageShell title="Supplier Returns Report" subtitle="Full transaction detail for stock returned to suppliers — click a return to see every product">
      <div className="flex flex-wrap items-end gap-2">
        <DateRangeField from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
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
        <FilterField label="Category">
          <div className="w-44">
            <SearchableMultiSelect
              placeholder="All Categories"
              options={categories.map((c) => ({ id: c.id, label: c.name }))}
              selected={categoryIds}
              onChange={setCategoryIds}
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
              selected={returnedByIds}
              onChange={setReturnedByIds}
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
        <FilterField label="Reason">
          <div className="w-36">
            <SearchableMultiSelect
              placeholder="All Reasons"
              options={RETURN_REASONS.map((r) => ({ id: r, label: r.replace(/_/g, " ") }))}
              selected={reasons}
              onChange={setReasons}
            />
          </div>
        </FilterField>
        {/* Per-return (Purchase Report shape) vs per-product-line — same data, two audit questions.
            This is a row-shape toggle, not a data filter — labeled "Table Layout" (not "View") so it
            doesn't read as a second, redundant "View" filter next to the row-detail Eye button. */}
        <FilterField label="Table Layout">
          <Select value={view} onValueChange={(v) => setView(v as "returns" | "lines")}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="returns">By Return (Summary)</SelectItem>
              <SelectItem value="lines">By Product (Pricing Detail)</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        {hasFilters && (
          <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" /> Clear Filters
          </Button>
        )}
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <MetricCard label="Total Returns" value={String(rows.length)} icon={PackageSearch} accent="primary" />
        <MetricCard label="Suppliers Involved" value={String(supplierCount)} icon={Truck} />
        <MetricCard label="Total Returned Qty" value={String(totalQty)} icon={RotateCcw} accent="warning" />
        <MetricCard label="Total Return Value" value={<><SARIcon />{fmtSAR(totalValue)}</>} icon={DollarSign} accent="destructive" />
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : view === "returns" ? (
        <PaginatedDataTable
          columns={[
            { key: "returnNumber", label: "Return Number" },
            { key: "returnDate", label: "Return Date", render: (r: SupplierReturnsReportRow) => fmtDateTime(r.returnDate) },
            { key: "supplierName", label: "Supplier" },
            { key: "warehouseName", label: "Warehouse" },
            { key: "items", label: "Products", render: (r: SupplierReturnsReportRow) => `${r.items.length} item${r.items.length !== 1 ? "s" : ""}` },
            // Summary rows can bundle multiple items; only a single-item return has one unambiguous
            // SKU/cost to show inline — multi-item returns fall back to the Eye drawer for detail.
            { key: "sku", label: "SKU / Code", className: "font-mono text-xs", render: (r: SupplierReturnsReportRow) => r.items.length === 1 ? r.items[0].sku : "Multiple" },
            { key: "totalQuantity", label: "Returned Qty" },
            { key: "returnReason", label: "Return Reason", className: "capitalize", render: (r: SupplierReturnsReportRow) => (r.returnReason ?? "—").replace(/_/g, " ") },
            { key: "returnedBy", label: "Created By" },
            { key: "approvedBy", label: "Approved By" },
            { key: "status", label: "Status", render: (r: SupplierReturnsReportRow) => <Badge variant="outline" className={`text-[10px] border-0 capitalize ${STATUS_CLASS[r.status] ?? "bg-muted text-muted-foreground"}`}>{r.status.replace(/_/g, " ")}</Badge> },
            { key: "unitCost", label: "Unit Cost", render: (r: SupplierReturnsReportRow) => r.items.length === 1 ? <span><SARIcon />{fmtSAR(r.items[0].unitCost)}</span> : "—" },
            { key: "totalValue", label: "Return Value", render: (r: SupplierReturnsReportRow) => <span className="font-semibold"><SARIcon />{fmtSAR(r.totalValue)}</span> },
            { key: "view", label: "Action", render: (r: SupplierReturnsReportRow) => (
              <Button size="icon" variant="ghost" className="h-7 w-7" title="View returned products" onClick={() => setViewRts(r)}><Eye className="h-3.5 w-3.5" /></Button>
            ) },
          ]}
          rows={rows}
          emptyMessage="No supplier returns match the current filters."
        />
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "returnNumber", label: "Return Number" },
            { key: "returnDate", label: "Return Date", render: (r: SupplierReturnLineRow) => fmtDateTime(r.returnDate) },
            { key: "supplierName", label: "Supplier" },
            { key: "warehouseName", label: "Warehouse" },
            { key: "productName", label: "Product" },
            { key: "sku", label: "SKU", className: "font-mono text-xs" },
            { key: "requestedQuantity", label: "Requested Qty" },
            { key: "approvedQuantity", label: "Approved Qty", render: (r: SupplierReturnLineRow) => r.approvedQuantity ?? "—" },
            { key: "receivedQuantity", label: "Received Qty", render: (r: SupplierReturnLineRow) => r.receivedQuantity ?? "—" },
            { key: "returnedQuantity", label: "Return Quantity" },
            { key: "reason", label: "Return Reason", className: "capitalize", render: (r: SupplierReturnLineRow) => r.reason.replace(/_/g, " ") },
            { key: "notes", label: "Notes", render: (r: SupplierReturnLineRow) => (
              <span className="line-clamp-2 max-w-[220px] text-xs text-muted-foreground">{r.notes || "—"}</span>
            ) },
            { key: "unitCost", label: "Unit Cost", render: (r: SupplierReturnLineRow) => <span><SARIcon />{fmtSAR(r.unitCost)}</span> },
            { key: "totalValue", label: "Line Value", render: (r: SupplierReturnLineRow) => <span className="font-semibold"><SARIcon />{fmtSAR(r.totalValue)}</span> },
            { key: "returnedBy", label: "Created By" },
            { key: "approvedBy", label: "Approved By" },
            { key: "status", label: "Status", className: "capitalize", render: (r: SupplierReturnLineRow) => r.status.replace(/_/g, " ") },
          ]}
          rows={lineRows}
          emptyMessage="No supplier returns match the current filters."
        />
      )}

      <SupplierReturnDetailDrawer rts={viewRts} onClose={() => setViewRts(null)} />
    </PageShell>
  );
}
