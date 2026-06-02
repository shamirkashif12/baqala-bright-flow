import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "owner" | "manager" | "cashier";
  branch: string;
  initials: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AUTH_KEY = "baqala_auth_session";

function getStoredSession(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function storeSession(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  if (user) localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  else localStorage.removeItem(AUTH_KEY);
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredSession());

  const login = useCallback(async (email: string, password: string) => {
    // Demo auth — in production this calls your backend
    await new Promise((r) => setTimeout(r, 800));
    if (!email.includes("@") && !email.match(/^\d{10}$/)) {
      throw new Error("Invalid email or phone number");
    }
    if (password.length < 4) {
      throw new Error("Password too short");
    }
    const demoUser: AuthUser = {
      id: "usr_001",
      name: "Abdullah Al Faisal",
      email: email.includes("@") ? email : "owner@baqala-faisal.sa",
      role: "owner",
      branch: "Riyadh — Olaya Branch",
      initials: "AF",
    };
    setUser(demoUser);
    storeSession(demoUser);
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    storeSession(null);
  }, []);

  // Sync across tabs
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === AUTH_KEY) {
        setUser(e.newValue ? JSON.parse(e.newValue) : null);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated: !!user, user, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
