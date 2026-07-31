import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { Warehouse, PackageCheck, Truck, Store, Pencil, Eye } from "lucide-react";
import { api, type Supplier } from "@/lib/api";
import { usePermission } from "@/lib/use-permission";
import { toast } from "sonner";
import {
  isValidContactPersonName, isValidSaudiPhone, isValidSaudiCr, isValidSaudiVat,
  sanitizeNameInput, sanitizePhoneInput, PHONE_MAX_LENGTH, CONTACT_PERSON_MAX_LENGTH,
} from "@/lib/validation";

export const Route = createFileRoute("/_app/warehouse-suppliers")({ component: WarehouseSuppliers });

// Mirrors SUPPLIER_CATEGORIES/SAUDI_CITIES/PAYMENT_TERMS_OPTIONS in _app.suppliers.tsx — this
// "Quick Add" dialog must collect the same fields SuppliersController.ValidateRequiredForCreate
// requires (Address/Category/CR/VAT), or every create here 400s with no field to fix, and the
// filter bar needs parity with the main Suppliers tab rather than the free-text-only search it had.
const SUPPLIER_CATEGORIES = ["Food & Beverage", "Tobacco", "Packaging", "Cleaning & Hygiene", "General Goods", "Other"];
const SAUDI_CITIES = [
  "Riyadh", "Jeddah", "Makkah", "Madinah", "Dammam", "Khobar", "Dhahran",
  "Taif", "Tabuk", "Buraidah", "Khamis Mushait", "Abha", "Najran", "Jazan",
  "Hail", "Al Ahsa", "Yanbu", "Jubail", "Qatif", "Sakaka",
];
const PAYMENT_TERMS_OPTIONS = ["Net 30", "Net 60", "On Delivery", "Immediate", "COD", "Advance Payment"];

type WarehouseSupplierForm = {
  name: string; contactPerson: string; contactNumber: string; email: string; city: string; warehouseName: string;
  crNumber: string; vatNumber: string; address: string; category: string;
};
const emptyForm: WarehouseSupplierForm = {
  name: "", contactPerson: "", contactNumber: "", email: "", city: "", warehouseName: "",
  crNumber: "", vatNumber: "", address: "", category: "",
};

