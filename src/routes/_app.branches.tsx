import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, MapPin, Plus, Clock, Phone, Users, Terminal as TerminalIcon, Package } from "lucide-react";
import { StatusBadge } from "@/components/module-placeholder";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_app/branches")({ component: Branches });

const branches = [
  { code: "BR-001", name: "Olaya — Riyadh HQ", city: "Riyadh", manager: "Abdullah Al Faisal", phone: "+966 11 555 0101", address: "King Fahd Rd, Olaya, Riyadh", hours: "24/7", terminals: 5, staff: 12, skus: 1240, sales: "ر.س 18,420", status: "active" },
  { code: "BR-002", name: "Al Khobar Corniche", city: "Khobar", manager: "Khalid Al Shehri", phone: "+966 13 555 0202", address: "Corniche Rd, Al Khobar 31952", hours: "06:00 — 02:00", terminals: 3, staff: 8, skus: 820, sales: "ر.س 12,890", status: "active" },
  { code: "BR-003", name: "Jeddah Tahlia", city: "Jeddah", manager: "Sara Al Qahtani", phone: "+966 12 555 0303", address: "Tahlia St, Jeddah 23434", hours: "07:00 — 01:00", terminals: 3, staff: 9, skus: 760, sales: "ر.س 11,260", status: "active" },
  { code: "BR-004", name: "Madinah Quba", city: "Madinah", manager: "Faisal Al Harbi", phone: "+966 14 555 0404", address: "Quba Rd, Al Madinah", hours: "05:00 — 00:00", terminals: 2, staff: 6, skus: 540, sales: "ر.س 6,350", status: "maintenance" },
];

