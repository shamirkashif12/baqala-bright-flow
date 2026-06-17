import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/module-placeholder";
import { Gift, Trophy, Pencil, Power, Trash2, Plus, Tag, PercentCircle } from "lucide-react";
import { api, type Coupon } from "@/lib/api";

export const Route = createFileRoute("/_app/coupons")({ component: Coupons });

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

type CouponForm = { name: string; code: string; type: string; value: string; startDate: string; endDate: string; usageLimit: string; status: string; };
const today = new Date().toISOString().slice(0, 10);
const emptyForm: CouponForm = { name: "", code: "", type: "percentage", value: "", startDate: today, endDate: "", usageLimit: "", status: "active" };

function CouponsTab() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editCoupon, setEditCoupon] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.getCoupons().then(setCoupons).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openCreate = () => { setEditCoupon(null); setForm(emptyForm); setSheetOpen(true); };
  const openEdit = (c: Coupon) => {
    setEditCoupon(c);
    setForm({ name: c.name, code: c.code, type: c.type, value: String(c.value), startDate: c.startDate?.slice(0, 10) ?? today, endDate: c.endDate?.slice(0, 10) ?? "", usageLimit: c.usageLimit != null ? String(c.usageLimit) : "", status: c.status });
    setSheetOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { name: form.name, code: form.code, type: form.type, value: Number(form.value), startDate: form.startDate, endDate: form.endDate, usageLimit: form.usageLimit ? Number(form.usageLimit) : undefined, status: form.status };
      if (editCoupon) {
        await api.updateCoupon(editCoupon.id, payload);
      } else {
        await api.createCoupon(payload);
      }
      setSheetOpen(false);
      load();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const handleDelete = async (c: Coupon) => {
    if (!confirm(`Delete coupon "${c.name}"?`)) return;
    await api.deleteCoupon(c.id);
    load();
  };

  const toggleStatus = async (c: Coupon) => {
    const next = c.status === "active" ? "inactive" : "active";
    await api.updateCoupon(c.id, { ...c, status: next });
    load();
  };

  const set = (k: keyof CouponForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));
  const setS = (k: keyof CouponForm) => (v: string) =>
    setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-10" onClick={openCreate}>
          <Plus className="h-4 w-4" /> Create Coupon
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
                  <th className="px-3 py-3 font-semibold">Name</th>
                  <th className="px-3 py-3 font-semibold">Code</th>
                  <th className="px-3 py-3 font-semibold">Type</th>
                  <th className="px-3 py-3 font-semibold">Value</th>
                  <th className="px-3 py-3 font-semibold">Used</th>
                  <th className="px-3 py-3 font-semibold">Limit</th>
                  <th className="px-3 py-3 font-semibold">Expires</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => (
                  <tr key={c.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-3 py-3 font-medium">{c.name}</td>
                    <td className="px-3 py-3 font-mono text-xs">{c.code}</td>
                    <td className="px-3 py-3"><Badge variant="outline" className="text-xs">{c.type}</Badge></td>
                    <td className="px-3 py-3">{c.type === "percentage" ? `${c.value}%` : `SAR ${c.value}`}</td>
                    <td className="px-3 py-3 tabular-nums">{c.usedCount ?? 0}</td>
                    <td className="px-3 py-3 tabular-nums">{c.usageLimit ?? "∞"}</td>
                    <td className="px-3 py-3 text-xs">{c.endDate ? new Date(c.endDate).toLocaleDateString("en-SA") : "—"}</td>
                    <td className="px-3 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className={`h-7 w-7 ${c.status === "active" ? "text-destructive" : "text-success"}`} title={c.status === "active" ? "Deactivate" : "Activate"} onClick={() => toggleStatus(c)}><Power className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {coupons.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-10 text-muted-foreground text-sm">No coupons found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Sheet open={sheetOpen} onOpenChange={v => !v && setSheetOpen(false)}>
        <SheetContent>
          <SheetHeader><SheetTitle>{editCoupon ? "Edit Coupon" : "Create Coupon"}</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-4">
            <FieldRow label="Coupon Name"><Input value={form.name} onChange={set("name")} className="h-9" placeholder="Summer Sale 2026" /></FieldRow>
            <FieldRow label="Code"><Input value={form.code} onChange={set("code")} className="h-9 font-mono uppercase" placeholder="SUMMER25" /></FieldRow>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Type">
                <Select value={form.type} onValueChange={setS("type")}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage %</SelectItem>
                    <SelectItem value="fixed">Fixed SAR</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Value"><Input type="number" value={form.value} onChange={set("value")} className="h-9" placeholder="25" /></FieldRow>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Start Date"><Input type="date" value={form.startDate} onChange={set("startDate")} className="h-9" /></FieldRow>
              <FieldRow label="End Date"><Input type="date" value={form.endDate} onChange={set("endDate")} className="h-9" /></FieldRow>
            </div>
            <FieldRow label="Usage Limit (leave blank for unlimited)"><Input type="number" value={form.usageLimit} onChange={set("usageLimit")} className="h-9" placeholder="∞" /></FieldRow>
            {editCoupon && (
              <FieldRow label="Status">
                <Select value={form.status} onValueChange={setS("status")}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
            )}
            <Button className="w-full gradient-primary text-primary-foreground border-0 mt-2" onClick={handleSave} disabled={saving || !form.name || !form.code}>
              {saving ? "Saving…" : "Save Coupon"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DiscountsTab() {
  return (
    <Card className="p-8 border-border/60 shadow-card text-center text-muted-foreground text-sm">
      <PercentCircle className="h-8 w-8 mx-auto mb-3 opacity-40" />
      Discount rules are managed through the Tax &amp; Fees module and the coupon engine above. Role-based discounts (staff, loyalty) are auto-applied at POS checkout.
    </Card>
  );
}

function OffersTab() {
  return (
    <Card className="p-8 border-border/60 shadow-card text-center text-muted-foreground text-sm">
      <Trophy className="h-8 w-8 mx-auto mb-3 opacity-40" />
      BOGO and bundle offers require a promotions engine integration. This will be available in a future release.
    </Card>
  );
}

function Coupons() {
  return (
    <PageShell title="Coupons & Promotions" subtitle="Codes · discount rules · special offers">
      <Tabs defaultValue="coupons">
        <div className="flex items-center justify-between mb-4">
          <TabsList>
            <TabsTrigger value="coupons" className="gap-1.5"><Tag className="h-3.5 w-3.5" />Coupons</TabsTrigger>
            <TabsTrigger value="discounts" className="gap-1.5"><PercentCircle className="h-3.5 w-3.5" />Discounts</TabsTrigger>
            <TabsTrigger value="offers" className="gap-1.5"><Gift className="h-3.5 w-3.5" />Offers</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="coupons" className="mt-0"><CouponsTab /></TabsContent>
        <TabsContent value="discounts" className="mt-0"><DiscountsTab /></TabsContent>
        <TabsContent value="offers" className="mt-0"><OffersTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
