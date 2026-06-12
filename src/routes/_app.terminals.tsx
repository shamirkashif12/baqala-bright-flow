import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { DataTable, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetTrigger } from "@/components/ui/sheet";
import { Terminal as TerminalIcon, Activity, Power, CircleDollarSign, Eye, Pencil, X, Plus } from "lucide-react";

export const Route = createFileRoute("/_app/terminals")({ component: Terminals });

const terminals = [
  { id: "TML-RYD-001", branch: "Olaya", cashier: "Fahad Al-Qahtani", device: "online", session: "Session Open", lastSync: "12s ago", net: "Wi-Fi · 5G fallback", sales: "ر.س 6,420" },
  { id: "TML-RYD-002", branch: "Olaya", cashier: "Mohammed Al-Harbi", device: "online", session: "Session Open", lastSync: "now", net: "Wi-Fi", sales: "ر.س 4,180" },
  { id: "TML-RYD-003", branch: "Olaya", cashier: "—", device: "online", session: "Session Closed", lastSync: "6m ago", net: "Wi-Fi", sales: "ر.س 0" },
  { id: "TML-KHB-001", branch: "Khobar", cashier: "Khalid Al-Otaibi", device: "syncing", session: "Session Open", lastSync: "now", net: "Wi-Fi · slow", sales: "ر.س 3,920" },
  { id: "TML-JED-001", branch: "Jeddah", cashier: "Sultan Al-Dossari", device: "online", session: "Session Open", lastSync: "5s ago", net: "Wi-Fi", sales: "ر.س 2,140" },
  { id: "TML-JED-002", branch: "Jeddah", cashier: "—", device: "offline", session: "Session Closed", lastSync: "2h ago", net: "No connection", sales: "ر.س 0" },
  { id: "TML-MED-001", branch: "Madinah", cashier: "Bandar Al-Anzi", device: "online", session: "Session Open", lastSync: "8s ago", net: "Wi-Fi", sales: "ر.س 1,820" },
];

function Terminals() {
  const [q, setQ] = useState("");
  const [br, setBr] = useState("All");
  const [st, setSt] = useState("All");
  const [view, setView] = useState<any | null>(null);
  const [edit, setEdit] = useState<any | null>(null);
  const filtered = useMemo(() => terminals.filter(t =>
    (!q || `${t.id} ${t.cashier} ${t.branch}`.toLowerCase().includes(q.toLowerCase())) &&
    (br === "All" || t.branch === br) && (st === "All" || t.device === st)
  ), [q, br, st]);

  return (
    <PageShell title="Network · Terminals" subtitle="Merged terminal + session management across all branches" actions={
      <Sheet>
        <SheetTrigger asChild><Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow"><Plus className="h-4 w-4" />Add Terminal</Button></SheetTrigger>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>Add Terminal</SheetTitle></SheetHeader>
          <div className="space-y-3 mt-4">
            <Field label="Terminal ID" placeholder="TML-RYD-004" />
            <Field label="Branch" placeholder="Olaya" />
            <Field label="Assigned cashier" placeholder="(optional)" />
            <Field label="Serial number" />
          </div>
          <SheetFooter className="mt-4"><Button className="gradient-primary text-primary-foreground border-0">Register</Button></SheetFooter>
        </SheetContent>
      </Sheet>
    }>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Terminals" value="12" icon={TerminalIcon} accent="primary" />
        <MetricCard label="Online" value="11" icon={Activity} accent="success" />
        <MetricCard label="Offline" value="1" icon={Power} accent="destructive" />
        <MetricCard label="Sales Today" value="ر.س 48,920" icon={CircleDollarSign} />
      </div>

      <Card className="p-3 border-border/60 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Search by Terminal ID, cashier, branch…" value={q} onChange={e => setQ(e.target.value)} className="h-9 flex-1 min-w-[180px]" />
          <Select value={br} onValueChange={setBr}><SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>{["All","Olaya","Khobar","Jeddah","Madinah"].map(o => <SelectItem key={o} value={o}>{o === "All" ? "All Branches" : o}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={st} onValueChange={setSt}><SelectTrigger className="h-9 w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>{["All","online","offline","syncing"].map(o => <SelectItem key={o} value={o}>{o === "All" ? "All Status" : o}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </Card>

      <DataTable
        columns={[
          { key: "id", label: "Terminal ID", render: r => <span className="font-mono font-semibold">{r.id}</span> },
          { key: "branch", label: "Branch" },
          { key: "cashier", label: "Assigned Cashier" },
          { key: "device", label: "Device Status", render: r => <StatusBadge status={r.device} /> },
          { key: "session", label: "Session", render: r => <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${r.session === "Session Open" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>{r.session}</span> },
          { key: "lastSync", label: "Last Sync" },
          { key: "net", label: "Network" },
          { key: "sales", label: "Today" },
          { key: "a", label: "", render: r => (
            <div className="flex gap-1 justify-end">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setView(r)}><Eye className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEdit(r)}><Pencil className="h-4 w-4" /></Button>
              {r.session === "Session Open" && <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"><X className="h-4 w-4" /></Button>}
            </div>
          )},
        ]}
        rows={filtered}
      />

      <Sheet open={!!view} onOpenChange={v => !v && setView(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{view?.id} · Details</SheetTitle></SheetHeader>
          <Tabs defaultValue="info" className="mt-4">
            <TabsList><TabsTrigger value="info">Info</TabsTrigger><TabsTrigger value="session">Session</TabsTrigger><TabsTrigger value="logs">Logs</TabsTrigger></TabsList>
            <TabsContent value="info" className="space-y-2 mt-3 text-sm">
              <Row k="Branch" v={view?.branch} /><Row k="Cashier" v={view?.cashier} />
              <Row k="Device" v={view?.device} /><Row k="Network" v={view?.net} /><Row k="Last sync" v={view?.lastSync} />
            </TabsContent>
            <TabsContent value="session" className="space-y-2 mt-3 text-sm">
              <Row k="Status" v={view?.session} /><Row k="Sales today" v={view?.sales} />
              <Row k="Orders" v="142" /><Row k="Last order" v="3 min ago" />
            </TabsContent>
            <TabsContent value="logs" className="space-y-2 mt-3 text-xs">
              {["10:14 · Order ORD-10241 created","10:08 · Sync success (12 items)","09:51 · Receipt printed","09:32 · Session resumed"].map(l => <div key={l} className="p-2 rounded bg-muted/40">{l}</div>)}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <Sheet open={!!edit} onOpenChange={v => !v && setEdit(null)}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>Edit {edit?.id}</SheetTitle></SheetHeader>
          <div className="space-y-3 mt-4">
            <Field label="Terminal ID" defaultValue={edit?.id} />
            <Field label="Branch" defaultValue={edit?.branch} />
            <Field label="Assigned cashier" defaultValue={edit?.cashier} />
          </div>
          <SheetFooter className="mt-4"><Button className="gradient-primary text-primary-foreground border-0" onClick={() => setEdit(null)}>Save</Button></SheetFooter>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}

function Field({ label, defaultValue, placeholder }: { label: string; defaultValue?: string; placeholder?: string }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label><Input className="h-9" defaultValue={defaultValue} placeholder={placeholder} /></div>;
}
function Row({ k, v }: { k: string; v?: string }) {
  return <div className="flex justify-between border-b border-border/40 py-1.5"><span className="text-muted-foreground">{k}</span><span className="font-semibold">{v ?? "—"}</span></div>;
}
