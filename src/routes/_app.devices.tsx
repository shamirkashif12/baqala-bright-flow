import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { DataTable, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { HardDrive, Activity, Power, Wifi, Plus, Eye, Pencil, Battery, Thermometer, Signal } from "lucide-react";
import { api, type DeviceRecord, type Branch, type Terminal } from "@/lib/api";

export const Route = createFileRoute("/_app/devices")({ component: Devices });

function Field({ label, value, placeholder, onChange }: { label: string; value?: string; placeholder?: string; onChange?: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input className="h-9" value={value ?? ""} placeholder={placeholder} onChange={onChange ? e => onChange(e.target.value) : undefined} readOnly={!onChange} />
    </div>
  );
}

type DeviceForm = { deviceName: string; deviceType: string; serialNumber: string; branchId: string; terminalId: string; behaviourProfile: string; status: string; };
const emptyForm: DeviceForm = { deviceName: "", deviceType: "Receipt Printer", serialNumber: "", branchId: "", terminalId: "", behaviourProfile: "", status: "active" };

const DEVICE_TYPES = ["Receipt Printer", "Barcode Scanner", "Cash Drawer", "Card Machine", "Kiosk Display", "Tablet (mPOS)"];

function DeviceFormFields({ form, set, branches, terminals }: {
  form: DeviceForm;
  set: (k: keyof DeviceForm) => (v: string) => void;
  branches: Branch[];
  terminals: Terminal[];
}) {
  return (
    <div className="space-y-3 mt-4">
      <Field label="Device Name" value={form.deviceName} placeholder="Olaya Printer #4" onChange={set("deviceName")} />
      <div className="space-y-1">
        <Label className="text-xs">Device Type</Label>
        <Select value={form.deviceType} onValueChange={set("deviceType")}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DEVICE_TYPES.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Field label="Serial Number" value={form.serialNumber} placeholder="SN-…" onChange={set("serialNumber")} />
      <div className="space-y-1">
        <Label className="text-xs">Branch</Label>
        <Select value={form.branchId} onValueChange={set("branchId")}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Select branch" /></SelectTrigger>
          <SelectContent>
            {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Terminal Mapping</Label>
        <Select value={form.terminalId || "none"} onValueChange={v => set("terminalId")(v === "none" ? "" : v)}>
          <SelectTrigger className="h-9"><SelectValue placeholder="None" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— None —</SelectItem>
            {terminals.map(t => <SelectItem key={t.id} value={t.id}>{t.terminalCode} — {t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Status</Label>
        <Select value={form.status} onValueChange={set("status")}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="maintenance">Maintenance</SelectItem>
            <SelectItem value="offline">Offline</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Field label="Behavior Profile" value={form.behaviourProfile} placeholder="Alert on idle > 10m" onChange={set("behaviourProfile")} />
    </div>
  );
}

function Devices() {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<DeviceRecord | null>(null);
  const [edit, setEdit] = useState<DeviceRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<DeviceForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [br, setBr] = useState("All");
  const [st, setSt] = useState("All");

  const load = () => {
    setLoading(true);
    Promise.all([api.getDevices(), api.getBranches(), api.getTerminals()])
      .then(([d, b, t]) => { setDevices(d); setBranches(b); setTerminals(t); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => devices.filter(d =>
    (!q || `${d.deviceName} ${d.deviceType} ${d.serialNumber ?? ""}`.toLowerCase().includes(q.toLowerCase())) &&
    (br === "All" || d.branch?.name === br) &&
    (st === "All" || d.status === st)
  ), [devices, q, br, st]);

  const total = devices.length;
  const healthy = devices.filter(d => d.status === "active").length;
  const maintenance = devices.filter(d => d.status === "maintenance" || d.status === "offline").length;
  const synced = devices.filter(d => d.syncStatus === "synced").length;
  const branchList = ["All", ...Array.from(new Set(devices.map(d => d.branch?.name).filter((n): n is string => !!n)))];

  const openEdit = (d: DeviceRecord) => {
    setEdit(d);
    setForm({ deviceName: d.deviceName, deviceType: d.deviceType, serialNumber: d.serialNumber ?? "", branchId: d.branchId, terminalId: d.terminalId ?? "", behaviourProfile: d.behaviourProfile ?? "", status: d.status });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { deviceName: form.deviceName, deviceType: form.deviceType, serialNumber: form.serialNumber || undefined, branchId: form.branchId, terminalId: form.terminalId || undefined, behaviourProfile: form.behaviourProfile || undefined, status: form.status };
      if (edit) {
        await api.updateDevice(edit.id, payload);
        setEdit(null);
      } else {
        await api.createDevice(payload);
        setCreateOpen(false);
      }
      load();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const set = (k: keyof DeviceForm) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <PageShell title="Devices" subtitle="Hardware fleet + behavior in one place">
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
            <SelectContent>{branchList.map(o => <SelectItem key={o} value={o}>{o === "All" ? "All Branches" : o}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={st} onValueChange={setSt}>
            <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>{["All", "active", "maintenance", "offline"].map(o => <SelectItem key={o} value={o}>{o === "All" ? "All Status" : o}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9" onClick={() => { setForm(emptyForm); setCreateOpen(true); }}>
            <Plus className="h-4 w-4" /> Register Device
          </Button>
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
          {
            key: "a", label: "", render: (r: DeviceRecord) => (
              <div className="flex gap-1 justify-end">
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setView(r)}><Eye className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
              </div>
            )
          },
        ]} rows={filtered} />
      )}

      {/* View sheet */}
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

      {/* Edit sheet */}
      <Sheet open={!!edit} onOpenChange={v => !v && setEdit(null)}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>Edit {edit?.deviceName}</SheetTitle></SheetHeader>
          <DeviceFormFields form={form} set={set} branches={branches} terminals={terminals} />
          <SheetFooter className="mt-4">
            <Button className="gradient-primary text-primary-foreground border-0" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Create sheet */}
      <Sheet open={createOpen} onOpenChange={v => !v && setCreateOpen(false)}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>Register New Device</SheetTitle></SheetHeader>
          <DeviceFormFields form={form} set={set} branches={branches} terminals={terminals} />
          <SheetFooter className="mt-4">
            <Button className="gradient-primary text-primary-foreground border-0" onClick={handleSave} disabled={saving}>
              {saving ? "Registering…" : "Register"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
