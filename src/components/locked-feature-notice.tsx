import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

interface LockedFeatureNoticeProps {
  feature: string;
  className?: string;
}

// Inline placeholder for a section/tab INSIDE an otherwise always-available page whose content
// depends on a plan feature the tenant doesn't have (e.g. an Employee profile's "Shifts" tab, or
// Terminals' kiosk-pairing panel) — the surrounding page stays open, only this piece is replaced.
// Distinct from UpgradeModal (a dialog triggered by clicking a locked nav item/tile) — this
// renders directly in place of content that would otherwise silently 403 on load or submit.
export function LockedFeatureNotice({ feature, className }: LockedFeatureNoticeProps) {
  const { planInfo } = useAuth();
  const planName = planInfo?.provisioned ? planInfo.planName : null;

  return (
    <div className={`flex flex-col items-center justify-center gap-2 py-10 px-6 text-center rounded-lg border border-dashed border-border/60 bg-muted/20 ${className ?? ""}`}>
      <Lock className="h-6 w-6 text-warning" />
      <p className="text-sm font-medium">{feature} isn't included in your{planName ? ` ${planName}` : " current"} plan</p>
      <Button asChild size="sm" variant="outline" className="mt-1">
        <Link to="/plans">View Plans</Link>
      </Button>
    </div>
  );
}
