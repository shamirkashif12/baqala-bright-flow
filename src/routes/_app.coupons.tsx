import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/module-placeholder";
import { Gift, Trophy, Pencil, Power, Trash2, Plus, Tag, PercentCircle } from "lucide-react";
import { api, type Coupon } from "@/lib/api";

export const Route = createFileRoute("/_app/coupons")({ component: Coupons });

const discounts = [
  { id: "d1", name: "Staff 15%", type: "percentage", value: 15, scope: "All products", status: "active" },
  { id: "d2", name: "Happy Hour SAR 10", type: "fixed", value: 10, scope: "Beverages", status: "active" },
  { id: "d3", name: "Loyalty Tier Silver", type: "percentage", value: 8, scope: "All products", status: "inactive" },
];

const offers = [
  { id: "o1", name: "Buy 2 Get 1 Free", type: "BOGO", items: 2, freeItems: 1, status: "active" },
  { id: "o2", name: "Weekend Bundle SAR 99", type: "bundle", items: 3, freeItems: 0, status: "active" },
  { id: "o3", name: "Flash Sale 25%", type: "flash", items: 0, freeItems: 0, status: "scheduled" },
];

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-success/15 text-success",
    inactive: "bg-muted text-muted-foreground",
    scheduled: "bg-primary/15 text-primary",
    expired: "bg-destructive/10 text-destructive",
  };
  return <Badge className={`${map[status] ?? "bg-muted"} border-0 text-xs`}>{status}</Badge>;
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function CouponsTab() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    api.getCoupons()
      .then(setCoupons)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-10">
              <Plus className="h-4 w-4" /> Create Coupon
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader><SheetTitle>Create Coupon</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-4">
              <FieldRow label="Coupon Name"><Input placeholder="Summer Sale 2026" /></FieldRow>
              <FieldRow label="Code"><Input placeholder="SUMMER25" className="font-mono uppercase" /></FieldRow>
              <div className="grid grid-cols-2 gap-3">
                <FieldRow label="Type">
                  <Select>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage %</SelectItem>
                      <SelectItem value="fixed">Fixed SAR</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldRow>
                <FieldRow label="Value"><Input type="number" placeholder="25" className="h-9" /></FieldRow>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FieldRow label="Start Date"><Input type="date" className="h-9" /></FieldRow>
                <FieldRow label="End Date"><Input type="date" className="h-9" /></FieldRow>
              </div>
              <FieldRow label="Usage Limit"><Input type="number" placeholder="100" className="h-9" /></FieldRow>
              <Button className="w-full gradient-primary text-primary-foreground border-0 mt-2" onClick={() => setSheetOpen(false)}>Save Coupon</Button>
            </div>
          </SheetContent>
        </Sheet>
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
                        <Button size="icon" variant="ghost" className="h-7 w-7"><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7"><Power className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
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
    </div>
  );
}

function DiscountsTab() {
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-10">
              <Plus className="h-4 w-4" /> Add Discount
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader><SheetTitle>Add Discount Rule</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-4">
              <FieldRow label="Name"><Input placeholder="Staff 15%" /></FieldRow>
              <div className="grid grid-cols-2 gap-3">
                <FieldRow label="Type">
                  <Select>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage %</SelectItem>
                      <SelectItem value="fixed">Fixed SAR</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldRow>
                <FieldRow label="Value"><Input type="number" placeholder="15" className="h-9" /></FieldRow>
              </div>
              <FieldRow label="Scope"><Input placeholder="All products" /></FieldRow>
              <Button className="w-full gradient-primary text-primary-foreground border-0 mt-2" onClick={() => setSheetOpen(false)}>Save</Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
      <Card className="overflow-hidden border-border/60 shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-3 font-semibold">Name</th>
                <th className="px-3 py-3 font-semibold">Type</th>
                <th className="px-3 py-3 font-semibold">Value</th>
                <th className="px-3 py-3 font-semibold">Scope</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {discounts.map((d) => (
                <tr key={d.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                  <td className="px-3 py-3 font-medium">{d.name}</td>
                  <td className="px-3 py-3"><Badge variant="outline" className="text-xs">{d.type}</Badge></td>
                  <td className="px-3 py-3">{d.type === "percentage" ? `${d.value}%` : `SAR ${d.value}`}</td>
                  <td className="px-3 py-3 text-xs">{d.scope}</td>
                  <td className="px-3 py-3"><StatusPill status={d.status} /></td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1 justify-end">
                      <Button size="icon" variant="ghost" className="h-7 w-7"><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function OffersTab() {
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-10">
              <Plus className="h-4 w-4" /> Add Offer
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader><SheetTitle>Add Offer</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-4">
              <FieldRow label="Offer Name"><Input placeholder="Buy 2 Get 1 Free" /></FieldRow>
              <FieldRow label="Type">
                <Select>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bogo">BOGO</SelectItem>
                    <SelectItem value="bundle">Bundle</SelectItem>
                    <SelectItem value="flash">Flash Sale</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
              <div className="grid grid-cols-2 gap-3">
                <FieldRow label="Required Items"><Input type="number" placeholder="2" className="h-9" /></FieldRow>
                <FieldRow label="Free Items"><Input type="number" placeholder="1" className="h-9" /></FieldRow>
              </div>
              <Button className="w-full gradient-primary text-primary-foreground border-0 mt-2" onClick={() => setSheetOpen(false)}>Save</Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {offers.map((o) => (
          <Card key={o.id} className="p-5 border-border/60 shadow-card hover:shadow-elegant transition-all">
            <div className="flex items-start justify-between">
              <div className="h-10 w-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary">
                <Trophy className="h-5 w-5" />
              </div>
              <StatusPill status={o.status} />
            </div>
            <p className="mt-3 font-semibold">{o.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{o.type}</p>
            {o.items > 0 && <p className="text-xs mt-1">Buy {o.items} → Get {o.freeItems} free</p>}
            <div className="mt-3 flex gap-1.5">
              <Button size="sm" variant="outline" className="h-7 flex-1"><Pencil className="h-3.5 w-3.5 mr-1" />Edit</Button>
              <Button size="sm" variant="ghost" className="h-7 text-destructive px-2"><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
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
