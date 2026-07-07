import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { ModuleGate } from "@/components/role-gate";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Lock, Plus, Shield, UserCog, Trash2, Loader2, Users, ShieldCheck } from "lucide-react";
import { api, type Role, type RolePermission, type User } from "@/lib/api";

export const Route = createFileRoute("/_app/roles")({
  component: () => (
    <ModuleGate module="Roles">
      <Roles />
    </ModuleGate>
  ),
});

const PERM_FLAGS = ["canView", "canCreate", "canEdit", "canDelete", "canApprove", "canExport"] as const;
type PermFlag = typeof PERM_FLAGS[number];

const PERM_LABELS: Record<PermFlag, string> = {
  canView: "View", canCreate: "Create", canEdit: "Edit",
  canDelete: "Delete", canApprove: "Approve", canExport: "Export",
};

const ALL_MODULES = [
  "Dashboard",
  "POS", "Cashier Workspace", "Cashier Shifts",
  "Orders", "Coupons", "Customers", "Returns",
  "Inventory", "Stocks", "Batches",
  "Warehouses", "Stock Transfers",
  "Suppliers", "Purchase Orders", "Supplier Returns",
  "Accounting & Finance", "Tax & Fees",
  "Sales", "Control Tower", "Reports",
  "Branches", "Terminals", "Devices",
  "Users", "Roles",
  "Compliance", "Audit Logs", "Rules Engine", "Settings",
];

type PermRow = Omit<RolePermission, "id" | "roleId">;

