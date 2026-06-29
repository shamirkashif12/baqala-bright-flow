import { type ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { useAuth, type AppRole } from "@/lib/auth";
import { ShieldAlert } from "lucide-react";

interface ModuleGateProps {
  module: string;
  children: ReactNode;
  redirectTo?: string;
}

/**
 * Permission gate driven entirely by DB role permissions.
 * Use this instead of RoleGate for pages whose access is configurable
 * via the Roles & Permissions admin screen.
 */
export function ModuleGate({ module, children, redirectTo = "/login" }: ModuleGateProps) {
  const { loading, isAuthenticated, user, canViewModule } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Checking permissions…
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to={redirectTo} />;
  }

  if (!canViewModule(module)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="rounded-full bg-destructive/10 p-4 text-destructive">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold">You don't have access to this page</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Your role does not have permission to view {module}. Contact an administrator if you believe this is a mistake.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

interface RoleGateProps {
  allow: AppRole[];
  children: ReactNode;
  /** Where to send unauthenticated users. */
  redirectTo?: string;
}

/**
 * Client-side role guard for sensitive admin pages.
 * The authoritative role is fetched from the server-controlled `user_roles`
 * table via `current_user_role()` (see auth.tsx), so this gate cannot be
 * bypassed by mutating user_metadata.
 */
export function RoleGate({ allow, children, redirectTo = "/login" }: RoleGateProps) {
  const { loading, isAuthenticated, user } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Checking permissions…
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to={redirectTo} />;
  }

  if (!allow.includes(user.role)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="rounded-full bg-destructive/10 p-4 text-destructive">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold">You don't have access to this page</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          This area is restricted to {allow.join(" / ")} accounts. Contact an owner if you
          believe this is a mistake.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}