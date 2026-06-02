import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Terminal as TerminalIcon, Activity, Power, CircleDollarSign } from "lucide-react";

export const Route = createFileRoute("/_app/terminals")({ component: Terminals });

const terminals = [
  { id: "POS-01", branch: "Olaya", cashier: "Fahad Al Otaibi", last: "2 min ago", sales: "ر.س 6,420", drawer: "Open", printer: "OK", status: "online" },
  { id: "POS-02", branch: "Olaya", cashier: "Mona Al Saud", last: "5 min ago", sales: "ر.س 4,180", drawer: "Open", printer: "OK", status: "online" },
  { id: "POS-03", branch: "Khobar", cashier: "Ali Al Ghamdi", last: "12 min ago", sales: "ر.س 3,920", drawer: "Closed", printer: "Low paper", status: "syncing" },
  { id: "POS-04", branch: "Jeddah", cashier: "—", last: "2 hr ago", sales: "ر.س 0", drawer: "Closed", printer: "—", status: "offline" },
  { id: "POS-05", branch: "Madinah", cashier: "Yousef Al Dossari", last: "Just now", sales: "ر.س 1,820", drawer: "Open", printer: "OK", status: "online" },
  { id: "KIOSK-01", branch: "Olaya", cashier: "Self-service", last: "1 min ago", sales: "ر.س 2,140", drawer: "—", printer: "OK", status: "online" },
];

function Terminals() {
  return (
    <PageShell title="Terminals" subtitle="POS devices across all branches">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Terminals" value="12" icon={TerminalIcon} accent="primary" />
        <MetricCard label="Online" value="11" icon={Activity} accent="success" />
        <MetricCard label="Offline" value="1" icon={Power} accent="destructive" />
        <MetricCard label="Sales Today" value="ر.س 48,920" icon={CircleDollarSign} />
      </div>
      <Toolbar placeholder="Search terminal ID…" primaryLabel="Add Terminal" />
      <DataTable
        columns={[
          { key: "id", label: "Terminal", render: (r) => <span className="font-mono font-semibold">{r.id}</span> },
          { key: "branch", label: "Branch" },
          { key: "cashier", label: "Cashier" },
          { key: "last", label: "Last activity" },
          { key: "sales", label: "Sales today" },
          { key: "drawer", label: "Drawer" },
          { key: "printer", label: "Printer" },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rows={terminals}
      />
    </PageShell>
  );
}