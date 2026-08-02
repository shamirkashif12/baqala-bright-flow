import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Zap, Building2, Store, Globe, AlertTriangle } from "lucide-react";
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

function Plans() {
  const [cycle, setCycle] = useState<Cycle>("Monthly");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [tenantPlan, setTenantPlan] = useState<TenantPlanInfo | null>(null);
  const notified = useRef(false);

  useEffect(() => {
    Promise.all([api.getBranches(), api.getTerminals(), api.getUsers()])
      .then(([branches, terminals, users]) => setUsage({ branches: branches.length, terminals: terminals.length, users: users.length }))
      .catch(() => setUsage(null));
    api.getTenantPlan().then(setTenantPlan).catch(() => setTenantPlan(null));
  }, []);

  const plans = useMemo(() => resolvePlans(tenantPlan), [tenantPlan]);
  const CURRENT_PLAN = plans.find((p) => p.status === "current")!;

  const overage = usage ? exceededLimits(usage, CURRENT_PLAN) : [];
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
                  onClick={() => handlePlanAction(p, cycle)}
                >
                  {p.status === "current" ? "Current Plan" : p.status === "contact" ? "Contact Sales" : p.status === "active" ? "View Details" : "Upgrade Now"}
                </Button>
                {p.status !== "current" && (
                  <Button
                    variant={p.featured ? "secondary" : "outline"}
                    className="w-full"
                    size="sm"
                    onClick={() => toast.info(`${p.name} plan details`, { description: p.f.join(" · ") })}
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
            <Button variant="outline" size="sm" onClick={() => toast.info("Billing history", { description: "Please contact support or your account manager for your invoice history." })}>View invoices</Button>
            <Button variant="outline" size="sm" onClick={() => toast.info("Cancel subscription", { description: "Please contact support to cancel your subscription." })}>Cancel plan</Button>
          </div>
        </div>
      </Card>
    </PageShell>
  );
}
