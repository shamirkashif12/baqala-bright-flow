import { useAuth } from "@/lib/auth";

/**
 * Returns whether the given plan-tier feature key is enabled for this tenant's provisioned
 * plan (see api/Services/TenantPlanService.cs's canonical feature-key list). An independent
 * dimension from usePermission's DB-driven role/user matrix — a caller can have full module
 * permission and still see this return false if their plan tier doesn't include the feature.
 * Fails open (true) before the plan has loaded or when unprovisioned, mirroring the backend's
 * RequirePlanFeatureAttribute.
 */
export function usePlanFeature(key: string): boolean {
  const { isFeatureEnabled } = useAuth();
  return isFeatureEnabled(key);
}
