import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { DataTable, StatusBadge, FilterField } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Wrench, Monitor, WifiOff, AlertOctagon, Search, RefreshCw, Ticket, X } from "lucide-react";
import { api, type DeviceRecord, type MaintenanceTicketRecord } from "@/lib/api";
import { toast } from "sonner";

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
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState("");

  // Ticket dialog
  const [dlgOpen, setDlgOpen]   = useState(false);
  const [form, setForm]         = useState<TicketForm>(emptyTicket);
  const [saving, setSaving]     = useState(false);
  const [tickets, setTickets]   = useState<MaintenanceTicketRecord[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [viewTab, setViewTab]   = useState<"devices" | "tickets">("devices");
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketStatusFilter, setTicketStatusFilter] = useState("all");
  const [ticketBranchFilter, setTicketBranchFilter] = useState("all");

  const reload = () => {
    setLoading(true);
    api.getDevices()
      .then(d => { setDevices(d); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  const reloadTickets = () => {
    setTicketsLoading(true);
    api.getMaintenanceTickets()
      .then(setTickets)
      .catch(() => toast.error("Failed to load tickets."))
      .finally(() => setTicketsLoading(false));
  };

  useEffect(() => { reload(); reloadTickets(); }, []);

  const filtered = devices.filter(d =>
    !q
    || d.deviceName.toLowerCase().includes(q.toLowerCase())
    || d.deviceType.toLowerCase().includes(q.toLowerCase())
    || d.branch?.name?.toLowerCase().includes(q.toLowerCase())
  );

  const online     = devices.filter(d => d.status === "active").length;
  const offline    = devices.filter(d => d.status !== "active").length;
  const syncIssues = devices.filter(d => d.syncStatus !== "synced").length;

  const ticketBranches = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tickets) if (t.device?.branch) map.set(t.device.branch.id, t.device.branch.name);
    return [...map.entries()];
  }, [tickets]);

  const hasTicketFilters = !!ticketSearch || ticketStatusFilter !== "all" || ticketBranchFilter !== "all";
  const clearTicketFilters = () => { setTicketSearch(""); setTicketStatusFilter("all"); setTicketBranchFilter("all"); };

  const filteredTickets = tickets.filter(t => {
    const matchSearch = !ticketSearch || t.id.toLowerCase().includes(ticketSearch.toLowerCase().replace(/^#/, ""));
    const matchStatus = ticketStatusFilter === "all" || t.status === ticketStatusFilter;
    const matchBranch = ticketBranchFilter === "all" || t.device?.branch?.id === ticketBranchFilter;
    return matchSearch && matchStatus && matchBranch;
  });

  const openIssuesByDevice = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tickets) {
      if (t.status === "resolved") continue;
      map.set(t.deviceId, (map.get(t.deviceId) ?? 0) + 1);
    }
    return map;
  }, [tickets]);

  const onChange = (k: keyof TicketForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(p => ({ ...p, [k]: e.target.value }));

  const onSelectChange = (k: keyof TicketForm) => (v: string) =>
    setForm(p => ({ ...p, [k]: v }));

  const updateTicketStatus = (id: string, status: TicketStatus) => {
    // Optimistic update — reconciled by reload() below, which also picks up the device-status
    // side effect (e.g. resolving the last open ticket brings the device back to "active").
    setTickets(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    api.updateMaintenanceTicketStatus(id, status)
      .then(() => { reload(); reloadTickets(); })
      .catch(() => { toast.error("Failed to update ticket status."); reloadTickets(); });
  };

  const handleSubmit = () => {
    setSaving(true);
    api.createMaintenanceTicket({
      deviceId: form.deviceId,
      issueType: form.issueType,
      priority: form.priority,
      description: form.description,
      reportedBy: form.reportedBy || undefined,
    })
      .then(() => {
        setForm(emptyTicket);
        setDlgOpen(false);
        setViewTab("tickets");
        reloadTickets();
        reload(); // device status flips to "maintenance" server-side
      })
      .catch((e: any) => toast.error(e?.message || "Failed to submit ticket."))
      .finally(() => setSaving(false));
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
      {loadError && <LoadErrorBanner onRetry={reload} />}
      {/* Metrics */}
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
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
                  key: "openIssues", label: "Open Issues",
                  render: d => {
                    const count = openIssuesByDevice.get(d.id) ?? 0;
                    return count > 0
                      ? <Badge variant="outline" className="text-xs bg-destructive/15 text-destructive border-destructive/30">{count}</Badge>
                      : <span className="text-xs text-muted-foreground">—</span>;
                  },
                },
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
        ticketsLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            No tickets yet. Click <strong>New Ticket</strong> to report a device issue.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3 mb-4">
              <FilterField label="Ticket Number" className="w-40">
                <Input placeholder="#A1B2C3D4" className="h-9" value={ticketSearch} onChange={e => setTicketSearch(e.target.value)} />
              </FilterField>
              <FilterField label="Status" className="w-40">
                <Select value={ticketStatusFilter} onValueChange={setTicketStatusFilter}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {TICKET_STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField label="Branch" className="w-40">
                <Select value={ticketBranchFilter} onValueChange={setTicketBranchFilter}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Branches</SelectItem>
                    {ticketBranches.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterField>
              {hasTicketFilters && (
                <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-xs" onClick={clearTicketFilters}>
                  <X className="h-3.5 w-3.5" /> Clear Filters
                </Button>
              )}
            </div>
            {filteredTickets.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No tickets match the current filters.</p>
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
              { key: "deviceName", label: "Device",     render: t => t.device?.deviceName ?? "Unknown" },
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
            rows={filteredTickets}
          />
            )}
          </>
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
