import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { MetricCard } from "@/components/metric-card";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ShoppingCart, Plus, CheckCircle2, Send, Coins, FileText, Wallet, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/purchase-orders")({ component: PurchaseOrders });

type POStatus = "Draft" | "Pending Approval" | "Approved" | "Sent to Supplier" | "Partially Received" | "Fully Received" | "Cancelled" | "Closed";
type PayStatus = "Unpaid" | "Partially Paid" | "Paid" | "Supplier Credit";

type PORow = {
  id: string; supplier: string; type: string; loc: string;
  poDate: string; eta: string; items: number; total: number;
  pay: PayStatus; status: POStatus; by: string; approver: string;
};

const INITIAL: PORow[] = [
  { id: "PO-2026-001", supplier: "Almarai Supplier KSA", type: "Direct Supplier", loc: "Riyadh Main Warehouse", poDate: "12 Jun 2026", eta: "15 Jun 2026", items: 3, total: 4250, pay: "Unpaid", status: "Approved", by: "Fahad Al Saud", approver: "Ayesha Nadeem" },
  { id: "PO-2026-002", supplier: "PepsiCo KSA", type: "Distributor", loc: "Jeddah Stock Room", poDate: "13 Jun 2026", eta: "16 Jun 2026", items: 2, total: 3100, pay: "Partially Paid", status: "Sent to Supplier", by: "Ahmed Al Harbi", approver: "Ayesha Nadeem" },
  { id: "PO-2026-003", supplier: "Nadec Supplier", type: "Direct Supplier", loc: "Riyadh Main Warehouse", poDate: "14 Jun 2026", eta: "17 Jun 2026", items: 4, total: 2120, pay: "Unpaid", status: "Pending Approval", by: "Fahad Al Saud", approver: "—" },
  { id: "PO-2026-004", supplier: "Riyadh Bakery", type: "Local Supplier", loc: "Riyadh Central Baqala", poDate: "11 Jun 2026", eta: "12 Jun 2026", items: 1, total: 1200, pay: "Supplier Credit", status: "Fully Received", by: "Sara Khan", approver: "Ahmed Al Harbi" },
];

const payColor: Record<PayStatus, string> = {
  "Unpaid": "bg-destructive/15 text-destructive border-destructive/30",
  "Partially Paid": "bg-warning/20 text-warning-foreground border-warning/40",
  "Paid": "bg-success/15 text-success border-success/30",
  "Supplier Credit": "bg-primary/15 text-primary border-primary/30",
};
const poColor: Record<POStatus, string> = {
  "Draft": "bg-muted text-muted-foreground border-border",
  "Pending Approval": "bg-warning/20 text-warning-foreground border-warning/40",
  "Approved": "bg-primary/15 text-primary border-primary/30",
  "Sent to Supplier": "bg-primary/15 text-primary border-primary/30",
  "Partially Received": "bg-warning/20 text-warning-foreground border-warning/40",
  "Fully Received": "bg-success/15 text-success border-success/30",
  "Cancelled": "bg-destructive/15 text-destructive border-destructive/30",
  "Closed": "bg-muted text-muted-foreground border-border",
};

