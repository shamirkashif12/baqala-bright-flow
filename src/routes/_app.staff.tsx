import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RoleGate } from "@/components/role-gate";
import { PageShell } from "@/components/app-topbar";
import { MetricCard } from "@/components/metric-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Users, UserCheck, Clock, ShieldCheck, Plus, MoreVertical, KeyRound, UserX, Eye, Pencil, Lock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/staff")({
  component: () => (
    <RoleGate allow={["owner", "manager"]}>
      <Staff />
    </RoleGate>
  ),
});

type StaffStatus = "Active" | "Checked In" | "Checked Out" | "Suspended";
type StaffRow = {
  id: string; name: string; phone: string; email: string; role: string;
  branch: string; terminal: string; warehouse?: string;
  status: StaffStatus; lastLogin: string; createdAt: string; createdBy: string;
};

const INITIAL: StaffRow[] = [
  { id: "STF-001", name: "Ayesha Nadeem", phone: "+966 55 100 9001", email: "admin@baqala.com", role: "Admin", branch: "All Branches", terminal: "All Terminals", status: "Active", lastLogin: "Today · 08:12", createdAt: "01 Jan 2025", createdBy: "System" },
  { id: "STF-002", name: "Ahmed Al Harbi", phone: "+966 55 200 9002", email: "manager@baqala.com", role: "Manager", branch: "Riyadh Central Baqala", terminal: "All Riyadh Terminals", status: "Active", lastLogin: "Today · 07:40", createdAt: "12 Feb 2025", createdBy: "Ayesha Nadeem" },
  { id: "STF-003", name: "Sara Khan", phone: "+966 55 300 9003", email: "cashier@baqala.com", role: "Cashier", branch: "Riyadh Central Baqala", terminal: "MPOS-RYD-001", status: "Checked In", lastLogin: "Today · 06:55", createdAt: "20 Mar 2025", createdBy: "Ahmed Al Harbi" },
  { id: "STF-004", name: "Fahad Al Saud", phone: "+966 55 500 9005", email: "inventory@baqala.com", role: "Inventory Staff", branch: "Riyadh Central Baqala", terminal: "—", warehouse: "Riyadh Main Warehouse", status: "Active", lastLogin: "Yesterday · 19:02", createdAt: "04 Apr 2025", createdBy: "Ayesha Nadeem" },
  { id: "STF-005", name: "Omar Al Qahtani", phone: "+966 55 400 9004", email: "omar@baqala.com", role: "Cashier", branch: "Jeddah Mart 02", terminal: "MPOS-JED-001", status: "Checked Out", lastLogin: "Yesterday · 22:10", createdAt: "11 May 2025", createdBy: "Ahmed Al Harbi" },
];

const ROLES = ["Admin", "Manager", "Cashier", "Inventory Staff", "Warehouse Staff", "Accountant", "Auditor"];
const BRANCHES = ["All Branches", "Riyadh Central Baqala", "Jeddah Mart 02", "Khobar Corniche", "Madinah Quba"];
const TERMINALS = ["All Terminals", "MPOS-RYD-001", "MPOS-RYD-002", "MPOS-JED-001", "POS-KHB-001"];
const WAREHOUSES = ["—", "Riyadh Main Warehouse", "Jeddah Stock Room", "Khobar DC"];

const statusColor: Record<StaffStatus, string> = {
  "Active": "bg-success/15 text-success border-success/30",
  "Checked In": "bg-primary/15 text-primary border-primary/30",
  "Checked Out": "bg-muted text-muted-foreground border-border",
  "Suspended": "bg-destructive/15 text-destructive border-destructive/30",
};

