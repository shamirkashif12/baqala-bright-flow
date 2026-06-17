import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { DataTable, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Wrench, Monitor, WifiOff, AlertOctagon, Search, RefreshCw } from "lucide-react";
import { api, type DeviceRecord } from "@/lib/api";

export const Route = createFileRoute("/_app/maintenance")({ component: Maintenance });

const SYNC_CLASS: Record<string, string> = {
  synced: "bg-success/15 text-success border-success/30",
  pending: "bg-warning/20 text-warning-foreground border-warning/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  error: "bg-destructive/15 text-destructive border-destructive/30",
};

function Maintenance() {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const reload = () => {
    setLoading(true);
    api.getDevices().then(setDevices).finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  const filtered = devices.filter(d =>
    !q
    || d.deviceName.toLowerCase().includes(q.toLowerCase())
    || d.deviceType.toLowerCase().includes(q.toLowerCase())
    || d.branch?.name?.toLowerCase().includes(q.toLowerCase())
  );

  const online = devices.filter(d => d.status === "online").length;
  const offline = devices.filter(d => d.status !== "online").length;
  const syncIssues = devices.filter(d => d.syncStatus !== "synced").length;

  return (
    <PageShell
      title="Maintenance & Support"
      subtitle="Device health · sync status · service history"
      actions={
        <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5">
          <Wrench className="h-4 w-4" />New Ticket
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Devices" value={loading ? "—" : String(devices.length)} icon={Monitor} accent="primary" />
        <MetricCard label="Online" value={loading ? "—" : String(online)} icon={Wrench} accent="success" />
        <MetricCard label="Offline / Maintenance" value={loading ? "—" : String(offline)} icon={WifiOff} accent="warning" />
        <MetricCard label="Sync Issues" value={loading ? "—" : String(syncIssues)} icon={AlertOctagon} accent="destructive" />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search devices…" className="h-9 pl-8" />
        </div>
        <Button size="icon" variant="outline" className="h-9 w-9" onClick={reload}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : (
        <DataTable
          columns={[
            {
              key: "deviceName", label: "Device",
              render: d => (
                <div>
                  <p className="font-semibold">{d.deviceName}</p>
                  <p className="text-xs text-muted-foreground font-mono">{d.serialNumber ?? d.id.slice(0, 8)}</p>
                </div>
              ),
            },
            { key: "deviceType", label: "Type", render: d => <span className="text-xs">{d.deviceType}</span> },
            { key: "branch", label: "Branch", render: d => d.branch?.name ?? "—" },
            { key: "terminal", label: "Terminal", render: d => d.terminal?.terminalCode ?? "—" },
            { key: "status", label: "Status", render: d => <StatusBadge status={d.status} /> },
            {
              key: "syncStatus", label: "Sync",
              render: d => (
                <Badge variant="outline" className={`text-xs ${SYNC_CLASS[d.syncStatus] ?? "bg-muted text-muted-foreground border-border"}`}>
                  {d.syncStatus}
                </Badge>
              ),
            },
            {
              key: "lastActivity", label: "Last Active",
              render: d => d.lastActivity
                ? <span className="text-xs text-muted-foreground">{new Date(d.lastActivity).toLocaleString("en-SA")}</span>
                : <span className="text-xs text-muted-foreground">—</span>,
            },
          ]}
          rows={filtered}
        />
      )}
    </PageShell>
  );
}