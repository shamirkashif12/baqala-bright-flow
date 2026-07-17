import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { api, type ProductSalesReport as ProductSalesData, type ProductSalesRow, type ReportExportFormat, type Category, type Product, type User } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Tag, Boxes, Wallet, Percent, PackageX, RotateCcw, Cigarette } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_app/reports/product-sales")({ component: ProductSales });

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ProductSales() {
  const { user, canViewModule } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();
  const canViewMargin = canViewModule("Accounting & Finance");

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [categoryId, setCategoryId] = useState("all");
  const [productId, setProductId] = useState("all");
  const [cashierId, setCashierId] = useState("all");
  const [search, setSearch] = useState("");
  const [hasTobaccoFee, setHasTobaccoFee] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cashiers, setCashiers] = useState<User[]>([]);
  const [data, setData] = useState<ProductSalesData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.getCategories().then(setCategories).catch(() => {}); }, []);
  useEffect(() => { api.getProducts({ status: "active" }).then(setProducts).catch(() => {}); }, []);

  // The product list follows the category filter so the picker only offers products that could
  // actually appear in the current result set; a stale selection is cleared rather than silently
  // returning an empty report.
  const productOptions = useMemo(
    () => (categoryId === "all" ? products : products.filter((p) => p.categoryId === categoryId)),
    [products, categoryId],
  );
  useEffect(() => {
    if (productId !== "all" && !productOptions.some((p) => p.id === productId)) setProductId("all");
  }, [productOptions, productId]);
  useEffect(() => {
    api.getUsers({ branchId: branchId !== "all" ? branchId : undefined })
      // Any staff role can ring up a sale (Branch Manager/Supervisor covering a register), not
      // just the Cashier role — filtering this list to literal "Cashier" meant a manager's own
      // sales could never be selected here, even though "All Employees" clearly included them.
      .then((u) => setCashiers(u.filter((x) => x.status === "active")))
      .catch(() => {});
    setCashierId("all");
  }, [branchId]);

  const load = useCallback(() => {
    setLoading(true);
    api.getProductSalesReport({
      from, to, branchId: branchId !== "all" ? branchId : undefined,
      categoryId: categoryId !== "all" ? categoryId : undefined,
      productId: productId !== "all" ? productId : undefined, search: search || undefined,
      cashierId: cashierId !== "all" ? cashierId : undefined, hasTobaccoFee: hasTobaccoFee || undefined,
    })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, branchId, categoryId, productId, search, cashierId, hasTobaccoFee]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportProductSalesReport({
        from, to, branchId: branchId !== "all" ? branchId : undefined, categoryId: categoryId !== "all" ? categoryId : undefined,
        productId: productId !== "all" ? productId : undefined,
        search: search || undefined, cashierId: cashierId !== "all" ? cashierId : undefined, hasTobaccoFee: hasTobaccoFee || undefined,
        exportedBy: user?.id, includeMargin: canViewMargin, format,
      });
      downloadBlob(blob, `product-sales-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const chartData = (data?.rows ?? []).slice(0, 10).map((r) => ({ name: r.productName, sales: r.netSales }));

  return (
    <PageShell title="Product Sales" subtitle="SKU-level sales, velocity, dead stock and returns">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        </div>
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
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={productId} onValueChange={setProductId}>
          <SelectTrigger className="h-9 w-52"><SelectValue placeholder="Product" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Products</SelectItem>
            {productOptions.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={cashierId} onValueChange={setCashierId}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Employee" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {cashiers.map((c) => <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input placeholder="Search SKU, barcode or name" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-48" />
        <label className="flex items-center gap-1.5 text-sm px-2">
          <Checkbox checked={hasTobaccoFee} onCheckedChange={(v) => setHasTobaccoFee(v === true)} />
          Tobacco fee only
        </label>
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <MetricCard label="Top SKU" value={kpis?.topSku ?? "—"} icon={Tag} accent="primary" />
        <MetricCard label="Units Sold" value={String(kpis?.unitsSold ?? 0)} icon={Boxes} />
        <MetricCard label="Net Sales" value={<><SARIcon />{fmt(kpis?.netSales ?? 0)}</>} icon={Wallet} />
        {canViewMargin && <MetricCard label="Gross Margin %" value={kpis?.grossMarginPct != null ? `${kpis.grossMarginPct}%` : "N/A"} icon={Percent} accent="success" />}
        <MetricCard label="Dead Stock" value={String(kpis?.deadStockCount ?? 0)} icon={PackageX} accent="warning" />
        <MetricCard label="Return Rate %" value={`${kpis?.returnRatePct ?? 0}%`} icon={RotateCcw} accent="destructive" />
        <MetricCard label="Tobacco Fees" value={<><SARIcon />{fmt(kpis?.totalTobaccoFees ?? 0)}</>} icon={Cigarette} accent="warning" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Top Products by Net Sales</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis type="number" fontSize={11} />
            <YAxis type="category" dataKey="name" fontSize={11} width={140} />
            <Tooltip formatter={(v: number) => fmtSAR(v)} />
            <Bar dataKey="sales" fill="var(--primary)" radius={[0, 4, 4, 0]} />
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
            { key: "category", label: "Category" },
            { key: "brand", label: "Brand" },
            { key: "unitsSold", label: "Units Sold" },
            { key: "netSales", label: "Net Sales", render: (r: ProductSalesRow) => <span className="font-semibold"><SARIcon />{fmt(r.netSales)}</span> },
            { key: "discounts", label: "Discounts", render: (r: ProductSalesRow) => <><SARIcon />{fmt(r.discounts)}</> },
            { key: "tobaccoFeeAmount", label: "Tobacco Fees", render: (r: ProductSalesRow) => r.tobaccoFeeAmount > 0 ? <span className="text-amber-600"><SARIcon />{fmt(r.tobaccoFeeAmount)}</span> : "—" },
            { key: "returnsQty", label: "Returns Qty" },
            { key: "returnRatePct", label: "Return Rate %", render: (r: ProductSalesRow) => `${r.returnRatePct}%` },
            ...(canViewMargin
              ? [
                  { key: "cogs", label: "COGS", render: (r: ProductSalesRow) => <><SARIcon />{fmt(r.cogs)}</> },
                  { key: "grossProfit", label: "Gross Profit", render: (r: ProductSalesRow) => <><SARIcon />{fmt(r.grossProfit)}</> },
                  { key: "marginPct", label: "Margin %", render: (r: ProductSalesRow) => (r.marginPct != null ? `${r.marginPct}%` : "N/A") },
                ]
              : []),
            { key: "currentStock", label: "Current Stock" },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
