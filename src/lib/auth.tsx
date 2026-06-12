import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";

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
  signup: (params: { email: string; password: string; name?: string }) => Promise<{ needsVerification: boolean }>;
  logout: () => void;
  loading: boolean;
}

function mapUser(u: SupabaseUser | null | undefined): AuthUser | null {
  if (!u) return null;
  const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
  const name = (meta.name as string) || (meta.full_name as string) || (u.email?.split("@")[0] ?? "User");
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return {
    id: u.id,
    name,
    email: u.email ?? "",
    role: ((meta.role as AuthUser["role"]) ?? "owner"),
    branch: (meta.branch as string) ?? "Riyadh — Olaya Branch",
    initials: initials || "U",
  };
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      if (!active) return;
      setAuthUser(mapUser(session?.user));
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setAuthUser(mapUser(data.session?.user));
      setLoading(false);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      if (error.message.toLowerCase().includes("email not confirmed")) {
        throw new Error("Please verify your email first. Check your inbox for the confirmation link.");
      }
      throw new Error(error.message);
    }
  }, []);

  const signup = useCallback(async ({ email, password, name }: { email: string; password: string; name?: string }) => {
    const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/login` : undefined;
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: redirectTo,
        data: name ? { name } : undefined,
      },
    });
    if (error) throw new Error(error.message);
    return { needsVerification: !data.session };
  }, []);

  const logout = useCallback(() => {
    void supabase.auth.signOut();
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!user, user, login, signup, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
