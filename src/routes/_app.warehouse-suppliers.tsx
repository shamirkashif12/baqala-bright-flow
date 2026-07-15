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
import { usePermission } from "@/lib/use-permission";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/warehouse-suppliers")({ component: WarehouseSuppliers });

type WarehouseSupplierForm = {
  name: string; contactPerson: string; contactNumber: string; email: string; city: string; warehouseName: string;
};
const emptyForm: WarehouseSupplierForm = { name: "", contactPerson: "", contactNumber: "", email: "", city: "", warehouseName: "" };

function WarehouseSuppliers() {
  const { canCreate, canEdit } = usePermission("Suppliers");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Supplier | null>(null);
  const [form, setForm] = useState<WarehouseSupplierForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.getSuppliers()
      .then(setSuppliers)
      .catch(console.error)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openCreate = () => {
    setForm(emptyForm);
    setEdit({} as Supplier);
  };

  const openEdit = (s: Supplier) => {
    setForm({
      name: s.name,
      contactPerson: s.contactPerson ?? "",
      contactNumber: s.contactNumber ?? "",
      email: s.email ?? "",
      city: s.city ?? "",
      warehouseName: s.warehouseName ?? "",
    });
    setEdit(s);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // This page only manages warehouse-type suppliers: default new records to "warehouse",
      // and preserve whatever supplyType an existing record already had (e.g. "both") so editing
      // contact details here doesn't silently reclassify it.
      const payload: Partial<Supplier> = { ...form, supplyType: edit?.supplyType ?? "warehouse" };
      if (edit?.id) {
        await api.updateSupplier(edit.id, payload);
      } else {
        await api.createSupplier(payload);
      }
      setEdit(null);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to save supplier");
    } finally {
      setSaving(false);
    }
  };

  const total = suppliers.length;
  const active = suppliers.filter(s => s.status === "active").length;
  const warehouseCount = suppliers.filter(s => s.supplyType === "warehouse" || s.supplyType === "both").length;
  const martCount = suppliers.filter(s => s.supplyType === "mart_to_mart" || s.supplyType === "both").length;

  const filtered = suppliers.filter(s => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return s.name.toLowerCase().includes(needle)
      || s.supplierCode.toLowerCase().includes(needle)
      || (s.city?.toLowerCase().includes(needle) ?? false);
  });

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
        value={q}
        onChange={(e) => setQ(e.target.value)}
        primaryLabel={canCreate ? "Add Supplier" : undefined}
        extra={canCreate ? (
          <Button size="sm" variant="outline" className="h-10" onClick={openCreate}>+ Quick Add</Button>
        ) : undefined}
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
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)}><Eye className="h-4 w-4" /></Button>
                  {canEdit && <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>}
                </div>
              )
            },
          ]}
          rows={filtered}
        />
      )}
      <Dialog open={!!edit} onOpenChange={(v) => !v && setEdit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Edit" : "Add"} Supplier</DialogTitle>
            <DialogDescription>Supply partner details.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} className="mt-1" /></div>
            <div><Label>Contact</Label><Input value={form.contactPerson} onChange={(e) => setForm(p => ({ ...p, contactPerson: e.target.value }))} className="mt-1" /></div>
            <div><Label>Phone</Label><Input value={form.contactNumber} onChange={(e) => setForm(p => ({ ...p, contactNumber: e.target.value }))} className="mt-1" /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} className="mt-1" /></div>
            <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm(p => ({ ...p, city: e.target.value }))} className="mt-1" /></div>
            <div><Label>Warehouse Name</Label><Input value={form.warehouseName} onChange={(e) => setForm(p => ({ ...p, warehouseName: e.target.value }))} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground border-0" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
