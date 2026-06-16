import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge, Toolbar } from "@/components/module-placeholder";
import { Truck, Warehouse, Store, ClipboardCheck, Eye, Pencil, Star, Plus } from "lucide-react";
import { api, type Supplier } from "@/lib/api";

export const Route = createFileRoute("/_app/suppliers")({ component: Suppliers });

const warehousesList = [
  { id: "w1", name: "Central Warehouse", city: "Riyadh", capacity: "5000 sqm", manager: "Ahmed Hassan", status: "active" },
  { id: "w2", name: "North Store", city: "Riyadh", capacity: "800 sqm", manager: "Khalid Omar", status: "active" },
  { id: "w3", name: "Jeddah Distribution", city: "Jeddah", capacity: "3200 sqm", manager: "Sara Mansour", status: "active" },
];

const supplies = [
  { id: "s1", name: "Fresh Produce", partner: "Al-Barakah Farms", channel: "direct", branch: "All", status: "active" },
  { id: "s2", name: "Dairy Products", partner: "Nadec", channel: "distributor", branch: "Riyadh", status: "active" },
  { id: "s3", name: "Packaged Goods", partner: "Almarai", channel: "distributor", branch: "All", status: "active" },
  { id: "s4", name: "Beverages", partner: "Pepsi KSA", channel: "direct", branch: "Jeddah", status: "inactive" },
];

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

function StarRating({ n }: { n: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} className={`h-3.5 w-3.5 ${i <= n ? "fill-warning text-warning" : "text-muted-foreground/40"}`} />
      ))}
    </div>
  );
}

function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewSupplier, setViewSupplier] = useState<Supplier | null>(null);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);

  useEffect(() => {
    api.getSuppliers()
      .then(setSuppliers)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <Toolbar placeholder="Search by name or code…" extra={
        <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-10">
          <Plus className="h-4 w-4" /> Add Supplier
        </Button>
      } />

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
                  <th className="px-3 py-3 font-semibold">Rating</th>
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
                    <td className="px-3 py-3"><Badge variant="outline" className="text-xs">{s.supplyType ?? "—"}</Badge></td>
                    <td className="px-3 py-3"><StarRating n={s.rating ?? 4} /></td>
                    <td className="px-3 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewSupplier(s)}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditSupplier(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {suppliers.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">No suppliers found.</td></tr>
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
              {[
                ["Code", viewSupplier.supplierCode],
                ["Contact Person", viewSupplier.contactPerson ?? "—"],
                ["Phone", viewSupplier.contactNumber ?? "—"],
                ["Email", viewSupplier.email ?? "—"],
                ["City", viewSupplier.city ?? "—"],
                ["Supply Type", viewSupplier.supplyType ?? "—"],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between border-b border-border/40 pb-2">
                  <span className="text-muted-foreground">{l}</span><span className="font-medium">{v}</span>
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
          <div className="mt-4 space-y-4">
            <FieldRow label="Name"><Input defaultValue={editSupplier?.name ?? ""} /></FieldRow>
            <FieldRow label="Contact Person"><Input defaultValue={editSupplier?.contactPerson ?? ""} /></FieldRow>
            <FieldRow label="Phone"><Input defaultValue={editSupplier?.contactNumber ?? ""} /></FieldRow>
            <FieldRow label="Email"><Input defaultValue={editSupplier?.email ?? ""} /></FieldRow>
            <FieldRow label="City"><Input defaultValue={editSupplier?.city ?? ""} /></FieldRow>
            <FieldRow label="Supply Type"><Input defaultValue={editSupplier?.supplyType ?? ""} /></FieldRow>
            <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={() => setEditSupplier(null)}>Save</Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function WarehousesTab() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {warehousesList.map((w) => (
        <Card key={w.id} className="p-5 border-border/60 shadow-card hover:shadow-elegant transition-all">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 rounded-2xl bg-primary/15 flex items-center justify-center text-primary">
              <Warehouse className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{w.name}</p>
              <p className="text-xs text-muted-foreground">{w.city}</p>
            </div>
            <StatusBadge status={w.status} />
          </div>
          <div className="mt-4 space-y-1 text-xs text-muted-foreground">
            <p>Capacity: {w.capacity}</p>
            <p>Manager: {w.manager}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}

function SuppliesTab() {
  const [channel, setChannel] = useState("all");
  const [partner, setPartner] = useState("");
  const [branch, setBranch] = useState("all");

  const filtered = supplies.filter(s => {
    const matchCh = channel === "all" || s.channel === channel;
    const matchP = !partner || s.partner.toLowerCase().includes(partner.toLowerCase());
    const matchBr = branch === "all" || s.branch === branch || s.branch === "All";
    return matchCh && matchP && matchBr;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={partner} onChange={e => setPartner(e.target.value)} placeholder="Search partner…" className="h-9 w-44" />
        <Select value={channel} onValueChange={setChannel}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Channel" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Channels</SelectItem>
            <SelectItem value="direct">Direct</SelectItem>
            <SelectItem value="distributor">Distributor</SelectItem>
          </SelectContent>
        </Select>
        <Select value={branch} onValueChange={setBranch}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Branch" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            <SelectItem value="Riyadh">Riyadh</SelectItem>
            <SelectItem value="Jeddah">Jeddah</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card className="overflow-hidden border-border/60 shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-3 font-semibold">Category</th>
                <th className="px-3 py-3 font-semibold">Partner</th>
                <th className="px-3 py-3 font-semibold">Channel</th>
                <th className="px-3 py-3 font-semibold">Branch</th>
                <th className="px-3 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                  <td className="px-3 py-3 font-medium">{s.name}</td>
                  <td className="px-3 py-3">{s.partner}</td>
                  <td className="px-3 py-3"><Badge variant="outline" className="text-xs capitalize">{s.channel}</Badge></td>
                  <td className="px-3 py-3 text-xs">{s.branch}</td>
                  <td className="px-3 py-3"><StatusBadge status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Suppliers() {
  return (
    <PageShell title="Suppliers" subtitle="Vendor management · warehouses · supply channels">
      <Tabs defaultValue="suppliers">
        <TabsList className="mb-4">
          <TabsTrigger value="suppliers" className="gap-1.5"><Truck className="h-3.5 w-3.5" />Suppliers</TabsTrigger>
          <TabsTrigger value="warehouses" className="gap-1.5"><Warehouse className="h-3.5 w-3.5" />Warehouses</TabsTrigger>
          <TabsTrigger value="supplies" className="gap-1.5"><ClipboardCheck className="h-3.5 w-3.5" />Supplies</TabsTrigger>
        </TabsList>
        <TabsContent value="suppliers" className="mt-0"><SuppliersTab /></TabsContent>
        <TabsContent value="warehouses" className="mt-0"><WarehousesTab /></TabsContent>
        <TabsContent value="supplies" className="mt-0"><SuppliesTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
