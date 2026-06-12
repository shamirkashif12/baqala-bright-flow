import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MetricCard } from "@/components/metric-card";
import { DataTable, StatusBadge } from "@/components/module-placeholder";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Undo2, PackageCheck, Wallet, AlertTriangle, Plus, ScanBarcode } from "lucide-react";

export const Route = createFileRoute("/_app/returns")({ component: Returns });

const allReturns = [
  { id: "RET-20260602-008", invoice: "INV-20260602-0142", customer: "Walk-in", branch: "Olaya", item: "Sadia Chicken 1kg", qty: 1, reason: "Damaged packaging", amount: "ر.س 28.00", refund: "Cash", status: "pending", date: "Today 14:42" },
  { id: "RET-20260602-007", invoice: "INV-20260602-0118", customer: "Ahmed K.", branch: "Khobar", item: "Lay's Classic 75g", qty: 3, reason: "Expired stock", amount: "ر.س 21.00", refund: "Wallet credit", status: "approved", date: "Today 12:18" },
  { id: "RET-20260602-006", invoice: "INV-20260602-0094", customer: "Walk-in", branch: "Jeddah", item: "Almarai Yogurt 170g", qty: 2, reason: "Wrong item", amount: "ر.س 9.00", refund: "Cash", status: "approved", date: "Today 11:02" },
  { id: "RET-20260601-031", invoice: "INV-20260601-0312", customer: "Sara M.", branch: "Olaya", item: "Tide Detergent 3kg", qty: 1, reason: "Not as described", amount: "ر.س 52.00", refund: "Card", status: "rejected", date: "Yesterday" },
];

const reasons = ["Damaged packaging", "Expired stock", "Wrong item", "Customer changed mind", "Not as described", "Quality issue", "Other"];

function Returns() {
  const [q, setQ] = useState(""); const [br, setBr] = useState("All"); const [st, setSt] = useState("All");
  const filtered = useMemo(() => allReturns.filter(r =>
    (!q || `${r.invoice} ${r.item} ${r.customer}`.toLowerCase().includes(q.toLowerCase())) &&
    (br === "All" || r.branch === br) && (st === "All" || r.status === st)
  ), [q, br, st]);

  return (
    <PageShell title="Customer Returns" subtitle="Handle item returns, refunds and restocking from one workspace" actions={<NewReturnSheet />}>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Returns Today" value="8" icon={Undo2} accent="primary" />
        <MetricCard label="Pending Approval" value="3" icon={AlertTriangle} accent="warning" />
        <MetricCard label="Refunded Amount" value="ر.س 410" icon={Wallet} />
        <MetricCard label="Items Restocked" value="14" icon={PackageCheck} accent="success" />
      </div>

      <Card className="p-3 border-border/60 shadow-card">
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Search by invoice, item, customer…" value={q} onChange={e => setQ(e.target.value)} className="h-9 flex-1 min-w-[200px]" />
          <Select value={br} onValueChange={setBr}><SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger><SelectContent>{["All","Olaya","Khobar","Jeddah","Madinah"].map(o => <SelectItem key={o} value={o}>{o === "All" ? "All Branches" : o}</SelectItem>)}</SelectContent></Select>
          <Select value={st} onValueChange={setSt}><SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger><SelectContent>{["All","pending","approved","rejected"].map(o => <SelectItem key={o} value={o}>{o === "All" ? "All Status" : o}</SelectItem>)}</SelectContent></Select>
          <Input type="date" className="h-9 w-[150px]" />
        </div>
      </Card>

      <DataTable columns={[
        { key: "id", label: "Return ID", render: r => <span className="font-mono text-xs">{r.id}</span> },
        { key: "invoice", label: "Invoice", render: r => <span className="font-mono text-xs">{r.invoice}</span> },
        { key: "customer", label: "Customer" },
        { key: "branch", label: "Branch", render: r => <Badge variant="outline">{r.branch}</Badge> },
        { key: "item", label: "Item" },
        { key: "qty", label: "Qty", render: r => <span className="font-semibold tabular-nums">×{r.qty}</span> },
        { key: "reason", label: "Reason" },
        { key: "amount", label: "Refund Amount", render: r => <span className="font-semibold">{r.amount}</span> },
        { key: "refund", label: "Method" },
        { key: "status", label: "Status", render: r => <StatusBadge status={r.status} /> },
        { key: "_a", label: "", render: r => r.status === "pending" ? (
          <div className="flex gap-1.5">
            <Button size="sm" className="h-7 px-2 gradient-primary text-primary-foreground border-0">Approve</Button>
            <Button size="sm" variant="outline" className="h-7 px-2">Reject</Button>
          </div>
        ) : <Button size="sm" variant="ghost">View</Button> },
      ]} rows={filtered} />
    </PageShell>
  );
}

function NewReturnSheet() {
  return (
    <Sheet>
      <SheetTrigger asChild><Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow h-9"><Plus className="h-4 w-4" /> New Return</Button></SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle>Process customer return</SheetTitle></SheetHeader>
        <div className="space-y-3 mt-4">
          <div className="space-y-1"><Label className="text-xs">Original invoice</Label>
            <div className="flex gap-2"><Input className="h-9" placeholder="INV-20260602-..." /><Button variant="outline" size="sm" className="h-9 gap-1.5"><ScanBarcode className="h-4 w-4" />Scan</Button></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Item" placeholder="Auto-fill from invoice" />
            <Field label="Qty" defaultValue="1" />
          </div>
          <div className="space-y-1"><Label className="text-xs">Reason</Label>
            <Select defaultValue={reasons[0]}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{reasons.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Refund method</Label>
            <Select defaultValue="cash"><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem><SelectItem value="card">Card (back to original)</SelectItem>
                <SelectItem value="wallet">Store wallet credit</SelectItem><SelectItem value="exchange">Exchange (no refund)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label className="text-xs">Notes</Label><Textarea rows={2} placeholder="Optional notes for audit…" /></div>
          <div className="flex items-center justify-between rounded-xl border border-border/60 p-3 text-sm">
            <span className="text-muted-foreground">Restock item to inventory</span>
            <Badge variant="outline" className="bg-success/10 text-success border-success/30">Yes</Badge>
          </div>
        </div>
        <SheetFooter className="mt-4"><Button className="gradient-primary text-primary-foreground border-0">Submit return</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, defaultValue, placeholder }: { label: string; defaultValue?: string; placeholder?: string }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label><Input className="h-9" defaultValue={defaultValue} placeholder={placeholder} /></div>;
}
