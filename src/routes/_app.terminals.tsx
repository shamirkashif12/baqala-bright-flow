import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toolbar, StatusBadge } from "@/components/module-placeholder";
import { Eye, Pencil, X, Monitor, Wifi, Activity } from "lucide-react";
import { api, type Terminal } from "@/lib/api";

export const Route = createFileRoute("/_app/terminals")({ component: Terminals });

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border/40 pb-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Terminals() {
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [br, setBr] = useState("all");
  const [st, setSt] = useState("all");
  const [viewTerm, setViewTerm] = useState<Terminal | null>(null);
  const [editTerm, setEditTerm] = useState<Terminal | null>(null);

  useEffect(() => {
    api.getTerminals()
      .then(setTerminals)
      .finally(() => setLoading(false));
  }, []);

  const branches = [...new Set(terminals.map(t => t.branch?.name).filter(Boolean))];

  const filtered = terminals.filter(t => {
    const matchQ = !q || t.terminalCode?.toLowerCase().includes(q.toLowerCase()) || t.name?.toLowerCase().includes(q.toLowerCase());
    const matchBr = br === "all" || t.branch?.name === br;
    const matchSt = st === "all" || t.status === st;
    return matchQ && matchBr && matchSt;
  });

  return (
    <PageShell title="Terminals" subtitle="POS terminal registry, sessions and sync status">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search code or name…" className="h-9 w-48 flex-shrink-0" />
        <Select value={br} onValueChange={setBr}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Branch" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branches.map(b => <SelectItem key={b!} value={b!}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={st} onValueChange={setSt}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
          </SelectContent>
        </Select>
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
                    <td className="px-3 py-3 text-xs">{t.lastSync ? new Date(t.lastSync).toLocaleString("en-SA") : "—"}</td>
                    <td className="px-3 py-3"><StatusBadge status={t.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewTerm(t)}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditTerm(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                        {t.status === "active" && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"><X className="h-3.5 w-3.5" /></Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">No terminals found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* View sheet with tabs */}
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
                <TabsTrigger value="logs">Logs</TabsTrigger>
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
              <TabsContent value="logs" className="mt-4">
                <p className="text-xs text-muted-foreground">No recent log entries.</p>
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit sheet */}
      <Sheet open={!!editTerm} onOpenChange={v => !v && setEditTerm(null)}>
        <SheetContent>
          <SheetHeader><SheetTitle>Edit Terminal</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-4">
            <FieldRow label="Name"><Input defaultValue={editTerm?.name ?? ""} /></FieldRow>
            <FieldRow label="Status">
              <Select defaultValue={editTerm?.status ?? "active"}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
            <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={() => setEditTerm(null)}>Save</Button>
          </div>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
