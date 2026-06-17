import { createFileRoute } from "@tanstack/react-router";
import { RoleGate } from "@/components/role-gate";
import { useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Lock, Plus, Shield, UserCog } from "lucide-react";

export const Route = createFileRoute("/_app/roles")({
  component: () => (
    <RoleGate allow={["owner"]}>
      <Roles />
    </RoleGate>
  ),
});

const roles = ["Admin", "Manager", "Cashier", "Inventory Staff", "Warehouse Staff", "Accountant", "Auditor"];
const roleDesc: Record<string, string> = {
  Admin: "Full system access",
  Manager: "Branch operations and approvals",
  Cashier: "POS, checkout, orders, returns request, shift reports",
  "Inventory Staff": "Inventory, scanner, stock in/out, stock receiving",
  "Warehouse Staff": "Warehouse stock, stock transfer, supplier return request",
  Accountant: "Purchase orders, supplier invoices, payments, finance reports",
  Auditor: "Read-only reports and audit logs",
};
const modules: { name: string; perms: string[] }[] = [
  { name: "POS", perms: ["Access POS", "Process Checkout", "Hold Order", "Reopen Held Order", "Apply Discount", "Apply Coupon", "Print Receipt", "Process Refund Request"] },
  { name: "Orders", perms: ["View Orders", "Add Order", "Edit Order", "Remove Order", "Cancel Order", "Print Order Receipt"] },
  { name: "Inventory", perms: ["View Inventory", "Add Inventory", "Remove Inventory", "Edit Inventory", "Scan Inventory", "Stock-In", "Stock-Out", "Adjust Stock", "Mark Damaged", "Mark Expired", "View Stock Movement"] },
  { name: "Warehouse", perms: ["View Warehouse", "View Warehouse Items", "Transfer Stock", "Receive Stock", "Dispatch Stock", "View Movement Logs"] },
  { name: "Purchase Orders", perms: ["View Purchase Orders", "Create Purchase Order", "Edit Purchase Order", "Approve Purchase Order", "Cancel Purchase Order", "Send PO to Supplier", "Convert PO to Goods Receiving"] },
  { name: "Supplier Returns", perms: ["Create Supplier Return", "Approve Supplier Return", "Dispatch Return to Supplier", "Mark Replacement Received", "View Supplier Return Notes"] },
  { name: "Accounting & Finance", perms: ["View Finance Dashboard", "View Supplier Payables", "View Purchase Orders", "View Supplier Credits", "View Supplier Return Amounts", "Mark Supplier Payment", "Export Finance Report"] },
  { name: "Staff & Roles", perms: ["View Staff", "Create Staff", "Edit Staff", "Remove Staff", "Assign Role", "Assign Permissions"] },
  { name: "Reports", perms: ["View Reports", "Add Report", "Remove Report", "Configure Report Visibility", "Export PDF", "Export Excel"] },
  { name: "Settings", perms: ["View Settings", "Edit Policies", "Edit POS Settings", "Edit Payment Settings", "Edit Staff Settings"] },
];

