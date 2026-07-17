import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Inline banner for page-level data loads that failed fully or partially.
 * Pages must keep whatever data DID load on screen (never zero out on a sibling
 * call's failure) and surface the failure with an explicit retry, instead of
 * silently rendering empty tiles as if the load succeeded (BUG-011 / 86eyag3ny).
 */
export function LoadErrorBanner({
  onRetry,
  message = "Some data failed to load — the numbers below may be incomplete.",
}: {
  onRetry: () => void;
  message?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm mb-3">
      <span className="flex items-center gap-2 text-warning-foreground">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {message}
      </span>
      <Button size="sm" variant="outline" className="h-7 gap-1.5 shrink-0" onClick={onRetry}>
        <RefreshCw className="h-3 w-3" /> Retry
      </Button>
    </div>
  );
}
