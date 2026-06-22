import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/module-placeholder";
import { Eye, Pencil, X, Monitor, Activity, Plus, Wifi } from "lucide-react";
import { api, type Terminal, type Branch, type User } from "@/lib/api";

export const Route = createFileRoute("/_app/terminals")({ component: Terminals });

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

function TerminalFormFields({ form, set, setS, branches, users, saving, onSave }: {
  form: TerminalForm;
  set: (k: keyof TerminalForm) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  setS: (k: keyof TerminalForm) => (v: string) => void;
  branches: Branch[];
  users: User[];
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="mt-4 space-y-4">
      <FieldRow label="Terminal Code"><Input value={form.terminalCode} onChange={set("terminalCode")} className="h-9 font-mono" placeholder="TML-RYD-001" /></FieldRow>
      <FieldRow label="Name"><Input value={form.name} onChange={set("name")} className="h-9" placeholder="Olaya Cashier 1" /></FieldRow>
      <FieldRow label="Branch">
        <Select value={form.branchId} onValueChange={setS("branchId")}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Select branch" /></SelectTrigger>
          <SelectContent>
            {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Assigned Cashier">
        <Select value={form.assignedCashierId ?? "none"} onValueChange={v => setS("assignedCashierId")(v === "none" ? "" : v)}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Unassigned" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— Unassigned —</SelectItem>
            {users.map(u => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Status">
        <Select value={form.status} onValueChange={setS("status")}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border/40 pb-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

type TerminalForm = { name: string; terminalCode: string; branchId: string; status: string; assignedCashierId: string; };
const emptyForm: TerminalForm = { name: "", terminalCode: "", branchId: "", status: "active", assignedCashierId: "" };

function Terminals() {
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [br, setBr] = useState("all");
  const [st, setSt] = useState("all");
  const [viewTerm, setViewTerm] = useState<Terminal | null>(null);
  const [editTerm, setEditTerm] = useState<Terminal | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<TerminalForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.getTerminals({
        branchId: br !== "all" ? br : undefined,
        status: st !== "all" ? st : undefined,
      }),
      api.getBranches(),
      api.getUsers(),
    ])
      .then(([t, b, u]) => { setTerminals(t); setBranches(b); setUsers(u); })
      .finally(() => setLoading(false));
  }, [br, st]);
  useEffect(() => { load(); }, [load]);

  const cashiers = users.filter(u => u.roleName?.toLowerCase().includes("cashier"));

  // Status filter applied on BE; only search applied client-side
  const filtered = terminals.filter(t =>
    !q || t.terminalCode?.toLowerCase().includes(q.toLowerCase()) || t.name?.toLowerCase().includes(q.toLowerCase())
  );

  const openEdit = (t: Terminal) => {
    setEditTerm(t);
    setForm({ name: t.name, terminalCode: t.terminalCode, branchId: t.branchId, status: t.status, assignedCashierId: t.assignedCashierId ?? "" });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editTerm) {
        await api.updateTerminal(editTerm.id, form);
        setEditTerm(null);
      } else {
        await api.createTerminal(form);
        setCreateOpen(false);
      }
      load();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const handleDeactivate = async (t: Terminal) => {
    await api.updateTerminalStatus(t.id, "inactive");
    load();
  };

  const set = (k: keyof TerminalForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));
  const setS = (k: keyof TerminalForm) => (v: string) =>
    setForm(p => ({ ...p, [k]: v }));

  return (
    <PageShell title="Terminals" subtitle="POS terminal registry, sessions and sync status">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search code or name…" className="h-9 w-48 flex-shrink-0" />
        <Select value={br} onValueChange={setBr}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Branch" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={st} onValueChange={setSt}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="syncing">Syncing</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9" onClick={() => { setForm(emptyForm); setCreateOpen(true); }}>
          <Plus className="h-4 w-4" /> Add Terminal
        </Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 font-semibold">Code</th>
                  <th className="px-3 py-3 font-semibold">Name</th>
                  <th className="px-3 py-3 font-semibold">Branch</th>
                  <th className="px-3 py-3 font-semibold">Cashier</th>
                  <th className="px-3 py-3 font-semibold">Network</th>
                  <th className="px-3 py-3 font-semibold">Session</th>
                  <th className="px-3 py-3 font-semibold">Last Sync</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-3 py-3 font-mono text-xs font-bold">{t.terminalCode}</td>
                    <td className="px-3 py-3 font-medium">{t.name}</td>
                    <td className="px-3 py-3 text-xs">{t.branch?.name ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{t.assignedCashier?.fullName ?? "Unassigned"}</td>
                    <td className="px-3 py-3 text-xs">
                      <span className="flex items-center gap-1 text-primary"><Wifi className="h-3.5 w-3.5" />Wi-Fi</span>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {t.status === "active"
                        ? <span className="inline-flex items-center gap-1 rounded-full bg-success/15 text-success px-2 py-0.5 text-[10px] font-semibold"><Activity className="h-3 w-3" />Session Open</span>
                        : <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-semibold">No Session</span>}
                    </td>
                    <td className="px-3 py-3 text-xs">{t.lastSync ? new Date(t.lastSync).toLocaleString("en-SA") : "—"}</td>
                    <td className="px-3 py-3"><StatusBadge status={t.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewTerm(t)}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                        {t.status === "active" && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Deactivate" onClick={() => handleDeactivate(t)}><X className="h-3.5 w-3.5" /></Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-10 text-muted-foreground text-sm">No terminals found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* View sheet */}
      <Sheet open={!!viewTerm} onOpenChange={v => !v && setViewTerm(null)}>
        <SheetContent className="w-[440px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-primary" />
              {viewTerm?.terminalCode} — {viewTerm?.name}
            </SheetTitle>
          </SheetHeader>
          {viewTerm && (
            <Tabs defaultValue="info" className="mt-4">
              <TabsList>
                <TabsTrigger value="info">Info</TabsTrigger>
                <TabsTrigger value="session">Session</TabsTrigger>
              </TabsList>
              <TabsContent value="info" className="mt-4 space-y-3">
                <Row label="Code" value={viewTerm.terminalCode} />
                <Row label="Name" value={viewTerm.name} />
                <Row label="Branch" value={viewTerm.branch?.name ?? "—"} />
                <Row label="Assigned Cashier" value={viewTerm.assignedCashier?.fullName ?? "Unassigned"} />
                <Row label="Status" value={viewTerm.status} />
                <Row label="Last Sync" value={viewTerm.lastSync ? new Date(viewTerm.lastSync).toLocaleString("en-SA") : "—"} />
              </TabsContent>
              <TabsContent value="session" className="mt-4">
                <div className="rounded-xl border border-border/60 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Activity className="h-4 w-4 text-success" />
                    {viewTerm.status === "active" ? "Session Active" : "No Active Session"}
                  </div>
                  <p className="text-xs text-muted-foreground">Cashier: {viewTerm.assignedCashier?.fullName ?? "—"}</p>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit sheet */}
      <Sheet open={!!editTerm} onOpenChange={v => !v && setEditTerm(null)}>
        <SheetContent>
          <SheetHeader><SheetTitle>Edit Terminal</SheetTitle></SheetHeader>
          <TerminalFormFields form={form} set={set} setS={setS} branches={branches} users={cashiers} saving={saving} onSave={handleSave} />
        </SheetContent>
      </Sheet>

      {/* Create sheet */}
      <Sheet open={createOpen} onOpenChange={v => !v && setCreateOpen(false)}>
        <SheetContent>
          <SheetHeader><SheetTitle>Add Terminal</SheetTitle></SheetHeader>
          <TerminalFormFields form={form} set={set} setS={setS} branches={branches} users={cashiers} saving={saving} onSave={handleSave} />
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
