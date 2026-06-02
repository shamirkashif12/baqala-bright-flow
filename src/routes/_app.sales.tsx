import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/metric-card";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { Wallet, Receipt, Percent, RotateCcw } from "lucide-react";

export const Route = createFileRoute("/_app/sales")({ component: Sales });

const sales = [
  { inv: "INV-20260602-0142", time: "14:32", branch: "Olaya", cashier: "Fahad", method: "Card", items: 4, total: "ر.س 56.00", status: "paid" },
  { inv: "INV-20260602-0141", time: "14:28", branch: "Olaya", cashier: "Fahad", method: "Cash", items: 2, total: "ر.س 18.50", status: "paid" },
  { inv: "INV-20260602-0140", time: "14:21", branch: "Khobar", cashier: "Ali", method: "Mada", items: 7, total: "ر.س 142.30", status: "paid" },
  { inv: "INV-20260602-0139", time: "14:18", branch: "Jeddah", cashier: "Sara", method: "STC Pay", items: 3, total: "ر.س 42.00", status: "paid" },
  { inv: "INV-20260602-0138", time: "14:12", branch: "Olaya", cashier: "Mona", method: "Card", items: 12, total: "ر.س 284.75", status: "paid" },
  { inv: "INV-20260602-0137", time: "14:08", branch: "Madinah", cashier: "Yousef", method: "Cash", items: 1, total: "ر.س 6.50", status: "paid" },
  { inv: "INV-20260602-0136", time: "14:02", branch: "Olaya", cashier: "Fahad", method: "Card", items: 5, total: "ر.س 78.20", status: "paid" },
];

const bars = [42, 58, 36, 72, 64, 88, 92, 76, 58, 64, 82, 70];

function Sales() {
  const max = Math.max(...bars);
  return (
    <PageShell title="Sales" subtitle="Live transactions across all terminals">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Today" value="ر.س 48,920" delta="+18%" trend="up" icon={Wallet} accent="primary" />
        <MetricCard label="Invoices" value="1,284" delta="+12%" trend="up" icon={Receipt} />
        <MetricCard label="Avg Discount" value="3.2%" icon={Percent} accent="warning" />
        <MetricCard label="Refunds" value="ر.س 420" hint="6 today" icon={RotateCcw} accent="destructive" />
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
      <DataTable
        columns={[
          { key: "inv", label: "Invoice", render: (r) => <span className="font-mono text-sm font-semibold">{r.inv}</span> },
          { key: "time", label: "Time" },
          { key: "branch", label: "Branch" },
          { key: "cashier", label: "Cashier" },
          { key: "method", label: "Method" },
          { key: "items", label: "Items" },
          { key: "total", label: "Total", render: (r) => <span className="font-semibold">{r.total}</span> },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rows={sales}
      />
    </PageShell>
  );
}