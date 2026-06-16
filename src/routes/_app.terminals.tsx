import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Terminal as TerminalIcon, Activity, Power, CircleDollarSign } from "lucide-react";
import { api, type Terminal } from "@/lib/api";

export const Route = createFileRoute("/_app/terminals")({ component: Terminals });

function Terminals() {
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getTerminals()
      .then(setTerminals)
      .finally(() => setLoading(false));
  }, []);

  const online = terminals.filter(t => t.status === "active" || t.status === "session_open").length;
  const offline = terminals.filter(t => t.status === "offline").length;

  return (
    <PageShell title="Terminals" subtitle="POS devices across all branches">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Terminals" value={String(terminals.length)} icon={TerminalIcon} accent="primary" />
        <MetricCard label="Online" value={String(online)} icon={Activity} accent="success" />
        <MetricCard label="Offline" value={String(offline)} icon={Power} accent="destructive" />
        <MetricCard label="Sales Today" value="—" icon={CircleDollarSign} />
      </div>
      <Toolbar placeholder="Search terminal ID…" primaryLabel="Add Terminal" />
      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <DataTable
          columns={[
            { key: "terminalCode", label: "Terminal", render: (r: Terminal) => <span className="font-mono font-semibold">{r.terminalCode}</span> },
            { key: "name", label: "Name" },
            { key: "branch", label: "Branch", render: (r: Terminal) => r.branch?.name ?? "—" },
            { key: "cashier", label: "Assigned Cashier", render: (r: Terminal) => r.assignedCashier?.fullName ?? "—" },
            { key: "lastSync", label: "Last Sync", render: (r: Terminal) => r.lastSync ? new Date(r.lastSync).toLocaleString("en-SA") : "—" },
            { key: "status", label: "Status", render: (r: Terminal) => <StatusBadge status={r.status.replace(/_/g, " ")} /> },
          ]}
          rows={terminals}
        />
      )}
    </PageShell>
  );
}
