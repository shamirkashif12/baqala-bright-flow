import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { api, type PurchaseOrderReportRow, type ReportExportFormat, type Supplier, type Warehouse, type User } from "@/lib/api";
import { useBranch } from "@/lib/branch-context";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Receipt, ClipboardCheck, Boxes, DollarSign, Eye } from "lucide-react";

export const Route = createFileRoute("/_app/reports/purchase-orders")({ component: PurchaseReports });

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const STATUSES = ["draft", "sent", "partial_received", "fully_received", "cancelled"];

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-primary/15 text-primary",
  partial_received: "bg-warning/15 text-warning-foreground",
  fully_received: "bg-success/15 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};

function PurchaseOrderDetailDrawer({ po, onClose }: { po: PurchaseOrderReportRow | null; onClose: () => void }) {
  return (
    <Sheet open={!!po} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-[560px] overflow-y-auto">
        {po && (
          <>
            <SheetHeader className="pb-4 border-b border-border/60">
              <SheetTitle className="text-base font-mono">{po.poNumber}</SheetTitle>
              <p className="text-xs text-muted-foreground">{po.supplierName} · {po.locationName}</p>
            </SheetHeader>
            <div className="mt-4 space-y-3">
              {([
                ["Purchase Date", new Date(po.purchaseDate).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })],
                ["Status", po.status.replace(/_/g, " ")],
                ["Payment Status", po.paymentStatus.replace(/_/g, " ")],
                ["Created By", po.createdBy],
                ["Approved By", po.approvedBy],
                ["Received By", po.receivedBy],
                ["PO Total", `SAR ${po.totalAmount.toLocaleString()}`],
              ] as [string, string][]).map(([l, v]) => (
                <div key={l} className="flex justify-between border-b border-border/40 pb-2 text-sm">
                  <span className="text-muted-foreground">{l}</span>
                  <span className="font-medium capitalize">{v}</span>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Products ({po.items.length})</p>
              <div className="space-y-1.5">
                {po.items.map((it, idx) => (
                  <div key={idx} className="rounded-xl border border-border/40 px-3 py-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{it.productName}</span>
                      <span className="font-mono text-muted-foreground">{it.sku}</span>
                    </div>
                    <div className="flex items-center justify-between mt-1 text-muted-foreground">
                      <span>Ordered {it.orderedQuantity} · Received {it.receivedQuantity}</span>
                      <span>Unit <SARIcon />{fmtSAR(it.unitCost)}</span>
                      <span className="font-semibold text-foreground">Line <SARIcon />{fmtSAR(it.subtotal)}</span>
                    </div>
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

function PurchaseReports() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  const [branchIds, setBranchIds] = useState<string[]>(lockedBranchId ? [lockedBranchId] : []);
  const [warehouseIds, setWarehouseIds] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [createdByIds, setCreatedByIds] = useState<string[]>([]);
  const [approvedByIds, setApprovedByIds] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [rows, setRows] = useState<PurchaseOrderReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewPo, setViewPo] = useState<PurchaseOrderReportRow | null>(null);

  useEffect(() => { api.getSuppliers().then(setSuppliers).catch(() => {}); }, []);
  useEffect(() => { api.getWarehouses().then(setWarehouses).catch(() => {}); }, []);
  useEffect(() => { api.getUsers().then(setUsers).catch(() => {}); }, []);

  const filterParams = {
    from, to,
    supplierId: supplierIds.length ? supplierIds : undefined,
    branchId: branchIds.length ? branchIds : undefined,
    warehouseId: warehouseIds.length ? warehouseIds : undefined,
    status: statuses.length ? statuses : undefined,
    createdBy: createdByIds.length ? createdByIds : undefined,
    approvedBy: approvedByIds.length ? approvedByIds : undefined,
  };

  const load = useCallback(() => {
    setLoading(true);
    api.getPurchaseOrderReport(filterParams)
      .then(setRows)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, supplierIds, branchIds, warehouseIds, statuses, createdByIds, approvedByIds]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportPurchaseOrderReport({ ...filterParams, exportedBy: user?.id, format });
      downloadBlob(blob, `purchase-order-report-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const totalValue = rows.reduce((s, r) => s + r.totalAmount, 0);
  const fullyReceivedCount = rows.filter(r => r.status === "fully_received").length;
  const totalItems = rows.reduce((s, r) => s + r.items.length, 0);

  return (
    <PageShell title="Purchase Reports" subtitle="Complete purchase order detail — click a row to see every product">
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
        <div className="w-44">
          <SearchableMultiSelect
            placeholder="All Warehouses"
            options={warehouses.map((w) => ({ id: w.id, label: w.name }))}
            selected={warehouseIds}
            onChange={setWarehouseIds}
          />
        </div>
        <div className="w-40">
          <SearchableMultiSelect
            placeholder="All Statuses"
            options={STATUSES.map((s) => ({ id: s, label: s.replace(/_/g, " ") }))}
            selected={statuses}
            onChange={setStatuses}
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
        <MetricCard label="Purchase Orders" value={String(rows.length)} icon={Receipt} accent="primary" />
        <MetricCard label="Fully Received" value={String(fullyReceivedCount)} icon={ClipboardCheck} accent="success" />
        <MetricCard label="Line Items" value={String(totalItems)} icon={Boxes} />
        <MetricCard label="Total Purchase Value" value={<><SARIcon />{fmtSAR(totalValue)}</>} icon={DollarSign} accent="warning" />
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "poNumber", label: "PO Number" },
            { key: "supplierName", label: "Supplier" },
            { key: "locationName", label: "Warehouse" },
            { key: "purchaseDate", label: "Purchase Date", render: (r: PurchaseOrderReportRow) => new Date(r.purchaseDate).toLocaleDateString("en-SA") },
            { key: "status", label: "Status", render: (r: PurchaseOrderReportRow) => <Badge variant="outline" className={`text-[10px] border-0 capitalize ${STATUS_CLASS[r.status] ?? "bg-muted text-muted-foreground"}`}>{r.status.replace(/_/g, " ")}</Badge> },
            { key: "paymentStatus", label: "Payment", className: "capitalize", render: (r: PurchaseOrderReportRow) => r.paymentStatus.replace(/_/g, " ") },
            { key: "createdBy", label: "Created By" },
            { key: "approvedBy", label: "Approved By" },
            { key: "receivedBy", label: "Received By" },
            { key: "items", label: "Products", render: (r: PurchaseOrderReportRow) => `${r.items.length} item${r.items.length !== 1 ? "s" : ""}` },
            { key: "orderedQuantity", label: "Qty Ordered", render: (r: PurchaseOrderReportRow) => r.items.reduce((s, i) => s + i.orderedQuantity, 0) },
            { key: "receivedQuantity", label: "Qty Received", render: (r: PurchaseOrderReportRow) => r.items.reduce((s, i) => s + i.receivedQuantity, 0) },
            { key: "totalAmount", label: "PO Total", render: (r: PurchaseOrderReportRow) => <span className="font-semibold"><SARIcon />{fmtSAR(r.totalAmount)}</span> },
            { key: "view", label: "", render: (r: PurchaseOrderReportRow) => (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewPo(r)}><Eye className="h-3.5 w-3.5" /></Button>
            ) },
          ]}
          rows={rows}
          emptyMessage="No purchase orders match the current filters."
        />
      )}

      <PurchaseOrderDetailDrawer po={viewPo} onClose={() => setViewPo(null)} />
    </PageShell>
  );
}