function Branches() {
  const [view, setView] = useState<typeof branches[0] | null>(null);
  const [edit, setEdit] = useState<typeof branches[0] | null>(null);
  const [disable, setDisable] = useState<typeof branches[0] | null>(null);

  return (
    <PageShell title="Branches" subtitle="Multi-location management across the Kingdom" actions={
      <Sheet>
        <SheetTrigger asChild><Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow"><Plus className="h-4 w-4" />New Branch</Button></SheetTrigger>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>New Branch</SheetTitle></SheetHeader>
          <div className="space-y-3 mt-4">
            <Field label="Branch name" /><Field label="Branch code" placeholder="BR-005" /><Field label="City" /><Field label="Manager" /><Field label="Contact" />
          </div>
          <SheetFooter className="mt-4"><Button className="gradient-primary text-primary-foreground border-0">Create</Button></SheetFooter>
        </SheetContent>
      </Sheet>
    }>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {branches.map((b) => (
          <Card key={b.code} className="p-5 border-border/60 shadow-card hover:shadow-elegant transition-all">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl gradient-primary flex items-center justify-center shadow-glow"><Building2 className="h-5 w-5 text-primary-foreground" /></div>
                <div><h3 className="font-semibold">{b.name}</h3><p className="text-xs text-muted-foreground">{b.code} · Manager: {b.manager}</p></div>
              </div>
              <StatusBadge status={b.status} />
            </div>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> {b.address}</div>
              <div className="flex items-center gap-2"><Clock className="h-3.5 w-3.5" /> {b.hours}</div>
              <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> {b.phone}</div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border/60">
              <div><p className="text-[10px] uppercase text-muted-foreground">Terminals</p><p className="font-bold text-lg">{b.terminals}</p></div>
              <div><p className="text-[10px] uppercase text-muted-foreground">Staff</p><p className="font-bold text-lg">{b.staff}</p></div>
              <div><p className="text-[10px] uppercase text-muted-foreground">Today</p><p className="font-bold text-base text-primary">{b.sales}</p></div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setView(b)}>View Profile</Button>
              <Button size="sm" className="flex-1 gradient-primary text-primary-foreground border-0" onClick={() => setEdit(b)}>Edit</Button>
              <Button variant="outline" size="sm" className="text-destructive" onClick={() => setDisable(b)}>Disable</Button>
            </div>
          </Card>
        ))}
      </div>

      {/* View profile */}
      <Sheet open={!!view} onOpenChange={v => !v && setView(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader><SheetTitle>{view?.name} · Profile</SheetTitle></SheetHeader>
          {view && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[["Code", view.code],["City", view.city],["Manager", view.manager],["Phone", view.phone],["Hours", view.hours],["Status", view.status]].map(([k,v]) => (
                  <div key={k} className="rounded-xl border border-border/60 p-3"><p className="text-[10px] uppercase font-semibold text-muted-foreground">{k}</p><p className="font-semibold mt-0.5">{v}</p></div>
                ))}
              </div>
              <Card className="p-3 bg-muted/40"><p className="text-xs font-semibold text-muted-foreground">Address</p><p className="text-sm">{view.address}</p></Card>

              <Tabs defaultValue="terminals">
                <TabsList>
                  <TabsTrigger value="terminals" className="gap-1.5"><TerminalIcon className="h-4 w-4" />Terminals ({view.terminals})</TabsTrigger>
                  <TabsTrigger value="staff" className="gap-1.5"><Users className="h-4 w-4" />Staff ({view.staff})</TabsTrigger>
                  <TabsTrigger value="inventory" className="gap-1.5"><Package className="h-4 w-4" />Inventory</TabsTrigger>
                  <TabsTrigger value="orders">Recent Orders</TabsTrigger>
                </TabsList>
                <TabsContent value="terminals" className="mt-3 space-y-2">
                  {Array.from({length: view.terminals}).map((_,i) => (
                    <div key={i} className="flex justify-between rounded-lg bg-muted/40 p-2.5 text-sm"><span className="font-mono">TML-{view.code.split("-")[1]}-{String(i+1).padStart(3,"0")}</span><StatusBadge status="online" /></div>
                  ))}
                </TabsContent>
                <TabsContent value="staff" className="mt-3 space-y-2">
                  {["Cashier 1","Cashier 2","Supervisor","Stock Clerk"].slice(0, view.staff).map(s => (
                    <div key={s} className="flex justify-between rounded-lg bg-muted/40 p-2.5 text-sm"><span>{s}</span><span className="text-xs text-muted-foreground">On shift</span></div>
                  ))}
                </TabsContent>
                <TabsContent value="inventory" className="mt-3">
                  <Card className="p-4"><p className="text-xs text-muted-foreground">Total SKUs</p><p className="text-2xl font-bold">{view.skus}</p><div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                    <div><span className="text-muted-foreground">Low stock</span><p className="font-bold">12</p></div>
                    <div><span className="text-muted-foreground">Expiring</span><p className="font-bold">8</p></div>
                    <div><span className="text-muted-foreground">Out</span><p className="font-bold">3</p></div>
                  </div></Card>
                </TabsContent>
                <TabsContent value="orders" className="mt-3 space-y-2">
                  {["ORD-10241 · ر.س 248.50","ORD-10240 · ر.س 1,420.00","ORD-10239 · ر.س 86.75"].map(o => (
                    <div key={o} className="rounded-lg bg-muted/40 p-2.5 text-sm">{o}</div>
                  ))}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!edit} onOpenChange={v => !v && setEdit(null)}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>Edit {edit?.name}</SheetTitle></SheetHeader>
          <div className="space-y-3 mt-4">
            <Field label="Branch name" defaultValue={edit?.name} />
            <Field label="Manager" defaultValue={edit?.manager} />
            <Field label="Phone" defaultValue={edit?.phone} />
            <Field label="Address" defaultValue={edit?.address} />
          </div>
          <SheetFooter className="mt-4"><Button className="gradient-primary text-primary-foreground border-0" onClick={() => setEdit(null)}>Save</Button></SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={!!disable} onOpenChange={v => !v && setDisable(null)}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>Disable {disable?.name}?</SheetTitle></SheetHeader>
          <p className="text-sm text-muted-foreground mt-4">Branch will be hidden from POS but its data stays accessible to admins.</p>
          <SheetFooter className="mt-4 gap-2"><Button variant="outline" onClick={() => setDisable(null)}>Cancel</Button><Button variant="destructive" onClick={() => setDisable(null)}>Disable branch</Button></SheetFooter>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}

function Field({ label, defaultValue, placeholder }: { label: string; defaultValue?: string; placeholder?: string }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label><Input className="h-9" defaultValue={defaultValue} placeholder={placeholder} /></div>;
}
