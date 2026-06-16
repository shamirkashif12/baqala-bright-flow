import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RoleGate } from "@/components/role-gate";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Lock, Plus, Shield, UserCog } from "lucide-react";
import { api, type Role } from "@/lib/api";

export const Route = createFileRoute("/_app/roles")({
  component: () => (
    <RoleGate allow={["owner"]}>
      <Roles />
    </RoleGate>
  ),
});

const permFlags = ["canView", "canCreate", "canEdit", "canDelete", "canApprove", "canExport"] as const;
const permLabels: Record<typeof permFlags[number], string> = {
  canView: "View", canCreate: "Create", canEdit: "Edit",
  canDelete: "Delete", canApprove: "Approve", canExport: "Export",
};

function Roles() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Role | null>(null);

  useEffect(() => {
    api.getRoles().then(data => {
      setRoles(data);
      if (data.length > 0) setActive(data[0]);
    }).finally(() => setLoading(false));
  }, []);

  const activePerms = active?.permissions ?? [];
  const modules = [...new Set(activePerms.map(p => p.module))];

  return (
    <PageShell title="Roles & Permissions" subtitle="Access control & permission matrix">
      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Card className="p-3 border-border/60 shadow-card h-fit">
            <div className="flex items-center justify-between mb-3 px-2">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Shield className="h-4 w-4 text-primary" />Roles</h3>
              <AddRoleDialog onCreated={() => api.getRoles().then(setRoles)} />
            </div>
            <div className="space-y-1">
              {roles.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setActive(r)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${active?.id === r.id ? "bg-primary text-primary-foreground shadow-glow" : "hover:bg-muted/60"}`}
                >
                  <span className="flex items-center gap-2"><UserCog className="h-3.5 w-3.5" />{r.name}</span>
                  <Badge variant="outline" className={active?.id === r.id ? "bg-white/20 text-primary-foreground border-white/30" : ""}>{r.permissions?.length ?? 0}</Badge>
                </button>
              ))}
            </div>
          </Card>

          <Card className="border-border/60 shadow-card overflow-hidden">
            <div className="p-4 border-b border-border/60 flex items-center justify-between">
              <div>
                <h3 className="font-semibold flex items-center gap-2"><Lock className="h-4 w-4 text-primary" />{active?.name} Permissions</h3>
                <p className="text-xs text-muted-foreground">Module-level access for this role</p>
              </div>
              <Button size="sm" className="gradient-primary text-primary-foreground border-0">Save</Button>
            </div>
            {modules.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No permissions configured for this role.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3 font-semibold">Module</th>
                      {permFlags.map(f => <th key={f} className="px-4 py-3 font-semibold">{permLabels[f]}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {modules.map((mod) => {
                      const perm = activePerms.find(p => p.module === mod);
                      return (
                        <tr key={mod} className="border-b last:border-0">
                          <td className="px-4 py-3.5 font-semibold align-top w-48">{mod}</td>
                          {permFlags.map(flag => (
                            <td key={flag} className="px-4 py-3.5">
                              <Checkbox defaultChecked={perm ? perm[flag] : false} />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </PageShell>
  );
}

function AddRoleDialog({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1"><Plus className="h-3.5 w-3.5" />Add</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Role</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label className="text-xs">Role Name</Label><Input placeholder="e.g. Shift Supervisor" /></div>
          <div className="space-y-1"><Label className="text-xs">Description</Label><Input placeholder="What this role can do" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="gradient-primary text-primary-foreground border-0" onClick={() => { setOpen(false); onCreated?.(); }}>Create Role</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
