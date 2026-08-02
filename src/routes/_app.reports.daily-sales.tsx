import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable, FilterField } from "@/components/module-placeholder";
import { DateRangeField } from "@/components/report-filters/date-range-field";
import { ReportExportButton } from "@/components/report-export-button";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { api, type DailySalesReport, type ReportExportFormat, type Terminal, type User } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Wallet, Receipt, Percent, RotateCcw, X } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend } from "recharts";

export const Route = createFileRoute("/_app/reports/daily-sales")({ component: DailySales });

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const PAYMENT_METHODS = [
  { id: "cash", label: "Cash" }, { id: "card", label: "Card" }, { id: "wallet", label: "Wallet" }, { id: "qr", label: "QR" },
];
const CUSTOMER_TYPES = [{ id: "registered", label: "Registered" }, { id: "walk-in", label: "Walk-in" }];

function DailySales() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [branchIds, setBranchIds] = useState<string[]>(lockedBranchId ? [lockedBranchId] : []);
  const [terminalIds, setTerminalIds] = useState<string[]>([]);
  const [cashierIds, setCashierIds] = useState<string[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [customerTypes, setCustomerTypes] = useState<string[]>([]);
  const [hasTobaccoFee, setHasTobaccoFee] = useState(false);
  const [data, setData] = useState<DailySalesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [hideEmptyHours, setHideEmptyHours] = useState(true);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [cashiers, setCashiers] = useState<User[]>([]);

  const scopedBranchId = branchIds.length === 1 ? branchIds[0] : undefined;

  useEffect(() => {
    api.getTerminals({ branchId: branchIds.length ? branchIds : undefined }).then(setTerminals).catch(() => {});
    api.getUsers({ branchId: scopedBranchId }).then((u) => setCashiers(u.filter((x) => x.status === "active" && x.roleName === "Cashier"))).catch(() => {});
    setTerminalIds([]);
    setCashierIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchIds.join(",")]);

  const load = useCallback(() => {
    setLoading(true);
    api.getDailySalesReport({
      from, to,
      branchId: branchIds.length ? branchIds : undefined,
      terminalId: terminalIds.length ? terminalIds : undefined,
      cashierId: cashierIds.length ? cashierIds : undefined,
      paymentMethod: paymentMethods.length ? paymentMethods : undefined,
      customerType: customerTypes.length ? customerTypes : undefined,
      hasTobaccoFee: hasTobaccoFee || undefined,
    })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, branchIds, terminalIds, cashierIds, paymentMethods, customerTypes, hasTobaccoFee]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportDailySalesReport({
        from, to,
        branchId: branchIds.length ? branchIds : undefined,
        terminalId: terminalIds.length ? terminalIds : undefined,
        cashierId: cashierIds.length ? cashierIds : undefined,
        paymentMethod: paymentMethods.length ? paymentMethods : undefined,
        customerType: customerTypes.length ? customerTypes : undefined,
        hasTobaccoFee: hasTobaccoFee || undefined,
        exportedBy: user?.id, format,
      });
      downloadBlob(blob, `daily-sales-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const hasFilters = from !== todayStr() || to !== todayStr() || branchIds.length !== (lockedBranchId ? 1 : 0)
    || terminalIds.length > 0 || cashierIds.length > 0 || paymentMethods.length > 0 || customerTypes.length > 0 || hasTobaccoFee !== false;
  const clearFilters = () => {
    setFrom(todayStr()); setTo(todayStr()); setBranchIds(lockedBranchId ? [lockedBranchId] : []); setTerminalIds([]); setCashierIds([]);
    setPaymentMethods([]); setCustomerTypes([]); setHasTobaccoFee(false);
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
      subtitle="Hour-of-day sales, payment split and VAT — pick a single day, or a range to compare hourly patterns"
    >
      <div className="flex flex-wrap items-end gap-2">
        <DateRangeField from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        {!lockedBranchId && (
          <FilterField label="Branch">
            <div className="w-44">
              <SearchableMultiSelect
                placeholder="All Branches"
                options={branches.map((b) => ({ id: b.id, label: b.name }))}
                selected={branchIds}
                onChange={setBranchIds}
              />
            </div>
          </FilterField>
        )}
        <FilterField label="Terminal">
          <div className="w-40">
            <SearchableMultiSelect
              placeholder="All Terminals"
              options={terminals.map((t) => ({ id: t.id, label: t.name }))}
              selected={terminalIds}
              onChange={setTerminalIds}
            />
          </div>
        </FilterField>
        <FilterField label="Cashier">
          <div className="w-40">
            <SearchableMultiSelect
              placeholder="All Cashiers"
              options={cashiers.map((c) => ({ id: c.id, label: c.fullName }))}
              selected={cashierIds}
              onChange={setCashierIds}
            />
          </div>
        </FilterField>
        <FilterField label="Payment Method">
          <div className="w-40">
            <SearchableMultiSelect
              placeholder="All Methods"
              options={PAYMENT_METHODS}
              selected={paymentMethods}
              onChange={setPaymentMethods}
            />
          </div>
        </FilterField>
        <FilterField label="Customer Type">
          <div className="w-40">
            <SearchableMultiSelect
              placeholder="All Customers"
              options={CUSTOMER_TYPES}
              selected={customerTypes}
              onChange={setCustomerTypes}
            />
          </div>
        </FilterField>
        <label className="flex items-center gap-1.5 text-sm px-2">
          <Checkbox checked={hasTobaccoFee} onCheckedChange={(v) => setHasTobaccoFee(v === true)} />
          Tobacco fee only
        </label>
        {hasFilters && (
          <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" /> Clear Filters
          </Button>
        )}
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
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
              <p className="text-sm font-medium">No transactions recorded for this date range</p>
              <p className="text-xs text-muted-foreground mt-1">Try a different date range or clear the filters above.</p>
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

          <div className="pt-2">
            <h3 className="text-sm font-semibold mb-2">Sales per Item</h3>
            {(data?.items.length ?? 0) === 0 ? (
              <Card className="p-6 border-border/60 shadow-card text-center text-sm text-muted-foreground">
                No items sold for this day/filter.
              </Card>
            ) : (
              <PaginatedDataTable
                columns={[
                  { key: "productName", label: "Item", render: (r) => <span className="font-medium">{r.productName}</span> },
                  { key: "sku", label: "SKU", render: (r) => <span className="font-mono text-xs text-muted-foreground">{r.sku}</span> },
                  { key: "quantitySold", label: "Quantity Sold", render: (r) => <span className="tabular-nums">{r.quantitySold}</span> },
                  { key: "grossSales", label: "Amount", render: (r) => <span className="tabular-nums font-semibold"><SARIcon />{fmt(r.grossSales)}</span> },
                ]}
                rows={data?.items ?? []}
              />
            )}
          </div>
        </>
      )}
    </PageShell>
  );
}
