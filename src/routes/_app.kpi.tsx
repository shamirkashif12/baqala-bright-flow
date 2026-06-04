import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import { Gauge, ScanBarcode, Timer, ShoppingBag, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_app/kpi")({ component: KPI });

const cashierKpi = [
  { name: "Fahad Al-Qahtani", terminal: "TML-RYD-001", scans: 1180, orders: 142, sales: "ر.س 8,420", refunds: 2, discounts: 18, avg: "1m 24s", score: 92 },
  { name: "Mohammed Al-Harbi", terminal: "TML-RYD-002", scans: 980, orders: 128, sales: "ر.س 7,180", refunds: 1, discounts: 22, avg: "1m 38s", score: 88 },
  { name: "Khalid Al-Otaibi", terminal: "TML-KHB-001", scans: 720, orders: 96, sales: "ر.س 5,310", refunds: 4, discounts: 9, avg: "1m 52s", score: 78 },
  { name: "Sultan Al-Dossari", terminal: "TML-JED-001", scans: 640, orders: 88, sales: "ر.س 4,920", refunds: 0, discounts: 12, avg: "1m 18s", score: 86 },
  { name: "Bandar Al-Anzi", terminal: "TML-MED-001", scans: 310, orders: 42, sales: "ر.س 2,180", refunds: 1, discounts: 4, avg: "2m 02s", score: 71 },
];

const terminalKpi = [
  { id: "TML-RYD-001", branch: "Olaya", cashier: "Fahad", orders: 142, scans: 1180, sales: "ر.س 8,420", hours: 7.5, errors: 1, score: 94 },
  { id: "TML-RYD-002", branch: "Olaya", cashier: "Mohammed", orders: 128, scans: 980, sales: "ر.س 7,180", hours: 7.2, errors: 0, score: 91 },
  { id: "TML-KHB-001", branch: "Khobar", cashier: "Khalid", orders: 96, scans: 720, sales: "ر.س 5,310", hours: 6.8, errors: 3, score: 80 },
  { id: "TML-JED-001", branch: "Jeddah", cashier: "Sultan", orders: 88, scans: 640, sales: "ر.س 4,920", hours: 6.0, errors: 0, score: 89 },
];

function ScoreBar({ v }: { v: number }) {
  return (
    <div className="flex items-center gap-2 w-32">
      <Progress value={v} className="h-1.5 flex-1" />
      <Badge variant="outline" className={v >= 85 ? "bg-success/10 text-success border-success/30" : v >= 75 ? "bg-warning/15 text-warning-foreground border-warning/40" : "bg-destructive/10 text-destructive border-destructive/30"}>{v}</Badge>
    </div>
  );
}

function KPI() {
  return (
    <PageShell title="KPI Evaluation" subtitle="Per-cashier, per-terminal, per-branch and per-scan performance">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Scans (today)" value="3,830" delta="+12%" trend="up" icon={ScanBarcode} accent="primary" />
        <MetricCard label="Avg Scan Time" value="1.6s" delta="-0.2s" trend="up" icon={Timer} accent="success" />
        <MetricCard label="Orders Completed" value="496" delta="+8%" trend="up" icon={ShoppingBag} />
        <MetricCard label="Overall KPI Score" value="86 / 100" icon={Gauge} accent="primary" />
      </div>

      <Tabs defaultValue="cashier">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="cashier">Cashier KPI</TabsTrigger>
          <TabsTrigger value="terminal">Terminal KPI</TabsTrigger>
          <TabsTrigger value="scan">Product Scan KPI</TabsTrigger>
          <TabsTrigger value="branch">Branch KPI</TabsTrigger>
        </TabsList>

        <TabsContent value="cashier" className="mt-4">
          <Card className="overflow-hidden border-border/60 shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-3 font-semibold">Cashier</th>
                    <th className="px-3 py-3 font-semibold">Terminal</th>
                    <th className="px-3 py-3 font-semibold">Scans</th>
                    <th className="px-3 py-3 font-semibold">Orders</th>
                    <th className="px-3 py-3 font-semibold">Sales</th>
                    <th className="px-3 py-3 font-semibold">Refunds</th>
                    <th className="px-3 py-3 font-semibold">Discounts</th>
                    <th className="px-3 py-3 font-semibold">Avg Checkout</th>
                    <th className="px-3 py-3 font-semibold">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {cashierKpi.map((r) => (
                    <tr key={r.name} className="border-b last:border-0">
                      <td className="px-3 py-3 font-medium">{r.name}</td>
                      <td className="px-3 py-3 text-xs">{r.terminal}</td>
                      <td className="px-3 py-3 tabular-nums">{r.scans}</td>
                      <td className="px-3 py-3 tabular-nums">{r.orders}</td>
                      <td className="px-3 py-3 font-semibold">{r.sales}</td>
                      <td className="px-3 py-3 tabular-nums">{r.refunds}</td>
                      <td className="px-3 py-3 tabular-nums">{r.discounts}</td>
                      <td className="px-3 py-3 text-xs">{r.avg}</td>
                      <td className="px-3 py-3"><ScoreBar v={r.score} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="terminal" className="mt-4">
          <Card className="overflow-hidden border-border/60 shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-3 font-semibold">Terminal</th>
                    <th className="px-3 py-3 font-semibold">Branch</th>
                    <th className="px-3 py-3 font-semibold">Cashier</th>
                    <th className="px-3 py-3 font-semibold">Orders</th>
                    <th className="px-3 py-3 font-semibold">Scans</th>
                    <th className="px-3 py-3 font-semibold">Sales</th>
                    <th className="px-3 py-3 font-semibold">Active Hours</th>
                    <th className="px-3 py-3 font-semibold">Errors</th>
                    <th className="px-3 py-3 font-semibold">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {terminalKpi.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-3 py-3 font-semibold">{r.id}</td>
                      <td className="px-3 py-3">{r.branch}</td>
                      <td className="px-3 py-3 text-xs">{r.cashier}</td>
                      <td className="px-3 py-3 tabular-nums">{r.orders}</td>
                      <td className="px-3 py-3 tabular-nums">{r.scans}</td>
                      <td className="px-3 py-3 font-semibold">{r.sales}</td>
                      <td className="px-3 py-3 tabular-nums">{r.hours}h</td>
                      <td className="px-3 py-3 tabular-nums">{r.errors}</td>
                      <td className="px-3 py-3"><ScoreBar v={r.score} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="scan" className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Card className="p-5 border-border/60 shadow-card">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Avg Scan Time</p>
              <p className="text-3xl font-bold mt-1">1.6s</p>
              <p className="text-xs text-success mt-1 flex items-center gap-1"><TrendingUp className="h-3 w-3" />0.2s faster than last week</p>
            </Card>
            <Card className="p-5 border-border/60 shadow-card">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Misscan Rate</p>
              <p className="text-3xl font-bold mt-1">0.8%</p>
              <p className="text-xs text-muted-foreground mt-1">31 misreads / 3,830 scans</p>
            </Card>
            <Card className="p-5 border-border/60 shadow-card">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Items / Order</p>
              <p className="text-3xl font-bold mt-1">7.7</p>
              <p className="text-xs text-muted-foreground mt-1">Avg basket items</p>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="branch" className="mt-4">
          <Card className="overflow-hidden border-border/60 shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-3 font-semibold">Branch</th>
                    <th className="px-3 py-3 font-semibold">Orders</th>
                    <th className="px-3 py-3 font-semibold">Sales</th>
                    <th className="px-3 py-3 font-semibold">Avg Basket</th>
                    <th className="px-3 py-3 font-semibold">Refunds</th>
                    <th className="px-3 py-3 font-semibold">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { b: "Olaya — Riyadh HQ", o: 412, s: "ر.س 18,420", a: "ر.س 44.7", r: 4, sc: 93 },
                    { b: "Al Khobar Corniche", o: 318, s: "ر.س 12,890", a: "ر.س 40.5", r: 3, sc: 88 },
                    { b: "Jeddah Tahlia", o: 287, s: "ر.س 11,260", a: "ر.س 39.2", r: 5, sc: 84 },
                    { b: "Madinah Quba", o: 167, s: "ر.س 6,350", a: "ر.س 38.0", r: 2, sc: 79 },
                  ].map((r) => (
                    <tr key={r.b} className="border-b last:border-0">
                      <td className="px-3 py-3 font-medium">{r.b}</td>
                      <td className="px-3 py-3 tabular-nums">{r.o}</td>
                      <td className="px-3 py-3 font-semibold">{r.s}</td>
                      <td className="px-3 py-3">{r.a}</td>
                      <td className="px-3 py-3 tabular-nums">{r.r}</td>
                      <td className="px-3 py-3"><ScoreBar v={r.sc} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}