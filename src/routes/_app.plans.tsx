import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SARIcon } from "@/lib/currency";

export const Route = createFileRoute("/_app/plans")({ component: Plans });

const plans = [
  {
    name: "Basic", price: 149, tag: "For a single baqala", featured: false, status: "Active",
    f: ["1 Branch", "2 Terminals", "5 Users", "Inventory up to 500 SKUs", "Mobile POS: Limited", "Email support"],
  },
  {
    name: "Standard", price: 349, tag: "Growing mart operators", featured: true, status: "Current Plan",
    f: ["3 Branches", "8 Terminals", "20 Users", "Inventory up to 5,000 SKUs", "Warehouse module", "Mobile POS", "Basic BI reporting", "Priority email support"],
  },
  {
    name: "Premium", price: 749, tag: "Multi-branch operations", featured: false, status: "Upgrade",
    f: ["10 Branches", "30 Terminals", "100 Users", "Unlimited SKUs", "Self-checkout kiosk", "Device behavior management", "Advanced BI & KPI", "24/7 phone support"],
  },
  {
    name: "Enterprise", price: 0, tag: "Tailored for chains", featured: false, status: "Contact Sales",
    f: ["Unlimited Branches", "Unlimited Terminals", "Unlimited Users", "Dedicated warehouse hubs", "Mart-to-mart network", "Custom integrations", "Dedicated account manager", "On-site training"],
  },
];

function Plans() {
  return (
    <PageShell title="Plans & Pricing" subtitle="Choose the MI Money tier that fits your business">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => (
          <Card
            key={p.name}
            className={cn(
              "p-6 border-border/60 shadow-card relative flex flex-col",
              p.featured && "border-primary/40 shadow-elegant gradient-primary text-primary-foreground",
            )}
          >
            {p.featured && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-primary border-0 shadow">
                <Crown className="h-3 w-3 mr-1" /> Most Popular
              </Badge>
            )}
            <p className={cn("text-xs uppercase tracking-wider font-semibold", p.featured ? "opacity-80" : "text-muted-foreground")}>{p.name}</p>
            <p className={cn("text-sm mt-1", p.featured ? "opacity-90" : "text-muted-foreground")}>{p.tag}</p>
            <div className="mt-4">
              {p.price > 0 ? (
                <p className="text-4xl font-bold tracking-tight"><SARIcon />{p.price}<span className={cn("text-sm font-normal", p.featured ? "opacity-80" : "text-muted-foreground")}>/mo</span></p>
              ) : (
                <p className="text-3xl font-bold tracking-tight">Custom</p>
              )}
            </div>
            <ul className="space-y-2 mt-6 flex-1">
              {p.f.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm">
                  <Check className={cn("h-4 w-4 mt-0.5 shrink-0", p.featured ? "text-white" : "text-primary")} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="space-y-2 mt-6">
              <Button
                className={cn("w-full", p.featured ? "bg-white text-primary hover:bg-white/90" : "gradient-primary text-primary-foreground border-0")}
              >
                {p.status}
              </Button>
              <div className="flex gap-2">
                <Button variant={p.featured ? "secondary" : "outline"} className="flex-1" size="sm">View</Button>
                <Button variant={p.featured ? "secondary" : "outline"} className="flex-1" size="sm">Edit</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}