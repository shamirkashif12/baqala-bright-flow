import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RoleGate } from "@/components/role-gate";
import { PageShell } from "@/components/app-topbar";
import { StatusBadge } from "@/components/module-placeholder";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Pencil, ShieldCheck, Power, Plus } from "lucide-react";
import { api, type User, type Branch, type Role } from "@/lib/api";

export const Route = createFileRoute("/_app/users")({
  component: () => (
    <RoleGate allow={["tenant_admin", "branch_manager"]}>
      <RegisteredUsers />
    </RoleGate>
  ),
});

type UserForm = { fullName: string; email: string; username: string; password: string; roleId: string; branchId: string; status: string; };
const emptyForm: UserForm = { fullName: "", email: "", username: "", password: "", roleId: "", branchId: "", status: "active" };

function RegisteredUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([api.getUsers(), api.getBranches(), api.getRoles()])
      .then(([u, b, r]) => { setUsers(u); setBranches(b); setRoles(r); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openCreate = () => { setEditUser(null); setForm(emptyForm); setDlgOpen(true); };
  const openEdit = (u: User) => {
    setEditUser(u);
    setForm({ fullName: u.fullName, email: u.email, username: u.username, password: "", roleId: u.roleId, branchId: u.branchId ?? "", status: u.status });
    setDlgOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editUser) {
        await api.updateUser(editUser.id, { fullName: form.fullName, email: form.email, username: form.username, roleId: form.roleId, branchId: form.branchId || undefined, status: form.status });
      } else {
        await api.createUser({ fullName: form.fullName, email: form.email, username: form.username, password: form.password, roleId: form.roleId, branchId: form.branchId || undefined });
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
    const next = u.status === "active" ? "inactive" : "active";
    await api.updateUser(u.id, { status: next });
    load();
  };

  const set = (k: keyof UserForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));
  const setS = (k: keyof UserForm) => (v: string) =>
    setForm(p => ({ ...p, [k]: v }));

  const initials = (name: string) => name.split(" ").map(n => n[0]).slice(0, 2).join("");

  return (
    <PageShell title="Registered Users" subtitle="Owners · managers · cashiers · technicians">
      <div className="flex justify-end">
        <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-10" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Add User
        </Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {users.map((u) => (
            <Card key={u.id} className="p-5 border-border/60 shadow-card hover:shadow-elegant transition-all">
              <div className="flex items-start gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="gradient-primary text-primary-foreground font-bold">{initials(u.fullName)}</AvatarFallback>
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
                <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> {u.email}</p>
                {u.lastLogin && <p className="text-[10px]">Last login: {new Date(u.lastLogin).toLocaleString("en-SA")}</p>}
              </div>
              <div className="mt-4 flex gap-1.5">
                <Button size="sm" variant="outline" className="flex-1 h-8" onClick={() => openEdit(u)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                <Button size="sm" variant="outline" className="h-8 px-2" title="Permissions">
                  <ShieldCheck className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="outline" className={`h-8 px-2 ${u.status === "active" ? "text-destructive" : "text-success"}`} title={u.status === "active" ? "Deactivate" : "Activate"} onClick={() => toggleStatus(u)}>
                  <Power className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
          {users.length === 0 && (
            <p className="col-span-3 text-sm text-muted-foreground text-center py-10">No users found.</p>
          )}
        </div>
      )}

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
                <Select value={form.branchId} onValueChange={setS("branchId")}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="All branches" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All branches</SelectItem>
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
