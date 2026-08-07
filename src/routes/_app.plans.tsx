import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Check, Crown, Zap, Building2, Store, Globe, AlertTriangle, Minus, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { SARIcon } from "@/lib/currency";
import { toast } from "sonner";
import { api, type TenantPlanInfo } from "@/lib/api";

export const Route = createFileRoute("/_app/plans")({ component: Plans });

type PlanCatalogEntry = {
  name: string; price: number; tag: string; featured: boolean;
  icon: React.FC<{ className?: string }>;
  f: string[];
  // Static reference numbers for the catalog card display — undefined means unlimited
  // (Enterprise). Overridden with the real enforced plan's limits for whichever entry matches
  // the tenant's actual provisioned plan (see resolvePlans below).
  limits: { branches?: number; terminals?: number; users?: number };
};

type Plan = PlanCatalogEntry & { status: "active" | "current" | "upgrade" | "contact" };

// Matches the "Fixed Bundles" pricing deck exactly (Basic/Standard/Premium — Enterprise below is
// this app's own pre-existing custom/contact-sales tier, not part of that deck).
const PLAN_CATALOG: PlanCatalogEntry[] = [
  {
    name: "Basic", price: 199, tag: "For a single baqala", featured: false,
    icon: Store, limits: { branches: 10, terminals: 4, users: 4 },
    f: [
      "10 Branches", "4 Terminals/Branch", "4 Users/Branch",
      "Dashboard", "POS Checkout & Orders", "Customers & Loyalty", "Cashier Web Workspace",
      "Supplier Management", "Stock Control", "Users & Staff Accounts", "Roles & Permissions",
      "Sales Reports", "POS Settings",
    ],
  },
  {
    name: "Standard", price: 399, tag: "Growing mart operators", featured: true,
    icon: Zap, limits: { branches: 18, terminals: 10, users: 10 },
    f: [
      "18 Branches", "10 Terminals/Branch", "10 Users/Branch", "Everything in Basic",
      "Manager & Cashier Applications", "Supplier Returns (RTS)", "Stocktaking & Inventory Control",
      "Batch Tracking & Expiry Management", "Warehouse Management", "Employee & Shift Management",
      "Pricing & Promotions", "Purchase Order Management", "Self-Service Kiosk",
    ],
  },
  {
    name: "Premium", price: 699, tag: "Multi-branch operations", featured: false,
    icon: Building2, limits: {},
    f: [
      "Unlimited Branches", "Unlimited Terminals", "Unlimited Users", "Everything in Standard",
      "ZATCA Compliance & Invoicing", "QR Code Printing & Labels", "Multi-Branch & Terminal Network",
      "Control Tower & Approval Centre", "KPI Evaluation & Business Intelligence",
    ],
  },
  {
    name: "Enterprise", price: 0, tag: "Tailored for chains", featured: false,
    icon: Globe, limits: {},
    f: ["Unlimited Branches", "Unlimited Terminals", "Unlimited Users", "Dedicated warehouse hubs", "Mart-to-mart network", "Custom integrations", "Dedicated account manager", "On-site training"],
  },
];

const TIER_ORDER = PLAN_CATALOG.map((p) => p.name);

// Resolves which catalog tier is "current" from the real plan this instance was provisioned
// with (GET /api/tenant/plan), falling back to the previous hardcoded Standard default when
// unprovisioned or the Dashboard sent a plan name this catalog doesn't recognize — so this page
// still renders sensibly before a real Tenant Dashboard exists.
function resolvePlans(tenantPlan: TenantPlanInfo | null): Plan[] {
  const provisionedName = tenantPlan?.plan.provisioned ? tenantPlan.plan.planName : null;
  const matchedIndex = provisionedName
    ? TIER_ORDER.findIndex((t) => t.toLowerCase() === provisionedName.toLowerCase())
    : -1;
  const currentIndex = matchedIndex !== -1 ? matchedIndex : TIER_ORDER.indexOf("Standard");

  return PLAN_CATALOG.map((p, i) => {
    const status: Plan["status"] =
      i === currentIndex ? "current" : i < currentIndex ? "active" : p.name === "Enterprise" ? "contact" : "upgrade";

    // Real enforced limits only replace the actual current tier's numbers — the other three
    // rows are a static reference catalog (there's no multi-plan catalog endpoint from the
    // Dashboard yet), not per-tier data pulled from the backend.
    const limits = i === currentIndex && tenantPlan?.plan.provisioned
      ? {
          branches: tenantPlan.plan.limits.maxBranches ?? undefined,
          // Enforced per-branch server-side; shown here as one flat number against a flat
          // tenant-wide usage count, same approximation this card has always made.
          terminals: tenantPlan.plan.limits.maxTerminalsPerBranch ?? undefined,
          users: tenantPlan.plan.limits.maxUsersPerBranch ?? undefined,
        }
      : p.limits;

    return { ...p, status, limits };
  });
}

