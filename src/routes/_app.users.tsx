import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Toolbar, StatusBadge } from "@/components/module-placeholder";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Pencil, ShieldCheck, Power } from "lucide-react";
import { api, type User } from "@/lib/api";

export const Route = createFileRoute("/_app/users")({ component: RegisteredUsers });

function RegisteredUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<User | null>(null);

  useEffect(() => {
    api.getUsers()
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  const initials = (name: string) =>
    name.split(" ").map((n) => n[0]).slice(0, 2).join("");

  return (
    <PageShell title="Registered Users" subtitle="Owners · managers · cashiers · technicians">
      <Toolbar placeholder="Search by name, email…" primaryLabel="Add User" extra={<Button size="sm" variant="outline" className="h-10">+ Invite</Button>} />

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
                <Button size="sm" variant="outline" className="flex-1 h-8" onClick={() => setEdit(u)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
                <Button size="sm" variant="outline" className="h-8 px-2"><ShieldCheck className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="outline" className="h-8 px-2 text-destructive"><Power className="h-3.5 w-3.5" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Edit User" : "Invite User"}</DialogTitle><DialogDescription>Assign role and branch access.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <div><Label>Full name</Label><Input defaultValue={edit?.fullName} className="mt-1" /></div>
            <div><Label>Email</Label><Input defaultValue={edit?.email} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Role</Label><Select defaultValue="cashier"><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="tenant_admin">Admin</SelectItem><SelectItem value="branch_manager">Manager</SelectItem><SelectItem value="cashier">Cashier</SelectItem></SelectContent></Select></div>
              <div><Label>Branch</Label><Select defaultValue="olaya"><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="olaya">Olaya</SelectItem><SelectItem value="khobar">Khobar</SelectItem><SelectItem value="jeddah">Jeddah</SelectItem></SelectContent></Select></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button className="gradient-primary text-primary-foreground border-0" onClick={() => setEdit(null)}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
