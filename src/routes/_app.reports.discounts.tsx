import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable, FilterField } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { api, type DiscountsReport as DiscountsData, type DiscountRow, type ReportExportFormat } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Percent, Wallet, Ticket, X } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

export const Route = createFileRoute("/_app/reports/discounts")({ component: Discounts });

const TYPE_COLORS: Record<string, string> = { coupon: "var(--primary)", manual: "var(--warning)", loyalty: "var(--success)" };

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Discounts() {
  const { user, canViewModule } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();
  const canViewMargin = canViewModule("Accounting & Finance");

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [discountType, setDiscountType] = useState("all");
  const [data, setData] = useState<DiscountsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.getDiscountsReport({ from, to, branchId: branchId !== "all" ? branchId : undefined, discountType: discountType !== "all" ? discountType : undefined })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, branchId, discountType]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportDiscountsReport({ from, to, branchId: branchId !== "all" ? branchId : undefined, discountType: discountType !== "all" ? discountType : undefined, exportedBy: user?.id, includeMargin: canViewMargin, format });
      downloadBlob(blob, `discounts-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const hasFilters = from !== firstOfMonthStr() || to !== todayStr() || branchId !== (lockedBranchId ?? "all") || discountType !== "all";
  const clearFilters = () => {
    setFrom(firstOfMonthStr()); setTo(todayStr()); setBranchId(lockedBranchId ?? "all"); setDiscountType("all");
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const pieData = Object.values(
    (data?.rows ?? []).reduce<Record<string, { name: string; value: number }>>((acc, r) => {
      acc[r.discountType] ??= { name: r.discountType, value: 0 };
      acc[r.discountType].value += r.discountAmount;
      return acc;
    }, {})
  );

  return (
    <PageShell title="Discount Report" subtitle="Coupon, promotion and manual discounts across periods">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex items-center gap-1">
          <FilterField label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" /></FilterField>
          <span className="text-xs text-muted-foreground">–</span>
          <FilterField label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" /></FilterField>
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
        <FilterField label="Discount Type">
          <Select value={discountType} onValueChange={setDiscountType}>
            <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Discount Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="coupon">Coupon</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
              <SelectItem value="loyalty">Loyalty</SelectItem>
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
        <MetricCard label="Total Discount Value" value={<><SARIcon />{fmt(kpis?.totalDiscountValue ?? 0)}</>} icon={Percent} accent="primary" />
        <MetricCard label="Manual Discount Value" value={<><SARIcon />{fmt(kpis?.manualDiscountValue ?? 0)}</>} icon={Wallet} accent="warning" />
        <MetricCard label="Loyalty Discount Value" value={<><SARIcon />{fmt(kpis?.loyaltyDiscountValue ?? 0)}</>} icon={Wallet} accent="success" />
        <MetricCard label="Coupon Usage" value={String(kpis?.couponUsage ?? 0)} icon={Ticket} />
        <MetricCard label="Discount % of Sales" value={`${kpis?.discountPctOfSales ?? 0}%`} icon={Percent} accent="destructive" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Discount Value by Type</h3>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={2}>
              {pieData.map((d) => <Cell key={d.name} fill={TYPE_COLORS[d.name] ?? "var(--muted-foreground)"} />)}
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
            { key: "invoiceNo", label: "Invoice No." },
            { key: "dateTime", label: "Date/Time", render: (r: DiscountRow) => new Date(r.dateTime).toLocaleString("en-SA", { dateStyle: "short", timeStyle: "short" }) },
            { key: "branch", label: "Branch" },
            { key: "cashier", label: "Cashier" },
            { key: "customerType", label: "Customer Type" },
            { key: "discountType", label: "Discount Type", render: (r: DiscountRow) => <span className="capitalize">{r.discountType}</span> },
            { key: "couponCode", label: "Coupon Code", render: (r: DiscountRow) => r.couponCode ?? "—" },
            { key: "discountPct", label: "Discount %", render: (r: DiscountRow) => `${r.discountPct}%` },
            { key: "discountAmount", label: "Discount Amount", render: (r: DiscountRow) => <span className="font-semibold"><SARIcon />{fmt(r.discountAmount)}</span> },
            { key: "netSalesAfterDiscount", label: "Net Sales After Discount", render: (r: DiscountRow) => <><SARIcon />{fmt(r.netSalesAfterDiscount)}</> },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
