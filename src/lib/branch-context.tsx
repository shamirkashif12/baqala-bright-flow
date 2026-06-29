import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Branch } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const STORAGE_KEY = "baqala_selected_branch_id";

interface BranchContextValue {
  branches: Branch[];
  selectedBranch: Branch | null;
  setSelectedBranch: (branch: Branch) => void;
  loading: boolean;
  /** True only for tenant_admin and branch_manager; others are locked to their branch. */
  canSwitchBranch: boolean;
}

const BranchContext = createContext<BranchContextValue | null>(null);

export function BranchProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranchState] = useState<Branch | null>(null);
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

        // Determine initial selection ────────────────────────────────────────
        let initial: Branch | null = null;

        // Non-admin users are locked to their assigned branch
        if (user?.branchId && user.role !== "tenant_admin") {
          initial = scopedList.find((b) => b.id === user.branchId) ?? null;
        }

        // Admins fall back to saved preference → first active → first in list
        if (!initial) {
          const savedId = localStorage.getItem(STORAGE_KEY);
          const saved = savedId ? scopedList.find((b) => b.id === savedId) : null;
          initial =
            saved ??
            scopedList.find((b) => b.status === "active") ??
            scopedList[0] ??
            null;
        }

        setSelectedBranchState(initial);
        if (initial) localStorage.setItem(STORAGE_KEY, initial.id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // Re-scope whenever the signed-in user changes (login / logout)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const setSelectedBranch = (branch: Branch) => {
    // Prevent non-admin/non-manager users from switching branches
    if (!canSwitchBranch) return;
    setSelectedBranchState(branch);
    localStorage.setItem(STORAGE_KEY, branch.id);
  };

  return (
    <BranchContext.Provider
      value={{ branches, selectedBranch, setSelectedBranch, loading, canSwitchBranch }}
    >
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch(): BranchContextValue {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch must be used inside BranchProvider");
  return ctx;
}
