import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RoleGate } from "@/components/role-gate";
import { PageShell } from "@/components/app-topbar";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Users, UserCheck, Clock, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { api, type User } from "@/lib/api";

export const Route = createFileRoute("/_app/staff")({
  component: () => (
    <RoleGate allow={["owner", "manager"]}>
      <Staff />
    </RoleGate>
  ),
});

const roleColors: Record<string, string> = {
  owner: "bg-primary text-primary-foreground",
  admin: "bg-primary text-primary-foreground",
  manager: "bg-primary/15 text-primary",
  cashier: "bg-success/15 text-success",
  "inventory staff": "bg-warning/20 text-warning-foreground",
  accountant: "bg-accent text-accent-foreground",
  maintenance: "bg-muted text-foreground",
};

function roleColor(roleName?: string): string {
  if (!roleName) return "bg-muted text-foreground";
  return roleColors[roleName.toLowerCase()] ?? "bg-muted text-foreground";
}

function Staff() {
  const [staff, setStaff] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getUsers()
      .then(setStaff)
      .finally(() => setLoading(false));
  }, []);

  const active = staff.filter(u => u.status === "active").length;
  const roles = new Set(staff.map(u => u.roleId)).size;

  return (
    <PageShell title="Staff & Roles" subtitle="People · permissions · shifts · attendance">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Staff" value={String(staff.length)} icon={Users} accent="primary" />
        <MetricCard label="Active" value={String(active)} icon={UserCheck} accent="success" />
        <MetricCard label="Inactive / Pending" value={String(staff.length - active)} icon={Clock} accent="warning" />
        <MetricCard label="Roles" value={String(roles)} icon={ShieldCheck} />
      </div>

      <Toolbar placeholder="Search staff by name or role…" primaryLabel="Invite Staff" />

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <DataTable
          columns={[
            { key: "fullName", label: "Member", render: (u: User) => (
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
                  {u.fullName.split(" ").map((n: string) => n[0]).slice(0, 2).join("")}
                </div>
                <div>
                  <p className="font-semibold text-sm">{u.fullName}</p>
                  <p className="text-xs text-muted-foreground">{u.branchName ?? "All branches"}</p>
                </div>
              </div>
            )},
            { key: "roleName", label: "Role", render: (u: User) => (
              <Badge className={`${roleColor(u.roleName)} border-0`}>{u.roleName ?? "—"}</Badge>
            )},
            { key: "email", label: "Email", render: (u: User) => <span className="text-xs">{u.email}</span> },
            { key: "lastLogin", label: "Last Login", render: (u: User) =>
              u.lastLogin ? new Date(u.lastLogin).toLocaleDateString("en-SA") : <span className="text-muted-foreground text-xs">Never</span>
            },
            { key: "status", label: "Status", render: (u: User) => <StatusBadge status={u.status} /> },
          ]}
          rows={staff}
        />
      )}
    </PageShell>
  );
}
