import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetTrigger } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { DataTable, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { HardDrive, Activity, Power, Wifi, Plus, Eye, Pencil, Battery, Thermometer, Signal } from "lucide-react";

export const Route = createFileRoute("/_app/devices")({ component: Devices });

const devices = [
  { id: "DEV-1001", type: "Receipt Printer", model: "Epson TM-T88VI", branch: "Olaya", terminal: "TML-RYD-001", lastActivity: "2 min ago", sync: "synced", behavior: "Healthy · 0 alerts", status: "online" },
  { id: "DEV-1002", type: "Barcode Scanner", model: "Honeywell 1900", branch: "Olaya", terminal: "TML-RYD-001", lastActivity: "now", sync: "synced", behavior: "Slow read 1.4s avg", status: "online" },
  { id: "DEV-1003", type: "Cash Drawer", model: "APG Vasario", branch: "Olaya", terminal: "TML-RYD-001", lastActivity: "5 min ago", sync: "synced", behavior: "Healthy", status: "online" },
  { id: "DEV-1004", type: "Card Machine", model: "Ingenico Move/5000", branch: "Khobar", terminal: "TML-KHB-001", lastActivity: "12 min ago", sync: "syncing", behavior: "Overheating 48°C", status: "maintenance" },
  { id: "DEV-1005", type: "Kiosk Display", model: "Elo 22 Touch", branch: "Olaya", terminal: "KIOSK-01", lastActivity: "1 min ago", sync: "synced", behavior: "App freeze on AR↔EN", status: "online" },
  { id: "DEV-1006", type: "Tablet (mPOS)", model: "Samsung Tab A9", branch: "Jeddah", terminal: "MPOS-JED-001", lastActivity: "8 min ago", sync: "syncing", behavior: "Battery 18%", status: "syncing" },
];

function Devices() {
  const [view, setView] = useState<any | null>(null);
  const [edit, setEdit] = useState<any | null>(null);
  const [q, setQ] = useState(""); const [br, setBr] = useState("All"); const [st, setSt] = useState("All");
  const filtered = useMemo(() => devices.filter(d =>
    (!q || `${d.id} ${d.type} ${d.model}`.toLowerCase().includes(q.toLowerCase())) &&
    (br === "All" || d.branch === br) && (st === "All" || d.status === st)
  ), [q, br, st]);

  return (
    <PageShell title="Devices" subtitle="Hardware fleet + behavior in one place" actions={<RegisterDeviceSheet />}>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Devices" value="41" icon={HardDrive} accent="primary" />
        <MetricCard label="Healthy" value="38" icon={Activity} accent="success" />
        <MetricCard label="Maintenance" value="2" icon={Power} accent="warning" />
        <MetricCard label="Network OK" value="11/12" icon={Wifi} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[{label:"Network uptime",value:99.4,icon:Signal},{label:"Average battery",value:72,icon:Battery},{label:"Thermal headroom",value:84,icon:Thermometer}].map(s => (
          <Card key={s.label} className="p-5 border-border/60 shadow-card">
            <div className="flex items-center justify-between"><p className="text-sm font-semibold">{s.label}</p><s.icon className="h-4 w-4 text-primary" /></div>
            <p className="text-3xl font-bold mt-2">{s.value}%</p>
            <Progress value={s.value} className="mt-3 h-2" />
          </Card>
        ))}
      </div>

      <Card className="p-3 border-border/60 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Search by device id, model…" value={q} onChange={e => setQ(e.target.value)} className="h-9 flex-1 min-w-[180px]" />
          <Select value={br} onValueChange={setBr}><SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger><SelectContent>{["All","Olaya","Khobar","Jeddah","Madinah"].map(o => <SelectItem key={o} value={o}>{o === "All" ? "All Branches" : o}</SelectItem>)}</SelectContent></Select>
          <Select value={st} onValueChange={setSt}><SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger><SelectContent>{["All","online","syncing","maintenance","offline"].map(o => <SelectItem key={o} value={o}>{o === "All" ? "All Status" : o}</SelectItem>)}</SelectContent></Select>
        </div>
      </Card>

      <DataTable columns={[
        { key: "id", label: "Device ID", render: r => <span className="font-mono font-semibold">{r.id}</span> },
        { key: "type", label: "Type", render: r => <div><p>{r.type}</p><p className="text-xs text-muted-foreground">{r.model}</p></div> },
        { key: "branch", label: "Branch" },
        { key: "terminal", label: "Terminal" },
        { key: "status", label: "Status", render: r => <StatusBadge status={r.status} /> },
        { key: "lastActivity", label: "Last activity" },
        { key: "sync", label: "Sync" },
        { key: "behavior", label: "Behavior profile", render: r => <span className="text-xs">{r.behavior}</span> },
        { key: "a", label: "", render: r => <div className="flex gap-1 justify-end">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setView(r)}><Eye className="h-4 w-4" /></Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEdit(r)}><Pencil className="h-4 w-4" /></Button>
        </div> }
      ]} rows={filtered} />

      <Sheet open={!!view} onOpenChange={v => !v && setView(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{view?.id} · Details</SheetTitle></SheetHeader>
          {view && (
            <div className="space-y-2 mt-4 text-sm">
              {[["Type", view.type],["Model", view.model],["Branch", view.branch],["Terminal", view.terminal],["Status", view.status],["Last activity", view.lastActivity],["Sync", view.sync],["Behavior", view.behavior]].map(([k,v]) => (
                <div key={k} className="flex justify-between border-b border-border/40 py-1.5"><span className="text-muted-foreground">{k}</span><span className="font-semibold">{v}</span></div>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!edit} onOpenChange={v => !v && setEdit(null)}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>Edit {edit?.id}</SheetTitle></SheetHeader>
          <div className="space-y-3 mt-4">
            <Field label="Device name" defaultValue={edit?.type} />
            <Field label="Branch" defaultValue={edit?.branch} />
            <Field label="Terminal mapping" defaultValue={edit?.terminal} />
            <Field label="Behavior alert threshold" placeholder="e.g. temp > 45°C" />
          </div>
          <SheetFooter className="mt-4"><Button className="gradient-primary text-primary-foreground border-0" onClick={() => setEdit(null)}>Save</Button></SheetFooter>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}

function RegisterDeviceSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild><Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow"><Plus className="h-4 w-4" />Register Device</Button></SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>Register new device</SheetTitle></SheetHeader>
        <div className="space-y-3 mt-4">
          <Field label="Device name" placeholder="e.g. Olaya Printer #4" />
          <div className="space-y-1"><Label className="text-xs">Device type</Label>
            <Select defaultValue="printer"><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{["Receipt Printer","Barcode Scanner","Cash Drawer","Card Machine","Kiosk Display","Tablet (mPOS)"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Field label="Serial number" placeholder="SN-…" />
          <Field label="Branch" placeholder="Olaya" />
          <Field label="Terminal mapping" placeholder="TML-RYD-001" />
          <Field label="Behavior settings" placeholder="Alert on idle > 10m" />
        </div>
        <SheetFooter className="mt-4"><Button className="gradient-primary text-primary-foreground border-0">Register</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, defaultValue, placeholder }: { label: string; defaultValue?: string; placeholder?: string }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label><Input className="h-9" defaultValue={defaultValue} placeholder={placeholder} /></div>;
}
