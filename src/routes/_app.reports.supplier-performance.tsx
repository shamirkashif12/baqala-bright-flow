import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { api, type SupplierPerformanceReport as SupplierPerformanceData, type SupplierPerformanceRow, type ReportExportFormat, type Supplier } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Gauge, Clock, Wallet, DollarSign } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/reports/supplier-performance")({ component: SupplierPerformance });

function firstOfMonthStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function SupplierPerformance() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [supplierId, setSupplierId] = useState("all");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [data, setData] = useState<SupplierPerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.getSuppliers().then(setSuppliers).catch(() => {}); }, []);

  const load = useCallback(() => {
    setLoading(true);
    api.getSupplierPerformanceReport({ from, to, supplierId: supplierId !== "all" ? supplierId : undefined })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, supplierId]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportSupplierPerformanceReport({ from, to, supplierId: supplierId !== "all" ? supplierId : undefined, exportedBy: user?.id, format });
      downloadBlob(blob, `supplier-performance-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const isLowFillRate = (r: SupplierPerformanceRow) => r.fillRatePct < 80;
  const chartData = (data?.rows ?? []).slice(0, 10).map((r) => ({ name: r.supplierName, fillRate: r.fillRatePct }));

  return (
    <PageShell title="Supplier Performance" subtitle="Lead time, fill rate, purchase value and dues">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        </div>
        <Select value={supplierId} onValueChange={setSupplierId}>
          <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Supplier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Suppliers</SelectItem>
            {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Best Fill Rate %" value={`${kpis?.bestFillRatePct ?? 0}%`} icon={Gauge} accent="success" />
        <MetricCard label="Avg Lead Time (days)" value={String(kpis?.averageLeadTimeDays ?? 0)} icon={Clock} />
        <MetricCard label="Total Purchase Value" value={<><SARIcon />{fmt(kpis?.totalPurchaseValue ?? 0)}</>} icon={Wallet} accent="primary" />
        <MetricCard label="Outstanding Dues" value={<><SARIcon />{fmt(kpis?.outstandingDues ?? 0)}</>} icon={DollarSign} accent="destructive" />
        <MetricCard label="RTS Value" value={<><SARIcon />{fmt(kpis?.rtsValue ?? 0)}</>} icon={DollarSign} accent="warning" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Fill Rate by Supplier</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" fontSize={11} />
            <YAxis fontSize={11} unit="%" />
            <Tooltip formatter={(v: number) => `${v}%`} />
            <Bar dataKey="fillRate" radius={[4, 4, 0, 0]}>
              {chartData.map((d) => <Cell key={d.name} fill={d.fillRate < 80 ? "var(--destructive)" : "var(--success)"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "supplierId", label: "Supplier ID" },
            { key: "supplierName", label: "Supplier Name" },
            { key: "poCount", label: "PO Count" },
            { key: "orderedQty", label: "Ordered Qty" },
            { key: "receivedQty", label: "Received Qty" },
            { key: "fillRatePct", label: "Fill Rate %", render: (r: SupplierPerformanceRow) => <span className={cn(isLowFillRate(r) && "text-destructive font-semibold")}>{r.fillRatePct}%</span> },
            { key: "averageLeadTimeDays", label: "Avg Lead Time (days)" },
            { key: "lateDeliveries", label: "Late Deliveries" },
            { key: "purchaseValue", label: "Purchase Value", render: (r: SupplierPerformanceRow) => <span className="font-semibold"><SARIcon />{fmt(r.purchaseValue)}</span> },
            { key: "outstandingDues", label: "Outstanding Dues", render: (r: SupplierPerformanceRow) => <><SARIcon />{fmt(r.outstandingDues)}</> },
            { key: "supplierReturnsQty", label: "Supplier Returns Qty" },
            { key: "rtsValue", label: "RTS Value", render: (r: SupplierPerformanceRow) => <><SARIcon />{fmt(r.rtsValue)}</> },
            { key: "lastPoDate", label: "Last PO Date", render: (r: SupplierPerformanceRow) => new Date(r.lastPoDate).toLocaleDateString("en-SA") },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
