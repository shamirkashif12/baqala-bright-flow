import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Button } from "@/components/ui/button";
import { MetricCard } from "@/components/metric-card";
import { DataTable, StatusBadge } from "@/components/module-placeholder";
import { Undo2, PackageCheck, Wallet, AlertTriangle, Plus, ScanBarcode } from "lucide-react";
import { FilterBar } from "@/components/filter-bar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, type CustomerReturn } from "@/lib/api";

export const Route = createFileRoute("/_app/returns")({ component: Returns });

const reasons = ["Damaged packaging", "Expired stock", "Wrong item", "Customer changed mind", "Not as described", "Quality issue", "Other"];

function Returns() {
  const [returns, setReturns] = useState<CustomerReturn[]>([]);
  const [filtered, setFiltered] = useState<CustomerReturn[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getReturns()
      .then(data => { setReturns(data); setFiltered(data); })
      .finally(() => setLoading(false));
  }, []);

  const pending = returns.filter(r => r.status === "pending").length;
  const totalRefunded = returns.filter(r => r.status === "approved").reduce((s, r) => s + r.refundAmount, 0);
  const fmt = (n: number) => `ر.س ${n.toLocaleString("en-SA", { minimumFractionDigits: 2 })}`;

  return (
    <PageShell title="Customer Returns" subtitle="Handle item returns, refunds and restocking from a single workspace">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Returns" value={String(returns.length)} icon={Undo2} accent="primary" />
        <MetricCard label="Pending Approval" value={String(pending)} icon={AlertTriangle} accent="warning" />
        <MetricCard label="Refunded Amount" value={fmt(totalRefunded)} icon={Wallet} />
        <MetricCard label="Items Restocked" value={String(returns.filter(r => r.items?.some(i => i.restock)).length)} icon={PackageCheck} accent="success" />
      </div>

      <FilterBar
        placeholder="Search by return #, customer, order…"
        onChange={(s) => {
          const q = s.query.toLowerCase().trim();
          setFiltered(returns.filter(r =>
            (!q ||
              r.returnNumber.toLowerCase().includes(q) ||
              (r.customer?.fullName ?? "").toLowerCase().includes(q) ||
              (r.order?.orderNumber ?? "").toLowerCase().includes(q) ||
              r.reason.toLowerCase().includes(q))
          ));
        }}
        extras={<NewReturnDialog onCreated={() => api.getReturns().then(data => { setReturns(data); setFiltered(data); })} />}
      />

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <DataTable
          columns={[
            { key: "returnNumber", label: "Return #", render: (r: CustomerReturn) => <span className="font-mono text-xs">{r.returnNumber}</span> },
            { key: "order", label: "Order", render: (r: CustomerReturn) => <span className="font-mono text-xs">{r.order?.orderNumber ?? "—"}</span> },
            { key: "customer", label: "Customer", render: (r: CustomerReturn) => r.customer?.fullName ?? "Walk-in" },
            { key: "reason", label: "Reason" },
            { key: "refundAmount", label: "Amount", render: (r: CustomerReturn) => <span className="font-semibold">{fmt(r.refundAmount)}</span> },
            { key: "refundMethod", label: "Refund Method", render: (r: CustomerReturn) => r.refundMethod.replace(/_/g, " ") },
            { key: "status", label: "Status", render: (r: CustomerReturn) => <StatusBadge status={r.status} /> },
            { key: "createdAt", label: "Date", render: (r: CustomerReturn) => new Date(r.createdAt).toLocaleDateString("en-SA") },
            { key: "_a", label: "", render: (r: CustomerReturn) => r.status === "pending" ? (
              <div className="flex gap-1.5">
                <Button size="sm" className="h-7 px-2 gradient-primary text-primary-foreground border-0">Approve</Button>
                <Button size="sm" variant="outline" className="h-7 px-2">Reject</Button>
              </div>
            ) : null },
          ]}
          rows={filtered}
        />
      )}
    </PageShell>
  );
}

function NewReturnDialog({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow h-9">
          <Plus className="h-4 w-4" /> New Return
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Process customer return</DialogTitle>
          <DialogDescription>Scan or enter original invoice, then pick items to return.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Original invoice / order #</Label>
            <div className="flex gap-2">
              <Input className="h-9" placeholder="ORD-20260602-..." />
              <Button variant="outline" size="sm" className="h-9 gap-1.5"><ScanBarcode className="h-4 w-4" />Scan</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Item</Label><Input className="h-9" placeholder="Auto-fill from order" /></div>
            <div className="space-y-1"><Label className="text-xs">Qty</Label><Input className="h-9" type="number" defaultValue="1" /></div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Reason</Label>
            <Select defaultValue={reasons[0]}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{reasons.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Refund method</Label>
            <Select defaultValue="cash"><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card (back to original)</SelectItem>
                <SelectItem value="wallet">Store wallet credit</SelectItem>
                <SelectItem value="exchange">Exchange (no refund)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Notes</Label><Textarea rows={2} placeholder="Optional notes for audit log…" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="gradient-primary text-primary-foreground border-0" onClick={() => { setOpen(false); onCreated?.(); }}>Submit return</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
