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

const roles = ["Admin", "Manager", "Cashier", "Inventory Staff", "Warehouse Staff", "Accountant"];
const modules: { name: string; perms: string[] }[] = [
  { name: "Orders", perms: ["View", "Add", "Edit", "Refund"] },
  { name: "POS", perms: ["Use POS", "Apply Discount", "Apply Coupon", "Manage Settings"] },
  { name: "Inventory", perms: ["View", "Add", "Edit", "Delete"] },
  { name: "Warehouse", perms: ["View", "Add Item", "Transfer", "Adjust"] },
  { name: "Cashier Closing", perms: ["View Own", "View All", "Approve"] },
  { name: "Coupons & Discounts", perms: ["View", "Create", "Edit"] },
  { name: "BI Reports", perms: ["View Summary", "View Detailed", "Export"] },
  { name: "Users & Roles", perms: ["View", "Add", "Edit", "Delete"] },
];

const defaultGrants: Record<string, Set<string>> = {
  Admin: new Set(modules.flatMap(m => m.perms.map(p => `${m.name}::${p}`))),
  Manager: new Set([
    "Orders::View", "Orders::Edit", "Orders::Refund", "POS::Use POS",
    "Inventory::View", "Inventory::Edit", "Warehouse::View", "Warehouse::Transfer",
    "Cashier Closing::View All", "Cashier Closing::Approve",
    "Coupons & Discounts::View", "Coupons & Discounts::Create",
    "BI Reports::View Summary", "BI Reports::View Detailed",
  ]),
  Cashier: new Set([
    "Orders::View", "Orders::Add", "POS::Use POS", "POS::Apply Discount", "POS::Apply Coupon",
    "Cashier Closing::View Own",
  ]),
  "Inventory Staff": new Set(["Inventory::View", "Inventory::Add", "Inventory::Edit", "Warehouse::View"]),
  "Warehouse Staff": new Set(["Warehouse::View", "Warehouse::Add Item", "Warehouse::Transfer", "Warehouse::Adjust", "Inventory::View"]),
  Accountant: new Set(["Orders::View", "Coupons & Discounts::View", "BI Reports::View Detailed", "BI Reports::Export"]),
};

function Roles() {
  const [active, setActive] = useState<string>("Admin");
  const grants = defaultGrants[active] ?? new Set();
  return (
    <PageShell title="Roles & Permissions" subtitle="Access control & permission matrix">
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
              <p className="text-xs text-muted-foreground">Toggle module-level access for this role</p>
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