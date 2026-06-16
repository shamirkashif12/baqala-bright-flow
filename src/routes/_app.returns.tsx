import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/module-placeholder";
import { Plus } from "lucide-react";
import { api, type CustomerReturn } from "@/lib/api";

export const Route = createFileRoute("/_app/returns")({ component: Returns });

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

function Returns() {
  const [returns, setReturns] = useState<CustomerReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [branch, setBranch] = useState("all");
  const [status, setStatus] = useState("all");
  const [date, setDate] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [restock, setRestock] = useState(true);

  useEffect(() => {
    api.getReturns()
      .then(setReturns)
      .finally(() => setLoading(false));
  }, []);

  const filtered = returns.filter(r => {
    const matchQ = !q
      || r.returnNumber?.toLowerCase().includes(q.toLowerCase())
      || r.customer?.fullName?.toLowerCase().includes(q.toLowerCase())
      || r.order?.orderNumber?.toLowerCase().includes(q.toLowerCase());
    const matchSt = status === "all" || r.status === status;
    return matchQ && matchSt;
  });

  return (
    <PageShell title="Returns" subtitle="Customer return requests and refund processing">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search return#, customer, order…" className="h-9 w-56 flex-shrink-0" />
        <Select value={branch} onValueChange={setBranch}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Branch" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            <SelectItem value="riyadh">Riyadh</SelectItem>
            <SelectItem value="jeddah">Jeddah</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="refunded">Refunded</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 w-40" />
        <div className="flex-1" />
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9">
              <Plus className="h-4 w-4" /> New Return
            </Button>
          </SheetTrigger>
          <SheetContent className="max-w-md">
            <SheetHeader><SheetTitle>New Return</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-4">
              <FieldRow label="Invoice / Order #"><Input placeholder="ORD-0001" /></FieldRow>
              <FieldRow label="Customer Name"><Input placeholder="Customer name" /></FieldRow>
              <FieldRow label="Item Description"><Input placeholder="What is being returned?" /></FieldRow>
              <div className="grid grid-cols-2 gap-3">
                <FieldRow label="Qty"><Input type="number" placeholder="1" className="h-9" /></FieldRow>
                <FieldRow label="Refund Amount (SAR)"><Input type="number" placeholder="0.00" className="h-9" /></FieldRow>
              </div>
              <FieldRow label="Reason"><Textarea placeholder="Reason for return…" rows={3} /></FieldRow>
              <FieldRow label="Refund Method">
                <Select>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select method" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card Reversal</SelectItem>
                    <SelectItem value="credit">Store Credit</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
                <div>
                  <p className="text-sm font-medium">Restock Item</p>
                  <p className="text-xs text-muted-foreground">Return to inventory on approval</p>
                </div>
                <Switch checked={restock} onCheckedChange={setRestock} />
              </div>
              <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={() => setSheetOpen(false)}>Submit Return</Button>
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
                  <th className="px-3 py-3 font-semibold">Return#</th>
                  <th className="px-3 py-3 font-semibold">Invoice</th>
                  <th className="px-3 py-3 font-semibold">Customer</th>
                  <th className="px-3 py-3 font-semibold">Reason</th>
                  <th className="px-3 py-3 font-semibold">Refund</th>
                  <th className="px-3 py-3 font-semibold">Method</th>
                  <th className="px-3 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-3 py-3 font-mono text-xs font-bold">{r.returnNumber}</td>
                    <td className="px-3 py-3 font-mono text-xs">{r.order?.orderNumber ?? "—"}</td>
                    <td className="px-3 py-3">{r.customer?.fullName ?? "—"}</td>
                    <td className="px-3 py-3 text-xs max-w-[160px] truncate">{r.reason ?? "—"}</td>
                    <td className="px-3 py-3 tabular-nums font-semibold">SAR {r.refundAmount.toFixed(2)}</td>
                    <td className="px-3 py-3 text-xs">{r.refundMethod ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{new Date(r.createdAt).toLocaleDateString("en-SA")}</td>
                    <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">No returns found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </PageShell>
  );
}
