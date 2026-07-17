import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { DataTable, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Wrench, Monitor, WifiOff, AlertOctagon, Search, RefreshCw, Ticket } from "lucide-react";
import { api, type DeviceRecord } from "@/lib/api";
import { uuid } from "@/lib/utils";

export const Route = createFileRoute("/_app/maintenance")({ component: Maintenance });

const SYNC_CLASS: Record<string, string> = {
  synced:  "bg-success/15 text-success border-success/30",
  pending: "bg-warning/20 text-warning-foreground border-warning/30",
  failed:  "bg-destructive/15 text-destructive border-destructive/30",
  error:   "bg-destructive/15 text-destructive border-destructive/30",
};

const ISSUE_TYPES = ["Hardware Failure", "Sync Issue", "Network Issue", "Software Error", "Printer Jam", "Screen Issue", "Power Issue", "Other"];
const PRIORITIES  = ["low", "medium", "high", "critical"];
const PRIORITY_CLASS: Record<string, string> = {
  low:      "bg-muted text-muted-foreground",
  medium:   "bg-blue-100 text-blue-700",
  high:     "bg-warning/20 text-warning-foreground",
  critical: "bg-destructive/15 text-destructive",
};

type TicketForm = { deviceId: string; issueType: string; priority: string; description: string; reportedBy: string; };
const emptyTicket: TicketForm = { deviceId: "", issueType: "", priority: "medium", description: "", reportedBy: "" };

type TicketStatus = "open" | "in_progress" | "resolved";
type Ticket = TicketForm & { id: string; status: TicketStatus; createdAt: string; deviceName: string; };

const TICKET_STATUSES: { value: TicketStatus; label: string }[] = [
  { value: "open",        label: "Open" },
  { value: "in_progress", label: "In Repair" },
  { value: "resolved",    label: "Ready to Use" },
];

const TICKET_STATUS_CLASS: Record<TicketStatus, string> = {
  open:        "bg-warning/20 text-warning-foreground border-warning/30",
  in_progress: "bg-blue-100 text-blue-700 border-blue-200",
  resolved:    "bg-success/15 text-success border-success/30",
};