type Usage = { branches: number; terminals: number; users: number };

function exceededLimits(usage: Usage, plan: Plan): { label: string; used: number; limit: number }[] {
  const rows: { label: string; used: number; limit: number }[] = [];
  if (plan.limits.branches !== undefined && usage.branches > plan.limits.branches)
    rows.push({ label: "Branches", used: usage.branches, limit: plan.limits.branches });
  if (plan.limits.terminals !== undefined && usage.terminals > plan.limits.terminals)
    rows.push({ label: "Terminals", used: usage.terminals, limit: plan.limits.terminals });
  if (plan.limits.users !== undefined && usage.users > plan.limits.users)
    rows.push({ label: "Users", used: usage.users, limit: plan.limits.users });
  return rows;
}

const BILLING_CYCLE = ["Monthly", "Quarterly (−5%)", "Annual (−15%)"] as const;
type Cycle = typeof BILLING_CYCLE[number];

function handlePlanAction(plan: Plan, cycle: Cycle) {
  if (plan.status === "current") {
    toast.info(`You are already on the ${plan.name} plan`, { description: "Manage your subscription below or contact support to make changes." });
    return;
  }
  if (plan.status === "active") {
    toast.info(`${plan.name} plan details`, { description: "This is a lower-tier plan. Downgrading will reduce branch, terminal, and user limits." });
    return;
  }
  if (plan.status === "contact") {
    toast.info("Contact sales", { description: "Please contact support or your account manager to discuss your Enterprise needs." });
    return;
  }
  // upgrade
  const discount = cycle === "Annual (−15%)" ? 0.85 : cycle === "Quarterly (−5%)" ? 0.95 : 1;
  const effective = Math.round(plan.price * discount);
  toast.info(`Upgrade to ${plan.name}`, {
    description: `${cycle} billing · SAR ${effective}/mo. Please contact support or your account manager to complete this upgrade.`,
  });
}

