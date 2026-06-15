import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/role-gate";
import { useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Toolbar, StatusBadge } from "@/components/module-placeholder";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, Phone, Calendar, Pencil, ShieldCheck, Power } from "lucide-react";

export const Route = createFileRoute("/_app/users")({
  component: () => (
    <RoleGate allow={["owner", "manager"]}>
      <RegisteredUsers />
    </RoleGate>
  ),
});

const users = [
  { id: "U-101", name: "Abdullah Al Faisal", phone: "+966 50 100 1010", email: "owner@mimoney.sa", role: "Owner", branch: "Olaya", status: "active", created: "01 Jan 26", by: "System", last: "Active now", activity: "Approved 4 POs · viewed reports" },
  { id: "U-102", name: "Sara Al Qahtani", phone: "+966 55 200 2020", email: "sara@mimoney.sa", role: "Manager", branch: "Jeddah", status: "active", created: "05 Feb 26", by: "Abdullah", last: "12 min ago", activity: "Adjusted stock · added supplier" },
  { id: "U-103", name: "Khalid Al Otaibi", phone: "+966 54 303 0303", email: "khalid@mimoney.sa", role: "Cashier", branch: "Olaya", status: "active", created: "12 Feb 26", by: "Sara", last: "5 min ago", activity: "62 sales today" },
  { id: "U-104", name: "Nora Al Harbi", phone: "+966 56 404 0404", email: "nora@mimoney.sa", role: "Cashier", branch: "Khobar", status: "active", created: "20 Feb 26", by: "Sara", last: "1 hr ago", activity: "Closed shift · ر.س 4,820" },
  { id: "U-105", name: "Yousef Al Ahmadi", phone: "+966 58 505 0505", email: "yousef@mimoney.sa", role: "Technician", branch: "All", status: "active", created: "10 Mar 26", by: "Abdullah", last: "3 hr ago", activity: "Resolved TKT-2037" },
  { id: "U-106", name: "Layla Al Saud", phone: "+966 59 606 0606", email: "layla@mimoney.sa", role: "Manager", branch: "Madinah", status: "inactive", created: "01 Apr 26", by: "Abdullah", last: "12 d ago", activity: "—" },
];

function RegisteredUsers() {
  const [edit, setEdit] = useState<any | null>(null);
  return (
    <PageShell title="Registered Users" subtitle="Owners · managers · cashiers · technicians">
      <Toolbar placeholder="Search by name, email, phone…" primaryLabel="Add User" extra={<Button size="sm" variant="outline" className="h-10" onClick={() => setEdit({})}>+ Invite</Button>} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {users.map((u) => (
          <Card key={u.id} className="p-5 border-border/60 shadow-card hover:shadow-elegant transition-all">
            <div className="flex items-start gap-3">
              <Avatar className="h-12 w-12">
                <AvatarFallback className="gradient-primary text-primary-foreground font-bold">{u.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold truncate">{u.name}</p>
                  <StatusBadge status={u.status} />
                </div>
                <p className="text-xs text-muted-foreground truncate">{u.role} · {u.branch}</p>
              </div>
            </div>
            <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
              <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> {u.email}</p>
              <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {u.phone}</p>
              <p className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5" /> Joined {u.created} · by {u.by}</p>
            </div>
            <div className="mt-3 rounded-lg bg-muted/40 p-2.5 text-xs">
              <p className="font-semibold mb-0.5">Recent activity</p>
              <p className="text-muted-foreground">{u.activity}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Last seen · {u.last}</p>
            </div>
            <div className="mt-4 flex gap-1.5">
              <Button size="sm" variant="outline" className="flex-1 h-8" onClick={() => setEdit(u)}><Pencil className="h-3.5 w-3.5 mr-1" /> Edit</Button>
              <Button size="sm" variant="outline" className="h-8 px-2"><ShieldCheck className="h-3.5 w-3.5" /></Button>
              <Button size="sm" variant="outline" className="h-8 px-2 text-destructive"><Power className="h-3.5 w-3.5" /></Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Edit User" : "Invite User"}</DialogTitle><DialogDescription>Assign role and branch access.</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Full name</Label><Input defaultValue={edit?.name} className="mt-1" /></div>
              <div><Label>Phone</Label><Input defaultValue={edit?.phone} className="mt-1" /></div>
            </div>
            <div><Label>Email</Label><Input defaultValue={edit?.email} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Role</Label><Select defaultValue={edit?.role?.toLowerCase() || "cashier"}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="owner">Owner</SelectItem><SelectItem value="manager">Manager</SelectItem><SelectItem value="cashier">Cashier</SelectItem><SelectItem value="technician">Technician</SelectItem></SelectContent></Select></div>
              <div><Label>Branch</Label><Select defaultValue="olaya"><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="olaya">Olaya</SelectItem><SelectItem value="khobar">Khobar</SelectItem><SelectItem value="jeddah">Jeddah</SelectItem><SelectItem value="all">All branches</SelectItem></SelectContent></Select></div>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button className="gradient-primary text-primary-foreground border-0" onClick={() => setEdit(null)}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}