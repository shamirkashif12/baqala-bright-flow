import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Branch } from "@/lib/api";

const STORAGE_KEY = "baqala_selected_branch_id";

interface BranchContextValue {
  branches: Branch[];
  selectedBranch: Branch | null;
  setSelectedBranch: (branch: Branch) => void;
  loading: boolean;
}

const BranchContext = createContext<BranchContextValue | null>(null);

export function BranchProvider({ children }: { children: ReactNode }) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranchState] = useState<Branch | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getBranches()
      .then((list) => {
        setBranches(list);
        const savedId = localStorage.getItem(STORAGE_KEY);
        const saved = savedId ? list.find((b) => b.id === savedId) : null;
        // Prefer saved branch → first active → first in list
        const initial =
          saved ??
          list.find((b) => b.status === "active") ??
          list[0] ??
          null;
        setSelectedBranchState(initial);
        if (initial) localStorage.setItem(STORAGE_KEY, initial.id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setSelectedBranch = (branch: Branch) => {
    setSelectedBranchState(branch);
    localStorage.setItem(STORAGE_KEY, branch.id);
  };

  return (
    <BranchContext.Provider value={{ branches, selectedBranch, setSelectedBranch, loading }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch(): BranchContextValue {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error("useBranch must be used inside BranchProvider");
  return ctx;
}
