import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { clearPairing, getStoredPairing, getStoredToken, getZatcaSettings, pairKiosk, storePairing } from "./api";

interface SessionState {
  paired: boolean;
  branchId: string | null;
  branchName: string | null;
  terminalName: string | null;
  sellerName: string | null;
  vatNumber: string | null;
}

interface SessionContextValue extends SessionState {
  pair: (terminalCode: string, pairingSecret: string) => Promise<void>;
  unpair: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

const BRANCH_ID_KEY = "selfcheckout_branch_id";
const BRANCH_NAME_KEY = "selfcheckout_branch_name";
const TERMINAL_NAME_KEY = "selfcheckout_terminal_name";
const SELLER_NAME_KEY = "selfcheckout_seller_name";
const VAT_NUMBER_KEY = "selfcheckout_vat_number";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(() => ({
    paired: Boolean(getStoredToken() && getStoredPairing()),
    branchId: localStorage.getItem(BRANCH_ID_KEY),
    branchName: localStorage.getItem(BRANCH_NAME_KEY),
    terminalName: localStorage.getItem(TERMINAL_NAME_KEY),
    sellerName: localStorage.getItem(SELLER_NAME_KEY),
    vatNumber: localStorage.getItem(VAT_NUMBER_KEY),
  }));

  // Refresh seller/VAT details (used on the printed receipt) once per session —
  // staff can update these in ZATCA settings after the kiosk was first paired.
  useEffect(() => {
    if (!state.paired || !state.branchId) return;
    getZatcaSettings(state.branchId)
      .then((z) => {
        const sellerName = z.sellerName ?? state.branchName ?? "";
        const vatNumber = z.vatRegistrationNumber ?? "";
        localStorage.setItem(SELLER_NAME_KEY, sellerName);
        localStorage.setItem(VAT_NUMBER_KEY, vatNumber);
        setState((s) => ({ ...s, sellerName, vatNumber }));
      })
      .catch(() => {
        /* receipt falls back to branch name / blank VAT number */
      });
  }, [state.paired, state.branchId]);

  async function pair(terminalCode: string, pairingSecret: string) {
    const res = await pairKiosk(terminalCode, pairingSecret);
    storePairing(terminalCode, pairingSecret, res.token);
    localStorage.setItem(BRANCH_ID_KEY, res.branchId);
    localStorage.setItem(BRANCH_NAME_KEY, res.branchName ?? "");
    localStorage.setItem(TERMINAL_NAME_KEY, res.terminalName ?? "");
    setState({
      paired: true,
      branchId: res.branchId,
      branchName: res.branchName,
      terminalName: res.terminalName,
      sellerName: null,
      vatNumber: null,
    });
  }

  function unpair() {
    clearPairing();
    localStorage.removeItem(BRANCH_ID_KEY);
    localStorage.removeItem(BRANCH_NAME_KEY);
    localStorage.removeItem(TERMINAL_NAME_KEY);
    localStorage.removeItem(SELLER_NAME_KEY);
    localStorage.removeItem(VAT_NUMBER_KEY);
    setState({ paired: false, branchId: null, branchName: null, terminalName: null, sellerName: null, vatNumber: null });
  }

  return <SessionContext.Provider value={{ ...state, pair, unpair }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}
