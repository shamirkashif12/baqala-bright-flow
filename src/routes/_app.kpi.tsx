import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { PageShell } from "@/components/app-topbar";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import { ScanBarcode, ShoppingBag } from "lucide-react";
import { api, excludeDisabledBranches, type CashierShift, type Terminal, type Branch, type KpiSummary } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";

export const Route = createFileRoute("/_app/kpi")({ component: KPI });

function KPI() {
  const [shifts, setShifts] = useState<CashierShift[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [kpi, setKpi] = useState<KpiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.allSettled([
      api.getShifts(),
      api.getTerminals(),
      api.getBranches(),
      api.getKpiSummary(),
    ]).then(([s, t, b, k]) => {
      if (s.status === "fulfilled") setShifts(s.value);
      if (t.status === "fulfilled") setTerminals(t.value);
      if (b.status === "fulfilled") setBranches(excludeDisabledBranches(b.value));
      if (k.status === "fulfilled") setKpi(k.value);
      setLoadError([s, t, b, k].some((r) => r.status === "rejected"));
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, []);

  return (
    <PageShell title="KPI Evaluation" subtitle="Per-cashier, per-terminal, per-branch and per-scan performance">
      {loadError && <LoadErrorBanner onRetry={load} />}
      {/* "Avg Scan Time" / "Overall KPI Score" tiles were removed rather than left showing "—" —
          nothing in this system instruments individual scan events or defines a scoring formula,
          so there was no real number to show. What's below (scan volume, completed orders) is
          computed from real Orders/OrderItems data. */}
      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard label="Total Scans (today)" value={String(kpi?.totalScansToday ?? 0)} icon={ScanBarcode} accent="primary" />
        <MetricCard label="Orders Completed (today)" value={String(kpi?.ordersCompletedToday ?? 0)} icon={ShoppingBag} />
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
            {loading ? (
              <div className="p-6 text-center text-muted-foreground text-sm">Loading...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-3 font-semibold">Cashier</th>
                      <th className="px-3 py-3 font-semibold">Terminal</th>
                      <th className="px-3 py-3 font-semibold">Orders</th>
                      <th className="px-3 py-3 font-semibold">Sales</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shifts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No shift data available</td>
                      </tr>
                    ) : (
                      shifts.map((shift) => (
                        <tr key={shift.id} className="border-b last:border-0">
                          <td className="px-3 py-3 font-medium">{shift.cashier?.fullName ?? "Unknown"}</td>
                          <td className="px-3 py-3 text-xs">{shift.terminal?.terminalCode ?? "—"}</td>
                          <td className="px-3 py-3 tabular-nums">{shift.ordersCount ?? 0}</td>
                          <td className="px-3 py-3 font-semibold"><SARIcon />{fmtSAR(shift.totalSales)}</td>
                          <td className="px-3 py-3">
                            <Badge variant="outline" className={shift.status === "open" ? "bg-success/10 text-success border-success/30" : "bg-muted/40 text-muted-foreground border-border/60"}>
                              {shift.status}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="terminal" className="mt-4">
          <Card className="overflow-hidden border-border/60 shadow-card">
            {loading ? (
              <div className="p-6 text-center text-muted-foreground text-sm">Loading...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-3 font-semibold">Terminal</th>
                      <th className="px-3 py-3 font-semibold">Branch</th>
                      <th className="px-3 py-3 font-semibold">Assigned Cashier</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold">Last Sync</th>
                    </tr>
                  </thead>
                  <tbody>
                    {terminals.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No terminal data available</td>
                      </tr>
                    ) : (
                      terminals.map((terminal) => (
                        <tr key={terminal.id} className="border-b last:border-0">
                          <td className="px-3 py-3 font-semibold">{terminal.terminalCode}</td>
                          <td className="px-3 py-3">{terminal.branch?.name ?? "—"}</td>
                          <td className="px-3 py-3 text-xs">{terminal.assignedCashier?.fullName ?? "Unassigned"}</td>
                          <td className="px-3 py-3">
                            <Badge variant="outline" className={terminal.status === "active" ? "bg-success/10 text-success border-success/30" : "bg-muted/40 text-muted-foreground border-border/60"}>
                              {terminal.status}
                            </Badge>
                          </td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">{terminal.lastSync ? new Date(terminal.lastSync).toLocaleString("en-SA") : "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="scan" className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            {/* Avg Scan Time / Misscan Rate genuinely have no source data — this system doesn't
                instrument individual scan events (timing, mis-scans) anywhere. Left as an honest
                "not tracked" state rather than a fabricated number. Items / Order below IS real —
                derived from today's actual order line items. */}
            <Card className="p-5 border-border/60 shadow-card">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Avg Scan Time</p>
              <p className="text-3xl font-bold mt-1">—</p>
              <p className="text-xs text-muted-foreground mt-1">Not tracked — no scan-level timing is captured</p>
            </Card>
            <Card className="p-5 border-border/60 shadow-card">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Misscan Rate</p>
              <p className="text-3xl font-bold mt-1">—</p>
              <p className="text-xs text-muted-foreground mt-1">Not tracked — no mis-scan events are captured</p>
            </Card>
            <Card className="p-5 border-border/60 shadow-card">
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Items / Order (today)</p>
              <p className="text-3xl font-bold mt-1">{kpi?.itemsPerOrderToday ?? 0}</p>
              <p className="text-xs text-muted-foreground mt-1">{kpi?.transactionsToday ?? 0} orders today</p>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="branch" className="mt-4">
          <Card className="overflow-hidden border-border/60 shadow-card">
            {loading ? (
              <div className="p-6 text-center text-muted-foreground text-sm">Loading...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-3 font-semibold">Branch</th>
                      <th className="px-3 py-3 font-semibold">City</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold">Orders (today)</th>
                      <th className="px-3 py-3 font-semibold">Sales (today)</th>
                      <th className="px-3 py-3 font-semibold">Avg Basket (today)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branches.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No branch data available</td>
                      </tr>
                    ) : (
                      branches.map((branch) => {
                        const bk = kpi?.branchKpi.find((k) => k.branchId === branch.id);
                        return (
                          <tr key={branch.id} className="border-b last:border-0">
                            <td className="px-3 py-3 font-medium">{branch.name}</td>
                            <td className="px-3 py-3">{branch.city ?? "—"}</td>
                            <td className="px-3 py-3">
                              <Badge variant="outline" className={branch.status === "active" ? "bg-success/10 text-success border-success/30" : "bg-muted/40 text-muted-foreground border-border/60"}>
                                {branch.status}
                              </Badge>
                            </td>
                            <td className="px-3 py-3 tabular-nums">{bk?.ordersToday ?? 0}</td>
                            <td className="px-3 py-3 font-semibold tabular-nums"><SARIcon />{fmtSAR(bk?.salesToday ?? 0)}</td>
                            <td className="px-3 py-3 tabular-nums"><SARIcon />{fmtSAR(bk?.avgBasketToday ?? 0)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
