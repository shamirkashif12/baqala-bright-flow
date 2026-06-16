import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Warehouse, PackageCheck, Truck, Store, Pencil, Eye } from "lucide-react";
import { api, type Supplier } from "@/lib/api";

export const Route = createFileRoute("/_app/warehouse-suppliers")({ component: WarehouseSuppliers });

function WarehouseSuppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Supplier | null>(null);

  useEffect(() => {
    api.getSuppliers()
      .then(setSuppliers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const total = suppliers.length;
  const active = suppliers.filter(s => s.status === "active").length;
  const warehouseCount = suppliers.filter(s => s.supplyType === "warehouse" || s.supplyType === "both").length;
  const martCount = suppliers.filter(s => s.supplyType === "mart_to_mart" || s.supplyType === "both").length;

  return (
    <PageShell title="Warehouse Suppliers" subtitle="Bulk supply partners feeding all branches">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Suppliers" value={String(total)} icon={Warehouse} accent="primary" />
        <MetricCard label="Active" value={String(active)} icon={PackageCheck} accent="success" />
        <MetricCard label="Warehouse" value={String(warehouseCount)} icon={Truck} />
        <MetricCard label="Mart-to-Mart" value={String(martCount)} icon={Store} accent="warning" />
      </div>
      <Toolbar
        placeholder="Search suppliers…"
        primaryLabel="Add Supplier"
        extra={<Button size="sm" variant="outline" className="h-10" onClick={() => setEdit({} as Supplier)}>+ Quick Add</Button>}
      />
      {loading ? (
        <div className="text-muted-foreground text-sm py-6">Loading…</div>
      ) : (
        <DataTable
          columns={[
            { key: "supplierCode", label: "Code", render: (r: Supplier) => <span className="font-mono font-semibold">{r.supplierCode}</span> },
            { key: "name", label: "Supplier Name", render: (r: Supplier) => <span className="font-semibold">{r.name}</span> },
            { key: "contactPerson", label: "Contact", render: (r: Supplier) => r.contactPerson ?? "—" },
            { key: "contactNumber", label: "Phone", render: (r: Supplier) => r.contactNumber ?? "—" },
            { key: "email", label: "Email", render: (r: Supplier) => r.email ?? "—" },
            { key: "city", label: "City", render: (r: Supplier) => r.city ?? "—" },
            { key: "supplyType", label: "Type", render: (r: Supplier) => r.supplyType.replace(/_/g, " ") },
            { key: "status", label: "Status", render: (r: Supplier) => <StatusBadge status={r.status} /> },
            {
              key: "a", label: "", render: (r: Supplier) => (
                <div className="flex gap-1 justify-end">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEdit(r)}><Eye className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEdit(r)}><Pencil className="h-4 w-4" /></Button>
                </div>
              )
            },
          ]}
          rows={suppliers}
        />
      )}
      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Edit" : "Add"} Supplier</DialogTitle>
            <DialogDescription>Supply partner details.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Name</Label><Input defaultValue={edit?.name} className="mt-1" /></div>
            <div><Label>Contact</Label><Input defaultValue={edit?.contactPerson} className="mt-1" /></div>
            <div><Label>Phone</Label><Input defaultValue={edit?.contactNumber} className="mt-1" /></div>
            <div><Label>Email</Label><Input defaultValue={edit?.email} className="mt-1" /></div>
            <div><Label>City</Label><Input defaultValue={edit?.city} className="mt-1" /></div>
            <div><Label>Warehouse Name</Label><Input defaultValue={edit?.warehouseName} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground border-0" onClick={() => setEdit(null)}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
