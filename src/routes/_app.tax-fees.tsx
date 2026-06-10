import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import { DataTable, StatusBadge } from "@/components/module-placeholder";
import { ShieldCheck, Cigarette, Receipt, Calculator, Plus } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_app/tax-fees")({ component: TaxFees });

const customFees = [
  { id: "FEE-001", name: "Plastic Bag Fee", type: "Fixed", value: "ر.س 0.25", applies: "Per bag", branches: "All", status: "active" },
  { id: "FEE-002", name: "Delivery Service Fee", type: "Fixed", value: "ر.س 10.00", applies: "Per order", branches: "All", status: "active" },
  { id: "FEE-003", name: "Card Surcharge", type: "Percent", value: "1.5%", applies: "Card payments", branches: "Olaya, Khobar", status: "active" },
  { id: "FEE-004", name: "Holiday Surcharge", type: "Percent", value: "5%", applies: "Eid week", branches: "All", status: "inactive" },
];

const tobaccoItems = [
  { sku: "TBC-001", name: "Marlboro Red 20s", base: "ر.س 18.00", excise: "100%", vat: "15%", final: "ر.س 41.40", stock: 240 },
  { sku: "TBC-002", name: "Davidoff Gold 20s", base: "ر.س 22.00", excise: "100%", vat: "15%", final: "ر.س 50.60", stock: 180 },
  { sku: "TBC-003", name: "Shisha Tobacco 250g", base: "ر.س 35.00", excise: "100%", vat: "15%", final: "ر.س 80.50", stock: 96 },
  { sku: "TBC-004", name: "Heated Tobacco Sticks", base: "ر.س 25.00", excise: "100%", vat: "15%", final: "ر.س 57.50", stock: 320 },
];

function TaxFees() {
  const [zatca, setZatca] = useState(true);
  const [phase2, setPhase2] = useState(true);
  return (
    <PageShell title="Tax, Fees & Tobacco" subtitle="ZATCA-2 enablement, custom fees and tobacco excise — applied at billing & orders">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="ZATCA Status" value={zatca ? "Enabled" : "Disabled"} icon={ShieldCheck} accent={zatca ? "success" : "warning"} />
        <MetricCard label="Active Custom Fees" value="3" icon={Receipt} accent="primary" />
        <MetricCard label="Tobacco SKUs" value="42" icon={Cigarette} accent="warning" />
        <MetricCard label="Excise Collected (mo)" value="ر.س 18,420" icon={Calculator} accent="primary" />
      </div>

      <Tabs defaultValue="zatca">
        <TabsList>
          <TabsTrigger value="zatca">ZATCA 2</TabsTrigger>
          <TabsTrigger value="fees">Custom Fees</TabsTrigger>
          <TabsTrigger value="tobacco">Tobacco Tax</TabsTrigger>
        </TabsList>

        <TabsContent value="zatca" className="space-y-3 mt-4">
          <Card className="p-6 border-success/30 bg-success/5 shadow-card">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-success/15 text-success flex items-center justify-center">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2"><h3 className="font-semibold">ZATCA e-Invoicing</h3><Badge className="bg-success text-success-foreground border-0">Live</Badge></div>
                  <p className="text-sm text-muted-foreground">Applied automatically on every billing & order</p>
                </div>
              </div>
              <Switch checked={zatca} onCheckedChange={setZatca} />
            </div>
          </Card>
          <div className="grid gap-3 md:grid-cols-2">
            <Card className="p-5 space-y-3">
              <h4 className="font-semibold text-sm">Phase 2 (Integration)</h4>
              <p className="text-xs text-muted-foreground">Real-time clearance with ZATCA Fatoora portal.</p>
              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3"><span className="text-sm">Enable Phase 2 clearance</span><Switch checked={phase2} onCheckedChange={setPhase2} /></div>
              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3"><span className="text-sm">Auto-attach QR to every invoice</span><Switch defaultChecked /></div>
              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3"><span className="text-sm">Block sale if clearance fails</span><Switch /></div>
            </Card>
            <Card className="p-5 space-y-3">
              <h4 className="font-semibold text-sm">Credentials</h4>
              <div className="space-y-1"><Label className="text-xs">VAT Registration No.</Label><Input className="h-9" defaultValue="300012345600003" /></div>
              <div className="space-y-1"><Label className="text-xs">CR Number</Label><Input className="h-9" defaultValue="1010123456" /></div>
              <div className="space-y-1"><Label className="text-xs">CSID Certificate</Label><Input className="h-9" defaultValue="•••••••• valid until Sep 2027" /></div>
              <Button size="sm" variant="outline">Re-onboard with ZATCA</Button>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="fees" className="space-y-3 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">Custom fees are added at checkout and printed on the invoice.</p>
            <FeeDialog />
          </div>
          <DataTable
            columns={[
              { key: "id", label: "ID", render: r => <span className="font-mono text-xs">{r.id}</span> },
              { key: "name", label: "Fee Name", render: r => <span className="font-semibold">{r.name}</span> },
              { key: "type", label: "Type" },
              { key: "value", label: "Value" },
              { key: "applies", label: "Applies to" },
              { key: "branches", label: "Branches" },
              { key: "status", label: "Status", render: r => <StatusBadge status={r.status} /> },
            ]}
            rows={customFees}
          />
        </TabsContent>

        <TabsContent value="tobacco" className="space-y-3 mt-4">
          <Card className="p-5 border-warning/30 bg-warning/5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Cigarette className="h-6 w-6 text-warning-foreground" />
                <div>
                  <h4 className="font-semibold">Excise Tax Rule (KSA)</h4>
                  <p className="text-xs text-muted-foreground">Tobacco products: 100% excise + 15% VAT on (base + excise)</p>
                </div>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="mt-4 rounded-xl bg-card border border-border/60 p-3 text-xs font-mono">
              final_price = (base × (1 + excise%)) × (1 + vat%)
            </div>
          </Card>
          <DataTable
            columns={[
              { key: "sku", label: "SKU", render: r => <span className="font-mono text-xs">{r.sku}</span> },
              { key: "name", label: "Product", render: r => <span className="font-semibold">{r.name}</span> },
              { key: "base", label: "Base" },
              { key: "excise", label: "Excise" },
              { key: "vat", label: "VAT" },
              { key: "final", label: "Selling Price", render: r => <span className="font-bold text-primary">{r.final}</span> },
              { key: "stock", label: "Stock" },
            ]}
            rows={tobaccoItems}
          />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function FeeDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow">
          <Plus className="h-4 w-4" /> New Fee
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add custom fee</DialogTitle>
          <DialogDescription>Applied automatically on billing & order checkout.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1"><Label className="text-xs">Fee name</Label><Input className="h-9" placeholder="e.g. Service fee" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label className="text-xs">Type</Label>
              <Select defaultValue="fixed"><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed (ر.س)</SelectItem>
                  <SelectItem value="percent">Percent (%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label className="text-xs">Value</Label><Input className="h-9" placeholder="0.00" /></div>
          </div>
          <div className="space-y-1"><Label className="text-xs">Applies to</Label>
            <Select defaultValue="order"><SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="order">Every order</SelectItem>
                <SelectItem value="card">Card payments</SelectItem>
                <SelectItem value="delivery">Delivery orders</SelectItem>
                <SelectItem value="bag">Per plastic bag</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button className="gradient-primary text-primary-foreground border-0">Save fee</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}