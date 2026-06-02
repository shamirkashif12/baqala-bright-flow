import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Users, UserCheck, Clock, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/staff")({ component: Staff });

const staff = [
  { name: "Abdullah Al Faisal", role: "Owner", branch: "All", shift: "—", attendance: "—", access: "Full", status: "active" },
  { name: "Khalid Al Shehri", role: "Branch Manager", branch: "Khobar", shift: "06:00 — 14:00", attendance: "On time", access: "Branch admin", status: "active" },
  { name: "Fahad Al Otaibi", role: "Cashier", branch: "Olaya", shift: "08:00 — 16:00", attendance: "On shift", access: "POS only", status: "active" },
  { name: "Mona Al Saud", role: "Cashier", branch: "Olaya", shift: "16:00 — 00:00", attendance: "Upcoming", access: "POS only", status: "pending" },
  { name: "Ali Al Ghamdi", role: "Inventory Staff", branch: "Khobar", shift: "07:00 — 15:00", attendance: "On shift", access: "Inventory", status: "active" },
  { name: "Sara Al Qahtani", role: "Accountant", branch: "All", shift: "09:00 — 17:00", attendance: "On shift", access: "Finance", status: "active" },
  { name: "Yousef Al Dossari", role: "Maintenance", branch: "All", shift: "On-call", attendance: "Available", access: "Devices", status: "active" },
];

const roleColor: Record<string, string> = {
  "Owner": "bg-primary text-primary-foreground",
  "Branch Manager": "bg-primary/15 text-primary",
  "Cashier": "bg-success/15 text-success",
  "Inventory Staff": "bg-warning/20 text-warning-foreground",
  "Accountant": "bg-accent text-accent-foreground",
  "Maintenance": "bg-muted text-foreground",
};

function Staff() {
  return (
    <PageShell title="Staff & Roles" subtitle="People · permissions · shifts · attendance">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Staff" value="34" icon={Users} accent="primary" />
        <MetricCard label="On Shift Now" value="18" icon={UserCheck} accent="success" />
        <MetricCard label="Shift Closing" value="3" hint="next hour" icon={Clock} accent="warning" />
        <MetricCard label="Roles" value="7" icon={ShieldCheck} />
      </div>
      <Toolbar placeholder="Search staff by name or role…" primaryLabel="Invite Staff" />
      <DataTable
        columns={[
          { key: "name", label: "Member", render: (r) => (
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold">{r.name.split(" ").map((n: string)=>n[0]).slice(0,2).join("")}</div>
              <div><p className="font-semibold text-sm">{r.name}</p><p className="text-xs text-muted-foreground">{r.branch}</p></div>
            </div>
          )},
          { key: "role", label: "Role", render: (r) => <Badge className={`${roleColor[r.role]} border-0`}>{r.role}</Badge> },
          { key: "shift", label: "Shift" },
          { key: "attendance", label: "Attendance" },
          { key: "access", label: "Access" },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rows={staff}
      />
    </PageShell>
  );
}