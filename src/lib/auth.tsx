import { createContext, useContext, useState, useCallback, useEffect, useSyncExternalStore, type ReactNode } from "react";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: "owner" | "manager" | "cashier";
  branch: string;
  initials: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  subscribe: (cb: () => void) => () => boolean;
  getSnapshot: () => AuthUser | null;
}

const AUTH_KEY = "baqala_auth_session";

let currentUser: AuthUser | null = null;
let listeners: Set<() => void> = new Set();

function emit() {
  listeners.forEach((fn) => fn());
}

function readStorage(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function writeStorage(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  if (user) localStorage.setItem(AUTH_KEY, JSON.stringify(user));
  else localStorage.removeItem(AUTH_KEY);
}

function setUser(user: AuthUser | null) {
  currentUser = user;
  writeStorage(user);
  emit();
}

// Initialize from storage on module load (client only)
currentUser = readStorage();

export const authStore: AuthState = {
  get isAuthenticated() { return !!currentUser; },
  get user() { return currentUser; },
  subscribe: (cb: () => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  getSnapshot: () => currentUser,
  async login(email: string, password: string) {
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
  },
  logout() {
    setUser(null);
  },
};

// Sync across tabs
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === AUTH_KEY) {
      currentUser = e.newValue ? JSON.parse(e.newValue) : null;
      emit();
    }
  });
}

/* ── React layer ── */
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const user = useSyncExternalStore(
    authStore.subscribe,
    authStore.getSnapshot,
    () => null
  );

  const login = useCallback(async (email: string, password: string) => {
    await authStore.login(email, password);
  }, []);

  const logout = useCallback(() => {
    authStore.logout();
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
