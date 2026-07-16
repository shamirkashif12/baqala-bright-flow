import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { api, type DailySalesReport, type ReportExportFormat, type Terminal, type User } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Wallet, Receipt, Percent, RotateCcw } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend } from "recharts";

export const Route = createFileRoute("/_app/reports/daily-sales")({ component: DailySales });

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function DailySales() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [date, setDate] = useState(todayStr());
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [terminalId, setTerminalId] = useState("all");
  const [cashierId, setCashierId] = useState("all");
  const [paymentMethod, setPaymentMethod] = useState("all");
  const [customerType, setCustomerType] = useState("all");
  const [hasTobaccoFee, setHasTobaccoFee] = useState(false);
  const [data, setData] = useState<DailySalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [hideEmptyHours, setHideEmptyHours] = useState(true);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [cashiers, setCashiers] = useState<User[]>([]);

  useEffect(() => {
    api.getTerminals({ branchId: branchId !== "all" ? branchId : undefined }).then(setTerminals).catch(() => {});
    api.getUsers({ branchId: branchId !== "all" ? branchId : undefined }).then((u) => setCashiers(u.filter((x) => x.status === "active" && x.roleName === "Cashier"))).catch(() => {});
    setTerminalId("all");
    setCashierId("all");
  }, [branchId]);

  const load = useCallback(() => {
    setLoading(true);
    api.getDailySalesReport({
      date,
      branchId: branchId !== "all" ? branchId : undefined,
      terminalId: terminalId !== "all" ? terminalId : undefined,
      cashierId: cashierId !== "all" ? cashierId : undefined,
      paymentMethod: paymentMethod !== "all" ? paymentMethod : undefined,
      customerType: customerType !== "all" ? customerType : undefined,
      hasTobaccoFee: hasTobaccoFee || undefined,
    })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [date, branchId, terminalId, cashierId, paymentMethod, customerType, hasTobaccoFee]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportDailySalesReport({
        date, branchId: branchId !== "all" ? branchId : undefined,
        terminalId: terminalId !== "all" ? terminalId : undefined,
        cashierId: cashierId !== "all" ? cashierId : undefined,
        paymentMethod: paymentMethod !== "all" ? paymentMethod : undefined,
        customerType: customerType !== "all" ? customerType : undefined,
        hasTobaccoFee: hasTobaccoFee || undefined,
        exportedBy: user?.id, format,
      });
      downloadBlob(blob, `daily-sales-${date}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const hourlyRows = data?.hourly ?? [];
  const chartData = hourlyRows.map((h) => ({ hour: `${h.hour}:00`, netSales: h.netSales, cash: h.cash, card: h.card, wallet: h.wallet }));
  const activeHours = hourlyRows.filter((h) => h.transactions > 0 || h.cash > 0 || h.card > 0 || h.wallet > 0 || h.returns > 0);
  const visibleRows = hideEmptyHours ? activeHours : hourlyRows;

  return (
    <PageShell
      title="Daily Sales"
      subtitle="Hour-by-hour sales, payment split and VAT for a single business day"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-40" />
        {!lockedBranchId && (
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="All Branches" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={terminalId} onValueChange={setTerminalId}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Terminal" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Terminals</SelectItem>
            {terminals.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={cashierId} onValueChange={setCashierId}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Cashier" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Cashiers</SelectItem>
            {cashiers.map((c) => <SelectItem key={c.id} value={c.id}>{c.fullName}</SelectItem>)}
          </SelectContent>
        </Select>
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
        <Select value={customerType} onValueChange={setCustomerType}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Customer Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Customers</SelectItem>
            <SelectItem value="registered">Registered</SelectItem>
            <SelectItem value="walk-in">Walk-in</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-sm px-2">
          <Checkbox checked={hasTobaccoFee} onCheckedChange={(v) => setHasTobaccoFee(v === true)} />
          Tobacco fee only
        </label>
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
        <MetricCard label="Gross Sales" value={<><SARIcon />{fmt(kpis?.grossSales ?? 0)}</>} icon={Wallet} accent="primary" />
        <MetricCard label="Net Sales" value={<><SARIcon />{fmt(kpis?.netSales ?? 0)}</>} icon={Wallet} />
        <MetricCard label="Transactions" value={String(kpis?.transactions ?? 0)} icon={Receipt} />
        <MetricCard label="Avg Basket" value={<><SARIcon />{fmt(kpis?.avgBasket ?? 0)}</>} icon={Percent} />
        <MetricCard label="VAT Collected" value={<><SARIcon />{fmt(kpis?.vatCollected ?? 0)}</>} icon={Wallet} accent="success" />
        <MetricCard label="Tobacco Fees" value={<><SARIcon />{fmt(kpis?.tobaccoFees ?? 0)}</>} icon={Percent} accent="warning" />
        <MetricCard label="Returns / Refunds" value={<><SARIcon />{fmt(kpis?.returnsRefunds ?? 0)}</>} icon={RotateCcw} accent="destructive" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Hourly Net Sales</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="hour" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip formatter={(v: number) => fmtSAR(v)} />
            <Line type="monotone" dataKey="netSales" stroke="var(--primary)" strokeWidth={2} dot={false} name="Net Sales" />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Payment Split by Hour</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="hour" fontSize={11} />
            <YAxis fontSize={11} />
            <Tooltip formatter={(v: number) => fmtSAR(v)} />
            <Legend />
            <Bar dataKey="cash" stackId="pay" fill="var(--primary)" name="Cash" />
            <Bar dataKey="card" stackId="pay" fill="var(--success)" name="Card" />
            <Bar dataKey="wallet" stackId="pay" fill="var(--warning)" name="Wallet" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {activeHours.length} of 24 hours had recorded activity
            </p>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Hide hours with no activity
              <Switch checked={hideEmptyHours} onCheckedChange={setHideEmptyHours} />
            </label>
          </div>
          {visibleRows.length === 0 ? (
            <Card className="p-8 border-border/60 shadow-card text-center">
              <p className="text-sm font-medium">No transactions recorded for this day</p>
              <p className="text-xs text-muted-foreground mt-1">Try a different date or clear the filters above.</p>
            </Card>
          ) : (
            <PaginatedDataTable
              columns={[
                { key: "hour", label: "Hour", render: (r) => `${String(r.hour).padStart(2, "0")}:00` },
                { key: "transactions", label: "Txns" },
                { key: "grossSales", label: "Gross Sales", render: (r) => <><SARIcon />{fmt(r.grossSales)}</> },
                { key: "discounts", label: "Discounts", render: (r) => <><SARIcon />{fmt(r.discounts)}</> },
                { key: "returns", label: "Returns", render: (r) => <><SARIcon />{fmt(r.returns)}</> },
                { key: "netSales", label: "Net Sales", render: (r) => <span className="font-semibold"><SARIcon />{fmt(r.netSales)}</span> },
                { key: "vat", label: "VAT", render: (r) => <><SARIcon />{fmt(r.vat)}</> },
                { key: "tobaccoFees", label: "Tobacco Fees", render: (r) => <span className={r.tobaccoFees > 0 ? "text-warning-foreground" : "text-muted-foreground"}><SARIcon />{fmt(r.tobaccoFees)}</span> },
                { key: "cash", label: "Cash", render: (r) => <><SARIcon />{fmt(r.cash)}</> },
                { key: "card", label: "Card", render: (r) => <><SARIcon />{fmt(r.card)}</> },
                { key: "wallet", label: "Wallet", render: (r) => <><SARIcon />{fmt(r.wallet)}</> },
                { key: "avgBasket", label: "Avg Basket", render: (r) => <><SARIcon />{fmt(r.avgBasket)}</> },
              ]}
              rows={visibleRows}
            />
          )}
        </>
      )}
    </PageShell>
  );
}
