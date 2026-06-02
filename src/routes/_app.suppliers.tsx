import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Truck, FileText, AlertCircle, Star } from "lucide-react";

export const Route = createFileRoute("/_app/suppliers")({ component: Suppliers });

const suppliers = [
  { code: "SUP-001", name: "Almarai Company", contact: "Mohammed Al Otaibi", phone: "+966 50 123 4567", vat: "300012345600003", dues: "ر.س 12,400", rating: 5, status: "active" },
  { code: "SUP-002", name: "Nadec Foods", contact: "Khalid Al Shehri", phone: "+966 55 234 5678", vat: "300023456700003", dues: "ر.س 8,200", rating: 5, status: "active" },
  { code: "SUP-003", name: "Al Rabie Saudi Foods", contact: "Sara Al Qahtani", phone: "+966 56 345 6789", vat: "300034567800003", dues: "ر.س 0", rating: 4, status: "paid" },
  { code: "SUP-004", name: "Sadia Saudi Arabia", contact: "Faisal Al Harbi", phone: "+966 53 456 7890", vat: "300045678900003", dues: "ر.س 7,800", rating: 4, status: "overdue" },
  { code: "SUP-005", name: "Al Othman Agri.", contact: "Yousef Al Dossari", phone: "+966 50 567 8901", vat: "300056789000003", dues: "ر.س 0", rating: 3, status: "inactive" },
];

function Suppliers() {
  return (
    <PageShell title="Suppliers" subtitle="Manage vendors, POs and dues">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active Suppliers" value="38" icon={Truck} accent="primary" />
        <MetricCard label="Open POs" value="12" hint="ر.س 84,200" icon={FileText} />
        <MetricCard label="Overdue Dues" value="ر.س 7,800" trend="down" icon={AlertCircle} accent="destructive" />
        <MetricCard label="Avg Rating" value="4.6 / 5" icon={Star} accent="warning" />
      </div>
      <Toolbar placeholder="Search suppliers, CR, VAT…" primaryLabel="New Supplier" />
      <DataTable
        columns={[
          { key: "name", label: "Supplier", render: (r) => (
            <div>
              <p className="font-semibold text-sm">{r.name}</p>
              <p className="text-xs text-muted-foreground">{r.code} · VAT {r.vat}</p>
            </div>
          )},
          { key: "contact", label: "Contact", render: (r) => (
            <div><p className="text-sm">{r.contact}</p><p className="text-xs text-muted-foreground">{r.phone}</p></div>
          )},
          { key: "dues", label: "Dues", render: (r) => <span className={r.dues !== "ر.س 0" ? "font-semibold text-destructive" : "text-muted-foreground"}>{r.dues}</span> },
          { key: "rating", label: "Rating", render: (r) => (
            <div className="flex gap-0.5">{Array.from({length: 5}).map((_, i) => <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? "fill-warning text-warning" : "text-muted"}`} />)}</div>
          )},
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
        ]}
        rows={suppliers}
      />
    </PageShell>
  );
}