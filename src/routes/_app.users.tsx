import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { ModuleGate } from "@/components/role-gate";
import { PageShell } from "@/components/app-topbar";
import { StatusBadge } from "@/components/module-placeholder";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Phone, Pencil, ShieldCheck, Power, Plus, Search, Calendar, X } from "lucide-react";
import { api, type User, type Branch, type Role } from "@/lib/api";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { canManageUser } from "@/lib/role-hierarchy";

export const Route = createFileRoute("/_app/users")({
  component: () => (
    <ModuleGate module="Users">
      <RegisteredUsers />
    </ModuleGate>
  ),
});

type UserForm = { fullName: string; email: string; username: string; password: string; roleId: string; branchId: string; status: string; };
const emptyForm: UserForm = { fullName: "", email: "", username: "", password: "", roleId: "", branchId: "", status: "active" };

function RegisteredUsers() {
  const { canCreate, canEdit } = usePermission("Users");
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Filters
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = () => {
    setLoading(true);
    // .catch() per call so one failing endpoint doesn't wipe out the others' data —
    // Promise.all otherwise rejects the whole batch and skips every setState below.
    Promise.all([
      api.getUsers().catch(() => []),
      api.getBranches().catch(() => []),
      api.getRoles().catch(() => []),
    ])
      .then(([u, b, r]) => { setUsers(u); setBranches(b); setRoles(r); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => users.filter(u => {
    const matchQ = !q || u.fullName.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase()) || (u.username ?? "").toLowerCase().includes(q.toLowerCase());
    const matchRole = roleFilter === "all" || u.roleId === roleFilter;
    const matchStatus = statusFilter === "all" || u.status === statusFilter;
    const matchBranch = branchFilter === "all" || (u.branchId ?? "all") === branchFilter;
    const mdf = !dateFrom || (!!u.createdAt && u.createdAt >= dateFrom);
    const mdt = !dateTo || (!!u.createdAt && u.createdAt <= dateTo + "T23:59:59");
    return matchQ && matchRole && matchStatus && matchBranch && mdf && mdt;
  }), [users, q, roleFilter, statusFilter, branchFilter, dateFrom, dateTo]);

  const openCreate = () => { setEditUser(null); setForm(emptyForm); setDlgOpen(true); };
  const openEdit = (u: User) => {
    setEditUser(u);
    setForm({ fullName: u.fullName, email: u.email, username: u.username, password: "", roleId: u.roleId, branchId: u.branchId ?? "", status: u.status });
    setDlgOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const branchId = form.branchId || undefined;
      if (editUser) {
        await api.updateUser(editUser.id, { fullName: form.fullName, email: form.email, username: form.username, roleId: form.roleId, branchId, status: form.status });
      } else {
        await api.createUser({ fullName: form.fullName, email: form.email, username: form.username, password: form.password, roleId: form.roleId, branchId });
      }
      setDlgOpen(false);
      load();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (u: User) => {
    await api.updateUser(u.id, { status: u.status === "active" ? "inactive" : "active" });
    load();
  };

  const set = (k: keyof UserForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));
  const setS = (k: keyof UserForm) => (v: string) =>
    setForm(p => ({ ...p, [k]: v }));

  const isTenantAdminRole = roles.find(r => r.id === form.roleId)?.name === "Admin";

  const initials = (name: string) => name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
  const avatarColor = (name: string) => {
    const colors = ["from-violet-500 to-purple-600", "from-blue-500 to-cyan-600", "from-emerald-500 to-teal-600", "from-orange-500 to-amber-600", "from-rose-500 to-pink-600"];
    return colors[name.charCodeAt(0) % colors.length];
  };

  return (
    <PageShell title="Registered Users" subtitle="Owners · managers · cashiers · technicians">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, email, username…" className="h-9 pl-8" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="All Roles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-[130px]"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="All Branches" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Created:</span>
          <Input type="date" className="h-9 w-36" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" className="h-9 w-36" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" onClick={() => { setDateFrom(""); setDateTo(""); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="flex-1" />
        {canCreate && (
          <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add User
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground mb-4">{filtered.length} of {users.length} users</p>

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((u) => (
            <Card key={u.id} className="p-5 border-border/60 shadow-card hover:shadow-elegant transition-all">
              <div className="flex items-start gap-3">
                <Avatar className="h-12 w-12 shrink-0">
                  <AvatarFallback className={`bg-gradient-to-br ${avatarColor(u.fullName)} text-white font-bold text-sm`}>{initials(u.fullName)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold truncate">{u.fullName}</p>
                    <StatusBadge status={u.status} />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{u.roleName} · {u.branchName ?? "All branches"}</p>
                </div>
              </div>
              <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{u.email}</span></p>
                {u.username && <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 shrink-0" />@{u.username}</p>}
                {u.lastLogin && <p className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 shrink-0" />Last login: {new Date(u.lastLogin).toLocaleString("en-SA")}</p>}
              </div>
              <div className="mt-4 flex gap-1.5">
                {canEdit && (
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => openEdit(u)}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-8 px-2.5" title="Manage Permissions" onClick={() => window.location.href = "/roles"}>
                  <ShieldCheck className="h-3.5 w-3.5" />
                </Button>
                {canEdit && currentUser && canManageUser(currentUser, u.roleName, u.id) && (
                  <Button size="sm" variant="outline" className={`h-8 px-2.5 ${u.status === "active" ? "text-destructive hover:text-destructive" : "text-success hover:text-success"}`} title={u.status === "active" ? "Deactivate" : "Activate"} onClick={() => toggleStatus(u)}>
                    <Power className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-3 text-sm text-muted-foreground text-center py-10">No users match the current filters.</p>
          )}
        </div>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={dlgOpen} onOpenChange={v => !v && setDlgOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editUser ? "Edit User" : "Add User"}</DialogTitle>
            <DialogDescription>Assign role and branch access.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label className="text-xs">Full Name</Label>
              <Input value={form.fullName} onChange={set("fullName")} className="mt-1 h-9" placeholder="Abdullah Al Faisal" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Email</Label>
                <Input value={form.email} onChange={set("email")} className="mt-1 h-9" type="email" placeholder="user@mart.sa" />
              </div>
              <div>
                <Label className="text-xs">Username</Label>
                <Input value={form.username} onChange={set("username")} className="mt-1 h-9" placeholder="abdullah.faisal" />
              </div>
            </div>
            {!editUser && (
              <div>
                <Label className="text-xs">Password</Label>
                <Input value={form.password} onChange={set("password")} className="mt-1 h-9" type="password" placeholder="••••••••" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Role</Label>
                <Select value={form.roleId} onValueChange={setS("roleId")}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    {roles.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Branch</Label>
                <Select
                  value={form.branchId || (isTenantAdminRole ? "all_branches" : "")}
                  onValueChange={v => setS("branchId")(v === "all_branches" ? "" : v)}
                >
                  <SelectTrigger className="mt-1 h-9">
                    <SelectValue placeholder={isTenantAdminRole ? "All branches" : "Select branch"} />
                  </SelectTrigger>
                  <SelectContent>
                    {isTenantAdminRole && <SelectItem value="all_branches">All branches</SelectItem>}
                    {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {editUser && (
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={setS("status")}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgOpen(false)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground border-0" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
