import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { DataTable, StatusBadge } from "@/components/module-placeholder";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Workflow, ShieldCheck, Percent, BadgeDollarSign, Plus, Power, Eye, Pencil, Trash2 } from "lucide-react";
import { api, type ComplianceRule } from "@/lib/api";

export const Route = createFileRoute("/_app/rules")({ component: Rules });

const RULE_TYPES = [
  "Return Rule", "Discount Eligibility", "Coupon Acceptance",
  "Custom Fee Rule", "Tax/Category Rule", "Item-level Rule", "Approval Rule",
];


function parseConfig(json: string): { condition?: string; action?: string } {
  try { return JSON.parse(json) ?? {}; } catch { return {}; }
}

function Rules() {
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ComplianceRule | null>(null);

  const viewConfig = view ? parseConfig(view.ruleConfig) : {};

  const reload = () => api.getComplianceRules().then(setRules).catch(() => {});

  useEffect(() => {
    api.getComplianceRules().then(setRules).finally(() => setLoading(false));
  }, []);

  const active = rules.filter(r => r.isActive).length;
  const approvalCount = rules.filter(r => r.ruleType?.toLowerCase().includes("approval")).length;
  const discountCount = rules.filter(r =>
    r.ruleType?.toLowerCase().includes("discount") || r.ruleType?.toLowerCase().includes("return")
  ).length;
  const feeCount = rules.filter(r =>
    r.ruleType?.toLowerCase().includes("fee") || r.ruleType?.toLowerCase().includes("tax")
  ).length;

  return (
    <PageShell
      title="Rules Engine"
      subtitle="Business rules for returns, discounts, coupons, fees, taxes & approvals"
      actions={<NewRule onCreated={reload} />}
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active Rules" value={loading ? "—" : String(active)} icon={Workflow} accent="primary" />
        <MetricCard label="Approval Rules" value={loading ? "—" : String(approvalCount)} icon={ShieldCheck} accent="success" />
        <MetricCard label="Discount Rules" value={loading ? "—" : String(discountCount)} icon={Percent} />
        <MetricCard label="Fee / Tax Rules" value={loading ? "—" : String(feeCount)} icon={BadgeDollarSign} accent="warning" />
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : (
        <DataTable
          columns={[
            {
              key: "ruleName", label: "Rule Name",
              render: r => (
                <div>
                  <p className="font-semibold">{r.ruleName}</p>
                  <p className="text-xs text-muted-foreground font-mono">{r.id.slice(0, 8)}</p>
                </div>
              ),
            },
            {
              key: "ruleType", label: "Type",
              render: r => (
                <span className="text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary font-semibold">
                  {r.ruleType}
                </span>
              ),
            },
            { key: "branchId", label: "Branch", render: r => r.branchId ? r.branchId : "All" },
            { key: "appliesTo", label: "Applies to", render: r => r.appliesTo },
            {
              key: "ruleConfig", label: "Condition",
              render: r => {
                const c = parseConfig(r.ruleConfig);
                return <code className="text-xs">{c.condition ?? r.ruleConfig.slice(0, 60)}</code>;
              },
            },
            {
              key: "action", label: "Action",
              render: r => {
                const c = parseConfig(r.ruleConfig);
                return <span className="text-xs">{c.action ?? "—"}</span>;
              },
            },
            {
              key: "isActive", label: "Status",
              render: r => <StatusBadge status={r.isActive ? "active" : "inactive"} />,
            },
            {
              key: "a", label: "",
              render: r => (
                <div className="flex gap-1 justify-end">
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setView(r)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setView(r)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8" title={r.isActive ? "Deactivate" : "Activate"}>
                    <Power className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ),
            },
          ]}
          rows={rules}
        />
      )}

      <Sheet open={!!view} onOpenChange={v => !v && setView(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>{view?.ruleName}</SheetTitle></SheetHeader>
          {view && (
            <div className="space-y-3 mt-4">
              <Field label="Rule name" defaultValue={view.ruleName} />
              <div className="space-y-1">
                <Label className="text-xs">Rule type</Label>
                <Select defaultValue={view.ruleType}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RULE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Branch" defaultValue={view.branchId ?? "All"} />
                <Field label="Applies to" defaultValue={view.appliesTo} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Condition</Label>
                <Textarea rows={2} defaultValue={viewConfig.condition ?? view.ruleConfig} />
              </div>
              <Field label="Action" defaultValue={viewConfig.action ?? ""} />
            </div>
          )}
          <SheetFooter className="mt-4 gap-2">
            <Button variant="outline">{view?.isActive ? "Deactivate" : "Activate"}</Button>
            <Button className="gradient-primary text-primary-foreground border-0" onClick={() => setView(null)}>
              Save rule
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}

function NewRule({ onCreated }: { onCreated?: () => void }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow">
          <Plus className="h-4 w-4" />New Rule
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle>Create business rule</SheetTitle></SheetHeader>
        <div className="space-y-3 mt-4">
          <Field label="Rule name" placeholder="e.g. Loyalty 5% off" />
          <div className="space-y-1">
            <Label className="text-xs">Rule type</Label>
            <Select defaultValue="Return Rule">
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RULE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Branch" placeholder="All" />
            <Field label="Applies to" placeholder="Product / category" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Condition</Label>
            <Textarea rows={2} placeholder="e.g. Days since invoice ≤ 7" />
          </div>
          <Field label="Action" placeholder="Allow return" />
        </div>
        <SheetFooter className="mt-4">
          <Button className="gradient-primary text-primary-foreground border-0" onClick={onCreated}>
            Create rule
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, defaultValue, placeholder }: { label: string; defaultValue?: string; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input className="h-9" defaultValue={defaultValue} placeholder={placeholder} />
    </div>
  );
}
