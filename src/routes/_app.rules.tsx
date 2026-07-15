import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { Workflow, ShieldCheck, Percent, BadgeDollarSign, Plus, Power, Eye, Pencil, Trash2, Loader2 } from "lucide-react";
import { api, type ComplianceRule, type Branch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermission } from "@/lib/use-permission";

export const Route = createFileRoute("/_app/rules")({ component: Rules });

const RULE_TYPES = [
  "Return Rule", "Discount Eligibility", "Coupon Acceptance",
  "Custom Fee Rule", "Tax/Category Rule", "Item-level Rule", "Approval Rule",
];

const ALL_BRANCHES = "__all__";

interface RuleFormState {
  ruleName: string;
  ruleType: string;
  branchId: string; // ALL_BRANCHES or a real branch id
  appliesTo: string;
  condition: string;
  action: string;
}

const EMPTY_FORM: RuleFormState = {
  ruleName: "", ruleType: RULE_TYPES[0], branchId: ALL_BRANCHES, appliesTo: "", condition: "", action: "",
};

function parseConfig(json: string): { condition?: string; action?: string } {
  try { return JSON.parse(json) ?? {}; } catch { return {}; }
}

function toRuleConfig(condition: string, action: string): string {
  return JSON.stringify({ condition, action });
}

function ruleToForm(r: ComplianceRule): RuleFormState {
  const c = parseConfig(r.ruleConfig);
  return {
    ruleName: r.ruleName,
    ruleType: r.ruleType,
    branchId: r.branchId ?? ALL_BRANCHES,
    appliesTo: r.appliesTo,
    condition: c.condition ?? r.ruleConfig,
    action: c.action ?? "",
  };
}

