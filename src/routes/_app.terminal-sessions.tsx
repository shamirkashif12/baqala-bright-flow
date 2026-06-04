import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Terminal as TerminalIcon, ArrowLeftRight, Activity } from "lucide-react";

export const Route = createFileRoute("/_app/terminal-sessions")({ component: Sessions });

const rows = [
  { cashier: "Fahad Al-Qahtani", current: "TML-RYD-001", prev: "TML-RYD-003", shift: "Active · since 07:55", held: 2, orders: 142, scans: 1180, status: "active" },
  { cashier: "Mohammed Al-Harbi", current: "TML-RYD-002", prev: "TML-RYD-001", shift: "Active · since 08:10", held: 1, orders: 128, scans: 980, status: "active" },
  { cashier: "Khalid Al-Otaibi", current: "TML-KHB-001", prev: "—", shift: "Closed · 07:00–15:00", held: 0, orders: 96, scans: 720, status: "closed" },
  { cashier: "Sultan Al-Dossari", current: "TML-JED-001", prev: "TML-JED-002", shift: "Active · since 09:00", held: 3, orders: 88, scans: 640, status: "active" },
  { cashier: "Bandar Al-Anzi", current: "TML-MED-001", prev: "—", shift: "Active · since 10:15", held: 0, orders: 42, scans: 310, status: "active" },
];

function Sessions() {
  return (
    <PageShell title="Terminal Sessions" subtitle="Cashier ↔ terminal continuity & handover">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active Sessions" value="4" icon={Activity} accent="primary" />
        <MetricCard label="Terminals Online" value="11 / 12" icon={TerminalIcon} accent="warning" />
        <MetricCard label="Held Orders" value="6" icon={ArrowLeftRight} />
        <MetricCard label="Cashier Switches Today" value="3" icon={ArrowLeftRight} />
      </div>

      <Card className="overflow-hidden border-border/60 shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Cashier</th>
                <th className="px-4 py-3 font-semibold">Current Terminal</th>
                <th className="px-4 py-3 font-semibold">Previous Terminal</th>
                <th className="px-4 py-3 font-semibold">Active Shift</th>
                <th className="px-4 py-3 font-semibold">Held Orders</th>
                <th className="px-4 py-3 font-semibold">Total Orders</th>
                <th className="px-4 py-3 font-semibold">Total Scans</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.cashier} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                  <td className="px-4 py-3.5 font-medium">{r.cashier}</td>
                  <td className="px-4 py-3.5 font-semibold">{r.current}</td>
                  <td className="px-4 py-3.5 text-xs text-muted-foreground">{r.prev}</td>
                  <td className="px-4 py-3.5 text-xs">{r.shift}</td>
                  <td className="px-4 py-3.5 tabular-nums">{r.held}</td>
                  <td className="px-4 py-3.5 tabular-nums">{r.orders}</td>
                  <td className="px-4 py-3.5 tabular-nums">{r.scans}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3.5"><Button size="sm" variant="outline" className="gap-1.5"><ArrowLeftRight className="h-3.5 w-3.5" />Switch</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </PageShell>
  );
}