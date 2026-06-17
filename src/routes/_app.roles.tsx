import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { RoleGate } from "@/components/role-gate";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Lock, Plus, Shield, UserCog, Trash2, Loader2, Users } from "lucide-react";
import { api, type Role, type RolePermission } from "@/lib/api";

export const Route = createFileRoute("/_app/roles")({
  component: () => (
    <RoleGate allow={["tenant_admin"]}>
      <Roles />
    </RoleGate>
  ),
});

const PERM_FLAGS = ["canView", "canCreate", "canEdit", "canDelete", "canApprove", "canExport"] as const;
type PermFlag = typeof PERM_FLAGS[number];

const PERM_LABELS: Record<PermFlag, string> = {
  canView: "View", canCreate: "Create", canEdit: "Edit",
  canDelete: "Delete", canApprove: "Approve", canExport: "Export",
};

const ALL_MODULES = [
  "Dashboard", "Orders", "Inventory", "Batches", "Warehouses",
  "Branches", "Users", "Cashier Shifts", "Terminals", "Suppliers",
  "Customers", "Finance", "Tax & Fees", "Returns", "Reports",
  "Compliance", "Audit Logs", "Devices", "Rules Engine", "Settings", "Roles",
];

type PermRow = Omit<RolePermission, "id" | "roleId">;

function buildPermRows(perms: RolePermission[]): PermRow[] {
  const map = new Map(perms.map(p => [p.module, p]));
  return ALL_MODULES.map(mod => map.get(mod) ?? {
    module: mod,
    canView: false, canCreate: false, canEdit: false,
    canDelete: false, canApprove: false, canExport: false,
  });
}

function Roles() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Role | null>(null);
  const [localPerms, setLocalPerms] = useState<PermRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadRoles = useCallback(async () => {
    const data = await api.getRoles();
    setRoles(data);
    return data;
  }, []);

  useEffect(() => {
    loadRoles()
      .then(data => { if (data.length > 0) setActive(data[0]); })
      .finally(() => setLoading(false));
  }, [loadRoles]);

  // Sync local permission state whenever active role changes
  useEffect(() => {
    if (active) {
      setLocalPerms(buildPermRows(active.permissions ?? []));
      setDirty(false);
    }
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectRole = (r: Role) => {
    setActive(r);
  };

  const togglePerm = (module: string, flag: PermFlag, value: boolean) => {
    setLocalPerms(prev => prev.map(p => p.module === module ? { ...p, [flag]: value } : p));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!active || !dirty) return;
    setSaving(true);
    try {
      await api.updateRole(active.id, { ...active, permissions: localPerms });
      const data = await loadRoles();
      const refreshed = data.find(r => r.id === active.id) ?? null;
      setActive(refreshed);
      setDirty(false);
    } catch (e) {
      console.error("Save failed", e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (roleId: string) => {
    if (!confirm("Delete this role? Users assigned to it must be reassigned.")) return;
    setDeleting(roleId);
    try {
      await api.deleteRole(roleId);
      const data = await loadRoles();
      if (active?.id === roleId) setActive(data[0] ?? null);
    } catch (e) {
      console.error("Delete failed", e);
    } finally {
      setDeleting(null);
    }
  };

  const handleCreateRole = async (name: string, description: string) => {
    const emptyPerms = ALL_MODULES.map(mod => ({
      module: mod,
      canView: false, canCreate: false, canEdit: false,
      canDelete: false, canApprove: false, canExport: false,
    }));
    await api.createRole({ name, description, permissions: emptyPerms });
    const data = await loadRoles();
    const created = data.find(r => r.name === name);
    if (created) setActive(created);
  };

  return (
    <PageShell title="Roles & Permissions" subtitle="Access control & permission matrix">
      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          {/* ── Role list ── */}
          <Card className="p-3 border-border/60 shadow-card h-fit">
            <div className="flex items-center justify-between mb-3 px-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />Roles
              </h3>
              <AddRoleDialog onCreated={handleCreateRole} />
            </div>
            <div className="space-y-1">
              {roles.map((r) => {
                const isActive = active?.id === r.id;
                return (
                  <div
                    key={r.id}
                    className={`flex items-center rounded-lg transition-colors ${isActive ? "bg-primary text-primary-foreground shadow-glow" : "hover:bg-muted/60"}`}
                  >
                    <button
                      onClick={() => selectRole(r)}
                      className="flex-1 text-left px-3 py-2 text-sm flex items-center justify-between gap-2 min-w-0"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <UserCog className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{r.name}</span>
                      </span>
                      <Badge
                        variant="outline"
                        className={`shrink-0 flex items-center gap-1 ${isActive ? "bg-white/20 text-primary-foreground border-white/30" : ""}`}
                      >
                        <Users className="h-2.5 w-2.5" />
                        {r.userCount ?? 0}
                      </Badge>
                    </button>
                    {!r.isSystem && (
                      <button
                        title="Delete role"
                        onClick={() => handleDelete(r.id)}
                        disabled={deleting === r.id}
                        className={`pr-2.5 transition-opacity ${isActive ? "text-primary-foreground/70 hover:text-primary-foreground" : "text-muted-foreground hover:text-destructive"}`}
                      >
                        {deleting === r.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* ── Permission matrix ── */}
          <Card className="border-border/60 shadow-card overflow-hidden">
            <div className="p-4 border-b border-border/60 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h3 className="font-semibold flex items-center gap-2 truncate">
                  <Lock className="h-4 w-4 text-primary shrink-0" />
                  {active?.name} Permissions
                </h3>
                <p className="text-xs text-muted-foreground">
                  {active?.isSystem
                    ? "System role — permissions editable, name protected"
                    : "Module-level access for this role"}
                </p>
              </div>
              <Button
                size="sm"
                className="gradient-primary text-primary-foreground border-0 shrink-0"
                onClick={handleSave}
                disabled={saving || !dirty}
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                {saving ? "Saving…" : "Save Changes"}
              </Button>
            </div>

            {localPerms.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                Select a role to view its permissions.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3 font-semibold w-48">Module</th>
                      {PERM_FLAGS.map(f => (
                        <th key={f} className="px-4 py-3 font-semibold text-center">{PERM_LABELS[f]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {localPerms.map((perm) => (
                      <tr key={perm.module} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3.5 font-medium">{perm.module}</td>
                        {PERM_FLAGS.map(flag => (
                          <td key={flag} className="px-4 py-3.5 text-center">
                            <Checkbox
                              checked={perm[flag]}
                              onCheckedChange={(v) => togglePerm(perm.module, flag, !!v)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
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

function AddRoleDialog({ onCreated }: { onCreated: (name: string, description: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onCreated(name.trim(), description.trim());
      setName("");
      setDescription("");
      setOpen(false);
    } catch (e) {
      console.error("Create role failed", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <Plus className="h-3.5 w-3.5" />Add
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create New Role</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label className="text-xs">Role Name *</Label>
            <Input
              placeholder="e.g. Shift Supervisor"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Input
              placeholder="What this role can do"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            All permissions will start as disabled. Configure them from the permission matrix after creating.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
          <Button
            className="gradient-primary text-primary-foreground border-0"
            onClick={handleCreate}
            disabled={loading || !name.trim()}
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            {loading ? "Creating…" : "Create Role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
