import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { HardDrive, Printer, Wifi, Cpu } from "lucide-react";
import { api, type DeviceRecord } from "@/lib/api";

export const Route = createFileRoute("/_app/devices")({ component: Devices });

function Devices() {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getDevices()
      .then(setDevices)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const total = devices.length;
  const healthy = devices.filter(d => d.status === "active").length;
  const maintenance = devices.filter(d => d.status === "maintenance" || d.status === "offline").length;
  const synced = devices.filter(d => d.syncStatus === "synced").length;

  return (
    <PageShell title="Devices" subtitle="Hardware fleet · health · sync status">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Devices" value={String(total)} icon={HardDrive} accent="primary" />
        <MetricCard label="Active" value={String(healthy)} delta={total > 0 ? `${Math.round(healthy / total * 100)}%` : "—"} trend="up" icon={Cpu} accent="success" />
        <MetricCard label="Maintenance / Offline" value={String(maintenance)} icon={Printer} accent="warning" />
        <MetricCard label="Network OK" value={`${synced} / ${total}`} icon={Wifi} />
      </div>
      <Toolbar placeholder="Search devices…" primaryLabel="Register Device" />
      {loading ? (
        <div className="text-muted-foreground text-sm py-6">Loading…</div>
      ) : (
        <DataTable
          columns={[
            { key: "deviceName", label: "Device Name", render: (r: DeviceRecord) => <span className="font-semibold">{r.deviceName}</span> },
            { key: "deviceType", label: "Type", render: (r: DeviceRecord) => r.deviceType.replace(/_/g, " ") },
            { key: "serialNumber", label: "Serial #", render: (r: DeviceRecord) => <span className="font-mono text-xs">{r.serialNumber ?? "—"}</span> },
            { key: "branch", label: "Branch", render: (r: DeviceRecord) => r.branch?.name ?? "—" },
            { key: "terminal", label: "Terminal", render: (r: DeviceRecord) => r.terminal?.terminalCode ?? "—" },
            { key: "syncStatus", label: "Sync", render: (r: DeviceRecord) => <StatusBadge status={r.syncStatus} /> },
            { key: "lastActivity", label: "Last Activity", render: (r: DeviceRecord) => r.lastActivity ? new Date(r.lastActivity).toLocaleString("en-SA", { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" }) : "—" },
            { key: "status", label: "Status", render: (r: DeviceRecord) => <StatusBadge status={r.status} /> },
          ]}
          rows={devices}
        />
      )}
    </PageShell>
  );
}
