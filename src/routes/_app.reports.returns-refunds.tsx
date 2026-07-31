import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable, StatusBadge, FilterField } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { api, type ReturnsRefundsReport as ReturnsRefundsData, type ReturnRefundRow, type ReportExportFormat, type Product, type User } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { RotateCcw, Wallet, Receipt, Clock, X } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

export const Route = createFileRoute("/_app/reports/returns-refunds")({ component: ReturnsRefunds });

const METHOD_COLORS: Record<string, string> = { cash: "var(--primary)", store_credit: "var(--warning)", original_payment: "var(--success)" };

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ReturnsRefunds() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [refundMethod, setRefundMethod] = useState("all");
  const [status, setStatus] = useState("all");
  const [customerType, setCustomerType] = useState("all");
  const [reason, setReason] = useState("all");
  const [productId, setProductId] = useState("all");
  const [processedBy, setProcessedBy] = useState("all");
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [data, setData] = useState<ReturnsRefundsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.getProducts().then(setProducts).catch(() => {}); }, []);
  useEffect(() => { api.getUsers({ branchId: branchId !== "all" ? branchId : undefined }).then(setUsers).catch(() => {}); }, [branchId]);

  const filterParams = {
    from, to, branchId: branchId !== "all" ? branchId : undefined,
    refundMethod: refundMethod !== "all" ? refundMethod : undefined,
    status: status !== "all" ? status : undefined,
    customerType: customerType !== "all" ? customerType : undefined,
    reason: reason !== "all" ? reason : undefined,
    productId: productId !== "all" ? productId : undefined,
    processedBy: processedBy !== "all" ? processedBy : undefined,
  };

  const hasFilters = from !== firstOfMonthStr() || to !== todayStr() || (!lockedBranchId && branchId !== "all")
    || refundMethod !== "all" || status !== "all" || customerType !== "all" || reason !== "all"
    || productId !== "all" || processedBy !== "all";
  const clearFilters = () => {
    setFrom(firstOfMonthStr()); setTo(todayStr());
    if (!lockedBranchId) setBranchId("all");
    setRefundMethod("all"); setStatus("all"); setCustomerType("all"); setReason("all");
    setProductId("all"); setProcessedBy("all");
  };

  const load = useCallback(() => {
    setLoading(true);
    api.getReturnsRefundsReport(filterParams)
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, branchId, refundMethod, status, customerType, reason, productId, processedBy]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportReturnsRefundsReport({ ...filterParams, exportedBy: user?.id, format });
      downloadBlob(blob, `returns-refunds-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const pieData = Object.values(
    (data?.rows ?? []).reduce<Record<string, { name: string; value: number }>>((acc, r) => {
      acc[r.refundMethod] ??= { name: r.refundMethod, value: 0 };
      acc[r.refundMethod].value += r.refundAmount;
      return acc;
    }, {})
  );

  return (
    <PageShell title="Return / Refund Report" subtitle="Customer returns, refunds and VAT reversal">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex items-center gap-1">
          <FilterField label="From"><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" /></FilterField>
          <span className="text-xs text-muted-foreground">–</span>
          <FilterField label="To"><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" /></FilterField>
        </div>
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
        <FilterField label="Refund Method">
          <Select value={refundMethod} onValueChange={setRefundMethod}>
            <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Refund Method" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Methods</SelectItem>
              <SelectItem value="cash">Cash</SelectItem>
              <SelectItem value="store_credit">Store Credit</SelectItem>
              <SelectItem value="original_payment">Original Payment</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Status">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Customer Type">
          <Select value={customerType} onValueChange={setCustomerType}>
            <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Customer Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              <SelectItem value="registered">Registered</SelectItem>
              <SelectItem value="walk-in">Walk-in</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Reason">
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Reason" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reasons</SelectItem>
              <SelectItem value="Damaged packaging">Damaged packaging</SelectItem>
              <SelectItem value="Wrong item received">Wrong item received</SelectItem>
              <SelectItem value="Expired product">Expired product</SelectItem>
              <SelectItem value="Quality issue">Quality issue</SelectItem>
              <SelectItem value="Customer changed mind">Customer changed mind</SelectItem>
              <SelectItem value="Duplicate purchase">Duplicate purchase</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Product">
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Product" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Products</SelectItem>
              {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Employee">
          <Select value={processedBy} onValueChange={setProcessedBy}>
            <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Employee" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>
              {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
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
        <MetricCard label="Return Count" value={String(kpis?.returnCount ?? 0)} icon={RotateCcw} accent="primary" />
        <MetricCard label="Refund Value" value={<><SARIcon />{fmt(kpis?.refundValue ?? 0)}</>} icon={Wallet} accent="destructive" />
        <MetricCard label="VAT Reversed" value={<><SARIcon />{fmt(kpis?.vatReversed ?? 0)}</>} icon={Receipt} />
        <MetricCard label="Top Return Reason" value={kpis?.topReturnReason ?? "—"} icon={RotateCcw} />
        <MetricCard label="Refunds Pending" value={String(kpis?.refundsPending ?? 0)} icon={Clock} accent="warning" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Refund Method Split</h3>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
              {pieData.map((d) => <Cell key={d.name} fill={METHOD_COLORS[d.name] ?? "var(--muted-foreground)"} />)}
            </Pie>
            <Tooltip formatter={(v: number) => fmtSAR(v)} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "returnId", label: "Return ID" },
            { key: "originalOrderId", label: "Original Order" },
            { key: "invoiceNo", label: "Invoice No." },
            { key: "dateTime", label: "Date/Time", render: (r: ReturnRefundRow) => new Date(r.dateTime).toLocaleString("en-SA", { dateStyle: "short", timeStyle: "short" }) },
            { key: "branch", label: "Branch" },
            { key: "cashier", label: "Cashier" },
            { key: "customer", label: "Customer" },
            { key: "returnType", label: "Return Type" },
            { key: "reason", label: "Reason" },
            { key: "skus", label: "SKU(s)" },
            { key: "qty", label: "Qty" },
            { key: "refundMethod", label: "Refund Method" },
            { key: "refundAmount", label: "Refund Amount", render: (r: ReturnRefundRow) => <span className="font-semibold"><SARIcon />{fmt(r.refundAmount)}</span> },
            { key: "vatReversal", label: "VAT Reversal", render: (r: ReturnRefundRow) => <><SARIcon />{fmt(r.vatReversal)}</> },
            { key: "approvedBy", label: "Approved By" },
            { key: "status", label: "Status", render: (r: ReturnRefundRow) => <StatusBadge status={r.status} /> },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
