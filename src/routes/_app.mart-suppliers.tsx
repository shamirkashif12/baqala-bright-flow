import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Store, Repeat, BadgeDollarSign, Network, Pencil, Eye } from "lucide-react";

export const Route = createFileRoute("/_app/mart-suppliers")({ component: MartSuppliers });

const rows = [
  { id: "MS-401", name: "Olaya Branch → Khobar", contact: "Internal · Branch swap", phone: "+966 11 555 0102", email: "olaya@mimoney.sa", city: "Riyadh ↔ Khobar", terms: "Net 0", status: "active", date: "01 May 26" },
  { id: "MS-402", name: "Al Mansour Mart", contact: "Mansour Al Shehri", phone: "+966 50 778 8899", email: "mansour@martnet.sa", city: "Jeddah", terms: "Net 14", status: "active", date: "15 Apr 26" },
  { id: "MS-403", name: "Al Salam Mini Mart", contact: "Salem Al Zahrani", phone: "+966 55 661 7788", email: "salem@salam.sa", city: "Madinah", terms: "Net 7", status: "active", date: "22 Mar 26" },
  { id: "MS-404", name: "Tamimi Express", contact: "Khalid Al Tamimi", phone: "+966 54 990 1122", email: "express@tamimi.sa", city: "Dammam", terms: "Net 30", status: "inactive", date: "10 Mar 26" },
];

function MartSuppliers() {
  const [edit, setEdit] = useState<any | null>(null);
  return (
    <PageShell title="Mart-to-Mart Suppliers" subtitle="Peer mart partners for stock swaps and overflow supply">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Partner Marts" value="18" icon={Store} accent="primary" />
        <MetricCard label="Swaps (30d)" value="46" icon={Repeat} accent="success" />
        <MetricCard label="Network Cities" value="9" icon={Network} />
        <MetricCard label="Settlements Due" value="ر.س 12,840" icon={BadgeDollarSign} accent="warning" />
      </div>
      <Toolbar placeholder="Search partner marts…" primaryLabel="Add Mart Partner" extra={<Button size="sm" variant="outline" className="h-10" onClick={() => setEdit({})}>+ Quick Add</Button>} />
      <DataTable
        columns={[
          { key: "id", label: "ID", render: (r) => <span className="font-mono font-semibold">{r.id}</span> },
          { key: "name", label: "Mart Partner" },
          { key: "contact", label: "Contact" },
          { key: "phone", label: "Phone" },
          { key: "city", label: "City" },
          { key: "terms", label: "Terms" },
          { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
          { key: "a", label: "", render: (r) => (
            <div className="flex gap-1 justify-end">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEdit(r)}><Eye className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEdit(r)}><Pencil className="h-4 w-4" /></Button>
            </div>
          ) },
        ]}
        rows={rows}
      />
      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{edit?.id ? "Edit" : "Add"} Mart Partner</DialogTitle><DialogDescription>Peer mart for stock swaps.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Mart Name</Label><Input defaultValue={edit?.name} className="mt-1" /></div>
            <div><Label>Contact</Label><Input defaultValue={edit?.contact} className="mt-1" /></div>
            <div><Label>Phone</Label><Input defaultValue={edit?.phone} className="mt-1" /></div>
            <div><Label>Email</Label><Input defaultValue={edit?.email} className="mt-1" /></div>
            <div><Label>City</Label><Input defaultValue={edit?.city} className="mt-1" /></div>
            <div><Label>Terms</Label><Input defaultValue={edit?.terms} className="mt-1" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button className="gradient-primary text-primary-foreground border-0" onClick={() => setEdit(null)}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}