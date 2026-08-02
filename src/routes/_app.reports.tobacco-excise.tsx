import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable, StatusBadge, FilterField } from "@/components/module-placeholder";
import { DateRangeField } from "@/components/report-filters/date-range-field";
import { ReportExportButton } from "@/components/report-export-button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { api, type TobaccoExciseReport as TobaccoExciseData, type TobaccoExciseRow, type TobaccoExciseTransactionRow, type ReportExportFormat, type User, type Product } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Cigarette, Coins, Package, RotateCcw, Tag, AlertTriangle, X, Eye, SlidersHorizontal, ChevronDown } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_app/reports/tobacco-excise")({ component: TobaccoExcise });

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Drill-down behind one aggregated Product+Cashier row — same on-demand, scoped-by-id pattern as
// the Inventory Aging & Product Performance and Employee Audit Center drawers. The row itself sums
// an entire period, so it can't show which individual transactions made up that total.
function TobaccoExciseTransactionsDrawer({ row, from, to, onClose }: { row: TobaccoExciseRow | null; from: string; to: string; onClose: () => void }) {
  const [rows, setRows] = useState<TobaccoExciseTransactionRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!row) { setRows(null); return; }
    setLoading(true);
    api.getTobaccoExciseTransactions({ from, to, productId: row.productId, cashierId: row.cashierId ?? undefined })
      .then(setRows)
      .catch(() => toast.error("Failed to load transactions"))
      .finally(() => setLoading(false));
  }, [row, from, to]);

  return (
    <Sheet open={!!row} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[560px] overflow-y-auto">
        {row && (
          <>
            <SheetHeader className="pb-4 border-b border-border/60">
              <SheetTitle className="text-base">{row.productName}</SheetTitle>
              <p className="text-xs text-muted-foreground">{row.sku} · Sold by {row.employee}</p>
            </SheetHeader>
            <div className="mt-4">
              {loading ? (
                <div className="text-muted-foreground text-sm py-4">Loading…</div>
              ) : !rows || rows.length === 0 ? (
                <p className="text-xs text-muted-foreground">No transactions in the selected date range.</p>
              ) : (
                <div className="space-y-1.5">
                  {rows.map((t, idx) => (
                    <div key={idx} className="rounded-xl border border-border/40 px-3 py-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-medium">{t.orderNumber}</span>
                        <span className="font-semibold"><SARIcon />{fmtSAR(t.exciseAmount)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-muted-foreground">
                        <span>{new Date(t.dateTime).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        <span>{t.branch}</span>
                        <span>Qty {t.quantity}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function TobaccoExcise() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [cashierId, setCashierId] = useState("all");
  const [productId, setProductId] = useState("all");
  const [cashiers, setCashiers] = useState<User[]>([]);
  const [tobaccoProducts, setTobaccoProducts] = useState<Product[]>([]);
  const [data, setData] = useState<TobaccoExciseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [drillDownRow, setDrillDownRow] = useState<TobaccoExciseRow | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    api.getUsers({ branchId: branchId !== "all" ? branchId : undefined })
      // Any staff role can ring up a sale (Branch Manager/Supervisor covering a register), not
      // just the Cashier role — filtering this list to literal "Cashier" meant a manager's own
      // sales could never be selected here, even though "All Employees" clearly included them.
      .then((u) => setCashiers(u.filter((x) => x.status === "active")))
      .catch(() => {});
    setCashierId("all");
  }, [branchId]);

  useEffect(() => {
    api.getProducts({ status: "active" }).then((p) => setTobaccoProducts(p.filter((x) => x.isTobacco))).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    api.getTobaccoExciseReport({
      from, to, branchId: branchId !== "all" ? branchId : undefined,
      cashierId: cashierId !== "all" ? cashierId : undefined,
      productId: productId !== "all" ? productId : undefined,
    })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, branchId, cashierId, productId]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportTobaccoExciseReport({
        from, to, branchId: branchId !== "all" ? branchId : undefined,
        cashierId: cashierId !== "all" ? cashierId : undefined,
        productId: productId !== "all" ? productId : undefined, exportedBy: user?.id, format,
      });
      downloadBlob(blob, `tobacco-excise-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const chartData = (data?.rows ?? []).slice(0, 10).map((r) => ({ name: r.sku, excise: r.exciseAmount }));

  const hasFilters = from !== firstOfMonthStr() || to !== todayStr() || branchId !== (lockedBranchId ?? "all") || cashierId !== "all" || productId !== "all";
  const clearFilters = () => {
    setFrom(firstOfMonthStr()); setTo(todayStr()); setBranchId(lockedBranchId ?? "all"); setCashierId("all"); setProductId("all");
  };
  const advancedFilterCount = (cashierId !== "all" ? 1 : 0) + (productId !== "all" ? 1 : 0);

  return (
    <PageShell title="Tobacco Excise Report" subtitle="Excise tax calculations on regulated tobacco products">
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="rounded-xl border border-border/60 bg-card p-3 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <DateRangeField from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
          {!lockedBranchId && (
            <FilterField label="Branch">
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="h-9 w-44"><SelectValue placeholder="All Branches" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FilterField>
          )}

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
          <FilterField label="Employee">
            <Select value={cashierId} onValueChange={setCashierId}>
              <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Employee" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {cashiers.map((c) => <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterField label="Product">
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger className="h-9 w-full"><SelectValue placeholder="Product" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                {tobaccoProducts.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </FilterField>
        </CollapsibleContent>
      </Collapsible>

      {data && (
        <p className="text-xs text-muted-foreground">
          {data.legalCompanyName} · CR: {data.commercialRegistrationNumber} · VAT Reg. No.: {data.vatRegistrationNumber}
        </p>
      )}

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <MetricCard label="Excise Sales Value" value={<><SARIcon />{fmt(kpis?.exciseSalesValue ?? 0)}</>} icon={Cigarette} accent="primary" />
        <MetricCard label="Excise Tax Amount" value={<><SARIcon />{fmt(kpis?.exciseTaxAmount ?? 0)}</>} icon={Coins} accent="warning" />
        <MetricCard label="Tobacco Units Sold" value={String(kpis?.tobaccoUnitsSold ?? 0)} icon={Package} />
        <MetricCard label="Excise Refunds" value={<><SARIcon />{fmt(kpis?.exciseRefunds ?? 0)}</>} icon={RotateCcw} accent="destructive" />
        <MetricCard label="Top Tobacco SKU" value={kpis?.topTobaccoSku ?? "—"} icon={Tag} />
        <MetricCard label="Compliance Exceptions" value={String(kpis?.complianceExceptions ?? 0)} icon={AlertTriangle} accent="destructive" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Excise Amount by SKU</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip formatter={(v: number) => fmtSAR(v)} />
            <Bar dataKey="excise" fill="var(--warning)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "sku", label: "SKU" },
            { key: "barcode", label: "Barcode" },
            { key: "productName", label: "Product Name" },
            { key: "brand", label: "Brand" },
            { key: "category", label: "Category" },
            { key: "branch", label: "Branch" },
            { key: "employee", label: "Employee" },
            { key: "unitsSold", label: "Units Sold" },
            { key: "taxablePrice", label: "Taxable Price", render: (r: TobaccoExciseRow) => <><SARIcon />{fmt(r.taxablePrice)}</> },
            { key: "exciseRate", label: "Excise Rate", render: (r: TobaccoExciseRow) => `${r.exciseRate}%` },
            { key: "exciseAmount", label: "Excise Amount", render: (r: TobaccoExciseRow) => <span className="font-semibold"><SARIcon />{fmt(r.exciseAmount)}</span> },
            { key: "netExcise", label: "Net Excise", render: (r: TobaccoExciseRow) => <><SARIcon />{fmt(r.netExcise)}</> },
            { key: "complianceStatus", label: "Compliance Status", render: (r: TobaccoExciseRow) => <StatusBadge status={r.complianceStatus} /> },
            { key: "action", label: "Action", render: (r: TobaccoExciseRow) => (
              <Button size="icon" variant="ghost" className="h-7 w-7" title="View transactions" onClick={() => setDrillDownRow(r)}>
                <Eye className="h-3.5 w-3.5" />
              </Button>
            ) },
          ]}
          rows={data?.rows ?? []}
        />
      )}
      {!loading && (data?.rows.length ?? 0) > 0 && (
        <div className="flex justify-end gap-6 text-sm font-semibold">
          <span>Grand Total Excise: <SARIcon />{fmt((data?.rows ?? []).reduce((s, r) => s + r.exciseAmount, 0))}</span>
          <span>Net Excise: <SARIcon />{fmt((data?.rows ?? []).reduce((s, r) => s + r.netExcise, 0))}</span>
        </div>
      )}
      <TobaccoExciseTransactionsDrawer row={drillDownRow} from={from} to={to} onClose={() => setDrillDownRow(null)} />
    </PageShell>
  );
}
