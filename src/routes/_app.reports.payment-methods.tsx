import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable, StatusBadge } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { api, type PaymentMethodsReport, type PaymentMethodRow, type ReportExportFormat } from "@/lib/api";
import { useReportFilterOptions } from "@/lib/use-report-filters";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Banknote, CreditCard, Wallet, Clock, RotateCcw, DollarSign, Cigarette } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

export const Route = createFileRoute("/_app/reports/payment-methods")({ component: PaymentMethods });

const METHOD_COLORS: Record<string, string> = {
  cash: "var(--primary)",
  card: "var(--success)",
  wallet: "var(--warning)",
  qr: "var(--muted-foreground)",
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function PaymentMethods() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [cashierId, setCashierId] = useState("all");
  const [terminalId, setTerminalId] = useState("all");
  const [hasTobaccoFee, setHasTobaccoFee] = useState(false);
  const [data, setData] = useState<PaymentMethodsReport | null>(null);
  const [loading, setLoading] = useState(true);

  const { employees, terminals } = useReportFilterOptions(branchId);

  useEffect(() => { setCashierId("all"); setTerminalId("all"); }, [branchId]);

  const filters = useMemo(() => ({
    branchId: branchId !== "all" ? branchId : undefined,
    paymentMethod: paymentMethod !== "all" ? paymentMethod : undefined,
    cashierId: cashierId !== "all" ? cashierId : undefined,
    terminalId: terminalId !== "all" ? terminalId : undefined,
    hasTobaccoFee: hasTobaccoFee || undefined,
  }), [branchId, paymentMethod, cashierId, terminalId, hasTobaccoFee]);

  const load = useCallback(() => {
    setLoading(true);
    api.getPaymentMethodsReport({ from, to, ...filters })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, filters]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportPaymentMethodsReport({ from, to, ...filters, exportedBy: user?.id, format });
      downloadBlob(blob, `payment-methods-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const pieData = Object.values(
    (data?.rows ?? []).reduce<Record<string, { name: string; value: number }>>((acc, r) => {
      acc[r.method] ??= { name: r.method, value: 0 };
      acc[r.method].value += r.grossAmount;
      return acc;
    }, {})
  );

  return (
    <PageShell
      title="Payment Methods"
      subtitle="Settlement values and transaction split by cash, card and wallet"
    >
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
        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Payment Method" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Methods</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="card">Card</SelectItem>
            <SelectItem value="wallet">Wallet</SelectItem>
            <SelectItem value="qr">QR</SelectItem>
          </SelectContent>
        </Select>
        <Select value={cashierId} onValueChange={setCashierId}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Employee" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.fullName}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={terminalId} onValueChange={setTerminalId}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Device" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Devices</SelectItem>
            {terminals.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-sm px-2">
          <Checkbox checked={hasTobaccoFee} onCheckedChange={(v) => setHasTobaccoFee(v === true)} />
          Tobacco fee only
        </label>
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <MetricCard label="Cash Collected" value={<><SARIcon />{fmt(kpis?.cashCollected ?? 0)}</>} icon={Banknote} accent="primary" />
        <MetricCard label="Card Settled" value={<><SARIcon />{fmt(kpis?.cardSettled ?? 0)}</>} icon={CreditCard} accent="success" />
        <MetricCard label="Wallet Amount" value={<><SARIcon />{fmt(kpis?.walletAmount ?? 0)}</>} icon={Wallet} accent="warning" />
        <MetricCard label="Pending" value={<><SARIcon />{fmt(kpis?.pendingAmount ?? 0)}</>} icon={Clock} />
        <MetricCard label="Refund Value" value={<><SARIcon />{fmt(kpis?.refundValue ?? 0)}</>} icon={RotateCcw} accent="destructive" />
        <MetricCard label="Payment Fees" value={<><SARIcon />{fmt(kpis?.paymentFees ?? 0)}</>} icon={DollarSign} accent="primary" />
        <MetricCard label="Tobacco Fees" value={<><SARIcon />{fmt(kpis?.tobaccoFees ?? 0)}</>} icon={Cigarette} accent="warning" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Payment Method Mix</h3>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
              {pieData.map((entry) => (
                <Cell key={entry.name} fill={METHOD_COLORS[entry.name] ?? "var(--muted-foreground)"} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => fmtSAR(v)} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <>
          <PaginatedDataTable
            columns={[
              { key: "method", label: "Method", render: (r: PaymentMethodRow) => <span className="capitalize">{r.method}</span> },
              { key: "branch", label: "Branch" },
              { key: "transactions", label: "Txns" },
              { key: "grossAmount", label: "Gross Amount", render: (r: PaymentMethodRow) => <span className="font-semibold"><SARIcon />{fmt(r.grossAmount)}</span> },
              { key: "netSettled", label: "Net Settled", render: (r: PaymentMethodRow) => <><SARIcon />{fmt(r.netSettled)}</> },
              { key: "pendingAmount", label: "Pending", render: (r: PaymentMethodRow) => <><SARIcon />{fmt(r.pendingAmount)}</> },
              { key: "status", label: "Status", render: (r: PaymentMethodRow) => <StatusBadge status={r.status} /> },
            ]}
            rows={data?.rows ?? []}
          />
          {(data?.refunds?.length ?? 0) > 0 && (
            <Card className="p-4 border-border/60 shadow-card">
              <h4 className="text-sm font-semibold mb-2">Refunds by Method</h4>
              <div className="flex flex-wrap gap-4 text-sm">
                {data!.refunds.map((r) => (
                  <div key={r.method} className="flex items-center gap-1.5">
                    <span className="capitalize text-muted-foreground">{r.method.replace(/_/g, " ")}:</span>
                    <span className="font-semibold"><SARIcon />{fmt(r.amount)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </PageShell>
  );
}
