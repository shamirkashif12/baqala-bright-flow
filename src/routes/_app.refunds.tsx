import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Undo2, CheckCircle2, XCircle, Clock3 } from "lucide-react";

export const Route = createFileRoute("/_app/refunds")({ component: Refunds });

const refunds = [
  { id: "RF-2401", order: "INV-20260602-0142", customer: "Walk-in", amount: 28, reason: "Damaged item — Sadia Chicken", requested: "Fahad", approved: "—", status: "pending", method: "Cash", date: "2026-06-02 10:14" },
  { id: "RF-2402", order: "INV-20260602-0118", customer: "Loyalty #4821", amount: 12, reason: "Wrong size", requested: "Mohammed", approved: "Abdullah", status: "approved", method: "Card", date: "2026-06-02 09:42" },
  { id: "RF-2403", order: "INV-20260601-3091", customer: "Walk-in", amount: 7.75, reason: "Customer change of mind", requested: "Khalid", approved: "Abdullah", status: "completed", method: "Cash", date: "2026-06-01 16:20" },
  { id: "RF-2404", order: "INV-20260601-2987", customer: "Loyalty #1180", amount: 42, reason: "Expired item sold", requested: "Sultan", approved: "Sara", status: "rejected", method: "Wallet", date: "2026-06-01 14:05" },
  { id: "RF-2405", order: "INV-20260601-2654", customer: "Walk-in", amount: 18.5, reason: "Duplicate scan", requested: "Bandar", approved: "—", status: "pending", method: "Cash", date: "2026-06-01 11:30" },
];

function Refunds() {
  const [active, setActive] = useState<typeof refunds[0] | null>(null);
  return (
    <PageShell title="Refunds" subtitle="Refund requests, approvals and status tracking">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Pending" value="6" icon={Clock3} accent="warning" />
        <MetricCard label="Approved Today" value="14" icon={CheckCircle2} accent="success" />
        <MetricCard label="Rejected Today" value="2" icon={XCircle} accent="destructive" />
        <MetricCard label="Refunded (week)" value="ر.س 1,840" icon={Undo2} />
      </div>

      <Card className="overflow-hidden border-border/60 shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-semibold">Refund</th>
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Reason</th>
                <th className="px-4 py-3 font-semibold">Method</th>
                <th className="px-4 py-3 font-semibold">Requested / Approved</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {refunds.map((r) => (
                <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                  <td className="px-4 py-3.5 font-semibold">{r.id}</td>
                  <td className="px-4 py-3.5 text-xs">{r.order}</td>
                  <td className="px-4 py-3.5 text-xs">{r.customer}</td>
                  <td className="px-4 py-3.5 font-semibold tabular-nums">ر.س {r.amount.toFixed(2)}</td>
                  <td className="px-4 py-3.5 text-xs max-w-[220px] truncate">{r.reason}</td>
                  <td className="px-4 py-3.5 text-xs">{r.method}</td>
                  <td className="px-4 py-3.5 text-xs">{r.requested}<br /><span className="text-muted-foreground">{r.approved}</span></td>
                  <td className="px-4 py-3.5 text-xs">{r.date}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3.5"><Button size="sm" variant="outline" onClick={() => setActive(r)}>Review</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!active} onOpenChange={(v) => !v && setActive(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Review {active?.id}</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Order:</span> {active?.order}</p>
            <p><span className="text-muted-foreground">Customer:</span> {active?.customer}</p>
            <p><span className="text-muted-foreground">Amount:</span> <strong>ر.س {active?.amount.toFixed(2)}</strong></p>
            <p><span className="text-muted-foreground">Method:</span> {active?.method}</p>
            <p><span className="text-muted-foreground">Reason:</span> {active?.reason}</p>
            <p><span className="text-muted-foreground">Requested by:</span> {active?.requested}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActive(null)}>Reject</Button>
            <Button className="gradient-primary text-primary-foreground border-0" onClick={() => setActive(null)}>Approve Refund</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}