function PurchaseOrders() {
  const [rows, setRows] = useState<PORow[]>(INITIAL);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ supplier: "", type: "Direct Supplier", phone: "", vat: "", terms: "Net 30", loc: "Riyadh Main Warehouse", item: "Almarai Milk 1L", qty: "100", cost: "10" });

  const totals = useMemo(() => ({
    count: rows.length,
    pending: rows.filter((r) => r.pay !== "Paid").reduce((s, r) => s + r.total, 0),
    credits: rows.filter((r) => r.pay === "Supplier Credit").reduce((s, r) => s + r.total, 0),
    paid: rows.filter((r) => r.pay === "Paid").reduce((s, r) => s + r.total, 0),
  }), [rows]);

  const submit = () => {
    const id = `PO-2026-${String(rows.length + 1).padStart(3, "0")}`;
    setRows((r) => [{ id, supplier: form.supplier || "New Supplier", type: form.type, loc: form.loc, poDate: "Today", eta: "+3 days", items: 1, total: Number(form.qty) * Number(form.cost), pay: "Unpaid", status: "Pending Approval", by: "Fahad Al Saud", approver: "—" }, ...r]);
    toast.success("Purchase Order submitted — pending approval. Finance entry created.");
    setOpen(false); setStep(1);
  };

  return (
    <PageShell
      title="Purchase Orders"
      subtitle="Accounting & Finance · PO does not increase inventory until Goods Receiving"
      actions={
        <Sheet open={open} onOpenChange={(v) => { setOpen(v); if (!v) setStep(1); }}>
          <SheetTrigger asChild>
            <Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow"><Plus className="h-4 w-4" />New Purchase Order</Button>
          </SheetTrigger>
          <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
            <SheetHeader><SheetTitle>Create Purchase Order — Step {step} / 5</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-3">
              <div className="flex gap-1">
                {[1,2,3,4,5].map((s) => <div key={s} className={`h-1.5 flex-1 rounded-full transition-all ${step >= s ? "bg-primary" : "bg-muted"}`} />)}
              </div>
              {step === 1 && (
                <>
                  <FieldInput label="Supplier Name" v={form.supplier} on={(v) => setForm({ ...form, supplier: v })} />
                  <FieldSel label="Supplier Type" v={form.type} on={(v) => setForm({ ...form, type: v })} opts={["Direct Supplier", "Distributor", "Local Supplier"]} />
                  <FieldInput label="Supplier Phone" v={form.phone} on={(v) => setForm({ ...form, phone: v })} />
                  <FieldInput label="VAT / CR (optional)" v={form.vat} on={(v) => setForm({ ...form, vat: v })} />
                  <FieldSel label="Payment Terms" v={form.terms} on={(v) => setForm({ ...form, terms: v })} opts={["Cash on Delivery", "Net 7", "Net 15", "Net 30", "Net 60"]} />
                </>
              )}
              {step === 2 && (
                <FieldSel label="Delivery Location" v={form.loc} on={(v) => setForm({ ...form, loc: v })} opts={["Riyadh Main Warehouse", "Jeddah Stock Room", "Khobar DC", "Riyadh Central Baqala", "Jeddah Mart 02"]} />
              )}
              {step === 3 && (
                <div className="grid grid-cols-3 gap-3">
                  <FieldInput label="Item" v={form.item} on={(v) => setForm({ ...form, item: v })} />
                  <FieldInput label="Qty" v={form.qty} on={(v) => setForm({ ...form, qty: v })} />
                  <FieldInput label="Unit Cost (SAR)" v={form.cost} on={(v) => setForm({ ...form, cost: v })} />
                </div>
              )}
              {step === 4 && (
                <Card className="p-3 space-y-2 bg-muted/40 text-sm">
                  <Row k="Supplier" v={form.supplier || "—"} /><Row k="Type" v={form.type} />
                  <Row k="Delivery to" v={form.loc} /><Row k="Item" v={`${form.item} × ${form.qty}`} />
                  <Row k="Unit cost" v={`SAR ${form.cost}`} />
                  <Row k="Total" v={`SAR ${Number(form.qty) * Number(form.cost)}`} />
                  <Row k="Payment terms" v={form.terms} />
                </Card>
              )}
              {step === 5 && (
                <Card className="p-4 bg-success/10 border-success/30 text-sm space-y-1">
                  <p className="font-semibold flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" />Ready to submit</p>
                  <p className="text-xs text-muted-foreground">On approval, a Finance payable entry is created. Inventory updates only after Goods Receiving.</p>
                </Card>
              )}
            </div>
            <SheetFooter className="mt-4 flex !justify-between">
              <Button variant="outline" disabled={step === 1} onClick={() => setStep(step - 1)}>Back</Button>
              {step < 5 ? (
                <Button onClick={() => setStep(step + 1)} className="gradient-primary text-primary-foreground border-0">Next</Button>
              ) : (
                <Button onClick={submit} className="gradient-primary text-primary-foreground border-0">Submit for Approval</Button>
              )}
            </SheetFooter>
          </SheetContent>
        </Sheet>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total POs" value={String(totals.count)} icon={ShoppingCart} accent="primary" />
        <MetricCard label="Outstanding Payables" value={`SAR ${totals.pending.toLocaleString()}`} icon={Wallet} accent="warning" />
        <MetricCard label="Supplier Credits" value={`SAR ${totals.credits.toLocaleString()}`} icon={Coins} accent="success" />
        <MetricCard label="Paid This Month" value={`SAR ${totals.paid.toLocaleString()}`} icon={CheckCircle2} />
      </div>

      <Tabs defaultValue="po">
        <TabsList>
          <TabsTrigger value="po"><FileText className="h-3.5 w-3.5 mr-1.5" />Purchase Orders</TabsTrigger>
          <TabsTrigger value="pay"><Wallet className="h-3.5 w-3.5 mr-1.5" />Supplier Payables</TabsTrigger>
          <TabsTrigger value="ret"><AlertTriangle className="h-3.5 w-3.5 mr-1.5" />Return / Credit Entries</TabsTrigger>
        </TabsList>

        <TabsContent value="po" className="mt-3">
          <Card className="overflow-hidden border-border/60 shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3">PO ID</th><th className="px-3 py-3">Supplier</th><th className="px-3 py-3">Type</th>
                  <th className="px-3 py-3">Delivery</th><th className="px-3 py-3">PO Date</th><th className="px-3 py-3">ETA</th>
                  <th className="px-3 py-3">Items</th><th className="px-3 py-3">Total</th>
                  <th className="px-3 py-3">Payment</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Approver</th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30 animate-fade-in">
                      <td className="px-3 py-3 font-mono font-semibold text-xs">{r.id}</td>
                      <td className="px-3 py-3 text-xs">{r.supplier}</td>
                      <td className="px-3 py-3 text-xs">{r.type}</td>
                      <td className="px-3 py-3 text-xs">{r.loc}</td>
                      <td className="px-3 py-3 text-xs">{r.poDate}</td>
                      <td className="px-3 py-3 text-xs">{r.eta}</td>
                      <td className="px-3 py-3 text-xs">{r.items}</td>
                      <td className="px-3 py-3 text-xs font-semibold">SAR {r.total.toLocaleString()}</td>
                      <td className="px-3 py-3"><Badge variant="outline" className={payColor[r.pay]}>{r.pay}</Badge></td>
                      <td className="px-3 py-3"><Badge variant="outline" className={poColor[r.status]}>{r.status}</Badge></td>
                      <td className="px-3 py-3 text-xs">{r.approver}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="pay" className="mt-3">
          <Card className="overflow-hidden border-border/60 shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3">Supplier</th><th className="px-3 py-3">PO</th><th className="px-3 py-3">Invoice</th>
                  <th className="px-3 py-3">PO Amount</th><th className="px-3 py-3">Paid</th><th className="px-3 py-3">Due</th>
                  <th className="px-3 py-3">Credit</th><th className="px-3 py-3">Return Amt</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Action</th>
                </tr></thead>
                <tbody>
                  {[
                    { sup: "Almarai Supplier KSA", po: "PO-2026-001", inv: "SUP-INV-8842", amt: 4250, paid: 0, credit: 0, ret: 0, st: "Unpaid" },
                    { sup: "Riyadh Bakery", po: "PO-2026-004", inv: "SUP-INV-9921", amt: 1200, paid: 800, credit: 120, ret: 120, st: "Partially Paid" },
                    { sup: "PepsiCo KSA", po: "PO-2026-002", inv: "SUP-INV-7710", amt: 3100, paid: 1500, credit: 0, ret: 0, st: "Partially Paid" },
                  ].map((r) => (
                    <tr key={r.po} className="border-b border-border/40 hover:bg-muted/30 animate-fade-in">
                      <td className="px-3 py-3 text-xs font-semibold">{r.sup}</td>
                      <td className="px-3 py-3 font-mono text-xs">{r.po}</td>
                      <td className="px-3 py-3 font-mono text-xs">{r.inv}</td>
                      <td className="px-3 py-3 text-xs">SAR {r.amt.toLocaleString()}</td>
                      <td className="px-3 py-3 text-xs">SAR {r.paid.toLocaleString()}</td>
                      <td className="px-3 py-3 text-xs font-semibold text-warning-foreground">SAR {(r.amt - r.paid - r.credit).toLocaleString()}</td>
                      <td className="px-3 py-3 text-xs">SAR {r.credit}</td>
                      <td className="px-3 py-3 text-xs">SAR {r.ret}</td>
                      <td className="px-3 py-3"><Badge variant="outline" className={r.st === "Unpaid" ? payColor["Unpaid"] : payColor["Partially Paid"]}>{r.st}</Badge></td>
                      <td className="px-3 py-3"><Button size="sm" variant="outline" className="gap-1" onClick={() => toast.success(`Payment marked for ${r.sup}`)}><Send className="h-3 w-3" />Pay</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="ret" className="mt-3">
          <Card className="overflow-hidden border-border/60 shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3">Finance Entry</th><th className="px-3 py-3">Supplier Return</th><th className="px-3 py-3">Supplier</th>
                  <th className="px-3 py-3">PO</th><th className="px-3 py-3">Returned</th><th className="px-3 py-3">Credit</th>
                  <th className="px-3 py-3">Payable Adj.</th><th className="px-3 py-3">Replacement</th><th className="px-3 py-3">Status</th>
                </tr></thead>
                <tbody>
                  <tr className="border-b border-border/40 animate-fade-in">
                    <td className="px-3 py-3 font-mono text-xs">FIN-SRET-001</td>
                    <td className="px-3 py-3 font-mono text-xs">SRET-2026-001</td>
                    <td className="px-3 py-3 text-xs">Riyadh Bakery</td>
                    <td className="px-3 py-3 font-mono text-xs">PO-2026-004</td>
                    <td className="px-3 py-3 text-xs">SAR 120</td>
                    <td className="px-3 py-3 text-xs">SAR 120</td>
                    <td className="px-3 py-3 text-xs text-success">−SAR 120</td>
                    <td className="px-3 py-3 text-xs">Pending</td>
                    <td className="px-3 py-3"><Badge variant="outline" className="bg-primary/15 text-primary border-primary/30">Supplier Credit Created</Badge></td>
                  </tr>
                  <tr className="border-b border-border/40 animate-fade-in">
                    <td className="px-3 py-3 font-mono text-xs">FIN-WST-001</td>
                    <td className="px-3 py-3 text-xs">WST-2026-001 (Wastage)</td>
                    <td className="px-3 py-3 text-xs">—</td>
                    <td className="px-3 py-3 text-xs">—</td>
                    <td className="px-3 py-3 text-xs">SAR 30</td>
                    <td className="px-3 py-3 text-xs">—</td>
                    <td className="px-3 py-3 text-xs">—</td>
                    <td className="px-3 py-3 text-xs">—</td>
                    <td className="px-3 py-3"><Badge variant="outline" className="bg-warning/20 text-warning-foreground border-warning/40">Posted as Wastage Loss</Badge></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function FieldInput({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label><Input className="h-9" value={v} onChange={(e) => on(e.target.value)} /></div>;
}
function FieldSel({ label, v, on, opts }: { label: string; v: string; on: (v: string) => void; opts: string[] }) {
  return (
    <div className="space-y-1"><Label className="text-xs">{label}</Label>
      <Select value={v} onValueChange={on}>
        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
        <SelectContent>{opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-semibold">{v}</span></div>;
}