// ── Module-level form — avoids focus-loss on every keystroke ─────────────────
function TicketFormFields({
  form, devices, saving,
  onChange, onSelectChange, onSave, onCancel,
}: {
  form: TicketForm;
  devices: DeviceRecord[];
  saving: boolean;
  onChange: (k: keyof TicketForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onSelectChange: (k: keyof TicketForm) => (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="grid gap-3">
      <div>
        <Label className="text-xs">Device *</Label>
        <Select value={form.deviceId} onValueChange={onSelectChange("deviceId")}>
          <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select device" /></SelectTrigger>
          <SelectContent>
            {devices.map(d => (
              <SelectItem key={d.id} value={d.id}>
                {d.deviceName} — {d.branch?.name ?? "No branch"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Issue Type *</Label>
          <Select value={form.issueType} onValueChange={onSelectChange("issueType")}>
            <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="Select issue" /></SelectTrigger>
            <SelectContent>
              {ISSUE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Priority</Label>
          <Select value={form.priority} onValueChange={onSelectChange("priority")}>
            <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRIORITIES.map(p => (
                <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs">Description *</Label>
        <Textarea
          value={form.description}
          onChange={onChange("description")}
          placeholder="Describe the issue in detail…"
          className="mt-1 min-h-[90px] resize-none"
        />
      </div>

      <div>
        <Label className="text-xs">Reported By</Label>
        <Input value={form.reportedBy} onChange={onChange("reportedBy")} className="mt-1 h-9" placeholder="Your name or staff ID" />
      </div>

      <DialogFooter className="pt-1">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button
          className="gradient-primary text-primary-foreground border-0"
          onClick={onSave}
          disabled={saving || !form.deviceId || !form.issueType || !form.description.trim()}
        >
          {saving ? "Submitting…" : "Submit Ticket"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function Maintenance() {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  // Ticket dialog
  const [dlgOpen, setDlgOpen]   = useState(false);
  const [form, setForm]         = useState<TicketForm>(emptyTicket);
  const [saving, setSaving]     = useState(false);
  const [tickets, setTickets]   = useState<Ticket[]>([]);
  const [viewTab, setViewTab]   = useState<"devices" | "tickets">("devices");

  const reload = () => {
    setLoading(true);
    api.getDevices().then(setDevices).finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, []);

  const filtered = devices.filter(d =>
    !q
    || d.deviceName.toLowerCase().includes(q.toLowerCase())
    || d.deviceType.toLowerCase().includes(q.toLowerCase())
    || d.branch?.name?.toLowerCase().includes(q.toLowerCase())
  );

  const online     = devices.filter(d => d.status === "online").length;
  const offline    = devices.filter(d => d.status !== "online").length;
  const syncIssues = devices.filter(d => d.syncStatus !== "synced").length;

  const onChange = (k: keyof TicketForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }));

  const onSelectChange = (k: keyof TicketForm) => (v: string) =>
    setForm(p => ({ ...p, [k]: v }));

  const updateTicketStatus = (id: string, status: TicketStatus) =>
    setTickets(prev => prev.map(t => t.id === id ? { ...t, status } : t));

  const handleSubmit = () => {
    setSaving(true);
    const device = devices.find(d => d.id === form.deviceId);
    const ticket: Ticket = {
      ...form,
      id: uuid(),
      status: "open",
      createdAt: new Date().toISOString(),
      deviceName: device?.deviceName ?? "Unknown",
    };
    setTimeout(() => {
      setTickets(prev => [ticket, ...prev]);
      setForm(emptyTicket);
      setDlgOpen(false);
      setSaving(false);
      setViewTab("tickets");
    }, 600);
  };

  return (
    <PageShell
      title="Maintenance & Support"
      subtitle="Device health · sync status · service history"
      actions={
        <Button
          size="sm"
          className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5"
          onClick={() => { setForm(emptyTicket); setDlgOpen(true); }}
        >
          <Ticket className="h-4 w-4" /> New Ticket
        </Button>
      }
    >
      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Devices"        value={loading ? "—" : String(devices.length)} icon={Monitor}      accent="primary" />
        <MetricCard label="Online"               value={loading ? "—" : String(online)}          icon={Wrench}       accent="success" />
        <MetricCard label="Offline / Maintenance"value={loading ? "—" : String(offline)}         icon={WifiOff}      accent="warning" />
        <MetricCard label="Sync Issues"          value={loading ? "—" : String(syncIssues)}      icon={AlertOctagon} accent="destructive" />
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-border/60">
        {(["devices", "tickets"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setViewTab(tab)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              viewTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "devices" ? "Devices" : `Tickets${tickets.length ? ` (${tickets.length})` : ""}`}
          </button>
        ))}
      </div>

      {viewTab === "devices" && (
        <>
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search devices…" className="h-9 pl-8" />
            </div>
            <Button size="icon" variant="outline" className="h-9 w-9" onClick={reload}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
          ) : (
            <DataTable
              columns={[
                {
                  key: "deviceName", label: "Device",
                  render: d => (
                    <div>
                      <p className="font-semibold">{d.deviceName}</p>
                      <p className="text-xs text-muted-foreground font-mono">{d.serialNumber ?? d.id.slice(0, 8)}</p>
                    </div>
                  ),
                },
                { key: "deviceType", label: "Type",     render: d => <span className="text-xs">{d.deviceType}</span> },
                { key: "branch",     label: "Branch",   render: d => d.branch?.name ?? "—" },
                { key: "terminal",   label: "Terminal", render: d => d.terminal?.terminalCode ?? "—" },
                { key: "status",     label: "Status",   render: d => <StatusBadge status={d.status} /> },
                {
                  key: "syncStatus", label: "Sync",
                  render: d => (
                    <Badge variant="outline" className={`text-xs ${SYNC_CLASS[d.syncStatus] ?? "bg-muted text-muted-foreground border-border"}`}>
                      {d.syncStatus}
                    </Badge>
                  ),
                },
                {
                  key: "lastActivity", label: "Last Active",
                  render: d => d.lastActivity
                    ? <span className="text-xs text-muted-foreground">{new Date(d.lastActivity).toLocaleString("en-SA")}</span>
                    : <span className="text-xs text-muted-foreground">—</span>,
                },
                {
                  key: "id", label: "",
                  render: d => (
                    <Button
                      size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => { setForm({ ...emptyTicket, deviceId: d.id }); setDlgOpen(true); }}
                    >
                      + Ticket
                    </Button>
                  ),
                },
              ]}
              rows={filtered}
            />
          )}
        </>
      )}

      {viewTab === "tickets" && (
        tickets.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            No tickets yet. Click <strong>New Ticket</strong> to report a device issue.
          </div>
        ) : (
          <DataTable
            columns={[
              {
                key: "id", label: "Ticket",
                render: t => (
                  <div>
                    <p className="font-mono text-xs font-semibold">#{t.id.slice(0, 8).toUpperCase()}</p>
                    <p className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleString("en-SA")}</p>
                  </div>
                ),
              },
              { key: "deviceName", label: "Device",     render: t => t.deviceName },
              { key: "issueType",  label: "Issue",      render: t => t.issueType },
              {
                key: "priority", label: "Priority",
                render: t => (
                  <Badge className={`text-xs capitalize border-0 ${PRIORITY_CLASS[t.priority]}`}>{t.priority}</Badge>
                ),
              },
              {
                key: "status", label: "Status",
                render: t => (
                  <Select value={t.status} onValueChange={v => updateTicketStatus(t.id, v as TicketStatus)}>
                    <SelectTrigger className={`h-7 text-xs w-36 border font-medium ${TICKET_STATUS_CLASS[t.status as TicketStatus]}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TICKET_STATUSES.map(s => (
                        <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ),
              },
              { key: "reportedBy",  label: "Reported By",  render: t => t.reportedBy || "—" },
              { key: "description", label: "Description",  render: t => <span className="text-xs text-muted-foreground line-clamp-1">{t.description}</span> },
            ]}
            rows={tickets}
          />
        )
      )}

      {/* New Ticket Dialog */}
      <Dialog open={dlgOpen} onOpenChange={v => !v && setDlgOpen(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Support Ticket</DialogTitle>
            <DialogDescription>Report a device issue or request maintenance.</DialogDescription>
          </DialogHeader>
          <TicketFormFields
            form={form}
            devices={devices}
            saving={saving}
            onChange={onChange}
            onSelectChange={onSelectChange}
            onSave={handleSubmit}
            onCancel={() => setDlgOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