// Side-by-side feature comparison between the tenant's current plan and whichever card's
// "View Details" / "Compare features" button was clicked — a real diff instead of the old
// toast that just dumped the target plan's feature array into a description string.
function PlanDetailsDialog({ plan, currentPlan, usage, onClose }: {
  plan: Plan | null;
  currentPlan: Plan;
  usage: Usage | null;
  onClose: () => void;
}) {
  if (!plan) return null;
  const allFeatures = [...new Set([...currentPlan.f, ...plan.f])];
  const limitRows: { label: string; current?: number; target?: number; used?: number }[] = [
    { label: "Branches", current: currentPlan.limits.branches, target: plan.limits.branches, used: usage?.branches },
    { label: "Terminals", current: currentPlan.limits.terminals, target: plan.limits.terminals, used: usage?.terminals },
    { label: "Users", current: currentPlan.limits.users, target: plan.limits.users, used: usage?.users },
  ];

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <plan.icon className="h-4 w-4 text-primary" /> {plan.name} vs {currentPlan.name} (your plan)
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Limits</p>
            <div className="rounded-lg border border-border/60 divide-y divide-border/60">
              {limitRows.map(r => (
                <div key={r.label} className="grid grid-cols-3 gap-2 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="text-center">{r.current ?? "∞"} {r.used != null && <span className="text-xs text-muted-foreground">({r.used} used)</span>}</span>
                  <span className={cn("text-center font-medium", (r.target ?? Infinity) > (r.current ?? Infinity) && "text-success")}>{r.target ?? "∞"}</span>
                </div>
              ))}
              <div className="grid grid-cols-3 gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                <span></span><span className="text-center">Your plan</span><span className="text-center">{plan.name}</span>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Features</p>
            <ul className="space-y-1.5">
              {allFeatures.map(f => {
                const inCurrent = currentPlan.f.includes(f);
                const inTarget = plan.f.includes(f);
                return (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    {inTarget
                      ? <Check className="h-3.5 w-3.5 text-success shrink-0" />
                      : <Minus className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />}
                    <span className={cn(!inTarget && "text-muted-foreground/60 line-through")}>{f}</span>
                    {inTarget && !inCurrent && <Badge variant="secondary" className="text-[10px] py-0">New</Badge>}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          {plan.status === "upgrade" && (
            <Button className="gradient-primary text-primary-foreground border-0" onClick={() => { handlePlanAction(plan, "Monthly"); onClose(); }}>
              Upgrade to {plan.name}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Plans() {
  const [cycle, setCycle] = useState<Cycle>("Monthly");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [tenantPlan, setTenantPlan] = useState<TenantPlanInfo | null>(null);
  const [detailsPlan, setDetailsPlan] = useState<Plan | null>(null);
  const [launching, setLaunching] = useState(false);
  const notified = useRef(false);

  // Opens the Tenant Admin Dashboard already signed in as this same admin (the identity
  // onboarding created for both systems) — see api/Controllers/TenantController.cs's
  // DashboardLaunch. The blank tab is opened synchronously inside the click gesture and only
  // navigated once the URL comes back, otherwise the popup blocker eats the async window.open.
  async function handleManageSubscription() {
    if (launching) return;
    setLaunching(true);
    const tab = window.open("", "_blank", "noopener,noreferrer");
    try {
      const { redirectUrl } = await api.getDashboardLaunchUrl();
      if (tab && !tab.closed) tab.location.replace(redirectUrl);
      else window.location.href = redirectUrl; // popup blocked — fall back to same-tab
    } catch (e) {
      tab?.close();
      toast.error("Couldn't open subscription management", {
        description: e instanceof Error ? e.message : "Please try again or contact support.",
      });
    } finally {
      setLaunching(false);
    }
  }

  useEffect(() => {
    Promise.all([api.getBranches(), api.getTerminals(), api.getUsers()])
      .then(([branches, terminals, users]) => setUsage({ branches: branches.length, terminals: terminals.length, users: users.length }))
      .catch(() => setUsage(null));
    api.getTenantPlan().then(setTenantPlan).catch(() => setTenantPlan(null));
  }, []);

  const plans = useMemo(() => resolvePlans(tenantPlan), [tenantPlan]);
  const CURRENT_PLAN = plans.find((p) => p.status === "current")!;

  // Both fetches must have settled: while tenantPlan is still null, resolvePlans falls back to
  // the Standard catalog card, and usage arriving first fired a bogus "exceeds the Standard
  // plan" toast for tenants actually provisioned on a higher tier (the notified guard then
  // suppressed the corrected one forever).
  const overage = usage && tenantPlan ? exceededLimits(usage, CURRENT_PLAN) : [];
  const nextTier = plans.find((p) => p.status === "upgrade");

  useEffect(() => {
    if (overage.length && !notified.current) {
      notified.current = true;
      toast.warning(`Usage exceeds the ${CURRENT_PLAN.name} plan`, {
        description: overage.map((o) => `${o.label}: ${o.used}/${o.limit}`).join(" · ") + (nextTier ? ` — upgrade to ${nextTier.name} to stay within limits.` : ""),
      });
    }
  }, [overage, nextTier, CURRENT_PLAN.name]);

  const renewsAt = tenantPlan?.plan.provisioned && tenantPlan.plan.billing.renewsAt
    ? new Date(tenantPlan.plan.billing.renewsAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
    : null;

  return (
    <PageShell title="Plans & Pricing" subtitle="Choose the Baqalah POS tier that fits your business">
      {overage.length > 0 && (
        <Card className="p-4 border-warning/40 bg-warning/10 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-sm">You've outgrown the {CURRENT_PLAN.name} plan</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {overage.map((o) => `${o.label}: ${o.used} in use, plan limit is ${o.limit}`).join(" · ")}
            </p>
          </div>
          {nextTier && (
            <Button size="sm" className="gradient-primary text-primary-foreground border-0 shrink-0" onClick={() => handlePlanAction(nextTier, cycle)}>
              Upgrade to {nextTier.name}
            </Button>
          )}
        </Card>
      )}

      {/* Billing cycle toggle */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-xl border border-border/60 bg-muted/40 p-1 gap-1">
          {BILLING_CYCLE.map(c => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-medium transition-colors",
                cycle === c ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >{c}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const discount = cycle === "Annual (−15%)" ? 0.85 : cycle === "Quarterly (−5%)" ? 0.95 : 1;
          const effectivePrice = p.price > 0 ? Math.round(p.price * discount) : 0;

          return (
            <Card
              key={p.name}
              className={cn(
                "p-6 border-border/60 shadow-card relative flex flex-col",
                p.featured && "border-primary/40 shadow-elegant gradient-primary text-primary-foreground",
                p.status === "current" && !p.featured && "ring-2 ring-primary/30",
              )}
            >
              {p.featured && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-primary border-0 shadow">
                  <Crown className="h-3 w-3 mr-1" /> Most Popular
                </Badge>
              )}
              {p.status === "current" && (
                <Badge className="absolute -top-3 right-4 bg-success text-success-foreground border-0 shadow text-[10px]">
                  Your Plan
                </Badge>
              )}

              <div className="flex items-center gap-2">
                <p.icon className={cn("h-4 w-4", p.featured ? "text-white/80" : "text-primary")} />
                <p className={cn("text-xs uppercase tracking-wider font-semibold", p.featured ? "opacity-80" : "text-muted-foreground")}>{p.name}</p>
              </div>
              <p className={cn("text-sm mt-1", p.featured ? "opacity-90" : "text-muted-foreground")}>{p.tag}</p>

              <div className="mt-4">
                {effectivePrice > 0 ? (
                  <div>
                    <p className="text-4xl font-bold tracking-tight">
                      <SARIcon />{effectivePrice}
                      <span className={cn("text-sm font-normal", p.featured ? "opacity-80" : "text-muted-foreground")}>/mo</span>
                    </p>
                    {cycle !== "Monthly" && (
                      <p className={cn("text-xs mt-0.5 line-through", p.featured ? "opacity-60" : "text-muted-foreground/60")}>
                        <SARIcon />{p.price}/mo
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-3xl font-bold tracking-tight">Custom</p>
                )}
              </div>

              <ul className="space-y-2 mt-6 flex-1">
                {p.f.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className={cn("h-4 w-4 mt-0.5 shrink-0", p.featured ? "text-white" : "text-success")} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <div className="space-y-2 mt-6">
                <Button
                  className={cn(
                    "w-full",
                    p.featured ? "bg-white text-primary hover:bg-white/90" :
                    p.status === "current" ? "bg-success/20 text-success border border-success/30 hover:bg-success/30" :
                    "gradient-primary text-primary-foreground border-0"
                  )}
                  onClick={() => p.status === "active" ? setDetailsPlan(p) : handlePlanAction(p, cycle)}
                >
                  {p.status === "current" ? "Current Plan" : p.status === "contact" ? "Contact Sales" : p.status === "active" ? "View Details" : "Upgrade Now"}
                </Button>
                {/* "View Details" (status "active") already opens this same comparison dialog —
                    a second "Compare features" button doing the identical thing was redundant.
                    Kept only for Upgrade/Contact Sales cards, where it's a genuinely distinct
                    action from the primary button (which starts the real upgrade/contact flow). */}
                {(p.status === "upgrade" || p.status === "contact") && (
                  <Button
                    variant={p.featured ? "secondary" : "outline"}
                    className="w-full"
                    size="sm"
                    onClick={() => setDetailsPlan(p)}
                  >
                    Compare features
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Current plan summary */}
      <Card className="p-5 border-border/60 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-semibold">{CURRENT_PLAN.name} Plan — {tenantPlan?.plan.provisioned ? (tenantPlan.plan.billing.status ?? "Active") : "Active"}</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              {renewsAt ? `Next billing date: ${renewsAt} · ` : ""}SAR {CURRENT_PLAN.price}/month · Monthly
            </p>
            {usage && (
              <p className={cn("text-sm mt-1", overage.length > 0 ? "text-warning font-medium" : "text-muted-foreground")}>
                Usage: {usage.branches}/{CURRENT_PLAN.limits.branches ?? "∞"} branches · {usage.terminals}/{CURRENT_PLAN.limits.terminals ?? "∞"} terminals · {usage.users}/{CURRENT_PLAN.limits.users ?? "∞"} users
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="gradient-primary text-primary-foreground border-0"
              disabled={launching}
              onClick={handleManageSubscription}
            >
              <ExternalLink className="h-4 w-4 mr-1.5" />
              {launching ? "Opening…" : "Manage Subscription"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.info("Billing history", { description: "Please contact support or your account manager for your invoice history." })}>View invoices</Button>
            <Button variant="outline" size="sm" onClick={() => toast.info("Cancel subscription", { description: "Please contact support to cancel your subscription." })}>Cancel plan</Button>
          </div>
        </div>
      </Card>

      <PlanDetailsDialog plan={detailsPlan} currentPlan={CURRENT_PLAN} usage={usage} onClose={() => setDetailsPlan(null)} />
    </PageShell>
  );
}
