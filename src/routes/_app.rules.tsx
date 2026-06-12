import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { DataTable, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
import { Workflow, ShieldCheck, Percent, TicketPercent, BadgeDollarSign, Plus, Power, Eye, Pencil, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_app/rules")({ component: Rules });

const rules = [
  { id: "RL-001", name: "Return within 7 days", type: "Return Rule", branch: "All", scope: "All products", cond: "Days since invoice ≤ 7 AND item unused", action: "Allow return", status: "active", by: "Abdullah", updated: "01 Jun 26" },
  { id: "RL-002", name: "VIP 10% discount", type: "Discount Eligibility", branch: "All", scope: "VIP customers", cond: "Customer tier = VIP", action: "Apply 10% off", status: "active", by: "Sara", updated: "30 May 26" },
  { id: "RL-003", name: "Coupon RAMADAN20 limit", type: "Coupon Acceptance", branch: "All", scope: "RAMADAN20", cond: "Usage ≤ 5000 AND date in March–April", action: "Accept coupon", status: "active", by: "Abdullah", updated: "10 Mar 26" },
  { id: "RL-004", name: "Delivery service fee", type: "Custom Fee Rule", branch: "All", scope: "Delivery orders", cond: "Order channel = Delivery", action: "Add ر.س 10 fee", status: "active", by: "Yousef", updated: "15 May 26" },
  { id: "RL-005", name: "Tobacco excise", type: "Tax/Category Rule", branch: "All", scope: "Tobacco category", cond: "Category = Tobacco", action: "100% excise + 15% VAT", status: "active", by: "System", updated: "01 Jan 26" },
  { id: "RL-006", name: "Manager approval > ر.س 500 refund", type: "Approval Rule", branch: "All", scope: "Refunds", cond: "Refund amount > 500", action: "Require manager approval", status: "active", by: "Abdullah", updated: "20 May 26" },
  { id: "RL-007", name: "No discount on tobacco", type: "Item-level Rule", branch: "All", scope: "Tobacco SKUs", cond: "Category = Tobacco", action: "Block discount", status: "active", by: "Sara", updated: "12 May 26" },
  { id: "RL-008", name: "Holiday surcharge", type: "Custom Fee Rule", branch: "All", scope: "All orders", cond: "Date in Eid week", action: "Add 5% surcharge", status: "inactive", by: "Abdullah", updated: "02 Jun 26" },
];

function Rules() {
  const [view, setView] = useState<any | null>(null);
  return (
    <PageShell title="Rules Engine" subtitle="Business rules for returns, discounts, coupons, fees, taxes & approvals" actions={<NewRule />}>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active Rules" value="7" icon={Workflow} accent="primary" />
        <MetricCard label="Approval Rules" value="3" icon={ShieldCheck} accent="success" />
        <MetricCard label="Discount Rules" value="4" icon={Percent} />
        <MetricCard label="Fee / Tax Rules" value="5" icon={BadgeDollarSign} accent="warning" />
      </div>

      <DataTable
        columns={[
          { key: "name", label: "Rule Name", render: r => <div><p className="font-semibold">{r.name}</p><p className="text-xs text-muted-foreground">{r.id}</p></div> },
          { key: "type", label: "Type", render: r => <span className="text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary font-semibold">{r.type}</span> },
          { key: "branch", label: "Branch" },
          { key: "scope", label: "Applies to" },
          { key: "cond", label: "Condition", render: r => <code className="text-xs">{r.cond}</code> },
          { key: "action", label: "Action" },
          { key: "by", label: "Created by" },
          { key: "updated", label: "Updated" },
          { key: "status", label: "Status", render: r => <StatusBadge status={r.status} /> },
          { key: "a", label: "", render: r => (
            <div className="flex gap-1 justify-end">
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setView(r)}><Eye className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setView(r)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8" title={r.status === "active" ? "Deactivate" : "Activate"}><Power className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
            </div>
          )},
        ]}
        rows={rules}
      />

      <Sheet open={!!view} onOpenChange={v => !v && setView(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>{view?.name}</SheetTitle></SheetHeader>
          <div className="space-y-3 mt-4">
            <Field label="Rule name" defaultValue={view?.name} />
            <div className="space-y-1"><Label className="text-xs">Rule type</Label>
              <Select defaultValue={view?.type ?? "Return Rule"}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{["Return Rule","Discount Eligibility","Coupon Acceptance","Custom Fee Rule","Tax/Category Rule","Item-level Rule","Approval Rule"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Branch" defaultValue={view?.branch} />
              <Field label="Applies to (product / category)" defaultValue={view?.scope} />
            </div>
            <div className="space-y-1"><Label className="text-xs">Condition</Label><Textarea rows={2} defaultValue={view?.cond} /></div>
            <Field label="Action" defaultValue={view?.action} />
          </div>
          <SheetFooter className="mt-4 gap-2">
            <Button variant="outline">Deactivate</Button>
            <Button className="gradient-primary text-primary-foreground border-0" onClick={() => setView(null)}>Save rule</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}

function NewRule() {
  return (
    <Sheet>
      <SheetTrigger asChild><Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow"><Plus className="h-4 w-4" />New Rule</Button></SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle>Create business rule</SheetTitle></SheetHeader>
        <div className="space-y-3 mt-4">
          <Field label="Rule name" placeholder="e.g. Loyalty 5% off" />
          <div className="space-y-1"><Label className="text-xs">Rule type</Label>
            <Select defaultValue="Return Rule"><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{["Return Rule","Discount Eligibility","Coupon Acceptance","Custom Fee Rule","Tax/Category Rule","Item-level Rule","Approval Rule"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Branch" placeholder="All" />
            <Field label="Applies to" placeholder="Product / category" />
          </div>
          <div className="space-y-1"><Label className="text-xs">Condition</Label><Textarea rows={2} placeholder="e.g. Days since invoice ≤ 7" /></div>
          <Field label="Action" placeholder="Allow return" />
        </div>
        <SheetFooter className="mt-4"><Button className="gradient-primary text-primary-foreground border-0">Create rule</Button></SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, defaultValue, placeholder }: { label: string; defaultValue?: string; placeholder?: string }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label><Input className="h-9" defaultValue={defaultValue} placeholder={placeholder} /></div>;
}