function Rules() {
  const { user } = useAuth();
  const { canCreate, canEdit, canDelete } = usePermission("Rules Engine");
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ComplianceRule | null>(null);
  const [editForm, setEditForm] = useState<RuleFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = () => api.getComplianceRules({ includeInactive: true }).then(setRules).catch(() => {});

  useEffect(() => {
    Promise.all([
      api.getComplianceRules({ includeInactive: true }),
      api.getBranches().catch(() => [] as Branch[]),
    ]).then(([r, b]) => { setRules(r); setBranches(b); }).finally(() => setLoading(false));
  }, []);

  const openView = (r: ComplianceRule) => { setEditForm(ruleToForm(r)); setView(r); };

  const active = rules.filter(r => r.isActive).length;
  const approvalCount = rules.filter(r => r.ruleType?.toLowerCase().includes("approval")).length;
  const discountCount = rules.filter(r =>
    r.ruleType?.toLowerCase().includes("discount") || r.ruleType?.toLowerCase().includes("return")
  ).length;
  const feeCount = rules.filter(r =>
    r.ruleType?.toLowerCase().includes("fee") || r.ruleType?.toLowerCase().includes("tax")
  ).length;

  const handleSaveEdit = async () => {
    if (!view) return;
    if (!editForm.ruleName.trim()) { toast.error("Rule name is required."); return; }
    setSaving(true);
    try {
      await api.updateComplianceRule(view.id, {
        ruleName: editForm.ruleName.trim(),
        ruleType: editForm.ruleType,
        appliesTo: editForm.appliesTo.trim() || "all",
        branchId: editForm.branchId === ALL_BRANCHES ? undefined : editForm.branchId,
        ruleConfig: toRuleConfig(editForm.condition, editForm.action),
        priority: view.priority,
        isActive: view.isActive,
      });
      toast.success("Rule updated");
      setView(null);
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update rule.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (r: ComplianceRule) => {
    setBusyId(r.id);
    try {
      await api.toggleComplianceRule(r.id);
      reload();
      if (view?.id === r.id) setView({ ...view, isActive: !view.isActive });
    } catch (e: any) {
      toast.error(e?.message || "Failed to update rule status.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (r: ComplianceRule) => {
    if (!confirm(`Delete rule "${r.ruleName}"? This cannot be undone.`)) return;
    setBusyId(r.id);
    try {
      await api.deleteComplianceRule(r.id);
      toast.success("Rule deleted");
      if (view?.id === r.id) setView(null);
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete rule.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <PageShell
      title="Rules Engine"
      subtitle="Business rules for returns, discounts, coupons, fees, taxes & approvals"
      actions={canCreate ? <NewRule branches={branches} createdBy={user?.id} onCreated={reload} /> : undefined}
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active Rules" value={loading ? "—" : String(active)} icon={Workflow} accent="primary" />
        <MetricCard label="Approval Rules" value={loading ? "—" : String(approvalCount)} icon={ShieldCheck} accent="success" />
        <MetricCard label="Discount Rules" value={loading ? "—" : String(discountCount)} icon={Percent} />
        <MetricCard label="Fee / Tax Rules" value={loading ? "—" : String(feeCount)} icon={BadgeDollarSign} accent="warning" />
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : rules.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No rules configured yet.</p>
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
            { key: "branchId", label: "Branch", render: r => r.branchId ? (branches.find(b => b.id === r.branchId)?.name ?? r.branchId) : "All" },
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
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openView(r)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  {canEdit && (
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openView(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      size="icon" variant="ghost" className="h-8 w-8"
                      title={r.isActive ? "Deactivate" : "Activate"}
                      disabled={busyId === r.id}
                      onClick={() => handleToggle(r)}
                    >
                      {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                      disabled={busyId === r.id}
                      onClick={() => handleDelete(r)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
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
              <Field label="Rule name" value={editForm.ruleName} onChange={v => setEditForm(f => ({ ...f, ruleName: v }))} disabled={!canEdit} />
              <div className="space-y-1">
                <Label className="text-xs">Rule type</Label>
                <Select value={editForm.ruleType} onValueChange={v => setEditForm(f => ({ ...f, ruleType: v }))} disabled={!canEdit}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RULE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Branch</Label>
                  <Select value={editForm.branchId} onValueChange={v => setEditForm(f => ({ ...f, branchId: v }))} disabled={!canEdit}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_BRANCHES}>All branches</SelectItem>
                      {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Field label="Applies to" value={editForm.appliesTo} onChange={v => setEditForm(f => ({ ...f, appliesTo: v }))} disabled={!canEdit} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Condition</Label>
                <Textarea rows={2} value={editForm.condition} onChange={e => setEditForm(f => ({ ...f, condition: e.target.value }))} disabled={!canEdit} />
              </div>
              <Field label="Action" value={editForm.action} onChange={v => setEditForm(f => ({ ...f, action: v }))} disabled={!canEdit} />
            </div>
          )}
          <SheetFooter className="mt-4 gap-2">
            {canEdit && view && (
              <Button variant="outline" disabled={busyId === view.id} onClick={() => handleToggle(view)}>
                {view.isActive ? "Deactivate" : "Activate"}
              </Button>
            )}
            {canEdit && (
              <Button className="gradient-primary text-primary-foreground border-0" disabled={saving} onClick={handleSaveEdit}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save rule"}
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}

function NewRule({ branches, createdBy, onCreated }: { branches: Branch[]; createdBy?: string; onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<RuleFormState>(EMPTY_FORM);

  const handleCreate = async () => {
    if (!form.ruleName.trim()) { toast.error("Rule name is required."); return; }
    if (!createdBy) { toast.error("You must be signed in to create a rule."); return; }
    setSaving(true);
    try {
      await api.createComplianceRule({
        ruleName: form.ruleName.trim(),
        ruleType: form.ruleType,
        appliesTo: form.appliesTo.trim() || "all",
        branchId: form.branchId === ALL_BRANCHES ? undefined : form.branchId,
        ruleConfig: toRuleConfig(form.condition, form.action),
        priority: 0,
        isActive: true,
        createdBy,
      });
      toast.success("Rule created");
      setForm(EMPTY_FORM);
      setOpen(false);
      onCreated?.();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create rule.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={v => { setOpen(v); if (!v) setForm(EMPTY_FORM); }}>
      <SheetTrigger asChild>
        <Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow">
          <Plus className="h-4 w-4" />New Rule
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle>Create business rule</SheetTitle></SheetHeader>
        <div className="space-y-3 mt-4">
          <Field label="Rule name" placeholder="e.g. Loyalty 5% off" value={form.ruleName} onChange={v => setForm(f => ({ ...f, ruleName: v }))} />
          <div className="space-y-1">
            <Label className="text-xs">Rule type</Label>
            <Select value={form.ruleType} onValueChange={v => setForm(f => ({ ...f, ruleType: v }))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RULE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Branch</Label>
              <Select value={form.branchId} onValueChange={v => setForm(f => ({ ...f, branchId: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_BRANCHES}>All branches</SelectItem>
                  {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Field label="Applies to" placeholder="Product / category" value={form.appliesTo} onChange={v => setForm(f => ({ ...f, appliesTo: v }))} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Condition</Label>
            <Textarea rows={2} placeholder="e.g. Days since invoice ≤ 7" value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value }))} />
          </div>
          <Field label="Action" placeholder="Allow return" value={form.action} onChange={v => setForm(f => ({ ...f, action: v }))} />
        </div>
        <SheetFooter className="mt-4">
          <Button className="gradient-primary text-primary-foreground border-0" disabled={saving} onClick={handleCreate}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create rule"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, value, onChange, placeholder, disabled }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input className="h-9" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} />
    </div>
  );
}
