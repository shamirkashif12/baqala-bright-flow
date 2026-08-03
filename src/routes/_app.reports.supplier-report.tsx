import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { DateRangeField } from "@/components/report-filters/date-range-field";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable, FilterField } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { api, type SupplierReportRow, type SupplierReportDetail, type ReportExportFormat, type Supplier, type User, type Warehouse } from "@/lib/api";
import { useBranch } from "@/lib/branch-context";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Truck, DollarSign, Wallet, AlertTriangle, Eye, X, SlidersHorizontal, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/reports/supplier-report")({ component: SupplierReport });

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const PAYMENT_STATUSES = ["unpaid", "partial", "paid"];
const RETURN_REASONS = ["expired", "damaged", "quality_issue", "overstock", "other"];
const STATUSES = ["draft", "sent", "partial_received", "fully_received", "cancelled"];

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-primary/15 text-primary",
  partial_received: "bg-warning/15 text-warning-foreground",
  fully_received: "bg-success/15 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};

const fmtDateTime = (s: string) =>
  new Date(s).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

function SupplierReportDetailDrawer({
  supplier, detail, loading, onClose,
}: { supplier: SupplierReportRow | null; detail: SupplierReportDetail | null; loading: boolean; onClose: () => void }) {
  return (
    <Sheet open={!!supplier} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[640px] overflow-y-auto">
        {supplier && (
          <>
            <SheetHeader className="pb-4 border-b border-border/60">
              <SheetTitle className="text-base">{supplier.supplierName} — Details</SheetTitle>
              <p className="text-xs text-muted-foreground">{supplier.purchaseCount} purchase{supplier.purchaseCount !== 1 ? "s" : ""}</p>
            </SheetHeader>

            {loading ? (
              <div className="text-muted-foreground text-sm py-4">Loading…</div>
            ) : detail ? (
              <>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  {([
                    ["Purchases", String(detail.purchaseCount)],
                    ["Total Purchase", <><SARIcon />{fmtSAR(detail.totalPurchaseAmount)}</>],
                    ["Paid", <><SARIcon />{fmtSAR(detail.paidAmount)}</>],
                    ["Due", <><SARIcon />{fmtSAR(detail.dueAmount)}</>],
                    ["Returned", <><SARIcon />{fmtSAR(detail.returnAmount)}</>],
                    ["Net Purchase", <><SARIcon />{fmtSAR(detail.netPurchaseAmount)}</>],
                  ] as [string, React.ReactNode][]).map(([l, v]) => (
                    <div key={l} className="rounded-xl border border-border/40 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{l}</p>
                      <p className="text-sm font-semibold mt-0.5">{v}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-5 space-y-3">
                  {detail.purchases.map((po) => (
                    <div key={po.id} className="rounded-xl border border-border/40 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-muted/40">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold">{po.poNumber}</span>
                          <Badge variant="outline" className={`text-[10px] border-0 capitalize ${STATUS_CLASS[po.status] ?? "bg-muted text-muted-foreground"}`}>
                            {po.status.replace(/_/g, " ")}
                          </Badge>
                        </div>
                        <span className="text-sm font-semibold"><SARIcon />{fmtSAR(po.totalAmount)}</span>
                      </div>
                      <div className="px-3 py-2 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 border-b border-border/40">
                        <span>Date: {fmtDateTime(po.purchaseDate)}</span>
                        <span>Branch: {po.locationName}</span>
                        <span>Created By: {po.createdBy}</span>
                        <span>Paid: <span className="text-success font-medium"><SARIcon />{fmtSAR(po.paidAmount)}</span></span>
                        <span>Due: <span className="font-medium"><SARIcon />{fmtSAR(po.dueAmount)}</span></span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-muted-foreground">
                              <th className="text-left font-medium px-3 py-1.5">SKU</th>
                              <th className="text-left font-medium px-3 py-1.5">Category</th>
                              <th className="text-left font-medium px-3 py-1.5">UoM</th>
                              <th className="text-right font-medium px-3 py-1.5">Qty</th>
                              <th className="text-right font-medium px-3 py-1.5">Returned</th>
                              <th className="text-right font-medium px-3 py-1.5">Unit Price</th>
                              <th className="text-right font-medium px-3 py-1.5">Line Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {po.items.map((it, idx) => (
                              <tr key={idx} className="border-t border-border/30">
                                <td className="px-3 py-1.5 font-mono">{it.sku}</td>
                                <td className="px-3 py-1.5">{it.category}</td>
                                <td className="px-3 py-1.5">{it.unitOfMeasure}</td>
                                <td className="px-3 py-1.5 text-right">{it.quantity}</td>
                                <td className="px-3 py-1.5 text-right text-destructive">{it.returnedQuantity}</td>
                                <td className="px-3 py-1.5 text-right"><SARIcon />{fmtSAR(it.unitPrice)}</td>
                                <td className="px-3 py-1.5 text-right font-semibold"><SARIcon />{fmtSAR(it.lineTotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SupplierReport() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [supplierIds, setSupplierIds] = useState<string[]>([]);
  const [branchIds, setBranchIds] = useState<string[]>(lockedBranchId ? [lockedBranchId] : []);
  const [warehouseIds, setWarehouseIds] = useState<string[]>([]);
  const [paymentStatuses, setPaymentStatuses] = useState<string[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [createdByIds, setCreatedByIds] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [rows, setRows] = useState<SupplierReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewSupplier, setViewSupplier] = useState<SupplierReportRow | null>(null);
  const [detail, setDetail] = useState<SupplierReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => { api.getSuppliers().then(setSuppliers).catch(() => {}); }, []);
  useEffect(() => { api.getUsers().then(setUsers).catch(() => {}); }, []);
  useEffect(() => { api.getWarehouses().then(setWarehouses).catch(() => {}); }, []);

  const filterParams = {
    from, to,
    supplierId: supplierIds.length ? supplierIds : undefined,
    branchId: branchIds.length ? branchIds : undefined,
    warehouseId: warehouseIds.length ? warehouseIds : undefined,
    paymentStatus: paymentStatuses.length ? paymentStatuses : undefined,
    reason: reasons.length ? reasons : undefined,
    createdBy: createdByIds.length ? createdByIds : undefined,
  };

  const hasFilters = from !== firstOfMonthStr() || to !== todayStr() || supplierIds.length > 0
    || (!lockedBranchId && branchIds.length > 0) || warehouseIds.length > 0
    || paymentStatuses.length > 0 || reasons.length > 0 || createdByIds.length > 0;
  const clearFilters = () => {
    setFrom(firstOfMonthStr()); setTo(todayStr()); setSupplierIds([]);
    if (!lockedBranchId) setBranchIds([]);
    setWarehouseIds([]);
    setPaymentStatuses([]); setReasons([]); setCreatedByIds([]);
  };

  const load = useCallback(() => {
    setLoading(true);
    api.getSupplierReport(filterParams)
      .then(setRows)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, supplierIds, branchIds, warehouseIds, paymentStatuses, reasons, createdByIds]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!viewSupplier) { setDetail(null); return; }
    setDetailLoading(true);
    api.getSupplierReportDetail({
      supplierId: viewSupplier.supplierId, from, to,
      branchId: branchIds.length ? branchIds : undefined,
      warehouseId: warehouseIds.length ? warehouseIds : undefined,
      paymentStatus: paymentStatuses.length ? paymentStatuses : undefined,
      createdBy: createdByIds.length ? createdByIds : undefined,
    })
      .then(setDetail)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load supplier detail"))
      .finally(() => setDetailLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewSupplier]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportSupplierReport({ ...filterParams, exportedBy: user?.id, format });
      downloadBlob(blob, `supplier-report-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const advancedFilterCount = paymentStatuses.length + reasons.length + createdByIds.length;
  const supplierCount = rows.length;
  const totalPurchase = rows.reduce((s, r) => s + r.totalPurchaseAmount, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paidAmount, 0);
  const totalDue = rows.reduce((s, r) => s + r.dueAmount, 0);

  return (
    <PageShell title="Supplier Report" subtitle="Supplier-level purchase totals with accurate payment tracking — click a supplier to see every purchase">
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="rounded-xl border border-border/60 bg-card p-3 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <DateRangeField from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
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
          <FilterField label="Payment Status">
            <SearchableMultiSelect
              placeholder="All Payment Statuses"
              options={PAYMENT_STATUSES.map((s) => ({ id: s, label: s.replace(/_/g, " ") }))}
              selected={paymentStatuses}
              onChange={setPaymentStatuses}
            />
          </FilterField>
          <FilterField label="Reason">
            <SearchableMultiSelect
              placeholder="All Reasons"
              options={RETURN_REASONS.map((r) => ({ id: r, label: r.replace(/_/g, " ") }))}
              selected={reasons}
              onChange={setReasons}
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
        </CollapsibleContent>
      </Collapsible>

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <MetricCard label="Suppliers" value={String(supplierCount)} icon={Truck} accent="primary" />
        <MetricCard label="Total Purchase Value" value={<><SARIcon />{fmtSAR(totalPurchase)}</>} icon={DollarSign} accent="warning" />
        <MetricCard label="Total Paid" value={<><SARIcon />{fmtSAR(totalPaid)}</>} icon={Wallet} accent="success" />
        <MetricCard label="Total Due" value={<><SARIcon />{fmtSAR(totalDue)}</>} icon={AlertTriangle} accent="destructive" />
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "supplierName", label: "Supplier" },
            { key: "purchaseCount", label: "Purchases" },
            { key: "totalPurchaseAmount", label: "Total Purchase", render: (r: SupplierReportRow) => <span><SARIcon />{fmtSAR(r.totalPurchaseAmount)}</span> },
            { key: "paidAmount", label: "Paid", render: (r: SupplierReportRow) => <span className="text-success"><SARIcon />{fmtSAR(r.paidAmount)}</span> },
            { key: "dueAmount", label: "Due", render: (r: SupplierReportRow) => <span className={r.dueAmount > 0 ? "text-destructive" : ""}><SARIcon />{fmtSAR(r.dueAmount)}</span> },
            { key: "returnAmount", label: "Returns", render: (r: SupplierReportRow) => <span className={r.returnAmount > 0 ? "text-destructive" : "text-muted-foreground"}><SARIcon />{fmtSAR(r.returnAmount)}</span> },
            { key: "netPurchaseAmount", label: "Net Purchase", render: (r: SupplierReportRow) => <span className="font-semibold"><SARIcon />{fmtSAR(r.netPurchaseAmount)}</span> },
            { key: "averagePurchaseValue", label: "Avg Purchase", render: (r: SupplierReportRow) => <span><SARIcon />{fmtSAR(r.averagePurchaseValue)}</span> },
            { key: "lastPurchaseDate", label: "Last Purchase", render: (r: SupplierReportRow) => new Date(r.lastPurchaseDate).toLocaleDateString("en-SA") },
            { key: "view", label: "Action", render: (r: SupplierReportRow) => (
              <Button size="icon" variant="ghost" className="h-7 w-7" title="View supplier purchases" onClick={() => setViewSupplier(r)}><Eye className="h-3.5 w-3.5" /></Button>
            ) },
          ]}
          rows={rows}
          emptyMessage="No suppliers match the current filters."
        />
      )}

      <SupplierReportDetailDrawer supplier={viewSupplier} detail={detail} loading={detailLoading} onClose={() => setViewSupplier(null)} />
    </PageShell>
  );
}
