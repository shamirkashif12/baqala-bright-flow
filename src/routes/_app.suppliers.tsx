import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/module-placeholder";
import { Truck, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { api, type Supplier } from "@/lib/api";

export const Route = createFileRoute("/_app/suppliers")({ component: Suppliers });

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}


type SupplierForm = { name: string; contactPerson: string; contactNumber: string; email: string; city: string; supplyType: string; status: string; };
const emptyForm: SupplierForm = { name: "", contactPerson: "", contactNumber: "", email: "", city: "", supplyType: "warehouse", status: "active" };

// Module-scope component — NOT inside SuppliersTab, so it never remounts on parent re-render
function SupplierFormFields({
  form,
  setForm,
  onSave,
  saving,
}: {
  form: SupplierForm;
  setForm: React.Dispatch<React.SetStateAction<SupplierForm>>;
  onSave: () => void;
  saving: boolean;
}) {
  const set = (k: keyof SupplierForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));
  const setS = (k: keyof SupplierForm) => (v: string) =>
    setForm(p => ({ ...p, [k]: v }));
  return (
    <div className="mt-4 space-y-3">
      <FieldRow label="Name"><Input value={form.name} onChange={set("name")} className="h-9" placeholder="Al-Barakah Trading" /></FieldRow>
      <FieldRow label="Contact Person"><Input value={form.contactPerson} onChange={set("contactPerson")} className="h-9" /></FieldRow>
      <FieldRow label="Phone"><Input value={form.contactNumber} onChange={set("contactNumber")} className="h-9" /></FieldRow>
      <FieldRow label="Email"><Input value={form.email} onChange={set("email")} className="h-9" type="email" /></FieldRow>
      <FieldRow label="City"><Input value={form.city} onChange={set("city")} className="h-9" /></FieldRow>
      <FieldRow label="Supply Type">
        <Select value={form.supplyType} onValueChange={setS("supplyType")}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="warehouse">Warehouse</SelectItem>
            <SelectItem value="both">Both (Direct + Warehouse)</SelectItem>
            <SelectItem value="mart_to_mart">Mart to Mart</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Status">
        <Select value={form.status} onValueChange={setS("status")}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewSupplier, setViewSupplier] = useState<Supplier | null>(null);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.getSuppliers().then(setSuppliers).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openEdit = (s: Supplier) => {
    setEditSupplier(s);
    setForm({ name: s.name, contactPerson: s.contactPerson ?? "", contactNumber: s.contactNumber ?? "", email: s.email ?? "", city: s.city ?? "", supplyType: s.supplyType ?? "warehouse", status: s.status });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editSupplier) {
        await api.updateSupplier(editSupplier.id, form);
        setEditSupplier(null);
      } else {
        await api.createSupplier(form);
        setCreateOpen(false);
      }
      load();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: Supplier) => {
    if (!confirm(`Deactivate supplier "${s.name}"?`)) return;
    await api.deleteSupplier(s.id);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-10" onClick={() => { setForm(emptyForm); setCreateOpen(true); }}>
          <Plus className="h-4 w-4" /> Add Supplier
        </Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 font-semibold">Code</th>
                  <th className="px-3 py-3 font-semibold">Name</th>
                  <th className="px-3 py-3 font-semibold">Contact</th>
                  <th className="px-3 py-3 font-semibold">Phone</th>
                  <th className="px-3 py-3 font-semibold">Supply Type</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-3 py-3 font-mono text-xs">{s.supplierCode}</td>
                    <td className="px-3 py-3 font-semibold">{s.name}</td>
                    <td className="px-3 py-3 text-xs">{s.contactPerson ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{s.contactNumber ?? "—"}</td>
                    <td className="px-3 py-3"><Badge variant="outline" className="text-xs capitalize">{s.supplyType ?? "—"}</Badge></td>
                    <td className="px-3 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewSupplier(s)}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(s)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {suppliers.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">No suppliers found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* View sheet */}
      <Sheet open={!!viewSupplier} onOpenChange={v => !v && setViewSupplier(null)}>
        <SheetContent>
          <SheetHeader><SheetTitle>{viewSupplier?.name}</SheetTitle></SheetHeader>
          {viewSupplier && (
            <div className="mt-4 space-y-3 text-sm">
              {([
                ["Code", viewSupplier.supplierCode],
                ["Contact Person", viewSupplier.contactPerson ?? "—"],
                ["Phone", viewSupplier.contactNumber ?? "—"],
                ["Email", viewSupplier.email ?? "—"],
                ["City", viewSupplier.city ?? "—"],
                ["Supply Type", viewSupplier.supplyType ?? "—"],
                ["Status", viewSupplier.status],
              ] as [string, string][]).map(([l, v]) => (
                <div key={l} className="flex justify-between border-b border-border/40 pb-2">
                  <span className="text-muted-foreground">{l}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit sheet */}
      <Sheet open={!!editSupplier} onOpenChange={v => !v && setEditSupplier(null)}>
        <SheetContent>
          <SheetHeader><SheetTitle>Edit Supplier</SheetTitle></SheetHeader>
          <SupplierFormFields form={form} setForm={setForm} onSave={handleSave} saving={saving} />
        </SheetContent>
      </Sheet>

      {/* Create sheet */}
      <Sheet open={createOpen} onOpenChange={v => !v && setCreateOpen(false)}>
        <SheetContent>
          <SheetHeader><SheetTitle>Add Supplier</SheetTitle></SheetHeader>
          <SupplierFormFields form={form} setForm={setForm} onSave={handleSave} saving={saving} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Suppliers() {
  return (
    <PageShell title="Suppliers" subtitle="Vendor management · warehouses · supply channels">
      <Tabs defaultValue="suppliers">
        <TabsList className="mb-4">
          <TabsTrigger value="suppliers" className="gap-1.5"><Truck className="h-3.5 w-3.5" />Suppliers</TabsTrigger>
        </TabsList>
        <TabsContent value="suppliers" className="mt-0"><SuppliersTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
