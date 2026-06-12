import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetTrigger } from "@/components/ui/sheet";
import { StatusBadge, DataTable } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { TicketPercent, BadgePercent, Plus, Gift, Trophy, Pencil, Power, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/coupons")({ component: Coupons });

const coupons = [
  { id: "C-1001", name: "Ramadan Mega 20", code: "RAMADAN20", type: "Percentage", value: "20%", start: "2026-03-10", end: "2026-04-10", limit: 5000, used: 2841, status: "active", by: "Abdullah" },
  { id: "C-1002", name: "Khobar Opening", code: "KHB50", type: "Fixed", value: "ر.س 50", start: "2026-05-01", end: "2026-06-30", limit: 1000, used: 412, status: "active", by: "Sara" },
  { id: "C-1003", name: "Dairy Combo", code: "DAIRY15", type: "Category", value: "15% off Dairy", start: "2026-05-15", end: "2026-07-15", limit: 2000, used: 980, status: "active", by: "Abdullah" },
  { id: "C-1004", name: "Eid Voucher", code: "EID30", type: "Percentage", value: "30%", start: "2026-04-09", end: "2026-04-13", limit: 3000, used: 2998, status: "closed", by: "Abdullah" },
];

const discounts = [
  { id: "D-301", name: "Senior Citizen 5%", scope: "All branches", value: "5%", status: "active" },
  { id: "D-302", name: "Loyalty Tier Gold 10%", scope: "Gold members", value: "10%", status: "active" },
  { id: "D-303", name: "Eid Week-end 15%", scope: "Weekend during Eid", value: "15%", status: "inactive" },
];

const offers = [
  { id: "O-401", name: "Buy 1 Get 1 Free · Pepsi 330ml", type: "BOGO", items: "Pepsi 330ml", branch: "All", start: "01 Jun 26", end: "30 Jun 26", limit: "Unlimited", status: "active" },
  { id: "O-402", name: "Almarai Combo + Bread", type: "Combo", items: "Almarai Laban + Bread Pack", branch: "Olaya", start: "01 Jun 26", end: "15 Jun 26", limit: "500 uses", status: "active" },
  { id: "O-403", name: "Buy Lipton get Sugar 50% off", type: "Buy A Get B", items: "Lipton Tea → United Sugar", branch: "All", start: "10 Jun 26", end: "25 Jun 26", limit: "1000 uses", status: "active" },
  { id: "O-404", name: "Lucky Draw — Spend ر.س 200", type: "Lucky Draw", items: "Min basket ر.س 200", branch: "All", start: "01 Jun 26", end: "30 Jun 26", limit: "10 winners", status: "active" },
  { id: "O-405", name: "Product Offer — KitKat 25% off", type: "Product Offer", items: "KitKat Chunky", branch: "Olaya, Jeddah", start: "05 Jun 26", end: "20 Jun 26", limit: "Unlimited", status: "inactive" },
];

function Coupons() {
  return (
    <PageShell title="Coupons, Discounts & Offers" subtitle="Promotional codes, discounts and creative offer types in one place">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active Coupons" value="14" icon={TicketPercent} accent="primary" />
        <MetricCard label="Active Discounts" value="3" icon={BadgePercent} accent="success" />
        <MetricCard label="Live Offers" value="4" icon={Gift} accent="warning" />
        <MetricCard label="Total Discount Given (MTD)" value="ر.س 28,420" icon={Trophy} />
      </div>

      <Tabs defaultValue="coupons">
        <TabsList>
          <TabsTrigger value="coupons" className="gap-1.5"><TicketPercent className="h-4 w-4" />Coupons</TabsTrigger>
          <TabsTrigger value="discounts" className="gap-1.5"><BadgePercent className="h-4 w-4" />Discounts</TabsTrigger>
          <TabsTrigger value="offers" className="gap-1.5"><Gift className="h-4 w-4" />Offers</TabsTrigger>
        </TabsList>

        <TabsContent value="coupons" className="mt-4 space-y-3">
          <div className="flex justify-end"><CouponSheet /></div>
          <Card className="overflow-hidden border-border/60 shadow-card">
            <div className="overflow-x-auto"><table className="w-full text-sm">
              <thead><tr className="bg-muted/40 border-b text-xs uppercase text-muted-foreground">
                <th className="px-4 py-3 text-left">Coupon</th><th className="px-4 py-3 text-left">Code</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-left">Value</th><th className="px-4 py-3 text-left">Validity</th><th className="px-4 py-3 text-left">Usage</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-left">Actions</th>
              </tr></thead>
              <tbody>{coupons.map(c => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3"><p className="font-semibold">{c.name}</p><p className="text-xs text-muted-foreground">{c.id}</p></td>
                  <td className="px-4 py-3"><code className="rounded bg-primary/10 text-primary px-2 py-0.5 text-xs font-bold">{c.code}</code></td>
                  <td className="px-4 py-3 text-xs">{c.type}</td><td className="px-4 py-3 font-semibold">{c.value}</td>
                  <td className="px-4 py-3 text-xs">{c.start}<br />{c.end}</td>
                  <td className="px-4 py-3 text-xs tabular-nums">{c.used} / {c.limit}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3"><div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8"><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8"><Power className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table></div>
          </Card>
        </TabsContent>

        <TabsContent value="discounts" className="mt-4 space-y-3">
          <div className="flex justify-end"><DiscountSheet /></div>
          <DataTable columns={[
            { key: "id", label: "ID", render: r => <span className="font-mono">{r.id}</span> },
            { key: "name", label: "Discount", render: r => <span className="font-semibold">{r.name}</span> },
            { key: "scope", label: "Applies to" },
            { key: "value", label: "Value", render: r => <span className="font-bold text-primary">{r.value}</span> },
            { key: "status", label: "Status", render: r => <StatusBadge status={r.status} /> },
            { key: "a", label: "", render: () => <div className="flex gap-1 justify-end">
              <Button size="icon" variant="ghost" className="h-8 w-8"><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8"><Power className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
            </div> }
          ]} rows={discounts} />
        </TabsContent>

        <TabsContent value="offers" className="mt-4 space-y-3">
          <div className="flex justify-end"><OfferSheet /></div>
          <DataTable columns={[
            { key: "id", label: "ID", render: r => <span className="font-mono">{r.id}</span> },
            { key: "name", label: "Offer", render: r => <span className="font-semibold">{r.name}</span> },
            { key: "type", label: "Type", render: r => <span className="text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary font-semibold">{r.type}</span> },
            { key: "items", label: "Items / Condition" },
            { key: "branch", label: "Branch" },
            { key: "start", label: "Start" }, { key: "end", label: "End" },
            { key: "limit", label: "Limit" },
            { key: "status", label: "Status", render: r => <StatusBadge status={r.status} /> },
            { key: "a", label: "", render: () => <div className="flex gap-1 justify-end">
              <Button size="icon" variant="ghost" className="h-8 w-8"><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8"><Power className="h-4 w-4" /></Button>
            </div> }
          ]} rows={offers} />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function CouponSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild><Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow"><Plus className="h-4 w-4" />New Coupon</Button></SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>Create coupon</SheetTitle></SheetHeader>
        <div className="space-y-3 mt-4">
          <Field label="Coupon name" /><Field label="Code" placeholder="SUMMER25" />
          <div className="space-y-1"><Label className="text-xs">Type</Label>
            <Select defaultValue="Percentage"><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{["Percentage","Fixed","Product","Category","Branch"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3"><Field label="Value" placeholder="20" /><Field label="Usage limit" placeholder="1000" /></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Start" placeholder="2026-06-01" /><Field label="End" placeholder="2026-06-30" /></div>
        </div>
        <SheetFooter className="mt-4"><Button className="gradient-primary text-primary-foreground border-0">Save coupon</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function DiscountSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild><Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow"><Plus className="h-4 w-4" />New Discount</Button></SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader><SheetTitle>Create discount</SheetTitle></SheetHeader>
        <div className="space-y-3 mt-4">
          <Field label="Discount name" />
          <Field label="Applies to" placeholder="All branches / VIP / category" />
          <Field label="Value" placeholder="10%" />
        </div>
        <SheetFooter className="mt-4"><Button className="gradient-primary text-primary-foreground border-0">Create discount</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function OfferSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild><Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow"><Plus className="h-4 w-4" />New Offer</Button></SheetTrigger>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader><SheetTitle>Create offer</SheetTitle></SheetHeader>
        <div className="space-y-3 mt-4">
          <Field label="Offer name" />
          <div className="space-y-1"><Label className="text-xs">Offer type</Label>
            <Select defaultValue="BOGO"><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{["Product Offer","Combo","BOGO","Buy A Get B","Lucky Draw"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Field label="Applicable items" placeholder="e.g. Pepsi 330ml" />
          <Field label="Branch" placeholder="All" />
          <div className="grid grid-cols-2 gap-3"><Field label="Start" placeholder="2026-06-01" /><Field label="End" placeholder="2026-06-30" /></div>
          <Field label="Usage limit" placeholder="1000" />
        </div>
        <SheetFooter className="mt-4"><Button className="gradient-primary text-primary-foreground border-0">Save offer</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, defaultValue, placeholder }: { label: string; defaultValue?: string; placeholder?: string }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label><Input className="h-9" defaultValue={defaultValue} placeholder={placeholder} /></div>;
}
