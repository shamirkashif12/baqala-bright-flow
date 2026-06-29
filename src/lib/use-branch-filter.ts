import { useAuth } from "@/lib/auth";

/**
 * Returns the branch ID that must be used to filter data API calls.
 *  - tenant_admin → undefined (back-end returns all-branch data)
 *  - every other role → their assigned branchId from the JWT
 *
 * Usage:
 *   const branchFilter = useBranchFilter();
 *   api.getOrders({ branchId: branchFilter, ... })
 */
export function useBranchFilter(): string | undefined {
  const { user } = useAuth();
  if (!user || user.role === "tenant_admin") return undefined;
  return user.branchId ?? undefined;
}