function WarehouseSuppliers() {
  const { canCreate, canEdit } = usePermission("Suppliers");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [cityFilter, setCityFilter] = useState<string[]>([]);
  const [paymentTermsFilter, setPaymentTermsFilter] = useState<string[]>([]);
  const [edit, setEdit] = useState<Supplier | null>(null);
  const [form, setForm] = useState<WarehouseSupplierForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
    setError("");
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
      crNumber: s.crNumber ?? "",
      vatNumber: s.vatNumber ?? "",
      address: s.address ?? "",
      category: s.category ?? "",
    });
    setError("");
    setEdit(s);
  };

  const handleSave = async () => {
    // Mirrors SuppliersController.ValidateRequiredForCreate — only enforced on create, same as
    // the main Suppliers page, so editing a legacy record missing these fields still works.
    if (!edit?.id) {
      if (!form.address.trim()) { setError("Address is required."); return; }
      if (!form.category.trim()) { setError("Supplier category is required."); return; }
      if (!form.crNumber.trim()) { setError("CR number is required."); return; }
      if (!form.vatNumber.trim()) { setError("VAT number is required."); return; }
    }
    if (form.crNumber.trim() && !isValidSaudiCr(form.crNumber)) {
      setError("Enter a valid CR number (10 digits).");
      return;
    }
    if (form.vatNumber.trim() && !isValidSaudiVat(form.vatNumber)) {
      setError("Enter a valid VAT number (15 digits, starting and ending with 3).");
      return;
    }
    if (form.contactPerson.trim() && !isValidContactPersonName(form.contactPerson)) {
      setError("Enter a valid contact person name (letters only).");
      return;
    }
    if (form.contactNumber.trim() && !isValidSaudiPhone(form.contactNumber)) {
      setError("Enter a valid Saudi mobile number (05XXXXXXXX).");
      return;
    }
    setError("");
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
    const mq = !needle
      || s.name.toLowerCase().includes(needle)
      || s.supplierCode.toLowerCase().includes(needle)
      || (s.city?.toLowerCase().includes(needle) ?? false)
      || (s.contactNumber?.toLowerCase().includes(needle) ?? false)
      || (s.crNumber?.toLowerCase().includes(needle) ?? false)
      || (s.vatNumber?.toLowerCase().includes(needle) ?? false);
    const ms = !(statusFilter.length && !statusFilter.includes(s.status));
    const mc = !(categoryFilter.length && !categoryFilter.includes(s.category ?? ""));
    const mcity = !(cityFilter.length && !cityFilter.includes(s.city ?? ""));
    const mpt = !(paymentTermsFilter.length && !paymentTermsFilter.includes(s.paymentTerms ?? ""));
    return mq && ms && mc && mcity && mpt;
  });

  return (
    <PageShell title="Warehouse Suppliers" subtitle="Bulk supply partners feeding all branches">
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
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
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-36">
          <SearchableMultiSelect
            placeholder="All Statuses"
            options={[{ id: "active", label: "Active" }, { id: "inactive", label: "Inactive" }]}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
        <div className="w-40">
          <SearchableMultiSelect
            placeholder="All Categories"
            options={SUPPLIER_CATEGORIES.map(c => ({ id: c, label: c }))}
            selected={categoryFilter}
            onChange={setCategoryFilter}
          />
        </div>
        <div className="w-36">
          <SearchableMultiSelect
            placeholder="All Cities"
            options={SAUDI_CITIES.map(c => ({ id: c, label: c }))}
            selected={cityFilter}
            onChange={setCityFilter}
          />
        </div>
        <div className="w-36">
          <SearchableMultiSelect
            placeholder="All Payment Terms"
            options={PAYMENT_TERMS_OPTIONS.map(t => ({ id: t, label: t }))}
            selected={paymentTermsFilter}
            onChange={setPaymentTermsFilter}
          />
        </div>
      </div>
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
      <Dialog open={!!edit} onOpenChange={(v) => { if (!v) { setEdit(null); setError(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Edit" : "Add"} Supplier</DialogTitle>
            <DialogDescription>Supply partner details.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} className="mt-1" /></div>
            <div><Label>Contact</Label><Input value={form.contactPerson} onChange={(e) => setForm(p => ({ ...p, contactPerson: sanitizeNameInput(e.target.value) }))} className="mt-1" maxLength={CONTACT_PERSON_MAX_LENGTH} /></div>
            <div><Label>Phone</Label><Input value={form.contactNumber} onChange={(e) => setForm(p => ({ ...p, contactNumber: sanitizePhoneInput(e.target.value) }))} className="mt-1" maxLength={PHONE_MAX_LENGTH} inputMode="numeric" placeholder="0501234567" /></div>
            <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))} className="mt-1" /></div>
            <div><Label>City</Label><Input value={form.city} onChange={(e) => setForm(p => ({ ...p, city: e.target.value }))} className="mt-1" /></div>
            <div><Label>Warehouse Name</Label><Input value={form.warehouseName} onChange={(e) => setForm(p => ({ ...p, warehouseName: e.target.value }))} className="mt-1" /></div>
            <div><Label>CR Number{!edit?.id && " *"}</Label><Input value={form.crNumber} onChange={(e) => setForm(p => ({ ...p, crNumber: e.target.value.replace(/\D/g, "").slice(0, 10) }))} className="mt-1" inputMode="numeric" maxLength={10} placeholder="10 digits" /></div>
            <div><Label>VAT Number{!edit?.id && " *"}</Label><Input value={form.vatNumber} onChange={(e) => setForm(p => ({ ...p, vatNumber: e.target.value.replace(/\D/g, "").slice(0, 15) }))} className="mt-1" inputMode="numeric" maxLength={15} placeholder="15 digits" /></div>
            <div><Label>Category{!edit?.id && " *"}</Label>
              <Select value={form.category} onValueChange={(v) => setForm(p => ({ ...p, category: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>{SUPPLIER_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Address{!edit?.id && " *"}</Label><Textarea value={form.address} onChange={(e) => setForm(p => ({ ...p, address: e.target.value }))} className="mt-1" rows={2} placeholder="Street, building, city, postal code" /></div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
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
