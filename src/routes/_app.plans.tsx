import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Zap, Building2, Store, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { SARIcon } from "@/lib/currency";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/plans")({ component: Plans });

type Plan = {
  name: string; price: number; tag: string; featured: boolean;
  status: "active" | "current" | "upgrade" | "contact";
  icon: React.FC<{ className?: string }>;
  f: string[];
};

const plans: Plan[] = [
  {
    name: "Basic", price: 149, tag: "For a single baqala", featured: false, status: "active",
    icon: Store,
    f: ["1 Branch", "2 Terminals", "5 Users", "Inventory up to 500 SKUs", "Mobile POS: Limited", "Email support"],
  },
  {
    name: "Standard", price: 349, tag: "Growing mart operators", featured: true, status: "current",
    icon: Zap,
    f: ["3 Branches", "8 Terminals", "20 Users", "Inventory up to 5,000 SKUs", "Warehouse module", "Mobile POS", "Basic BI reporting", "Priority email support"],
  },
  {
    name: "Premium", price: 749, tag: "Multi-branch operations", featured: false, status: "upgrade",
    icon: Building2,
    f: ["10 Branches", "30 Terminals", "100 Users", "Unlimited SKUs", "Self-checkout kiosk", "Device behavior management", "Advanced BI & KPI", "24/7 phone support"],
  },
  {
    name: "Enterprise", price: 0, tag: "Tailored for chains", featured: false, status: "contact",
    icon: Globe,
    f: ["Unlimited Branches", "Unlimited Terminals", "Unlimited Users", "Dedicated warehouse hubs", "Mart-to-mart network", "Custom integrations", "Dedicated account manager", "On-site training"],
  },
];

const BILLING_CYCLE = ["Monthly", "Quarterly (−5%)", "Annual (−15%)"] as const;
type Cycle = typeof BILLING_CYCLE[number];

function handlePlanAction(plan: Plan, cycle: Cycle) {
  if (plan.status === "current") {
    toast.info("You are already on the Standard plan", { description: "Manage your subscription below or contact support to make changes." });
    return;
  }
  if (plan.status === "active") {
    toast.info("Basic plan details", { description: "This is a lower-tier plan. Downgrading will reduce branch, terminal, and user limits." });
    return;
  }
  if (plan.status === "contact") {
    toast.success("Request sent to sales team", { description: "Our team will contact you within 1 business day to discuss your Enterprise needs." });
    return;
  }
  // upgrade
  const discount = cycle === "Annual (−15%)" ? 0.85 : cycle === "Quarterly (−5%)" ? 0.95 : 1;
  const effective = Math.round(plan.price * discount);
  toast.success(`Upgrade to ${plan.name} initiated`, {
    description: `${cycle} billing · SAR ${effective}/mo. Redirecting to payment…`,
  });
}

function Plans() {
  const [cycle, setCycle] = useState<Cycle>("Monthly");

  return (
    <PageShell title="Plans & Pricing" subtitle="Choose the Baqalah POS tier that fits your business">
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
            <p className="font-semibold">Standard Plan — Active</p>
            <p className="text-sm text-muted-foreground mt-0.5">Next billing date: Jul 29, 2026 · SAR 349/month · Monthly</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => toast.info("Billing history", { description: "Opening invoice history…" })}>View invoices</Button>
            <Button variant="outline" size="sm" onClick={() => toast.info("Cancel subscription", { description: "Please contact support to cancel your subscription." })}>Cancel plan</Button>
          </div>
        </div>
      </Card>
    </PageShell>
  );
}

