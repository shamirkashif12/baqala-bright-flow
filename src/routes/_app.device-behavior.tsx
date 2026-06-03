import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Activity, WifiOff, AlertTriangle, Wrench, Thermometer, Battery, Signal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_app/device-behavior")({ component: DeviceBehavior });

const alerts = [
  { device: "POS-03 · Khobar", alert: "Printer jam (4th this hour)", last: "2 min ago", branch: "Khobar", status: "critical" },
  { device: "KIOSK-01 · Olaya", alert: "App freeze after AR↔EN switch", last: "8 min ago", branch: "Olaya", status: "critical" },
  { device: "MOB-02 · Jeddah", alert: "Battery 18% · charge soon", last: "12 min ago", branch: "Jeddah", status: "pending" },
  { device: "SCAN-04 · Madinah", alert: "Slow read response (1.4s avg)", last: "23 min ago", branch: "Madinah", status: "pending" },
  { device: "CARD-02 · Olaya", alert: "Overheating warning 48°C", last: "31 min ago", branch: "Olaya", status: "pending" },
  { device: "POS-07 · Khobar", alert: "Heartbeat OK", last: "now", branch: "Khobar", status: "online" },
];

function DeviceBehavior() {
  return (
    <PageShell title="Device Behavior" subtitle="Live health & anomaly detection across the fleet">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active Devices" value="38" icon={Activity} accent="success" />
        <MetricCard label="Offline" value="3" icon={WifiOff} accent="destructive" />
        <MetricCard label="Warnings" value="6" icon={AlertTriangle} accent="warning" />
        <MetricCard label="Maintenance Required" value="2" icon={Wrench} accent="primary" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Network uptime", value: 99.4, icon: Signal },
          { label: "Average battery", value: 72, icon: Battery },
          { label: "Thermal headroom", value: 84, icon: Thermometer },
        ].map((s) => (
          <Card key={s.label} className="p-5 border-border/60 shadow-card">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{s.label}</p>
              <s.icon className="h-4 w-4 text-primary" />
            </div>
            <p className="text-3xl font-bold mt-2">{s.value}%</p>
            <Progress value={s.value} className="mt-3 h-2" />
          </Card>
        ))}
      </div>

      <Toolbar placeholder="Search devices, behavior alerts…" />
      <DataTable
        columns={[
          { key: "device", label: "Device", render: (r) => <span className="font-semibold">{r.device}</span> },
          { key: "alert", label: "Behavior Alert" },
          { key: "last", label: "Last Response" },
          { key: "branch", label: "Branch" },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rows={alerts}
      />
    </PageShell>
  );
}