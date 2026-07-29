import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Warehouse as WarehouseIcon } from "lucide-react";
import { api, type Warehouse as WarehouseType } from "@/lib/api";
import { isValidSaudiPhone } from "@/lib/validation";

type WHForm = { name: string; code: string; address: string; city: string; contactPerson: string; contactNumber: string; capacity: string; status: string };
const emptyWHForm = (): WHForm => ({ name: "", code: "", address: "", city: "", contactPerson: "", contactNumber: "", capacity: "", status: "active" });

// Major Saudi cities — was a free-text field with no list to pick from.
const SAUDI_CITIES = [
  "Riyadh", "Jeddah", "Makkah", "Madinah", "Dammam", "Khobar", "Dhahran",
  "Taif", "Tabuk", "Buraidah", "Khamis Mushait", "Abha", "Najran", "Jazan",
  "Hail", "Al Ahsa", "Yanbu", "Jubail", "Qatif", "Sakaka",
];

export function WarehouseFormSheet({
  open, onOpenChange, warehouse, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void;
  warehouse?: WarehouseType | null; onSaved: () => void;
}) {
  const editing = !!warehouse;
  const [form, setForm] = useState<WHForm>(emptyWHForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Tracks whether the City field is showing the free-text "Other" input — separate from
  // form.city itself so picking "Other…" (which has no city name yet) doesn't collapse back to
  // the dropdown before the user has typed anything.
  const [otherCity, setOtherCity] = useState(false);

  useEffect(() => {
    if (open) {
      const city = warehouse?.city ?? "";
      setForm(warehouse
        ? { name: warehouse.name, code: warehouse.code, address: warehouse.address ?? "", city, contactPerson: warehouse.contactPerson ?? "", contactNumber: warehouse.contactNumber ?? "", capacity: String(warehouse.capacity ?? ""), status: warehouse.status }
        : emptyWHForm());
      setOtherCity(!!city && !SAUDI_CITIES.includes(city));
      setError("");
    }
  }, [open, warehouse]);

  const set = (k: keyof WHForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(p => ({ ...p, [k]: e.target.value }));
  const setS = (k: keyof WHForm) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.name.trim()) { setError("Warehouse name is required."); return; }
    if (!form.code.trim()) { setError("Warehouse code is required."); return; }
    if (form.contactNumber.trim() && !isValidSaudiPhone(form.contactNumber)) {
      setError("Enter a valid Saudi mobile number (05XXXXXXXX).");
      return;
    }
    setSaving(true); setError("");
    try {
      const payload = { name: form.name, code: form.code, address: form.address || undefined, city: form.city || undefined, contactPerson: form.contactPerson || undefined, contactNumber: form.contactNumber || undefined, capacity: form.capacity ? Number(form.capacity) : undefined, status: form.status };
      if (editing && warehouse) await api.updateWarehouse(warehouse.id, payload);
      else await api.createWarehouse(payload);
      onSaved(); onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={v => { onOpenChange(v); if (!v) setError(""); }}>
      <SheetContent className="w-[480px] overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border/60">
          <SheetTitle className="flex items-center gap-2">
            <WarehouseIcon className="h-5 w-5 text-primary" />
            {editing ? "Edit Warehouse" : "New Warehouse"}
          </SheetTitle>
        </SheetHeader>
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs font-medium">Warehouse Name <span className="text-destructive">*</span></Label>
              <Input value={form.name} onChange={set("name")} className="h-9" placeholder="Central Warehouse" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Code <span className="text-destructive">*</span></Label>
              <Input value={form.code} onChange={set("code")} className="h-9" placeholder="WH-001" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Capacity (units)</Label>
              <Input type="number" value={form.capacity} onChange={set("capacity")} className="h-9" placeholder="10000" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">City</Label>
              {otherCity ? (
                <Input value={form.city} onChange={set("city")} className="h-9" placeholder="Enter city name" autoFocus />
              ) : (
                <Select
                  value={form.city}
                  onValueChange={v => { if (v === "__other") { setOtherCity(true); setS("city")(""); } else setS("city")(v); }}
                >
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select city" /></SelectTrigger>
                  <SelectContent>
                    {SAUDI_CITIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    <SelectItem value="__other">Other…</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {otherCity && (
                <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => { setOtherCity(false); setS("city")(""); }}>
                  Choose from list instead
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Contact Person</Label>
              <Input value={form.contactPerson} onChange={set("contactPerson")} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Contact Number</Label>
              <Input value={form.contactNumber} onChange={set("contactNumber")} className="h-9" maxLength={17} placeholder="05XXXXXXXX" />
              {form.contactNumber.trim() && !isValidSaudiPhone(form.contactNumber) && (
                <p className="text-[11px] text-destructive">Enter a valid Saudi mobile number (05XXXXXXXX).</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Status</Label>
              <Select value={form.status} onValueChange={setS("status")}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Address</Label>
            <Textarea value={form.address} onChange={set("address")} rows={2} className="resize-none text-sm" placeholder="Full address…" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 pt-2 border-t border-border/60">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="flex-1 gradient-primary text-primary-foreground border-0" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Create Warehouse"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
