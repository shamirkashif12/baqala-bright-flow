import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { TicketPercent, BadgePercent, Plus } from "lucide-react";

export const Route = createFileRoute("/_app/coupons")({ component: Coupons });

const coupons = [
  { id: "C-1001", name: "Ramadan Mega 20", code: "RAMADAN20", type: "Percentage", value: "20%", start: "2026-03-10", end: "2026-04-10", limit: 5000, used: 2841, status: "active", by: "Abdullah" },
  { id: "C-1002", name: "Khobar Opening", code: "KHB50", type: "Fixed", value: "ر.س 50", start: "2026-05-01", end: "2026-06-30", limit: 1000, used: 412, status: "active", by: "Sara" },
  { id: "C-1003", name: "Dairy Combo", code: "DAIRY15", type: "Category", value: "15% off Dairy", start: "2026-05-15", end: "2026-07-15", limit: 2000, used: 980, status: "active", by: "Abdullah" },
  { id: "C-1004", name: "Eid Voucher", code: "EID30", type: "Percentage", value: "30%", start: "2026-04-09", end: "2026-04-13", limit: 3000, used: 2998, status: "closed", by: "Abdullah" },
  { id: "C-1005", name: "Madinah Loyalty", code: "MED10", type: "Branch", value: "10% Madinah only", start: "2026-06-01", end: "2026-12-31", limit: 500, used: 14, status: "active", by: "Manager" },
];

function Coupons() {
  return (
    <PageShell title="Coupons & Discounts" subtitle="Promotional codes, discounts and offers">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active Coupons" value="14" icon={TicketPercent} accent="primary" />
        <MetricCard label="Used This Month" value="6,284" icon={BadgePercent} accent="success" delta="+18%" trend="up" />
        <MetricCard label="Discount Given" value="ر.س 28,420" icon={BadgePercent} />
        <MetricCard label="Avg Discount" value="ر.س 4.52" icon={BadgePercent} />
      </div>

      <div className="flex justify-end"><AddCoupon /></div>

      <Card className="overflow-hidden border-border/60 shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Coupon</th>
                <th className="px-4 py-3 font-semibold">Code</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold">Value</th>
                <th className="px-4 py-3 font-semibold">Validity</th>
                <th className="px-4 py-3 font-semibold">Usage</th>
                <th className="px-4 py-3 font-semibold">By</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                  <td className="px-4 py-3.5">
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.id}</p>
                  </td>
                  <td className="px-4 py-3.5"><code className="rounded bg-primary/10 text-primary px-2 py-0.5 text-xs font-bold">{c.code}</code></td>
                  <td className="px-4 py-3.5 text-xs">{c.type}</td>
                  <td className="px-4 py-3.5 font-semibold">{c.value}</td>
                  <td className="px-4 py-3.5 text-xs">{c.start}<br />{c.end}</td>
                  <td className="px-4 py-3.5 text-xs tabular-nums">{c.used} / {c.limit}</td>
                  <td className="px-4 py-3.5 text-xs">{c.by}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3.5"><Button size="sm" variant="ghost">Edit</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </PageShell>
  );
}

function AddCoupon() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow"><Plus className="h-4 w-4" />New Coupon</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Create Coupon</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label="Coupon Name" />
          <F label="Coupon Code" placeholder="e.g. SUMMER25" />
          <div className="space-y-1">
            <Label className="text-xs">Discount Type</Label>
            <Select defaultValue="Percentage">
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Percentage">Percentage</SelectItem>
                <SelectItem value="Fixed">Fixed Amount</SelectItem>
                <SelectItem value="Product">Product-based</SelectItem>
                <SelectItem value="Category">Category-based</SelectItem>
                <SelectItem value="Branch">Branch-based</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <F label="Discount Value" placeholder="20 or 50" />
          <F label="Start Date" placeholder="2026-06-01" />
          <F label="End Date" placeholder="2026-06-30" />
          <F label="Usage Limit" placeholder="1000" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="gradient-primary text-primary-foreground border-0" onClick={() => setOpen(false)}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, placeholder }: { label: string; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input className="h-9" placeholder={placeholder} />
    </div>
  );
}