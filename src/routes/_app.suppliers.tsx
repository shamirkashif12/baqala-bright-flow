import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTable, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Truck, Warehouse, Store, ClipboardCheck, Eye, Pencil, Star } from "lucide-react";

export const Route = createFileRoute("/_app/suppliers")({ component: Suppliers });

const suppliers = [
  { code: "SUP-001", name: "Almarai Company", contact: "Mohammed Al Otaibi", phone: "+966 50 123 4567", vat: "300012345600003", dues: "ر.س 12,400", rating: 5, status: "active" },
  { code: "SUP-002", name: "Nadec Foods", contact: "Khalid Al Shehri", phone: "+966 55 234 5678", vat: "300023456700003", dues: "ر.س 8,200", rating: 5, status: "active" },
  { code: "SUP-003", name: "Al Rabie Saudi Foods", contact: "Sara Al Qahtani", phone: "+966 56 345 6789", vat: "300034567800003", dues: "ر.س 0", rating: 4, status: "paid" },
  { code: "SUP-004", name: "Sadia Saudi Arabia", contact: "Faisal Al Harbi", phone: "+966 53 456 7890", vat: "300045678900003", dues: "ر.س 7,800", rating: 4, status: "overdue" },
];

const warehousesList = [
  { id: "WH-RYD-01", name: "Riyadh Central WH", addr: "Industrial Area, Riyadh", owner: "Salman Al-Mutairi", phone: "+966 11 555 0101", last: "01 Jun 26", supplies: 184 },
  { id: "WH-EST-01", name: "Eastern Province Hub", addr: "Khobar Industrial Park", owner: "Yousef Al-Qahtani", phone: "+966 13 555 0202", last: "31 May 26", supplies: 142 },
  { id: "WH-JED-01", name: "Jeddah West WH", addr: "Al Khomrah, Jeddah", owner: "Faisal Al-Harbi", phone: "+966 12 555 0303", last: "30 May 26", supplies: 96 },
];

type Supply = { id: string; channel: "Warehouse" | "Mart-to-Mart"; partner: string; branch: string; supplier: string; date: string; items: number; amount: string; status: string };
const supplies: Supply[] = [
  { id: "SP-9012", channel: "Warehouse", partner: "WH-RYD-01", branch: "Olaya", supplier: "Almarai", date: "02 Jun 26", items: 12, amount: "ر.س 4,820", status: "Delivered" },
  { id: "SP-9011", channel: "Mart-to-Mart", partner: "Al Mansour Mart", branch: "Jeddah", supplier: "—", date: "02 Jun 26", items: 4, amount: "ر.س 920", status: "On Way" },
  { id: "SP-9010", channel: "Warehouse", partner: "WH-EST-01", branch: "Khobar", supplier: "Nadec", date: "01 Jun 26", items: 8, amount: "ر.س 2,140", status: "Delivered" },
  { id: "SP-9009", channel: "Mart-to-Mart", partner: "Tamimi Express", branch: "Olaya", supplier: "—", date: "01 Jun 26", items: 2, amount: "ر.س 380", status: "Pending" },
  { id: "SP-9008", channel: "Warehouse", partner: "WH-JED-01", branch: "Jeddah", supplier: "Unilever KSA", date: "31 May 26", items: 18, amount: "ر.س 6,420", status: "Delivered" },
];

