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
import { api, type Role, type RolePermission } from "@/lib/api";

export const Route = createFileRoute("/_app/roles")({
  component: () => (
    <RoleGate allow={["owner"]}>
      <Roles />
    </RoleGate>
  ),
});

const permFlags = ["canView", "canCreate", "canEdit", "canDelete", "canApprove", "canExport"] as const;
type PermFlag = typeof permFlags[number];
const permLabels: Record<PermFlag, string> = {
  canView: "View", canCreate: "Create", canEdit: "Edit",
  canDelete: "Delete", canApprove: "Approve", canExport: "Export",
};

function Roles() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState<Role | null>(null);
  const [permMap, setPermMap] = useState<Map<string, RolePermission>>(new Map());

  const loadRoles = () =>
    api.getRoles().then(data => {
      setRoles(data);
      if (data.length > 0) selectRole(data[0]);
    }).finally(() => setLoading(false));

  useEffect(() => { loadRoles(); }, []);

  const selectRole = (role: Role) => {
    setActive(role);
    const map = new Map<string, RolePermission>();
    (role.permissions ?? []).forEach(p => map.set(p.module, { ...p }));
    setPermMap(map);
  };

  const togglePerm = (module: string, flag: PermFlag, value: boolean) => {
    setPermMap(prev => {
      const next = new Map(prev);
      const existing = next.get(module);
      if (existing) {
        next.set(module, { ...existing, [flag]: value });
      }
      return next;
    });
  };

  const handleSave = async () => {
    if (!active) return;
    setSaving(true);
    try {
      const permissions = Array.from(permMap.values());
      await api.updateRole(active.id, { ...active, permissions });
      const updated = await api.getRoles();
      setRoles(updated);
      const refreshed = updated.find(r => r.id === active.id);
      if (refreshed) selectRole(refreshed);
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const modules = Array.from(permMap.keys());

  return (
    <PageShell title="Roles & Permissions" subtitle="Access control & permission matrix">
      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Card className="p-3 border-border/60 shadow-card h-fit">
            <div className="flex items-center justify-between mb-3 px-2">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Shield className="h-4 w-4 text-primary" />Roles</h3>
              <AddRoleDialog onCreated={() => {
                api.getRoles().then(data => {
                  setRoles(data);
                  const newest = data[data.length - 1];
                  if (newest) selectRole(newest);
                });
              }} />
            </div>
            <div className="space-y-1">
              {roles.map((r) => (
                <button
                  key={r.id}
                  onClick={() => selectRole(r)}
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
              <Button
                size="sm"
                className="gradient-primary text-primary-foreground border-0"
                onClick={handleSave}
                disabled={saving || active?.isSystem}
                title={active?.isSystem ? "System roles cannot be modified" : undefined}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
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
                      const perm = permMap.get(mod);
                      return (
                        <tr key={mod} className="border-b last:border-0">
                          <td className="px-4 py-3.5 font-semibold align-top w-48">{mod}</td>
                          {permFlags.map(flag => (
                            <td key={flag} className="px-4 py-3.5">
                              <Checkbox
                                checked={perm ? perm[flag] : false}
                                disabled={active?.isSystem}
                                onCheckedChange={v => togglePerm(mod, flag, Boolean(v))}
                              />
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
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) { setError("Role name is required."); return; }
    setSaving(true);
    setError(null);
    try {
      await api.createRole({ name: name.trim(), description: description.trim() || undefined, permissions: [] });
      setOpen(false);
      setName("");
      setDescription("");
      onCreated?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create role.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setName(""); setDescription(""); setError(null); } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1"><Plus className="h-3.5 w-3.5" />Add</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Role</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Role Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Shift Supervisor" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="What this role can do" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="gradient-primary text-primary-foreground border-0" onClick={handleCreate} disabled={saving}>
            {saving ? "Creating…" : "Create Role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