const allKeys = modules.flatMap((m) => m.perms.map((p) => `${m.name}::${p}`));
const defaultGrants: Record<string, Set<string>> = {
  Admin: new Set(allKeys),
  Manager: new Set(allKeys.filter((k) => !k.startsWith("Staff & Roles::") && !k.startsWith("Settings::Edit Staff Settings"))),
  Cashier: new Set([
    "POS::Access POS", "POS::Process Checkout", "POS::Hold Order", "POS::Reopen Held Order", "POS::Apply Discount", "POS::Apply Coupon", "POS::Print Receipt", "POS::Process Refund Request",
    "Orders::View Orders", "Orders::Add Order", "Orders::Print Order Receipt",
  ]),
  "Inventory Staff": new Set([
    "Inventory::View Inventory", "Inventory::Add Inventory", "Inventory::Edit Inventory", "Inventory::Scan Inventory", "Inventory::Stock-In", "Inventory::Stock-Out", "Inventory::Adjust Stock", "Inventory::Mark Damaged", "Inventory::Mark Expired", "Inventory::View Stock Movement",
    "Warehouse::View Warehouse", "Warehouse::View Warehouse Items", "Warehouse::Receive Stock",
  ]),
  "Warehouse Staff": new Set([
    "Warehouse::View Warehouse", "Warehouse::View Warehouse Items", "Warehouse::Transfer Stock", "Warehouse::Receive Stock", "Warehouse::Dispatch Stock", "Warehouse::View Movement Logs",
    "Supplier Returns::Create Supplier Return", "Supplier Returns::Dispatch Return to Supplier",
  ]),
  Accountant: new Set([
    ...modules.find((m) => m.name === "Purchase Orders")!.perms.map((p) => `Purchase Orders::${p}`),
    ...modules.find((m) => m.name === "Accounting & Finance")!.perms.map((p) => `Accounting & Finance::${p}`),
    "Reports::View Reports", "Reports::Export PDF", "Reports::Export Excel",
  ]),
  Auditor: new Set([
    "Reports::View Reports", "Orders::View Orders", "Inventory::View Inventory", "Warehouse::View Warehouse",
    "Purchase Orders::View Purchase Orders", "Accounting & Finance::View Finance Dashboard", "Staff & Roles::View Staff",
  ]),
};

function Roles() {
  const [active, setActive] = useState<string>("Admin");
  const grants = defaultGrants[active] ?? new Set();
  return (
    <PageShell title="Roles & Permissions" subtitle="Access control · permission matrix · custom roles">
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="p-3 border-border/60 shadow-card h-fit">
          <div className="flex items-center justify-between mb-3 px-2">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Shield className="h-4 w-4 text-primary" />Roles</h3>
            <AddRoleDialog />
          </div>
          <div className="space-y-1">
            {roles.map((r) => (
              <button
                key={r}
                onClick={() => setActive(r)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${active === r ? "bg-primary text-primary-foreground shadow-glow" : "hover:bg-muted/60"}`}
              >
                <span className="flex items-center gap-2"><UserCog className="h-3.5 w-3.5" />{r}</span>
                <Badge variant="outline" className={active === r ? "bg-white/20 text-primary-foreground border-white/30" : ""}>{defaultGrants[r]?.size ?? 0}</Badge>
              </button>
            ))}
          </div>
        </Card>

        <Card className="border-border/60 shadow-card overflow-hidden">
          <div className="p-4 border-b border-border/60 flex items-center justify-between">
            <div>
              <h3 className="font-semibold flex items-center gap-2"><Lock className="h-4 w-4 text-primary" />{active} Permissions</h3>
              <p className="text-xs text-muted-foreground">{roleDesc[active] ?? "Custom role"}</p>
            </div>
            <Button size="sm" className="gradient-primary text-primary-foreground border-0">Save</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Module</th>
                  <th className="px-4 py-3 font-semibold">Permissions</th>
                </tr>
              </thead>
              <tbody>
                {modules.map((m) => (
                  <tr key={m.name} className="border-b last:border-0">
                    <td className="px-4 py-3.5 font-semibold align-top w-48">{m.name}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-x-6 gap-y-2">
                        {m.perms.map((p) => {
                          const key = `${m.name}::${p}`;
                          return (
                            <label key={p} className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox defaultChecked={grants.has(key)} />
                              <span>{p}</span>
                            </label>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </PageShell>
  );
}

function AddRoleDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1"><Plus className="h-3.5 w-3.5" />Add</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Role</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label className="text-xs">Role Name</Label><Input placeholder="e.g. Shift Supervisor" /></div>
          <div className="space-y-1"><Label className="text-xs">Description</Label><Input placeholder="What this role can do" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button className="gradient-primary text-primary-foreground border-0" onClick={() => setOpen(false)}>Create Role</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}