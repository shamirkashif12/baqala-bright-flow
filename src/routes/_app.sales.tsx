import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { MetricCard } from "@/components/metric-card";
import { DataTable, StatusBadge } from "@/components/module-placeholder";
import { Wallet, Receipt, Percent, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import { api, type Order, type Branch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { SARIcon, fmtSAR } from "@/lib/currency";

export const Route = createFileRoute("/_app/sales")({ component: Sales });

const bars = [42, 58, 36, 72, 64, 88, 92, 76, 58, 64, 82, 70];

function Sales() {
  const { user } = useAuth();
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;

  const [orders, setOrders] = useState<Order[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [branchIds, setBranchIds] = useState<string[]>(lockedBranchId ? [lockedBranchId] : []);
  const [payFilter, setPayFilter] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    if (lockedBranchId) setBranchIds([lockedBranchId]);
  }, [lockedBranchId]);

  useEffect(() => {
    if (!lockedBranchId) api.getBranches("active").then(setBranches).catch(() => {});
  }, [lockedBranchId]);

  const load = useCallback(() => {
    setLoading(true);
    api.getOrders({
      branchId: branchIds.length ? branchIds : undefined,
      paymentStatus: payFilter.length ? payFilter : undefined,
      from: dateFrom || undefined,
      to: dateTo || undefined,
    })
      .then(setOrders)
      .catch(e => { console.error(e); toast.error("Failed to load sales data."); })
      .finally(() => setLoading(false));
  }, [branchIds, payFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const filtered = orders.filter(o =>
    !q ||
    o.orderNumber?.toLowerCase().includes(q.toLowerCase()) ||
    o.branch?.name?.toLowerCase().includes(q.toLowerCase()) ||
    o.cashier?.fullName?.toLowerCase().includes(q.toLowerCase())
  );

  const totalRevenue = filtered.filter(o => o.paymentStatus === "paid").reduce((s, o) => s + o.totalAmount, 0);
  const refundedAmount = filtered.filter(o => o.paymentStatus === "refunded").reduce((s, o) => s + o.totalAmount, 0);
  const totalDiscount = filtered.reduce((s, o) => s + o.discountAmount, 0);
  const avgDiscountPct = totalRevenue > 0 ? ((totalDiscount / totalRevenue) * 100).toFixed(1) + "%" : "0%";
  const fmt = (n: number) => fmtSAR(n);
  const max = Math.max(...bars);

  return (
    <PageShell title="Sales" subtitle="Live transactions across all terminals">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Revenue" value={<><SARIcon />{" "}{fmt(totalRevenue)}</>} icon={Wallet} accent="primary" />
        <MetricCard label="Invoices" value={String(orders.length)} icon={Receipt} />
        <MetricCard label="Avg Discount" value={avgDiscountPct} icon={Percent} accent="warning" />
        <MetricCard label="Refunds" value={<><SARIcon />{" "}{fmt(refundedAmount)}</>} icon={RotateCcw} accent="destructive" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Hourly Sales — Today</h3>
        <div className="flex items-end gap-2 h-48">
          {bars.map((v, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full rounded-t-lg gradient-primary hover:opacity-80 transition-opacity" style={{ height: `${(v / max) * 100}%` }} />
              <span className="text-[10px] text-muted-foreground">{8 + i}h</span>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search invoice, branch, cashier…" className="h-9 w-56 flex-shrink-0" />
        {!lockedBranchId && (
          <div className="w-44">
            <SearchableMultiSelect
              placeholder="All Branches"
              options={branches.map(b => ({ id: b.id, label: b.name }))}
              selected={branchIds}
              onChange={setBranchIds}
            />
          </div>
        )}
        <div className="w-44">
          <SearchableMultiSelect
            placeholder="Payment Status"
            options={[
              { id: "paid", label: "Paid" },
              { id: "pending", label: "Pending" },
              { id: "refunded", label: "Refunded" },
              { id: "partial", label: "Partial" },
            ]}
            selected={payFilter}
            onChange={setPayFilter}
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Date:</span>
          <Input type="date" className="h-9 w-36" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" className="h-9 w-36" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" onClick={() => { setDateFrom(""); setDateTo(""); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <DataTable
          columns={[
            { key: "orderNumber", label: "Invoice", render: (r: Order) => <span className="font-mono text-sm font-semibold">{r.orderNumber}</span> },
            { key: "createdAt", label: "Date / Time", render: (r: Order) => new Date(r.createdAt).toLocaleString("en-SA", { dateStyle: "short", timeStyle: "short" }) },
            { key: "branch", label: "Branch", render: (r: Order) => r.branch?.name ?? "—" },
            { key: "cashier", label: "Cashier", render: (r: Order) => r.cashier?.fullName ?? "—" },
            { key: "method", label: "Method", render: (r: Order) => r.payments?.[0]?.paymentMethod ?? "—" },
            { key: "items", label: "Items", render: (r: Order) => r.items?.length ?? "—" },
            { key: "totalAmount", label: "Total", render: (r: Order) => <span className="tabular-nums font-semibold"><SARIcon />{fmt(r.totalAmount)}</span> },
            { key: "paymentStatus", label: "Status", render: (r: Order) => <StatusBadge status={r.paymentStatus} /> },
          ]}
          rows={filtered}
        />
      )}
    </PageShell>
  );
}
