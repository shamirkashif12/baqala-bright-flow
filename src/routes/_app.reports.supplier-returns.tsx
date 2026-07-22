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
import { api, type SupplierReturnsReportRow, type ReportExportFormat, type Supplier, type Warehouse } from "@/lib/api";
import { useBranch } from "@/lib/branch-context";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { PackageSearch, Truck, RotateCcw, DollarSign, Eye } from "lucide-react";

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

// Reason/Notes are captured per line item, but this table is one row per return — collapse to a
// single display value: the shared value if every item agrees, otherwise flag it as mixed rather
// than silently showing just the first item's.
function summarizeItemField(items: SupplierReturnsReportRow["items"], field: "reason" | "notes") {
  const values = [...new Set(items.map(i => i[field]).filter((v): v is string => !!v))];
  if (values.length === 0) return "—";
  if (values.length === 1) return field === "reason" ? values[0].replace(/_/g, " ") : values[0];
  return field === "reason" ? `Multiple (${values.length})` : values.join("; ");
}

function SupplierReturnDetailDrawer({ ret, onClose }: { ret: SupplierReturnsReportRow | null; onClose: () => void }) {
  return (
    <Sheet open={!!ret} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-[560px] overflow-y-auto">
        <SheetHeader className="pb-3">
          <SheetTitle className="text-base">{ret?.returnNumber}</SheetTitle>
        </SheetHeader>
        {ret && (
          <div className="mt-2 space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-muted-foreground">Supplier</span><p className="font-medium">{ret.supplierName}</p></div>
              <div><span className="text-muted-foreground">Warehouse</span><p className="font-medium">{ret.warehouseName}</p></div>
              <div><span className="text-muted-foreground">Returned By</span><p className="font-medium">{ret.returnedBy}</p></div>
              <div><span className="text-muted-foreground">Approved By</span><p className="font-medium">{ret.approvedBy}</p></div>
              <div><span className="text-muted-foreground">Status</span><p className="font-medium capitalize">{ret.status.replace(/_/g, " ")}</p></div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Products ({ret.items.length})</p>
              <div className="space-y-1.5">
                {ret.items.map((it, idx) => (
                  <div key={idx} className="rounded-xl border border-border/40 px-3 py-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{it.productName}</span>
                      <span className="font-mono text-muted-foreground">{it.sku}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-muted-foreground">
                      <span>Qty {it.returnedQuantity} · <span className="capitalize">{it.reason.replace(/_/g, " ")}</span></span>
                      <span>Unit <SARIcon />{fmtSAR(it.unitCost)}</span>
                      <span className="font-semibold text-foreground">Line <SARIcon />{fmtSAR(it.totalValue)}</span>
                    </div>
                    {it.notes && <p className="mt-1 text-muted-foreground">{it.notes}</p>}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between border-t border-border/40 pt-2 font-bold text-base">
              <span>Total</span><span className="flex items-center gap-0.5"><SARIcon />{fmtSAR(ret.totalValue)}</span>
            </div>
          </div>
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
  const [reason, setReason] = useState("all");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [rows, setRows] = useState<SupplierReturnsReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewReturn, setViewReturn] = useState<SupplierReturnsReportRow | null>(null);

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
            { key: "returnDate", label: "Return Date", render: (r: SupplierReturnsReportRow) => new Date(r.returnDate).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) },
            { key: "supplierName", label: "Supplier" },
            { key: "warehouseName", label: "Warehouse" },
            { key: "returnedBy", label: "Returned By" },
            { key: "approvedBy", label: "Approved By" },
            { key: "items", label: "Products", render: (r: SupplierReturnsReportRow) => `${r.items.length} item${r.items.length !== 1 ? "s" : ""}` },
            { key: "reason", label: "Return Reason", className: "capitalize", render: (r: SupplierReturnsReportRow) => summarizeItemField(r.items, "reason") },
            { key: "notes", label: "Notes", render: (r: SupplierReturnsReportRow) => (
              <span className="line-clamp-2 max-w-[200px] text-xs text-muted-foreground">{summarizeItemField(r.items, "notes")}</span>
            ) },
            { key: "totalValue", label: "Total Value", render: (r: SupplierReturnsReportRow) => <span className="font-semibold"><SARIcon />{fmtSAR(r.totalValue)}</span> },
            { key: "status", label: "Status", className: "capitalize", render: (r: SupplierReturnsReportRow) => r.status.replace(/_/g, " ") },
            { key: "view", label: "", render: (r: SupplierReturnsReportRow) => (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewReturn(r)}><Eye className="h-3.5 w-3.5" /></Button>
            ) },
          ]}
          rows={rows}
          emptyMessage="No supplier returns match the current filters."
        />
      )}
      <SupplierReturnDetailDrawer ret={viewReturn} onClose={() => setViewReturn(null)} />
    </PageShell>
  );
}
