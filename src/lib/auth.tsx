import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from "react";

export type AppRole =
  | "tenant_admin"
  | "branch_manager"
  | "cashier"
  | "storekeeper"
  | "supervisor"
  | "finance_user"
  | "marketing_user"
  | "picker";

export const ROLE_LABELS: Record<AppRole, string> = {
  tenant_admin:   "Tenant Admin",
  branch_manager: "Branch Manager",
  cashier:        "Cashier",
  storekeeper:    "Storekeeper",
  supervisor:     "Supervisor",
  finance_user:   "Finance User",
  marketing_user: "Marketing User",
  picker:         "Picker",
};

export interface RolePermFlags {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canExport: boolean;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  roleId: string;
  branch: string;
  initials: string;
  permissions: Record<string, RolePermFlags>;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  hasRole: (role: AppRole | AppRole[]) => boolean;
  canViewModule: (module: string) => boolean;
}

// ── Storage keys ──────────────────────────────────────────────────────────────
const TOKEN_KEY          = "baqala_token";
const SESSION_EXPIRY_KEY = "baqala_session_expires";
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:5000";

// ── Session helpers ───────────────────────────────────────────────────────────
function stampSession() {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSION_EXPIRY_KEY, String(Date.now() + SESSION_DURATION_MS));
}

function clearSession() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SESSION_EXPIRY_KEY);
}

function isSessionExpired(): boolean {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(SESSION_EXPIRY_KEY);
  if (!raw) return false;
  return Date.now() > parseInt(raw, 10);
}

// ── JWT helpers ───────────────────────────────────────────────────────────────
interface JwtClaims {
  sub: string;
  email: string;
  name: string;
  role: string;
  roleId?: string;
  branchId?: string;
  branchName?: string;
}

function parseJwt(token: string): JwtClaims | null {
  try {
    const payload = token.split(".")[1];
    const padded  = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json    = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}

function buildUser(claims: JwtClaims): AuthUser {
  const name     = claims.name || claims.email.split("@")[0];
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "U";
  return {
    id:          claims.sub,
    name,
    email:       claims.email,
    role:        claims.role as AppRole,
    roleId:      claims.roleId ?? "",
    branch:      claims.branchName || "Riyadh — Olaya Branch",
    initials,
    permissions: {},
  };
}

// Fetches role permissions then overlays any user-specific overrides from localStorage.
// localStorage key: baqala_user_perms_{userId} → Record<module, RolePermFlags>
async function fetchPermissions(roleId: string, userId?: string): Promise<Record<string, RolePermFlags>> {
  if (!roleId) return {};
  try {
    const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    const res = await fetch(`${API_BASE}/api/roles/${roleId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return {};
    const role = await res.json() as {
      permissions?: Array<{ module: string } & RolePermFlags>;
    };
    const map: Record<string, RolePermFlags> = {};
    const empty: RolePermFlags = { canView: false, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false };
    for (const p of role.permissions ?? []) {
      map[p.module] = { canView: p.canView ?? false, canCreate: p.canCreate ?? false, canEdit: p.canEdit ?? false, canDelete: p.canDelete ?? false, canApprove: p.canApprove ?? false, canExport: p.canExport ?? false };
    }
    // Overlay user-specific permission overrides stored in localStorage
    if (userId && typeof window !== "undefined") {
      const raw = localStorage.getItem(`baqala_user_perms_${userId}`);
      if (raw) {
        const overrides = JSON.parse(raw) as Record<string, Partial<RolePermFlags>>;
        for (const [mod, flags] of Object.entries(overrides)) {
          map[mod] = { ...(map[mod] ?? empty), ...flags };
        }
      }
    }
    return map;
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Hydrate from localStorage on mount, then fetch live permissions
  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (token && !isSessionExpired()) {
        const claims = parseJwt(token);
        if (claims) {
          const baseUser = buildUser(claims);
          if (!cancelled) setAuthUser(baseUser);
          const perms = await fetchPermissions(baseUser.roleId, baseUser.id);
          if (!cancelled) setAuthUser(u => u ? { ...u, permissions: perms } : null);
        } else {
          clearSession();
        }
      } else if (token) {
        clearSession();
      }
      if (!cancelled) setLoading(false);
    };
    hydrate();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ email: email.trim(), password }),
    });

    if (!res.ok) {
      let message = "Invalid email or password.";
      try {
        const body = (await res.json()) as { message?: string };
        if (body.message) message = body.message;
      } catch { /* ignore */ }
      throw new Error(message);
    }

    const { token } = (await res.json()) as { token: string };
    localStorage.setItem(TOKEN_KEY, token);
    stampSession();

    const claims = parseJwt(token);
    if (claims) {
      const baseUser = buildUser(claims);
      const perms = await fetchPermissions(baseUser.roleId, baseUser.id);
      setAuthUser({ ...baseUser, permissions: perms });
    }
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setAuthUser(null);
  }, []);

  const hasRole = useCallback(
    (role: AppRole | AppRole[]) => {
      if (!user) return false;
      const allowed = Array.isArray(role) ? role : [role];
      return allowed.includes(user.role);
    },
    [user],
  );

  const canViewModule = useCallback(
    (module: string) => {
      if (!user) return false;
      if (user.role === "tenant_admin") return true;
      return user.permissions[module]?.canView === true;
    },
    [user],
  );

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!user, user, login, logout, loading, hasRole, canViewModule }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
