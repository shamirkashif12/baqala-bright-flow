import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { HardDrive, Printer, ScanLine, Wifi, Cpu } from "lucide-react";

export const Route = createFileRoute("/_app/devices")({ component: Devices });

const devices = [
  { id: "DEV-1001", type: "Receipt Printer", model: "Epson TM-T88VI", branch: "Olaya", terminal: "POS-01", warranty: "Mar 2027", health: "98%", status: "online" },
  { id: "DEV-1002", type: "Barcode Scanner", model: "Honeywell 1900", branch: "Olaya", terminal: "POS-01", warranty: "Jun 2026", health: "100%", status: "online" },
  { id: "DEV-1003", type: "Cash Drawer", model: "APG Vasario", branch: "Olaya", terminal: "POS-01", warranty: "Feb 2028", health: "100%", status: "online" },
  { id: "DEV-1004", type: "Card Machine", model: "Ingenico Move/5000", branch: "Khobar", terminal: "POS-03", warranty: "Nov 2027", health: "85%", status: "maintenance" },
  { id: "DEV-1005", type: "Kiosk Display", model: "Elo 22\" Touch", branch: "Olaya", terminal: "KIOSK-01", warranty: "Aug 2028", health: "94%", status: "online" },
  { id: "DEV-1006", type: "Tablet (mPOS)", model: "Samsung Tab A9", branch: "Jeddah", terminal: "MOB-02", warranty: "Jan 2027", health: "78%", status: "syncing" },
];

function Devices() {
  return (
    <PageShell title="Devices" subtitle="Hardware fleet · health · warranty">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Devices" value="41" icon={HardDrive} accent="primary" />
        <MetricCard label="Healthy" value="38" delta="94%" trend="up" icon={Cpu} accent="success" />
        <MetricCard label="Maintenance" value="2" icon={Printer} accent="warning" />
        <MetricCard label="Network OK" value="11 / 12" icon={Wifi} />
      </div>
      <Toolbar placeholder="Search devices…" primaryLabel="Register Device" />
      <DataTable
        columns={[
          { key: "id", label: "Device ID", render: (r) => <span className="font-mono font-semibold">{r.id}</span> },
          { key: "type", label: "Type" },
          { key: "model", label: "Model" },
          { key: "branch", label: "Branch" },
          { key: "terminal", label: "Terminal" },
          { key: "warranty", label: "Warranty" },
          { key: "health", label: "Health" },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rows={devices}
      />
    </PageShell>
  );
}