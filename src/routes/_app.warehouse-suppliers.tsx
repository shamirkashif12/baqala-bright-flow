import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Warehouse, PackageCheck, ClipboardList, BadgeDollarSign, Pencil, Eye } from "lucide-react";

export const Route = createFileRoute("/_app/warehouse-suppliers")({ component: WarehouseSuppliers });

const rows = [
  { id: "WS-201", name: "Al Othaim Wholesale", contact: "Omar Al Othaim", phone: "+966 50 111 2233", email: "wholesale@othaim.sa", branch: "Central WH — Riyadh", city: "Riyadh", terms: "Net 30", status: "active", date: "12 Feb 26" },
  { id: "WS-202", name: "Panda Distribution", contact: "Hassan Al Mutairi", phone: "+966 55 222 3344", email: "supply@panda.sa", branch: "Jeddah WH", city: "Jeddah", terms: "Net 45", status: "active", date: "20 Feb 26" },
  { id: "WS-203", name: "Bin Dawood Logistics", contact: "Faisal Bin Dawood", phone: "+966 54 333 4455", email: "ops@bindawood.sa", branch: "Makkah WH", city: "Makkah", terms: "Net 30", status: "active", date: "01 Mar 26" },
  { id: "WS-204", name: "Hyper Tamimi WH", contact: "Saud Al Tamimi", phone: "+966 56 444 5566", email: "warehouse@tamimi.sa", branch: "Eastern WH — Khobar", city: "Khobar", terms: "Net 60", status: "inactive", date: "15 Mar 26" },
  { id: "WS-205", name: "LuLu Logistic Hub", contact: "Rashid Al Marri", phone: "+966 58 555 6677", email: "ksa@luluhub.sa", branch: "Dammam WH", city: "Dammam", terms: "Net 30", status: "active", date: "22 Mar 26" },
];

function WarehouseSuppliers() {
  const [edit, setEdit] = useState<any | null>(null);
  return (
    <PageShell title="Warehouse Suppliers" subtitle="Bulk supply partners feeding all branches">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Warehouses" value="12" icon={Warehouse} accent="primary" />
        <MetricCard label="Active POs" value="38" icon={ClipboardList} />
        <MetricCard label="Received (30d)" value="412" delta="+8%" trend="up" icon={PackageCheck} accent="success" />
        <MetricCard label="Outstanding" value="ر.س 184,200" icon={BadgeDollarSign} accent="warning" />
      </div>
      <Toolbar placeholder="Search warehouse suppliers…" primaryLabel="Add Warehouse Supplier" extra={<Button size="sm" variant="outline" className="h-10" onClick={() => setEdit({})}>+ Quick Add</Button>} />
      <DataTable
        columns={[
          { key: "id", label: "ID", render: (r) => <span className="font-mono font-semibold">{r.id}</span> },
          { key: "name", label: "Warehouse / Supplier" },
          { key: "contact", label: "Contact" },
          { key: "phone", label: "Phone" },
          { key: "city", label: "City" },
          { key: "branch", label: "Linked Warehouse" },
          { key: "terms", label: "Payment Terms" },
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
          <DialogHeader><DialogTitle>{edit?.id ? "Edit" : "Add"} Warehouse Supplier</DialogTitle><DialogDescription>Bulk supply partner details.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Name</Label><Input defaultValue={edit?.name} className="mt-1" /></div>
            <div><Label>Contact</Label><Input defaultValue={edit?.contact} className="mt-1" /></div>
            <div><Label>Phone</Label><Input defaultValue={edit?.phone} className="mt-1" /></div>
            <div><Label>Email</Label><Input defaultValue={edit?.email} className="mt-1" /></div>
            <div><Label>City</Label><Input defaultValue={edit?.city} className="mt-1" /></div>
            <div><Label>Payment Terms</Label><Input defaultValue={edit?.terms} className="mt-1" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button className="gradient-primary text-primary-foreground border-0" onClick={() => setEdit(null)}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}