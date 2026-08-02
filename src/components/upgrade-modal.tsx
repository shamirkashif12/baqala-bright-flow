import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: string;
}

// Shown when a sidebar item or route is gated behind a plan feature the tenant's subscription
// doesn't currently include. No prior lock/upsell UI existed anywhere in the app to reuse — this
// is the one shared component both app-sidebar.tsx (locked nav items) and route-guard.tsx
// (direct-URL access) render for that state.
//
// Deliberately does NOT claim which tier unlocks the feature — the Tenant Admin Dashboard owns
// which features are bundled into which plan and can reconfigure that at any time (e.g. "Basic"
// might include Stocktaking for one tenant and not another). Hardcoding a "Standard"/"Premium"
// label here would go stale the moment a plan is edited; the only thing this app actually knows
// is the tenant's own current plan name, read live from planInfo.
export function UpgradeModal({ open, onOpenChange, feature }: UpgradeModalProps) {
  const { planInfo } = useAuth();
  const planName = planInfo?.provisioned ? planInfo.planName : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
            <Lock className="h-6 w-6 text-warning" />
          </div>
          <DialogTitle className="text-center">Upgrade Required</DialogTitle>
          <DialogDescription className="text-center">
            {feature} isn't included in your{planName ? ` ${planName}` : " current"} plan. Upgrade your subscription to unlock it.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-center gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Maybe later</Button>
          <Button asChild className="gradient-primary text-primary-foreground border-0">
            <Link to="/plans" onClick={() => onOpenChange(false)}>View Plans</Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
