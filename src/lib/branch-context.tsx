import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Branch } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface BranchContextValue {
  branches: Branch[];
  loading: boolean;
  /** True only for tenant_admin; every other role is locked to their assigned branch. */
  canSwitchBranch: boolean;
}

const BranchContext = createContext<BranchContextValue | null>(null);

export function BranchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  // Only tenant_admin may switch between branches; all other roles are locked to their assigned branch
  const canSwitchBranch = user?.role === "tenant_admin";

  useEffect(() => {
    setLoading(true);
    api
      .getBranches()
      .then((list) => {
        // Non-admin users with an assigned branch only see their own branch
        const scopedList =
          user?.branchId && !canSwitchBranch
            ? list.filter((b) => b.id === user.branchId)
            : list;

        setBranches(scopedList);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // Re-scope whenever the signed-in user changes (login / logout)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <BranchContext.Provider value={{ branches, loading, canSwitchBranch }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch(): BranchContextValue {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch must be used inside BranchProvider");
  return ctx;
}