function initials(n: string) {
  return n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function Staff() {
  const [rows, setRows] = useState<StaffRow[]>(INITIAL);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<StaffRow | null>(null);

  const [form, setForm] = useState({
    name: "", phone: "", email: "", pin: "", role: "Cashier",
    branch: "Riyadh Central Baqala", terminal: "MPOS-RYD-001", warehouse: "—", notes: "",
  });

  const filtered = useMemo(
    () => rows.filter((r) => !q || `${r.id} ${r.name} ${r.email} ${r.role} ${r.branch}`.toLowerCase().includes(q.toLowerCase())),
    [rows, q],
  );

  const create = () => {
    if (!form.name || !form.email) {
      toast.error("Name and email are required");
      return;
    }
    const id = `STF-${String(rows.length + 1).padStart(3, "0")}`;
    setRows((r) => [
      { id, name: form.name, phone: form.phone || "—", email: form.email, role: form.role, branch: form.branch, terminal: form.terminal, warehouse: form.warehouse, status: "Active", lastLogin: "—", createdAt: "Today", createdBy: "Ayesha Nadeem" },
      ...r,
    ]);
    toast.success("Staff account created successfully and permissions assigned.");
    setOpen(false);
    setForm({ name: "", phone: "", email: "", pin: "", role: "Cashier", branch: "Riyadh Central Baqala", terminal: "MPOS-RYD-001", warehouse: "—", notes: "" });
  };

  const onAction = (row: StaffRow, action: string) => {
    if (action === "deactivate") {
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, status: "Suspended" } : r)));
      toast.warning(`${row.name} deactivated`);
    } else if (action === "remove") {
      setRows((rs) => rs.filter((r) => r.id !== row.id));
      toast.success(`${row.name} removed`);
    } else if (action === "reset") {
      toast.success(`PIN reset link sent to ${row.email}`);
    } else if (action === "view") {
      setView(row);
    }
  };

  return (
    <PageShell
      title="Staff & Roles"
      subtitle="Admin · accounts · roles · branch & terminal access"
      actions={
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow">
              <Plus className="h-4 w-4" />Create Staff Account
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
            <SheetHeader><SheetTitle>Create Staff Account</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <F label="Full Name" v={form.name} on={(v) => setForm({ ...form, name: v })} />
                <F label="Phone Number" v={form.phone} on={(v) => setForm({ ...form, phone: v })} placeholder="+966 55…" />
                <F label="Email" v={form.email} on={(v) => setForm({ ...form, email: v })} />
                <F label="Temporary PIN" v={form.pin} on={(v) => setForm({ ...form, pin: v })} placeholder="6-digit" />
              </div>
              <Sel label="Role" v={form.role} on={(v) => setForm({ ...form, role: v })} opts={[...ROLES, "Custom Role"]} />
              <Sel label="Branch Access" v={form.branch} on={(v) => setForm({ ...form, branch: v })} opts={BRANCHES} />
              <Sel label="Terminal / MPOS Access" v={form.terminal} on={(v) => setForm({ ...form, terminal: v })} opts={TERMINALS} />
              <Sel label="Warehouse Access" v={form.warehouse} on={(v) => setForm({ ...form, warehouse: v })} opts={WAREHOUSES} />
              <div className="space-y-1"><Label className="text-xs">Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
            <SheetFooter className="mt-4">
              <Button onClick={create} className="gradient-primary text-primary-foreground border-0 shadow-glow">Create account</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Staff" value={String(rows.length)} icon={Users} accent="primary" />
        <MetricCard label="On Shift Now" value={String(rows.filter((r) => r.status === "Checked In").length)} icon={UserCheck} accent="success" />
        <MetricCard label="Checked Out" value={String(rows.filter((r) => r.status === "Checked Out").length)} icon={Clock} accent="warning" />
        <MetricCard label="Roles" value={String(ROLES.length)} icon={ShieldCheck} />
      </div>

      <Card className="p-3 border-border/60 shadow-card">
        <Input placeholder="Search staff by name, email, role, branch…" value={q} onChange={(e) => setQ(e.target.value)} className="h-9 max-w-md" />
      </Card>

      <Card className="overflow-hidden border-border/60 shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-3">Staff</th><th className="px-3 py-3">Role</th><th className="px-3 py-3">Branch</th>
                <th className="px-3 py-3">Terminal / WH</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Last Login</th>
                <th className="px-3 py-3">Created</th><th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30 animate-fade-in">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold">{initials(r.name)}</div>
                      <div>
                        <p className="font-semibold text-sm">{r.name}</p>
                        <p className="text-[11px] text-muted-foreground font-mono">{r.id} · {r.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3"><Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">{r.role}</Badge></td>
                  <td className="px-3 py-3 text-xs">{r.branch}</td>
                  <td className="px-3 py-3 text-xs">{r.terminal}{r.warehouse && r.warehouse !== "—" ? ` · ${r.warehouse}` : ""}</td>
                  <td className="px-3 py-3"><Badge variant="outline" className={statusColor[r.status]}>{r.status}</Badge></td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">{r.lastLogin}</td>
                  <td className="px-3 py-3 text-xs"><div>{r.createdAt}</div><div className="text-muted-foreground text-[11px]">by {r.createdBy}</div></td>
                  <td className="px-3 py-3 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreVertical className="h-4 w-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onAction(r, "view")}><Eye className="h-3.5 w-3.5 mr-2" />View Staff</DropdownMenuItem>
                        <DropdownMenuItem><Pencil className="h-3.5 w-3.5 mr-2" />Edit Staff</DropdownMenuItem>
                        <DropdownMenuItem><Lock className="h-3.5 w-3.5 mr-2" />Assign Role</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onAction(r, "reset")}><KeyRound className="h-3.5 w-3.5 mr-2" />Reset PIN</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onAction(r, "deactivate")} className="text-warning-foreground"><UserX className="h-3.5 w-3.5 mr-2" />Deactivate</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onAction(r, "remove")} className="text-destructive"><UserX className="h-3.5 w-3.5 mr-2" />Remove Staff</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Sheet open={!!view} onOpenChange={(v) => !v && setView(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>{view?.name}</SheetTitle></SheetHeader>
          {view && (
            <Tabs defaultValue="profile" className="mt-4">
              <TabsList className="w-full">
                <TabsTrigger value="profile" className="flex-1">Profile</TabsTrigger>
                <TabsTrigger value="shifts" className="flex-1">Shift History</TabsTrigger>
                <TabsTrigger value="activity" className="flex-1">Activity</TabsTrigger>
              </TabsList>
              <TabsContent value="profile" className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <Info k="Staff ID" v={view.id} /><Info k="Role" v={view.role} />
                <Info k="Phone" v={view.phone} /><Info k="Email" v={view.email} />
                <Info k="Branch" v={view.branch} /><Info k="Terminal" v={view.terminal} />
                <Info k="Status" v={view.status} /><Info k="Last Login" v={view.lastLogin} />
              </TabsContent>
              <TabsContent value="shifts" className="mt-3 space-y-2">
                {[
                  { d: "Today", s: "06:55", e: "—", t: "Active shift" },
                  { d: "Yesterday", s: "07:02", e: "15:10", t: "Closed · SAR 4,212" },
                  { d: "13 Jun", s: "06:58", e: "15:05", t: "Closed · SAR 3,980" },
                ].map((s, i) => (
                  <div key={i} className="rounded-xl border border-border/60 p-3 flex justify-between items-center animate-fade-in">
                    <div><p className="font-semibold text-sm">{s.d}</p><p className="text-xs text-muted-foreground">{s.s} → {s.e}</p></div>
                    <span className="text-xs">{s.t}</span>
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="activity" className="mt-3 space-y-2 text-sm">
                {["Logged in to MPOS-RYD-001", "Processed 12 POS orders", "Closed cashier shift", "Submitted stock adjustment"].map((a, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/40 p-2.5">
                    <span className="h-2 w-2 rounded-full bg-primary" /><span>{a}</span>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}

function F({ label, v, on, placeholder }: { label: string; v: string; on: (v: string) => void; placeholder?: string }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label><Input className="h-9" value={v} placeholder={placeholder} onChange={(e) => on(e.target.value)} /></div>;
}
function Sel({ label, v, on, opts }: { label: string; v: string; on: (v: string) => void; opts: string[] }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={v} onValueChange={on}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>{opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
function Info({ k, v }: { k: string; v: string }) {
  return <div className="rounded-xl border border-border/60 p-3"><p className="text-[10px] uppercase font-semibold text-muted-foreground">{k}</p><p className="text-sm font-bold mt-0.5">{v}</p></div>;
}