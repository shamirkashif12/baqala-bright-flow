import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/role-gate";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/pos-settings")({
  component: () => (
    <RoleGate allow={["owner", "manager"]}>
      <PosSettings />
    </RoleGate>
  ),
});

function Row({ title, desc, defaultChecked = false }: { title: string; desc?: string; defaultChecked?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 p-4 rounded-xl border border-border/60 hover:border-primary/40 transition-colors">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      <Switch defaultChecked={defaultChecked} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input className="h-9" defaultValue={value} />
    </div>
  );
}

function PosSettings() {
  return (
    <PageShell title="POS Settings" subtitle="Configure cashier, terminal, payments, printing and permissions">
      <Tabs defaultValue="cashier">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="cashier">Cashier</TabsTrigger>
          <TabsTrigger value="terminal">Terminal</TabsTrigger>
          <TabsTrigger value="payment">Payments</TabsTrigger>
          <TabsTrigger value="invoice">Invoice</TabsTrigger>
          <TabsTrigger value="permissions">Permissions</TabsTrigger>
          <TabsTrigger value="scan">Scan & Expiry</TabsTrigger>
          <TabsTrigger value="card">Card Machine</TabsTrigger>
          <TabsTrigger value="printer">Printer</TabsTrigger>
        </TabsList>

        <TabsContent value="cashier" className="space-y-3 mt-4">
          <Row title="Require check-in PIN" desc="Cashiers enter a 4-digit PIN before any sale" defaultChecked />
          <Row title="Require opening cash count" defaultChecked />
          <Row title="Auto-lock after idle 5 minutes" defaultChecked />
          <Row title="Allow cashier to view past shifts" />
        </TabsContent>

        <TabsContent value="terminal" className="space-y-3 mt-4">
          <Card className="p-4 grid sm:grid-cols-2 gap-3">
            <Field label="Terminal Name Prefix" value="TML-RYD-" />
            <Field label="Default Branch" value="Olaya" />
            <Field label="Currency" value="SAR" />
            <Field label="Receipt Width (mm)" value="80" />
          </Card>
          <Row title="Allow terminal switching for cashier" defaultChecked />
          <Row title="Preserve held orders across terminal switch" defaultChecked />
        </TabsContent>

        <TabsContent value="payment" className="space-y-3 mt-4">
          {["Cash", "Card", "Wallet (STC Pay / Apple Pay)", "Bank Transfer", "Split Payment", "Other"].map(p => (
            <Row key={p} title={p} desc={`Enable ${p} as a tender option`} defaultChecked />
          ))}
        </TabsContent>

        <TabsContent value="invoice" className="space-y-3 mt-4">
          <Card className="p-4 grid sm:grid-cols-2 gap-3">
            <Field label="Invoice Prefix" value="INV-" />
            <Field label="Footer Message" value="شكراً لزيارتكم — Thank you for shopping" />
            <Field label="VAT %" value="15" />
            <Field label="ZATCA QR Position" value="Bottom Center" />
          </Card>
          <Row title="Auto-print invoice after charge" defaultChecked />
          <Row title="Send invoice by SMS" />
        </TabsContent>

        <TabsContent value="permissions" className="space-y-3 mt-4">
          <Row title="Cashier can apply discount" defaultChecked />
          <Row title="Cashier can apply coupon" defaultChecked />
          <Row title="Cashier can refund" />
          <Row title="Cashier can hold orders" defaultChecked />
          <Row title="Cashier can edit completed orders" />
          <Row title="Manager approval required for refund > ر.س 100" defaultChecked />
        </TabsContent>

        <TabsContent value="scan" className="space-y-3 mt-4">
          <Row title="Beep on successful scan" defaultChecked />
          <Row title="Warn cashier on close-to-expiry items" defaultChecked />
          <Row title="Allow sale of close-to-expiry with confirmation" defaultChecked />
          <Row title="Block sale of expired items" defaultChecked />
          <Row title="Block sale of non-permissible items" defaultChecked />
        </TabsContent>

        <TabsContent value="card" className="space-y-3 mt-4">
          <Card className="p-4 grid sm:grid-cols-2 gap-3">
            <Field label="Card Machine Vendor" value="Geidea" />
            <Field label="Terminal Pairing Code" value="GD-4892-RYD" />
            <Field label="Connection" value="Bluetooth" />
            <Field label="Timeout (sec)" value="45" />
          </Card>
          <Row title="Auto-send amount to card machine" defaultChecked />
        </TabsContent>

        <TabsContent value="printer" className="space-y-3 mt-4">
          <Card className="p-4 grid sm:grid-cols-2 gap-3">
            <Field label="Printer Brand" value="Epson TM-T20III" />
            <Field label="Connection" value="USB" />
            <Field label="Paper Width" value="80mm" />
            <Field label="Cash Drawer Pulse" value="Pin 2" />
          </Card>
          <Row title="Open cash drawer after cash sale" defaultChecked />
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button className="gradient-primary text-primary-foreground border-0">Save Settings</Button>
      </div>
    </PageShell>
  );
}