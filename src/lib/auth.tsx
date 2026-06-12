import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";

export type AppRole = "owner" | "manager" | "cashier";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: AppRole;
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
  hasRole: (role: AppRole | AppRole[]) => boolean;
}

function mapUser(u: SupabaseUser | null | undefined, role: AppRole): AuthUser | null {
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
    // Role is sourced from the server-controlled `user_roles` table,
    // NOT from user_metadata (which any user can modify).
    role,
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

    async function resolveRole(): Promise<AppRole> {
      try {
        const { data, error } = await supabase.rpc("current_user_role");
        if (error || !data) return "cashier";
        return (data as AppRole) ?? "cashier";
      } catch {
        return "cashier";
      }
    }

    async function hydrate(session: Session | null) {
      if (!session?.user) {
        if (active) setAuthUser(null);
        return;
      }
      const role = await resolveRole();
      if (!active) return;
      setAuthUser(mapUser(session.user, role));
    }

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      void hydrate(session);
    });
    supabase.auth.getSession().then(async ({ data }) => {
      await hydrate(data.session);
      if (active) setLoading(false);
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

  const hasRole = useCallback(
    (role: AppRole | AppRole[]) => {
      if (!user) return false;
      const allowed = Array.isArray(role) ? role : [role];
      return allowed.includes(user.role);
    },
    [user],
  );

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!user, user, login, signup, logout, loading, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
