import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, MapPin, Phone, Plus, Pencil, Trash2 } from "lucide-react";
import { StatusBadge } from "@/components/module-placeholder";
import { api, type Branch } from "@/lib/api";

export const Route = createFileRoute("/_app/branches")({ component: Branches });

type BranchForm = {
  branchCode: string; name: string; nameAr: string;
  address: string; city: string; contactNumber: string; status: string;
};
const empty: BranchForm = { branchCode: "", name: "", nameAr: "", address: "", city: "", contactNumber: "", status: "active" };

function Branches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [editBranch, setEditBranch] = useState<Branch | null>(null);
  const [form, setForm] = useState<BranchForm>(empty);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.getBranches().then(setBranches).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openCreate = () => { setEditBranch(null); setForm(empty); setDlgOpen(true); };
  const openEdit = (b: Branch) => {
    setEditBranch(b);
    setForm({ branchCode: b.branchCode, name: b.name, nameAr: b.nameAr ?? "", address: b.address ?? "", city: b.city ?? "", contactNumber: b.contactNumber ?? "", status: b.status });
    setDlgOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editBranch) {
        await api.updateBranch(editBranch.id, form);
      } else {
        await api.createBranch(form);
      }
      setDlgOpen(false);
      load();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (b: Branch) => {
    if (!confirm(`Disable branch "${b.name}"?`)) return;
    await api.deleteBranch(b.id);
    load();
  };

  const set = (k: keyof BranchForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <PageShell title="Branches" subtitle="Multi-location management across the Kingdom">
      <div className="flex justify-end">
        <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-10" onClick={openCreate}>
          <Plus className="h-4 w-4" /> New Branch
        </Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {branches.map((b) => (
            <Card key={b.id} className="p-5 border-border/60 shadow-card hover:shadow-elegant transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
                    <Building2 className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{b.name}</h3>
                    <p className="text-xs text-muted-foreground font-mono">{b.branchCode}</p>
                  </div>
                </div>
                <StatusBadge status={b.status} />
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {b.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    <span>{b.address}{b.city ? `, ${b.city}` : ""}</span>
                  </div>
                )}
                {b.contactNumber && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span>{b.contactNumber}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm" className="flex-1 h-8" onClick={() => openEdit(b)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                <Button size="sm" variant="ghost" className="h-8 px-2 text-destructive hover:text-destructive" onClick={() => handleDelete(b)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
          {branches.length === 0 && (
            <p className="col-span-3 text-sm text-muted-foreground text-center py-10">No branches found.</p>
          )}
        </div>
      )}

      <Dialog open={dlgOpen} onOpenChange={v => !v && setDlgOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editBranch ? "Edit Branch" : "New Branch"}</DialogTitle>
            <DialogDescription>Branch details for the ECR Mart network.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Branch Code</Label>
                <Input value={form.branchCode} onChange={set("branchCode")} className="mt-1 h-9" placeholder="BR-001" />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Name (EN)</Label>
              <Input value={form.name} onChange={set("name")} className="mt-1 h-9" placeholder="Olaya — Riyadh HQ" />
            </div>
            <div>
              <Label className="text-xs">Name (AR)</Label>
              <Input value={form.nameAr} onChange={set("nameAr")} className="mt-1 h-9" dir="rtl" placeholder="الرياض — العليا" />
            </div>
            <div>
              <Label className="text-xs">Address</Label>
              <Input value={form.address} onChange={set("address")} className="mt-1 h-9" placeholder="King Fahd Rd, Olaya" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">City</Label>
                <Input value={form.city} onChange={set("city")} className="mt-1 h-9" placeholder="Riyadh" />
              </div>
              <div>
                <Label className="text-xs">Contact Number</Label>
                <Input value={form.contactNumber} onChange={set("contactNumber")} className="mt-1 h-9" placeholder="+966-11-" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgOpen(false)}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground border-0" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
