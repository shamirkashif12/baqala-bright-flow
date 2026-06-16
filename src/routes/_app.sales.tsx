import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/metric-card";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { Wallet, Receipt, Percent, RotateCcw } from "lucide-react";
import { api, type Order } from "@/lib/api";

export const Route = createFileRoute("/_app/sales")({ component: Sales });

const bars = [42, 58, 36, 72, 64, 88, 92, 76, 58, 64, 82, 70];

function Sales() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getOrders()
      .then(setOrders)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const totalRevenue = orders.filter(o => o.paymentStatus === "paid").reduce((s, o) => s + o.totalAmount, 0);
  const refundedAmount = orders.filter(o => o.paymentStatus === "refunded").reduce((s, o) => s + o.totalAmount, 0);
  const totalDiscount = orders.reduce((s, o) => s + o.discountAmount, 0);
  const avgDiscountPct = totalRevenue > 0 ? ((totalDiscount / totalRevenue) * 100).toFixed(1) + "%" : "0%";
  const fmt = (n: number) => `ر.س ${n.toLocaleString("en-SA", { minimumFractionDigits: 2 })}`;

  const max = Math.max(...bars);

  return (
    <PageShell title="Sales" subtitle="Live transactions across all terminals">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Revenue" value={fmt(totalRevenue)} icon={Wallet} accent="primary" />
        <MetricCard label="Invoices" value={String(orders.length)} icon={Receipt} />
        <MetricCard label="Avg Discount" value={avgDiscountPct} icon={Percent} accent="warning" />
        <MetricCard label="Refunds" value={fmt(refundedAmount)} icon={RotateCcw} accent="destructive" />
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

      <Toolbar placeholder="Search invoice ID…" primaryLabel="New Sale" />
      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <DataTable
          columns={[
            { key: "orderNumber", label: "Invoice", render: (r: Order) => <span className="font-mono text-sm font-semibold">{r.orderNumber}</span> },
            { key: "createdAt", label: "Time", render: (r: Order) => new Date(r.createdAt).toLocaleTimeString("en-SA", { hour: "2-digit", minute: "2-digit" }) },
            { key: "branch", label: "Branch", render: (r: Order) => (r as Order & { branch?: { name: string } }).branch?.name ?? "—" },
            { key: "cashier", label: "Cashier", render: (r: Order) => (r as Order & { cashier?: { fullName: string } }).cashier?.fullName ?? "—" },
            { key: "method", label: "Method", render: (r: Order) => r.payments?.[0]?.paymentMethod ?? "—" },
            { key: "items", label: "Items", render: (r: Order) => r.items?.length ?? "—" },
            { key: "totalAmount", label: "Total", render: (r: Order) => <span className="font-semibold">{fmt(r.totalAmount)}</span> },
            { key: "paymentStatus", label: "Status", render: (r: Order) => <StatusBadge status={r.paymentStatus} /> },
          ]}
          rows={orders}
        />
      )}
    </PageShell>
  );
}