// ── Recommended permissions per role name ─────────────────────────────────────
// Keys match the exact role names seeded in the database
type RecommendedEntry = { module: string; flags: PermFlag[] };
const RECOMMENDED: Record<string, RecommendedEntry[]> = {
  // Full system access
  "Admin": ALL_MODULES.map(m => ({ module: m, flags: [...PERM_FLAGS] })),

  // Branch-level full ops: orders, inventory, staff management, finance view
  "Manager": [
    { module: "Dashboard",           flags: ["canView", "canExport"] },
    { module: "POS",                 flags: ["canView", "canCreate", "canEdit", "canApprove"] },
    { module: "Cashier Workspace",   flags: ["canView", "canCreate", "canEdit", "canApprove"] },
    { module: "Cashier Shifts",      flags: ["canView", "canApprove", "canExport"] },
    { module: "Orders",              flags: ["canView", "canCreate", "canEdit", "canApprove", "canExport"] },
    { module: "Coupons",             flags: ["canView", "canCreate", "canEdit", "canDelete", "canApprove"] },
    { module: "Customers",           flags: ["canView", "canCreate", "canEdit"] },
    { module: "Returns",             flags: ["canView", "canApprove"] },
    { module: "Inventory",           flags: ["canView", "canCreate", "canEdit", "canDelete", "canExport"] },
    { module: "Stocks",              flags: ["canView", "canExport"] },
    { module: "Batches",             flags: ["canView", "canCreate", "canEdit", "canExport"] },
    { module: "Warehouses",          flags: ["canView", "canCreate", "canApprove"] },
    { module: "Stock Transfers",     flags: ["canView", "canCreate", "canEdit", "canApprove"] },
    { module: "Suppliers",           flags: ["canView", "canCreate", "canEdit", "canApprove"] },
    { module: "Purchase Orders",     flags: ["canView", "canCreate", "canEdit", "canApprove"] },
    { module: "Supplier Returns",    flags: ["canView", "canCreate", "canApprove"] },
    { module: "Accounting & Finance",flags: ["canView", "canExport"] },
    { module: "Tax & Fees",          flags: ["canView", "canEdit", "canApprove"] },
    { module: "Sales",               flags: ["canView", "canExport"] },
    { module: "Control Tower",       flags: ["canView"] },
    { module: "Reports",             flags: ["canView", "canExport"] },
    { module: "Branches",            flags: ["canView", "canEdit"] },
    { module: "Terminals",           flags: ["canView", "canCreate", "canEdit"] },
    { module: "Devices",             flags: ["canView", "canCreate", "canEdit"] },
    { module: "Users",               flags: ["canView", "canCreate", "canEdit"] },
    { module: "Roles",               flags: ["canView"] },
    { module: "Compliance",          flags: ["canView", "canExport"] },
    { module: "Audit Logs",          flags: ["canView"] },
    { module: "Rules Engine",        flags: ["canView"] },
    { module: "Settings",            flags: ["canView", "canEdit"] },
  ],

  // Cashier: POS-focused, customers, returns, own shift
  "Cashier": [
    { module: "Dashboard",         flags: ["canView"] },
    { module: "POS",               flags: ["canView", "canCreate", "canEdit"] },
    { module: "Cashier Workspace", flags: ["canView", "canCreate", "canEdit"] },
    { module: "Cashier Shifts",    flags: ["canView", "canCreate"] },
    { module: "Orders",            flags: ["canView", "canCreate", "canEdit"] },
    { module: "Coupons",           flags: ["canView"] },
    { module: "Customers",         flags: ["canView", "canCreate"] },
    { module: "Returns",           flags: ["canView", "canCreate"] },
    { module: "Stocks",            flags: ["canView"] },
  ],

  // Supervisor: manager-lite — shift oversight, approvals, no user/role management
  "Supervisor": [
    { module: "Dashboard",         flags: ["canView", "canExport"] },
    { module: "POS",               flags: ["canView", "canCreate", "canEdit", "canApprove"] },
    { module: "Cashier Workspace", flags: ["canView", "canCreate", "canEdit", "canApprove"] },
    { module: "Cashier Shifts",    flags: ["canView", "canApprove", "canExport"] },
    { module: "Orders",            flags: ["canView", "canCreate", "canEdit", "canApprove", "canExport"] },
    { module: "Coupons",           flags: ["canView", "canApprove"] },
    { module: "Customers",         flags: ["canView", "canCreate", "canEdit"] },
    { module: "Returns",           flags: ["canView", "canCreate", "canApprove"] },
    { module: "Inventory",         flags: ["canView", "canEdit"] },
    { module: "Stocks",            flags: ["canView", "canExport"] },
    { module: "Batches",           flags: ["canView"] },
    { module: "Stock Transfers",   flags: ["canView", "canApprove"] },
    { module: "Sales",             flags: ["canView", "canExport"] },
    { module: "Control Tower",     flags: ["canView"] },
    { module: "Reports",           flags: ["canView", "canExport"] },
  ],

  // Inventory Staff: full inventory + warehouse + stock transfers + receiving
  "Inventory Staff": [
    { module: "Dashboard",       flags: ["canView"] },
    { module: "Inventory",       flags: ["canView", "canCreate", "canEdit", "canDelete"] },
    { module: "Stocks",          flags: ["canView", "canCreate", "canEdit", "canDelete", "canExport"] },
    { module: "Batches",         flags: ["canView", "canCreate", "canEdit"] },
    { module: "Warehouses",      flags: ["canView", "canCreate", "canEdit"] },
    { module: "Stock Transfers", flags: ["canView", "canCreate", "canEdit", "canApprove"] },
    { module: "Suppliers",       flags: ["canView"] },
    { module: "Returns",         flags: ["canView"] },
    { module: "Reports",         flags: ["canView"] },
  ],

  // Accountant: accounting, payables, tax, reports — no ops
  "Accountant": [
    { module: "Dashboard",           flags: ["canView"] },
    { module: "Orders",              flags: ["canView", "canExport"] },
    { module: "Coupons",             flags: ["canView", "canExport"] },
    { module: "Stocks",              flags: ["canView"] },
    { module: "Stock Transfers",     flags: ["canView", "canExport"] },
    { module: "Accounting & Finance",flags: ["canView", "canCreate", "canEdit", "canExport"] },
    { module: "Tax & Fees",          flags: ["canView", "canEdit"] },
    { module: "Suppliers",           flags: ["canView"] },
    { module: "Purchase Orders",     flags: ["canView", "canExport"] },
    { module: "Supplier Returns",    flags: ["canView", "canExport"] },
    { module: "Sales",               flags: ["canView", "canExport"] },
    { module: "Control Tower",       flags: ["canView"] },
    { module: "Reports",             flags: ["canView", "canExport"] },
    { module: "Compliance",          flags: ["canView", "canExport"] },
    { module: "Cashier Shifts",      flags: ["canView", "canExport"] },
    { module: "Audit Logs",          flags: ["canView"] },
  ],

  // Auditor: view + export only across all financial and operational modules
  "Auditor": [
    { module: "Dashboard",           flags: ["canView"] },
    { module: "Orders",              flags: ["canView", "canExport"] },
    { module: "Coupons",             flags: ["canView"] },
    { module: "Inventory",           flags: ["canView", "canExport"] },
    { module: "Stocks",              flags: ["canView", "canExport"] },
    { module: "Stock Transfers",     flags: ["canView", "canExport"] },
    { module: "Accounting & Finance",flags: ["canView", "canExport"] },
    { module: "Purchase Orders",     flags: ["canView", "canExport"] },
    { module: "Supplier Returns",    flags: ["canView", "canExport"] },
    { module: "Sales",               flags: ["canView", "canExport"] },
    { module: "Control Tower",       flags: ["canView"] },
    { module: "Audit Logs",          flags: ["canView", "canExport"] },
    { module: "Reports",             flags: ["canView", "canExport"] },
    { module: "Compliance",          flags: ["canView", "canExport"] },
    { module: "Customers",           flags: ["canView"] },
    { module: "Cashier Shifts",      flags: ["canView", "canExport"] },
  ],

  // Warehouse Staff: warehouse picking, stock movement, receiving
  "Warehouse Staff": [
    { module: "Dashboard",       flags: ["canView"] },
    { module: "Warehouses",      flags: ["canView", "canCreate", "canEdit"] },
    { module: "Stock Transfers", flags: ["canView", "canCreate", "canEdit"] },
    { module: "Stocks",          flags: ["canView"] },
    { module: "Inventory",       flags: ["canView"] },
    { module: "Batches",         flags: ["canView"] },
    { module: "Suppliers",       flags: ["canView"] },
  ],

  // kept for backwards compat
  "Marketing User": [
    { module: "Dashboard",  flags: ["canView"] },
    { module: "Orders",     flags: ["canView", "canExport"] },
    { module: "Coupons",    flags: ["canView", "canCreate", "canEdit", "canExport"] },
    { module: "Customers",  flags: ["canView", "canCreate", "canEdit", "canExport"] },
    { module: "Sales",      flags: ["canView", "canExport"] },
    { module: "Reports",    flags: ["canView", "canExport"] },
    { module: "Inventory",  flags: ["canView"] },
  ],

  // Picker: order fulfillment — picks from warehouse, view-only on warehouses, no RTS
  "Picker": [
    { module: "Dashboard",       flags: ["canView"] },
    { module: "Warehouses",      flags: ["canView"] },
    { module: "Stock Transfers", flags: ["canView", "canCreate"] },
    { module: "Stocks",          flags: ["canView"] },
    { module: "Inventory",       flags: ["canView"] },
    { module: "Batches",         flags: ["canView"] },
  ],

  // Storekeeper: inventory ops — warehouse management, stock transfers, receive POs
  "Storekeeper": [
    { module: "Dashboard",       flags: ["canView"] },
    { module: "Inventory",       flags: ["canView", "canCreate", "canEdit"] },
    { module: "Stocks",          flags: ["canView", "canCreate", "canEdit", "canExport"] },
    { module: "Batches",         flags: ["canView", "canCreate", "canEdit"] },
    { module: "Warehouses",      flags: ["canView", "canEdit"] },
    { module: "Stock Transfers", flags: ["canView", "canCreate", "canEdit", "canApprove"] },
    { module: "Suppliers",       flags: ["canView"] },
    { module: "Purchase Orders", flags: ["canView", "canCreate", "canEdit"] },
    { module: "Supplier Returns",flags: ["canView", "canCreate"] },
    { module: "Returns",         flags: ["canView"] },
    { module: "Reports",         flags: ["canView"] },
  ],

  // Finance User: accounting, payables, tax, reports — no ops
  "Finance User": [
    { module: "Dashboard",            flags: ["canView"] },
    { module: "Orders",               flags: ["canView", "canExport"] },
    { module: "Coupons",              flags: ["canView", "canExport"] },
    { module: "Stocks",               flags: ["canView"] },
    { module: "Stock Transfers",      flags: ["canView", "canExport"] },
    { module: "Accounting & Finance", flags: ["canView", "canCreate", "canEdit", "canExport"] },
    { module: "Tax & Fees",           flags: ["canView", "canEdit"] },
    { module: "Suppliers",            flags: ["canView"] },
    { module: "Purchase Orders",      flags: ["canView", "canExport"] },
    { module: "Supplier Returns",     flags: ["canView", "canExport"] },
    { module: "Sales",                flags: ["canView", "canExport"] },
    { module: "Control Tower",        flags: ["canView"] },
    { module: "Reports",              flags: ["canView", "canExport"] },
    { module: "Cashier Shifts",       flags: ["canView", "canExport"] },
  ],

  // Branch Admin: full branch operations — orders, inventory, staff, finance view, no system admin
  "Branch Admin": [
    { module: "Dashboard",           flags: ["canView", "canExport"] },
    { module: "POS",                 flags: ["canView", "canCreate", "canEdit", "canApprove"] },
    { module: "Cashier Workspace",   flags: ["canView", "canCreate", "canEdit", "canApprove"] },
    { module: "Cashier Shifts",      flags: ["canView", "canCreate", "canApprove", "canExport"] },
    { module: "Orders",              flags: ["canView", "canCreate", "canEdit", "canApprove", "canExport"] },
    { module: "Coupons",             flags: ["canView", "canCreate", "canEdit", "canDelete", "canApprove"] },
    { module: "Customers",           flags: ["canView", "canCreate", "canEdit", "canExport"] },
    { module: "Returns",             flags: ["canView", "canCreate", "canApprove"] },
    { module: "Inventory",           flags: ["canView", "canCreate", "canEdit", "canDelete", "canExport"] },
    { module: "Stocks",              flags: ["canView", "canCreate", "canEdit", "canExport"] },
    { module: "Batches",             flags: ["canView", "canCreate", "canEdit", "canExport"] },
    { module: "Warehouses",          flags: ["canView", "canCreate", "canApprove"] },
    { module: "Stock Transfers",     flags: ["canView", "canCreate", "canEdit", "canApprove"] },
    { module: "Suppliers",           flags: ["canView", "canCreate", "canEdit"] },
    { module: "Purchase Orders",     flags: ["canView", "canCreate", "canEdit", "canApprove", "canExport"] },
    { module: "Supplier Returns",    flags: ["canView", "canCreate", "canApprove"] },
    { module: "Accounting & Finance",flags: ["canView", "canExport"] },
    { module: "Tax & Fees",          flags: ["canView", "canEdit"] },
    { module: "Sales",               flags: ["canView", "canExport"] },
    { module: "Control Tower",       flags: ["canView"] },
    { module: "Reports",             flags: ["canView", "canExport"] },
    { module: "Branches",            flags: ["canView", "canEdit"] },
    { module: "Terminals",           flags: ["canView", "canCreate", "canEdit"] },
    { module: "Devices",             flags: ["canView", "canCreate", "canEdit"] },
    { module: "Users",               flags: ["canView", "canCreate", "canEdit"] },
    { module: "Roles",               flags: ["canView"] },
    { module: "Compliance",          flags: ["canView", "canExport"] },
    { module: "Audit Logs",          flags: ["canView"] },
    { module: "Settings",            flags: ["canView", "canEdit"] },
  ],

  // Warehouse Admin: full warehouse control — stock, transfers, purchase orders, supplier management
  "Warehouse Admin": [
    { module: "Dashboard",           flags: ["canView"] },
    { module: "Inventory",           flags: ["canView", "canCreate", "canEdit", "canDelete", "canExport"] },
    { module: "Stocks",              flags: ["canView", "canCreate", "canEdit", "canDelete", "canExport"] },
    { module: "Batches",             flags: ["canView", "canCreate", "canEdit", "canDelete", "canExport"] },
    { module: "Warehouses",          flags: ["canView", "canCreate", "canEdit", "canDelete", "canApprove", "canExport"] },
    { module: "Stock Transfers",     flags: ["canView", "canCreate", "canEdit", "canDelete", "canApprove", "canExport"] },
    { module: "Suppliers",           flags: ["canView", "canCreate", "canEdit", "canApprove"] },
    { module: "Purchase Orders",     flags: ["canView", "canCreate", "canEdit", "canApprove", "canExport"] },
    { module: "Supplier Returns",    flags: ["canView", "canCreate", "canEdit", "canApprove"] },
    { module: "Accounting & Finance",flags: ["canView", "canExport"] },
    { module: "Reports",             flags: ["canView", "canExport"] },
    { module: "Audit Logs",          flags: ["canView"] },
    { module: "Users",               flags: ["canView"] },
  ],
};

