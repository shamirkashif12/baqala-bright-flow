import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { api, type DeviceRecord } from "@/lib/api";

export const Route = createFileRoute("/_app/devices")({ component: Devices });

function Devices() {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<DeviceRecord | null>(null);
  const [edit, setEdit] = useState<DeviceRecord | null>(null);
  const [q, setQ] = useState("");
  const [br, setBr] = useState("All");
  const [st, setSt] = useState("All");

  useEffect(() => {
    api.getDevices()
      .then(setDevices)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => devices.filter(d =>
    (!q || `${d.deviceName} ${d.deviceType} ${d.serialNumber ?? ""}`.toLowerCase().includes(q.toLowerCase())) &&
    (br === "All" || d.branch?.name === br) &&
    (st === "All" || d.status === st)
  ), [devices, q, br, st]);

  const total = devices.length;
  const healthy = devices.filter(d => d.status === "active").length;
  const maintenance = devices.filter(d => d.status === "maintenance" || d.status === "offline").length;
  const synced = devices.filter(d => d.syncStatus === "synced").length;

  const branches = ["All", ...Array.from(new Set(devices.map(d => d.branch?.name).filter((n): n is string => !!n)))];

  return (
    <PageShell title="Devices" subtitle="Hardware fleet + behavior in one place" actions={<RegisterDeviceSheet />}>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Devices" value={String(total)} icon={HardDrive} accent="primary" />
        <MetricCard label="Healthy" value={String(healthy)} icon={Activity} accent="success" />
        <MetricCard label="Maintenance" value={String(maintenance)} icon={Power} accent="warning" />
        <MetricCard label="Network OK" value={`${synced}/${total}`} icon={Wifi} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Network uptime", value: total > 0 ? Math.round((synced / total) * 100) : 0, icon: Signal },
          { label: "Active devices", value: total > 0 ? Math.round((healthy / total) * 100) : 0, icon: Battery },
          { label: "Health score", value: total > 0 ? Math.round(((total - maintenance) / total) * 100) : 0, icon: Thermometer },
        ].map(s => (
          <Card key={s.label} className="p-5 border-border/60 shadow-card">
            <div className="flex items-center justify-between"><p className="text-sm font-semibold">{s.label}</p><s.icon className="h-4 w-4 text-primary" /></div>
            <p className="text-3xl font-bold mt-2">{s.value}%</p>
            <Progress value={s.value} className="mt-3 h-2" />
          </Card>
        ))}
      </div>

      <Card className="p-3 border-border/60 shadow-card">
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Search by name, type, serial…" value={q} onChange={e => setQ(e.target.value)} className="h-9 flex-1 min-w-[180px]" />
          <Select value={br} onValueChange={setBr}>
            <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>{branches.map(o => <SelectItem key={o} value={o}>{o === "All" ? "All Branches" : o}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={st} onValueChange={setSt}>
            <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>{["All", "active", "maintenance", "offline"].map(o => <SelectItem key={o} value={o}>{o === "All" ? "All Status" : o}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </Card>

      {loading ? (
        <div className="text-muted-foreground text-sm py-6">Loading…</div>
      ) : (
        <DataTable columns={[
          { key: "deviceName", label: "Device", render: (r: DeviceRecord) => <div><p className="font-semibold">{r.deviceName}</p><p className="text-xs text-muted-foreground">{r.deviceType.replace(/_/g, " ")}</p></div> },
          { key: "serialNumber", label: "Serial #", render: (r: DeviceRecord) => <span className="font-mono text-xs">{r.serialNumber ?? "—"}</span> },
          { key: "branch", label: "Branch", render: (r: DeviceRecord) => r.branch?.name ?? "—" },
          { key: "terminal", label: "Terminal", render: (r: DeviceRecord) => r.terminal?.terminalCode ?? "—" },
          { key: "status", label: "Status", render: (r: DeviceRecord) => <StatusBadge status={r.status} /> },
          { key: "syncStatus", label: "Sync", render: (r: DeviceRecord) => <StatusBadge status={r.syncStatus} /> },
          { key: "lastActivity", label: "Last Activity", render: (r: DeviceRecord) => r.lastActivity ? new Date(r.lastActivity).toLocaleString("en-SA", { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" }) : "—" },
          { key: "behaviourProfile", label: "Behavior", render: (r: DeviceRecord) => <span className="text-xs">{r.behaviourProfile ?? "—"}</span> },
          {
            key: "a", label: "", render: (r: DeviceRecord) => (
              <div className="flex gap-1 justify-end">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setView(r)}><Eye className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEdit(r)}><Pencil className="h-4 w-4" /></Button>
              </div>
            )
          },
        ]} rows={filtered} />
      )}

      <Sheet open={!!view} onOpenChange={v => !v && setView(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{view?.deviceName} · Details</SheetTitle></SheetHeader>
          {view && (
            <div className="space-y-2 mt-4 text-sm">
              {([
                ["Type", view.deviceType.replace(/_/g, " ")],
                ["Serial #", view.serialNumber ?? "—"],
                ["Branch", view.branch?.name ?? "—"],
                ["Terminal", view.terminal?.terminalCode ?? "—"],
                ["Status", view.status],
                ["Sync", view.syncStatus],
                ["Last Activity", view.lastActivity ? new Date(view.lastActivity).toLocaleString() : "—"],
                ["Behavior", view.behaviourProfile ?? "—"],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-border/40 py-1.5">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-semibold">{v}</span>
                </div>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!edit} onOpenChange={v => !v && setEdit(null)}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>Edit {edit?.deviceName}</SheetTitle></SheetHeader>
          <div className="space-y-3 mt-4">
            <Field label="Device name" defaultValue={edit?.deviceName} />
            <Field label="Branch" defaultValue={edit?.branch?.name} />
            <Field label="Terminal mapping" defaultValue={edit?.terminal?.terminalCode} />
            <Field label="Behavior alert threshold" placeholder="e.g. temp > 45°C" />
          </div>
          <SheetFooter className="mt-4">
            <Button className="gradient-primary text-primary-foreground border-0" onClick={() => setEdit(null)}>Save</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}

function RegisterDeviceSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow">
          <Plus className="h-4 w-4" />Register Device
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>Register new device</SheetTitle></SheetHeader>
        <div className="space-y-3 mt-4">
          <Field label="Device name" placeholder="e.g. Olaya Printer #4" />
          <div className="space-y-1">
            <Label className="text-xs">Device type</Label>
            <Select defaultValue="Receipt Printer">
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Receipt Printer", "Barcode Scanner", "Cash Drawer", "Card Machine", "Kiosk Display", "Tablet (mPOS)"].map(o => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field label="Serial number" placeholder="SN-…" />
          <Field label="Branch" placeholder="Olaya" />
          <Field label="Terminal mapping" placeholder="TML-RYD-001" />
          <Field label="Behavior settings" placeholder="Alert on idle > 10m" />
        </div>
        <SheetFooter className="mt-4">
          <Button className="gradient-primary text-primary-foreground border-0">Register</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, defaultValue, placeholder }: { label: string; defaultValue?: string; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input className="h-9" defaultValue={defaultValue} placeholder={placeholder} />
    </div>
  );
}
