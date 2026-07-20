import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable, StatusBadge } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { api, type StockReconciliationReport as ReconData, type StockReconciliationRow, type ReportExportFormat } from "@/lib/api";
import { useReportFilterOptions } from "@/lib/use-report-filters";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { ClipboardCheck, ListChecks, Scale, Target, TrendingDown } from "lucide-react";

export const Route = createFileRoute("/_app/reports/stock-reconciliation")({ component: StockReconciliation });

// The FRD's names for the three count intents, mapped from the stored values.
const COUNT_TYPE_LABELS: Record<string, string> = {
  review: "Stock Review",
  audit: "Stock Audit",
  reconciliation: "Reconciliation",
};

const firstOfMonthStr = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const todayStr = () => new Date().toISOString().slice(0, 10);

function StockReconciliation() {
  const { user, canViewModule } = useAuth();
  const { canExport } = usePermission("Reports");
  const canViewCost = canViewModule("Accounting & Finance");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [categoryId, setCategoryId] = useState("all");
  const [productId, setProductId] = useState("all");
  const [countedBy, setCountedBy] = useState("all");
  const [countType, setCountType] = useState("all");
  const [status, setStatus] = useState("all");
  const [varianceOnly, setVarianceOnly] = useState(false);
  const [data, setData] = useState<ReconData | null>(null);
  const [loading, setLoading] = useState(true);

  const { categories, products, employees } = useReportFilterOptions(branchId, categoryId);

  // Drop selections the current branch/category no longer offers, so the table can't silently
  // empty while a stale name is still shown in the picker.
  useEffect(() => { setCountedBy("all"); }, [branchId]);
  useEffect(() => {
    if (productId !== "all" && !products.some((p) => p.id === productId)) setProductId("all");
  }, [products, productId]);

  const filters = useMemo(() => ({
    branchId: branchId !== "all" ? branchId : undefined,
    categoryId: categoryId !== "all" ? categoryId : undefined,
    productId: productId !== "all" ? productId : undefined,
    countedBy: countedBy !== "all" ? countedBy : undefined,
    countType: countType !== "all" ? countType : undefined,
    status: status !== "all" ? status : undefined,
    varianceOnly: varianceOnly || undefined,
  }), [branchId, categoryId, productId, countedBy, countType, status, varianceOnly]);

  const load = useCallback(() => {
    setLoading(true);
    api.getStockReconciliationReport({ from, to, ...filters })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, filters]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportStockReconciliationReport({ from, to, ...filters, exportedBy: user?.id, format });
      downloadBlob(blob, `stock-reconciliation-${todayStr()}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const num = (n?: number | null) => (n == null ? "—" : String(n));

  return (
    <PageShell
      title="Stock Reconciliation"
      subtitle="Stock review, audit and reconciliation — system vs counted quantity by count session"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" className="h-9 w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" className="h-9 w-36" value={to} onChange={(e) => setTo(e.target.value)} />
        {!lockedBranchId && (
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="All Branches" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={productId} onValueChange={setProductId}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Product" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Products</SelectItem>
            {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {/* Matches either end of a session — whoever started the count or signed it off. */}
        <Select value={countedBy} onValueChange={setCountedBy}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Employee" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {employees.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
          </SelectContent>
        </Select>
        {/* The FRD's three named filters — Stock Review / Stock Audit / Inventory Reconciliation.
            They all describe a StockCount session; count_type is what tells them apart. */}
        <Select value={countType} onValueChange={setCountType}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Count Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Count Types</SelectItem>
            <SelectItem value="review">Stock Review</SelectItem>
            <SelectItem value="audit">Stock Audit</SelectItem>
            <SelectItem value="reconciliation">Inventory Reconciliation</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">In progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-sm px-2">
          <Checkbox checked={varianceOnly} onCheckedChange={(v) => setVarianceOnly(v === true)} />
          Variance only
        </label>
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Count Sessions" value={String(kpis?.sessionCount ?? 0)} icon={ClipboardCheck} accent="primary" />
        <MetricCard label="Items Counted" value={String(kpis?.itemsCounted ?? 0)} icon={ListChecks} />
        <MetricCard label="Items With Variance" value={String(kpis?.itemsWithVariance ?? 0)} icon={Scale} accent="warning" />
        <MetricCard label="Count Accuracy" value={`${kpis?.accuracyPct ?? 0}%`} icon={Target} accent="success" />
        {canViewCost && (
          <MetricCard
            label="Net Variance Value"
            value={<><SARIcon />{fmt(kpis?.netVarianceValue ?? 0)}</>}
            icon={TrendingDown}
            accent={(kpis?.netVarianceValue ?? 0) < 0 ? "destructive" : "success"}
          />
        )}
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "countId", label: "Count ID", render: (r: StockReconciliationRow) => <span className="font-mono text-[11px]">{r.countId}</span> },
            {
              key: "countType",
              label: "Count Type",
              // Null means the session predates count_type — "Unspecified", not a guess at which
              // of the three it was.
              render: (r: StockReconciliationRow) => r.countType
                ? <Badge variant="outline" className="text-[10px] capitalize">{COUNT_TYPE_LABELS[r.countType]}</Badge>
                : <span className="text-muted-foreground text-xs">Unspecified</span>,
            },
            {
              key: "startedAt",
              label: "Started",
              render: (r: StockReconciliationRow) =>
                new Date(r.startedAt).toLocaleString("en-SA", { dateStyle: "short", timeStyle: "short" }),
            },
            { key: "branch", label: "Branch" },
            { key: "sku", label: "SKU" },
            { key: "productName", label: "Product" },
            { key: "category", label: "Category" },
            { key: "systemQty", label: "System Qty" },
            // A pending line has no counted quantity yet; a dash distinguishes that from a
            // genuine count of zero.
            { key: "countedQty", label: "Counted Qty", render: (r: StockReconciliationRow) => num(r.countedQty) },
            {
              key: "variance",
              label: "Variance",
              render: (r: StockReconciliationRow) =>
                r.variance == null ? <span className="text-muted-foreground">—</span> : (
                  <span className={r.variance < 0 ? "text-destructive font-semibold" : r.variance > 0 ? "text-success font-semibold" : "text-muted-foreground"}>
                    {r.variance > 0 ? "+" : ""}{r.variance}
                  </span>
                ),
            },
            ...(canViewCost
              ? [{
                  key: "varianceValue",
                  label: "Variance Value",
                  render: (r: StockReconciliationRow) => <><SARIcon />{fmt(r.varianceValue)}</>,
                }]
              : []),
            { key: "startedBy", label: "Started By" },
            { key: "completedBy", label: "Completed By", render: (r: StockReconciliationRow) => r.completedBy ?? "—" },
            { key: "status", label: "Status", render: (r: StockReconciliationRow) => <StatusBadge status={r.status} /> },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
