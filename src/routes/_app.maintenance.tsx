import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Wrench, Clock, CheckCircle2, AlertOctagon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/maintenance")({ component: Maintenance });

const tickets = [
  { id: "TKT-2041", title: "Printer POS-03 jams every 4th print", category: "Device", branch: "Khobar", priority: "High", tech: "Yousef A.", sla: "2h left", status: "in progress" },
  { id: "TKT-2040", title: "Kiosk freezes after Arabic switch", category: "Kiosk", branch: "Olaya", priority: "Critical", tech: "Yousef A.", sla: "Breached", status: "critical" },
  { id: "TKT-2039", title: "STC Pay declined intermittently", category: "Payment", branch: "Jeddah", priority: "High", tech: "Sara Q.", sla: "5h left", status: "pending" },
  { id: "TKT-2038", title: "Stock count mismatch in dairy", category: "Inventory", branch: "Olaya", priority: "Medium", tech: "Ali G.", sla: "1d left", status: "in progress" },
  { id: "TKT-2037", title: "Receipt printer replaced", category: "Device", branch: "Madinah", priority: "Low", tech: "Yousef A.", sla: "Closed", status: "resolved" },
];

const prioColor: Record<string, string> = {
  Critical: "bg-destructive/15 text-destructive border-destructive/30",
  High: "bg-warning/20 text-warning-foreground border-warning/40",
  Medium: "bg-primary/10 text-primary border-primary/20",
  Low: "bg-muted text-muted-foreground border-border",
};

function Maintenance() {
  return (
    <PageShell title="Maintenance & Support" subtitle="Tickets · SLA · device service history">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Open Tickets" value="14" icon={Wrench} accent="primary" />
        <MetricCard label="In Progress" value="6" icon={Clock} accent="warning" />
        <MetricCard label="Resolved (7d)" value="22" icon={CheckCircle2} accent="success" />
        <MetricCard label="SLA Breached" value="1" icon={AlertOctagon} accent="destructive" />
      </div>
      <Toolbar placeholder="Search tickets…" primaryLabel="New Ticket" />
      <DataTable
        columns={[
          { key: "id", label: "Ticket", render: (r) => <span className="font-mono font-semibold">{r.id}</span> },
          { key: "title", label: "Issue" },
          { key: "category", label: "Category" },
          { key: "branch", label: "Branch" },
          { key: "priority", label: "Priority", render: (r) => <Badge variant="outline" className={prioColor[r.priority]}>{r.priority}</Badge> },
          { key: "tech", label: "Assigned" },
          { key: "sla", label: "SLA" },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rows={tickets}
      />
    </PageShell>
  );
}