function buildPermRows(perms: RolePermission[]): PermRow[] {
  const map = new Map(perms.map(p => [p.module, p]));
  return ALL_MODULES.map(mod => map.get(mod) ?? {
    module: mod, canView: false, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false,
  });
}

// ── localStorage helpers for per-user permission overrides ────────────────────
const USER_PERM_KEY = (uid: string) => `baqala_user_perms_${uid}`;

function loadUserOverrides(uid: string, rolePerms: PermRow[]): PermRow[] {
  try {
    const raw = localStorage.getItem(USER_PERM_KEY(uid));
    if (!raw) return rolePerms;
    const overrides = JSON.parse(raw) as Record<string, Partial<PermRow>>;
    return rolePerms.map(p => ({ ...p, ...(overrides[p.module] ?? {}) }));
  } catch { return rolePerms; }
}

function saveUserOverrides(uid: string, perms: PermRow[]) {
  const map: Record<string, Partial<PermRow>> = {};
  for (const p of perms) map[p.module] = p;
  localStorage.setItem(USER_PERM_KEY(uid), JSON.stringify(map));
}

function hasUserOverride(uid: string): boolean {
  return !!localStorage.getItem(USER_PERM_KEY(uid));
}

// ── Permission matrix (shared by role defaults + user override dialog) ─────────
function PermMatrix({ perms, onChange }: { perms: PermRow[]; onChange: (mod: string, flag: PermFlag, val: boolean) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/40 border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-3 font-semibold w-44">Module</th>
            {PERM_FLAGS.map(f => <th key={f} className="px-3 py-3 font-semibold text-center">{PERM_LABELS[f]}</th>)}
          </tr>
        </thead>
        <tbody>
          {perms.map(p => (
            <tr key={p.module} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
              <td className="px-4 py-3 font-medium text-sm">{p.module}</td>
              {PERM_FLAGS.map(flag => (
                <td key={flag} className="px-3 py-3 text-center">
                  <Checkbox checked={p[flag]} onCheckedChange={v => onChange(p.module, flag, !!v)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Per-user permission override dialog ───────────────────────────────────────
function UserPermDialog({ user, rolePerms, onClose }: { user: User; rolePerms: PermRow[]; onClose: () => void }) {
  const [perms, setPerms] = useState<PermRow[]>(() => loadUserOverrides(user.id, rolePerms));
  const [saving, setSaving] = useState(false);

  const toggle = (mod: string, flag: PermFlag, val: boolean) =>
    setPerms(prev => prev.map(p => p.module === mod ? { ...p, [flag]: val } : p));

  const handleSave = () => {
    setSaving(true);
    saveUserOverrides(user.id, perms);
    setSaving(false);
    onClose();
  };

  const handleReset = () => setPerms(rolePerms);

  const initials = (name: string) => name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Custom Permissions — {user.fullName}
        </DialogTitle>
        <div className="flex items-center gap-2 mt-1">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs gradient-primary text-primary-foreground">{initials(user.fullName)}</AvatarFallback>
          </Avatar>
          <span className="text-xs text-muted-foreground">{user.roleName} · {user.branchName ?? "All branches"} · {user.email}</span>
        </div>
      </DialogHeader>
      <p className="text-xs text-muted-foreground px-1 -mt-1">
        These override the role defaults for this user only. Saved to the browser — affects their sidebar on next login.
      </p>
      <PermMatrix perms={perms} onChange={toggle} />
      <DialogFooter className="gap-2 mt-2">
        <Button variant="outline" size="sm" onClick={handleReset}>Reset to Role Defaults</Button>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button className="gradient-primary text-primary-foreground border-0" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Permissions"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ── Main Roles component ───────────────────────────────────────────────────────
function Roles() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<Role | null>(null);
  const [localPerms, setLocalPerms] = useState<PermRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [permUser, setPermUser] = useState<User | null>(null);

  const loadAll = useCallback(async () => {
    const [data, usersData] = await Promise.all([api.getRoles(), api.getUsers()]);
    setRoles(data);
    setUsers(usersData);
    return data;
  }, []);

  useEffect(() => {
    loadAll()
      .then(data => { if (data.length > 0) setActive(data[0]); })
      .finally(() => setLoading(false));
  }, [loadAll]);

  useEffect(() => {
    if (active) { setLocalPerms(buildPermRows(active.permissions ?? [])); setDirty(false); }
  }, [active?.id]); // eslint-disable-line

  const togglePerm = (module: string, flag: PermFlag, value: boolean) => {
    setLocalPerms(prev => prev.map(p => p.module === module ? { ...p, [flag]: value } : p));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!active || !dirty) return;
    setSaving(true);
    try {
      await api.updateRole(active.id, { ...active, permissions: localPerms });
      const data = await loadAll();
      setActive(data.find(r => r.id === active.id) ?? null);
      setDirty(false);
    } catch (e) { console.error("Save failed", e); }
    finally { setSaving(false); }
  };

  const handleDelete = async (roleId: string) => {
    if (!confirm("Delete this role? Users assigned to it must be reassigned.")) return;
    setDeleting(roleId);
    try {
      await api.deleteRole(roleId);
      const data = await loadAll();
      if (active?.id === roleId) setActive(data[0] ?? null);
    } catch (e) { console.error("Delete failed", e); }
    finally { setDeleting(null); }
  };

  const handleCreateRole = async (name: string, description: string) => {
    const emptyPerms = ALL_MODULES.map(mod => ({ module: mod, canView: false, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false }));
    await api.createRole({ name, description, permissions: emptyPerms });
    const data = await loadAll();
    const created = data.find(r => r.name === name);
    if (created) setActive(created);
  };

  const roleMembers = users.filter(u => u.roleId === active?.id);
  const initials = (name: string) => name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <PageShell title="Roles & Permissions" subtitle="Access control · permission matrix · custom roles">
      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          {/* Role list */}
          <Card className="p-3 border-border/60 shadow-card h-fit">
            <div className="flex items-center justify-between mb-3 px-2">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Shield className="h-4 w-4 text-primary" />Roles</h3>
              <AddRoleDialog onCreated={handleCreateRole} />
            </div>
            <div className="space-y-1">
              {roles.map((r) => {
                const isActive = active?.id === r.id;
                return (
                  <div key={r.id} className={`flex items-center rounded-lg transition-colors ${isActive ? "bg-primary text-primary-foreground shadow-glow" : "hover:bg-muted/60"}`}>
                    <button onClick={() => setActive(r)} className="flex-1 text-left px-3 py-2 text-sm flex items-center justify-between gap-2 min-w-0">
                      <span className="flex items-center gap-2 min-w-0">
                        <UserCog className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{r.name}</span>
                      </span>
                      <Badge variant="outline" className={`shrink-0 flex items-center gap-1 text-[10px] ${isActive ? "bg-white/20 text-primary-foreground border-white/30" : ""}`}>
                        <Users className="h-2.5 w-2.5" />{r.userCount ?? 0}
                      </Badge>
                    </button>
                    {!r.isSystem && (
                      <button title="Delete role" onClick={() => handleDelete(r.id)} disabled={deleting === r.id}
                        className={`pr-2.5 transition-opacity ${isActive ? "text-primary-foreground/70 hover:text-primary-foreground" : "text-muted-foreground hover:text-destructive"}`}>
                        {deleting === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Right panel */}
          <Card className="border-border/60 shadow-card overflow-hidden">
            {!active ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Select a role.</div>
            ) : (
              <Tabs defaultValue="permissions">
                <div className="px-4 pt-4 border-b border-border/60">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <h3 className="font-semibold flex items-center gap-2">
                        <Lock className="h-4 w-4 text-primary" />{active.name}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {active.isSystem ? "System role — permissions editable, name protected" : "Custom role"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button size="sm" className="gradient-primary text-primary-foreground border-0 h-8" onClick={handleSave} disabled={saving || !dirty}>
                        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                        {saving ? "Saving…" : "Save Changes"}
                      </Button>
                    </div>
                  </div>
                  <TabsList className="h-8">
                    <TabsTrigger value="permissions" className="text-xs h-7">Role Permissions</TabsTrigger>
                    <TabsTrigger value="members" className="text-xs h-7">
                      Members ({roleMembers.length})
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Role-level permission matrix */}
                <TabsContent value="permissions" className="mt-0">
                  {localPerms.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">No permissions configured.</div>
                  ) : (
                    <PermMatrix perms={localPerms} onChange={togglePerm} />
                  )}
                </TabsContent>

                {/* Members tab */}
                <TabsContent value="members" className="mt-0 p-4">
                  {roleMembers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No users assigned to this role.</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground mb-3">
                        Individual overrides are stored in-browser and layered on top of the role defaults. Users without overrides inherit the role permissions above.
                      </p>
                      {roleMembers.map(u => (
                        <div key={u.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/60 hover:bg-muted/30 transition-colors">
                          <Avatar className="h-9 w-9 shrink-0">
                            <AvatarFallback className="text-xs gradient-primary text-primary-foreground">{initials(u.fullName)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{u.fullName}</p>
                            <p className="text-xs text-muted-foreground truncate">{u.email} · {u.branchName ?? "All branches"}</p>
                          </div>
                          {hasUserOverride(u.id) && (
                            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 bg-amber-50 shrink-0">Custom</Badge>
                          )}
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0" onClick={() => setPermUser(u)}>
                                <ShieldCheck className="h-3 w-3" /> Customize
                              </Button>
                            </DialogTrigger>
                            {permUser?.id === u.id && (
                              <UserPermDialog user={u} rolePerms={localPerms} onClose={() => setPermUser(null)} />
                            )}
                          </Dialog>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
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
      setName(""); setDescription(""); setOpen(false);
    } catch (e) { console.error("Create role failed", e); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1"><Plus className="h-3.5 w-3.5" />Add</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create New Role</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label className="text-xs">Role Name *</Label>
            <Input placeholder="e.g. Shift Supervisor" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleCreate(); }} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Input placeholder="What this role can do" value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">All permissions start disabled. Use "Apply Recommended" after creating if a preset matches.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
          <Button className="gradient-primary text-primary-foreground border-0" onClick={handleCreate} disabled={loading || !name.trim()}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
            {loading ? "Creating…" : "Create Role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
