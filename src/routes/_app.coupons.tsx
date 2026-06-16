import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { api, type Coupon } from "@/lib/api";

export const Route = createFileRoute("/_app/coupons")({ component: Coupons });

function Coupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCoupons()
      .then(setCoupons)
      .finally(() => setLoading(false));
  }, []);

  const active = coupons.filter(c => c.status === "active").length;
  const totalUsed = coupons.reduce((s, c) => s + c.usedCount, 0);

  return (
    <PageShell title="Coupons & Discounts" subtitle="Promotional codes, discounts and offers">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active Coupons" value={String(active)} icon={TicketPercent} accent="primary" />
        <MetricCard label="Total Used" value={String(totalUsed)} icon={BadgePercent} accent="success" />
        <MetricCard label="Total Coupons" value={String(coupons.length)} icon={BadgePercent} />
        <MetricCard label="Expired" value={String(coupons.filter(c => c.status === "expired").length)} icon={BadgePercent} />
      </div>

      <div className="flex justify-end">
        <AddCoupon onCreated={() => api.getCoupons().then(setCoupons)} />
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
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
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => (
                  <tr key={c.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-4 py-3.5 font-semibold">{c.name}</td>
                    <td className="px-4 py-3.5"><code className="rounded bg-primary/10 text-primary px-2 py-0.5 text-xs font-bold">{c.code}</code></td>
                    <td className="px-4 py-3.5 text-xs capitalize">{c.type.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3.5 font-semibold">{c.type === "percentage" ? `${c.value}%` : `ر.س ${c.value}`}</td>
                    <td className="px-4 py-3.5 text-xs">{c.startDate}<br />{c.endDate}</td>
                    <td className="px-4 py-3.5 text-xs tabular-nums">{c.usedCount} / {c.usageLimit ?? "∞"}</td>
                    <td className="px-4 py-3.5"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3.5"><Button size="sm" variant="ghost">Edit</Button></td>
                  </tr>
                ))}
                {coupons.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">No coupons found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </PageShell>
  );
}

function AddCoupon({ onCreated }: { onCreated?: () => void }) {
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
            <Select defaultValue="percentage">
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Percentage</SelectItem>
                <SelectItem value="fixed">Fixed Amount</SelectItem>
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
          <Button className="gradient-primary text-primary-foreground border-0" onClick={() => { setOpen(false); onCreated?.(); }}>Create</Button>
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
