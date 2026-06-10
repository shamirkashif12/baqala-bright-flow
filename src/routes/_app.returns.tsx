import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/returns")({ component: Returns });

const allReturns = [
  { id: "RET-20260602-008", invoice: "INV-20260602-0142", customer: "Walk-in", branch: "Olaya", item: "Sadia Chicken 1kg", qty: 1, reason: "Damaged packaging", amount: "ر.س 28.00", refund: "Cash", status: "pending", date: "Today 14:42" },
  { id: "RET-20260602-007", invoice: "INV-20260602-0118", customer: "Ahmed K.", branch: "Khobar", item: "Lay's Classic 75g", qty: 3, reason: "Expired stock", amount: "ر.س 21.00", refund: "Wallet credit", status: "approved", date: "Today 12:18" },
  { id: "RET-20260602-006", invoice: "INV-20260602-0094", customer: "Walk-in", branch: "Jeddah", item: "Almarai Yogurt 170g", qty: 2, reason: "Wrong item", amount: "ر.س 9.00", refund: "Cash", status: "approved", date: "Today 11:02" },
  { id: "RET-20260601-031", invoice: "INV-20260601-0312", customer: "Sara M.", branch: "Olaya", item: "Tide Detergent 3kg", qty: 1, reason: "Not as described", amount: "ر.س 52.00", refund: "Card", status: "rejected", date: "Yesterday" },
  { id: "RET-20260601-029", invoice: "INV-20260601-0288", customer: "Walk-in", branch: "Madinah", item: "Pepsi 330ml ×6", qty: 1, reason: "Bottles leaking", amount: "ر.س 15.00", refund: "Cash", status: "approved", date: "Yesterday" },
];

const reasons = ["Damaged packaging", "Expired stock", "Wrong item", "Customer changed mind", "Not as described", "Quality issue", "Other"];

function Returns() {
  const [filtered, setFiltered] = useState(allReturns);
  return (
    <PageShell title="Customer Returns" subtitle="Handle item returns, refunds and restocking from a single workspace">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Returns Today" value="8" icon={Undo2} accent="primary" />
        <MetricCard label="Pending Approval" value="3" icon={AlertTriangle} accent="warning" />
        <MetricCard label="Refunded Amount" value="ر.س 410" icon={Wallet} />
        <MetricCard label="Items Restocked" value="14" icon={PackageCheck} accent="success" />
      </div>

      <FilterBar
        placeholder="Search by invoice, item, customer…"
        onChange={(s) => {
          const q = s.query.toLowerCase().trim();
          setFiltered(allReturns.filter(r =>
            (s.branch === "All Branches" || r.branch === s.branch.split(" — ")[0]) &&
            (!q || r.invoice.toLowerCase().includes(q) || r.item.toLowerCase().includes(q) || r.customer.toLowerCase().includes(q))
          ));
        }}
        extras={<NewReturnDialog />}
      />

      <DataTable
        columns={[
          { key: "id", label: "Return ID", render: r => <span className="font-mono text-xs">{r.id}</span> },
          { key: "invoice", label: "Invoice", render: r => <span className="font-mono text-xs">{r.invoice}</span> },
          { key: "customer", label: "Customer" },
          { key: "branch", label: "Branch", render: r => <Badge variant="outline">{r.branch}</Badge> },
          { key: "item", label: "Item" },
          { key: "qty", label: "Qty", render: r => <span className="font-semibold tabular-nums">×{r.qty}</span> },
          { key: "reason", label: "Reason" },
          { key: "amount", label: "Amount", render: r => <span className="font-semibold">{r.amount}</span> },
          { key: "refund", label: "Refund Method" },
          { key: "status", label: "Status", render: r => <StatusBadge status={r.status} /> },
          { key: "_a", label: "", render: r => r.status === "pending" ? (
            <div className="flex gap-1.5">
              <Button size="sm" className="h-7 px-2 gradient-primary text-primary-foreground border-0">Approve</Button>
              <Button size="sm" variant="outline" className="h-7 px-2">Reject</Button>
            </div>
          ) : null },
        ]}
        rows={filtered}
      />
    </PageShell>
  );
}

function NewReturnDialog() {
  return (
    <Dialog>
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
            <Label className="text-xs">Original invoice</Label>
            <div className="flex gap-2">
              <Input className="h-9" placeholder="INV-20260602-..." />
              <Button variant="outline" size="sm" className="h-9 gap-1.5"><ScanBarcode className="h-4 w-4" />Scan</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Item</Label><Input className="h-9" placeholder="Auto-fill from invoice" /></div>
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
          <div className="flex items-center justify-between rounded-xl border border-border/60 p-3 text-sm">
            <span className="text-muted-foreground">Restock item to inventory</span>
            <Badge variant="outline" className="bg-success/10 text-success border-success/30">Yes</Badge>
          </div>
        </div>
        <DialogFooter>
          <Button className="gradient-primary text-primary-foreground border-0">Submit return</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}