function Suppliers() {
  const [view, setView] = useState<any | null>(null);
  const [edit, setEdit] = useState<any | null>(null);
  const [channel, setChannel] = useState("All");
  const [partner, setPartner] = useState("All");
  const [branch, setBranch] = useState("All");
  const filtered = useMemo(() => supplies.filter(s =>
    (channel === "All" || s.channel === channel) &&
    (partner === "All" || s.partner === partner) &&
    (branch === "All" || s.branch === branch)
  ), [channel, partner, branch]);

  return (
    <PageShell title="Suppliers" subtitle="Vendors, warehouse supplies and mart-to-mart in one workspace">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Total Suppliers" value="38" icon={Truck} accent="primary" />
        <MetricCard label="Active Warehouses" value="4" icon={Warehouse} accent="success" />
        <MetricCard label="Warehouse Supplies (30d)" value="412" icon={ClipboardCheck} />
        <MetricCard label="Mart-to-Mart (30d)" value="46" icon={Store} accent="warning" />
        <MetricCard label="Pending Requests" value="7" icon={ClipboardCheck} accent="warning" />
      </div>

      <Tabs defaultValue="suppliers">
        <TabsList>
          <TabsTrigger value="suppliers" className="gap-1.5"><Truck className="h-4 w-4" />Suppliers</TabsTrigger>
          <TabsTrigger value="warehouses" className="gap-1.5"><Warehouse className="h-4 w-4" />Warehouses</TabsTrigger>
          <TabsTrigger value="supplies" className="gap-1.5"><ClipboardCheck className="h-4 w-4" />Supplies (WH + Mart)</TabsTrigger>
        </TabsList>

        <TabsContent value="suppliers" className="mt-4">
          <DataTable columns={[
            { key: "name", label: "Supplier", render: r => <div><p className="font-semibold">{r.name}</p><p className="text-xs text-muted-foreground">{r.code} · VAT {r.vat}</p></div> },
            { key: "contact", label: "Contact", render: r => <div><p className="text-sm">{r.contact}</p><p className="text-xs text-muted-foreground">{r.phone}</p></div> },
            { key: "dues", label: "Dues", render: r => <span className={r.dues !== "ر.س 0" ? "font-semibold text-destructive" : "text-muted-foreground"}>{r.dues}</span> },
            { key: "rating", label: "Rating", render: r => <div className="flex gap-0.5">{Array.from({length: 5}).map((_, i) => <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? "fill-warning text-warning" : "text-muted"}`} />)}</div> },
            { key: "status", label: "Status", render: r => <StatusBadge status={r.status} /> },
            { key: "a", label: "", render: r => <div className="flex gap-1 justify-end">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEdit(r)}><Pencil className="h-4 w-4" /></Button>
            </div> }
          ]} rows={suppliers} />
        </TabsContent>

        <TabsContent value="warehouses" className="mt-4">
          <DataTable columns={[
            { key: "id", label: "ID", render: r => <span className="font-mono font-semibold">{r.id}</span> },
            { key: "name", label: "Warehouse", render: r => <span className="font-semibold">{r.name}</span> },
            { key: "addr", label: "Address" },
            { key: "owner", label: "Contact Person" },
            { key: "phone", label: "Phone" },
            { key: "supplies", label: "Supplies (30d)" },
            { key: "last", label: "Last Supply" },
            { key: "a", label: "", render: r => <div className="flex gap-1 justify-end">
              <Button size="sm" variant="outline" onClick={() => setView(r)}><Eye className="h-3.5 w-3.5 mr-1" />View</Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEdit(r)}><Pencil className="h-4 w-4" /></Button>
            </div> }
          ]} rows={warehousesList} />
        </TabsContent>

        <TabsContent value="supplies" className="mt-4 space-y-3">
          <Card className="p-3 border-border/60 shadow-card">
            <div className="flex flex-wrap gap-2">
              <Select value={channel} onValueChange={setChannel}><SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger><SelectContent>{["All","Warehouse","Mart-to-Mart"].map(o => <SelectItem key={o} value={o}>{o === "All" ? "All Channels" : o}</SelectItem>)}</SelectContent></Select>
              <Select value={partner} onValueChange={setPartner}><SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger><SelectContent>{["All",...Array.from(new Set(supplies.map(s => s.partner)))].map(o => <SelectItem key={o} value={o}>{o === "All" ? "All Partners" : o}</SelectItem>)}</SelectContent></Select>
              <Select value={branch} onValueChange={setBranch}><SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger><SelectContent>{["All","Olaya","Khobar","Jeddah","Madinah"].map(o => <SelectItem key={o} value={o}>{o === "All" ? "All Branches" : o}</SelectItem>)}</SelectContent></Select>
              <Input type="date" className="h-9 w-[150px]" />
            </div>
          </Card>
          <DataTable columns={[
            { key: "id", label: "ID", render: r => <span className="font-mono font-semibold">{r.id}</span> },
            { key: "channel", label: "Channel", render: r => <span className={`text-xs px-2 py-0.5 rounded-md font-semibold ${r.channel === "Warehouse" ? "bg-primary/10 text-primary" : "bg-warning/20 text-warning-foreground"}`}>{r.channel}</span> },
            { key: "partner", label: "Partner / Source" },
            { key: "branch", label: "Branch" },
            { key: "supplier", label: "Supplier" },
            { key: "items", label: "Items" },
            { key: "amount", label: "Amount", render: r => <span className="font-semibold">{r.amount}</span> },
            { key: "date", label: "Date" },
            { key: "status", label: "Status", render: r => <StatusBadge status={r.status.toLowerCase()} /> },
          ]} rows={filtered} />
        </TabsContent>
      </Tabs>

      {/* Warehouse details */}
      <Sheet open={!!view} onOpenChange={v => !v && setView(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{view?.name}</SheetTitle></SheetHeader>
          {view && (
            <div className="space-y-3 mt-4 text-sm">
              {[["ID", view.id],["Address", view.addr],["Owner / Contact", view.owner],["Phone", view.phone],["Last supplied", view.last],["Supplies (30d)", String(view.supplies)]].map(([k,v]) => (
                <div key={k} className="flex justify-between border-b border-border/40 py-2"><span className="text-muted-foreground">{k}</span><span className="font-semibold">{v}</span></div>
              ))}
              <Card className="p-3 bg-muted/40">
                <p className="text-xs font-semibold mb-2">Recent supplies</p>
                {supplies.filter(s => s.partner === view.id).slice(0,3).map(s => (
                  <div key={s.id} className="text-xs flex justify-between py-1"><span>{s.date} → {s.branch}</span><span className="font-semibold">{s.amount}</span></div>
                ))}
              </Card>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!edit} onOpenChange={v => !v && setEdit(null)}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>Edit details</SheetTitle></SheetHeader>
          <div className="space-y-3 mt-4">
            <Field label="Name" defaultValue={edit?.name} />
            <Field label="Contact" defaultValue={edit?.contact ?? edit?.owner} />
            <Field label="Phone" defaultValue={edit?.phone} />
            <Field label="Address" defaultValue={edit?.addr} />
          </div>
          <SheetFooter className="mt-4"><Button className="gradient-primary text-primary-foreground border-0" onClick={() => setEdit(null)}>Save</Button></SheetFooter>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}

function Field({ label, defaultValue }: { label: string; defaultValue?: string }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label><Input className="h-9" defaultValue={defaultValue} /></div>;
}
