import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/metric-card";
import { DataTable, StatusBadge } from "@/components/module-placeholder";
import { FilterBar } from "@/components/filter-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Receipt, Cigarette, Coins, TrendingUp, Download } from "lucide-react";

export const Route = createFileRoute("/_app/tax-reports")({ component: TaxReports });

const rows = [
  { id: "TR-9101", item: "Marlboro Red 20s", branch: "Olaya", cashier: "Fahad Al-Qahtani", order: "INV-0142", taxType: "Excise + VAT", feeType: "—", amount: "ر.س 23.40", date: "Today 14:42", status: "paid" },
  { id: "TR-9100", item: "Davidoff Gold 20s", branch: "Khobar", cashier: "Khalid Al-Otaibi", order: "INV-0140", taxType: "Excise + VAT", feeType: "—", amount: "ر.س 28.60", date: "Today 13:55", status: "paid" },
  { id: "TR-9099", item: "Plastic bag", branch: "Jeddah", cashier: "Sultan Al-Dossari", order: "INV-0138", taxType: "—", feeType: "Bag fee", amount: "ر.س 0.25", date: "Today 13:42", status: "paid" },
  { id: "TR-9098", item: "Delivery — Order 9912", branch: "Madinah", cashier: "Online", order: "ORD-9912", taxType: "VAT", feeType: "Delivery", amount: "ر.س 10.00", date: "Today 12:31", status: "paid" },
  { id: "TR-9097", item: "Shisha Tobacco 250g", branch: "Olaya", cashier: "Mohammed Al-Harbi", order: "INV-0131", taxType: "Excise + VAT", feeType: "—", amount: "ر.س 45.50", date: "Today 11:12", status: "paid" },
  { id: "TR-9096", item: "Card surcharge", branch: "Khobar", cashier: "Khalid Al-Otaibi", order: "INV-0130", taxType: "—", feeType: "Card surcharge", amount: "ر.س 2.18", date: "Today 10:48", status: "paid" },
  { id: "TR-9095", item: "VAT refund — RET-0042", branch: "Olaya", cashier: "Fahad Al-Qahtani", order: "RET-0042", taxType: "VAT reversal", feeType: "—", amount: "-ر.س 4.20", date: "Today 09:18", status: "refunded" },
];

function TaxReports() {
  return (
    <PageShell title="Tax & Fee Reports" subtitle="VAT, custom fees, tobacco excise — by branch, cashier, product and date">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="VAT Collected (mo)" value="ر.س 142,300" icon={Receipt} accent="primary" delta="+12%" trend="up" />
        <MetricCard label="Custom Fees (mo)" value="ر.س 8,420" icon={Coins} accent="success" />
        <MetricCard label="Tobacco Excise (mo)" value="ر.س 18,420" icon={Cigarette} accent="warning" />
        <MetricCard label="Tax Reversed (returns)" value="ر.س 1,210" icon={TrendingUp} accent="destructive" />
      </div>

      <FilterBar
        placeholder="Search by item, order, cashier…"
        extras={<Button size="sm" variant="outline" className="h-9 gap-1.5"><Download className="h-4 w-4" />Export</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 space-y-3 border-border/60 shadow-card">
          <h3 className="text-sm font-semibold">Fees by branch</h3>
          {[
            { b: "Olaya", v: "ر.س 3,210", pct: 92 },
            { b: "Khobar", v: "ر.س 2,140", pct: 64 },
            { b: "Jeddah", v: "ر.س 1,820", pct: 54 },
            { b: "Madinah", v: "ر.س 1,250", pct: 38 },
          ].map(r => (
            <div key={r.b}>
              <div className="flex justify-between text-xs mb-1"><span>{r.b}</span><span className="font-semibold">{r.v}</span></div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full gradient-primary" style={{ width: `${r.pct}%` }} /></div>
            </div>
          ))}
        </Card>
        <Card className="p-5 space-y-3 border-border/60 shadow-card">
          <h3 className="text-sm font-semibold">Tobacco tax by product</h3>
          {[
            { n: "Marlboro Red 20s", v: "ر.س 6,840" },
            { n: "Davidoff Gold 20s", v: "ر.س 4,210" },
            { n: "Shisha 250g", v: "ر.س 3,920" },
            { n: "Heated sticks", v: "ر.س 3,450" },
          ].map((r,i) => (
            <div key={r.n} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 min-w-0"><Badge variant="outline" className="font-mono text-[10px]">{i+1}</Badge><span className="truncate">{r.n}</span></div>
              <span className="font-semibold">{r.v}</span>
            </div>
          ))}
        </Card>
        <Card className="p-5 space-y-3 border-border/60 shadow-card">
          <h3 className="text-sm font-semibold">Tobacco tax by cashier</h3>
          {[
            { n: "Fahad Al-Qahtani", v: "ر.س 5,210" },
            { n: "Mohammed Al-Harbi", v: "ر.س 4,180" },
            { n: "Khalid Al-Otaibi", v: "ر.س 3,910" },
            { n: "Sultan Al-Dossari", v: "ر.س 2,820" },
          ].map(r => (
            <div key={r.n} className="flex items-center justify-between text-sm">
              <span className="truncate">{r.n}</span>
              <span className="font-semibold">{r.v}</span>
            </div>
          ))}
        </Card>
      </div>

      <DataTable
        columns={[
          { key: "id", label: "Report ID", render: r => <span className="font-mono text-xs">{r.id}</span> },
          { key: "item", label: "Item" },
          { key: "branch", label: "Branch", render: r => <Badge variant="outline">{r.branch}</Badge> },
          { key: "cashier", label: "Cashier" },
          { key: "order", label: "Order / Invoice", render: r => <span className="font-mono text-xs">{r.order}</span> },
          { key: "taxType", label: "Tax Type" },
          { key: "feeType", label: "Fee Type" },
          { key: "amount", label: "Amount", render: r => <span className="font-semibold">{r.amount}</span> },
          { key: "date", label: "Date" },
          { key: "status", label: "Status", render: r => <StatusBadge status={r.status} /> },
        ]}
        rows={rows}
      />
    </PageShell>
  );
}